// Ev genci (blender/genc.py → models/genc.glb): parça seçimi, kişiye özel renkler, otur/kaydir animasyonu.
import * as THREE from 'three';
import { klonla } from './models.js';

const TEN = ['#E0B48C', '#C68A62', '#F1CBA5', '#8D5A3B', '#D9A377'];
const SAC = ['#2E1E14', '#151012', '#6B4A2E', '#3B2416', '#8A6A4A'];
const UST = ['#5B6B7A', '#7A2E2E', '#2F4F3A', '#3C3C46', '#8A7A5A', '#2B3F6B', '#B8B8B0', '#6B4E7A'];
const SACLAR = ['sac_kisa', 'sac_daginik', null]; // null = kel
const SACLAR_HEPSI = ['sac_kisa', 'sac_daginik', 'sakal', 'sac_lider', 'sakal_lider'];
// eylem (config/game.json) → aynı adlı animasyon + elindeki eşyalar. Bilinmeyen eylem = otur.
const ESYA = { kaydir: ['telefon'], uyu: [], atistir: ['cips'], oyun: ['gamepad', 'kulaklik'], kpss: ['kitap', 'telefon'] };
const ESYALAR = [...new Set(Object.values(ESYA).flat())];
const PARCALAR = [...SACLAR_HEPSI, ...ESYALAR];

// Uyurken başın üstünden süzülen "Z"ler: tek doku, kişi başına 3 sprite.
let zDoku = null;
function zKur() {
  if (!zDoku) {
    const t = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const g = t.getContext('2d');
    g.font = '900 56px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#1b2440'; g.strokeText('Z', 32, 34);
    g.fillStyle = '#dfe8ff'; g.fillText('Z', 32, 34);
    zDoku = new THREE.CanvasTexture(t);
    zDoku.colorSpace = THREE.SRGBColorSpace;
  }
  const grup = new THREE.Group();
  for (let i = 0; i < 3; i++) grup.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: zDoku, transparent: true, depthWrite: false })));
  return grup;
}

/** userId'den sabit sayı: aynı kişi her yenilemede aynı görünür. */
const ozet = (s) => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };

/** @param {THREE.Object3D} model modelYukle('genc') sonucu (animations dahil) */
export function gencKur(model, userId) {
  const o = klonla(model);
  const h = ozet(userId);
  const renk = { ten: TEN[h % TEN.length], sac: SAC[(h >>> 3) % SAC.length], ust: UST[(h >>> 6) % UST.length] };
  const kopya = {}; // kişiye özel malzemeler (diğerleri tüm gençlerde paylaşılır)
  const parca = {};
  o.traverse((m) => {
    if (PARCALAR.includes(m.name)) parca[m.name] = m;
    if (!m.isMesh) return;
    const ad = m.material.name;
    if (renk[ad]) m.material = kopya[ad] ??= m.material.clone();
  });
  for (const [ad, mat] of Object.entries(kopya)) mat.color.set(renk[ad]);
  const normal = { [SACLAR[(h >>> 9) % SACLAR.length]]: true, sakal: (h >>> 12) % 2 === 0 };

  const mixer = new THREE.AnimationMixer(o);
  const anim = Object.fromEntries(model.animations.map((c) => [c.name, mixer.clipAction(c)]));
  let simdiki = anim.otur.play();
  simdiki.time = (h % 1000) / 1000 * simdiki.getClip().duration; // herkes aynı anda bakınmasın

  for (const ad of ESYALAR) if (parca[ad]) parca[ad].visible = false;
  let eylem = null, esyaSn = -1; // eşyalar kol kalkarken (geçişin ortasında) ele gelir; bırakırken hemen kaybolur
  let z = null, zSn = 0;
  return {
    nesne: o,
    /** @param {boolean} lider @param {string|null} yeni eylem adı (ör. 'kaydir') */
    durum(lider, yeni) {
      for (const ad of SACLAR_HEPSI) if (parca[ad]) parca[ad].visible = lider ? ad.endsWith('_lider') : !!normal[ad];
      if (!anim[yeni]) yeni = null;
      if (yeni === eylem) return;
      eylem = yeni;
      const hedef = anim[eylem ?? 'otur'];
      hedef.reset().play(); simdiki.crossFadeTo(hedef, 0.4, false); simdiki = hedef;
      for (const ad of ESYALAR) if (parca[ad]) parca[ad].visible = false;
      esyaSn = eylem ? 0.25 : -1;
      if (eylem === 'uyu') o.add(z ??= zKur());
      else if (z) o.remove(z);
    },
    update(dt) {
      mixer.update(dt);
      if (esyaSn >= 0 && (esyaSn -= dt) < 0) for (const ad of ESYA[eylem] ?? []) if (parca[ad]) parca[ad].visible = true;
      if (z?.parent) {
        zSn += dt;
        z.children.forEach((s, i) => {
          const t = (zSn / 3 + i / 3) % 1; // her Z 3 sn'de yükselip söner
          s.position.set(0.18 + t * 0.25, 0.75 + t * 0.6, 0);
          s.scale.setScalar(0.12 + t * 0.18);
          s.material.opacity = Math.sin(Math.PI * t);
        });
      }
    },
    birak() { mixer.stopAllAction(); for (const m of Object.values(kopya)) m.dispose(); z?.children.forEach((s) => s.material.dispose()); },
  };
}
