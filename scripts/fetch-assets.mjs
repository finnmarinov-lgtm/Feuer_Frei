// Lädt die benötigten CC0-Dateien von Poly Haven (https://polyhaven.com).
// Himmel und Texturen landen direkt in public/assets, die Requisiten als Quelle in assets-src/polyhaven
// (daraus baut "npm run models" die optimierte public/assets/models/props.glb).
// Aufruf: npm run assets   (bereits vorhandene Dateien werden übersprungen)
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets-src', 'polyhaven');
const API = 'https://api.polyhaven.com/files/';
const HEADERS = { 'User-Agent': 'feuer-frei-asset-script/1.0' };

const HDRI = { id: 'kloofendal_48d_partly_cloudy_puresky', res: '2k' };

// id -> Auflösung
const TEXTURES = {
  sandy_gravel_02: '2k',
  sandstone_blocks_08: '1k',
  patterned_clay_plaster: '1k',
  concrete_floor_worn_001: '1k',
  rusty_corrugated_iron: '1k',
  wood_planks: '1k',
};
const TEXTURE_MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };

const MODELS = ['Barrel_01', 'barrel_03', 'concrete_road_barrier', 'wooden_crate_02', 'old_military_crate', 'metal_jerrycan'];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url, dest) {
  if (await exists(dest)) return 0;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} bei ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

async function info(id) {
  const res = await fetch(API + id, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} bei Poly-Haven-Info für ${id}`);
  return res.json();
}

let total = 0;
const log = (name, bytes) => {
  total += bytes;
  console.log(bytes ? `  geladen  ${name} (${(bytes / 1024 / 1024).toFixed(2)} MB)` : `  vorhanden ${name}`);
};

console.log('Himmel (HDRI)');
{
  const j = await info(HDRI.id);
  const f = j.hdri[HDRI.res].hdr;
  log(`hdri/sky.hdr`, await download(f.url, join(ROOT, 'hdri', 'sky.hdr')));
}

console.log('Texturen');
for (const [id, res] of Object.entries(TEXTURES)) {
  const j = await info(id);
  for (const [key, short] of Object.entries(TEXTURE_MAPS)) {
    const f = j[key][res].jpg;
    log(`textures/${id}/${short}.jpg`, await download(f.url, join(ROOT, 'textures', id, `${short}.jpg`)));
  }
}

console.log('Modelle');
for (const id of MODELS) {
  const j = await info(id);
  const g = j.gltf['1k'].gltf;
  const dir = join(SRC, id);
  log(`assets-src/polyhaven/${id}/${id}.gltf`, await download(g.url, join(dir, `${id}.gltf`)));
  for (const [rel, f] of Object.entries(g.include)) {
    log(`assets-src/polyhaven/${id}/${rel}`, await download(f.url, join(dir, rel)));
  }
}

console.log(`Fertig, neu geladen: ${(total / 1024 / 1024).toFixed(1)} MB`);
