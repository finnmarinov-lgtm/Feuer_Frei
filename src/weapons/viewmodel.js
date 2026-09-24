import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { muzzleTexture } from '../effects/textures.js';

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
// 0 -> 1 -> 0 mit weichen Übergängen am Anfang (a) und Ende (b)
const bell = (t, a, b) => (t < a ? smooth(t / a) : t > 1 - b ? smooth((1 - t) / b) : 1);
const seg = (t, a, b) => smooth((t - a) / (b - a));

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Die Waffe in der Hand, in einer eigenen Szene und Kamera gezeichnet.
export class Viewmodel {
  constructor(assets, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    scene.add(camera);
    this.root = new THREE.Group();
    camera.add(this.root);
    this.models = {};
    for (const [id, def] of Object.entries(WEAPONS)) {
      const model = assets.models[def.model].clone();
      model.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.castShadow = o.receiveShadow = false;
        }
      });
      model.visible = false;
      const find = (n) => model.getObjectByName(n) || null;
      const parts = { mag: find('Mag'), slide: find('Slide'), bolt: find('Bolt'), pin: find('Pin'), muzzle: find('Muzzle'), eject: find('Eject') };
      const rest = {};
      for (const [k, o] of Object.entries(parts)) {
        if (o) rest[k] = { p: o.position.clone(), r: o.rotation.clone() };
      }
      this.root.add(model);
      this.models[id] = { model, parts, rest };
    }

    // Mündungsfeuer: zwei Längsflächen und eine Frontfläche
    const mat = new THREE.MeshBasicMaterial({
      map: muzzleTexture(), color: new THREE.Color(3, 2.4, 1.6), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.flash = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.flash.add(front);
    for (const r of [0, Math.PI / 2]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.6).rotateX(Math.PI / 2).translate(0, 0, -0.6), mat);
      side.rotation.z = r;
      this.flash.add(side);
    }
    this.flash.traverse((o) => { o.frustumCulled = false; });
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.2, 2);
    scene.add(this.flashLight);

    // Hülsen
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9953f, metalness: 1, roughness: 0.3 });
    const casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8).rotateZ(Math.PI / 2);
    this.casings = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(casingGeo, brass);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.casings.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.casingIndex = 0;

    this.current = null;
    this.def = null;
    this.t = 0;
    this.drawT = 1;
    this.drawDur = 0.5;
    this.kickZ = 0;
    this.kickRot = 0;
    this.slideBack = 0;
    this.reloadT = -1;
    this.reloadDur = 1;
    this.knifeT = -1;
    this.knifeKind = 'slash';
    this.knifeSide = 1;
    this.grenadeT = -1;
    this.throwT = -1;
    this.inspectT = -1;
    this.boltT = -1;
    this.flashT = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.airOffset = 0;
    this.slideLocked = false;
  }

  equip(def) {
    const id = Object.keys(WEAPONS).find((k) => WEAPONS[k] === def);
    for (const m of Object.values(this.models)) m.model.visible = false;
    this.current = this.models[id];
    this.def = def;
    this.current.model.visible = true;
    this._resetParts();
    if (this.current.parts.muzzle) this.current.parts.muzzle.add(this.flash);
    this.flash.visible = false;
    const size = def.anim === 'pistol' ? 0.1 : def.anim === 'sniper' ? 0.2 : 0.15;
    this.flash.scale.setScalar(size);
    this.drawT = 0;
    this.drawDur = def.draw;
    this.reloadT = this.knifeT = this.grenadeT = this.throwT = this.inspectT = this.boltT = -1;
    this.slideLocked = false;
  }

  _resetParts() {
    const { parts, rest } = this.current;
    for (const [k, r] of Object.entries(rest)) {
      parts[k].position.copy(r.p);
      parts[k].rotation.copy(r.r);
      parts[k].visible = true;
    }
  }

  fire(def) {
    const pistol = def.anim === 'pistol';
    this.kickZ += pistol ? 0.045 : def.anim === 'sniper' ? 0.07 : 0.028;
    this.kickRot += pistol ? 0.09 : def.anim === 'sniper' ? 0.12 : 0.035;
    this.flashT = 0.045;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.inspectT = -1;
    if (def.slide) this.slideBack = 1;
    this._eject(def);
  }

  reload(def, duration) {
    this.reloadT = 0;
    this.reloadDur = duration;
    this.inspectT = -1;
  }

  bolt() {
    this.boltT = 0;
  }

  knife(kind) {
    this.knifeT = 0;
    this.knifeKind = kind;
    this.knifeSide = -this.knifeSide;
    this.inspectT = -1;
  }

  grenadePull() {
    this.grenadeT = 0;
  }

  grenadeThrow() {
    this.throwT = 0;
  }

  inspect() {
    if (this.reloadT < 0 && this.knifeT < 0 && this.grenadeT < 0) this.inspectT = 0;
  }

  _eject(def) {
    const eject = this.current.parts.eject;
    if (!eject || def.anim === 'sniper') return;
    const c = this.casings[this.casingIndex];
    this.casingIndex = (this.casingIndex + 1) % this.casings.length;
    eject.getWorldPosition(c.mesh.position);
    _q.copy(this.camera.quaternion);
    c.vel.set(1.3 + Math.random() * 0.6, 1.4 + Math.random() * 0.6, 0.3 + Math.random() * 0.3).applyQuaternion(_q);
    c.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.mesh.quaternion.copy(_q);
    c.life = 0.8;
    c.mesh.visible = true;
  }

  /** Mündung in Weltkoordinaten (für Leuchtspur und Mündungslicht) */
  muzzleWorld(out, eye, worldCamera) {
    const m = this.current?.parts.muzzle;
    if (!m) return out.copy(eye);
    this.root.updateMatrixWorld(true);
    m.getWorldPosition(_v);
    const d = _v.length();
    _v.project(this.camera);
    const cam = worldCamera || this.worldCamera;
    out.set(_v.x, _v.y, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(d).add(eye);
    return out;
  }

  update(dt, player, mouse, scoped) {
    this.t += dt;
    if (!this.current) return;
    const def = this.def;
    const { parts, rest } = this.current;
    const pos = _v.set(...def.view.pos);
    const rot = new THREE.Euler(def.view.rot[0], def.view.rot[1], def.view.rot[2]);

    // Ziehen
    this.drawT = Math.min(1, this.drawT + dt / this.drawDur);
    const d = 1 - ease(this.drawT);
    pos.y -= 0.16 * d;
    rot.x -= 0.9 * d;
    rot.z += 0.2 * d;

    // Atmen und Laufen
    pos.y += Math.sin(this.t * 1.7) * 0.0018;
    rot.x += Math.sin(this.t * 1.7) * 0.004;
    const speed = player.horizontalSpeed;
    const targetAmp = player.onGround ? Math.min(1, speed / 5.5) : 0;
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * 8);
    this.bobPhase += dt * (4 + speed * 1.35);
    pos.x += Math.sin(this.bobPhase) * 0.009 * this.bobAmp;
    pos.y -= Math.abs(Math.cos(this.bobPhase)) * 0.011 * this.bobAmp;
    rot.z += Math.sin(this.bobPhase) * 0.012 * this.bobAmp;
    const airTarget = player.onGround ? 0 : Math.max(-0.02, Math.min(0.02, player.vel.y * 0.003));
    this.airOffset += (airTarget - this.airOffset) * Math.min(1, dt * 10);
    pos.y += this.airOffset - player.landImpact * 0.035;
    pos.y -= player.duckAmount * 0.008;

    // Nachziehen bei Mausbewegung (gedämpfte Feder)
    const tx = Math.max(-0.035, Math.min(0.035, -mouse.x * 0.00018));
    const ty = Math.max(-0.035, Math.min(0.035, mouse.y * 0.00018));
    this.swayVel.x += ((tx - this.sway.x) * 180 - this.swayVel.x * 22) * dt;
    this.swayVel.y += ((ty - this.sway.y) * 180 - this.swayVel.y * 22) * dt;
    this.sway.x += this.swayVel.x * dt;
    this.sway.y += this.swayVel.y * dt;
    pos.x += this.sway.x;
    pos.y += this.sway.y;
    rot.y += this.sway.x * 1.6;
    rot.x += this.sway.y * 1.2;

    // Rückstoß
    this.kickZ *= Math.exp(-dt * 16);
    this.kickRot *= Math.exp(-dt * 13);
    pos.z += this.kickZ;
    rot.x += this.kickRot;

    // Nachladen
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      const r = this.reloadT;
      const b = bell(r, 0.15, 0.18);
      rot.z += 0.5 * b;
      rot.x += 0.2 * b;
      pos.y -= 0.035 * b;
      pos.x -= 0.02 * b;
      if (parts.mag) {
        const out = seg(r, 0.15, 0.35) - seg(r, 0.5, 0.7);
        parts.mag.position.copy(rest.mag.p);
        parts.mag.position.y -= 0.28 * out;
        parts.mag.rotation.x = rest.mag.r.x - 0.3 * out;
        parts.mag.visible = r < 0.35 || r > 0.5;
      }
      if (r > 0.8) this.slideLocked = false;
      if (parts.slide && r > 0.8 && r < 0.95) this.slideBack = Math.max(this.slideBack, 1 - Math.abs(r - 0.87) * 14);
      if (parts.bolt && r > 0.78) this._boltPose(parts, rest, (r - 0.78) / 0.22);
      if (r >= 1) {
        this.reloadT = -1;
        this._resetParts();
      }
    }

    // Schlitten der Pistole
    if (parts.slide) {
      if (!this.slideLocked) this.slideBack *= Math.exp(-dt * 30);
      parts.slide.position.z = rest.slide.p.z + (def.slide || 0.025) * this.slideBack;
    }

    // Verschluss des Scharfschützengewehrs
    if (this.boltT >= 0 && parts.bolt) {
      this.boltT += dt / 1.05;
      const bt = this.boltT;
      if (bt > 0.25) this._boltPose(parts, rest, (bt - 0.25) / 0.7);
      const b = bell(Math.max(0, (bt - 0.2) / 0.8), 0.2, 0.25);
      rot.z += 0.18 * b;
      pos.y -= 0.02 * b;
      if (bt >= 1) {
        this.boltT = -1;
        parts.bolt.position.copy(rest.bolt.p);
        parts.bolt.rotation.copy(rest.bolt.r);
      }
    }

    // Messer
    if (this.knifeT >= 0) {
      const dur = this.knifeKind === 'stab' ? 0.55 : 0.34;
      this.knifeT += dt / dur;
      const k = this.knifeT;
      if (this.knifeKind === 'stab') {
        const f = bell(k, 0.25, 0.5);
        pos.z -= 0.16 * f;
        pos.x -= 0.05 * f;
        rot.x -= 0.25 * f;
        rot.y -= 0.35 * f;
      } else {
        const s = this.knifeSide;
        const f = Math.sin(Math.min(1, k) * Math.PI);
        const sweep = (k - 0.5) * 2;
        pos.x -= 0.1 * sweep * s;
        pos.z -= 0.08 * f;
        pos.y += 0.03 * f;
        rot.y += (0.8 * sweep * s) * f;
        rot.z -= 0.6 * s * f;
      }
      if (k >= 1) this.knifeT = -1;
    }

    // Granate: Stift ziehen, ausholen, werfen
    if (this.grenadeT >= 0 && this.throwT < 0) {
      this.grenadeT += dt;
      const g = smooth(this.grenadeT / 0.3);
      pos.y += 0.03 * g;
      pos.z += 0.05 * g;
      rot.x += 0.35 * g;
      if (parts.pin) {
        parts.pin.position.x = rest.pin.p.x + 0.12 * g;
        parts.pin.visible = g < 0.95;
      }
    }
    if (this.throwT >= 0) {
      this.throwT += dt / 0.3;
      const k = smooth(this.throwT);
      pos.z -= 0.35 * k;
      pos.y += 0.06 * Math.sin(k * Math.PI) - 0.2 * k;
      rot.x -= 1.2 * k;
      if (this.throwT >= 1) this.current.model.visible = false;
    }

    // Begutachten (F)
    if (this.inspectT >= 0) {
      this.inspectT += dt / 2.6;
      const b = bell(this.inspectT, 0.25, 0.25);
      rot.y -= 0.9 * b;
      rot.z += 0.35 * b;
      rot.x += 0.15 * b;
      pos.x -= 0.03 * b;
      if (this.inspectT >= 1) this.inspectT = -1;
    }

    this.root.position.copy(pos);
    this.root.rotation.copy(rot);
    this.root.visible = !scoped;

    // Mündungsfeuer und Hülsen
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible && parts.muzzle) {
      parts.muzzle.getWorldPosition(this.flashLight.position);
      this.flashLight.intensity = 3;
    } else {
      this.flashLight.intensity = 0;
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      if (c.life <= 0) c.mesh.visible = false;
    }
  }

  // Verschluss: hochdrehen, zurück, vor, runter
  _boltPose(parts, rest, t) {
    const b = parts.bolt;
    const lift = seg(t, 0, 0.2) - seg(t, 0.8, 1);
    const back = seg(t, 0.2, 0.45) - seg(t, 0.5, 0.75);
    b.rotation.copy(rest.bolt.r);
    b.rotation.z -= 1.0 * lift;
    b.position.copy(rest.bolt.p);
    b.position.z += 0.07 * back;
  }

  onMagEmpty() {
    if (this.def?.slide) {
      this.slideLocked = true;
      this.slideBack = 1;
    }
  }
}
