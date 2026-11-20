# Ev Gençleri Derneği

TikTok canlı yayın oyunu: kocaman bir oda. Yorum atan odaya girip oturur, en çok coin atan derneğin lideri olur,
bazı hediyeler o üyeyi bir süre TikTok kaydırmaya başlatır. Altyapı `tiktok-live-convoy` ile aynı.

## Çalıştırma
```
npm install
npm run dev      # oyun: http://localhost:5173  panel: http://localhost:5173/dashboard.html
npm test         # motor testleri
```
TikTok bağlantısı için `.env.example` → `.env`, `TIKTOK_USERNAME` doldur. Boşsa panelin test düğmeleriyle çalışır.

## Yapı
- `server/tiktok.js`: TikTok → `{tip:'yorum'|'hediye'|'takip', userId, ad, ...}` (hediyede `coin` ve `hediye` adı). Vite sunucusunda çalışır.
- `server/engine/engine.js`: oyun kuralları (saf mantık). Panelde çalışır.
- `client/dashboard.html`: panel. Motoru çalıştırır, durumu oyuna yayınlar. **Tek panel sekmesi açık olmalı.**
- `client/index.html` + `src/main.js`: oyun sahnesi (Three.js, 1080x1920). Sadece snapshot'ı çizer.
- `client/vite.config.js` + `src/net/kanal.js`: panel ↔ oyun köprüsü (OBS ayrı tarayıcı olduğu için Vite WebSocket'i).
- `config/game.json`: oda kapasitesi, sessiz üye zaman aşımı, `hediyeler` (TikTok hediye adı → eylem ve süre).

## Yayın (Windows)
`yayin.cmd`: sunucuyu, paneli ve OBS'i ("TikTok Dernek" profili, "Dernek" sahnesi; ilk çalıştırmada kurulur) açar.
