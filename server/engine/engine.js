/**
 * Oyun motoru: saf mantık, ağ/dosya bilmez. Panelde (tarayıcı) ve testte (Node) çalışır. Zaman dışarıdan: `saat()` saniye.
 *
 * Olay (girdi): {tip:'yorum', userId, ad, metin} · {tip:'hediye', userId, ad, coin, hediye} · {tip:'takip', userId, ad}
 * Çıktı: olayIsle()/tick() → [{tip:'girdi'|'cikti'|'liderDegisti'|'hediye'|'eylem', ...}]. Durum: snapshot().
 *
 * Kurallar: yorum atan odaya girip boş koltuğa oturur. En çok coin atan derneğin lideri.
 * Hediye adı config.hediyeler'de varsa o üye bir süre eylem yapar (ör. 'kaydir' = TikTok kaydırır).
 * Uzun süre sessiz kalan üye, oda doluyken yeni gelene yer açmak için kalkar.
 */
export function createEngine({ config, saat = () => Date.now() / 1000 }) {
  const cfg = config;
  let uyeler = new Map(); // userId → {userId, ad, koltuk, coin, son, eylem, eylemBitis}
  let lider = null, surum = 0;

  const bosKoltuk = () => {
    const dolu = new Set([...uyeler.values()].map((u) => u.koltuk));
    for (let i = 0; i < cfg.odaKapasite; i++) if (!dolu.has(i)) return i;
    return -1;
  };

  /** Oda doluysa en uzun süredir sessiz (lider hariç) ve zaman aşımına uğramış üyeyi kaldırır. */
  function yerAc(out) {
    const esik = saat() - cfg.uyeZamanAsimiDk * 60;
    const aday = [...uyeler.values()].filter((u) => u.userId !== lider && u.son < esik).sort((a, b) => a.son - b.son)[0];
    if (!aday) return false;
    uyeler.delete(aday.userId);
    out.push({ tip: 'cikti', userId: aday.userId, koltuk: aday.koltuk });
    return true;
  }

  function uye(o, out) {
    let u = uyeler.get(o.userId);
    if (!u) {
      let koltuk = bosKoltuk();
      if (koltuk < 0 && yerAc(out)) koltuk = bosKoltuk();
      if (koltuk < 0) return null; // oda dolu, kimse kalkmıyor
      uyeler.set(o.userId, (u = { userId: o.userId, ad: o.ad, koltuk, coin: 0, son: saat(), eylem: null, eylemBitis: 0 }));
      out.push({ tip: 'girdi', userId: u.userId, ad: u.ad, koltuk });
    }
    if (o.ad) u.ad = o.ad;
    u.son = saat();
    return u;
  }

  function liderGuncelle(out) {
    const en = [...uyeler.values()].filter((u) => u.coin > 0).sort((a, b) => b.coin - a.coin)[0];
    if (en && en.userId !== lider && en.coin > (uyeler.get(lider)?.coin ?? 0)) { // eşitlikte eski lider kalır
      out.push({ tip: 'liderDegisti', yeni: en.userId, eski: lider, ad: en.ad });
      lider = en.userId;
    }
  }

  function olayIsle(o) {
    const out = [];
    if (o.tip === 'takip') return out; // ponytail: takip şimdilik bir şey yapmaz
    const u = uye(o, out);
    if (!u) return out;
    surum++;
    if (o.tip === 'hediye') {
      u.coin += o.coin;
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

  /** Zamana bağlı işler (eylem bitişi). Düzenli çağır. */
  function tick() {
    const out = [];
    for (const u of uyeler.values()) if (u.eylem && saat() >= u.eylemBitis) {
      out.push({ tip: 'eylemBitti', userId: u.userId, eylem: u.eylem });
      u.eylem = null; surum++;
    }
    return out;
  }

  const snapshot = () => ({
    surum, lider, kapasite: cfg.odaKapasite,
    uyeler: [...uyeler.values()].map(({ userId, ad, koltuk, coin, eylem }) => ({ userId, ad, koltuk, coin, eylem })),
  });

  /** Kaydet/geri yükle (panel yenilenince oda boşalmasın). */
  const durum = () => JSON.stringify({ uyeler: [...uyeler], lider, surum });
  const yukle = (metin) => { const d = JSON.parse(metin); uyeler = new Map(d.uyeler); ({ lider, surum } = d); };

  return { olayIsle, tick, snapshot, durum, yukle, config: cfg };
}
