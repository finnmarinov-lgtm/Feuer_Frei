"""Hilfsfunktionen zum Bauen von Modellen per Skript (Blender 5.x, Hintergrundmodus)."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'assets', 'models')
PREVIEW_DIR = os.path.join(ROOT, 'blender', 'preview')
TEX_DIR = os.path.join(ROOT, 'public', 'assets', 'textures')


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras,
                 bpy.data.lights, bpy.data.node_groups):
        for d in list(coll):
            coll.remove(d)


def _bsdf(m):
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return bsdf


def _new_material(name):
    m = bpy.data.materials.new(name)
    if m.node_tree is None and hasattr(m, 'use_nodes'):
        m.use_nodes = True
    return m


def mat(name, color, metal=0.0, rough=0.5):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = _new_material(name)
    b = _bsdf(m)
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*color, 1.0)
    return m


def _image(path, non_color):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def textured_mat(name, tex_id):
    """PBR-Material aus einem Poly-Haven-Satz (diff/nor/arm)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = _new_material(name)
    nt = m.node_tree
    b = _bsdf(m)
    base = os.path.join(TEX_DIR, tex_id)
    diff = nt.nodes.new('ShaderNodeTexImage')
    diff.image = _image(os.path.join(base, 'diff.jpg'), False)
    nt.links.new(diff.outputs['Color'], b.inputs['Base Color'])
    nor = nt.nodes.new('ShaderNodeTexImage')
    nor.image = _image(os.path.join(base, 'nor.jpg'), True)
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(nor.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], b.inputs['Normal'])
    arm = nt.nodes.new('ShaderNodeTexImage')
    arm.image = _image(os.path.join(base, 'arm.jpg'), True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(arm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    return m


def _world_offset(parent):
    off = Vector((0, 0, 0))
    p = parent
    while p is not None:
        off += p.location
        p = p.parent
    return off


def _finish(name, bm, material, parent, origin, bevel, segs, angle, smooth, uv_tile=None, uv_long=None):
    origin = Vector(origin)
    if uv_tile:
        project_uv(bm, uv_tile, uv_long)
    bmesh.ops.translate(bm, verts=bm.verts, vec=-origin)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if material:
        me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = origin - (_world_offset(parent) if parent else Vector((0, 0, 0)))
    if parent:
        o.parent = parent
    use_smooth = smooth or bevel > 0
    me.polygons.foreach_set('use_smooth', [use_smooth] * len(me.polygons))
    if bevel > 0:
        b = o.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel
        b.segments = segs
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
        b.harden_normals = True
    return o


def project_uv(bm, tile, long_axis=None):
    """UVs aus Weltkoordinaten, je nach Flächenrichtung (wie Box-Projektion)."""
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        plane = [i for i in range(3) if i != ax]
        if long_axis is not None and long_axis in plane:
            u_ax = long_axis
            v_ax = plane[0] if plane[1] == long_axis else plane[1]
        elif ax == 2:
            u_ax, v_ax = 0, 1
        else:
            u_ax, v_ax = plane[0], 2
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co[u_ax] / tile, co[v_ax] / tile)


def box(name, size, center, material, bevel=0.003, segs=2, parent=None, rot=None, angle=35,
        uv_tile=None, uv_long=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler(rot).to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, bevel, segs, angle, False, uv_tile, uv_long)


def _axis_matrix(axis):
    if axis == 'Y':
        return Matrix.Rotation(-math.pi / 2, 3, 'X')
    if axis == 'X':
        return Matrix.Rotation(math.pi / 2, 3, 'Y')
    return Matrix.Identity(3)


def cyl(name, r, length, center, material, axis='Y', r2=None, segs=24, bevel=0.0015, bsegs=2, parent=None):
    """Zylinder/Kegel. r gilt am hinteren Ende (-Achse), r2 am vorderen (+Achse)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=_axis_matrix(axis))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, bevel, bsegs, 35, True)


def cyl_between(name, start, end, r1, r2, material, segs=20, bevel=0.002, parent=None):
    start, end = Vector(start), Vector(end)
    d = end - start
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    center = (start + end) / 2
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return _finish(name, bm, material, parent, center, bevel, 2, 35, True)


def tube(name, r_out, r_in, length, center, material, axis='Y', segs=32, bevel=0.0008, parent=None):
    """Hohles Rohr (z. B. Gehäuse eines Rotpunktvisiers), durch das man hindurchsehen kann."""
    bm = bmesh.new()
    h = length / 2
    rings = []
    for z, r in ((-h, r_out), (h, r_out), (h, r_in), (-h, r_in)):
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z))
                      for i in range(segs)])
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        ra, rb = rings[a], rings[b]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=_axis_matrix(axis))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, bevel, 2, 35, True)


def sphere(name, r, center, material, scale=(1, 1, 1), parent=None, segs=24):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2 + 2, radius=r)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, 0, 0, 0, True)


def dome(name, r, center, material, scale=(1, 1, 1), parent=None, segs=24):
    """Halbkugel (offen nach unten), z. B. für einen Helm."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2 + 2, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -r * 0.05], context='VERTS')
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, 0, 0, 0, True)


def torus(name, R, r, center, material, axis='Z', seg=24, rseg=8, parent=None):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=_axis_matrix(axis))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return _finish(name, bm, material, parent, center, 0, 0, 0, True)


def profile(name, pts, width, material, axis='X', offset=0.0, taper=None, bevel=0.003, segs=2,
            parent=None, angle=35):
    """Seitenprofil extrudieren.
    axis='X': pts sind (y, z), Dicke entlang X (Seitenansicht einer Waffe).
    axis='Y': pts sind (x, z), Dicke entlang Y (flache Platte, Vorderseite -Y).
    taper: Faktor der halben Dicke pro Punkt (z. B. für eine Klingenschneide)."""
    bm = bmesh.new()
    a, b = [], []
    for i, (p, q) in enumerate(pts):
        hw = width / 2 * (taper[i] if taper else 1.0)
        if axis == 'X':
            a.append(bm.verts.new((offset - hw, p, q)))
            b.append(bm.verts.new((offset + hw, p, q)))
        else:
            a.append(bm.verts.new((p, offset - hw, q)))
            b.append(bm.verts.new((p, offset + hw, q)))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cx = sum(p for p, _ in pts) / n
    cz = sum(q for _, q in pts) / n
    origin = (offset, cx, cz) if axis == 'X' else (cx, offset, cz)
    return _finish(name, bm, material, parent, origin, bevel, segs, angle, False)


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.02
    bpy.context.scene.collection.objects.link(o)
    o.location = Vector(loc) - (_world_offset(parent) if parent else Vector((0, 0, 0)))
    if parent:
        o.parent = parent
    return o


def parent_all(root, exclude=()):
    for o in bpy.context.scene.objects:
        if o is not root and o.parent is None and o not in exclude:
            loc = o.location.copy()
            o.parent = root
            o.location = loc - root.location


def join_meshes(objects, name, parent=None):
    """Wendet Modifikatoren an und vereint die Objekte zu einem Mesh (ein Draw Call pro Material).
    Mit parent sitzt das Ergebnis ohne Versatz unter diesem Objekt."""
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects:
        o.select_set(False)
    meshes = [o for o in objects if o.type == 'MESH']
    for o in meshes:
        o.select_set(True)
    vl.objects.active = meshes[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = vl.objects.active
    obj.name = name
    obj.data.name = name
    vl.update()
    if parent is not None:
        obj.data.transform(parent.matrix_world.inverted() @ obj.matrix_world)
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
    obj.select_set(False)
    return obj


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def export(filename, jpeg=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    for o in bpy.context.scene.objects:
        o.select_set(True)
    extra = {'export_image_format': 'JPEG', 'export_jpeg_quality': 88} if jpeg else {}
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False, **extra)
    size = os.path.getsize(path)
    print(f'EXPORT {filename} {size / 1024:.0f} KB')
    return path


def _set_engine(scene):
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = eng
            return eng
        except TypeError:
            continue


def render_preview(name, direction=(1.0, -0.35, 0.4), res=(640, 360), lens=55, hide=()):
    """Rendert eine Vorschau aller Meshes der Szene nach blender/preview/<name>.png.
    hide: Namensanfänge von Objekten, die ausgeblendet werden (z. B. die Arme)."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    for o in scene.objects:
        o.hide_render = any(o.name.startswith(h) for h in hide)
    meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (mn + mx) / 2
    radius = (mx - mn).length / 2

    cam_data = bpy.data.cameras.new('PreviewCam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('PreviewCam', cam_data)
    scene.collection.objects.link(cam)
    d = Vector(direction).normalized()
    vfov = 2 * math.atan(math.tan(cam_data.angle / 2) * res[1] / res[0])
    dist = radius / math.sin(vfov / 2) * 1.02
    cam.location = center + d * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.clip_start = dist * 0.01
    cam_data.clip_end = dist * 10
    scene.camera = cam

    lights = []
    for lname, energy, rot in (('Key', 3.5, (math.radians(50), 0, math.radians(40))),
                               ('Fill', 1.2, (math.radians(70), 0, math.radians(-130)))):
        ld = bpy.data.lights.new(lname, 'SUN')
        ld.energy = energy
        lo = bpy.data.objects.new(lname, ld)
        lo.rotation_euler = rot
        scene.collection.objects.link(lo)
        lights.append(lo)

    world = scene.world or bpy.data.worlds.new('PreviewWorld')
    scene.world = world
    if world.node_tree is None and hasattr(world, 'use_nodes'):
        world.use_nodes = True
    bg = world.node_tree.nodes.get('Background') if world.node_tree else None
    if bg:
        bg.inputs['Color'].default_value = (0.32, 0.34, 0.37, 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        world.color = (0.32, 0.34, 0.37)

    _set_engine(scene)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene.render.filepath = os.path.join(PREVIEW_DIR, name + '.png')
    bpy.ops.render.render(write_still=True)
    for o in [cam] + lights:
        bpy.data.objects.remove(o, do_unlink=True)
    print(f'PREVIEW {name}')
