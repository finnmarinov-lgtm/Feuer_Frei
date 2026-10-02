import * as THREE from 'three';

// Oberflächen der Waffen: gemeinsame, kachelbare Bilder aus public/assets/textures/waffen (gebaut mit
// npm run models -- texturen). Sie enthalten nur Abweichungen: Farbe und Rauheit als Faktoren knapp
// unter 1, dazu das Relief. Grundfarbe, Rauheit und Metall bleiben im Material aus Blender. So teilen
// sich alle Waffen dieselben Bilder (einmal geladen, einmal im Grafikspeicher), und eine Waffe in
// fremder Hand, die ohne Texturen zusammengefasst wird, sieht fast gleich aus (siehe merge.js).

export const SURFACE_SETS = ['abnutzung', 'gebuerstet', 'korn', 'holz', 'narbung', 'stoff'];

// abgegriffene Kanten: Farbe und Rauheit des blanken Materials darunter, Stärke
const BARE_STEEL = { color: [0.3, 0.3, 0.31], rough: 0.22, amount: 0.85 };
const WEAR = {
  steel: BARE_STEEL,
  alu: { color: [0.5, 0.51, 0.53], rough: 0.3, amount: 0.8 },
  wood: { color: [0.5, 0.25, 0.11], rough: 0.5, amount: 0.6 },
  polymer: { color: [0.075, 0.075, 0.08], rough: 0.32, amount: 0.6 },
  olive: { color: [0.3, 0.32, 0.2], rough: 0.5, amount: 0.5 },
};

// Material (Name aus Blender) -> [Oberfläche, Wiederholungen pro 10 cm, Stärke des Reliefs, Kanten]
const SURFACES = {
  Gunmetal: ['abnutzung', 1, 0.6, WEAR.steel],
  ShotgunReceiver: ['abnutzung', 1, 0.6, WEAR.steel],
  GunDark: ['abnutzung', 1.4, 0.35, WEAR.steel],
  FuzeMetal: ['abnutzung', 1.5, 0.4, WEAR.steel],
  Anodized: ['korn', 1.5, 0.25, WEAR.alu],
  Steel: ['gebuerstet', 1, 0.4, null],
  FlashBody: ['gebuerstet', 1, 0.3, null],
  Polymer: ['korn', 1.2, 0.5, WEAR.polymer],
  GrenadeOlive: ['korn', 1.5, 0.3, WEAR.steel],
  SmokeBody: ['korn', 1.5, 0.3, WEAR.steel],
  Rubber: ['narbung', 1.6, 0.5, null],
  OliveStock: ['narbung', 1, 0.5, WEAR.olive],
  Wood: ['holz', 0.5, 0.4, WEAR.wood],
  Glove: ['korn', 2, 0.8, null],
  Sleeve: ['stoff', 1, 0.6, null],
};

// nur Waffen, Messer und Granaten (Figur, Kisten und Kulissen haben keine Textur-Koordinaten dafür)
const MODELS = ['wolf', 'luchs', 'falke', 'keiler', 'adler', 'natter', 'kobra', 'karambit', 'butterfly', 'he', 'flash', 'smoke'];

/** sets: { name: { col, arm, nor } } (Texturen); legt sie auf die passenden Materialien der Modelle */
export function applySurfaces(models, sets) {
  // eigene Kopie je Oberfläche und Wiederholung: teilt sich das Bild (und den Grafikspeicher) mit
  // dem Original, nur die Kachelgröße ist eine andere
  const copies = new Map();
  const tex = (set, kind, repeat) => {
    const key = `${set}|${kind}|${repeat}`;
    let t = copies.get(key);
    if (!t) {
      t = sets[set][kind].clone();
      t.repeat.set(repeat, repeat);
      copies.set(key, t);
    }
    return t;
  };
  const done = new Set();
  for (const name of MODELS) {
    models[name]?.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.uv) return;
      const m = o.material;
      const s = SURFACES[m.name];
      // Teile mit eigener Textur (Natter, Messer) behalten sie
      if (!s || done.has(m) || m.map || m.normalMap || m.roughnessMap) return;
      done.add(m);
      const [set, repeat, strength, wear] = s;
      m.map = tex(set, 'col', repeat);
      m.roughnessMap = m.metalnessMap = tex(set, 'arm', repeat);
      m.normalMap = tex(set, 'nor', repeat);
      m.normalScale.set(strength, strength);
      if (wear) wornEdges(m, wear);
      m.needsUpdate = true;
    });
  }
}

/**
 * Abgegriffene Kanten: Wo die Oberfläche stark gekrümmt ist (die gerundeten Kanten, Radius unter
 * etwa 8 mm), schimmert fleckig das blanke Material durch. Die Krümmung kommt aus der Änderung der
 * Flächenrichtung je Meter auf dem Bildschirm, gilt also auf jede Entfernung gleich; die Flecken aus
 * dem roten Kanal der Oberfläche (arm.r). Skins ersetzen das Material und haben das nicht.
 */
function wornEdges(m, wear) {
  const uniforms = {
    ffWearColor: { value: new THREE.Color(...wear.color) },
    ffWearRough: { value: wear.rough },
    ffWearAmount: { value: wear.amount },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 ffWearColor;\nuniform float ffWearRough;\nuniform float ffWearAmount;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  {
    float ffCurve = length(fwidth(vNormal)) / max(length(fwidth(vViewPosition)), 1e-6);
    float ffWear = smoothstep(90.0, 220.0, ffCurve) * smoothstep(0.35, 0.7, texelRoughness.r) * ffWearAmount;
    diffuseColor.rgb = mix(diffuseColor.rgb, ffWearColor, ffWear);
    roughnessFactor = mix(roughnessFactor, ffWearRough, ffWear);
  }`);
  };
  m.customProgramCacheKey = () => 'ff-wear';
}
