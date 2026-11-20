// Çalıştır: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from './engine.js';

const yeni = (ek = {}) => {
  const t = { s: 0 };
  const config = { ...JSON.parse(readFileSync(new URL('../../config/game.json', import.meta.url))), ...ek };
  return { e: createEngine({ config, saat: () => t.s }), t };
};
const yorum = (e, id) => e.olayIsle({ tip: 'yorum', userId: id, ad: id, metin: 'selam' });
const hediye = (e, id, coin, ad = 'Rose') => e.olayIsle({ tip: 'hediye', userId: id, ad: id, coin, hediye: ad });

test('yorum atan oturur, aynı kişi ikinci koltuk almaz', () => {
  const { e } = yeni();
  yorum(e, 'a'); yorum(e, 'b'); yorum(e, 'a');
  assert.deepEqual(e.snapshot().uyeler.map((u) => [u.userId, u.koltuk]), [['a', 0], ['b', 1]]);
});

test('en çok coin atan lider, eşitlikte eski lider kalır', () => {
  const { e } = yeni();
  hediye(e, 'a', 10);
  assert.equal(e.snapshot().lider, 'a');
  hediye(e, 'b', 10);
  assert.equal(e.snapshot().lider, 'a');
  assert.ok(hediye(e, 'b', 1).some((o) => o.tip === 'liderDegisti' && o.yeni === 'b'));
});

test('hediye türüne göre eylem, süre dolunca biter', () => {
  const { e, t } = yeni();
  hediye(e, 'a', 1, 'Rose');
  assert.equal(e.snapshot().uyeler[0].eylem, 'kaydir');
  hediye(e, 'b', 1, 'Bilinmeyen');
  assert.equal(e.snapshot().uyeler[1].eylem, null);
  t.s = 25;
  assert.equal(e.tick()[0].tip, 'eylemBitti');
  assert.equal(e.snapshot().uyeler[0].eylem, null);
});

const odadakiler = (e) => e.snapshot().uyeler.map((u) => u.userId).sort();

test('kuyruk: oda dolunca sıraya girer, ilk giren minKalmaSn sonra ilk çıkar, lider çıkmaz', () => {
  const { e, t } = yeni({ odaKapasite: 3, minKalmaSn: 60 });
  hediye(e, 'lider', 5); t.s = 1; yorum(e, 'b'); t.s = 2; yorum(e, 'c');
  t.s = 3; yorum(e, 'd'); yorum(e, 'f'); yorum(e, 'd');      // dolu: d, f sırada (d bir kez)
  assert.deepEqual(e.snapshot().sira, ['d', 'f']);
  t.s = 50; e.tick();
  assert.deepEqual(odadakiler(e), ['b', 'c', 'lider']);    // henüz kimse 60 sn oturmadı
  t.s = 61; e.tick();                                        // b (61 sn) çıkar, d girer; c (59 sn) kalır
  assert.deepEqual(odadakiler(e), ['c', 'd', 'lider']);
  assert.deepEqual(e.snapshot().sira, ['f']);
  t.s = 62; e.tick();
  assert.deepEqual(odadakiler(e), ['d', 'f', 'lider']);
});

test('bağış atan sıra beklemez, en eskinin yerine hemen girer; coin odadan çıkınca da kalır', () => {
  const { e, t } = yeni({ odaKapasite: 2, minKalmaSn: 60 });
  yorum(e, 'a'); t.s = 1; yorum(e, 'b'); yorum(e, 'c');
  hediye(e, 'zengin', 10);
  assert.deepEqual(odadakiler(e), ['b', 'zengin']);
  assert.deepEqual(e.snapshot().sira, ['c']);
  assert.equal(e.snapshot().lider, 'zengin');
});

test('durum kaydet/yükle', () => {
  const { e } = yeni();
  hediye(e, 'a', 3);
  const { e: e2 } = yeni();
  e2.yukle(e.durum());
  assert.deepEqual(e2.snapshot(), e.snapshot());
});
