"""
Build the "Virtual Pet" chibi puppy as a 3D model, straight from the
2D artwork in app/src/main/assets/images/touch-dog.svg.

Run headless:

    blender -b -P tools/pet3d/blender/build_pet.py

Output:
    app/src/main/assets/models/virtual_pet.glb   (glTF binary)

Why a script and not a hand-made .blend?
  The 2D source of truth is the SVG. Re-typing every curve into the
  viewport by hand would drift from it the moment the artwork changes.
  So every shape below is sampled from the *actual* path data of the
  SVG, converted to 3D, and rebuilt as Blender geometry. Change the SVG,
  re-run this script, and the 3D pet follows it.

Coordinate systems
  SVG     : x right, y down, viewBox 0 0 400 600
  Blender : x right, y up, z toward the viewer (the dog faces +Z)
  One blender unit = 1 / SCALE svg units.

Node naming is part of the contract with the app. app.js maps these
names back to the five touch zones:

    gz:dog     root, pivots on the ground between the paws
    gz:torso   body, legs, arms, collar          -> zone "giggle"
    gz:head    skull, ears, face                  -> zone "bark"
    gz:hz      the face itself                    -> zone "bark"
    gz:nose    nose                               -> zone "boop"
    gz:earL    left ear                           -> zone "flap"
    gz:earR    right ear                          -> zone "flap"
    gz:tail    tail                               -> zone "wag"

Pivots match the SVG transform-origins exactly, so an animation written
against the 2D artwork can be replayed on the 3D model unchanged.
"""

import math
import os

import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

# --------------------------------------------------------------------------
# output locations
# --------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(REPO, "app", "src", "main", "assets", "models")
OUT_GLB = os.path.join(OUT_DIR, "virtual_pet.glb")

# --------------------------------------------------------------------------
# scale + palette
# --------------------------------------------------------------------------

SCALE = 0.0045                      # svg units -> blender units
GROUND_Y = 562.0                    # svg y of the paws' underside
CX = 200.0                          # svg x of the dog's centre line
SKULL_Z = 0.93                      # skull depth vs. width
BODY_Z = 0.90                       # body depth vs. width
HEART_Z = 0.42                      # hearts float in front of the chest

# Colours lifted straight out of touch-dog.svg.
PALETTE = {
    "fur":        ("#e6ab73", 0.62),
    "furLight":   ("#f3c78f", 0.60),
    "furDark":    ("#d9995a", 0.64),
    "belly":      ("#f9e7c9", 0.70),
    "ear":        ("#8d5c2c", 0.66),
    "muzzle":     ("#fbebd2", 0.74),
    "patch":      ("#f7e3c4", 0.70),
    "nose":       ("#2b1b17", 0.42),
    "eyeWhite":   ("#fffdf8", 0.34),
    "pupil":      ("#2b1b17", 0.36),
    # The pupil is a flat, matte disc in the artwork. A glossy pupil picks
    # up a broad sheen on whichever side faces the light, so the two eyes
    # stop matching; the white sparkle is the only highlight it needs.
    "eyeBlack":   ("#241512", 0.94),
    "brow":       ("#3a2010", 0.72),
    "mouthInner": ("#5a1d22", 0.58),
    "tongue":     ("#ff7d93", 0.52),
    "collar":     ("#e0453a", 0.58),
    "collarDark": ("#4a2a14", 0.66),
    "tag":        ("#ffc83d", 0.38),
    "cheek":      ("#ff8fa3", 0.60),
    "heart":      ("#ff5a7a", 0.52),
}


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def to_blender_rgb(h):
    r, g, b = (srgb_to_linear(v) for v in hex_rgb(h))
    return (r, g, b, 1.0)


# --------------------------------------------------------------------------
# SVG path sampling
# --------------------------------------------------------------------------

def _bezier3(p0, p1, p2, p3, t):
    mt = 1.0 - t
    a, b, c, d = mt ** 3, 3 * mt * mt * t, 3 * mt * t * t, t ** 3
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def _bezier2(p0, p1, p2, t):
    mt = 1.0 - t
    a, b, c = mt * mt, 2 * mt * t, t * t
    return (a * p0[0] + b * p1[0] + c * p2[0],
            a * p0[1] + b * p1[1] + c * p2[1])


def _tokenize(d):
    """Yield ('cmd', ch) and ('num', value) tokens from an SVG path string."""
    i, n = 0, len(d)
    while i < n:
        ch = d[i]
        if ch in "MmCcQqLlHhVvZz":
            yield ("cmd", ch)
            i += 1
        elif ch in " ,\t\r\n":
            i += 1
        else:
            start = i
            while i < n and (d[i].isdigit() or d[i] in "+-.eE"):
                i += 1
            if i == start:
                i += 1
                continue
            yield ("num", float(d[start:i]))


def sample_subpaths(d, steps=18):
    """Sample an SVG path into a list of subpaths (one list of points each)."""
    tokens = list(_tokenize(d))
    subpaths = []
    pts = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    cmd = None
    i = 0

    def num():
        nonlocal i
        v = tokens[i][1]
        i += 1
        return v

    while i < len(tokens):
        kind, val = tokens[i]
        if kind == "cmd":
            cmd = val
            i += 1
            if cmd in "Zz":
                cur = start
                if len(pts) > 2:
                    subpaths.append(pts)
                pts = []
            continue

        rel = cmd.islower()
        c = cmd.upper()

        if c == "M":
            if len(pts) > 1:
                subpaths.append(pts)
            pts = []
            x, y = num(), num()
            if rel:
                x, y = cur[0] + x, cur[1] + y
            cur = (x, y)
            start = cur
            pts.append(cur)
            cmd = "l" if rel else "L"
        elif c == "L":
            x, y = num(), num()
            if rel:
                x, y = cur[0] + x, cur[1] + y
            cur = (x, y)
            pts.append(cur)
        elif c == "H":
            x = num()
            if rel:
                x = cur[0] + x
            cur = (x, cur[1])
            pts.append(cur)
        elif c == "V":
            y = num()
            if rel:
                y = cur[1] + y
            cur = (cur[0], y)
            pts.append(cur)
        elif c == "C":
            p1, p2, p3 = (num(), num()), (num(), num()), (num(), num())
            if rel:
                p1 = (cur[0] + p1[0], cur[1] + p1[1])
                p2 = (cur[0] + p2[0], cur[1] + p2[1])
                p3 = (cur[0] + p3[0], cur[1] + p3[1])
            for s in range(1, steps + 1):
                pts.append(_bezier3(cur, p1, p2, p3, s / steps))
            cur = p3
        elif c == "Q":
            p1, p2 = (num(), num()), (num(), num())
            if rel:
                p1 = (cur[0] + p1[0], cur[1] + p1[1])
                p2 = (cur[0] + p2[0], cur[1] + p2[1])
            for s in range(1, steps + 1):
                pts.append(_bezier2(cur, p1, p2, s / steps))
            cur = p2
        else:
            i += 1

    if len(pts) > 1:
        subpaths.append(pts)
    return subpaths


def sample_path(d, steps=18):
    """Sample an SVG path into one list of points (its first subpath)."""
    subs = sample_subpaths(d, steps)
    return subs[0] if subs else []


def svg_to_blender(x, y):
    """SVG (y down) -> Blender (y up), dog centred on the ground plane."""
    return ((x - CX) * SCALE, (GROUND_Y - y) * SCALE)


# --------------------------------------------------------------------------
# blender helpers
# --------------------------------------------------------------------------

def purge_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                 bpy.data.cameras, bpy.data.lights):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


EMISSION = {"cheek": 0.30}


def make_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    hexcol, rough = PALETTE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = to_blender_rgb(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.22
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = 0.22
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0
    # The blush is a flat tint with no shape of its own, so it has nothing
    # to catch the light on the shaded side of the face and turns muddy
    # mauve. A little self-illumination keeps it reading as pink from every
    # angle the pet turns through.
    emission = EMISSION.get(name)
    if emission:
        col = to_blender_rgb(hexcol)
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = col
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = to_blender_rgb(hexcol)
    return mat


def attach(obj, parent):
    """Parent while keeping the child's authored world-space transform."""
    if parent is not None:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def new_object(name, verts, faces, mat, smooth=False, parent=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(make_material(mat))
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    attach(obj, parent)
    return obj


def make_empty(name, pivot_svg, parent=None, z=0.0):
    """An empty used as a transform pivot, located at an SVG coordinate.

    `z` is in blender units, for pivots that sit on a curved surface.
    """
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.12
    bpy.context.collection.objects.link(e)
    px, py = svg_to_blender(*pivot_svg)
    e.location = (px, py, z)
    attach(e, parent)
    bpy.context.view_layer.update()
    return e


def _signed_area(pts):
    a = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return a * 0.5


def slab(name, pts_svg, depth_svg, mat, parent=None, bevel=0.0,
         bevel_segments=2, smooth=False, zfunc=None, local_x=None,
         local_y=None):
    """Build a closed 2D outline into a solid slab.

    pts_svg   outline points in SVG space
    depth_svg slab thickness, in SVG units
    zfunc     optional f(x, y) -> z of the slab's centre line, in BLENDER
              units. Used to lay a flat shape onto a curved surface (the
              brows on the skull, the nose on the muzzle).
    local_x   optional f(x, y) -> local x, for remapping the outline
    local_y   optional f(x, y) -> local y
    """
    pts = list(pts_svg)
    # A closed SVG path samples back onto its own start point. Keeping that
    # duplicate leaves a zero-length edge, which the Bevel modifier turns
    # into a spike shooting off across the model.
    if len(pts) > 2:
        ax, ay = pts[0]
        bx, by = pts[-1]
        if abs(ax - bx) < 1e-9 and abs(ay - by) < 1e-9:
            pts.pop()
    if local_x is None:
        local_x = lambda x, y: (x - CX) * SCALE
    if local_y is None:
        local_y = lambda x, y: (GROUND_Y - y) * SCALE

    poly = [Vector((local_x(p[0], p[1]), local_y(p[0], p[1]), 0.0)) for p in pts]

    # Keep the mapped outline counter-clockwise so the front face's normal
    # points forward. The SVG is y-down and Blender is y-up, so the same
    # shape winds the opposite way once mapped - and some of the shapes
    # here are mirrored on purpose.
    if _signed_area([(p.x, p.y) for p in poly]) < 0:
        pts.reverse()
        poly.reverse()

    tris = tessellate_polygon([poly])

    verts = []
    faces = []
    n = len(poly)
    half = depth_svg * SCALE * 0.5

    def add_v(p, zoff):
        verts.append((p.x, p.y, zoff))
        return len(verts) - 1

    front, back = [], []
    for p, src in zip(poly, pts):
        extra = zfunc(src[0], src[1]) if zfunc else 0.0
        front.append(add_v(p, extra + half))
        back.append(add_v(p, extra - half))

    for t in tris:
        faces.append((front[t[0]], front[t[1]], front[t[2]]))
        faces.append((back[t[2]], back[t[1]], back[t[0]]))

    for i in range(n):
        j = (i + 1) % n
        faces.append((front[i], back[i], back[j], front[j]))

    obj = new_object(name, verts, faces, mat, smooth=smooth, parent=parent)

    if bevel > 0.0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = bevel_segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
        # Without overlap clamping the miter at an acute corner (the point
        # of a heart, say) shoots a spike metres long across the model.
        # Sharp miters keep the facets clean; arc miters fan out into
        # visible crystals.
        mod.use_clamp_overlap = True
        mod.miter_outer = "MITER_SHARP"
        mod.miter_inner = "MITER_SHARP"
        mod.offset_type = "OFFSET"

    return obj


def stroke(name, pts_svg, width_svg, depth_svg, mat, parent=None,
           zfunc=None, bevel=0.003, bevel_segments=2):
    """An open polyline drawn as a flat ribbon of the given width."""
    pts = list(pts_svg)
    n = len(pts)
    if n < 2:
        return None
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[-2][0], y - pts[-2][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        hw = width_svg * 0.5
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    return slab(name, left + list(reversed(right)), depth_svg, mat,
                parent=parent, bevel=bevel, bevel_segments=bevel_segments,
                zfunc=zfunc)


def revolve(name, profile_r_y, mat, parent=None, segments=48, zscale=1.0,
            smooth=True):
    """Revolve a (radius, svg_y) profile around the vertical axis.

    The profile is the right-hand half of the shape; the silhouette it
    produces in front view is exactly the 2D artwork's outline.
    """
    verts = []
    faces = []
    rings = []

    for s in range(segments):
        a = 2.0 * math.pi * s / segments
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for (r, y) in profile_r_y:
            by = (GROUND_Y - y) * SCALE
            ring.append(len(verts))
            # Full ring around the vertical axis. The previous version kept
            # x at +r for every segment, producing a single curved sheet on
            # the right-hand side of the dog (a half model).
            verts.append((r * SCALE * ca, by, r * SCALE * sa * zscale))
        rings.append(ring)

    n = len(profile_r_y)
    for s in range(segments):
        a_ring = rings[s]
        b_ring = rings[(s + 1) % segments]
        for k in range(n - 1):
            ra, rb = profile_r_y[k][0], profile_r_y[k + 1][0]
            if ra < 1e-6 and rb < 1e-6:
                continue
            # wound so the normal points away from the axis
            if ra < 1e-6:
                faces.append((a_ring[k], b_ring[k], b_ring[k + 1]))
            elif rb < 1e-6:
                faces.append((a_ring[k], a_ring[k + 1], b_ring[k]))
            else:
                faces.append((a_ring[k], b_ring[k], b_ring[k + 1]))
                faces.append((a_ring[k], b_ring[k + 1], a_ring[k + 1]))

    if profile_r_y[0][0] > 1e-6:
        faces.append(tuple(rings[0]))
    if profile_r_y[-1][0] > 1e-6:
        faces.append(tuple(reversed(rings[-1])))
    if profile_r_y[0][0] > 1e-6:
        faces.append(tuple(reversed(rings[0])))
    if profile_r_y[-1][0] > 1e-6:
        faces.append(tuple(rings[-1]))

    return new_object(name, verts, faces, mat, smooth=smooth, parent=parent)


def ellipsoid(name, center_svg, rx, ry, rz, mat, parent=None, segments=28,
              rings=16, smooth=True, rot_x=0.0, z=0.0):
    """A UV sphere squashed into an ellipsoid, front facing +Z."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=1.0, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = (rx * SCALE, ry * SCALE, rz * SCALE)
    obj.rotation_euler = (rot_x, 0.0, 0.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    cx, cy = svg_to_blender(*center_svg)
    obj.location = (cx, cy, z)
    obj.data.materials.append(make_material(mat))
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    attach(obj, parent)
    return obj


def eye_patch(name, center_svg, rx_svg, ry_svg, surface_z, mat, parent=None,
              rings=6, segs=36, thickness=0.010, smooth=True):
    """A thin oval shell that rides on the skull surface.

    The artwork's eyes are flat ovals lying on the face. A solid ellipsoid
    either buries half of the sclera inside the dome of the skull or leaves
    the pupil looking like a ball glued to the front. A patch that follows
    the skull keeps the black pupil inside the white from every angle.
    """
    cx, cy = center_svg
    verts = []
    faces = []

    def add(sx, sy, dz):
        bx, by = svg_to_blender(sx, sy)
        verts.append((bx, by, surface_z(sx, sy) + dz))
        return len(verts) - 1

    front_center = add(cx, cy, 0.0)
    back_center = add(cx, cy, -thickness)
    front_rings = []
    back_rings = []
    for k in range(1, rings + 1):
        f = k / float(rings)
        fr = []
        br = []
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            sx = cx + rx_svg * f * math.cos(a)
            sy = cy + ry_svg * f * math.sin(a)
            fr.append(add(sx, sy, 0.0))
            br.append(add(sx, sy, -thickness))
        front_rings.append(fr)
        back_rings.append(br)

    for i in range(segs):
        i2 = (i + 1) % segs
        faces.append((front_center, front_rings[0][i], front_rings[0][i2]))
        faces.append((back_center, back_rings[0][i2], back_rings[0][i]))
    for k in range(len(front_rings) - 1):
        for i in range(segs):
            i2 = (i + 1) % segs
            faces.append((front_rings[k][i], front_rings[k + 1][i],
                          front_rings[k + 1][i2], front_rings[k][i2]))
            faces.append((back_rings[k][i2], back_rings[k + 1][i2],
                          back_rings[k + 1][i], back_rings[k][i]))
    for i in range(segs):
        i2 = (i + 1) % segs
        faces.append((front_rings[-1][i], back_rings[-1][i],
                      back_rings[-1][i2], front_rings[-1][i2]))

    return new_object(name, verts, faces, mat, smooth=smooth, parent=parent)


def smooth_chain(points, radii, steps=6):
    """Catmull-Rom a coarse polyline and its radii.

    tube_along builds straight sections between its points, so a five
    point arm shows a crease at every joint - most visibly at the elbow.
    Interpolating first turns the same silhouette into one continuous
    curve.
    """
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return pts, list(radii)
    out_pts = []
    out_radii = []
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[0] * 2.0 - pts[1]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[-1] * 2.0 - pts[-2]
        for k in range(steps):
            t = k / float(steps)
            t2 = t * t
            t3 = t2 * t
            out_pts.append(0.5 * (
                (p1 * 2.0)
                + (p2 - p0) * t
                + (p0 * 2.0 - p1 * 5.0 + p2 * 4.0 - p3) * t2
                + (p1 * 3.0 - p0 - p2 * 3.0 + p3) * t3
            ))
            f = t2 * (3.0 - 2.0 * t)
            out_radii.append(radii[i] + (radii[i + 1] - radii[i]) * f)
    out_pts.append(pts[-1])
    out_radii.append(radii[-1])
    return out_pts, out_radii


def tube_along(name, points3d, radii, mat, parent=None, segments=14,
               smooth=True, flatten=1.0):
    """Sweep a circle of varying radius along a 3D polyline.

    `flatten` squashes the cross-section along the binormal (the axis that
    ends up pointing out of the torso for a hanging limb), turning the tube
    into an oval that lies against the body instead of a sausage resting on
    it.
    """
    pts = [Vector(p) for p in points3d]
    verts = []
    faces = []

    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        up = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(up)) > 0.95:
            up = Vector((1.0, 0.0, 0.0))
        n1 = tangent.cross(up).normalized()
        n2 = tangent.cross(n1).normalized()
        r = radii[i]
        for k in range(segments):
            a = 2.0 * math.pi * k / segments
            v = (p + n1 * (math.cos(a) * r)
                 + n2 * (math.sin(a) * r * flatten))
            verts.append((v.x, v.y, v.z))

    for i in range(len(pts) - 1):
        for k in range(segments):
            a = i * segments + k
            b = i * segments + (k + 1) % segments
            c = (i + 1) * segments + (k + 1) % segments
            d = (i + 1) * segments + k
            faces.append((a, b, c, d))

    faces.append(tuple(range(segments - 1, -1, -1)))
    base = (len(pts) - 1) * segments
    faces.append(tuple(range(base, base + segments)))

    return new_object(name, verts, faces, mat, smooth=smooth, parent=parent)


def loft_ear(name, root, side, length, half_width, half_thick, mat,
             parent=None, segments=20, rings=22, bow=0.20, lean=0.08,
             forward=0.0, normal_hint=(0.78, 0.08, 0.62)):
    """A rounded, floppy ear lofted from a tapering elliptical section.

    The old ear was a flat slab stood on edge, so it read as a paddle from
    the front and as a dark hole from the side. This builds a closed 3D
    volume whose centreline bows away from the skull and whose broad face
    is angled forward, so the ear reads as a solid flap from every angle.

    `root` is world space. `side` is -1 for the left ear and +1 for the
    right. The mesh is authored in world space and then parented to the
    rig's ear pivot (attach keeps the world transform).
    """
    root = Vector(root)
    hint = Vector(normal_hint)
    hint.x *= side

    centers = []
    widths = []
    thicks = []
    for i in range(rings + 1):
        t = i / float(rings)
        # Widest a third of the way down, tapering to a soft tip. The
        # root stays broad and is buried in the skull.
        wprof = math.sin(math.pi * (0.25 + 0.75 * t))
        tprof = math.sin(math.pi * (0.12 + 0.88 * t))
        if i == rings:
            wprof = 0.0
            tprof = 0.0
        out = bow * math.sin(math.pi * t) + lean * t
        centers.append(Vector((root.x + side * out,
                               root.y - length * t,
                               root.z + forward * t)))
        widths.append(half_width * wprof)
        thicks.append(half_thick * tprof)

    verts = []
    faces = []
    ring_ids = []
    last = len(centers) - 1
    for i, c in enumerate(centers):
        if i == 0:
            tangent = (centers[1] - centers[0]).normalized()
        elif i == last:
            tangent = (centers[last] - centers[last - 1]).normalized()
        else:
            tangent = (centers[i + 1] - centers[i - 1]).normalized()
        n = hint - tangent * hint.dot(tangent)
        if n.length < 1e-6:
            n = Vector((side, 0.0, 0.0))
        n.normalize()
        w = tangent.cross(n).normalized()

        ring = []
        if i == last:
            ring.append(len(verts))
            verts.append(tuple(c))
        else:
            for k in range(segments):
                a = 2.0 * math.pi * k / segments
                p = (c + w * (widths[i] * math.cos(a))
                     + n * (thicks[i] * math.sin(a)))
                ring.append(len(verts))
                verts.append((p.x, p.y, p.z))
        ring_ids.append(ring)

    for i in range(last - 1):
        a_ring = ring_ids[i]
        b_ring = ring_ids[i + 1]
        for k in range(segments):
            k2 = (k + 1) % segments
            faces.append((a_ring[k], b_ring[k], b_ring[k2], a_ring[k2]))

    tip = ring_ids[-1][0]
    last_ring = ring_ids[-2]
    for k in range(segments):
        k2 = (k + 1) % segments
        faces.append((last_ring[k], tip, last_ring[k2]))

    root_ring = ring_ids[0]
    root_center = len(verts)
    verts.append(tuple(centers[0]))
    for k in range(segments):
        k2 = (k + 1) % segments
        faces.append((root_ring[k2], root_center, root_ring[k]))

    return new_object(name, verts, faces, mat, smooth=True, parent=parent)


def collar_band(name, profile, center_svg_y, width_svg, thick_svg,
                mat, parent=None, major=72, minor=14, tilt_svg=0.0):
    """A flat strap wrapped around the body's tapered neck.

    The body is a revolve, so its neck is wider than it is deep and its
    radius changes over the collar's height. A fixed ellipse either
    floats off the chest or gets swallowed by the taper and reads as a
    thin wire. This samples the real body radius at every point, so the
    strap sits proud of the fur all the way around, with a slight
    forward tilt like a collar rather than a hoop.
    """
    cy = (GROUND_Y - center_svg_y) * SCALE
    half_h = width_svg * 0.5 * SCALE
    half_t = thick_svg * 0.5 * SCALE
    base = 1.0 * SCALE
    tilt = tilt_svg * SCALE

    verts = []
    faces = []
    for i in range(major):
        a = 2.0 * math.pi * i / major
        ca, sa = math.cos(a), math.sin(a)
        for j in range(minor):
            b = 2.0 * math.pi * j / minor
            cb, sb = math.cos(b), math.sin(b)
            # Superellipse section: a broad flat face with rounded edges.
            er = math.copysign(abs(cb) ** 0.35, cb)
            ev = math.copysign(abs(sb) ** 0.35, sb)
            # sa > 0 is the front (+z); subtract to drop the front edge.
            y = cy - tilt * sa + half_h * ev
            y_svg = GROUND_Y - y / SCALE
            r = radius_at(profile, y_svg)
            rx, rz = r * SCALE, r * SCALE * BODY_Z
            # Outward normal of the local ellipse (x/rx)^2 + (z/rz)^2 = 1.
            nx, nz = ca / rx, sa / rz
            norm = math.hypot(nx, nz) or 1.0
            nx, nz = nx / norm, nz / norm
            off = base + half_t * er
            verts.append((
                rx * ca + nx * off,
                y,
                rz * sa + nz * off,
            ))

    for i in range(major):
        i2 = (i + 1) % major
        for j in range(minor):
            j2 = (j + 1) % minor
            faces.append((i * minor + j, i2 * minor + j,
                          i2 * minor + j2, i * minor + j2))

    return new_object(name, verts, faces, mat, smooth=True, parent=parent)


# --------------------------------------------------------------------------
# the model
# --------------------------------------------------------------------------

BODY_PATH = ("M200 286 C252 286 292 330 293 400 "
             "C294 460 280 506 252 514 L148 514 "
             "C120 506 106 460 107 400 "
             "C108 330 148 286 200 286Z")

HEAD_PATH = ("M200 128 C262 128 302 170 302 218 "
             "C302 268 258 304 200 304 "
             "C142 304 98 268 98 218 "
             "C98 170 138 128 200 128Z")

ARM_L_PATH = ("M150 318 L133 319 C108 326 94 352 90 390 "
              "C88 414 86 432 88 446 L124 450 "
              "C124 420 128 392 142 366 "
              "C150 352 158 340 160 330Z")

ARM_R_PATH = ("M250 318 L267 319 C292 326 306 352 310 390 "
              "C312 414 314 432 312 446 L276 450 "
              "C276 420 272 392 258 366 "
              "C250 352 242 340 240 330Z")

EAR_L_PATH = ("M130 150 C100 136 70 160 68 202 "
              "C66 242 90 264 114 254 C134 246 144 202 144 166Z")

EAR_R_PATH = ("M270 150 C300 136 330 160 332 202 "
              "C334 242 310 264 286 254 C266 246 256 202 256 166Z")


def half_profile(path, steps=26):
    """Right-hand half of a closed path, as (radius, svg_y), top to bottom."""
    pts = sample_path(path, steps=steps)
    half = [(p[0] - CX, p[1]) for p in pts if p[0] >= CX - 0.5]
    half.sort(key=lambda p: p[1])
    # The profile has to start and end on the axis, or the revolve leaves
    # an open hole at the top and bottom of the shape.
    profile = [(0.0, half[0][1])]
    for r, y in half:
        if abs(r) > 1e-6 or abs(y - profile[-1][1]) > 1e-6:
            profile.append((r, y))
    profile.append((0.0, profile[-1][1]))
    return profile


def radius_at(profile, y_svg):
    """Radius of a revolved profile at a given svg height."""
    pts = sorted(profile, key=lambda p: p[1])
    ys = [p[1] for p in pts]
    rs = [p[0] for p in pts]
    if y_svg <= ys[0]:
        return rs[0]
    if y_svg >= ys[-1]:
        return rs[-1]
    for k in range(len(ys) - 1):
        if ys[k] <= y_svg <= ys[k + 1]:
            span = ys[k + 1] - ys[k]
            f = 0.0 if span < 1e-9 else (y_svg - ys[k]) / span
            return rs[k] + (rs[k + 1] - rs[k]) * f
    return rs[-1]


def build():
    purge_scene()

    body_profile = half_profile(BODY_PATH)
    head_profile = half_profile(HEAD_PATH)

    def skull_z(x_svg, y_svg):
        """Z of the skull surface at a front-view position, in SVG units."""
        r = radius_at(head_profile, y_svg)
        dx = x_svg - CX
        inner = r * r - dx * dx
        if inner <= 0:
            return 0.0
        return math.sqrt(inner) * SKULL_Z

    def skull_zb(x_svg, y_svg):
        """Same, in blender units."""
        return skull_z(x_svg, y_svg) * SCALE

    def skull_x_at(y_svg, z_blender):
        """World X of the skull surface at a given height and depth.

        Used to drape the ears against the side of the head instead of
        leaving them floating next to it.
        """
        r = radius_at(head_profile, y_svg)
        inner = r * r - (z_blender / (SKULL_Z * SCALE)) ** 2
        if inner <= 0:
            return 0.0
        return math.sqrt(inner) * SCALE

    def body_surface_z(x_blender, y_blender):
        """World Z of the torso's front surface at a lateral position."""
        y_svg = GROUND_Y - y_blender / SCALE
        r = radius_at(body_profile, y_svg) * SCALE
        inner = r * r - x_blender * x_blender
        if inner <= 0:
            return 0.0
        return math.sqrt(inner) * BODY_Z

    # ---------------- rig skeleton --------------------------------------
    dog = make_empty("gz:dog", (CX, GROUND_Y))
    torso = make_empty("gz:torso", (CX, GROUND_Y), parent=dog)
    head = make_empty("gz:head", (CX, 292), parent=dog)
    hz = make_empty("gz:hz", (CX, 216), parent=head,
                    z=skull_zb(CX, 216))
    nose = make_empty("gz:nose", (200, 236), parent=head, z=0.0)
    ear_l = make_empty("gz:earL", (135, 150), parent=head, z=0.10)
    ear_r = make_empty("gz:earR", (265, 150), parent=head, z=0.10)
    tail = make_empty("gz:tail", (282, 440), parent=dog, z=0.0)
    eyes = make_empty("gz:eyes", (200, 202), parent=hz, z=skull_zb(200, 202))
    happy = make_empty("gz:happy", (200, 202), parent=hz, z=skull_zb(200, 202))
    # Closed lids for the idle blink. Squashing the eye patches shut leaves
    # a thin white sliver, so the blink swaps to a drawn eyelid for the
    # frames where the eye is actually closed.
    blink = make_empty("gz:blink", (200, 202), parent=hz, z=skull_zb(200, 202))
    brows = make_empty("gz:brows", (200, 170), parent=hz, z=skull_zb(200, 170))
    mouth = make_empty("gz:mouthOpen", (200, 258), parent=hz, z=0.0)
    mouth_closed = make_empty("gz:mouthClosed", (200, 258), parent=hz, z=0.0)
    hearts = make_empty("gz:hearts", (200, 300), parent=dog, z=0.0)

    # ---------------- torso ----------------------------------------------
    revolve("gz:body", body_profile, "fur", parent=torso, segments=48,
            zscale=BODY_Z)

    belly_z = radius_at(body_profile, 410) * SCALE * BODY_Z - 14 * SCALE
    ellipsoid("gz:belly", (200, 410), 56, 78, 24, "belly", parent=torso,
              rot_x=math.radians(-7), z=belly_z)

    # Legs: rounded tapered columns rather than flat rectangular slabs.
    # From the side the old boxes read as blocks; the tube keeps the same
    # front silhouette while giving the leg a round cross-section.
    for side, x in (("L", -0.158), ("R", 0.158)):
        tube_along(
            "gz:leg" + side,
            [(x, 0.38, 0.0), (x, 0.26, 0.012), (x, 0.115, 0.024)],
            [0.095, 0.088, 0.078],
            "fur", parent=torso, segments=16)
        ellipsoid("gz:foot" + side, (200.0 + x / SCALE, 549), 32, 14, 24,
                  "belly", parent=torso, z=0.085)

    # The artwork's arms are the puppy's front legs, hanging down the
    # sides of the body. They are not cylinders: in the drawing each one is
    # a soft blade pressed against the torso. Two things make that read:
    #   * `flatten` squashes the tube front-to-back so it lies on the fur
    #     instead of resting on it like a sausage;
    #   * the top of the tube starts well inside the torso and rises to the
    #     surface, so the shoulder fades out under the collar with no ball
    #     and no cut-off end cap.
    # The centreline goes through `smooth_chain` because tube_along joins
    # its points with straight sections, which creases at every joint.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        arm_spec = ((0.245, 1.060), (0.320, 0.990), (0.385, 0.880),
                    (0.425, 0.730), (0.430, 0.580))
        arm_dz = (-0.055, -0.015, -0.002, +0.008, +0.020)
        arm_pts = []
        for (ax, ay), dz in zip(arm_spec, arm_dz):
            x = ax * sign
            arm_pts.append((x, ay, body_surface_z(x, ay) + dz))
        arm_curves, arm_radii = smooth_chain(
            arm_pts, [0.050, 0.072, 0.082, 0.078, 0.068],
            steps=6)
        tube_along(
            "gz:arm" + side, arm_curves, arm_radii,
            "fur", parent=torso, segments=20, flatten=0.82)
        paw_x = 0.423 * sign
        paw_y = 0.495
        ellipsoid("gz:paw" + side, (200.0 + paw_x / SCALE, 452),
                  22, 22, 18, "belly", parent=torso,
                  z=body_surface_z(paw_x, paw_y) + 0.060)

    # ---------------- collar + tag ---------------------------------------
    # The collar has to follow the neck's ellipse, not a circle. The strap
    # sinks just far enough into the fur to look worn, and the tag rests
    # against the chest instead of floating in front of it.
    collar_y = 314.0
    collar_band("gz:collar", body_profile, collar_y, 14.0, 4.2, "collar",
                parent=torso, tilt_svg=5.0)
    tag_y = 334.0
    tag_z = body_surface_z(0.0, (GROUND_Y - tag_y) * SCALE) + 0.016
    tag = ellipsoid("gz:tag", (200, tag_y), 10, 10, 4.5, "tag", parent=torso,
                    z=tag_z)
    tag.rotation_euler = (math.radians(-10), 0.0, 0.0)

    # ---------------- head -----------------------------------------------
    revolve("gz:skull", head_profile, "fur", parent=head, segments=48,
            zscale=SKULL_Z)

    # The cowlick is always visible, so it is built as three rounded locks
    # instead of one flat card. From the side the old slab read as a plain
    # rectangle sticking out of the crown.
    for i, (pts3d, radii) in enumerate((
            ([(-0.045, 1.930, 0.015), (-0.062, 1.975, 0.024),
              (-0.040, 2.005, 0.014), (-0.014, 2.015, 0.004)],
             [0.040, 0.032, 0.018, 0.005]),
            ([(0.015, 1.930, 0.018), (0.042, 1.972, 0.022),
              (0.062, 2.000, 0.010), (0.078, 2.010, 0.002)],
             [0.038, 0.030, 0.016, 0.005]))):
        tube_along("gz:tuft%d" % i, pts3d, radii, "furLight", parent=head,
                   segments=12)

    slab("gz:forehead",
         sample_path("M204 192 C208 160 262 158 278 190 "
                     "C290 220 262 242 232 238 "
                     "C208 234 201 214 204 192Z", steps=18),
         6, "patch", parent=head, bevel=0.004, bevel_segments=2,
         zfunc=lambda x, y: skull_zb(x, y) - 11.0 * SCALE)

    # ---------------- ears ------------------------------------------------
    # A floppy ear is a solid, rounded flap, not the flat card that the
    # artwork uses for the front view. Each one is lofted from a tapering
    # elliptical section: the centreline bows out over the skull and the
    # broad face is angled forward, so it has a readable silhouette from
    # the front, the side and three-quarter angles.
    loft_ear("gz:earLMesh", (-0.230, 1.880, 0.020), -1.0,
             0.560, 0.150, 0.048, "ear", parent=ear_l,
             bow=0.195, lean=0.085, forward=0.010)
    loft_ear("gz:earRMesh", (0.230, 1.880, 0.020), 1.0,
             0.560, 0.150, 0.048, "ear", parent=ear_r,
             bow=0.195, lean=0.085, forward=0.010)

    # ---------------- muzzle, nose, mouth --------------------------------
    # The snout has to read in profile as well as head-on. Sitting the
    # ellipsoid further forward (only 40% of its depth buried) gives the
    # nose something to sit on instead of a flat decal on the skull.
    MUZZLE_RX, MUZZLE_RY, MUZZLE_RZ = 48.0, 38.0, 42.0
    MUZZLE_C = (200.0, 254.0)
    muzzle_z = skull_zb(MUZZLE_C[0], MUZZLE_C[1]) - MUZZLE_RZ * SCALE * 0.40
    muzzle = ellipsoid("gz:muzzle", MUZZLE_C, MUZZLE_RX, MUZZLE_RY,
                       MUZZLE_RZ, "muzzle", parent=hz,
                       rot_x=math.radians(-8), z=muzzle_z)

    def muzzle_z_at(x_svg, y_svg):
        """Z offset from the muzzle's centre, in SVG units."""
        dx = (x_svg - MUZZLE_C[0]) / MUZZLE_RX
        dy = (y_svg - MUZZLE_C[1]) / MUZZLE_RY
        v = 1.0 - dx * dx - dy * dy
        if v <= 0:
            return 0.0
        return math.sqrt(v) * MUZZLE_RZ

    def muzzle_surface(x_svg, y_svg):
        """Absolute z of the muzzle surface, in blender units."""
        return muzzle_z + muzzle_z_at(x_svg, y_svg) * SCALE

    nose.location.z = muzzle_surface(200, 236) + 2.0 * SCALE
    mouth.location.z = muzzle_surface(200, 258)

    slab("gz:noseMesh",
         sample_path("M179 228 C179 219 221 219 221 228 "
                     "C221 241 209 249 200 249 "
                     "C191 249 179 241 179 228Z", steps=18),
         18, "nose", parent=nose, bevel=0.005, bevel_segments=2,
         zfunc=lambda x, y: muzzle_surface(x, y) + 3.0 * SCALE)

    for i, sub in enumerate(sample_subpaths(
            "M200 248 V259 M200 259 C192 273 174 273 168 261 "
            "M200 259 C208 273 226 273 232 261", steps=14)):
        stroke("gz:mouthClosed%d" % i, sub, 4.5, 7, "brow",
               parent=mouth_closed,
               zfunc=lambda x, y: muzzle_surface(x, y) + 1.0 * SCALE)

    slab("gz:mouthOpenMesh",
         sample_path("M166 258 C190 254 210 254 234 258 "
                     "C238 296 218 306 200 306 "
                     "C182 306 162 296 166 258Z", steps=18),
         14, "mouthInner", parent=mouth, bevel=0.005, bevel_segments=2,
         zfunc=lambda x, y: muzzle_surface(x, y) + 1.0 * SCALE)

    slab("gz:tongueMesh",
         sample_path("M181 292 C186 276 214 276 219 292 "
                     "C214 304 186 304 181 292Z", steps=14),
         10, "tongue", parent=mouth, bevel=0.004, bevel_segments=2,
         zfunc=lambda x, y: muzzle_surface(x, y) + 6.0 * SCALE)

    # ---------------- eyes ------------------------------------------------
    # The artwork's eyes are flat ovals painted on the face. The skull is a
    # dome, so a forward-facing ellipsoid gets swallowed on the side nearest
    # the nose: the sclera shows as a crescent and the pupil reads as a
    # black blob spilling onto the fur. Both are thin shells that follow the
    # skull instead, with the pupil a smaller shell sitting a hair above the
    # sclera so it can never leave the white.
    for side, ex, pdx in (("L", 162.0, 3.0), ("R", 238.0, -3.0)):
        ez = skull_zb(ex, 202)
        eye_patch("gz:eyeWhite" + side, (ex, 202), 21, 24,
                  lambda x, y: skull_zb(x, y) + 0.0025, "eyeWhite",
                  parent=eyes, thickness=0.012)

        # Both pupils sit 3 units toward the nose, exactly as the SVG
        # draws them. Offsetting both the same way made the right eye look
        # out while the left looked in, which reads as unnatural.
        px = ex + pdx
        pupil = make_empty("gz:pupil" + side, (px, 206), parent=eyes,
                           z=ez + 0.0045)
        eye_patch("gz:pupilMesh" + side, (px, 206), 12, 13,
                  lambda x, y: skull_zb(x, y) + 0.0045, "eyeBlack",
                  parent=pupil, thickness=0.008)
        # The highlight is a flat disc on the pupil, like the artwork's
        # white circle, not a ball stuck to the eye.
        eye_patch("gz:sparkle" + side, (px + 5, 200), 4.5, 4.5,
                  lambda x, y: skull_zb(x, y) + 0.0065, "eyeWhite",
                  parent=pupil, thickness=0.004)

    # happy (^ ^) eyes, used by the giggle and wag reactions
    for side, ex in (("L", 162.0), ("R", 238.0)):
        sub = sample_path("M%d 208 Q%d 184 %d 208"
                          % (ex - 20, ex, ex + 20), steps=14)
        stroke("gz:happyEye" + side, sub, 5.0, 6, "pupil", parent=happy,
               zfunc=lambda x, y: skull_zb(x, y) - 1.0 * SCALE)
        # A small black dot inside the happy arc reads as a pupil
        pupil = make_empty("gz:happyPupil" + side,
                           (ex - 3, 203), parent=happy,
                           z=skull_zb(ex, 203) - 0.5 * SCALE)
        eye_patch("gz:happyPupilMesh" + side,
                  (ex - 3, 203), 3.5, 4.0,
                  lambda x, y: skull_zb(x, y) - 0.5 * SCALE,
                  "pupil", parent=pupil, thickness=0.006)

    # blinking (closed) eyes: a shallow arc, the drawn closed eye
    for side, ex in (("L", 162.0), ("R", 238.0)):
        sub = sample_path("M%d 201 Q%d 212 %d 201"
                          % (ex - 19, ex, ex + 19), steps=14)
        stroke("gz:blinkEye" + side, sub, 5.0, 6, "pupil", parent=blink,
               zfunc=lambda x, y: skull_zb(x, y) - 1.0 * SCALE)

    # ---------------- brows, cheeks ---------------------------------------
    for side, d in (("L", "M142 168 Q160 158 182 167"),
                    ("R", "M218 167 Q240 158 258 168")):
        sub = sample_path(d, steps=14)
        stroke("gz:brow" + side, sub, 5.0, 6, "brow", parent=brows,
               zfunc=lambda x, y: skull_zb(x, y) - 1.5 * SCALE)

    for side, cx in (("L", 132.0), ("R", 268.0)):
        # A blush is painted on, not stuck on: a squashed sphere caught the
        # light and read as a spot on the cheek. A flat disc riding the
        # skull keeps the colour and stays flush with the fur.
        eye_patch("gz:cheek" + side, (cx, 254), 12, 9,
                  lambda x, y: skull_zb(x, y) + 0.0012, "cheek",
                  parent=hz, rings=4, segs=32, thickness=0.005)

    # ---------------- tail ------------------------------------------------
    # Sweep the tail out and up, then taper it smoothly to a small rounded
    # point. The old separate ball tip read as a blunt knob, especially in
    # profile; a continuous taper looks like an actual tail from every side.
    tail_path = sample_path("M282 438 C332 442 350 410 342 372", steps=40)
    tail_pts = []
    tail_radii = []
    n = len(tail_path)
    for i, p in enumerate(tail_path):
        t = i / max(1, n - 1)
        bx, by = svg_to_blender(p[0], p[1])
        bx += 0.040 * math.sin(t * math.pi)
        bz = -0.020 - 0.120 * t - 0.020 * math.sin(t * math.pi)
        tail_pts.append((bx, by, bz))
        tail_radii.append((20.0 * (1.0 - t) ** 0.52 + 2.5) * SCALE)
    tube_along("gz:tailMesh", tail_pts, tail_radii, "fur", parent=tail,
               segments=20)

    # ---------------- hearts ----------------------------------------------
    # Each heart gets its own pivot at its centre, standing in front of the
    # body. The runtime pops and fades them during the tail-wag reaction;
    # scaling the shared `gz:hearts` empty would drag every heart down into
    # the belly, because their geometry is authored in world space.
    for i, (hx, hy) in enumerate(((96, 192), (304, 192))):
        hp = [(p[0] + hx, p[1] + hy) for p in
              sample_path("M0 9 C-16 -2 -9 -15 0 -7 C9 -15 16 -2 0 9Z",
                          steps=16)]
        pivot = make_empty("gz:heart%d" % i, (hx, hy - 3), parent=hearts,
                           z=HEART_Z)
        slab("gz:heartMesh%d" % i, hp, 10, "heart", parent=pivot,
             bevel=0.004, bevel_segments=2,
             zfunc=lambda x, y: HEART_Z)

    # ---------------- export ---------------------------------------------
    # Every shape here is a closed solid, so recalculating the normals
    # outward gives a consistent shading result no matter how each piece
    # was wound when it was built.
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        export_apply=True,
        # This model is authored Y-up (the SVG is y-down, so the artwork is
        # flipped into a Y-up space on the way in). glTF and three.js are
        # also Y-up, so the usual Blender Z-up -> glTF Y-up conversion
        # would lay the puppy on its side. Writing Blender's coordinates
        # as-is keeps +Y up and +Z towards the camera, which is exactly
        # what three.js expects.
        export_yup=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )

    faces = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            faces += len(obj.data.polygons)
    print("=" * 62)
    print("BUILD OK  objects=%d  faces=%d" % (len(bpy.data.objects), faces))
    print("glb -> %s  (%.1f KB)" % (OUT_GLB, os.path.getsize(OUT_GLB) / 1024.0))
    print("=" * 62)


if __name__ == "__main__":
    build()
