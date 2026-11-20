# Model scriptlerinin ortak yardımcıları. Scriptler bunu `import ortak` ile kullanır.
# Koordinat: 1 birim = 1 m, ön yüz -Y (Three.js'te +Z, kameraya bakar), +Z yukarı, orijin yerde ortada.
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
GLB_DIR = ROOT / "client/public/models"
PNG_DIR = ROOT / "blender/onizleme"
BLEND_DIR = ROOT / "blender/kaynak"


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def mat(name, hexcol, metallic=0.0, rough=0.7, emission=0.0):
    """Ada göre tekil malzeme. Oyun malzemeyi ADINA göre tanır/boyar (README kontratı)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    col = hex_rgba(hexcol)
    m.diffuse_color = col  # Workbench önizleme rengi
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = col
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    if emission:
        p.inputs["Emission Color"].default_value = col
        p.inputs["Emission Strength"].default_value = emission
    return m


def kutu(bm, merkez, boyut, mat_idx=0, pah=0.0):
    """bm'e kutu ekler (boyut = tam en/derinlik/yükseklik). pah > 0 kenarları yumuşatır."""
    yeni = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=Vector(boyut), verts=yeni)
    bmesh.ops.translate(bm, vec=Vector(merkez), verts=yeni)
    yuzler = list({f for v in yeni for f in v.link_faces})
    for f in yuzler:
        f.material_index = mat_idx
    if pah:
        kenarlar = list({e for f in yuzler for e in f.edges})
        bmesh.ops.bevel(bm, geom=kenarlar, offset=pah, segments=2, affect="EDGES", profile=0.5)
    return yuzler


def nesne(name, bm, mats, origin=(0, 0, 0), smooth=False):
    """bm koordinatları dünya koordinatı; origin objenin pivotu olur."""
    bm.transform(Matrix.Translation(-Vector(origin)))
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = origin
    bpy.context.collection.objects.link(ob)
    return ob


def bos(name, konum, ebeveyn=None):
    """Boş nesne (empty): kodun bir şey bağlayacağı nokta (ör. oturma, tutamak)."""
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.1
    ob.location = konum
    bpy.context.collection.objects.link(ob)
    if ebeveyn:
        ob.parent = ebeveyn
        ob.location = Vector(konum) - ebeveyn.location
    return ob


def rapor(name, maks_ucgen):
    print(f"== {name}")
    toplam = 0
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        me = ob.data
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        toplam += n
        print(f"  {ob.name:12s} tris={n:5d} dims={tuple(round(d, 3) for d in ob.dimensions)} mats={[m.name for m in me.materials]}")
    print(f"  TOPLAM tris={toplam} (sınır {maks_ucgen})")
    assert toplam <= maks_ucgen, f"{name}: {toplam} üçgen > {maks_ucgen}"


def onizleme(name, aci=25):
    sc = bpy.context.scene
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for ob in sc.objects:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    merkez = (lo + hi) / 2
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max((hi - lo).z * 1.5, (hi - lo).x, (hi - lo).y) * 1.3
    d = Vector((math.sin(math.radians(aci)), -math.cos(math.radians(aci)), 0.45)).normalized()
    cam.location = merkez + d * 20
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_cavity = "STUDIO", "MATERIAL", False
    sh.background_type, sh.background_color = "VIEWPORT", (0.32, 0.33, 0.36)
    sc.render.resolution_x, sc.render.resolution_y = 600, 600
    sc.render.filepath = str(PNG_DIR / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def uret(modeller, maks_ucgen=3000):
    """modeller: {ad: kur_fonksiyonu}. Komut satırında ad verilirse yalnız onlar: blender -b -P x.py -- koltuk"""
    secili = (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []) or list(modeller)
    for d in (GLB_DIR, PNG_DIR, BLEND_DIR):
        d.mkdir(parents=True, exist_ok=True)
    for name in secili:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        modeller[name]()
        rapor(name, maks_ucgen)
        bpy.ops.export_scene.gltf(filepath=str(GLB_DIR / f"{name}.glb"), export_format="GLB",
                                  export_apply=True, export_cameras=False, export_lights=False)
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / f"{name}.blend"))
        onizleme(name)
