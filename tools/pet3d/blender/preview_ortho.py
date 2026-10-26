"""Orthographic + perspective preview renders of the built pet.

    blender -b -P tools/pet3d/blender/preview_ortho.py

Writes PNGs to tools/pet3d/previews/ so build artwork never lands in the
shipped app assets.

Note on the camera: this model is Y-up (the artwork is flipped out of the
SVG's y-down space when it is built), while Blender's own convention is
Z-up. So the camera is aimed with an explicit up vector instead of
Vector.to_track_quat, which would assume Blender's Z axis is up and roll
the shot by 90 degrees.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_pet  # noqa: E402

OUT_DIR = os.path.join(build_pet.REPO, "tools", "pet3d", "previews")
WORLD_UP = Vector((0.0, 1.0, 0.0))


def setup():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.08, 0.10, 0.09, 1.0)

    for name, energy, loc, rot in (
            ("K", 600.0, (-2.2, 3.2, 3.2), (50, 0, 155)),
            ("F", 200.0, (3.2, 1.2, 2.0), (60, 0, -120)),
            ("R", 320.0, (0.4, 1.8, -3.0), (-70, 0, 0))):
        lamp = bpy.data.lights.new(name, "AREA")
        lamp.energy = energy
        lamp.size = 3.0
        o = bpy.data.objects.new(name, lamp)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = tuple(math.radians(a) for a in rot)

    cam_data = bpy.data.cameras.new("C")
    cam = bpy.data.objects.new("C", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"

    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    bpy.context.view_layer.update()
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            lo = Vector(min(lo[i], w[i]) for i in range(3))
            hi = Vector(max(hi[i], w[i]) for i in range(3))
    print("BOUNDS min=(%.3f,%.3f,%.3f) max=(%.3f,%.3f,%.3f)"
          % (lo.x, lo.y, lo.z, hi.x, hi.y, hi.z))
    return cam, (lo + hi) * 0.5


def aim(cam, pos, target):
    """Point the camera at target, keeping world +Y as the image's up."""
    f = (Vector(target) - Vector(pos)).normalized()
    r = f.cross(WORLD_UP)
    if r.length < 1e-6:
        r = Vector((1.0, 0.0, 0.0))
    r.normalize()
    u = r.cross(f).normalized()
    cam.matrix_world = Matrix((
        (r.x, u.x, -f.x, pos[0]),
        (r.y, u.y, -f.y, pos[1]),
        (r.z, u.z, -f.z, pos[2]),
        (0.0, 0.0, 0.0, 1.0),
    ))


def orbit(cam, center, az_deg, el_deg, distance, ortho_scale=None):
    a = math.radians(az_deg)
    e = math.radians(el_deg)
    pos = (center.x + distance * math.cos(e) * math.sin(a),
           center.y + distance * math.sin(e),
           center.z + distance * math.cos(e) * math.cos(a))
    if ortho_scale is not None:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho_scale
    else:
        cam.data.type = "PERSP"
        cam.data.lens = 55.0
    aim(cam, pos, center)


def hide_reactions(hidden):
    """Match the runtime's idle state: eyes closed / mouth open / hearts off."""
    prefixes = ("gz:happyEye", "gz:blinkEye", "gz:mouthOpenMesh",
                "gz:tongueMesh", "gz:heart")
    for obj in bpy.data.objects:
        if obj.name.startswith(prefixes):
            obj.hide_render = hidden
            obj.hide_viewport = hidden
        elif obj.name.startswith("gz:mouthClosed"):
            # The closed-mouth lines are the idle mouth, so they are the
            # inverse of the reaction parts.
            obj.hide_render = not hidden
            obj.hide_viewport = not hidden


def main():
    build_pet.build()
    os.makedirs(OUT_DIR, exist_ok=True)
    cam, center = setup()

    hide_reactions(True)
    for name, az, el in (("ortho_front", 0, 0),
                         ("ortho_side", 90, 0),
                         ("ortho_back", 180, 0),
                         ("ortho_34", 34, 8),
                         ("ortho_back34", 146, 8)):
        orbit(cam, center, az, el, 6.0, ortho_scale=2.55)
        bpy.context.scene.render.filepath = os.path.join(
            OUT_DIR, "preview_%s.png" % name)
        bpy.ops.render.render(write_still=True)
        print("rendered %s" % name)

    orbit(cam, center, 22, 6, 4.3)
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, "preview_persp.png")
    bpy.ops.render.render(write_still=True)
    print("rendered persp")

    # One reaction pose, so the mouth/tongue/hearts remain reviewable.
    hide_reactions(False)
    orbit(cam, center, 22, 6, 4.3)
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, "preview_react.png")
    bpy.ops.render.render(write_still=True)
    print("rendered react")


if __name__ == "__main__":
    main()
