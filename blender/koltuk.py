# Oda eşyaları: koltuk (tekli berjer), taht (liderin koltuğu)
# Çalıştır: model.cmd koltuk   (ya da: blender -b -P blender/koltuk.py)
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bmesh  # noqa: E402
import ortak  # noqa: E402
from ortak import kutu, mat  # noqa: E402


def berjer(name, kumas, en=0.9, sirt_h=0.95, ayak="#3b2a1e", ekstra=None):
    """Oturma yüksekliği 0.45 m. `oturma` boşu = oturan kişinin kalça noktası."""
    mats = [mat(kumas[0], kumas[1]), mat("ayak", ayak, rough=0.5), mat("minder", kumas[2])]
    bm = bmesh.new()
    d = 0.85
    kutu(bm, (0, 0, 0.28), (en, d, 0.2), 0, pah=0.04)                        # oturak gövdesi
    kutu(bm, (0, -0.04, 0.43), (en - 0.26, d - 0.12, 0.12), 2, pah=0.04)     # minder
    kutu(bm, (0, d / 2 - 0.09, 0.18 + sirt_h / 2), (en, 0.18, sirt_h), 0, pah=0.05)  # sırt
    for s in (-1, 1):
        kutu(bm, (s * (en / 2 - 0.07), 0, 0.5), (0.14, d, 0.25), 0, pah=0.05)  # kolçak
        for y in (-1, 1):
            kutu(bm, (s * (en / 2 - 0.08), y * (d / 2 - 0.08), 0.09), (0.06, 0.06, 0.18), 1)  # ayak
    if ekstra:
        ekstra(bm, mats)
    ob = ortak.nesne(name, bm, mats)
    ortak.bos("oturma", (0, -0.05, 0.49))
    return ob


def koltuk():
    berjer("koltuk", ("kumas", "#6b8f71", "#86a98b"))


def taht():
    def tac(bm, mats):  # sırtın üstünde altın taç sivrileri
        mats.append(mat("altin", "#e0b23a", metallic=0.8, rough=0.3))
        for x in (-0.36, 0, 0.36):
            kutu(bm, (x, 0.34, 1.62 + (0.08 if x == 0 else 0)), (0.12, 0.1, 0.22 + (0.16 if x == 0 else 0)), 3, pah=0.02)
        kutu(bm, (0, 0.34, 1.47), (1.1, 0.12, 0.08), 3)
    berjer("taht", ("kadife", "#8e1b2e", "#a8303f"), en=1.1, sirt_h=1.3, ayak="#e0b23a", ekstra=tac)


ortak.uret({"koltuk": koltuk, "taht": taht}, maks_ucgen=1500)
