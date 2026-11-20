# Ev genci: iskeletli, animasyonlu low-poly kişi (eşofman, tişört, terlik), değiştirilebilir parçalarla.
# Çalıştır: model.cmd genc   (iskelet/Builder/bake: tiktok-live-convoy/blender/kisi.py'den alındı)
# Koordinat: 1 birim = 1 m, yüz -Y'ye bakar, +Z yukarı. Kalça kemiği başı oturma animasyonlarında orijinde.
# Animasyonlar: otur (2.4 s, yayılmış oturuş, etrafa bakınır), kaydir (1.2 s, telefona eğilmiş, başparmakla kaydırır),
#   uyu (3 s, başı geriye düşmüş), atistir (1.6 s, cipsten ağza), oyun (4 s, oynar, sonunda gamepad'i sarsar),
#   kpss (2.4 s, kitabın içindeki telefona bakar).
# Parçalar (hepsi `iskelet`e bağlı ayrı mesh; kod istemediğini gizler):
#   govde, sac_kisa | sac_daginik (yok = kel), sakal, sac_lider + sakal_lider (lider: yıllardır bakımsız),
#   eşyalar: telefon, cips, gamepad, kulaklik, kitap.
import math
import random
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
GLB_DIR = ROOT / "client/public/models"
PNG_DIR = ROOT / "blender/onizleme"
BLEND_DIR = ROOT / "blender/kaynak"
FPS = 30


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def mat(name, hexcol, rough=0.8, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    col = hex_rgba(hexcol)
    m.diffuse_color = col  # Workbench önizleme rengi
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = col
    p.inputs["Roughness"].default_value = rough
    if emission:  # oyunda ışıksız (Basic) çizilir: ekran parlak görünür
        p.inputs["Emission Color"].default_value = col
        p.inputs["Emission Strength"].default_value = emission
    return m


# ---------------------------------------------------------------- iskelet
# (ad, baş, kuyruk, ebeveyn); L = karakterin solu = +X
BONES = [
    ("hips", (0, 0, 0.92), (0, 0, 1.02), None),
    ("spine", (0, 0, 1.02), (0, 0, 1.18), "hips"),
    ("chest", (0, 0, 1.18), (0, 0, 1.40), "spine"),
    ("neck", (0, 0, 1.40), (0, 0, 1.48), "chest"),
    ("head", (0, 0, 1.48), (0, 0, 1.76), "neck"),
]
for side, s in (("L", 1), ("R", -1)):
    BONES += [
        (f"upper_arm_{side}", (s * 0.215, 0, 1.36), (s * 0.255, 0, 1.11), "chest"),
        (f"lower_arm_{side}", (s * 0.255, 0, 1.11), (s * 0.28, 0, 0.88), f"upper_arm_{side}"),
        (f"hand_{side}", (s * 0.28, 0, 0.88), (s * 0.29, 0, 0.79), f"lower_arm_{side}"),
        (f"thigh_{side}", (s * 0.095, 0, 0.88), (s * 0.10, 0, 0.49), "hips"),
        (f"shin_{side}", (s * 0.10, 0, 0.49), (s * 0.10, 0, 0.09), f"thigh_{side}"),
        (f"foot_{side}", (s * 0.10, 0, 0.09), (s * 0.10, -0.13, 0.03), f"shin_{side}"),
    ]
BONE_NAMES = [b[0] for b in BONES]
HEAD = {b[0]: Vector(b[1]) for b in BONES}
TAIL = {b[0]: Vector(b[2]) for b in BONES}
HC = Vector((0, -0.01, 1.585))  # kafa merkezi


def build_armature():
    arm = bpy.data.armatures.new("iskelet")
    ob = bpy.data.objects.new("iskelet", arm)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for name, h, t, parent in BONES:
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail, eb.roll = h, t, 0
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ---------------------------------------------------------------- mesh yardımcıları
MATS = {}
GROUP = {n: i for i, n in enumerate(BONE_NAMES)}


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.yon = []  # (yüz, merkez, işaret): açık kabuklar için normal yönü (+1 merkezden dışa)
        self.tf = None  # verilirse noktalar bununla dönüştürülür (pozlu uzay -> dinlenme uzayı, bkz. pozlu)

    def vert(self, co, bone):
        v = self.bm.verts.new(self.tf @ Vector(co) if self.tf else co)
        for b, w in (bone.items() if isinstance(bone, dict) else ((bone, 1.0),)):
            v[self.dl][GROUP[b]] = w
        return v

    def face(self, vs, m):
        f = self.bm.faces.new(vs)
        f.material_index = list(MATS).index(m)
        return f

    def tube(self, a, b, prof, sides, m, bone, cap0=True, cap1=True, rot=None):
        """a->b ekseninde halkalar. prof: [(t, rx, ry)], r=0 tek tepe noktası. rx ~X, ry ~Y/Z yönü."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        ref = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
        u = (ref - d * ref.dot(d)).normalized()
        w = d.cross(u)
        rot = math.pi / sides if rot is None else rot
        rings = []
        for t, rx, ry in prof:
            c = a + (b - a) * t
            bones = bone(t) if callable(bone) else bone
            if rx == 0:
                rings.append([self.vert(c, bones)])
            else:
                rings.append([self.vert(c + u * rx * math.cos(rot + 2 * math.pi * i / sides)
                                        + w * ry * math.sin(rot + 2 * math.pi * i / sides), bones)
                              for i in range(sides)])
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(sides):
                j = (i + 1) % sides
                if len(r0) == 1:
                    self.face((r0[0], r1[j], r1[i]), m)
                elif len(r1) == 1:
                    self.face((r0[i], r0[j], r1[0]), m)
                else:
                    self.face((r0[i], r0[j], r1[j], r1[i]), m)
        if cap0 and len(rings[0]) > 1:
            self.face(list(reversed(rings[0])), m)
        if cap1 and len(rings[-1]) > 1:
            self.face(rings[-1], m)

    def ball(self, c, rx, ry, rz, sides, rings, m, bone, rot=None, kure=False):
        prof = []
        for k in range(rings + 1):
            a = math.pi * k / rings
            prof.append(((1 - math.cos(a)) / 2 if kure else k / rings, rx * math.sin(a), ry * math.sin(a)))
        c = Vector(c)
        self.tube(c - Vector((0, 0, rz)), c + Vector((0, 0, rz)), prof, sides, m, bone, rot=rot)

    def box(self, lo, hi, m, bone, taper_front=0.0):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        vs = [self.vert((x, y, z - (taper_front if (y == y0 and z == z1) else 0)), bone)
              for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([vs[i] for i in q], m)

    def obox(self, c, ax, m, bone):
        """Yönlü kutu: c merkez, ax = (a, b, d) yarı-eksen vektörleri."""
        c, (a, b, d) = Vector(c), (Vector(x) for x in ax)
        vs = [self.vert(c + a * sa + b * sb + d * sd, bone) for sd in (-1, 1) for sb in (-1, 1) for sa in (-1, 1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([vs[i] for i in q], m)

    def kabuk(self, c, rings, azs, m, bone, keep=None, ic=None, tf=None, kapali=True):
        """Açık kabuk (saç, şapka). rings: alttan üste [(z, rx, ry, dy)], rx=0 -> kutup.
        azs: derece, -90 = ön (-Y), 0 = +X. keep(zorta, f) -> yüz kalsın mı (f: önden açı farkı, 0..180).
        ic(zorta, f) -> içe bakan ikinci kat da olsun mu (Three tek yüz çizer, içi görünen yerler).
        tf: yerel -> c etrafında dönüş matrisi."""
        c = Vector(c)
        tf = tf or Matrix.Identity(3)
        n = len(azs)

        def ring(z, rx, ry, dy, olcek):
            if rx == 0:
                return [self.vert(c + tf @ Vector((0, dy, z)), bone)]
            return [self.vert(c + tf @ Vector((rx * olcek * math.cos(math.radians(a)),
                                               dy + ry * olcek * math.sin(math.radians(a)), z)), bone) for a in azs]

        dis = [ring(*r, 1.0) for r in rings]
        ici = [ring(*r, 0.96) for r in rings] if ic else None
        top = n if kapali else n - 1
        for k in range(len(rings) - 1):
            zm = (rings[k][0] + rings[k + 1][0]) / 2
            for i in range(top):
                j = (i + 1) % n
                am = math.radians(azs[i]) + (((azs[j] - azs[i]) % 360) / 2) * math.pi / 180
                f = abs(math.degrees(math.atan2(math.sin(am + math.pi / 2), math.cos(am + math.pi / 2))))
                if keep and not keep(zm, f):
                    continue
                for lst, isaret in ((dis, 1), (ici, -1)):
                    if lst is None or (isaret < 0 and not ic(zm, f)):
                        continue
                    r0, r1 = lst[k], lst[k + 1]
                    if len(r1) == 1:
                        vs = (r0[i], r0[j], r1[0])
                    elif len(r0) == 1:
                        vs = (r0[0], r1[j], r1[i])
                    else:
                        vs = (r0[i], r0[j], r1[j], r1[i])
                    self.yon.append((self.face(vs, m), c + tf @ Vector((0, 0, zm * 0.3)), isaret))
        for lst in (dis, ici):  # kullanılmayan noktaları sil
            for r in lst or ():
                for v in r:
                    if not v.link_faces:
                        self.bm.verts.remove(v)

    def serit(self, pts, ax, mats, bone, kapali=False):
        """Dikdörtgen kesitli şerit (atkı). pts: merkezler, ax: her nokta için (a, b) yarı-eksen vektörleri.
        Her parça sırayla mats[k % len(mats)] (çizgili)."""
        rs = []
        for p, (a, b) in zip(pts, ax):
            p = Vector(p)
            bn = bone(p) if callable(bone) else bone
            rs.append([self.vert(p + a * sa + b * sb, bn) for sa, sb in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
        segs = len(rs) if kapali else len(rs) - 1
        for k in range(segs):
            r0, r1 = rs[k], rs[(k + 1) % len(rs)]
            for i in range(4):
                j = (i + 1) % 4
                self.face((r0[i], r0[j], r1[j], r1[i]), mats[k % len(mats)])
        if not kapali:
            self.face(list(reversed(rs[0])), mats[0])
            self.face(rs[-1], mats[(segs - 1) % len(mats)])


def on_aci(zorta, f, sinir):
    """Saç alın/yüz açıklığı: sinir = [(f_eşik, z_alt)] -> f < f_eşik ise z > z_alt olanlar kalır."""
    for fe, za in sinir:
        if f < fe:
            return zorta > za
    return True


def poz(**kw):
    """Ara poz: verilmeyen kemikler 0. Bacak/kol anahtarları iki tarafa: thigh=(..) -> thigh_L/R."""
    P = {b: (0, 0, 0) for b in BONE_NAMES}
    P["loc"] = (0, 0, 0)
    for k, v in kw.items():
        if k in P:
            P[k] = v
        else:
            P[f"{k}_L"] = P[f"{k}_R"] = v
    return P


def ayna(P):
    """L koluna verilen Y/Z dönüşlerini R için aynala."""
    for b in ("upper_arm", "lower_arm"):
        x, y, z = P[f"{b}_L"]
        P[f"{b}_R"] = (x, -y, -z)
    return P


def anahtarlar(keys):
    """[(p, poz)] arasında yumuşak (smoothstep) geçiş; uçlar tam olarak verilen pozlar."""
    def fn(p):
        for (p0, A), (p1, B) in zip(keys, keys[1:]):
            if p <= p1 + 1e-9:
                t = min(max((p - p0) / (p1 - p0), 0.0), 1.0)
                t = t * t * (3 - 2 * t)
                return {k: tuple(a + (b - a) * t for a, b in zip(A[k], B[k])) for k in A}
    return fn

def bake(arm_ob, name, fn, n, loop=True):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm_ob.animation_data_create().action = act
    rest = {b.name: b.matrix_local.to_3x3() for b in arm_ob.data.bones}
    prev = {}
    for f in range(n + 1):
        P = fn((f % n) / n if loop else f / n)
        for bn in BONE_NAMES:
            pb = arm_ob.pose.bones[bn]
            pb.rotation_mode = "QUATERNION"
            M = rest[bn]
            R = Euler([math.radians(a) for a in P[bn]], "XYZ").to_matrix()
            q = (M.inverted() @ R @ M).to_quaternion()
            if bn in prev and prev[bn].dot(q) < 0:
                q.negate()
            prev[bn] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.location = M.inverted() @ Vector(P["loc"]) if bn == "hips" else (0, 0, 0)
            pb.keyframe_insert("location", frame=f)
    return act


def onizle(arm_ob, act, frame, gorunur, path, res=(400, 600), az=30, el=17, kutu=None):
    """Workbench ortografik önizleme. kutu verilirse kamera o noktalara göre (sabit) kurulur."""
    sc = bpy.context.scene
    ad = arm_ob.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    ad.action = act
    for ob in sc.objects:
        if ob.type == "MESH" and ob.name in PARCALAR:
            ob.hide_render = ob.name not in gorunur
    sc.frame_set(frame)
    d = Vector((math.sin(math.radians(az)) * math.cos(math.radians(el)), -math.cos(math.radians(az)) * math.cos(math.radians(el)),
                math.sin(math.radians(el))))
    rot = (-d).to_track_quat("-Z", "Y")
    pts = kutu if kutu is not None else noktalar(gorunur)
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    xs, ys = [p.dot(right) for p in pts], [p.dot(up) for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    center = right * cx + up * cy + d * (sum(p.dot(d) for p in pts) / len(pts))
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.data.type = "ORTHO"
        sc.camera = cam
        sc.render.engine = "BLENDER_WORKBENCH"
        sh = sc.display.shading
        sh.light, sh.color_type, sh.show_cavity = "STUDIO", "TEXTURE", False
        sh.show_backface_culling = True  # Three de tek yüz çizer
        sh.background_type = "VIEWPORT"
        sh.background_color = (0.32, 0.33, 0.36)
        sc.render.resolution_percentage = 100
    w, h = res
    sc.render.resolution_x, sc.render.resolution_y = w, h
    span = max((max(ys) - min(ys)), (max(xs) - min(xs)) * h / w) * 1.12
    cam.data.ortho_scale = span * max(w, h) / h
    cam.location = center + d * 10
    cam.rotation_euler = rot.to_euler()
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def noktalar(gorunur):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH" and ob.name in gorunur:
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            pts += [ev.matrix_world @ v.co for v in me.vertices]
            ev.to_mesh_clear()
    return pts


def yan_yana(paths, out):
    arrs = []
    for p in paths:
        im = bpy.data.images.load(str(p))
        a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        arrs.append(a.reshape(im.size[1], im.size[0], 4))
        bpy.data.images.remove(im)
    a = np.concatenate(arrs, axis=1)
    im = bpy.data.images.new("yan_yana", a.shape[1], a.shape[0], alpha=True)
    im.pixels.foreach_set(a.ravel())
    im.filepath_raw = str(out)
    im.file_format = "PNG"
    im.save()


# ---------------------------------------------------------------- gövde (ev genci: göbek, tişört, eşofman, terlik)
def torso(B):
    """Tişörtlü gövde, önde göbek. i=8 ön orta (-Y), i=0 arka orta."""
    sides = 16
    rings = [(0.90, 0.178, 0.13, "hips"), (1.02, 0.18, 0.13, "spine"), (1.12, 0.182, 0.13, "spine"),
             (1.24, 0.19, 0.128, "chest"), (1.34, 0.18, 0.12, "chest"), (1.40, 0.15, 0.1, "chest"), (1.425, 0.08, 0.07, "chest")]
    gobek = {1.02: {6: 0.03, 7: 0.06, 8: 0.07, 9: 0.06, 10: 0.03}, 1.12: {6: 0.03, 7: 0.065, 8: 0.075, 9: 0.065, 10: 0.03},
             1.24: {7: 0.02, 8: 0.025, 9: 0.02}}
    vs = []
    for z, rx, ry, bone in rings:
        g = gobek.get(z, {})
        vs.append([B.vert((-rx * math.sin(2 * math.pi * i / sides), ry * math.cos(2 * math.pi * i / sides) - g.get(i, 0), z), bone)
                   for i in range(sides)])
    for k in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            B.face((vs[k][j], vs[k][i], vs[k + 1][i], vs[k + 1][j]), "ust")
    B.face(list(reversed(vs[-1])), "ust")


def govde(B):
    hc = HC
    B.ball(hc, 0.155, 0.15, 0.165, 10, 7, "ten", "head", kure=True)
    for s in (1, -1):
        B.box((s * 0.055 - 0.02, hc.y - 0.158, hc.z + 0.005), (s * 0.055 + 0.02, hc.y - 0.135, hc.z + 0.024), "sac", "head")  # uykulu göz
        B.box((s * 0.055 - 0.022, hc.y - 0.15, hc.z - 0.012), (s * 0.055 + 0.022, hc.y - 0.13, hc.z + 0.0), "torba", "head")  # göz altı torbası
        B.box((s * 0.15, hc.y - 0.02, hc.z - 0.045), (s * 0.15 + s * 0.03, hc.y + 0.03, hc.z + 0.03), "ten", "head")  # kulak
    B.box((-0.03, hc.y - 0.14, hc.z - 0.08), (0.03, hc.y - 0.115, hc.z - 0.068), "sac", "head")  # ağız
    B.box((-0.018, hc.y - 0.175, hc.z - 0.045), (0.018, hc.y - 0.14, hc.z + 0.0), "ten", "head", taper_front=0.02)  # burun
    B.tube((0, 0, 1.36), (0, 0, 1.47), [(0, 0.058, 0.053), (1, 0.052, 0.047)], 8, "ten", "neck")
    torso(B)
    B.tube((0, 0, 0.82), (0, 0, 0.95), [(0, 0.182, 0.13), (1, 0.18, 0.13)], 12, "alt", "hips")  # eşofman bel
    for side, s in (("L", 1), ("R", -1)):
        th, sh, ft = f"thigh_{side}", f"shin_{side}", f"foot_{side}"
        B.tube((s * 0.095, 0, 0.90), (s * 0.10, 0, 0.47), [(0, 0.092, 0.097), (1, 0.075, 0.078)], 8, "alt", th)
        B.tube((s * 0.10, 0, 0.50), (s * 0.10, 0, 0.12), [(0, 0.074, 0.076), (0.8, 0.068, 0.07), (1, 0.05, 0.052)], 8, "alt", sh)
        B.tube((s * 0.10, 0, 0.13), (s * 0.10, 0, 0.05), [(0, 0.046, 0.048), (1, 0.044, 0.046)], 8, "corap", sh)
        B.box((s * 0.10 - 0.045, -0.13, 0.02), (s * 0.10 + 0.045, 0.05, 0.075), "corap", ft, taper_front=0.03)  # beyaz çoraplı ayak
        B.box((s * 0.10 - 0.058, -0.17, 0.0), (s * 0.10 + 0.058, 0.07, 0.022), "terlik", ft)  # terlik tabanı
        B.box((s * 0.10 - 0.06, -0.12, 0.02), (s * 0.10 + 0.06, -0.06, 0.085), "terlik", ft)  # terlik bandı
        ua, la, hd = f"upper_arm_{side}", f"lower_arm_{side}", f"hand_{side}"
        a, b = HEAD[ua], TAIL[ua]
        B.ball(a + Vector((0, 0, -0.01)), 0.078, 0.078, 0.072, 8, 4, "ust", ua)
        B.tube(a, a.lerp(b, 0.55), [(0, 0.074, 0.074), (1, 0.068, 0.068)], 8, "ust", ua)  # bol tişört kolu
        B.tube(a.lerp(b, 0.45), b, [(0, 0.046, 0.046), (1, 0.042, 0.042)], 8, "ten", ua)
        B.tube(b, TAIL[la], [(0, 0.042, 0.042), (1, 0.036, 0.036)], 8, "ten", la)
        B.ball(HEAD[hd].lerp(TAIL[hd], 0.5), 0.048, 0.045, 0.05, 6, 4, "ten", hd)


# ---------------------------------------------------------------- saç/sakal (malzeme `sac`)
AZ12 = [-90 + 30 * j for j in range(12)]
AZ16 = [-90 + 22.5 * j for j in range(16)]


def yeni_noktalar(B, fn):
    once = set(B.bm.verts)
    fn()
    return [v for v in B.bm.verts if v not in once]


def agirlik(B, v, w):
    """Noktayı head (1-w) ile chest (w) arasında paylaştır: uzun saç/sakal gövdeyle birlikte sallanır."""
    d = v[B.dl]
    d.clear()
    w = min(max(w, 0.0), 1.0)
    if w < 1:
        d[GROUP["head"]] = 1 - w
    if w > 0:
        d[GROUP["chest"]] = w


def sac_kisa(B):
    B.kabuk(HC, [(-0.045, 0.165, 0.16, 0.006), (0.045, 0.167, 0.162, 0), (0.115, 0.132, 0.128, 0),
                 (0.162, 0.072, 0.07, 0), (0.175, 0, 0, 0)], AZ12, "sac", "head",
            keep=lambda z, f: on_aci(z, f, [(40, 0.07), (70, 0.0)]))


def sac_daginik(B):
    """Yastıktan yeni kalkmış: kısa kabuk + her yöne dikilen tutamlar."""
    sac_kisa(B)
    rnd = random.Random(7)
    for el, az in ((85, 0), (60, -100), (60, -60), (60, -150), (60, 20), (60, 120), (55, 70), (35, -40), (35, -140), (30, 170), (40, 40), (70, 200)):
        e, a = math.radians(el), math.radians(az)
        r = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        base = HC + Vector((r.x * 0.158, r.y * 0.152, r.z * 0.168))
        d = (r + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0.4))).normalized()
        B.tube(base - d * 0.01, base + d * rnd.uniform(0.05, 0.08), [(0, 0.04, 0.035), (1, 0, 0)], 4, "sac", "head", cap0=False)


def sakal(B):
    """Kirli/kısa sakal + bıyık."""
    rings = []
    for dz in (-0.178, -0.16, -0.13, -0.09, -0.05, 0.0):
        k = math.sqrt(max(0.0, 1 - (dz / 0.178) ** 2))
        rings.append((dz, 0.166 * k, 0.161 * k, 0) if dz > -0.178 else (dz, 0, 0, 0))
    azs = [-185 + 190 * j / 8 for j in range(9)]
    B.kabuk(HC, rings, azs, "sac", "head", kapali=False,
            keep=lambda z, f: f < 100 and (z < -0.1 if f < 35 else z < -0.06 if f < 62 else True))
    B.box((-0.045, HC.y - 0.156, HC.z - 0.066), (0.045, HC.y - 0.13, HC.z - 0.05), "sac", "head")


def sac_lider(B):
    """Yıllardır kesilmemiş saç: tepeden belin ortasına iner, uçları dağınık ve kırık."""
    alt = -0.68
    rings = [(alt, 0.18, 0.1, 0.17), (-0.52, 0.22, 0.12, 0.15), (-0.34, 0.23, 0.14, 0.11), (-0.18, 0.2, 0.17, 0.045),
             (-0.1, 0.185, 0.172, 0.02), (-0.04, 0.175, 0.168, 0.006), (0.04, 0.176, 0.17, 0), (0.115, 0.146, 0.14, 0),
             (0.16, 0.1, 0.096, 0), (0.18, 0, 0, 0)]
    yeni = yeni_noktalar(B, lambda: B.kabuk(HC, rings, AZ16, "sac", "head", ic=lambda z, f: z < 0.0,
                                            keep=lambda z, f: on_aci(z, f, [(45, 0.075), (78, -0.07)])))
    rnd = random.Random(3)
    for v in yeni:
        dz = v.co.z - HC.z
        if dz < -0.1:  # aşağı indikçe daha karmakarışık
            k = min(1.0, (-dz - 0.1) / 0.4)
            v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-0.5, 1), rnd.uniform(-1, 1))) * 0.025 * k
        if abs(dz - alt) < 0.03:
            v.co.z -= rnd.uniform(0.0, 0.14)  # kırık, eşit olmayan uçlar
        agirlik(B, v, (-dz - 0.12) / 0.3)
    # yanlardan ve arkadan sarkan tutamlar
    for az in (-140, -40, 20, 160, 200, 250, 290, 340):
        a = math.radians(az)
        base = HC + Vector((math.cos(a) * 0.17, math.sin(a) * 0.16 + 0.05, -0.05))
        uc = base + Vector((math.cos(a) * 0.05, 0.05, -rnd.uniform(0.35, 0.6)))
        ns = yeni_noktalar(B, lambda: B.tube(base, uc, [(0, 0.035, 0.03), (0.6, 0.03, 0.025), (1, 0, 0)], 5, "sac", "head", cap0=False))
        for v in ns:
            agirlik(B, v, (HC.z - 0.12 - v.co.z) / 0.3)


def sakal_lider(B):
    """Göbeğe kadar inen, hiç taranmamış sakal + sarkık pala bıyık."""
    sakal(B)
    rnd = random.Random(11)
    a, b = HC + Vector((0, -0.105, -0.15)), Vector((0, -0.25, 0.96))
    prof = [(0, 0.15, 0.07), (0.12, 0.155, 0.085), (0.35, 0.14, 0.08), (0.6, 0.11, 0.065), (0.85, 0.07, 0.045), (1, 0.015, 0.015)]
    yeni = yeni_noktalar(B, lambda: B.tube(a, b, prof, 10, "sac", "head"))
    for v in yeni:
        t = (a.z - v.co.z) / (a.z - b.z)
        if t > 0.08:
            v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.02 * min(1.0, t * 2)
        agirlik(B, v, (t - 0.15) / 0.4)
    for x in (-0.11, -0.05, 0.03, 0.09):  # alttan sarkan tutamlar
        u = b + Vector((x, 0.03, 0.18))
        ns = yeni_noktalar(B, lambda: B.tube(u, u + Vector((x * 0.3, -0.02, -rnd.uniform(0.12, 0.22))),
                                             [(0, 0.03, 0.025), (1, 0, 0)], 4, "sac", "head", cap0=False))
        for v in ns:
            agirlik(B, v, 1.0)
    for s in (1, -1):  # pala bıyık: ağzın iki yanından aşağı sarkar
        p0 = HC + Vector((s * 0.025, -0.15, -0.055))
        B.tube(p0, p0 + Vector((s * 0.06, -0.01, -0.09)), [(0, 0.028, 0.02), (0.5, 0.025, 0.018), (1, 0, 0)], 5, "sac", "head")


def telefon(B):
    """Sağ elin avucunda; ekran avuçtan dışa (+X) bakar. `ekran` ışık saçar."""
    x0, x1, y0, y1, z0, z1 = -0.245, -0.233, -0.04, 0.035, 0.74, 0.895
    B.box((x0, y0, z0), (x1, y1, z1), "telefon", "hand_R")
    e = 0.004
    vs = [B.vert((x1 + 0.0008, y, z), "hand_R") for y, z in ((y0 + e, z0 + e), (y1 - e, z0 + e), (y1 - e, z1 - e), (y0 + e, z1 - e))]
    B.yon.append((B.face(vs, "ekran"), Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), 1))


# Eldeki eşyalar animasyonun 0. karesindeki POZLU konumda kurulur (POZ, bkz. pozlu), sonra kemiğin dinlenme uzayına taşınır.
POZ = {}


def pozlu(arm_ob, act, frame=0):
    """act'in frame karesi: kemik -> (pozlu uzay -> dinlenme uzayı matrisi), kemik -> (pozlu baş, pozlu kuyruk)."""
    arm_ob.animation_data.action = act
    bpy.context.scene.frame_set(frame)
    pbs = arm_ob.pose.bones
    return ({pb.name: pb.bone.matrix_local @ pb.matrix.inverted() for pb in pbs},
            {pb.name: (pb.head.copy(), pb.tail.copy()) for pb in pbs})


def el(k, side):
    h, t = k[f"hand_{side}"]
    return h.lerp(t, 0.5)


def dik(v, *eksenler):
    """v'nin verilen birim eksenlere dik birim bileşeni."""
    v = Vector(v)
    for e in eksenler:
        v -= e * v.dot(e)
    return v.normalized()


def cips(B):
    """Sol elde, göbekte duran cips paketi."""
    tf, k = POZ["atistir"]
    B.tf = tf["hand_L"]
    c = el(k, "L") + Vector((0, -0.03, 0.06))
    z = Vector((0, 0, 1))
    B.tube(c - z * 0.1, c + z * 0.08, [(0, 0.07, 0.02), (0.12, 0.078, 0.042), (0.85, 0.078, 0.042), (1, 0.072, 0.015)], 8, "cips", "hand_L")
    B.tube(c + z * 0.08, c + z * 0.11, [(0, 0.072, 0.015), (1, 0.074, 0.008)], 8, "cips_bant", "hand_L")


def gamepad(B):
    """İki elin arasında; sağ ele bağlı (oyun animasyonunda eller birlikte hareket eder)."""
    tf, k = POZ["oyun"]
    B.tf = tf["hand_R"]
    l, r = el(k, "L"), el(k, "R")
    c = (l + r) / 2
    x = (l - r).normalized()
    n = dik(k["head"][0] - c, x)          # yüzü oyuncuya bakar
    y = dik((0, -1, 0), x, n)             # oyuncudan uzağa
    w = max(0.17, (l - r).length + 0.03)
    print(f"  gamepad: eller arasi {(l - r).length:.3f} m")
    B.obox(c, (x * w / 2, y * 0.045, n * 0.022), "gamepad", "hand_R")
    for s in (1, -1):  # tutamaklar oyuncuya doğru
        B.obox(c + x * s * (w / 2 - 0.03) - y * 0.05 - n * 0.006, (x * 0.028, y * 0.04, n * 0.02), "gamepad", "hand_R")
        B.obox(c + x * s * w * 0.22 + n * 0.024, (x * 0.012, y * 0.012, n * 0.006), "dugme" if s > 0 else "ekran", "hand_R")


def kulaklik(B):
    """Oyuncu kulaklığı: kafa bandı + kulaklar, dış yüzde ışıklı halka."""
    pts, ax = [], []
    for j in range(11):
        t = math.radians(-82 + 164 * j / 10)
        rad = Vector((math.sin(t), 0, math.cos(t)))
        pts.append(HC + Vector((rad.x * 0.192, 0.01, rad.z * 0.2)))
        ax.append((Vector((0, 0.02, 0)), rad * 0.008))
    B.serit(pts, ax, ["kulaklik"], "head")
    for s in (1, -1):
        c = HC + Vector((s * 0.19, 0.01, -0.02))
        B.ball(c, 0.032, 0.052, 0.058, 8, 4, "kulaklik", "head")
        B.obox(c + Vector((s * 0.033, 0, 0)), (Vector((0.004, 0, 0)), Vector((0, 0.03, 0)), Vector((0, 0, 0.034))), "ekran", "head")


def kitap(B):
    """KPSS kitabı: sol elde, açık, telefonun hemen arkasında (telefon kitabın içinde)."""
    tf, k = POZ["kpss"]
    B.tf = tf["hand_L"]
    tel = tf["hand_R"].inverted() @ Vector((-0.239, -0.0025, 0.8175))  # telefonun pozlu konumu
    c = (tel + el(k, "L")) / 2              # sol el sol kapakta, telefon sağ sayfada
    n = dik(k["head"][0] - c)
    x = dik((1, 0, 0), n)
    y = n.cross(x)
    c -= n * 0.03
    print(f"  kitap: sol el kitaba {(el(k, 'L') - c).length:.3f} m")
    B.obox(c, (x * 0.15, y * 0.105, n * 0.006), "kitap", "hand_L")
    for s in (1, -1):
        B.obox(c + x * s * 0.073 + n * 0.012, (x * 0.07, y * 0.098, n * 0.007), "sayfa", "hand_L")


PARCALAR = {"govde": govde, "sac_kisa": sac_kisa, "sac_daginik": sac_daginik, "sakal": sakal,
            "sac_lider": sac_lider, "sakal_lider": sakal_lider, "telefon": telefon,
            "cips": cips, "gamepad": gamepad, "kulaklik": kulaklik, "kitap": kitap}
RENKLER = {"ten": "#E0B48C", "sac": "#2E1E14", "ust": "#5B6B7A", "alt": "#55575C", "corap": "#EDEDED",
           "terlik": "#2D5BD0", "torba": "#C8977A", "telefon": "#16161A", "cips": "#E8A317", "cips_bant": "#C8282A",
           "gamepad": "#1E1F24", "dugme": "#E04848", "kulaklik": "#18181C", "kitap": "#2E6FB8", "sayfa": "#F2EEE2"}


def build_parts(arm_ob):
    for name, col in RENKLER.items():
        MATS[name] = mat(name, col)
    MATS["ekran"] = mat("ekran", "#8FD8FF", emission=1.5)
    for name, fn in PARCALAR.items():
        B = Builder()
        fn(B)
        bmesh.ops.recalc_face_normals(B.bm, faces=B.bm.faces)
        for f, c, isaret in B.yon:
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - c) * isaret < 0:
                f.normal_flip()
        me = bpy.data.meshes.new(name)
        B.bm.to_mesh(me)
        B.bm.free()
        for m in MATS.values():
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        for n in BONE_NAMES:
            ob.vertex_groups.new(name=n)
        ob.parent = arm_ob
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_ob


# ---------------------------------------------------------------- animasyon
# Poz: kemik -> (rx, ry, rz) derece, dinlenme pozundaki DÜNYA eksenleri etrafında (XYZ sırası).
# Aşağı bakan uzuv: -X öne (-Y) kaldırır. Yukarı bakan kemik (omurga/baş): +X öne eğer.

def oturus(P):
    """Yayılmış oturuş: dizler açık, kalça orijinde."""
    for side, sg in (("L", 1), ("R", -1)):
        P[f"thigh_{side}"] = (-84, 0, sg * 14)
        P[f"shin_{side}"] = (82, 0, 0)
        P[f"foot_{side}"] = (4, 0, 0)
    P["loc"] = (0, 0, -HEAD["hips"].z)
    return P


def poz_otur(p):
    s = math.sin(2 * math.pi * p)
    P = oturus(poz())
    P["spine"] = (-16 + 1.5 * s, 0, 0)          # arkaya yaslanmış
    P["chest"] = (10, 0, 0)                     # kambur omuzlar
    P["neck"] = (14, 0, 0)
    P["head"] = (-6, 0, 22 * math.sin(2 * math.pi * p) ** 3)  # sıkılmış, etrafa bakınır
    P["upper_arm_L"] = (-22, -16, 0)            # kollar kolçakta
    P["lower_arm_L"] = (-48, 0, 0)
    return ayna(P)


def poz_kaydir(p):
    tik = max(0.0, math.sin(2 * math.pi * p * 2)) ** 6  # döngüde iki kez başparmakla kaydırma
    P = oturus(poz())
    P["spine"] = (-12, 0, 0)
    P["chest"] = (14, 0, 0)
    P["neck"] = (24, 0, 0)
    P["head"] = (16 + 2 * tik, 0, 0)            # ekrana gömülmüş
    P["upper_arm_L"] = (-14, -10, 0)            # sol el göbekte
    P["lower_arm_L"] = (-72, 0, -40)
    P["upper_arm_R"] = (-34, -22, 0)
    P["lower_arm_R"] = (-92, 0, 38)
    P["hand_R"] = (0, 0, -70 + 10 * tik)
    return P


def poz_uyu(p):
    s = math.sin(2 * math.pi * p)               # yavaş nefes
    P = oturus(poz())
    for side, sg in (("L", 1), ("R", -1)):
        P[f"thigh_{side}"] = (-80, 0, sg * 22)  # iyice yayılmış
    P["spine"] = (-26 + 2 * s, 0, 0)
    P["chest"] = (4 + s, 0, 0)
    P["neck"] = (-6, 0, 0)
    P["head"] = (-26 + 2 * s, 16, 6)            # başı geriye ve yana düşmüş
    P["upper_arm_L"] = (-8, -6, 0)              # kollar iki yana sarkmış
    P["lower_arm_L"] = (-16, 0, 0)
    return ayna(P)


def atistir_taban(sag):
    P = oturus(poz())
    P["spine"] = (-14, 0, 0)
    P["chest"] = (10, 0, 0)
    P["neck"] = (12, 0, 0)
    P["upper_arm_L"] = (-14, -10, 0)            # sol el cipsi göbekte tutar
    P["lower_arm_L"] = (-72, 0, -40)
    P["upper_arm_R"], P["lower_arm_R"] = sag
    return P


PAKET, AGIZ = ((-14, 14, 0), (-80, 0, 50)), ((-46, -14, 0), (-128, 0, 30))  # sağ el: pakette / ağızda
ATISTIR = anahtarlar([(0, atistir_taban(PAKET)), (0.3, atistir_taban(AGIZ)), (0.45, atistir_taban(AGIZ)),
                      (0.8, atistir_taban(PAKET)), (1, atistir_taban(PAKET))])


def poz_atistir(p):
    P = ATISTIR(p)
    P["head"] = (4 + 4 * max(0.0, math.sin(2 * math.pi * p * 4)), 0, 0)  # çiğner
    return P


def poz_oyun(p):
    e = min(max((p - 0.66) / 0.06, 0.0), 1.0) * min(max((1 - p) / 0.06, 0.0), 1.0)  # son üçte bir: öfke krizi
    e = e * e * (3 - 2 * e)
    sars = math.sin(2 * math.pi * p * 30) * 16 * e
    tik = max(0.0, math.sin(2 * math.pi * p * 12)) ** 4
    P = oturus(poz())
    P["spine"] = (-2 - 10 * e, 0, 0)            # ekrana eğilmiş, krizde geri savrulur
    P["chest"] = (16, 0, 0)
    P["neck"] = (16 - 10 * e, 0, 0)
    P["head"] = (6 - 24 * e, 0, 8 * math.sin(2 * math.pi * p * 15) * e)
    P["upper_arm_L"] = (-34 + sars, 22, 0)
    P["lower_arm_L"] = (-92 + sars * 0.6, 0, -38)
    P = ayna(P)
    P["hand_L"] = P["hand_R"] = (-4 * tik, 0, 0)
    return P


def poz_kpss(p):
    P = poz_kaydir(p)
    P["upper_arm_L"] = (-34, 22, 0)             # sol el kitabı telefonun arkasında tutar
    P["lower_arm_L"] = (-92, 0, -38)
    return P


# ad: (poz fonksiyonu, kare sayısı)
ANIMS = {"otur": (poz_otur, 72), "kaydir": (poz_kaydir, 36), "uyu": (poz_uyu, 90), "atistir": (poz_atistir, 48),
         "oyun": (poz_oyun, 120), "kpss": (poz_kpss, 72)}


def build():
    sc = bpy.context.scene
    sc.render.fps = FPS
    arm_ob = build_armature()
    acts = {name: bake(arm_ob, name, fn, n) for name, (fn, n) in ANIMS.items()}
    for name in ("atistir", "oyun", "kpss"):
        POZ[name] = pozlu(arm_ob, acts[name])
    build_parts(arm_ob)
    ad = arm_ob.animation_data
    ad.action = None
    for name, act in acts.items():
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
    sc.frame_set(0)
    return arm_ob, acts


def report():
    tri = {}
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tri[ob.name] = len(ob.data.loop_triangles)
            print(f"  {ob.name} tris={tri[ob.name]} dims={tuple(round(d, 3) for d in ob.dimensions)}")
    esya = max(tri["cips"], tri["gamepad"] + tri["kulaklik"], tri["kitap"] + tri["telefon"])
    en_cok = tri["govde"] + tri["sac_lider"] + tri["sakal_lider"] + esya
    print(f"  en agir kombinasyon (lider + en agir esya): {en_cok} ucgen")
    assert en_cok < 3000, en_cok


if __name__ == "__main__":
    for d in (GLB_DIR, PNG_DIR, BLEND_DIR):
        d.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm_ob, acts = build()
    report()
    bpy.ops.export_scene.gltf(filepath=str(GLB_DIR / "genc.glb"), export_format="GLB", export_skins=True,
                              export_animations=True, export_animation_mode="ACTIONS",
                              export_cameras=False, export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "genc.blend"))

    tmp = Path(tempfile.mkdtemp())
    NORMAL = {"govde", "sac_daginik", "sakal"}
    LIDER = {"govde", "sac_lider", "sakal_lider", "telefon"}
    yollar = []
    KPSS = NORMAL | {"kitap", "telefon"}
    for i, (act, kare, gor, az) in enumerate((("otur", 18, NORMAL, 25), ("kaydir", 6, LIDER, 25),
                                              ("uyu", 0, NORMAL, 25), ("atistir", 12, NORMAL | {"cips"}, 25),
                                              ("oyun", 0, NORMAL | {"gamepad", "kulaklik"}, 25),
                                              ("oyun", 88, LIDER - {"telefon"} | {"gamepad", "kulaklik"}, 25),
                                              ("kpss", 6, KPSS, 25), ("kpss", 6, KPSS, 110))):
        yollar.append(tmp / f"p{i}.png")
        onizle(arm_ob, acts[act], kare, gor, yollar[-1], res=(400, 500), az=az, el=12)
    yan_yana(yollar, PNG_DIR / "genc.png")
