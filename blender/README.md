# Modeller (Blender 5.3)

Her model bir Python scriptiyle üretilir → `client/public/models/<ad>.glb` (oyun yükler) + `onizleme/<ad>.png` + `kaynak/<ad>.blend` (git'e girmez).

```
model.cmd koltuk            # blender/koltuk.py içindeki tüm modeller (koltuk, taht)
model.cmd koltuk taht       # yalnız taht
```
Ortak yardımcılar `ortak.py` içinde: `mat`, `kutu` (pahlı kutu), `nesne`, `bos`, `uret`. Yeni model = yeni script + `ortak.uret({...})`.
Elle düzenlemek istersen: scripti çalıştır, `kaynak/*.blend`'i aç, GLB olarak dışa aktar (script tekrar çalışırsa üstüne yazar).

## Kontrat (kod buna güvenir)
- 1 birim = 1 m. Ön yüz Blender'da **-Y** (Three.js'te +Z, kameraya bakar). Orijin yerde, ortada.
- Malzemeler adlarıyla tanınır; kod renk gömmez.

### Koltuk — `koltuk.glb`, `taht.glb`
- `oturma`: boş nesne, oturan kişinin kalça noktası (0, -0.05, 0.49). Kodda `OTURMA` (client/src/main.js).
- `koltuk`: 0.9 × 0.85 m. `taht`: liderin koltuğu, 1.1 m, altın taçlı sırt.

### Ev genci — `genc.glb` (`model.cmd genc`, önizleme `onizleme/genc.png`)
- İskelet, Builder ve animasyon pişirme `tiktok-live-convoy/blender/kisi.py`'den alındı. ~1.76 m, yüz -Y.
- Animasyonlar (döngü): `otur` (2.4 sn, yayılmış oturuş, etrafa bakınır), `kaydir` (1.2 sn, telefona gömülü, başparmakla iki kaydırma).
  İkisinde de **kalça kemiği başı orijinde**: kişi doğrudan koltuğun `oturma` noktasına konur.
- Parçalar (ayrı düğümler, kod seçer; `client/src/genc.js`):
  `govde` (göbek, tişört, eşofman, beyaz çorap, terlik) · saç: `sac_kisa` | `sac_daginik` | yok (kel) · `sakal` ·
  lider: `sac_lider` (bele iner, uçları kırık) + `sakal_lider` (göbeğe iner, pala bıyık); uzun kısımlar `chest` kemiğiyle sallanır ·
  `telefon` (sağ el; yalnız `kaydir` sırasında görünür).
- Malzemeler: kişiye göre boyananlar `ten`, `sac`, `ust`; sabitler `alt`, `corap`, `terlik`, `torba`, `telefon`, `ekran` (ışık saçar).
- Lider kombinasyonu 1842 üçgen (sınır 3000).
