// Oyun sayfası (OBS Browser Source). Yalnızca paneldeki motorun snapshot'ını çizer.
import * as THREE from 'three';
import { oyunDinle } from './net/kanal.js';
import { modelYukle, klonla } from './models.js';
import { gencKur } from './genc.js';
import { createKamera } from './kamera.js';
import { etiket, etiketSil } from './etiket.js';
import game from '../../config/game.json';

const W = 1080, H = 1920, SIRA = 8; // koltuk ızgarası: SIRA koltuk yan yana
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2420);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xfff1dd, 0x443322, 1.6));
const gunes = new THREE.DirectionalLight(0xffffff, 1.2);
gunes.position.set(5, 15, 10);
scene.add(gunes);

// Oda: zemin + arka duvar
const zemin = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
zemin.rotation.x = -Math.PI / 2;
scene.add(zemin);
const duvar = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), new THREE.MeshLambertMaterial({ color: 0xd8c9a8 }));
duvar.position.set(0, 5, -15);
scene.add(duvar);
for (const sg of [-1, 1]) { // yan duvarlar (yüzleri içe bakar)
  const yan = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), duvar.material);
  yan.position.set(sg * 12, 5, 0);
  yan.rotation.y = -sg * Math.PI / 2;
  scene.add(yan);
}

const koltukYeri = (i) => new THREE.Vector3(((i % SIRA) - (SIRA - 1) / 2) * 2.6, 0, -8 + Math.floor(i / SIRA) * 3.2);
const TAHT = new THREE.Vector3(0, 0, -12.5);
const kamera = createKamera(camera, TAHT);
for (let i = 0, n = +new URLSearchParams(location.search).get('kt') / 0.05; i < n; i++) kamera.update(0.05, true); // ?kt=14 → kamerayı 14. saniyeye sar (çekim denemesi)
const OTURMA = new THREE.Vector3(0, 0.49, 0.05); // modellerdeki `oturma` boşu (Blender -Y → Three +Z)
// Koltuklar ve taht modelleri yüklenince yerleşir; kişiler beklemez.
let koltukModel = null, koltukSayisi = 0;
modelYukle('koltuk').then((m) => { koltukModel = m; if (son) koltuklariKur(son.kapasite); });
modelYukle('taht').then((m) => { const t = klonla(m); t.position.copy(TAHT); scene.add(t); });
function koltuklariKur(n) {
  for (; koltukModel && koltukSayisi < n; koltukSayisi++) { const k = klonla(koltukModel); k.position.copy(koltukYeri(koltukSayisi)); scene.add(k); }
}
const kisiler = new Map(); // userId → gencKur sonucu
let gencModel = null;
modelYukle('genc').then((m) => { gencModel = m; if (son) uygula(son); });

let son = null;
function uygula(s) {
  koltuklariKur(s.kapasite);
  const lider = s.uyeler.find((u) => u.userId === s.lider);
  document.getElementById('lider').textContent = lider ? `👑 Lider: ${lider.ad} (${lider.coin} coin)` : '';
  const gorulen = new Set();
  for (const u of s.uyeler) {
    gorulen.add(u.userId);
    if (!gencModel) continue; // model yüklenince son durum yeniden uygulanır
    let g = kisiler.get(u.userId);
    if (!g) { g = gencKur(gencModel, u.userId); kisiler.set(u.userId, g); scene.add(g.nesne); }
    const lider = u.userId === s.lider;
    g.nesne.position.copy(lider ? TAHT : koltukYeri(u.koltuk)).add(OTURMA); // lider tahta geçer, saçı sakalı uzar
    g.durum(lider, u.eylem);
    etiket(g.nesne, u.ad, lider);
  }
  for (const [id, g] of kisiler) if (!gorulen.has(id)) { scene.remove(g.nesne); etiketSil(g.nesne); g.birak(); kisiler.delete(id); }
  son = s;
}

oyunDinle(({ snapshot, olaylar = [] } = {}) => {
  if (snapshot && snapshot.surum !== son?.surum) uygula(snapshot);
  for (const o of olaylar) {
    const g = kisiler.get(o.userId);
    if (o.tip === 'hediye' && g) kamera.odakla(g.nesne, game.hediyeOdakSn); // bağış atana yakın plan
  }
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const g of kisiler.values()) g.update(dt);
  kamera.update(dt, !!son?.lider);
  renderer.render(scene, camera);
});
