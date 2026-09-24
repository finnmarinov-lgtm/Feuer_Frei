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
