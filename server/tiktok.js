// TikTok canlı yayın → panel. Vite sunucusunda (Node) çalışır; olayları motorun beklediği biçime çevirir:
// {tip:'yorum', metin} | {tip:'hediye', coin, hediye} (hediye = TikTok hediye adı, ör. 'Rose') | {tip:'takip'}, hepsinde {userId, ad}.
// İmza Euler Stream'den gelir (tiktok-live-connector varsayılanı); EULER_API_KEY verilirse kota yükselir.
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

/** Hediye olayı → coin; seri sürerken null (seri bitince tek seferde sayılır, yoksa aynı seri defalarca puan verir). */
export function hediyeCoin(d) {
  const g = d.giftDetails;
  if (!g || (g.giftType === 1 && !d.repeatEnd)) return null;
  return g.diamondCount * Math.max(1, d.repeatCount);
}

const kisi = (u) => ({ userId: u?.userId || u?.uniqueId, ad: u?.nickname || u?.uniqueId || '?' });

/** @param {string} hesap  @param {(olay) => void} olay  @param {(durum: string) => void} durum */
export function tiktokBaslat(hesap, olay, durum) {
  const baglanti = new TikTokLiveConnection(hesap, { signApiKey: process.env.EULER_API_KEY || undefined });
  baglanti.on(WebcastEvent.CHAT, (d) => d.comment && olay({ tip: 'yorum', ...kisi(d.user), metin: d.comment }));
  baglanti.on(WebcastEvent.GIFT, (d) => { const coin = hediyeCoin(d); if (coin) olay({ tip: 'hediye', ...kisi(d.user), coin, hediye: d.giftDetails.giftName ?? String(d.giftId) }); });
  baglanti.on(WebcastEvent.FOLLOW, (d) => olay({ tip: 'takip', ...kisi(d.user) }));

  // Kopunca / yayın yokken artan aralıkla yeniden dener (5 sn → en çok 60 sn).
  let bekleme = 5, zamanlayici = null;
  const dene = async () => {
    zamanlayici = null;
    durum(`@${hesap} bağlanıyor…`);
    try {
      const s = await baglanti.connect();
      bekleme = 5;
      durum(`@${hesap} bağlı (oda ${s.roomId})`);
    } catch (e) { tekrar(e?.message ?? String(e)); }
  };
  const tekrar = (neden) => {
    if (zamanlayici) return;
    durum(`@${hesap} bağlı değil: ${neden}. ${bekleme} sn sonra tekrar`);
    zamanlayici = setTimeout(dene, bekleme * 1000);
    bekleme = Math.min(bekleme * 2, 60);
  };
  baglanti.on(ControlEvent.DISCONNECTED, () => tekrar('bağlantı koptu'));
  baglanti.on(WebcastEvent.STREAM_END, () => durum(`@${hesap} yayını bitti`));
  dene();
}

if (process.argv[1]?.endsWith('tiktok.js')) { // node server/tiktok.js → hediye sayımı kendini sınar
  const g = (giftType, repeatEnd, repeatCount, diamondCount = 5) => hediyeCoin({ giftDetails: { giftType, diamondCount }, repeatEnd, repeatCount });
  console.assert(g(1, 0, 3) === null, 'seri sürerken sayılmaz');
  console.assert(g(1, 1, 3) === 15, 'seri bitince 3×5');
  console.assert(g(2, 0, 1, 100) === 100, 'serisiz hediye hemen');
  console.assert(g(2, 0, 0, 100) === 100, 'repeatCount 0 → 1 adet');
  console.log('tiktok.js sınaması bitti');
}
