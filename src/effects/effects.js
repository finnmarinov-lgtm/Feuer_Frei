import * as THREE from 'three';
import { sparkTexture, puffTexture, bulletHoleTexture, scorchTexture } from './textures.js';

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute float rot;
attribute vec3 pColor;
uniform float uScale;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
  vAlpha = alpha;
  vRot = rot;
  vColor = pColor;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(map, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Punktpartikel mit Schwerkraft, Luftwiderstand, Größen- und Alphaverlauf. Ein Draw-Call pro System.
class Particles {
  constructor(max, texture, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.geometry = g;
  }

  spawn(p, v, o) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set(o.color, i * 3);
    this.life[i] = 0;
    this.maxLife[i] = o.life;
    this.s0[i] = o.size0;
    this.s1[i] = o.size1 ?? o.size0;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * (o.spin ?? 1);
    this.size[i] = this.s0[i];
    this.alpha[i] = this.a0[i];
  }

  _kill(i) {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col.copyWithin(i * 3, last * 3, last * 3 + 3);
    for (const a of [this.size, this.alpha, this.rot, this.life, this.maxLife, this.s0, this.s1, this.a0, this.grav, this.drag, this.spin]) {
      a[i] = a[last];
    }
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) {
        this._kill(i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= k;
      this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt;
      this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 12 + 0.3);
      this.rot[i] += this.spin[i] * dt;
    }
    // ohne Partikel nichts hochladen und nichts zeichnen, sonst nur den belegten Teil hochladen
    this.points.visible = this.n > 0;
    if (!this.n) return;
    const g = this.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'pColor', 'size', 'alpha', 'rot']) {
      const a = g.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DECALS = 180;

function randomDir(out, normal, spread) {
  out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spread);
  return out.add(normal).normalize();
}

const SURFACE_DUST = {
  sand: [0.52, 0.42, 0.3],
  stone: [0.64, 0.6, 0.54],
  metal: [0.35, 0.33, 0.3],
  wood: [0.5, 0.38, 0.24],
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new Particles(500, sparkTexture(), true);
    this.dust = new Particles(700, puffTexture(3), false);
    this.chips = new Particles(400, sparkTexture(), false);
    scene.add(this.sparks.points, this.dust.points, this.chips.points);

    // Einschusslöcher als kleine Decals, die ältesten werden wiederverwendet
    const holeMat = new THREE.MeshStandardMaterial({
      map: bulletHoleTexture(), transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.scorchMat = new THREE.MeshStandardMaterial({
      map: scorchTexture(), transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    // alle Einschusslöcher in einem Instanz-Mesh: ein Zeichenaufruf statt einer pro Loch
    this.decals = new THREE.InstancedMesh(this.decalGeo, holeMat, DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    // Löcher liegen auf Wänden: vor allen anderen durchsichtigen Dingen zeichnen, sonst
    // springt die Reihenfolge zum Rauch je nach Standort um und Löcher schimmern hindurch
    this.decals.renderOrder = -1;
    this.decals.name = 'Einschusslöcher';
    scene.add(this.decals);
    this.decalIndex = 0;
    this._decalObj = new THREE.Object3D();
    this.scorches = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.decalGeo, this.scorchMat);
      m.visible = false;
      scene.add(m);
      this.scorches.push(m);
    }
    this.scorchIndex = 0;

    // Leuchtspuren
    const tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1).translate(0, 0, -0.5);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(4, 2.8, 1.4), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracers = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, active: false });
    }

    // Lichter bleiben immer in der Szene (Intensität 0), sonst würden Shader neu kompiliert
    this.muzzleLight = new THREE.PointLight(0xffb870, 0, 9, 2);
    this.boomLight = new THREE.PointLight(0xff9a4a, 0, 30, 2);
    scene.add(this.muzzleLight, this.boomLight);
    this.muzzleTime = 0;
    this.boomTime = 0;
    this.boomDur = 0.45;
    this.boomPeak = 900;
  }

  setViewport(heightPx, fovDeg) {
    const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const p of [this.sparks, this.dust, this.chips]) p.material.uniforms.uScale.value = scale;
  }

  _decal(point, normal, size) {
    // Ringpuffer: das älteste Loch wird überschrieben
    const i = this.decalIndex;
    this.decalIndex = (i + 1) % DECALS;
    const m = this._decalObj;
    m.position.copy(point).addScaledVector(normal, 0.004);
    _p.copy(point).add(normal);
    m.lookAt(_p);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size);
    m.updateMatrix();
    this.decals.setMatrixAt(i, m.matrix);
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  /** decal = false: ohne Einschussloch (Wiederholung in der Kill-Cam, das Loch gibt es schon) */
  impact(point, normal, surface, decal = true) {
    _n.set(normal.x, normal.y, normal.z);
    if (decal) this._decal(point, _n, surface === 'metal' ? 0.05 : 0.07);
    const dust = SURFACE_DUST[surface] || SURFACE_DUST.stone;
    const puffs = surface === 'sand' ? 6 : surface === 'metal' ? 2 : 4;
    for (let i = 0; i < puffs; i++) {
      randomDir(_v, _n, 0.9).multiplyScalar(0.8 + Math.random() * 1.8);
      this.dust.spawn(point, _v, { color: dust, life: 0.6 + Math.random() * 0.7, size0: 0.08, size1: 0.45 + Math.random() * 0.3, alpha: 0.75, gravity: -0.3, drag: 3.5 });
    }
    if (surface === 'metal') {
      for (let i = 0; i < 9; i++) {
        randomDir(_v, _n, 1.2).multiplyScalar(3 + Math.random() * 5);
        this.sparks.spawn(point, _v, { color: [3.5, 2.2, 1.0], life: 0.2 + Math.random() * 0.3, size0: 0.035, size1: 0.01, gravity: 9.8, drag: 1 });
      }
    } else {
      const chipColor = surface === 'wood' ? [0.42, 0.28, 0.14] : surface === 'sand' ? [0.35, 0.28, 0.2] : [0.55, 0.52, 0.47];
      for (let i = 0; i < 5; i++) {
        randomDir(_v, _n, 1.0).multiplyScalar(2 + Math.random() * 3);
        this.chips.spawn(point, _v, { color: chipColor, life: 0.5 + Math.random() * 0.4, size0: 0.035, size1: 0.025, gravity: 9.8, drag: 0.5 });
      }
    }
  }

  targetHit(point, normal, head) {
    _n.set(normal.x, normal.y, normal.z);
    for (let i = 0; i < 10; i++) {
      randomDir(_v, _n, 1.3).multiplyScalar(2.5 + Math.random() * 4);
      this.sparks.spawn(point, _v, { color: [3.5, 2.4, 1.2], life: 0.15 + Math.random() * 0.25, size0: 0.03, size1: 0.01, gravity: 9.8, drag: 1.5 });
    }
    const paint = head ? [0.85, 0.3, 0.1] : [0.8, 0.76, 0.66];
    for (let i = 0; i < 4; i++) {
      randomDir(_v, _n, 1.0).multiplyScalar(1.5 + Math.random() * 2);
      this.chips.spawn(point, _v, { color: paint, life: 0.6, size0: 0.03, gravity: 9.8, drag: 0.5 });
    }
  }

  // Treffer am Gegner: dunkelroter Sprühnebel und ein paar Tropfen, am Kopf mehr
  bloodHit(point, normal, head) {
    _n.set(normal.x, normal.y, normal.z);
    const puffs = head ? 7 : 4;
    for (let i = 0; i < puffs; i++) {
      randomDir(_v, _n, 1.1).multiplyScalar(0.6 + Math.random() * 1.4);
      this.dust.spawn(point, _v, { color: [0.32, 0.03, 0.02], life: 0.35 + Math.random() * 0.3, size0: 0.06, size1: 0.3 + Math.random() * 0.2, alpha: 0.85, gravity: 1.5, drag: 4 });
    }
    for (let i = 0; i < (head ? 10 : 6); i++) {
      randomDir(_v, _n, 1.3).multiplyScalar(1.5 + Math.random() * 2.5);
      this.chips.spawn(point, _v, { color: [0.25, 0.02, 0.015], life: 0.4 + Math.random() * 0.3, size0: 0.025, size1: 0.015, gravity: 9.8, drag: 0.8 });
    }
  }

  knifeSpark(point, normal) {
    _n.set(normal.x, normal.y, normal.z);
    for (let i = 0; i < 6; i++) {
      randomDir(_v, _n, 1.2).multiplyScalar(2 + Math.random() * 3);
      this.sparks.spawn(point, _v, { color: [3, 2, 1], life: 0.2, size0: 0.025, gravity: 9.8 });
    }
  }

  /** Leuchtspur; width = Dicke (Vielfaches), speed in m/s, streak = Länge des Strichs */
  tracer(from, to, { width = 1, speed = 420, streak = 5 } = {}) {
    const tr = this.tracers.find((t) => !t.active) || this.tracers[0];
    tr.from.copy(from);
    tr.dir.subVectors(to, from);
    tr.len = tr.dir.length();
    if (tr.len < 2) return;
    tr.dir.divideScalar(tr.len);
    tr.t = 0;
    tr.w = width;
    tr.speed = speed;
    tr.streak = streak;
    tr.active = true;
    tr.mesh.visible = true;
    _p.copy(from).add(tr.dir);
    tr.mesh.position.copy(from);
    tr.mesh.lookAt(_p);
    tr.mesh.rotateY(Math.PI);
  }

  /** Einschlag einer Granate der Bordkanone: Feuerblitz, glühende Splitter, Sandfontäne, Loch im Boden */
  cannonHit(pos, decal = true) {
    for (let i = 0; i < 3; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.7 + 0.3, Math.random() - 0.5).multiplyScalar(2.2);
      this.sparks.spawn(pos, _v, { color: [4, 1.9, 0.6], life: 0.1 + Math.random() * 0.08, size0: 0.55 + Math.random() * 0.35, size1: 1.2, gravity: -2, drag: 6, alpha: 0.9 });
    }
    for (let i = 0; i < 7; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 1.1 + 0.35, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 9);
      this.sparks.spawn(pos, _v, { color: [4, 2.4, 1.1], life: 0.25 + Math.random() * 0.3, size0: 0.045, size1: 0.02, gravity: 9.8, drag: 0.8 });
    }
    for (let i = 0; i < 4; i++) {
      _v.set((Math.random() - 0.5) * 1.4, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 1.4);
      const k = 0.34 + Math.random() * 0.1;
      this.dust.spawn(pos, _v, { color: [k * 1.3, k * 1.05, k * 0.75], life: 1 + Math.random() * 0.8, size0: 0.35, size1: 1.4 + Math.random() * 0.7, alpha: 0.75, gravity: 3, drag: 2.5 });
    }
    for (let i = 0; i < 4; i++) {
      _v.set(Math.random() - 0.5, Math.random() + 0.4, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 4);
      this.chips.spawn(pos, _v, { color: [0.3, 0.24, 0.17], life: 0.6 + Math.random() * 0.4, size0: 0.05, size1: 0.04, gravity: 9.8, drag: 0.4 });
    }
    if (decal) this._decal(pos, UP, 0.32 + Math.random() * 0.14);
    // kurzer Lichtblitz (größere Explosionen haben Vorrang)
    if (this.boomTime > 0 && this.boomPeak > 300) return;
    this.boomLight.position.copy(pos).y += 0.7;
    this.boomLight.color.set(0xffa050);
    this.boomTime = this.boomDur = 0.1;
    this.boomPeak = 240;
  }

  muzzleFlash(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleTime = 0.06;
  }

  flashBurst(pos) {
    this.boomLight.position.copy(pos);
    this.boomLight.color.set(0xffffff);
    this.boomTime = this.boomDur = 0.3;
    this.boomPeak = 1600;
    for (let i = 0; i < 20; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 5);
      this.sparks.spawn(pos, _v, { color: [4, 4, 4], life: 0.15 + Math.random() * 0.15, size0: 0.06, gravity: 4, drag: 2 });
    }
    _v.set(0, 0, 0);
    this.sparks.spawn(pos, _v, { color: [6, 6, 6], life: 0.12, size0: 2.5, size1: 4 });
  }

  /** scale: Größe der Explosion (1 = Splittergranate, Bombe und Luftschlag größer) */
  explosion(pos, ground, scale = 1) {
    this.boomLight.position.copy(pos).add(_v.set(0, 0.6 * scale, 0));
    this.boomLight.color.set(0xff9a4a);
    this.boomTime = this.boomDur = 0.45 * Math.sqrt(scale);
    // größere Explosionen leuchten länger, aber kaum heller (sonst glühen die Wände orange)
    this.boomPeak = 900 * Math.sqrt(Math.sqrt(scale));
    const more = Math.min(2, scale);
    for (let i = 0; i < 26 * more; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 4) * scale);
      this.sparks.spawn(pos, _v, { color: [4, 1.8, 0.6], life: 0.25 + Math.random() * 0.25 * scale, size0: (0.5 + Math.random() * 0.5) * scale, size1: 1.4 * scale, gravity: -1, drag: 5, alpha: 0.8 });
    }
    for (let i = 0; i < 40 * more; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 12) * Math.sqrt(scale));
      this.sparks.spawn(pos, _v, { color: [4, 2.5, 1.2], life: 0.4 + Math.random() * 0.5, size0: 0.05, size1: 0.02, gravity: 9.8, drag: 0.8 });
    }
    for (let i = 0; i < 30 * more; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar((1.5 + Math.random() * 4) * scale);
      const g = 0.25 + Math.random() * 0.15;
      this.dust.spawn(pos, _v, { color: [g, g * 0.95, g * 0.9], life: (1.8 + Math.random() * 1.5) * Math.sqrt(scale), size0: 0.8 * scale, size1: (3.2 + Math.random() * 1.5) * scale, alpha: 0.7, gravity: -0.4, drag: 2.2 });
    }
    if (ground !== null && ground !== undefined) {
      const m = this.scorches[this.scorchIndex];
      this.scorchIndex = (this.scorchIndex + 1) % this.scorches.length;
      m.position.set(pos.x, ground + 0.01, pos.z);
      m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      m.scale.setScalar(3.2 * scale);
      m.visible = true;
    }
  }

  update(dt) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.chips.update(dt);
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt;
      const head = tr.t * tr.speed;
      const tail = Math.max(0, head - tr.streak);
      if (tail >= tr.len) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      const h = Math.min(head, tr.len);
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tail);
      tr.mesh.scale.set(tr.w, tr.w, Math.max(0.01, h - tail));
    }
    this.muzzleTime = Math.max(0, this.muzzleTime - dt);
    this.muzzleLight.intensity = this.muzzleTime > 0 ? 45 * (this.muzzleTime / 0.06) : 0;
    this.boomTime = Math.max(0, this.boomTime - dt);
    this.boomLight.intensity = this.boomTime > 0 ? this.boomPeak * Math.pow(this.boomTime / this.boomDur, 2) : 0;
  }
}
