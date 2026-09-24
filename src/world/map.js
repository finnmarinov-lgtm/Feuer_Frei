import * as THREE from 'three';
import { GROUP } from '../engine/physics.js';

// Arena "Hof": 60 x 40 m Innenhof, punktsymmetrisch um die Mitte (für das spätere 1 gegen 1).
// Westen = eigener Spawn im Training. Alle Angaben in Metern, y = Höhe.

const MATS = {
  ground: { tex: 'sandy_gravel_02', tile: 3.0, surface: 'sand' },
  sandstone: { tex: 'sandstone_blocks_08', tile: 2.6, surface: 'stone' },
  plaster: { tex: 'patterned_clay_plaster', tile: 2.6, surface: 'stone' },
  concrete: { tex: 'concrete_floor_worn_001', tile: 2.2, surface: 'stone' },
  metal: { tex: 'rusty_corrugated_iron', tile: 2.4, surface: 'metal' },
};

// Blickrichtung (Yaw) so, dass die Kamera nach +X schaut
const FACE_EAST = -Math.PI / 2;

export const SPAWN = { pos: new THREE.Vector3(-26.5, 0, 0), yaw: FACE_EAST };
export const BUY_ZONE = { x0: -30, x1: -21.5, z0: -8, z1: 8 };

// Mögliche Standorte der Klappziele (x, z, Bodenhöhe)
export const TARGET_SPOTS = [
  [-14, -12, 0], [-8, -14, 0], [-18, 12.5, 0], [-10, 16, 0], [-6, 4, 0], [-15, 0, 0],
  [0, -6.5, 0], [0, 6.5, 0], [0, 0, 0], [0, -12, 0], [0, 12, 0], [0, -18.8, 0], [0, 18.8, 0],
  [8, -10, 0], [13, -13.5, 0], [24, -17, 2.4], [20.5, -18.8, 2.4], [12, 0, 0], [18, 3, 0],
  [15.5, -6.2, 0], [26, 5, 0], [26.5, -2.5, 0], [10, 14, 0], [21, 13.8, 0], [24, 17.5, 0],
  [-24, -16, 0], [-26, 17.5, 2.4],
];

// Unsichtbare Rampen über den Treppen: [x unten, x oben, Höhe oben, z0, z1], gespiegelt
const RAMPS = [[-13.6, -18, 2.4, 16.3, 19.9]];

function defineLayout() {
  const list = [];
  // opts.collider: 'world' (Standard), 'stair' (nur Kugeln/Granaten) oder 'none'
  const B = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => list.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat, ...opts });
  const mirror = (x0, x1, y0, y1, z0, z1, mat, opts) => {
    B(x0, x1, y0, y1, z0, z1, mat, opts);
    B(-x1, -x0, y0, y1, -z1, -z0, mat, opts);
  };
  // Wandstück mit Sockel aus Beton
  const wall = (x0, x1, z0, z1, h, mat, add = B) => {
    add(x0, x1, 0, h, z0, z1, mat);
    add(x0 - 0.05, x1 + 0.05, 0, 0.3, z0 - 0.05, z1 + 0.05, 'concrete');
  };
  const cap = (x0, x1, z0, z1, y, add = B) => add(x0 - 0.08, x1 + 0.08, y, y + 0.15, z0 - 0.08, z1 + 0.08, 'concrete');

  // Boden und Außenmauern
  B(-33, 33, -1, 0, -23, 23, 'ground');
  B(-31, 31, 0, 7, -21, -20, 'sandstone');
  B(-31, 31, 0, 7, 20, 21, 'sandstone');
  B(-31, -30, 0, 7, -20, 20, 'sandstone');
  B(30, 31, 0, 7, -20, 20, 'sandstone');
  cap(-31, 31, -21, -20, 7);
  cap(-31, 31, 20, 21, 7);
  cap(-31, -30, -20, 20, 7);
  cap(30, 31, -20, 20, 7);
  B(-30, 30, 0, 0.35, -20, -19.92, 'concrete');
  B(-30, 30, 0, 0.35, 19.92, 20, 'concrete');
  B(-30, -29.92, 0, 0.35, -19.92, 19.92, 'concrete');
  B(29.92, 30, 0, 0.35, -19.92, 19.92, 'concrete');

  // Trennmauern zwischen Mitte und den Gassen, jeweils mit Durchgang
  wall(-22, -16, -8.3, -7.7, 4, 'plaster', mirror);
  wall(-14, -6, -8.3, -7.7, 4, 'plaster', mirror);
  mirror(-16, -14, 2.7, 4, -8.3, -7.7, 'plaster');
  cap(-22, -6, -8.3, -7.7, 4, mirror);
  wall(-22, -11, 7.7, 8.3, 4, 'plaster', mirror);
  wall(-9, -6, 7.7, 8.3, 4, 'plaster', mirror);
  mirror(-11, -9, 2.7, 4, 7.7, 8.3, 'plaster');
  cap(-22, -6, 7.7, 8.3, 4, mirror);

  // Gebäude in der Mitte mit Tunnel
  wall(-4, 4, -5, -1.4, 5, 'plaster', mirror);
  B(-4, 4, 3, 5, -1.4, 1.4, 'plaster');
  cap(-4, 4, -5, 5, 5);
  B(-4, 4, 0, 0.012, -1.4, 1.4, 'concrete', { collider: 'none' });
  // angedeutete Fenster (dunkles Glas mit Betonsims)
  for (const x of [-2.2, 2.2]) {
    mirror(x - 0.6, x + 0.6, 3.1, 4.3, -5.03, -5.0, 'glass');
    mirror(x - 0.7, x + 0.7, 2.98, 3.1, -5.12, -5.0, 'concrete');
  }

  // Podest (Balkon) mit Treppe und Brüstung, im Westen der Südgasse bzw. gespiegelt im Osten der Nordgasse
  mirror(-30, -18, 0, 2.4, 14.5, 20, 'concrete');
  for (let k = 0; k < 7; k++) {
    mirror(-18 + 0.55 * k, -18 + 0.55 * (k + 1), 0, 2.1 - 0.3 * k, 16.3, 19.9, 'concrete', { collider: 'stair' });
  }
  mirror(-30, -18, 2.4, 3.45, 14.5, 14.8, 'concrete');
  mirror(-18.3, -18, 2.4, 3.45, 14.8, 16.3, 'concrete');

  // Container mitten in den Gassen
  mirror(-3, 3, 0, 2.6, 15, 17.5, 'metal');
  // niedrige Deckungsmauern
  mirror(-12, -8, 0, 1.1, 12, 12.4, 'concrete');
  mirror(-24, -20, 0, 1.1, -12.3, -11.9, 'concrete');
  // Betonplatte im Spawn (nur Optik, damit man nicht an der Kante hängen bleibt)
  mirror(-29.9, -22.5, 0, 0.012, -3, 3, 'concrete', { collider: 'none' });
  return list;
}

// Requisiten: [Modell, x, z, Drehung, Höhe], jeweils gespiegelt in die andere Hälfte
const PROPS = [
  ['Crate_L', -12, -6.2, 0, 0], ['Crate_S', -12, -6.2, 0.3, 1.3], ['Crate_S', -13.25, -6.4, 0.1, 0],
  ['Crate_L', -17, 3.5, 0, 0], ['Crate_L', -17, 4.85, 0.05, 0],
  ['concrete_road_barrier', -9, 2.5, Math.PI / 2, 0],
  ['Crate_L', -7, 18.8, 0, 0], ['Crate_S', -5.6, 19.0, 0.2, 0],
  ['Barrel_01', -20.5, 9.2, 0.4, 0], ['barrel_03', -19.8, 9.7, 1.2, 0],
  ['barrel_03', -26.5, -6.6, 0.2, 0], ['Barrel_01', -27.3, -6.1, 2.2, 0],
  ['wooden_crate_02', -25, 5.8, 0.1, 0], ['wooden_crate_02', -15.5, 17.9, 1.5, 0],
  ['old_military_crate', -14.6, 10.2, 0.4, 0], ['metal_jerrycan', -20.9, 10.4, 2.5, 0],
  ['metal_jerrycan', -28.6, 18.8, 0.6, 2.4], ['Crate_S', -6.5, 11.2, 0.15, 0], ['Crate_L', -24.5, 13, 0, 0],
  ['Crate_L', -15, -14.5, 0, 0], ['Crate_S', -13.7, -14.2, 0.2, 0], ['Crate_S', -15, -14.5, -0.2, 1.3],
  ['concrete_road_barrier', -9, -17, 0.2, 0], ['Barrel_01', -7, -9.2, 0.9, 0], ['barrel_03', -6.3, -9.7, 0.1, 0],
];

const PROP_SURFACE = {
  Crate_L: 'wood', Crate_S: 'wood', wooden_crate_02: 'wood', old_military_crate: 'wood',
  Barrel_01: 'metal', barrel_03: 'metal', metal_jerrycan: 'metal', concrete_road_barrier: 'stone',
};

// Box mit Welt-UVs, damit die Texturen über alle Bauteile gleich groß und nahtlos laufen
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

function pushBox(acc, min, max, tile, tint) {
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const f of FACES) {
    const base = acc.pos.length / 3;
    const hu = Math.abs(dot(f.u, h)), hv = Math.abs(dot(f.v, h)), hn = Math.abs(dot(f.n, h));
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((i) => c[i] + f.n[i] * hn + f.u[i] * su * hu + f.v[i] * sv * hv);
      acc.pos.push(...p);
      acc.nrm.push(...f.n);
      acc.uv.push(dot(p, f.u) / tile, dot(p, f.v) / tile);
      acc.col.push(tint, tint, tint);
    }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function makeMaterial(assets, key) {
  if (key === 'glass') {
    return new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.12, metalness: 0.2 });
  }
  const t = assets.textures[MATS[key].tex];
  return new THREE.MeshStandardMaterial({
    map: t.diff, normalMap: t.nor, roughnessMap: t.arm, metalnessMap: t.arm, aoMap: t.arm,
    roughness: 1, metalness: 1, vertexColors: true,
  });
}

export class Arena {
  constructor(assets, physics, scene) {
    this.assets = assets;
    this.physics = physics;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Arena';
    scene.add(this.group);
    this.targetSpots = [];
  }

  build() {
    this._buildGeometry();
    this._placeProps();
    this._validateSpots();
  }

  _buildGeometry() {
    const byMat = {};
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const b of defineLayout()) {
      if (b.mat !== 'ground') {
        const acc = (byMat[b.mat] ||= { pos: [], nrm: [], uv: [], col: [], idx: [] });
        pushBox(acc, b.min, b.max, MATS[b.mat]?.tile ?? 1, 0.9 + rand() * 0.14);
      }
      if (b.collider === 'none') continue;
      const half = { x: (b.max[0] - b.min[0]) / 2, y: (b.max[1] - b.min[1]) / 2, z: (b.max[2] - b.min[2]) / 2 };
      const center = { x: b.min[0] + half.x, y: b.min[1] + half.y, z: b.min[2] + half.z };
      const member = b.collider === 'stair' ? GROUP.STAIR : GROUP.WORLD;
      this.physics.addBox(center, half, MATS[b.mat]?.surface ?? 'stone', null, member);
    }
    this._addRamps();
    for (const [key, acc] of Object.entries(byMat)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
      g.setIndex(acc.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, makeMaterial(this.assets, key));
      mesh.name = `Arena_${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this._buildGround();
  }

  // Eine Kapsel kann nicht auf einer Stufenkante stehen, deshalb laufen Spieler über eine flache Rampe
  _addRamps() {
    const t = 0.3;
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (const [xLow, xHigh, h, z0, z1] of RAMPS) {
      for (const s of [1, -1]) {
        const x0 = xLow * s, x1 = xHigh * s;
        const len = Math.hypot(x1 - x0, h);
        const ux = (x1 - x0) / len, uy = h / len;
        // Normale der Oberseite (zeigt nach oben und zum unteren Ende hin)
        const nx = ux > 0 ? -uy : uy, ny = Math.abs(ux);
        const q = new THREE.Quaternion().setFromAxisAngle(zAxis, Math.atan2(uy, ux));
        const center = {
          x: (x0 + x1) / 2 - nx * t / 2,
          y: h / 2 - ny * t / 2,
          z: ((z0 + z1) / 2) * s,
        };
        this.physics.addBox(center, { x: len / 2, y: t / 2, z: (z1 - z0) / 2 }, 'stone', q, GROUP.CLIP);
      }
    }
  }

  // Boden als feines Raster mit weichen Farbflecken, damit die Kachelung nicht auffällt
  _buildGround() {
    const w = 66, d = 46, nx = 66, nz = 46, tile = MATS.ground.tile;
    const pos = [], uv = [], col = [], idx = [];
    const noise = (x, z) => 0.5
      + 0.22 * Math.sin(x * 0.19 + Math.sin(z * 0.11) * 2.3)
      + 0.18 * Math.sin(z * 0.23 + Math.cos(x * 0.09) * 2.1)
      + 0.1 * Math.sin((x + z) * 0.47);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = -w / 2 + (w * i) / nx;
        const z = -d / 2 + (d * j) / nz;
        pos.push(x, 0, z);
        uv.push(x / tile, -z / tile);
        const n = Math.min(1, Math.max(0, noise(x, z)));
        const k = 0.8 + 0.24 * n;
        col.push(k, k * (0.97 + 0.03 * n), k * (0.93 + 0.07 * n));
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, makeMaterial(this.assets, 'ground'));
    mesh.name = 'Arena_ground';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _template(name) {
    this._templates ||= {};
    if (this._templates[name]) return this._templates[name];
    const lib = name.startsWith('Crate_') ? this.assets.models.crates : this.assets.models.props;
    const src = lib.getObjectByName(name).clone();
    src.position.set(0, 0, 0);
    src.traverse((o) => {
      if (o.isMesh && o.material.name === 'CrateFrame') {
        this._frameMat ||= Object.assign(o.material.clone(), { name: 'CrateFrameTinted' });
        this._frameMat.color.setScalar(0.58);
        o.material = this._frameMat;
      }
    });
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    this._templates[name] = { src, box };
    return this._templates[name];
  }

  // Gleiche Requisiten werden per Instancing gezeichnet: ein Draw Call pro Teil für alle Kopien
  _placeProps() {
    const placements = {};
    for (const [name, x, z, yaw, y] of PROPS) {
      (placements[name] ||= []).push([x, z, yaw, y], [-x, -z, yaw + Math.PI, y]);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (const [name, list] of Object.entries(placements)) {
      const { src, box } = this._template(name);
      const parts = [];
      src.traverse((o) => { if (o.isMesh) parts.push(o); });
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        inst.name = `${name}_${part.name}`;
        inst.castShadow = inst.receiveShadow = true;
        list.forEach(([x, z, yaw, y], i) => {
          m.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), one).multiply(part.matrixWorld);
          inst.setMatrixAt(i, m);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        this.group.add(inst);
      }
      const size = box.getSize(new THREE.Vector3());
      const localCenter = box.getCenter(new THREE.Vector3());
      const surface = PROP_SURFACE[name] || 'stone';
      for (const [x, z, yaw, y] of list) {
        q.setFromAxisAngle(up, yaw);
        const center = localCenter.clone().applyQuaternion(q).add(p.set(x, y, z));
        if (/^barrel/i.test(name)) {
          this.physics.addCylinder(center, size.y / 2, Math.max(size.x, size.z) / 2, surface);
        } else {
          this.physics.addBox(center, { x: size.x / 2, y: size.y / 2, z: size.z / 2 }, surface, q.clone());
        }
      }
    }
  }

  // Zielstandorte, die in einem Hindernis stecken würden, werden aussortiert
  _validateSpots() {
    const R = this.physics.R;
    const shape = new R.Cuboid(0.3, 0.5, 0.3);
    this.physics.step(); // Abfragestruktur mit den neuen Kollisionskörpern füllen
    for (const [x, z, y] of TARGET_SPOTS) {
      if (this.physics.overlaps(shape, { x, y: y + 0.6, z })) {
        console.warn('Zielstandort blockiert:', x, z);
        continue;
      }
      this.targetSpots.push(new THREE.Vector3(x, y, z));
    }
  }

  inBuyZone(p) {
    return p.x >= BUY_ZONE.x0 && p.x <= BUY_ZONE.x1 && p.z >= BUY_ZONE.z0 && p.z <= BUY_ZONE.z1;
  }
}
