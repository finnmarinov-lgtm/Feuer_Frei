import * as THREE from 'three';
import { GRENADES, WEAPONS } from '../config.js';
import { GROUP, groups } from '../engine/physics.js';
import { puffTexture } from '../effects/textures.js';

const DOWN = { x: 0, y: -1, z: 0 };
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Geworfene Granaten (Rapier-Körper) und ihre Wirkung.
export class Grenades {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.clouds = [];
    this.templates = {};
    for (const type of ['he', 'flash', 'smoke']) {
      const t = game.assets.models[WEAPONS[type].model].clone();
      const remove = [];
      t.traverse((o) => {
        if (/^(Hand|Wrist|Sleeve|Pin)/.test(o.name)) remove.push(o);
        if (o.isMesh) o.castShadow = true;
      });
      for (const o of remove) o.removeFromParent();
      this.templates[type] = t;
    }
    this.smokeTex = puffTexture(9, 256, 0.5);
  }

  throw(type, pos, vel) {
    const { R, world } = this.g.physics;
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: Math.random() * 8 - 4, y: Math.random() * 8 - 4, z: Math.random() * 8 - 4 })
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(1.2),
    );
    world.createCollider(
      R.ColliderDesc.ball(GRENADES.bodyRadius).setRestitution(0.42).setFriction(0.8).setDensity(2)
        .setCollisionGroups(groups(GROUP.GRENADE, GROUP.WORLD | GROUP.STAIR)),
      body,
    );
    const mesh = this.templates[type].clone();
    mesh.position.copy(pos);
    this.g.scene.add(mesh);
    this.list.push({ type, body, mesh, t: 0, lastVel: vel.clone(), bounceCd: 0 });
  }

  clear() {
    for (const gr of this.list) this._remove(gr);
    this.list = [];
    for (const c of this.clouds) this.g.scene.remove(c.group);
    this.clouds = [];
  }

  _remove(gr) {
    this.g.physics.world.removeRigidBody(gr.body);
    this.g.scene.remove(gr.mesh);
  }

  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const gr = this.list[i];
      gr.t += dt;
      gr.bounceCd -= dt;
      const lv = gr.body.linvel();
      _v.set(lv.x, lv.y, lv.z);
      const dv = _a.subVectors(_v, gr.lastVel).length();
      if (dv > 2.2 && gr.bounceCd <= 0) {
        const p = gr.body.translation();
        this.g.audio.play('bounce', { position: p, volume: Math.min(1, dv / 10) });
        gr.bounceCd = 0.08;
      }
      gr.lastVel.copy(_v);
      const cfg = GRENADES[gr.type];
      const done = gr.type === 'smoke'
        ? (gr.t > 0.6 && _v.length() < cfg.stopSpeed) || gr.t > 3.5
        : gr.t >= cfg.fuse;
      if (done) {
        this._detonate(gr);
        this.list.splice(i, 1);
      }
    }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      if (c.t > GRENADES.smoke.duration + 2.5) {
        this.g.scene.remove(c.group);
        this.clouds.splice(i, 1);
      }
    }
  }

  /** Meshes an die Physik angleichen und Rauch animieren (pro Bild) */
  update(dt) {
    for (const gr of this.list) {
      const p = gr.body.translation();
      const q = gr.body.rotation();
      gr.mesh.position.set(p.x, p.y, p.z);
      gr.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const dur = GRENADES.smoke.duration;
    for (const c of this.clouds) {
      const grow = 1 - Math.pow(1 - Math.min(1, c.t / 1.6), 3);
      const fade = c.t > dur ? Math.max(0, 1 - (c.t - dur) / 2.5) : 1;
      for (const m of c.materials) m.opacity = Math.min(1, c.t * 3) * fade * 0.94;
      for (const s of c.sprites) {
        s.sprite.position.lerpVectors(c.center, s.target, grow);
        s.sprite.position.y += Math.sin(c.t * 0.3 + s.phase) * 0.15;
        s.sprite.material.rotation = s.rot + c.t * s.spin;
        s.sprite.scale.setScalar(s.size * (0.4 + 0.6 * grow));
      }
    }
  }

  _groundBelow(p) {
    const hit = this.g.physics.raycast(p, DOWN, 2);
    return hit ? p.y - hit.distance : null;
  }

  _detonate(gr) {
    const p = gr.body.translation();
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    this._remove(gr);
    if (gr.type === 'he') this._explode(pos);
    else if (gr.type === 'flash') this._flash(pos);
    else this._smoke(pos);
  }

  _explode(pos) {
    const g = this.g;
    const cfg = GRENADES.he;
    const ground = this._groundBelow(pos);
    g.effects.explosion(pos, ground !== null && pos.y - ground < 1.2 ? ground : null);
    g.audio.play('explosion', { position: pos });
    _a.copy(pos).y += 0.15;
    for (const t of g.targets.standing()) {
      _b.copy(t.root.position).y += 1.2;
      const d = _a.distanceTo(_b);
      if (d > cfg.radius || !g.physics.lineOfSight(_a, _b)) continue;
      const dmg = Math.round(cfg.damage * Math.pow(1 - d / cfg.radius, 1.5));
      if (dmg <= 0) continue;
      const res = g.targets.damage(t, dmg);
      g.hud.damageNumber(_b, res.damage, false);
      g.match.onHit(res.damage, false, false);
      if (res.killed) g.match.onKill(WEAPONS.he, false);
    }
    const pl = g.player;
    _b.copy(pl.feet).y += 1.0;
    const d = _a.distanceTo(_b);
    if (d < cfg.radius && g.physics.lineOfSight(_a, _b)) {
      const dmg = cfg.damage * Math.pow(1 - d / cfg.radius, 1.5);
      if (dmg >= 1) g.damagePlayer(dmg, { armorPen: cfg.armorPen, from: pos });
    }
    g.shake(Math.max(0, 1 - d / 22));
  }

  _flash(pos) {
    const g = this.g;
    const cfg = GRENADES.flash;
    g.audio.play('flashbang', { position: pos });
    g.effects.flashBurst(pos);
    const eye = g.player.eyePosition(_a);
    const to = _b.subVectors(pos, eye);
    const d = to.length();
    if (d > cfg.radius || !g.physics.lineOfSight(eye, pos)) return;
    to.divideScalar(d);
    const view = g.player.forward(_v);
    const dot = view.dot(to);
    const angle = dot > 0.8 ? 1 : dot > 0.3 ? 0.75 : dot > -0.3 ? 0.4 : 0.12;
    const dist = Math.min(1, Math.max(0, 1 - (d - 2) / (cfg.radius - 2)));
    const amount = angle * dist;
    if (amount < 0.03) return;
    const duration = cfg.maxBlind * amount;
    g.hud.flashbang(duration, amount);
    if (amount > 0.3) g.audio.play('tinnitus', { duration });
  }

  _smoke(pos) {
    const g = this.g;
    const cfg = GRENADES.smoke;
    g.audio.play('smoke', { position: pos });
    const ground = this._groundBelow(pos) ?? pos.y;
    const center = new THREE.Vector3(pos.x, ground + 1.1, pos.z);
    const group = new THREE.Group();
    const materials = [];
    const sprites = [];
    for (let i = 0; i < 38; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * cfg.radius;
      const target = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.35) * 1.8, Math.sin(a) * r).add(center);
      target.y = Math.max(ground + 0.5, target.y);
      // nicht durch Wände quellen
      const dir = _v.subVectors(target, center);
      const len = dir.length();
      if (len > 0.01) {
        dir.divideScalar(len);
        const hit = g.physics.raycast(center, dir, len);
        if (hit) target.copy(center).addScaledVector(dir, Math.max(0, hit.distance - 0.6));
      }
      const v = 0.64 + Math.random() * 0.18;
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTex, color: new THREE.Color(v, v, v * 0.98), transparent: true, opacity: 0, depthWrite: false,
      });
      materials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(center);
      group.add(sprite);
      sprites.push({ sprite, target, size: 2.6 + Math.random() * 1.6, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.08, phase: Math.random() * 6 });
    }
    g.scene.add(group);
    this.clouds.push({ group, sprites, materials, center, t: 0 });
  }
}
