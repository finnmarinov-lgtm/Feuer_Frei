import * as THREE from 'three';
import { KNIFE_SKINS, MOVE, TEAM_KNIFE, WEAPONS, WEAPON_IDS } from '../config.js';
import { GROUP, groups } from '../engine/physics.js';
import { mergeByMaterial } from '../engine/merge.js';
import { muzzleTexture } from '../effects/textures.js';
import { applyFinish } from '../weapons/finishes.js';
import { PAINT, emptyLooks, skinOf } from './cosmetics.js';

// Farben der beiden Seiten (sRGB). Im Spiel sieht man immer nur den Gegner.
export const TEAMS = {
  host: { name: 'Rot', uniform: '#6b3a30', helmet: '#442a24', mark: '#9a2d1f' },
  guest: { name: 'Blau', uniform: '#34455f', helmet: '#262f3d', mark: '#23468c' },
};

// Bits im Zustand, den jeder Spieler 30-mal pro Sekunde schickt
// BUSY: legt oder entschärft gerade die Bombe
export const FLAG = { ALIVE: 1, GROUND: 2, RELOAD: 4, ADS: 8, WALK: 16, PROTECT: 32, SPRINT: 64, BUSY: 128 };

const DOWN = { x: 0, y: -1, z: 0 };
const THIGH = 0.43;
const SHIN = 0.5;
const HIP_CROUCH = 0.55;
// Lage der Waffe in der Faust, wo der Ursprung nicht oben am Griff sitzt
// (Karambit: Ursprung in der Mitte des Fingerrings über der Faust)
const HOLD_OFFSET = { knife: [0, -0.05, -0.05], butterfly: [0, -0.05, -0.05], karambit: [0, 0, 0.01], grenade: [0, -0.015, -0.012] };
// Trefferzonen, etwas größer als der sichtbare Körper: [Knoten, Zone, Mitte, Größe] in Ruhelage (vorne = -Z)
const HITBOXES = [
  ['Head', 'head', [0, 1.645, 0.005], [0.3, 0.3, 0.3]],
  ['Spine', 'body', [0, 1.26, 0], [0.5, 0.5, 0.36]],
  ['Spine', 'body', [0.03, 1.31, -0.3], [0.46, 0.24, 0.4]],
  ['Hips', 'body', [0, 0.95, 0], [0.44, 0.24, 0.3]],
  ['ThighL', 'legs', [-0.1, 0.72, 0], [0.22, 0.46, 0.25]],
  ['ThighR', 'legs', [0.1, 0.72, 0], [0.22, 0.46, 0.25]],
  ['ShinL', 'legs', [-0.1, 0.28, -0.03], [0.2, 0.56, 0.3]],
  ['ShinR', 'legs', [0.1, 0.28, -0.03], [0.2, 0.56, 0.3]],
];
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// so lange bleiben die Zustände des Gegners gespeichert (für die Kill-Cam)
const HISTORY_MS = 6000;

const _v = new THREE.Vector3();
const _prev = new THREE.Vector3();

/**
 * Zustand zur Zeit rt (in der Uhr des Absenders) aus einer Liste von Zuständen, Ergebnis in s.
 * Zwischen zwei Zuständen wird interpoliert, nach dem letzten kurz weitergerechnet.
 */
export function sampleSnaps(snaps, rt, s) {
  const n = snaps.length;
  if (!n) return false;
  let a = snaps[0];
  let b = null;
  if (rt > a.t) {
    for (let i = n - 1; i >= 0; i--) {
      if (snaps[i].t <= rt) {
        a = snaps[i];
        b = snaps[i + 1] || null;
        break;
      }
    }
  }
  s.t = a.t;
  s.f = a.f;
  s.w = a.w;
  if (!b) {
    s.pos.copy(a.pos);
    s.yaw = a.yaw;
    s.pitch = a.pitch;
    s.duck = a.duck;
    // fehlt ein Paket, kurz in der letzten Richtung weiterlaufen
    const p = snaps[n - 2];
    if (a === snaps[n - 1] && p && a.t > p.t && rt > a.t && a.pos.distanceToSquared(p.pos) < 9) {
      const ex = Math.min(rt - a.t, 120) / (a.t - p.t);
      s.pos.lerpVectors(p.pos, a.pos, 1 + ex);
    }
    return true;
  }
  const k = (rt - a.t) / (b.t - a.t);
  if (a.pos.distanceToSquared(b.pos) > 9) {
    // Sprung (Wiederbelebung, neue Runde): nicht quer durch die Arena gleiten
    s.pos.copy(b.pos);
    s.yaw = b.yaw;
    s.pitch = b.pitch;
    s.duck = b.duck;
    s.f = b.f;
    s.w = b.w;
    s.t = b.t;
  } else {
    s.pos.lerpVectors(a.pos, b.pos, k);
    s.yaw = a.yaw + wrap(b.yaw - a.yaw) * k;
    s.pitch = a.pitch + (b.pitch - a.pitch) * k;
    s.duck = a.duck + (b.duck - a.duck) * k;
  }
  return true;
}

// Der Gegner im eigenen Spiel: Modell, Animation, Trefferzonen, Körper für die Kollision
// und flüssige Bewegung trotz Netz (Zustände werden mit kurzer Verzögerung interpoliert).
// Als "ghost" ohne Kollision und Trefferzonen: die eigene Figur in der Kill-Cam.
export class RemotePlayer {
  constructor(game, { ghost = false } = {}) {
    this.g = game;
    this.ghost = ghost;
    this.root = new THREE.Group();
    this.root.name = ghost ? 'Eigene Figur (Kill-Cam)' : 'Gegner';
    this.fall = new THREE.Group();
    this.root.add(this.fall);
    const model = game.assets.models.soldier.clone();
    this.fall.add(model);
    const node = (n) => model.getObjectByName(n);
    this.n = {
      hips: node('Hips'), spine: node('Spine'), head: node('Head'), anchor: node('WeaponAnchor'),
      thighL: node('ThighL'), thighR: node('ThighR'), shinL: node('ShinL'), shinR: node('ShinR'),
      armLong: node('ArmLLong'), armShort: node('ArmLShort'),
    };
    this.hipsRestY = this.n.hips.position.y;
    this.anchorRestZ = this.n.anchor.position.z;
    this.uniform = null;
    this.helmet = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (o.material.name === 'Uniform') o.material = this.uniform ||= o.material.clone();
      else if (o.material.name === 'Helmet') o.material = this.helmet ||= o.material.clone();
    });
    // Körperteile am selben Gelenk mit gleichem Material zu einem Mesh (30 Teile -> 16)
    mergeByMaterial(model);
    // Materialien der Figur (ohne Waffen) für den Schimmer während des Spawn-Schutzes
    this.bodyMeshes = [];
    model.traverse((o) => { if (o.isMesh) this.bodyMeshes.push(o); });
    this.bodyMaterials = new Set();
    this._collectBody();
    this.glow = 0;

    // Waffen in der Hand (ohne die Arme aus der Ego-Ansicht); das Messer je nach Team
    this.weapons = {};
    this.knives = {};
    for (const id of WEAPON_IDS) {
      const def = WEAPONS[id];
      if (def.slot === 'knife') {
        for (const [skin, s] of Object.entries(KNIFE_SKINS)) this.knives[skin] = this._weaponModel(def, s.model, skin);
        this.weapons[id] = this.knives[TEAM_KNIFE.guest];
        continue;
      }
      this.weapons[id] = this._weaponModel(def, def.model, def.anim);
    }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleTexture(), color: new THREE.Color(3, 2.3, 1.4), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.flash.visible = false;

    // Trefferzonen in Ruhelage an die Gelenke hängen, damit sie jede Bewegung mitmachen
    this.hitboxes = [];
    this.root.updateMatrixWorld(true);
    for (const [name, zone, c, s] of ghost ? [] : HITBOXES) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(...s), HITBOX_MATERIAL);
      box.position.set(...c);
      box.visible = false;
      box.userData.zone = zone;
      this.root.add(box);
      box.updateMatrixWorld(true);
      node(name).attach(box);
      this.hitboxes.push(box);
    }
    this.raycaster = new THREE.Raycaster();

    const { R, world } = game.physics;
    this.radius = MOVE.radius;
    this.halfStand = (MOVE.standHeight - 2 * this.radius) / 2;
    this.halfCrouch = (MOVE.crouchHeight - 2 * this.radius) / 2;
    this.collider = ghost ? null : world.createCollider(
      R.ColliderDesc.capsule(this.halfStand, this.radius).setCollisionGroups(groups(GROUP.OTHER, GROUP.PLAYER | GROUP.GRENADE)),
    );
    this.collider?.setEnabled(false);
    this.colliderHalf = this.halfStand;

    this.root.visible = false;
    game.scene.add(this.root);
    this.active = false;
    // firstPerson: man schaut gerade durch seine Augen (Kill-Cam), die Figur ist dann ausgeblendet
    this.firstPerson = false;
    this.team = 'guest';
    this.looks = emptyLooks();
    this.snaps = [];
    this.history = [];
    this.state = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, duck: 0, f: 0, w: -1, t: 0 };
    this._reset();
  }

  _reset() {
    this.snaps.length = 0;
    this.history.length = 0;
    this.clockOff = null;
    this.hp = 100;
    this.dead = false;
    this.deadAt = 0;
    this.deathT = 0;
    this.deathSide = 0;
    this.shown = false;
    this.weaponId = null;
    this.speed = 0;
    this.phase = 0;
    this.air = 0;
    this.airT = 0;
    this.stepDist = 0;
    this.reload = 0;
    this.kick = 0;
    this.jab = -1;
    this.flashT = 0;
    this.lastFlags = 0;
    this.glow = 0;
    this.sprint = 0;
    this.busy = 0;
    this.busyT = 0;
    this.hidden = false;
    for (const m of this.bodyMaterials ?? []) m.emissive.setRGB(0, 0, 0);
    // Waffe aus der letzten Partie weglegen, sonst bliebe sie in der Hand sichtbar, egal was
    // der Gegner gerade hält (weaponId fängt ja wieder bei null an)
    for (const w of Object.values(this.weapons ?? {})) w.model.visible = false;
    for (const k of Object.values(this.knives ?? {})) k.model.visible = false;
    this.flash?.removeFromParent();
    this.fall?.rotation.set(0, 0, 0);
    this.fall?.position.set(0, 0, 0);
    if (this.n) this.n.anchor.rotation.z = 0;
  }

  _weaponModel(def, name, holdKey) {
    const w = this.g.assets.models[name].clone();
    const remove = [];
    w.traverse((o) => {
      if (/^(Hand|Wrist|Sleeve)/.test(o.name)) remove.push(o);
      else if (o.isMesh) o.castShadow = true;
    });
    for (const o of remove) o.removeFromParent();
    mergeByMaterial(w);
    const off = HOLD_OFFSET[holdKey];
    if (off) w.position.set(...off);
    w.visible = false;
    this.n.anchor.add(w);
    return { model: w, muzzle: w.getObjectByName('Muzzle'), def };
  }

  /** Gegner ist mit neuer Seite zurück: seine Uhr fängt neu an, alte Zustände passen nicht mehr */
  resetStream() {
    this.snaps.length = 0;
    this.history.length = 0;
    this.clockOff = null;
    this.dead = false;
    this.shown = false;
    this.root.visible = false;
  }

  /** team: Seite des Gegners ('host' oder 'guest') */
  setActive(on, team = 'guest') {
    this.active = on;
    this._reset();
    this.root.visible = false;
    this.firstPerson = false;
    this.collider?.setEnabled(false);
    if (on) {
      this.team = team;
      // Team Rot trägt ein Karambit, Team Blau ein Butterflymesser
      this.weapons.messer = this.knives[TEAM_KNIFE[team]] || this.weapons.messer;
      this.setLooks(this.looks);
    }
  }

  /**
   * Skins des Spielers (aus der Lobby): Waffen, Messer und Uniform. Mit Spieler-Skin zeigt der Helm
   * kräftig die Teamfarbe, damit man Rot und Blau weiter unterscheidet.
   */
  setLooks(looks) {
    this.looks = looks || emptyLooks();
    for (const [id, w] of Object.entries(this.weapons)) {
      if (w.def.slot !== 'knife') applyFinish(w.model, PAINT[id] || [], skinOf(this.looks, id));
    }
    for (const [skin, k] of Object.entries(this.knives)) applyFinish(k.model, PAINT[skin] || [], skinOf(this.looks, 'messer'), 40);
    const t = TEAMS[this.team];
    const player = skinOf(this.looks, 'spieler');
    this.uniform?.color.set(t.uniform);
    this.helmet?.color.set(player === 'standard' ? t.helmet : t.mark);
    for (const m of this.bodyMaterials) m.emissive.setRGB(0, 0, 0);
    applyFinish(this.fall, ['Uniform'], player, 8);
    this._collectBody();
  }

  // Schimmern beim Spawn-Schutz: die aktuellen Materialien der Figur (auch eine neue Uniform)
  _collectBody() {
    this.bodyMaterials.clear();
    for (const o of this.bodyMeshes) if (o.material.emissive) this.bodyMaterials.add(o.material);
  }

  get alive() {
    return this.shown && !this.dead;
  }

  /** Gegner hat gerade Spawn-Schutz (Treffer zählen nicht) */
  get protected() {
    return this.alive && (this.state.f & FLAG.PROTECT) !== 0;
  }

  get position() {
    return this.root.position;
  }

  headPosition(out) {
    return this.n.head.getWorldPosition(out).add(_v.set(0, 0.12, 0));
  }

  muzzlePosition(out) {
    const m = this.weaponId && this.weapons[this.weaponId].muzzle;
    if (!m || !this.shown) return out.copy(this.root.position).add(_v.set(0, 1.4, 0));
    this.root.updateMatrixWorld(true);
    return m.getWorldPosition(out);
  }

  /** Zustand vom Netz (Absenderzeit k in Millisekunden) */
  push(msg) {
    const now = performance.now();
    const off = msg.k - now;
    // das am wenigsten verzögerte Paket gibt den besten Uhrenabgleich
    if (this.clockOff === null || off > this.clockOff) this.clockOff = off;
    else this.clockOff += (off - this.clockOff) * 0.02;
    const last = this.snaps[this.snaps.length - 1];
    if (last && msg.k <= last.t) return;
    const snap = {
      t: msg.k, pos: new THREE.Vector3(msg.p[0] / 100, msg.p[1] / 100, msg.p[2] / 100),
      yaw: msg.y / 1000, pitch: msg.a / 1000, duck: msg.d / 100, f: msg.f, w: msg.w,
    };
    this.snaps.push(snap);
    if (this.snaps.length > 40) this.snaps.shift();
    // längerer Verlauf für die Kill-Cam (dieselben Zustände, die nie mehr verändert werden)
    const h = this.history;
    h.push(snap);
    while (h[0].t < snap.t - HISTORY_MS) h.shift();
    this.hp = msg.hp;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    const last = this.snaps[this.snaps.length - 1];
    this.deadAt = last ? last.t : 0;
    this.deathT = 0;
    this.deathSide = (Math.random() - 0.5) * 0.7;
    this.collider?.setEnabled(false);
  }

  fire(def) {
    this.kick = def.anim === 'shotgun' || def.anim === 'sniper' ? 1 : 0.5;
    this.flashT = 0.05;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar({ pistol: 0.25, sniper: 0.5, shotgun: 0.55 }[def.anim] ?? 0.38);
  }

  /** kurzer Stoß nach vorne (Messer, Granatenwurf) */
  jabMove() {
    this.jab = 0;
  }

  /** Puffer gegen Ruckeln im Netz (ms); die KI schickt 60 Zustände pro Sekunde ohne Verzögerung */
  get delay() {
    const mode = this.g.match.net?.mode;
    return mode === 'server' ? 170 : mode === 'bot' ? 35 : 90;
  }

  // Interpolierter Zustand zur Zeit rt (in der Uhr des Absenders), danach alte Zustände verwerfen
  _sample(rt) {
    const snaps = this.snaps;
    if (!sampleSnaps(snaps, rt, this.state)) return false;
    while (snaps.length > 3 && snaps[1].t < rt - 500) snaps.shift();
    return true;
  }

  _setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.weaponId) this.weapons[this.weaponId].model.visible = false;
    this.weaponId = id;
    const w = id && this.weapons[id];
    if (!w) return;
    w.model.visible = true;
    const long = !['pistol', 'knife', 'grenade'].includes(w.def.anim);
    this.n.armLong.visible = long;
    this.n.armShort.visible = !long;
    if (w.muzzle) w.muzzle.add(this.flash);
    else this.flash.removeFromParent();
  }

  /** at: Zeitpunkt in der Uhr des Absenders (Kill-Cam), sonst "jetzt minus Puffer" */
  update(dt, at = null) {
    if (!this.active) return;
    // Verbindung weg: Figur ausblenden, bis der Gegner zurück ist
    if (this.hidden) {
      this.root.visible = false;
      if (this.collider?.isEnabled()) this.collider.setEnabled(false);
      return;
    }
    if (!this._sample(at ?? performance.now() + this.clockOff - this.delay)) return;
    const s = this.state;
    const aliveFlag = (s.f & FLAG.ALIVE) !== 0;
    // falls die Todesmeldung unterwegs verloren ging, reicht auch der Zustand
    if (!aliveFlag && this.shown && !this.dead) this.die();
    // wiederbelebt: ein Zustand nach dem Tod meldet "lebt"
    if (this.dead && aliveFlag && s.t > this.deadAt) {
      this.dead = false;
      this.fall.rotation.set(0, 0, 0);
      this.fall.position.set(0, 0, 0);
      this.n.anchor.rotation.z = 0;
    }
    if (!this.shown) {
      if (!aliveFlag) return;
      this.shown = true;
      this.root.position.copy(s.pos);
    }
    this.root.visible = !this.firstPerson;

    _prev.copy(this.root.position);
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.yaw;
    const moved = Math.hypot(s.pos.x - _prev.x, s.pos.z - _prev.z);
    const spd = dt > 0 && moved < 1 ? moved / dt : 0;
    this.speed += (spd - this.speed) * Math.min(1, dt * 10);
    this._setWeapon(s.w >= 0 ? WEAPON_IDS[s.w] : null);

    const n = this.n;
    const ground = (s.f & FLAG.GROUND) !== 0;
    this.air += ((ground ? 0 : 1) - this.air) * Math.min(1, dt * 8);
    if (this.dead) {
      this._animateDeath(dt);
    } else {
      this._animateBody(dt, s, moved);
      this._sounds(dt, s, ground, moved);
    }
    this.lastFlags = s.f;

    // Waffe: Rückstoß, Nachladen, Stoß nach vorne
    this.kick = Math.max(0, this.kick - dt * 8);
    const reloading = (s.f & FLAG.RELOAD) !== 0;
    this.reload += ((reloading ? 1 : 0) - this.reload) * Math.min(1, dt * 8);
    this.sprint += ((s.f & FLAG.SPRINT ? 1 : 0) - this.sprint) * Math.min(1, dt * 8);
    this.busy += ((s.f & FLAG.BUSY && !this.dead ? 1 : 0) - this.busy) * Math.min(1, dt * 6);
    let jab = 0;
    if (this.jab >= 0) {
      this.jab += dt / 0.3;
      jab = Math.sin(Math.min(1, this.jab) * Math.PI);
      if (this.jab >= 1) this.jab = -1;
    }
    // beim Legen oder Entschärfen hängt die Waffe nach unten
    n.anchor.rotation.x = this.kick * 0.12 - this.reload * 0.55 - this.sprint * 0.7 - this.busy * 1.1;
    n.anchor.position.z = this.anchorRestZ - jab * 0.18;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this._protectGlow(dt);

    // Körper für die Kollision mitführen (geduckt niedriger); gegen die KI hat ihr eigener Körper die Kollision
    if (!this.collider) return;
    const on = !this.dead && this.solid !== false;
    if (this.collider.isEnabled() !== on) this.collider.setEnabled(on);
    const half = s.duck > 0.5 ? this.halfCrouch : this.halfStand;
    if (half !== this.colliderHalf) {
      this.colliderHalf = half;
      this.collider.setHalfHeight(half);
    }
    this.collider.setTranslation({ x: s.pos.x, y: s.pos.y + this.radius + half, z: s.pos.z });
  }

  _animateBody(dt, s, moved) {
    const n = this.n;
    // Beine: Schrittzyklus nach zurückgelegter Strecke, beim Ducken per IK gebeugt
    this.phase += moved * ((Math.PI * 2) / 1.7);
    const amp = Math.min(1, this.speed / 4.5) * (1 - this.air);
    const swing = Math.sin(this.phase) * 0.55 * amp;
    const h = 0.93 + (HIP_CROUCH - 0.93) * s.duck;
    const a = Math.acos(Math.min(1, (THIGH * THIGH + h * h - SHIN * SHIN) / (2 * THIGH * h)));
    const b = Math.acos(Math.min(1, (SHIN * SHIN + h * h - THIGH * THIGH) / (2 * SHIN * h)));
    const tuck = this.air;
    n.hips.position.y = this.hipsRestY - (0.93 - h) + tuck * 0.1;
    n.thighL.rotation.x = a + swing + tuck * 0.6;
    n.thighR.rotation.x = a - swing + tuck * 0.35;
    n.shinL.rotation.x = -(a + b) - Math.max(0, Math.cos(this.phase)) * 0.9 * amp - tuck * 0.9;
    n.shinR.rotation.x = -(a + b) - Math.max(0, -Math.cos(this.phase)) * 0.9 * amp - tuck * 0.6;
    // Oberkörper folgt dem Blick nach oben und unten, beim Ducken leicht vorgebeugt
    n.spine.rotation.x = s.pitch * 0.55 - 0.18 * s.duck - 0.2 * this.sprint - 0.55 * this.busy;
    n.spine.rotation.y = Math.sin(this.phase) * 0.06 * amp;
    n.head.rotation.x = s.pitch * 0.45 + 0.18 * s.duck;
    this.fall.rotation.set(0, 0, 0);
    this.fall.position.set(0, 0, 0);
  }

  // Spawn-Schutz: Figur schimmert bläulich (pulsierend), damit man sieht, warum Treffer nicht zählen
  _protectGlow(dt) {
    const target = this.protected ? 1 : 0;
    if (target === 0 && this.glow === 0) return;
    this.glow = target ? Math.min(1, this.glow + dt * 6) : Math.max(0, this.glow - dt * 4);
    const pulse = this.glow * (0.65 + 0.35 * Math.sin(performance.now() / 110));
    for (const m of this.bodyMaterials) m.emissive.setRGB(0.12 * pulse, 0.22 * pulse, 0.42 * pulse);
  }

  _animateDeath(dt) {
    // nach hinten umfallen, erst langsam, dann schneller (wie unter Schwerkraft)
    this.deathT = Math.min(1, this.deathT + dt / 0.65);
    const k = this.deathT * this.deathT;
    this.fall.rotation.x = k * 1.45;
    this.fall.rotation.z = k * this.deathSide;
    this.fall.position.y = k * 0.12;
    this.n.anchor.rotation.z = k * 0.8;
  }

  _sounds(dt, s, ground, moved) {
    const g = this.g;
    const feet = this.root.position;
    // Schritte nur beim Rennen, Schleichen und Ducken sind leise (wie beim eigenen Spieler)
    if (ground && this.speed > 3.2 && !(s.f & FLAG.WALK) && s.duck < 0.5) {
      this.stepDist += moved;
      if (this.stepDist > 2.0) {
        this.stepDist = 0;
        const hit = g.physics.raycast({ x: feet.x, y: feet.y + 0.2, z: feet.z }, DOWN, 0.6);
        g.audio.play('step', { position: feet, surface: hit?.surface || 'sand', volume: s.f & FLAG.SPRINT ? 1.3 : 1 });
      }
    }
    if (!ground) this.airT += dt;
    else {
      if (this.airT > 0.45) g.audio.play('land', { position: feet, volume: 0.7 });
      this.airT = 0;
    }
    if ((s.f & FLAG.RELOAD) && !(this.lastFlags & FLAG.RELOAD)) {
      g.audio.play('magOut', { position: feet, delay: 0.3 });
      g.audio.play('magIn', { position: feet, delay: 1.2 });
    }
    // Bombe legen (Tastentöne) oder entschärfen (Klicken) hört man in der Nähe
    if (s.f & FLAG.BUSY) {
      this.busyT -= dt;
      if (this.busyT <= 0) {
        const planting = g.match.attacker === (this.ghost ? g.match.me : g.match.them);
        this.busyT = planting ? 0.32 : 0.45;
        g.audio.play(planting ? 'plantKey' : 'defuseTick', { position: feet });
      }
    } else {
      this.busyT = 0;
    }
  }

  /** Strahl gegen die Trefferzonen. Liefert den nächsten Treffer bis maxDist. */
  raycast(origin, dir, maxDist) {
    if (!this.active || !this.alive) return null;
    this.root.updateMatrixWorld(true);
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) return null;
    const h = hits[0];
    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
    return { remote: true, zone: h.object.userData.zone, point: h.point, normal, distance: h.distance };
  }
}
