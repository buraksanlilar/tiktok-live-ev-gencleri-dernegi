import { fileURLToPath } from 'node:url';
import { tiktokBaslat } from '../server/tiktok.js';

const yol = (p) => fileURLToPath(new URL(p, import.meta.url));
try { process.loadEnvFile(yol('../.env')); } catch { /* .env yok: TikTok kapalı */ }

export default {
  server: { fs: { allow: ['..'] } }, // config/ ve server/ klasörleri client dışında
  plugins: [{
    // Kök (client/) dışındaki dosyaları Vite tek tek izler; git (pull/rebase) dosyayı silip yeniden yazınca izleme kopar
    // ve sunucu eski game.json/engine.js'i vermeye devam eder. Klasörleri izlemek bunu çözer.
    name: 'kok-disi-izle',
    configureServer(server) { server.watcher.add([yol('../config'), yol('../server')]); },
  }, {
    // Panel → oyun köprüsü (client/src/net/kanal.js): panelin mesajını tüm açık sayfalara dağıtır.
    // BroadcastChannel yalnızca aynı tarayıcıda çalışır; OBS'in Browser Source'u ayrı bir tarayıcı.
    name: 'dernek-kopru',
    configureServer(server) {
      // Tek panel: panel motoru çalıştırır, iki panel açıksa iki motor birbirini ezer. İlk gelen aktif kalır;
      // aktif panel 2 sn susarsa (sekme kapandı) sıradaki devralır. Diğerlerine uyarı gider.
      let aktif = null, sonMesaj = 0;
      // TikTok olayları yalnız aktif panele gider (iki panel aynı hediyeyi iki kez saymasın).
      // Aktif panel yokken (sekme yenileniyor) biriktirilir, panel dönünce verilir: coin kaybolmaz.
      const birikmis = [];
      let sonDurum = 'kapalı (.env içinde TIKTOK_USERNAME yok)';
      const panelCanli = () => aktif && Date.now() - sonMesaj < 2000;
      const tiktokOlay = (o) => {
        if (panelCanli()) aktif.send('dernek:tiktok', o);
        else if (birikmis.push(o) > 5000) birikmis.shift();
      };
      const tiktokDurum = (d) => { sonDurum = d; console.log(`[tiktok] ${d}`); server.ws.send('dernek:tiktokDurum', d); };
      if (process.env.TIKTOK_USERNAME) tiktokBaslat(process.env.TIKTOK_USERNAME, tiktokOlay, tiktokDurum);

      server.ws.on('dernek:panel', (veri, client) => {
        const simdi = Date.now();
        if (aktif && aktif !== client && simdi - sonMesaj < 2000) return client.send('dernek:panelMesgul', {});
        if (aktif !== client) client.send('dernek:tiktokDurum', sonDurum);
        aktif = client; sonMesaj = simdi;
        for (const o of birikmis.splice(0)) client.send('dernek:tiktok', o);
        server.ws.send('dernek:oyun', veri);
      });
      server.ws.on('dernek:fps', (fps) => console.log(`[oyun] ${fps} fps`)); // ?fps ile açılan oyun bildirir
    },
  }],
};
