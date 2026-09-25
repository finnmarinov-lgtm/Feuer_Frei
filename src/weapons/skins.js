import * as THREE from 'three';

// Messer-Skin "Regenbogen": das Geschenk für einen Sieg gegen die KI auf "Schwer" (Easter Egg).
// Die Klinge schimmert in allen Farben: ein Farbverlauf vom Griff bis zur Spitze, der langsam
// weiterwandert. Griff und Ring bleiben dunkel, damit die Farben leuchten. Ob man den Skin hat,
// steht im Browser-Speicher; welchen man trägt, in den Einstellungen (knifeFinish).

export const KNIFE_FINISHES = {
  standard: { name: 'Standard (Stahl)' },
  regenbogen: { name: 'Regenbogen' },
};
const UNLOCK_KEY = 'feuer-frei-geschenke';
// Materialnamen der Klingen aus dem Blender-Modell
const BLADES = ['KarambitSteel', 'ButterflySteel'];

const _v = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _c = new THREE.Color();
const rainbowMats = new Map();

/** freigeschaltete Skins (Ids) */
export function unlockedFinishes() {
  try {
    const list = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => KNIFE_FINISHES[id]) : [];
  } catch {
    return [];
  }
}

/** Skin freischalten; true, wenn er neu ist */
export function unlockFinish(id) {
  const list = unlockedFinishes();
  if (list.includes(id)) return false;
  list.push(id);
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(list));
  } catch {
    // ohne Speicher gilt das Geschenk nur bis zum Neuladen
  }
  return true;
}

/** gültiger Skin für ein Messer: nur freigeschaltete, sonst Stahl (null) */
export function finishOrNull(id) {
  return id && id !== 'standard' && KNIFE_FINISHES[id] ? id : null;
}

// Kopie des Klingenmaterials: Farbe aus den Eckpunkten, dazu ein Hauch Eigenleuchten in derselben
// Farbe, damit die Klinge auch im Schatten bunt bleibt
function rainbowMaterial(base) {
  let m = rainbowMats.get(base);
  if (m) return m;
  m = base.clone();
  m.name = `${base.name}Regenbogen`;
  m.color.setRGB(1, 1, 1);
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.2;',
    );
  };
  m.customProgramCacheKey = () => 'regenbogen';
  rainbowMats.set(base, m);
  return m;
}

// Klingen eines Messer-Modells finden und vorbereiten: eigene Geometrie mit Farben und für jeden
// Eckpunkt seine Lage zwischen Griff (0) und Spitze (1)
function blades(model) {
  if (model.userData.blades) return model.userData.blades;
  const list = [];
  model.updateMatrixWorld(true);
  const tip = model.getObjectByName('Tip');
  if (tip) tip.getWorldPosition(_tip);
  model.traverse((o) => {
    if (!o.isMesh || !BLADES.includes(o.material.name)) return;
    const geo = o.geometry.clone();
    o.geometry = geo;
    const pos = geo.attributes.position;
    const u = new Float32Array(pos.count);
    let max = 1e-6;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      u[i] = tip ? _v.distanceTo(_tip) : -_v.z;
      max = Math.max(max, u[i]);
    }
    for (let i = 0; i < u.length; i++) u[i] = 1 - u[i] / max;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    list.push({ mesh: o, u, steel: o.material });
  });
  model.userData.blades = list;
  return list;
}

/** Messer-Modell (Ego-Ansicht oder Figur) mit Skin versehen oder zurück auf Stahl (finish = null) */
export function setKnifeFinish(model, finish) {
  const on = finishOrNull(finish) === 'regenbogen';
  if (!on && !model.userData.blades) return;
  for (const b of blades(model)) b.mesh.material = on ? rainbowMaterial(b.steel) : b.steel;
  model.userData.finish = on ? 'regenbogen' : null;
  if (on) animateKnife(model, performance.now() / 1000);
}

/** Farben weiterwandern lassen (pro Bild, nur solange das Messer zu sehen ist) */
export function animateKnife(model, t) {
  if (model.userData.finish !== 'regenbogen') return;
  for (const b of model.userData.blades) {
    const col = b.mesh.geometry.attributes.color;
    const a = col.array;
    for (let i = 0; i < b.u.length; i++) {
      // Rot am Griff über Gelb, Grün und Blau bis Violett an der Spitze
      _c.setHSL((b.u[i] * 0.82 + t * 0.15) % 1, 1, 0.52, THREE.SRGBColorSpace);
      a[i * 3] = _c.r;
      a[i * 3 + 1] = _c.g;
      a[i * 3 + 2] = _c.b;
    }
    col.needsUpdate = true;
  }
}
