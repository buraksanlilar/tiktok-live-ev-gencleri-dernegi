// Kamera yönetmeni: çekimler sırayla döner (sağdan genel, lider, soldan genel, lider...).
// Her çekim bir başlangıç→bitiş kayması; kamera hedefe yumuşak yaklaşır, çekim değişince süzülerek geçer.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ODA = v(0, 0.8, -4); // koltukların ortası

/** @param {THREE.Vector3} taht liderin oturduğu yer */
const cekimler = (taht) => [
  { ad: 'sag', sn: 9, bas: v(10.5, 6, 9), son: v(5, 4.5, 9), bak: [v(-2, 0.8, -6), v(2, 0.8, -4)] },
  { ad: 'lider', sn: 6, bas: v(2.2, 2.3, taht.z + 3.2), son: v(-1.4, 1.9, taht.z + 2.5), bak: [v(taht.x, 1.3, taht.z), v(taht.x, 1.25, taht.z)] },
  { ad: 'sol', sn: 9, bas: v(-10.5, 6, 9), son: v(-5, 4.5, 9), bak: [v(2, 0.8, -6), v(-2, 0.8, -4)] },
  { ad: 'ust', sn: 7, bas: v(0, 14, 10), son: v(0, 10, 6), bak: [ODA, ODA] },
  { ad: 'lider', sn: 6, bas: v(-2.2, 2.3, taht.z + 3.2), son: v(1.4, 1.9, taht.z + 2.5), bak: [v(taht.x, 1.3, taht.z), v(taht.x, 1.25, taht.z)] },
];

export function createKamera(camera, taht) {
  const liste = cekimler(taht);
  let i = 0, t = 0;
  const hedef = new THREE.Vector3(), bakis = liste[0].bak[0].clone(), bakHedef = new THREE.Vector3();
  camera.position.copy(liste[0].bas);

  return {
    /** @param {boolean} liderVar lider yoksa lider çekimleri atlanır */
    update(dt, liderVar) {
      t += dt;
      if (t >= liste[i].sn || (liste[i].ad === 'lider' && !liderVar)) {
        t = 0;
        do i = (i + 1) % liste.length; while (liste[i].ad === 'lider' && !liderVar);
      }
      const c = liste[i], k = THREE.MathUtils.smoothstep(t / c.sn, 0, 1);
      hedef.lerpVectors(c.bas, c.son, k);
      bakHedef.lerpVectors(c.bak[0], c.bak[1], k);
      const a = 1 - Math.exp(-2.2 * dt); // süzülme hızı: çekim geçişleri kesme değil kayma
      camera.position.lerp(hedef, a);
      bakis.lerp(bakHedef, a);
      camera.lookAt(bakis);
    },
  };
}
