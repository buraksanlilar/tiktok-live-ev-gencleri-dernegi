// Panel → oyun köprüsü.
// Geliştirme sunucusunda (npm run dev) mesajlar Vite'ın WebSocket'i üzerinden tüm açık sayfalara gider:
// panel Chrome'da, oyun OBS'in Browser Source'unda (ayrı tarayıcı) olsa da çalışır.
// Vite yoksa (build çıktısı) aynı tarayıcıdaki sekmeler arası BroadcastChannel'a düşer.
// Tek yol seçilir ki aynı mesaj iki kez gelmesin (hediye iki kez sayılmasın).
const hot = import.meta.hot;
const bc = hot ? null : new BroadcastChannel('dernek');

export const panelGonder = (veri) => (hot ? hot.send('dernek:panel', veri) : bc.postMessage(veri));

/** Başka bir panel zaten oyuna bağlıysa çağrılır (yalnız Vite köprüsünde). */
export const panelMesgul = (cb) => hot?.on('dernek:panelMesgul', cb);

export function oyunDinle(cb) {
  if (hot) hot.on('dernek:oyun', cb);
  else bc.onmessage = (e) => cb(e.data);
}
