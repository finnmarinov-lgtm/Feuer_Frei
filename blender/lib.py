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


def image_from_array(name, arr, non_color=True):
    """Bild aus einem numpy-Feld (Höhe x Breite x 3, Werte 0 bis 1), wird mit exportiert."""
    import numpy as np
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(arr[:, :, :3], 0, 1)
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def pbr_mat(name, color, arm=None, normal=None, normal_strength=1.0, metal=0.0, rough=0.5, emission=0.0):
    """Material mit fester Grundfarbe; arm: Bild mit Rauheit (grün) und Metall (blau), normal: Normal-Map."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = _new_material(name)
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*color, 1.0)
    if arm is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = arm
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if normal is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emission > 0:
        b.inputs['Emission Color'].default_value = (*color, 1.0)
        b.inputs['Emission Strength'].default_value = emission
    return m


# ---------- Texturen per Rechnung (kachelbar, ohne Fremddateien) ----------
def _value_noise(size, cells_u, cells_v, rng):
    """kachelbares Wertrauschen: cells_u Zellen quer, cells_v Zellen hoch"""
    import numpy as np
    g = rng.random((cells_v, cells_u))
    def axis(n):
        t = np.arange(size) * n / size
        i0 = np.floor(t).astype(int) % n
        f = t - np.floor(t)
        return i0, (i0 + 1) % n, f * f * (3 - 2 * f)
    u0, u1, fu = axis(cells_u)
    v0, v1, fv = axis(cells_v)
    a, b = g[np.ix_(v0, u0)], g[np.ix_(v0, u1)]
    c, d = g[np.ix_(v1, u0)], g[np.ix_(v1, u1)]
    fu, fv = fu[None, :], fv[:, None]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def _normal_from_height(h, strength):
    import numpy as np
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def _arm(rough, metal):
    import numpy as np
    arr = np.zeros(rough.shape + (3,), dtype=np.float32)
    arr[:, :, 0] = 1.0
    arr[:, :, 1] = rough
    arr[:, :, 2] = metal
    return arr


def tex_brushed(name, size=256, seed=1, rough=(0.25, 0.4), metal=0.8, strength=2.0):
    """Geschliffenes Metall: feine Längsstreifen (entlang u) in Rauheit und Oberfläche."""
    import numpy as np
    rng = np.random.default_rng(seed)
    n = (_value_noise(size, 2, 96, rng) * 0.6 + _value_noise(size, 4, 192, rng) * 0.3
         + _value_noise(size, 8, 24, rng) * 0.1)
    n = (n - n.min()) / (n.max() - n.min())
    r = rough[0] + (rough[1] - rough[0]) * n
    return (image_from_array(name + 'ARM', _arm(r, np.full_like(r, metal))),
            image_from_array(name + 'Nor', _normal_from_height(n, strength)))


def tex_grain(name, size=256, seed=2, rough=(0.5, 0.64), metal=0.0, strength=1.5):
    """Mattierter Kunststoff: feines, ungerichtetes Korn."""
    import numpy as np
    rng = np.random.default_rng(seed)
    n = _value_noise(size, 64, 64, rng) * 0.6 + _value_noise(size, 128, 128, rng) * 0.4
    n = (n - n.min()) / (n.max() - n.min())
    r = rough[0] + (rough[1] - rough[0]) * n
    return (image_from_array(name + 'ARM', _arm(r, np.full_like(r, metal))),
            image_from_array(name + 'Nor', _normal_from_height(n, strength)))


def tex_stipple(name, size=256, seed=3, dots=520, radius=5.5, rough=(0.62, 0.86), strength=6.0):
    """Griffnarbung: dicht an dicht kleine Noppen (wie bei Polymerpistolen)."""
    import numpy as np
    rng = np.random.default_rng(seed)
    h = np.zeros((size, size), dtype=np.float64)
    r = int(math.ceil(radius))
    oy, ox = np.mgrid[-r:r + 1, -r:r + 1]
    for _ in range(dots):
        cx, cy = rng.random() * size, rng.random() * size
        rad = radius * (0.75 + rng.random() * 0.5)
        ix, iy = int(cx), int(cy)
        d = np.sqrt((ox + ix - cx) ** 2 + (oy + iy - cy) ** 2) / rad
        bump = np.clip(1 - d * d, 0, None)
        ys = (oy + iy) % size
        xs = (ox + ix) % size
        np.maximum.at(h, (ys, xs), bump)
    h += _value_noise(size, 48, 48, rng) * 0.15
    rough_map = rough[1] - (rough[1] - rough[0]) * np.clip(h, 0, 1)
    return (image_from_array(name + 'ARM', _arm(rough_map, np.zeros_like(h))),
            image_from_array(name + 'Nor', _normal_from_height(h, strength)))


# ---------- Gemeinsame Oberflächen der Waffen (Bilder fürs Spiel, siehe src/weapons/surfaces.js) ----------
# Jede Oberfläche hat drei kachelbare Bilder: col (Faktor auf die Grundfarbe, knapp unter 1), arm
# (rot: Flecken für abgegriffene Kanten, grün: Faktor auf die Rauheit, blau: Faktor aufs Metall)
# und nor (Relief). Grundfarbe, Rauheit und
# Metall bleiben im Material aus Blender, deshalb passt ein Satz für viele Materialien und Waffen.
def _fbm(size, rng, cells, octaves=4, gain=0.5, aniso=(1.0, 1.0)):
    import numpy as np
    total = np.zeros((size, size))
    amp, norm, c = 1.0, 0.0, cells
    for _ in range(octaves):
        total += _value_noise(size, max(1, round(c * aniso[0])), max(1, round(c * aniso[1])), rng) * amp
        norm += amp
        amp *= gain
        c *= 2
    return total / norm


def _smoothstep(x, a, b):
    import numpy as np
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _blur(a, passes=1):
    import numpy as np
    for _ in range(passes):
        a = (a * 4 + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 8
    return a


def _scratches(size, rng, count, length=(0.04, 0.3), along_u=0.6):
    """Feine Kratzer (kachelbar), Maske 0 bis 1: meist längs (u), einige kreuz und quer."""
    import numpy as np
    m = np.zeros((size, size))
    for _ in range(count):
        x0, y0 = rng.random() * size, rng.random() * size
        ang = rng.normal(0, 0.12) if rng.random() < along_u else rng.random() * math.pi
        length_px = size * (length[0] + rng.random() * (length[1] - length[0]))
        t = np.linspace(0, 1, int(length_px * 2) + 2)
        off = rng.normal(0, 0.06) * length_px * 4 * t * (1 - t)
        xs = x0 + math.cos(ang) * length_px * t - math.sin(ang) * off
        ys = y0 + math.sin(ang) * length_px * t + math.cos(ang) * off
        w = (0.35 + 0.65 * rng.random()) * np.sqrt(np.sin(math.pi * t))
        np.maximum.at(m, (np.round(ys).astype(int) % size, np.round(xs).astype(int) % size), w)
    return m


def _stipple_height(size, rng, dots, radius):
    import numpy as np
    h = np.zeros((size, size), dtype=np.float64)
    r = int(math.ceil(radius * 1.25))
    oy, ox = np.mgrid[-r:r + 1, -r:r + 1]
    for _ in range(dots):
        cx, cy = rng.random() * size, rng.random() * size
        rad = radius * (0.75 + rng.random() * 0.5)
        ix, iy = int(cx), int(cy)
        d = np.sqrt((ox + ix - cx) ** 2 + (oy + iy - cy) ** 2) / rad
        np.maximum.at(h, ((oy + iy) % size, (ox + ix) % size), np.clip(1 - d * d, 0, None))
    return h


def save_jpeg(arr, path, quality=92):
    """numpy-Feld (Höhe x Breite x 3, Werte 0 bis 1) unverändert als JPEG speichern."""
    import numpy as np
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(arr[:, :, :3], 0, 1)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.file_format = 'JPEG'
    img.filepath_raw = path
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)
    print(f'TEXTURE {os.path.relpath(path, ROOT)} {os.path.getsize(path) / 1024:.1f} KB')


def weapon_surfaces(out_dir, size=256):
    """Baut die gemeinsamen Oberflächen nach out_dir/<name>/{col,arm,nor}.jpg."""
    import numpy as np
    grid_v = (np.arange(size) / size)[:, None] * np.ones((1, size))
    grid_u = (np.arange(size) / size)[None, :] * np.ones((size, 1))
    sets = {}

    # Abrieb (Waffenstahl, Gehäuse): feines Korn, leicht fleckige Farbe, Fingerabdrücke und Ölflecken
    # (glänzen mehr), dazu feine Kratzer, meist in Längsrichtung
    rng = np.random.default_rng(101)
    grain = _fbm(size, rng, 32, 3)
    mottle = _fbm(size, rng, 4, 4)
    smudge = _smoothstep(_fbm(size, rng, 3, 4), 0.5, 0.75)
    scr = _scratches(size, rng, 70)
    rough = (0.95 + (grain - 0.5) * 0.2 - smudge * 0.38) * (1 - scr * 0.42)
    col = 0.92 + (mottle - 0.5) * 0.16 - smudge * 0.04 + scr * 0.035
    sets['abnutzung'] = (col, rough, grain * 0.3 + mottle * 0.15 - _blur(scr) * 0.7, 2.4)

    # Gebürsteter Stahl: feine Längsstreifen, ein paar Kratzer quer
    rng = np.random.default_rng(102)
    streak = (_value_noise(size, 2, 128, rng) * 0.55 + _value_noise(size, 3, 64, rng) * 0.3
              + _value_noise(size, 6, 256, rng) * 0.15)
    streak = (streak - streak.min()) / (streak.max() - streak.min())
    smudge = _smoothstep(_fbm(size, rng, 3, 4), 0.55, 0.8)
    scr = _scratches(size, rng, 40, along_u=0.3)
    rough = (0.8 + streak * 0.2 - smudge * 0.15) * (1 - scr * 0.35)
    col = 0.93 + streak * 0.07
    sets['gebuerstet'] = (col, rough, streak * 0.5 - _blur(scr) * 0.6, 1.6)

    # Korn: mattierter Kunststoff, Gummi und Handschuh, mit Glanzstellen vom Anfassen
    rng = np.random.default_rng(103)
    fine = _value_noise(size, 96, 96, rng) * 0.6 + _value_noise(size, 48, 48, rng) * 0.4
    smudge = _smoothstep(_fbm(size, rng, 3, 4), 0.5, 0.78)
    mottle = _fbm(size, rng, 6, 3)
    rough = 0.95 + (fine - 0.5) * 0.12 - smudge * 0.18
    col = 0.95 + (mottle - 0.5) * 0.08 + (fine - 0.5) * 0.04
    sets['korn'] = (col, rough, fine, 1.4)

    # Holz: Maserung längs (u) mit dunklerem Spätholz und feinen Poren, lackiert
    rng = np.random.default_rng(104)
    warp = _fbm(size, rng, 3, 4)
    rings = 0.5 + 0.5 * np.sin(2 * math.pi * (11 * grid_v + 2.2 * warp))
    fibers = _value_noise(size, 2, 160, rng) * 0.6 + _value_noise(size, 4, 80, rng) * 0.4
    pores = _smoothstep(_value_noise(size, 12, 220, rng), 0.75, 0.95)
    late = _smoothstep(rings, 0.6, 0.98)
    col = 0.98 - late * 0.2 - (fibers - 0.5) * 0.2 - pores * 0.1 + (_fbm(size, rng, 2, 3) - 0.5) * 0.12
    rough = 0.9 + (fibers - 0.5) * 0.1 + pores * 0.1 - late * 0.05
    sets['holz'] = (col, rough, fibers * 0.4 + late * 0.3 - pores * 0.5, 1.2)

    # Narbung: dicht an dicht kleine Noppen (Schaft des Adler)
    rng = np.random.default_rng(105)
    bumps = _stipple_height(size, rng, 700, 4.2) + _value_noise(size, 48, 48, rng) * 0.12
    rough = 1.0 - np.clip(bumps, 0, 1) * 0.16
    col = 0.97 + (np.clip(bumps, 0, 1) - 0.5) * 0.05
    sets['narbung'] = (col, rough, bumps, 3.0)

    # Stoff: Leinwandbindung für die Ärmel, Faden über Faden
    rng = np.random.default_rng(106)
    n = 48
    wobble = (_value_noise(size, 6, 6, rng) - 0.5) * 0.3 / n
    across_u = np.abs(np.sin(math.pi * n * (grid_u + wobble)))
    across_v = np.abs(np.sin(math.pi * n * (grid_v + wobble)))
    warp_on_top = (np.floor(n * grid_u) + np.floor(n * grid_v)) % 2 == 0
    cloth = np.where(warp_on_top, across_u * np.sqrt(across_v), across_v * np.sqrt(across_u))
    mottle = _fbm(size, rng, 5, 3)
    rough = 0.96 - cloth * 0.08
    col = 0.9 + cloth * 0.06 + (mottle - 0.5) * 0.08
    sets['stoff'] = (col, rough, cloth + mottle * 0.2, 1.6)

    # rot: Maske für abgegriffene Kanten (im Spiel nur dort, wo eine Kante ist), fleckig
    rng = np.random.default_rng(107)
    wear = _fbm(size, rng, 6, 4)
    wear = (wear - wear.min()) / (wear.max() - wear.min())
    for name, (col, rough, height, strength) in sets.items():
        d = os.path.join(out_dir, name)
        save_jpeg(np.repeat(np.clip(col, 0, 1)[:, :, None], 3, axis=2), os.path.join(d, 'col.jpg'))
        arm = np.ones((size, size, 3))
        arm[:, :, 0] = wear
        arm[:, :, 1] = np.clip(rough, 0.3, 1.0)
        save_jpeg(arm, os.path.join(d, 'arm.jpg'))
        save_jpeg(_normal_from_height(height, strength), os.path.join(d, 'nor.jpg'))


def text_mesh(name, body, size, center, material, facing='-X', parent=None):
    """Schrift als flaches Mesh (z. B. eine Gravur auf dem Schlitten).
    facing='-X': Schrift liegt auf der linken Seite (liest sich von vorne nach hinten)."""
    cu = bpy.data.curves.new(name, type='FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 3
    tmp = bpy.data.objects.new(name + 'Tmp', cu)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    # Schriftebene (x lesen, y oben, z Normale) auf die gewünschte Seite drehen
    if facing == '-X':
        rot = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0)))
    else:
        rot = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))
    me.transform(rot.to_4x4())
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = Vector(center) - (_world_offset(parent) if parent else Vector((0, 0, 0)))
    if parent:
        o.parent = parent
    return o


def _world_offset(parent):
    off = Vector((0, 0, 0))
    p = parent
    while p is not None:
        off += p.location
        p = p.parent
    return off


# Textur-Koordinaten für alle Teile ohne eigene (Box-Projektion, siehe project_uv): tile = Meter pro
# Kachel, long = Achse, entlang der die Textur läuft (1 = Y, die Längsachse der Waffen). None = keine.
# Die Waffen setzen sie für die gemeinsamen Oberflächen im Spiel (src/weapons/surfaces.js).
AUTO_UV = {'tile': None, 'long': 1}
AXIS_INDEX = {'X': 0, 'Y': 1, 'Z': 2}


def _finish(name, bm, material, parent, origin, bevel, segs, angle, smooth, uv_tile=None, uv_long=None):
    origin = Vector(origin)
    if not uv_tile and AUTO_UV['tile']:
        uv_tile = AUTO_UV['tile']
        if uv_long is None:
            uv_long = AUTO_UV['long']
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
    return _finish(name, bm, material, parent, center, bevel, bsegs, 35, True, uv_long=AXIS_INDEX[axis])


def cyl_between(name, start, end, r1, r2, material, segs=20, bevel=0.002, parent=None):
    start, end = Vector(start), Vector(end)
    d = end - start
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    center = (start + end) / 2
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    long_axis = max(range(3), key=lambda i: abs(d[i]))
    return _finish(name, bm, material, parent, center, bevel, 2, 35, True, uv_long=long_axis)


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
    return _finish(name, bm, material, parent, center, bevel, 2, 35, True, uv_long=AXIS_INDEX[axis])


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
            parent=None, angle=35, uv_tile=None, uv_long=None):
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
    return _finish(name, bm, material, parent, origin, bevel, segs, angle, False, uv_tile, uv_long)


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
