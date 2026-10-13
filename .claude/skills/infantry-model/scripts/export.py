
# Export an animated infantry unit to src/public/models/units/<type>.<faction>.glb. Exec in Blender, then
# export('<repo>/src/public/models/units/sardaukar.corrino.glb'). Must run in Object Mode (select_set, not
# select_all, which fails its poll from Pose Mode / without a 3D view context).
import bpy, os

def export(path):
    rig = bpy.data.objects['rig']
    if 'idle' in bpy.data.actions: rig.animation_data.action = bpy.data.actions['idle']
    bpy.context.scene.frame_set(1)
    hidden = [o for o in bpy.data.objects if o.hide_get()]
    for o in hidden: o.hide_set(False)
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    with bpy.context.temp_override(window=win, area=area):
        if bpy.context.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
        for o in bpy.data.objects: o.select_set(not o.name.startswith('_'))   # `_name` = reference/helper, not exported
        bpy.context.view_layer.objects.active = rig
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                                  export_normals=False, export_extras=True, export_apply=True,
                                  export_image_format='NONE', export_animations=True, export_animation_mode='ACTIONS')
    for o in hidden: o.hide_set(True)
    return os.path.getsize(path)
