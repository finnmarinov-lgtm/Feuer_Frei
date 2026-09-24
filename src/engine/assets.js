import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE = import.meta.env.BASE_URL + 'assets/';

// Nur was die Arena wirklich nutzt (die Kisten bringen ihre Holztextur im Modell mit)
export const TEXTURE_SETS = [
  'sandy_gravel_02', 'sandstone_blocks_08', 'patterned_clay_plaster', 'concrete_floor_worn_001',
  'rusty_corrugated_iron',
];
export const MODELS = ['wolf', 'luchs', 'falke', 'keiler', 'adler', 'natter', 'kobra', 'messer', 'he', 'flash', 'smoke', 'crates', 'target', 'props', 'soldier'];

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const hdrLoader = new HDRLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = (url, srgb) => texLoader.loadAsync(url).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  const textures = {};
  const jobs = [];
  for (const id of TEXTURE_SETS) {
    const dir = `${BASE}textures/${id}/`;
    jobs.push(Promise.all([tex(dir + 'diff.jpg', true), tex(dir + 'nor.jpg', false), tex(dir + 'arm.jpg', false)])
      .then(([diff, nor, arm]) => { textures[id] = { diff, nor, arm }; }));
  }

  const models = {};
  for (const name of MODELS) {
    jobs.push(gltfLoader.loadAsync(`${BASE}models/${name}.glb`).then((g) => { models[name] = g.scene; }));
  }
  let sky = null;
  jobs.push(hdrLoader.loadAsync(`${BASE}hdri/sky.hdr`).then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    sky = t;
  }));

  await Promise.all(jobs);
  return { textures, models, sky };
}

/** Findet die hellste Stelle im HDR-Himmel und gibt die Sonnenrichtung zurück. */
export function findSunDirection(hdr) {
  const { width, height, data } = hdr.image;
  const half = hdr.type === THREE.HalfFloatType;
  const f = half ? THREE.DataUtils.fromHalfFloat : (v) => v;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const lum = f(data[i]) * 0.2126 + f(data[i + 1]) * 0.7152 + f(data[i + 2]) * 0.0722;
      if (lum > best) { best = lum; bx = x; by = y; }
    }
  }
  const u = (bx + 0.5) / width;
  let v = 1 - (by + 0.5) / height;
  const dirFrom = (vv) => {
    const phi = (u - 0.5) * Math.PI * 2;
    const theta = (vv - 0.5) * Math.PI;
    return new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
  };
  let dir = dirFrom(v);
  if (dir.y < 0) dir = dirFrom(1 - v);
  return dir.normalize();
}
