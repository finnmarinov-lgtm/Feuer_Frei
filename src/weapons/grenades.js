import * as THREE from 'three';
import { GRENADES, WEAPONS } from '../config.js';
import { GROUP, groups } from '../engine/physics.js';
import { mergeByMaterial } from '../engine/merge.js';
import { puffTexture } from '../effects/textures.js';
import { MAP } from '../world/map.js';

const DOWN = { x: 0, y: -1, z: 0 };
const PUFFS = 38;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// Rauchschwaden als Instanzen einer Fläche, im Shader zur Kamera gedreht:
// eine Wolke ist ein Zeichenaufruf statt 38 einzelner Sprites
const SMOKE_VERT = /* glsl */ `
attribute vec3 iPos;
attribute float iSize;
attribute float iRot;
attribute float iShade;
varying vec2 vUv;
varying float vShade;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vShade = iShade;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iRot), s = sin(iRot);
  mvPosition.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SMOKE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
varying float vShade;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vec3(vShade, vShade, vShade * 0.98), t.a * opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

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
      mergeByMaterial(t);
      this.templates[type] = t;
    }
    this.smokeTex = puffTexture(9, 256, 0.5);
    this.smokeQuad = new THREE.PlaneGeometry(1, 1);
    this.nextId = 0;
  }

  _smokeMaterial() {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { opacity: { value: 0 } }]);
    uniforms.map = { value: this.smokeTex };
    return new THREE.ShaderMaterial({
      uniforms, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, fog: true,
    });
  }

  /**
   * Granate werfen. ghost = Wurf eines anderen: fliegt nur zum Ansehen mit, gezündet wird sie,
   * wenn sein Spiel die Explosion meldet (remoteBoom). owner: wer geworfen hat (Rolle bzw.
   * Kennung, Standard: man selbst). Gibt die Kennung der Granate zurück.
   */
  throw(type, pos, vel, { ghost = false, id = null, owner = null } = {}) {
    const { R, world } = this.g.physics;
    // eigene Granaten prallen am Gegner ab, seine an einem selbst
    const hits = GROUP.WORLD | GROUP.STAIR | (ghost ? GROUP.PLAYER : GROUP.OTHER);
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
        .setCollisionGroups(groups(GROUP.GRENADE, hits)),
      body,
    );
    const mesh = this.templates[type].clone();
    mesh.position.copy(pos);
    this.g.scene.add(mesh);
    const gid = id ?? ++this.nextId;
    this.list.push({ id: gid, ghost, owner: owner ?? this.g.myKey, type, body, mesh, t: 0, lastVel: vel.clone(), bounceCd: 0 });
    return gid;
  }

  /** Das Spiel eines anderen (owner) meldet: seine Granate ist hier losgegangen */
  remoteBoom(id, type, pos, owner) {
    const i = this.list.findIndex((gr) => gr.ghost && gr.id === id && gr.owner === owner);
    if (i >= 0) {
      this._remove(this.list[i]);
      this.list.splice(i, 1);
    }
    if (type === 'he') this._explode(pos, owner);
    else if (type === 'flash') this._flash(pos);
    else this._smoke(pos);
  }

  clear() {
    for (const gr of this.list) this._remove(gr);
    this.list = [];
    for (const c of this.clouds) this._removeCloud(c);
    this.clouds = [];
  }

  _removeCloud(c) {
    this.g.scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mesh.material.dispose();
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
      // ins Wasser gefallen (Hafen): geht unter, ohne zu zünden
      const p = gr.body.translation();
      if (MAP.water !== undefined && p.y < MAP.water) {
        this._splash(p);
        this._remove(gr);
        this.list.splice(i, 1);
        continue;
      }
      const lv = gr.body.linvel();
      _v.set(lv.x, lv.y, lv.z);
      const dv = _a.subVectors(_v, gr.lastVel).length();
      if (dv > 2.2 && gr.bounceCd <= 0) {
        this.g.audio.play('bounce', { position: p, volume: Math.min(1, dv / 10) });
        gr.bounceCd = 0.08;
      }
      gr.lastVel.copy(_v);
      if (gr.ghost) {
        // kam keine Explosionsmeldung, verschwindet die Granate irgendwann still
        if (gr.t > 8) {
          this._remove(gr);
          this.list.splice(i, 1);
        }
        continue;
      }
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
        this._removeCloud(c);
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
    const cam = this.g.camera;
    cam.getWorldDirection(_fwd);
    for (const c of this.clouds) {
      const grow = 1 - Math.pow(1 - Math.min(1, c.t / 1.6), 3);
      const fade = c.t > dur ? Math.max(0, 1 - (c.t - dur) / 2.5) : 1;
      c.mesh.material.uniforms.opacity.value = Math.min(1, c.t * 3) * fade * 0.94;
      for (const p of c.puffs) {
        p.pos.lerpVectors(c.center, p.target, grow);
        p.pos.y += Math.sin(c.t * 0.3 + p.phase) * 0.15;
        p.depth = _v.subVectors(p.pos, cam.position).dot(_fwd);
      }
      // von hinten nach vorne zeichnen, damit die Schwaden richtig überblenden
      c.order.sort((a, b) => c.puffs[b].depth - c.puffs[a].depth);
      const geo = c.mesh.geometry;
      const pos = geo.attributes.iPos.array, size = geo.attributes.iSize.array;
      const rot = geo.attributes.iRot.array, shade = geo.attributes.iShade.array;
      c.order.forEach((k, i) => {
        const p = c.puffs[k];
        pos[i * 3] = p.pos.x - c.center.x;
        pos[i * 3 + 1] = p.pos.y - c.center.y;
        pos[i * 3 + 2] = p.pos.z - c.center.z;
        size[i] = p.size * (0.4 + 0.6 * grow);
        rot[i] = p.rot + c.t * p.spin;
        shade[i] = p.shade;
      });
      for (const a of ['iPos', 'iSize', 'iRot', 'iShade']) geo.attributes[a].needsUpdate = true;
    }
  }

  _groundBelow(p) {
    const hit = this.g.physics.raycast(p, DOWN, 2);
    return hit ? p.y - hit.distance : null;
  }

  // kleine Fontäne, wo eine Granate ins Wasser fällt
  _splash(p) {
    const g = this.g;
    _a.set(p.x, MAP.water, p.z);
    for (let i = 0; i < 8; i++) {
      _v.set((Math.random() - 0.5) * 1.6, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.6);
      g.effects.dust.spawn(_a, _v, { color: [0.72, 0.8, 0.84], life: 0.6 + Math.random() * 0.4, size0: 0.1, size1: 0.5, alpha: 0.7, gravity: 6, drag: 1.2 });
    }
    g.audio.play('impact', { position: _a, surface: 'sand', volume: 0.6 });
  }

  _detonate(gr) {
    const p = gr.body.translation();
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    this._remove(gr);
    this.g.match.boomFx?.(gr.id, gr.type, pos);
    if (gr.type === 'he') this._explode(pos, gr.owner);
    else if (gr.type === 'flash') this._flash(pos);
    else this._smoke(pos);
  }

  // owner: wer geworfen hat. Die Klappziele trifft nur die eigene Granate; Schaden am eigenen
  // Spieler rechnet jedes Spiel selbst (Granaten von Mitspielern schaden nicht, siehe damagePlayer)
  _explode(pos, owner) {
    const g = this.g;
    const cfg = GRENADES.he;
    const remote = owner !== g.myKey;
    const ground = this._groundBelow(pos);
    g.effects.explosion(pos, ground !== null && pos.y - ground < 1.2 ? ground : null);
    g.audio.play('explosion', { position: pos });
    _a.copy(pos).y += 0.15;
    for (const t of remote ? [] : g.targets.standing()) {
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
      if (dmg >= 1) g.damagePlayer(dmg, { armorPen: cfg.armorPen, from: pos, by: owner, weapon: 'he' });
    }
    // KI-Spieler: ihr Spiel läuft im selben Browser mit
    g.onBlast?.(_a, cfg.radius, cfg.damage, cfg.armorPen, 1.5, owner, 'he', true);
    g.shake(Math.max(0, 1 - d / 22));
  }

  _flash(pos) {
    const g = this.g;
    const cfg = GRENADES.flash;
    g.audio.play('flashbang', { position: pos });
    g.effects.flashBurst(pos);
    g.onFlash?.(pos);
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
    const puffs = [];
    for (let i = 0; i < PUFFS; i++) {
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
      puffs.push({
        target, pos: center.clone(), depth: 0, shade: 0.64 + Math.random() * 0.18,
        size: 2.6 + Math.random() * 1.6, rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.08, phase: Math.random() * 6,
      });
    }
    // eigene Kopie der Fläche, damit das Aufräumen einer Wolke keine andere trifft
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = this.smokeQuad.index.clone();
    geo.setAttribute('position', this.smokeQuad.attributes.position.clone());
    geo.setAttribute('uv', this.smokeQuad.attributes.uv.clone());
    for (const [name, n] of [['iPos', 3], ['iSize', 1], ['iRot', 1], ['iShade', 1]]) {
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * n), n).setUsage(THREE.DynamicDrawUsage));
    }
    geo.instanceCount = PUFFS;
    const mesh = new THREE.Mesh(geo, this._smokeMaterial());
    mesh.position.copy(center);
    mesh.frustumCulled = false;
    g.scene.add(mesh);
    this.clouds.push({ mesh, puffs, order: puffs.map((_, i) => i), center, t: 0 });
  }
}
