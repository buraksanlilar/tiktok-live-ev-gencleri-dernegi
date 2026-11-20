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

test('oda dolu: sessiz üye kalkar, lider kalkmaz, kimse sessiz değilse giremez', () => {
  const { e, t } = yeni({ odaKapasite: 2, uyeZamanAsimiDk: 1 });
  hediye(e, 'lider', 5); yorum(e, 'b');
  yorum(e, 'c');
  assert.equal(e.snapshot().uyeler.length, 2); // b henüz sessiz değil
  t.s = 120;
  yorum(e, 'c');
  assert.deepEqual(e.snapshot().uyeler.map((u) => u.userId).sort(), ['c', 'lider']);
});

test('durum kaydet/yükle', () => {
  const { e } = yeni();
  hediye(e, 'a', 3);
  const { e: e2 } = yeni();
  e2.yukle(e.durum());
  assert.deepEqual(e2.snapshot(), e.snapshot());
});
