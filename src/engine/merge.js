import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];

/**
 * Fasst Einzelteile zusammen: Alle Mesh-Kinder eines Knotens mit demselben Material werden
 * ein einziges Mesh (ein Zeichenaufruf statt vieler). Die Knoten selbst bleiben erhalten,
 * damit bewegliche Teile (Magazin, Schlitten, Gelenke) weiter animiert werden können.
 * Namen einzelner Teile gehen dabei verloren, also vorher nach Namen suchen oder entfernen.
 */
export function mergeByMaterial(root) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  for (const node of nodes) {
    const groups = new Map();
    for (const c of node.children) {
      if (!c.isMesh || !c.visible || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || Array.isArray(c.material)) continue;
      if (!groups.has(c.material)) groups.set(c.material, []);
      groups.get(c.material).push(c);
    }
    for (const [material, list] of groups) {
      if (list.length < 2) continue;
      const merged = mergeList(list, material);
      if (!merged) continue;
      node.add(merged);
      for (const m of list) node.remove(m);
    }
  }
  return root;
}

function mergeList(list, material) {
  let geos = list.map((m) => {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    // gespiegelte Teile: Dreiecke umdrehen, sonst zeigt die Vorderseite nach innen
    if (m.matrix.determinant() < 0 && g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    return g;
  });
  // nur Attribute, die alle Teile haben (UVs nur, wenn das Material keine Textur braucht, verzichtbar)
  const common = Object.keys(geos[0].attributes).filter((a) => geos.every((g) => g.attributes[a]));
  const textured = TEXTURE_SLOTS.some((s) => material[s]);
  if (textured && !common.includes('uv')) return null;
  for (const g of geos) {
    for (const a of Object.keys(g.attributes)) if (!common.includes(a)) g.deleteAttribute(a);
    for (const a of Object.keys(g.morphAttributes)) delete g.morphAttributes[a];
  }
  if (!geos.every((g) => g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const geometry = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  const first = list[0];
  mesh.name = first.name;
  mesh.castShadow = list.some((m) => m.castShadow);
  mesh.receiveShadow = list.some((m) => m.receiveShadow);
  mesh.frustumCulled = first.frustumCulled;
  mesh.renderOrder = first.renderOrder;
  return mesh;
}

// ---------- Figuren: ganze Modelle zusammenfassen ----------

/**
 * Material für zusammengefasste einfarbige Teile: Farbe (color), Rauheit und Metall (surface) kommen
 * je Ecke aus der Geometrie, so teilen sich Teile mit verschiedenen Materialien einen Zeichenaufruf.
 */
export function surfaceMaterial(name = 'Teile') {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true });
  m.name = name;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 surface;\nvarying vec2 vSurface;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurface;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.y;');
  };
  m.customProgramCacheKey = () => 'surface';
  return m;
}

const textured = (m) => TEXTURE_SLOTS.some((s) => m[s]);

/**
 * Teile nach Material ordnen: jedes Material aus keep (Skins, Teamfarbe) und (mit splitTextured) jedes
 * mit Textur bleibt für sich, alle anderen landen zusammen unter '' (für surfaceMaterial).
 */
function groupParts(parts, keep, splitTextured = true) {
  const groups = new Map();
  for (const p of parts) {
    const key = keep.includes(p.material.name) || (splitTextured && textured(p.material)) ? p.material.name : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

/**
 * Geometrie der Teile in einem gemeinsamen Raum (to: Welt -> dieser Raum), zu einer zusammengefasst.
 * surface: Farbe, Rauheit und Metall der Materialien je Ecke mitschreiben; bone(p): Knochen, an dem
 * das Teil fest hängt (für SkinnedMesh).
 */
function bake(parts, to, surface, bone = null) {
  const m = new THREE.Matrix4();
  const geos = parts.map((p) => {
    m.multiplyMatrices(to, p.matrixWorld);
    const g = p.geometry.clone().applyMatrix4(m);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g.setIndex([...Array(n).keys()]);
    // gespiegelte Teile: Dreiecke umdrehen, sonst zeigt die Vorderseite nach innen
    if (m.determinant() < 0) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    for (const a of Object.keys(g.morphAttributes)) delete g.morphAttributes[a];
    if (surface) {
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      const { color, roughness, metalness } = p.material;
      const col = new Float32Array(n * 3);
      const sur = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;
        sur[i * 2] = roughness;
        sur[i * 2 + 1] = metalness;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('surface', new THREE.BufferAttribute(sur, 2));
    }
    if (bone) {
      const index = new Uint16Array(n * 4);
      const weight = new Float32Array(n * 4);
      const b = bone(p);
      for (let i = 0; i < n; i++) {
        index[i * 4] = b;
        weight[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
    }
    return g;
  });
  // nur Attribute, die alle Teile haben
  const common = Object.keys(geos[0].attributes).filter((a) => geos.every((g) => g.attributes[a]));
  for (const g of geos) for (const a of Object.keys(g.attributes)) if (!common.includes(a)) g.deleteAttribute(a);
  const geometry = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  if (geos.length > 1) for (const g of geos) g.dispose();
  if (geometry) geometry.computeBoundingSphere();
  return geometry;
}

// zusammengefasste Geometrie je Vorlage (alle Kopien eines Modells teilen sich die Geometrie ihrer Teile)
const skinCache = new WeakMap();
const flatCache = new WeakMap();

/**
 * Figur aus starren Teilen, die an Gelenken hängen: wird zu biegsamen Modellen (SkinnedMesh) mit den
 * Gelenken als Knochen, je eins pro Gruppe (siehe groupParts). Die Teile verschwinden, die Gelenke
 * bleiben und bewegen die Modelle wie vorher; unsichtbar wird ein Gelenk samt Teilen mit Größe 0.
 * Liefert die neuen Meshes.
 */
export function skinParts(root, keep = []) {
  root.updateWorldMatrix(true, true);
  const parts = [];
  root.traverse((o) => { if (o.isMesh) parts.push(o); });
  if (!parts.length) return [];
  const bones = [...new Set(parts.map((p) => p.parent))];
  const groups = groupParts(parts, keep);
  let baked = skinCache.get(parts[0].geometry);
  if (!baked) {
    const to = root.matrixWorld.clone().invert();
    baked = [...groups].map(([name, list]) => ({ name, geometry: bake(list, to, !name, (p) => bones.indexOf(p.parent)) }));
    skinCache.set(parts[0].geometry, baked);
  }
  const skeleton = new THREE.Skeleton(bones);
  const out = baked.map(({ name, geometry }) => {
    const list = groups.get(name);
    const mesh = new THREE.SkinnedMesh(geometry, name ? list[0].material : surfaceMaterial());
    mesh.name = name || 'Teile';
    mesh.castShadow = list.some((p) => p.castShadow);
    mesh.receiveShadow = list.some((p) => p.receiveShadow);
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    // Kugel fürs Ausblenden außerhalb des Bilds: Ruhelage plus Spielraum für die Bewegungen
    mesh.boundingSphere = geometry.boundingSphere.clone();
    mesh.boundingSphere.radius += 0.5;
    return mesh;
  });
  for (const p of parts) p.removeFromParent();
  return out;
}

/**
 * Modell, dessen Teile sich nicht mehr gegeneinander bewegen (Waffe in fremder Hand), ganz
 * zusammenfassen: je ein Mesh pro Gruppe (siehe groupParts). Texturen von Teilen ohne Skin fallen
 * dabei weg (so klein sieht man sie nicht, ein Zeichenaufruf weniger je Material); Farbe, Rauheit und
 * Metall kommen aus dem Material. Alle anderen Knoten verschwinden bis auf die mit Namen in nodes
 * (z. B. die Mündung), die an ihrer Stelle direkt unter dem Modell bleiben.
 */
export function flattenParts(model, keep = [], nodes = []) {
  model.updateWorldMatrix(true, true);
  const to = model.matrixWorld.clone().invert();
  const parts = [];
  model.traverse((o) => { if (o.isMesh && o.visible) parts.push(o); });
  const kept = [];
  model.traverse((o) => { if (o !== model && nodes.includes(o.name)) kept.push(o); });
  for (const o of kept) {
    o.matrix.multiplyMatrices(to, o.matrixWorld).decompose(o.position, o.quaternion, o.scale);
  }
  const groups = groupParts(parts, keep, false);
  let baked = parts.length ? flatCache.get(parts[0].geometry) : [];
  if (!baked) {
    // die Waffe schimmert nie: alle Kopien teilen sich auch das Material der einfarbigen Teile
    baked = [...groups].map(([name, list]) => ({ name, geometry: bake(list, to, !name), surface: name ? null : surfaceMaterial() }));
    flatCache.set(parts[0].geometry, baked);
  }
  for (const c of [...model.children]) model.remove(c);
  for (const { name, geometry, surface } of baked) {
    const list = groups.get(name);
    const mesh = new THREE.Mesh(geometry, surface ?? list[0].material);
    mesh.name = name || 'Teile';
    mesh.castShadow = list.some((p) => p.castShadow);
    mesh.receiveShadow = list.some((p) => p.receiveShadow);
    model.add(mesh);
  }
  for (const o of kept) {
    o.clear();
    model.add(o);
  }
  return model;
}
