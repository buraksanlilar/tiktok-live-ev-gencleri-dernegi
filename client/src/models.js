import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Blender'dan gelen modeller (kaynak: blender/*.py → client/public/models/*.glb). Her biri bir kez yüklenir, sonra klonlanır.
const loader = new GLTFLoader();
const cache = {};

/** @param {string} ad ör. "koltuk" → /models/koltuk.glb */
export const modelYukle = (ad) => (cache[ad] ??= loader.loadAsync(`${import.meta.env.BASE_URL}models/${ad}.glb`).then((g) => Object.assign(g.scene, { animations: g.animations })));

/** Klon (malzemeler paylaşılır; kişiye özel boyama gerekirse burada malzeme klonlanır). */
export const klonla = (kaynak) => clone(kaynak);
