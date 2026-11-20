/**
 * Oyun motoru: saf mantık, ağ/dosya bilmez. Panelde (tarayıcı) ve testte (Node) çalışır. Zaman dışarıdan: `saat()` saniye.
 *
 * Olay (girdi): {tip:'yorum', userId, ad, metin} · {tip:'hediye', userId, ad, coin, hediye} · {tip:'takip', userId, ad}
 * Çıktı: olayIsle()/tick() → [{tip:'girdi'|'cikti'|'sirada'|'liderDegisti'|'hediye'|'eylem'|'eylemBitti', ...}]. Durum: snapshot().
 *
 * Kurallar:
 * - Yorum atan odaya girip boş koltuğa oturur. Oda doluysa sıraya girer (kuyruk).
 * - Kuyruk: ilk giren ilk çıkar. En eski üye (lider hariç) en az `minKalmaSn` oturduysa kalkar, sıradaki girer.
 * - Bağış atan sıra beklemez: odada değilse en eski üyenin yerine hemen girer.
 * - En çok coin atan derneğin lideri (coin odadan çıkınca da saklanır).
 * - Hediye adı config.hediyeler'de varsa o üye bir süre eylem yapar (ör. 'kaydir' = TikTok kaydırır).
 */
export function createEngine({ config, saat = () => Date.now() / 1000 }) {
  const cfg = config;
  let uyeler = new Map(); // userId → {userId, ad, koltuk, giris, eylem, eylemBitis}
  let sira = []; // odaya girmeyi bekleyenler [{userId, ad}], geliş sırasıyla
  let coinler = {}; // userId → toplam coin (odadan çıkan da kaybetmez)
  let lider = null, surum = 0;

  const bosKoltuk = () => {
    const dolu = new Set([...uyeler.values()].map((u) => u.koltuk));
    for (let i = 0; i < cfg.odaKapasite; i++) if (!dolu.has(i)) return i;
    return -1;
  };

  /** İlk giren (lider hariç) kalkar. zorla: minKalmaSn beklenmez (bağış atan girecek). */
  function enEskiyiCikar(out, zorla) {
    const aday = [...uyeler.values()].filter((u) => u.userId !== lider).sort((a, b) => a.giris - b.giris)[0];
    if (!aday || (!zorla && saat() - aday.giris < cfg.minKalmaSn)) return false;
    uyeler.delete(aday.userId);
    out.push({ tip: 'cikti', userId: aday.userId, ad: aday.ad, koltuk: aday.koltuk });
    return true;
  }

  function gir(userId, ad, out) {
    const u = { userId, ad, koltuk: bosKoltuk(), giris: saat(), eylem: null, eylemBitis: 0 };
    uyeler.set(userId, u);
    sira = sira.filter((s) => s.userId !== userId);
    out.push({ tip: 'girdi', userId, ad, koltuk: u.koltuk });
    surum++;
    return u;
  }

  /** Odadaki üyeyi döner; değilse girer ya da sıraya alınır (null). */
  function uye(o, out, zorla) {
    const u = uyeler.get(o.userId);
    if (u) { if (o.ad) u.ad = o.ad; return u; }
    if (bosKoltuk() >= 0 && (zorla || !sira.length)) return gir(o.userId, o.ad, out); // sıra varken boş koltuk sıradakinin
    if (zorla && enEskiyiCikar(out, true)) return gir(o.userId, o.ad, out);
    if (!sira.some((s) => s.userId === o.userId) && sira.length < cfg.siraMaks) {
      sira.push({ userId: o.userId, ad: o.ad });
      out.push({ tip: 'sirada', userId: o.userId, ad: o.ad, sira: sira.length });
      surum++;
    }
    return null;
  }

  function liderGuncelle(out) {
    let en = null;
    for (const u of uyeler.values()) if ((coinler[u.userId] ?? 0) > (coinler[en?.userId] ?? 0)) en = u;
    if (en && en.userId !== lider && coinler[en.userId] > (coinler[lider] ?? 0)) { // eşitlikte eski lider kalır
      out.push({ tip: 'liderDegisti', yeni: en.userId, eski: lider, ad: en.ad });
      lider = en.userId;
    }
  }

  function olayIsle(o) {
    const out = [];
    if (o.tip === 'takip') return out; // ponytail: takip şimdilik bir şey yapmaz
    const u = uye(o, out, o.tip === 'hediye');
    if (!u) return out;
    if (o.tip === 'hediye') {
      surum++;
      coinler[u.userId] = (coinler[u.userId] ?? 0) + o.coin;
      out.push({ tip: 'hediye', userId: u.userId, ad: u.ad, coin: o.coin, hediye: o.hediye });
      const e = cfg.hediyeler[o.hediye] ?? cfg.varsayilanEylem;
      if (e) {
        u.eylem = e.eylem; u.eylemBitis = Math.max(u.eylemBitis, saat()) + e.sureSn; // aynı hediye tekrar gelirse süre uzar
        out.push({ tip: 'eylem', userId: u.userId, eylem: e.eylem, sureSn: u.eylemBitis - saat() });
      }
      liderGuncelle(out);
    }
    return out;
  }

  /** Zamana bağlı işler: eylem bitişi, kuyruk ilerlemesi. Düzenli çağır. */
  function tick() {
    const out = [];
    for (const u of uyeler.values()) if (u.eylem && saat() >= u.eylemBitis) {
      out.push({ tip: 'eylemBitti', userId: u.userId, eylem: u.eylem });
      u.eylem = null; surum++;
    }
    while (sira.length && (bosKoltuk() >= 0 || enEskiyiCikar(out, false))) gir(sira[0].userId, sira[0].ad, out);
    return out;
  }

  const snapshot = () => ({
    surum, lider, kapasite: cfg.odaKapasite,
    uyeler: [...uyeler.values()].map(({ userId, ad, koltuk, eylem }) => ({ userId, ad, koltuk, coin: coinler[userId] ?? 0, eylem })),
    sira: sira.map((s) => s.ad),
  });

  /** Kaydet/geri yükle (panel yenilenince oda boşalmasın). */
  const durum = () => JSON.stringify({ uyeler: [...uyeler], sira, coinler, lider, surum });
  const yukle = (metin) => {
    const d = JSON.parse(metin);
    uyeler = new Map(d.uyeler); sira = d.sira ?? []; coinler = d.coinler ?? {};
    for (const u of uyeler.values()) { u.giris ??= 0; if (u.coin && !coinler[u.userId]) coinler[u.userId] = u.coin; delete u.coin; delete u.son; } // eski kayıt
    ({ lider, surum } = d);
  };

  return { olayIsle, tick, snapshot, durum, yukle, config: cfg };
}
