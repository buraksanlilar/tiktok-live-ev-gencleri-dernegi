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
    cikti: () => `👋 ${o.ad} kalktı (koltuk ${o.koltuk + 1})`,
    sirada: () => `⏳ ${o.ad} sırada (${o.sira}.)`,
    hediye: () => `🎁 ${o.ad} ${o.hediye} (${o.coin} coin)`,
    liderDegisti: () => `👑 yeni lider: ${o.ad}`,
    eylem: () => `📱 ${ad(o.userId)} ${o.eylem} (${Math.round(o.sureSn)} sn)`,
    eylemBitti: () => `⏹ ${ad(o.userId)} ${o.eylem} bitti`,
  }[o.tip]?.() ?? JSON.stringify(o));
  bekleyen.push(...olaylar);
};
const olay = (o) => {
  if (o.tip === 'yorum') log(`💬 ${o.ad}: ${o.metin}`);
  else if (o.tip === 'takip') log(`➕ ${o.ad} takip etti`);
  gonder(engine.olayIsle(o));
};

// Gerçek yayın: server/tiktok.js → Vite sunucusu → yalnız aktif panel
import.meta.hot?.on('dernek:tiktok', olay);
import.meta.hot?.on('dernek:tiktokDurum', (d) => { $('tiktokDurum').textContent = d; log(`📡 ${d}`); });
panelMesgul(() => { $('tiktokDurum').textContent = '⚠️ Başka panel sekmesi açık, bunu kapat'; });

// Test düğmeleri
const kacir = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kim = () => ({ userId: $('u').value.trim(), ad: $('u').value.trim() });
const coin = () => Math.max(1, +$('coin').value || 1);
const hediyeAt = (k, hediye, c = coin()) => k.userId && olay({ tip: 'hediye', ...k, coin: c, hediye });
$('yorum').onclick = () => kim().userId && olay({ tip: 'yorum', ...kim(), metin: $('metin').value });
$('metin').onkeydown = (e) => e.key === 'Enter' && $('yorum').click();
$('takip').onclick = () => kim().userId && olay({ tip: 'takip', ...kim() });
$('hediye').onclick = () => hediyeAt(kim(), $('hediyeAd').value.trim() || 'Rose');
$('lider').onclick = () => { const s = engine.snapshot(); hediyeAt(kim(), 'Lider', Math.max(0, ...s.uyeler.map((u) => u.coin)) + 1); };
$('hediyeler').innerHTML = Object.entries(config.hediyeler).map(([h, e]) =>
  `<button data-h="${kacir(h)}">🎁 ${kacir(h)} → ${kacir(e.eylem)} ${e.sureSn}sn</button>`).join('');
$('hediyeler').onclick = (e) => e.target.dataset.h && hediyeAt(kim(), e.target.dataset.h);
$('uyeler').onclick = (e) => { const id = e.target.closest('tr')?.dataset.id; if (id) $('u').value = id; };

// Rastgele: uzun ad, emoji, Türkçe harf → etiketleri de dener
const ADLAR = ['Ahmet', 'Zeynep', 'Burak', 'Elif', 'Mert', 'Ayşe', 'Kaan', 'Büşra', 'Çağrı', 'Öykü', 'Şevval', 'İlker', 'Ğ_Ğ',
  '🌸Gül🌸', 'xX_Efe_Xx', 'çok_uzun_kullanıcı_adı_deneme123', 'kpss_mağduru', 'evden_çıkmayan'];
const YORUMLAR = ['selam', 'merhaba dernek', 'lider kim?', 'ben de geldim', '👋', 'sıra ne zaman bende', 'kpss çalışın', 'uyuma!', 'annem çağırıyor'];
const sec = (d) => d[Math.floor(Math.random() * d.length)];
const yeniKisi = () => { const id = sec(ADLAR) + Math.floor(Math.random() * 1000); return { userId: id, ad: id }; };
const herhangiKisi = () => { // yarı yarıya odadaki biri, yoksa yeni
  const u = engine.snapshot().uyeler;
  if (u.length && Math.random() < 0.5) { const x = sec(u); return { userId: x.userId, ad: x.ad }; }
  return yeniKisi();
};
const rHediye = () => hediyeAt(herhangiKisi(), sec(Object.keys(config.hediyeler)), sec([1, 1, 1, 5, 10, 30, 100]));
const rOlay = () => {
  const r = Math.random();
  if (r < 0.7) olay({ tip: 'yorum', ...herhangiKisi(), metin: sec(YORUMLAR) });
  else if (r < 0.9) rHediye();
  else olay({ tip: 'takip', ...herhangiKisi() });
};
$('rastgele').onclick = () => { for (let i = 0; i < Math.max(1, +$('kisiSayi').value); i++) olay({ tip: 'yorum', ...yeniKisi(), metin: sec(YORUMLAR) }); };
$('rHediye').onclick = rHediye;
$('rOlay').onclick = rOlay;
setInterval(() => { if ($('akis').checked && Math.random() < (+$('hiz').value || 0) / 10) rOlay(); }, 100); // ponytail: 10/sn üstü tavan
$('sifirla').onclick = () => { if (confirm('Oda boşaltılsın mı?')) { localStorage.removeItem(DURUM); location.reload(); } };

setInterval(() => {
  gonder(engine.tick());
  const s = engine.snapshot();
  panelGonder({ snapshot: s, olaylar: bekleyen });
  bekleyen = [];
  $('ozet').textContent = `${s.uyeler.length}/${s.kapasite}` + (s.sira.length ? ` · sırada ${s.sira.length}: ${s.sira.slice(0, 5).join(', ')}${s.sira.length > 5 ? '…' : ''}` : '');
  $('uyeler').innerHTML = [...s.uyeler].sort((a, b) => b.coin - a.coin).map((u) =>
    `<tr data-id="${kacir(u.userId)}"><td>${u.userId === s.lider ? '👑' : ''} ${kacir(u.ad)}</td><td>${u.coin} coin</td><td>${u.eylem ? '📱 ' + u.eylem : ''}</td></tr>`).join('');
}, 250);
