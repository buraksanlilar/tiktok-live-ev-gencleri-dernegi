// Ev genci (blender/genc.py → models/genc.glb): parça seçimi, kişiye özel renkler, otur/kaydir animasyonu.
import * as THREE from 'three';
import { klonla } from './models.js';

const TEN = ['#E0B48C', '#C68A62', '#F1CBA5', '#8D5A3B', '#D9A377'];
const SAC = ['#2E1E14', '#151012', '#6B4A2E', '#3B2416', '#8A6A4A'];
const UST = ['#5B6B7A', '#7A2E2E', '#2F4F3A', '#3C3C46', '#8A7A5A', '#2B3F6B', '#B8B8B0', '#6B4E7A'];
const SACLAR = ['sac_kisa', 'sac_daginik', null]; // null = kel
const PARCALAR = ['sac_kisa', 'sac_daginik', 'sakal', 'sac_lider', 'sakal_lider', 'telefon'];

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

  let telefonSn = -1; // telefon, kol kalkarken (geçişin ortasında) ele gelir; bırakırken hemen kaybolur
  return {
    nesne: o,
    /** @param {boolean} lider @param {boolean} kaydir */
    durum(lider, kaydir) {
      for (const ad of PARCALAR) if (parca[ad] && ad !== 'telefon') parca[ad].visible = lider ? ad.endsWith('_lider') : !!normal[ad];
      const hedef = anim[kaydir ? 'kaydir' : 'otur'];
      if (hedef !== simdiki) { hedef.reset().play(); simdiki.crossFadeTo(hedef, 0.4, false); simdiki = hedef; telefonSn = kaydir ? 0.25 : -1; }
      if (!kaydir && parca.telefon) parca.telefon.visible = false;
    },
    update(dt) {
      mixer.update(dt);
      if (telefonSn >= 0 && (telefonSn -= dt) < 0 && parca.telefon) parca.telefon.visible = true;
    },
    birak() { mixer.stopAllAction(); for (const m of Object.values(kopya)) m.dispose(); },
  };
}
