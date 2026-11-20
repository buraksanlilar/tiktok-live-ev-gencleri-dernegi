// Panel: motoru çalıştırır, TikTok olaylarını işler, snapshot'ı oyuna yayınlar. Aynı anda tek panel açık olmalı.
import { createEngine } from '../../../server/engine/engine.js';
import config from '../../../config/game.json';
import { panelGonder, panelMesgul } from '../net/kanal.js';

const $ = (id) => document.getElementById(id);
const DURUM = 'dernek-durum-v1';
const engine = createEngine({ config });
try { const d = localStorage.getItem(DURUM); if (d) engine.yukle(d); } catch (e) { console.warn('durum yüklenemedi', e); }
const kaydet = () => { try { localStorage.setItem(DURUM, engine.durum()); } catch { /* dolu/özel pencere */ } };
addEventListener('pagehide', kaydet);
setInterval(kaydet, 2000);

const gunluk = [];
const log = (m) => { gunluk.unshift(`${new Date().toLocaleTimeString('tr-TR')}  ${m}`); gunluk.length = Math.min(gunluk.length, 150); $('gunluk').textContent = gunluk.join('\n'); };
const ad = (id) => engine.snapshot().uyeler.find((u) => u.userId === id)?.ad ?? id;
let bekleyen = [];
const gonder = (olaylar) => {
  for (const o of olaylar) log({
    girdi: () => `🚪 ${o.ad} odaya girdi (koltuk ${o.koltuk + 1})`,
    cikti: () => `👋 ${o.userId} kalktı`,
    hediye: () => `🎁 ${o.ad} ${o.hediye} (${o.coin} coin)`,
    liderDegisti: () => `👑 yeni lider: ${o.ad}`,
    eylem: () => `📱 ${ad(o.userId)} ${o.eylem} (${Math.round(o.sureSn)} sn)`,
    eylemBitti: () => `⏹ ${ad(o.userId)} ${o.eylem} bitti`,
  }[o.tip]?.() ?? JSON.stringify(o));
  bekleyen.push(...olaylar);
};
const olay = (o) => gonder(engine.olayIsle(o));

// Gerçek yayın: server/tiktok.js → Vite sunucusu → yalnız aktif panel
import.meta.hot?.on('dernek:tiktok', olay);
import.meta.hot?.on('dernek:tiktokDurum', (d) => { $('tiktokDurum').textContent = d; log(`📡 ${d}`); });
panelMesgul(() => { $('tiktokDurum').textContent = '⚠️ Başka panel sekmesi açık, bunu kapat'; });

// Test düğmeleri
$('hediyeListe').innerHTML = Object.keys(config.hediyeler).map((h) => `<option value="${h}">`).join('');
const kim = () => ({ userId: $('u').value.trim(), ad: $('u').value.trim() });
$('yorum').onclick = () => kim().userId && olay({ tip: 'yorum', ...kim(), metin: 'selam' });
$('hediye').onclick = () => kim().userId && olay({ tip: 'hediye', ...kim(), coin: Math.max(1, +$('coin').value), hediye: $('hediyeAd').value.trim() });
$('rastgele').onclick = () => { for (let i = 0; i < 10; i++) { const id = 'misafir' + Math.floor(Math.random() * 1000); olay({ tip: 'yorum', userId: id, ad: id, metin: 'selam' }); } };
$('sifirla').onclick = () => { if (confirm('Oda boşaltılsın mı?')) { localStorage.removeItem(DURUM); location.reload(); } };

const kacir = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
setInterval(() => {
  gonder(engine.tick());
  const s = engine.snapshot();
  panelGonder({ snapshot: s, olaylar: bekleyen });
  bekleyen = [];
  $('ozet').textContent = `${s.uyeler.length}/${s.kapasite}`;
  $('uyeler').innerHTML = [...s.uyeler].sort((a, b) => b.coin - a.coin).map((u) =>
    `<tr><td>${u.userId === s.lider ? '👑' : ''} ${kacir(u.ad)}</td><td>${u.coin} coin</td><td>${u.eylem ? '📱 ' + u.eylem : ''}</td></tr>`).join('');
}, 250);
