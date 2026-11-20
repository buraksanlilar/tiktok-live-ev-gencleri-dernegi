// Gencin başının üstünde kullanıcı adı (sprite: hep kameraya bakar). Gencin çocuğu olur: onunla taşınır ve silinir.
// Metin/görünüm değişmedikçe yeniden çizilmez. (tiktok-live-convoy/client/src/scene/etiket.js'den sadeleştirildi)
import * as THREE from 'three';

const W = 384, H = 96, GENISLIK = 1.4; // doku px, sahnede metre
const BOY = 1.25; // kalçadan (genç orijini) baş üstüne

function ciz(tuval, ad, lider) {
  const g = tuval.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = lider ? 'rgba(60,40,0,.88)' : 'rgba(10,12,16,.8)';
  g.beginPath(); g.roundRect(4, 8, W - 8, H - 16, 28); g.fill();
  g.lineWidth = 6; g.strokeStyle = lider ? '#f2c94c' : 'rgba(255,255,255,.35)'; g.stroke();
  const metin = lider ? `👑 ${ad}` : ad;
  let fs = 46;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = lider ? '#ffe9a8' : '#fff';
  do { g.font = `700 ${fs}px Arial, sans-serif`; fs -= 2; } while (g.measureText(metin).width > W - 40 && fs > 18);
  g.fillText(metin, W / 2, H / 2 + 2);
}

/** Etiketi kurar ya da günceller (ad veya liderlik değiştiyse yeniden çizer). */
export function etiket(nesne, ad, lider) {
  let s = nesne.userData.etiket;
  if (!s) {
    const tuval = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const doku = new THREE.CanvasTexture(tuval);
    doku.colorSpace = THREE.SRGBColorSpace;
    // depthTest kapalı: öndeki koltuk/kişi etiketi kapatmasın
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthWrite: false, depthTest: false }));
    s.renderOrder = 10;
    s.userData = { tuval, doku };
    nesne.userData.etiket = s;
    nesne.add(s);
  }
  if (s.userData.ad === ad && s.userData.lider === lider) return;
  Object.assign(s.userData, { ad, lider });
  const k = lider ? 1.5 : 1;
  s.scale.set(GENISLIK * k, GENISLIK * k * H / W, 1);
  s.position.y = BOY + (lider ? 0.35 : 0);
  ciz(s.userData.tuval, ad, lider);
  s.userData.doku.needsUpdate = true;
}

export function etiketSil(nesne) {
  const s = nesne.userData.etiket;
  if (!s) return;
  s.material.dispose(); s.userData.doku.dispose();
}
