"""
Render preview images of the built pet so the result can be eyeballed
without opening Blender.

    blender -b -P tools/pet3d/blender/preview_pet.py

Older perspective renderer, kept for soft-lit beauty shots. For the
front/side/back turnaround used to review the model, use preview_ortho.py.

Writes PNGs to tools/pet3d/previews/ so build artwork never lands in the
shipped app assets.
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import build_pet  # noqa: E402

OUT_DIR = os.path.join(build_pet.REPO, "tools", "pet3d", "previews")


def setup_world():
    scene = bpy.context.scene

    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.055, 0.075, 0.065, 1.0)
    bg.inputs[1].default_value = 1.0

    key = bpy.data.lights.new("Key", "AREA")
    key.energy = 420.0
    key.size = 2.2
    key_obj = bpy.data.objects.new("Key", key)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (-1.6, 2.6, 2.4)
    key_obj.rotation_euler = (math.radians(48), 0.0, math.radians(160))

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 130.0
    fill.size = 3.0
    fill_obj = bpy.data.objects.new("Fill", fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (2.4, 1.2, 1.6)
    fill_obj.rotation_euler = (math.radians(64), 0.0, math.radians(-125))

    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy = 260.0
    rim.size = 1.4
    rim_obj = bpy.data.objects.new("Rim", rim)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = (0.4, 1.8, -2.6)
    rim_obj.rotation_euler = (math.radians(-70), 0.0, 0.0)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 62.0
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(
        scene, "eevee") and "BLENDER_EEVEE_NEXT" in [
            i.identifier for i in
            bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
        ] else "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    try:
        scene.eevee.taa_render_samples = 64
    except AttributeError:
        pass
    return cam


def look_at(cam, target, azimuth_deg, elevation_deg, distance):
    """Place the camera on an orbit around the target and aim it inward.

    A Blender camera looks down its own -Z, so the aim is a
    track-to quaternion rather than a hand-rolled Euler triple.
    """
    from mathutils import Vector

    a = math.radians(azimuth_deg)
    e = math.radians(elevation_deg)
    tgt = Vector(target)
    cam.location = tgt + Vector((
        distance * math.cos(e) * math.sin(a),
        distance * math.sin(e),
        distance * math.cos(e) * math.cos(a),
    ))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()


def main():
    build_pet.build()
    os.makedirs(OUT_DIR, exist_ok=True)
    cam = setup_world()

    target = (0.0, 0.95, 0.0)
    shots = (
        ("front", 0.0, 6.0, 3.4),
        ("three-quarter", 34.0, 8.0, 3.4),
        ("side", 90.0, 6.0, 3.4),
        ("back-quarter", 145.0, 10.0, 3.4),
    )

    for name, az, el, dist in shots:
        look_at(cam, target, az, el, dist)
        bpy.context.scene.render.filepath = os.path.join(
            OUT_DIR, "preview_%s.png" % name)
        bpy.ops.render.render(write_still=True)
        print("rendered %s" % bpy.context.scene.render.filepath)


if __name__ == "__main__":
    main()
