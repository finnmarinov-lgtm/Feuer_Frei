import * as THREE from 'three';

// Oberflächen für Skins (Waffen, Messer, Spieler): Tarnmuster, Metall, Lack und bewegte Muster.
// Muster wie Tarnflecken, Lava oder Sterne rechnet der Shader aus der Lage im Modell (keine
// Texturen, keine UVs nötig): so sehen alle Teile einer Waffe zusammenhängend aus, auch zusammen-
// gefasste Teile ohne UVs. Bewegte Muster laufen über eine gemeinsame Uhr (tickFinishes).

const hex = (h) => new THREE.Color(h);

export const FINISHES = {
  standard: { name: 'Standard' },
  // Tarnmuster: vier Farben in unregelmäßigen Flecken (digital: eckige Pixelflecken)
  wueste: { name: 'Wüstentarn', kind: 'camo', colors: ['#cdb07c', '#9d7b4b', '#6f5536', '#e3d1aa'] },
  wald: { name: 'Waldtarn', kind: 'camo', colors: ['#56663a', '#2f3b22', '#7a7446', '#1c2217'] },
  arktis: { name: 'Arktis', kind: 'camo', digital: true, colors: ['#e8ecef', '#b3bdc6', '#8793a0', '#d3d9de'] },
  nacht: { name: 'Nachttarn', kind: 'camo', digital: true, colors: ['#3b414b', '#23272e', '#5a626e', '#15171b'] },
  // Metall und Lack
  gold: { name: 'Gold', kind: 'metal', color: '#e0ad3c', rough: 0.2 },
  chrom: { name: 'Chrom', kind: 'metal', color: '#e8ecef', rough: 0.07 },
  kupfer: { name: 'Kupfer', kind: 'metal', color: '#d07a45', rough: 0.3 },
  kirsch: { name: 'Kirschrot', kind: 'paint', color: '#a8141d', rough: 0.35 },
  ozean: { name: 'Ozeanblau', kind: 'paint', color: '#18528f', rough: 0.35 },
  // bewegte Muster
  regenbogen: { name: 'Regenbogen', kind: 'rainbow' },
  lava: { name: 'Lava', kind: 'lava' },
  neon: { name: 'Neon', kind: 'neon' },
  galaxie: { name: 'Galaxie', kind: 'galaxy' },
};

// gemeinsame Uhr aller bewegten Muster (Sekunden)
const TIME = { value: 0 };

/** pro Bild: bewegte Muster weiterlaufen lassen */
export function tickFinishes(t) {
  TIME.value = t % 1000;
}

// Rauschen in 3D (Wertrauschen mit Überlagerung), dazu HSV -> RGB
const NOISE = /* glsl */ `
varying vec3 vFfPos;
uniform float uFfTime;
uniform float uFfScale;
uniform vec3 uFfC0;
uniform vec3 uFfC1;
uniform vec3 uFfC2;
uniform vec3 uFfC3;
float ffHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ffNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ffHash(i), ffHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(ffHash(i + vec3(0.0, 1.0, 0.0)), ffHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(ffHash(i + vec3(0.0, 0.0, 1.0)), ffHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(ffHash(i + vec3(0.0, 1.0, 1.0)), ffHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float ffFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    v += a * ffNoise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
vec3 ffHsv(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

// Farbe (diffuseColor) und Leuchten (ffGlow) je Muster, p = Lage im Modell mal Maßstab
const PATTERN = {
  camo: /* glsl */ `
    #ifdef FF_DIGITAL
      p = floor(p * 3.0) / 3.0;
    #endif
    vec3 ffCol = uFfC0;
    ffCol = mix(ffCol, uFfC1, step(0.49, ffFbm(p)));
    ffCol = mix(ffCol, uFfC2, step(0.57, ffFbm(p * 1.6 + 7.3)));
    ffCol = mix(ffCol, uFfC3, step(0.62, ffFbm(p * 0.7 + 19.1)));
    diffuseColor.rgb = ffCol;`,
  rainbow: /* glsl */ `
    float ffH = fract(dot(vFfPos, vec3(0.35, 0.9, 1.6)) * uFfScale * 0.12 + uFfTime * 0.15);
    diffuseColor.rgb = ffHsv(vec3(ffH, 0.85, 0.95));
    ffGlow = diffuseColor.rgb * 0.22;`,
  lava: /* glsl */ `
    // dunkles Gestein mit dünnen, glühenden Rissen, die langsam fließen und pulsieren
    vec3 q = p * 0.9 + vec3(0.0, -uFfTime * 0.3, uFfTime * 0.12);
    float ffR = abs(ffFbm(q) - 0.5);
    float ffCrack = 1.0 - smoothstep(0.004, 0.028, ffR);
    float ffHeat = 1.0 - smoothstep(0.0, 0.1, ffR);
    float ffPulse = 0.7 + 0.3 * sin(uFfTime * 2.6 + p.x * 1.5 + p.z);
    diffuseColor.rgb = mix(vec3(0.045, 0.04, 0.04), vec3(0.22, 0.06, 0.02), ffHeat);
    ffGlow = vec3(3.4, 1.0, 0.15) * ffCrack * ffPulse + vec3(0.35, 0.06, 0.0) * ffHeat * ffPulse;`,
  neon: /* glsl */ `
    float ffBand = dot(p, vec3(0.18, 0.35, 0.6));
    float ffL = abs(fract(ffBand) - 0.5);
    float ffLine = 1.0 - smoothstep(0.03, 0.08, ffL);
    vec3 ffTint = mod(floor(ffBand), 2.0) < 0.5 ? vec3(0.1, 2.3, 2.7) : vec3(2.5, 0.2, 2.1);
    diffuseColor.rgb = vec3(0.02, 0.02, 0.025);
    ffGlow = ffTint * ffLine * (0.55 + 0.45 * sin(uFfTime * 4.0 - ffBand * 2.5));`,
  galaxy: /* glsl */ `
    // tiefes Blau, darin lila und türkise Nebel, dazu funkelnde Sterne in zwei Größen
    vec3 ffDrift = vec3(uFfTime * 0.03, 0.0, uFfTime * 0.02);
    diffuseColor.rgb = vec3(0.008, 0.01, 0.04);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.05, 0.42), smoothstep(0.42, 0.72, ffFbm(p * 0.7 + ffDrift)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.26, 0.42), 0.8 * smoothstep(0.55, 0.8, ffFbm(p * 1.2 + 5.0 - ffDrift)));
    float ffStar = 0.0;
    for (int k = 0; k < 2; k++) {
      float ffS = k == 0 ? 1.1 : 2.6;
      vec3 ffCell = floor(p * ffS);
      float ffH = ffHash(ffCell + float(k) * 7.0);
      float ffTw = 0.55 + 0.45 * sin(uFfTime * 3.0 + ffH * 60.0);
      float ffDot = 1.0 - smoothstep(0.05, k == 0 ? 0.2 : 0.14, length(fract(p * ffS) - 0.5));
      ffStar += step(k == 0 ? 0.86 : 0.8, ffH) * ffDot * ffTw;
    }
    ffGlow = vec3(2.6, 2.6, 3.0) * ffStar + diffuseColor.rgb * 0.35;`,
};

const cache = new Map();

/**
 * Material mit Skin aus dem Original (einmal pro Original und Skin, danach aus dem Zwischenspeicher).
 * scale: Größe der Muster (Wiederholungen pro Meter): Waffen fein, Uniform grob.
 */
export function finishMaterial(base, id, scale = 22) {
  const f = FINISHES[id];
  if (!f || !f.kind) return base;
  const key = `${base.uuid}|${id}|${scale}`;
  let m = cache.get(key);
  if (m) return m;
  m = base.clone();
  m.name = `${base.name}_${id}`;
  // Muster und Metall ersetzen die Farbwerte der Vorlage, das Relief (normalMap) bleibt
  m.map = null;
  m.metalnessMap = null;
  m.roughnessMap = null;
  m.vertexColors = false;
  m.color.set(0xffffff);
  if (f.kind === 'metal' || f.kind === 'paint') {
    m.color.copy(hex(f.color));
    m.metalness = f.kind === 'metal' ? 1 : 0.15;
    m.roughness = f.rough;
  } else {
    m.metalness = { camo: 0.08, rainbow: 0.55, lava: 0.2, neon: 0.5, galaxy: 0.1 }[f.kind];
    m.roughness = { camo: 0.72, rainbow: 0.28, lava: 0.62, neon: 0.22, galaxy: 0.25 }[f.kind];
    const colors = (f.colors || ['#000', '#000', '#000', '#000']).map(hex);
    const uniforms = {
      uFfTime: TIME, uFfScale: { value: scale },
      uFfC0: { value: colors[0] }, uFfC1: { value: colors[1] }, uFfC2: { value: colors[2] }, uFfC3: { value: colors[3] },
    };
    const kind = f.kind;
    const digital = !!f.digital;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      if (digital) shader.defines = { ...shader.defines, FF_DIGITAL: '' };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFfPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFfPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 ffGlow = vec3(0.0);
  {
    vec3 p = vFfPos * uFfScale;
    ${PATTERN[kind]}
  }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += ffGlow;');
    };
    m.customProgramCacheKey = () => `ff-${kind}${digital ? '-d' : ''}`;
  }
  m.needsUpdate = true;
  cache.set(key, m);
  return m;
}

/**
 * Skin auf ein Modell legen: alle Meshes mit einem der Materialnamen in names bekommen die
 * Oberfläche id ('standard' oder null = zurück zum Original). Andere Teile bleiben, wie sie sind.
 */
export function applyFinish(model, names, id, scale = 22) {
  const list = (model.userData.ffParts ||= collect(model));
  for (const part of list) {
    if (!names.includes(part.name)) continue;
    part.mesh.material = FINISHES[id]?.kind ? finishMaterial(part.base, id, scale) : part.base;
  }
}

// alle Meshes mit ihrem Originalmaterial merken (einmal pro Modell)
function collect(model) {
  const list = [];
  model.traverse((o) => {
    if (o.isMesh && !Array.isArray(o.material)) list.push({ mesh: o, base: o.material, name: o.material.name });
  });
  return list;
}
