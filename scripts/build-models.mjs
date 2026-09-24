// Baut die eigenen 3D-Modelle mit Blender (ohne Fenster) nach public/assets/models.
// Aufruf: npm run models                 alle Modelle
//         npm run models -- --preview    zusätzlich Vorschaubilder nach blender/preview
//         npm run models -- wolf natter  nur bestimmte Modelle
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const base = 'C:\\Program Files\\Blender Foundation';
  if (existsSync(base)) {
    const versions = readdirSync(base).filter((d) => d.startsWith('Blender')).sort().reverse();
    for (const v of versions) {
      const exe = join(base, v, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return 'blender';
}

const blender = findBlender();
const args = ['--background', '--factory-startup', '--python', join(root, 'blender', 'build_models.py'), '--', ...process.argv.slice(2)];
console.log(`Blender: ${blender}`);
const res = spawnSync(blender, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = (res.stdout || '') + (res.stderr || '');
for (const line of out.split(/\r?\n/)) {
  if (/^(EXPORT|PREVIEW|PROP|BUILD_DONE)|Error|Traceback|File "|^\s{2,}\S/.test(line)) console.log(line);
}
if (res.status !== 0 || !out.includes('BUILD_DONE')) {
  console.error('Modellbau fehlgeschlagen.');
  process.exit(1);
}
