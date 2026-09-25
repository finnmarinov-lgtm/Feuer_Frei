import * as THREE from 'three';
import { ARMS, BOMB, DUEL, ECONOMY, GRENADES, KILLERS, MOVE, SPECIAL, WEAPONS, WEAPON_IDS } from '../config.js';
import { BOMB_SITES, MAP, SPAWNS } from '../world/map.js';
import { Player } from '../player/player.js';
import { FLAG } from '../game/remote.js';
import { attackerOf, shotEnd } from '../game/duel.js';

// KI-Gegner für das 1 gegen 1. Er spielt wie ein zweiter Mensch: eigener Körper mit derselben
// Bewegung, Kaufen in der Kaufzeit, Sehen (Blickfeld, Wände, Rauch) und Hören (Schritte, Schüsse),
// Zielen mit Reaktionszeit und Zielfehler, Feuerstöße, Nachladen, Bombe legen und entschärfen,
// Luftschlag. Mit dem Spiel spricht er über dieselben Nachrichten wie ein Gast im Duell.

// weak: kauft keine Gewehre und läuft etwas langsamer (Anfänger)
export const LEVELS = {
  anfaenger: { name: 'Anfänger', reaction: 1.15, aim: 6.5, turn: 130, head: 0.03, stop: false, fov: 85, hear: 8, tap: [0.45, 0.9], burst: [1, 3], rest: [0.6, 1.2], air: 0, pistol: false, hunt: 14, weak: true },
  leicht: { name: 'Leicht', reaction: 0.75, aim: 3.6, turn: 200, head: 0.08, stop: false, fov: 95, hear: 12, tap: [0.2, 0.45], burst: [2, 4], rest: [0.4, 0.8], air: 0.35, pistol: false, hunt: 11 },
  mittel: { name: 'Mittel', reaction: 0.42, aim: 1.9, turn: 330, head: 0.22, stop: true, fov: 110, hear: 18, tap: [0.1, 0.26], burst: [3, 6], rest: [0.25, 0.5], air: 0.65, pistol: true, hunt: 8 },
  schwer: { name: 'Schwer', reaction: 0.25, aim: 1.0, turn: 540, head: 0.42, stop: true, fov: 120, hear: 24, tap: [0.05, 0.15], burst: [4, 8], rest: [0.15, 0.35], air: 0.9, pistol: true, hunt: 5 },
};
export const BOT_NAMES = ['Otto', 'Lina', 'Kurt', 'Mia', 'Paul', 'Emma', 'Theo', 'Nele'];

const DEG = Math.PI / 180;
const DOWN = { x: 0, y: -1, z: 0 };
const SILENT = { play() {} };
const pack = (v) => [Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)];
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
// Stellen zwischen den Hälften: über eine davon läuft der erste lange Weg, damit die KI nicht
// jede Runde gleich kommt (Gassen oben und unten, Tunnel, links und rechts am Gebäude vorbei)

const _e = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
const _end = new THREE.Vector3();

/**
 * Strahl gegen den menschlichen Spieler: Kopf als Kugel, Körper und Beine als stehende Zylinder
 * (geduckt entsprechend kleiner). Liefert den nächsten Treffer bis maxDist oder null.
 */
function hitPlayer(o, d, maxDist, p) {
  const s = p.eyeHeight / MOVE.eyeStand;
  const fx = p.feet.x, fy = p.feet.y, fz = p.feet.z;
  let best = null;
  const take = (t, zone) => {
    if (t >= 0 && t <= maxDist && (!best || t < best.distance)) best = { zone, distance: t };
  };
  {
    const cy = fy + p.eyeHeight + 0.04, r = 0.17;
    const ox = o.x - fx, oy = o.y - cy, oz = o.z - fz;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const disc = b * b - (ox * ox + oy * oy + oz * oz - r * r);
    if (disc >= 0) take(-b - Math.sqrt(disc), 'head');
  }
  const cyl = (y0, y1, r, zone) => {
    const ox = o.x - fx, oz = o.z - fz;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return;
    const b = ox * d.x + oz * d.z;
    const disc = b * b - a * (ox * ox + oz * oz - r * r);
    if (disc < 0) return;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / a, t2 = (-b + sq) / a;
    const Y0 = fy + y0, Y1 = fy + y1;
    const y = o.y + d.y * t1;
    if (y >= Y0 && y <= Y1) {
      take(t1, zone);
    } else if (Math.abs(d.y) > 1e-6) {
      // durch Deckel oder Boden hinein
      const tc = ((y > Y1 ? Y1 : Y0) - o.y) / d.y;
      if (tc >= t1 && tc <= t2) take(tc, zone);
    }
  };
  cyl(0.88 * s, 1.47 * s, 0.32, 'body');
  cyl(0.04, 0.88 * s, 0.22, 'legs');
  if (best) best.point = new THREE.Vector3().copy(o).addScaledVector(d, best.distance);
  return best;
}

/** Abstand eines Punkts zur Strecke a-b */
function segDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

export class Bot {
  constructor(game, nav, level, name) {
    this.g = game;
    this.nav = nav;
    this.level = LEVELS[level] ? level : 'mittel';
    this.L = { ...LEVELS[this.level] };
    // auf dem Touchscreen zielt man langsamer: dort reagiert und trifft die KI in jeder Stufe schlechter
    if (game.input.touch) {
      const L = this.L;
      L.reaction += 0.3;
      L.aim *= 1.5;
      L.turn *= 0.75;
      L.head *= 0.5;
      L.tap = [L.tap[0] + 0.15, L.tap[1] + 0.25];
      L.air *= 0.5;
    }
    this.name = name;
    this.body = new Player(game.physics, SILENT, { bot: true });
    this.body.collider.setEnabled(false);
    this.body.alive = false;
    const input = { down: new Set(), jumpQ: false, moveX: 0, moveY: 0 };
    input.isDown = (a) => input.down.has(a);
    input.consume = (a) => {
      if (a !== 'jump' || !input.jumpQ) return false;
      input.jumpQ = false;
      return true;
    };
    this.in = input;
    // Nachrichten an das Spiel: out (eigene Nachrichten), events (hängen am nächsten Zustand)
    this.out = [];
    this.events = [];
    this.time = 0;
    this.sendT = 0;
    this.hitId = 0;
    this.shots = 0;
    this.lastSeen = new THREE.Vector3();
    this.heard = new THREE.Vector3();
    this.alertPos = new THREE.Vector3();
    this.stuckPos = new THREE.Vector3();
    this.resetMatch();
  }

  dispose() {
    this.body.dispose();
  }

  resetMatch() {
    this.money = ECONOMY.startMoney;
    this.lossStreak = 0;
    this.special = 0;
    this.round = 0;
    this.phase = 'idle';
    this.lives = 0;
    this.bomb = null;
    this._resetGear();
    this.body.alive = false;
    this.body.collider.setEnabled(false);
    this._resetCombat();
    this.plan = null;
  }

  _weapon(id) {
    const def = WEAPONS[id];
    return { id, def, mag: def.mag ?? 0, reserve: def.reserve ?? 0 };
  }

  /** Waffen-Modus der Partie (Alle, Nur Pistolen, Scharfschützen) */
  get arms() {
    return ARMS[this.g.match.cfg?.arms] || ARMS.alle;
  }

  _resetGear() {
    this.inv = { primary: null, secondary: this._weapon('natter') };
    this.body.armor = 0;
    this.body.helmet = false;
    this.roundArmor = { armor: 0, helmet: false };
    this.cur = 'secondary';
  }

  _resetCombat() {
    this.seeing = false;
    this.seenAt = -99;
    this.heardAt = -99;
    this.alertAt = -99;
    this.lookT = 0;
    this.reactT = 0;
    this.reloadT = 0;
    this.drawT = 0;
    this.nextFire = 0;
    this.tapAt = 0;
    this.inacc = 0;
    this.burstLeft = 0;
    this.restT = 0;
    this.strafeT = 0;
    this.strafeDir = 1;
    this.scopeT = 0;
    this.scoped = false;
    this.blindT = 0;
    this.errYaw = this.errPitch = 0;
    this.jYaw = this.jPitch = 0;
    this.jitT = 0;
    this.aimHead = false;
    this.plantT = 0;
    this.defuseT = 0;
    this.path = null;
    this.goal = null;
    this.stuckT = 0;
    this.stuckCount = 0;
    this.airT = 0;
    this.chatT = 0;
    this.retreatUntil = 0;
    this.retreat = null;
  }

  get weapon() {
    return this.inv[this.cur] || this.inv.secondary;
  }

  get immune() {
    return this.phase !== 'live' || this.protectT > 0;
  }

  _eye(out) {
    out.copy(this.body.feet);
    out.y += this.body.eyeHeight;
    return out;
  }

  _event(ev) {
    this.events.push(ev);
  }

  _chat(i, delay = rand(0.7, 1.6)) {
    this.chatI = i;
    this.chatT = delay;
  }

  _earn(v) {
    this.money = Math.max(0, Math.min(ECONOMY.maxMoney, this.money + v));
  }

  _charge(v) {
    this.special = Math.min(SPECIAL.charge, this.special + v);
  }

  _hear(pos, range) {
    if (this.body.feet.distanceTo(pos) > range) return;
    this.heard.copy(pos);
    this.heardAt = this.time;
  }

  // ---------- Nachrichten vom Spiel des Menschen (wie beim Gast im Duell) ----------
  receive(msg) {
    if (msg.t === 'ph') this._onPhase(msg);
    else if (msg.t === 's' && msg.ev) for (const ev of msg.ev) this._onEvent(ev);
    else if (msg.t === 'start') this.resetMatch();
    else if (msg.t === 'chat') this._onChat(msg.i);
  }

  _onPhase(msg) {
    // neue Partie (Nochmal): alles zurück auf Anfang
    if (msg.r < this.round || (this.phase === 'over' && msg.ph !== 'over')) this.resetMatch();
    const newRound = msg.r !== this.round;
    this.lives = msg.lv[1];
    if (newRound) this._newRound(msg.r);
    if (msg.bm && msg.ph === 'live') {
      _t.set(msg.bm[0] / 100, msg.bm[1] / 100, msg.bm[2] / 100);
      if (!this.bomb) this.bomb = { pos: _t.clone(), t: msg.bm[3] };
      else {
        this.bomb.t = msg.bm[3];
        this.bomb.pos.copy(_t);
      }
    }
    if (msg.ph === this.phase) return;
    this.phase = msg.ph;
    if (msg.ph === 'live') this._goLive();
    else if (msg.ph === 'end') this._roundEnd(msg);
    else if (msg.ph === 'over') this._over();
  }

  _newRound(r) {
    const g = this.g;
    const b = this.body;
    this.round = r;
    this.bombMode = !!g.match.bombMode;
    this.attacking = this.bombMode && attackerOf(r) === 'guest';
    this.bomb = null;
    this.defused = false;
    const sp = SPAWNS.east;
    b.spawn(sp.pos, sp.yaw);
    b.health = 100;
    b.collider.setEnabled(true);
    // Scharfschützen: das Adler gibt es jede Runde geschenkt
    const free = this.arms.free;
    if (free && !this.inv.primary) this.inv.primary = this._weapon(free);
    for (const w of [this.inv.primary, this.inv.secondary]) {
      if (!w) continue;
      w.mag = w.def.mag;
      w.reserve = w.def.reserve;
    }
    this.cur = this.inv.primary ? 'primary' : 'secondary';
    this._resetCombat();
    this.bought = false;
    this.buyT = rand(0.6, 2.5);
    this.respawnT = 0;
    this.protectT = 0;
    this.plan = null;
  }

  _goLive() {
    this.protectT = DUEL.spawnProtect;
    this._newPlan();
  }

  _roundEnd(msg) {
    const won = msg.win === 'guest';
    if (won) {
      this._earn(ECONOMY.roundWin);
      this.lossStreak = 0;
    } else {
      this._earn(Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * this.lossStreak));
      if (msg.win !== 'draw') this.lossStreak++;
    }
    // wie in CS: wer am Rundenende tot ist, verliert seine Ausrüstung
    if (!this.body.alive) this._resetGear();
    this.plantT = this.defuseT = 0;
  }

  _over() {
    this.plantT = this.defuseT = 0;
  }

  _onEvent(ev) {
    const p = this.g.player;
    switch (ev.t) {
      case 'hit':
        this._onHit(ev);
        break;
      case 'ack':
        // Rückmeldung zu eigenen Treffern: lädt die Spezialleiste
        if (ev.n > 0) this._charge(ev.n);
        break;
      case 'dead':
        // der Mensch ist ausgeschaltet: nicht an seinem Startpunkt warten (kein Spawn-Campen),
        // sondern ein paar Sekunden zurück in Richtung Mitte
        this.seeing = false;
        this.retreatUntil = this.time + rand(6, 9);
        this.retreat = this.nav.randomNear(rand(0, 8), rand(-6, 6), 4);
        if (ev.by === 'guest' && ev.w !== 'bombe') {
          const def = WEAPONS[ev.w] || KILLERS[ev.w];
          if (def) this._earn(def.reward);
          if (ev.w !== 'luftschlag') this._charge(SPECIAL.killBonus);
          if (Math.random() < 0.15) this._chat(4);
        }
        break;
      case 'f':
      case 'k':
        this._hear(p.feet, 45);
        break;
      default:
        break;
    }
  }

  _onChat(i) {
    // manchmal antwortet die KI: gg -> gg, Nice! -> Glück gehabt!, Sorry! -> Hahaha
    const reply = { 0: 0, 1: 3, 2: 4, 3: 1, 4: 4, 5: 5 }[i];
    if (reply !== undefined && Math.random() < 0.45) this._chat(reply);
  }

  // Treffer vom Menschen: selbst abziehen und zurückmelden (wie das Spiel eines Gasts)
  _onHit(ev) {
    const b = this.body;
    let dealt = 0;
    if (b.alive && !this.immune) {
      dealt = b.applyDamage(ev.d, { armorPen: ev.p, head: ev.z === 'head', legs: ev.z === 'legs' });
      if (dealt > 0) {
        b.vel.x *= 0.55;
        b.vel.z *= 0.55;
        // wer getroffen wird, weiß, woher es kam
        this.alertPos.copy(this.g.player.feet);
        this.alertAt = this.time;
        this._hear(this.g.player.feet, 999);
      }
    }
    this._event({ t: 'ack', id: ev.id, n: dealt, z: ev.z, k: b.alive ? 0 : 1 });
    if (dealt > 0 && !b.alive) this._die('host', ev.w, ev.z === 'head');
  }

  _die(by, w, head) {
    const b = this.body;
    b.alive = false;
    b.collider.setEnabled(false);
    this.respawnT = DUEL.respawnTime;
    this.plantT = this.defuseT = 0;
    this.seeing = false;
    this._event({ t: 'dead', by, w, h: head ? 1 : 0 });
    if (by === 'host' && head && Math.random() < 0.3) this._chat(1);
  }

  /** Explosion in der Nähe (Granate, Luftschlag, Bombe): Schaden nach Abstand */
  blast(pos, radius, damage, armorPen, exp, by, weapon, los) {
    const b = this.body;
    if (!b.alive || (weapon !== 'bombe' && this.immune)) return;
    _c.copy(b.feet);
    _c.y += 1.0;
    const d = _c.distanceTo(pos);
    if (d >= radius || (los && !this.g.physics.lineOfSight(pos, _c))) return;
    const dealt = b.applyDamage(damage * Math.pow(1 - d / radius, exp), { armorPen });
    if (dealt > 0 && by === 'host') this._hear(this.g.player.feet, 999);
    if (!b.alive) this._die(by, weapon, false);
  }

  /** Blendgranate: je nach Blickrichtung und Abstand ein paar Sekunden blind */
  flash(pos) {
    const b = this.body;
    if (!b.alive) return;
    const eye = this._eye(_e);
    const to = _t.subVectors(pos, eye);
    const d = to.length();
    if (d > GRENADES.flash.radius || !this.g.physics.lineOfSight(eye, pos)) return;
    to.divideScalar(d);
    const cp = Math.cos(b.pitch);
    const dot = -Math.sin(b.yaw) * cp * to.x + Math.sin(b.pitch) * to.y - Math.cos(b.yaw) * cp * to.z;
    const angle = dot > 0.8 ? 1 : dot > 0.3 ? 0.75 : dot > -0.3 ? 0.4 : 0.12;
    const dist = Math.min(1, Math.max(0, 1 - (d - 2) / (GRENADES.flash.radius - 2)));
    this.blindT = Math.max(this.blindT, GRENADES.flash.maxBlind * angle * dist);
    this.seeing = false;
  }

  // ---------- pro Simulationsschritt ----------
  tick(dt) {
    this.time += dt;
    const b = this.body;
    const live = this.phase === 'live';
    this.protectT = Math.max(0, this.protectT - dt);
    this.blindT = Math.max(0, this.blindT - dt);
    if (this.chatT > 0) {
      this.chatT -= dt;
      if (this.chatT <= 0) this.out.push({ t: 'chat', i: this.chatI });
    }
    if (!this.bought && b.alive && (this.phase === 'freeze' || live)) {
      this.buyT -= dt;
      if (this.buyT <= 0) this._buy();
    }
    if (live && !b.alive && this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.lives > 0) this._respawn();
    }
    const active = live && b.alive;
    if (active) {
      this._perceive(dt);
      this._think(dt);
    } else {
      this.in.moveX = this.in.moveY = 0;
      this.in.down.clear();
      if (this.phase === 'freeze' && b.alive) this._lookAround(dt);
    }
    const def = this.weapon.def;
    b.frozen = !active;
    b.busy = this.plantT > 0 || this.defuseT > 0;
    const slow = this.L.weak ? 0.85 : 1;
    b.maxSpeed = def.speed * (this.scoped ? 0.5 : 1) * slow;
    b.sprintSpeed = (def.sprint ?? def.speed) * slow;
    b.tick(dt, this.in);
    if (def.spread) this.inacc *= Math.exp(-dt / def.spread.recovery);
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 60;
      this._sendState();
    }
  }

  _respawn() {
    const b = this.body;
    const sp = SPAWNS.east;
    b.spawn(sp.pos, sp.yaw);
    b.health = 100;
    b.armor = this.roundArmor.armor;
    b.helmet = this.roundArmor.helmet;
    b.collider.setEnabled(true);
    for (const w of [this.inv.primary, this.inv.secondary]) {
      if (!w) continue;
      w.mag = w.def.mag;
      w.reserve = w.def.reserve;
    }
    this.cur = this.inv.primary ? 'primary' : 'secondary';
    this._resetCombat();
    this.protectT = DUEL.spawnProtect;
    this._newPlan();
  }

  _sendState() {
    const b = this.body;
    let f = 0;
    if (b.alive && this.phase !== 'idle') f |= FLAG.ALIVE;
    if (b.onGround) f |= FLAG.GROUND;
    if (this.reloadT > 0) f |= FLAG.RELOAD;
    if (this.scoped) f |= FLAG.ADS;
    if (this.protectT > 0 && this.phase === 'live') f |= FLAG.PROTECT;
    if (b.sprinting) f |= FLAG.SPRINT;
    if (b.busy) f |= FLAG.BUSY;
    const msg = {
      t: 's', k: Math.round(performance.now()), p: pack(b.feet),
      y: Math.round(b.yaw * 1000), a: Math.round(b.pitch * 1000), d: Math.round(b.duckAmount * 100),
      w: WEAPON_IDS.indexOf(this.weapon.id), f, hp: Math.ceil(b.health),
    };
    if (this.events.length) {
      msg.ev = this.events;
      this.events = [];
    }
    this.out.push(msg);
  }

  // ---------- Kaufen ----------
  _buy() {
    this.bought = true;
    const b = this.body;
    const allow = this.arms.allow;
    const ok = (id) => !allow || allow.includes(id);
    let m = this.money;
    if (!this.inv.primary) {
      let id = null;
      if (this.L.weak) {
        // Anfänger: höchstens MP oder Schrotflinte, nie Gewehre
        if (m >= 1250 && Math.random() < 0.5) id = 'falke';
        else if (m >= 1050 && Math.random() < 0.3) id = 'keiler';
      } else if (m >= 4750 + 650 && this.level === 'schwer' && Math.random() < 0.25) id = 'adler';
      else if (m >= 3100 + 650 && Math.random() < 0.45) id = 'luchs';
      else if (m >= 2700) id = 'wolf';
      else if (m >= 1250 && Math.random() < 0.7) id = 'falke';
      else if (m >= 1050) id = 'keiler';
      // Waffen-Modus: nur Erlaubtes (bei "Nur Pistolen" dann öfter die Kobra)
      if (id && !ok(id)) id = null;
      if (id) {
        this.inv.primary = this._weapon(id);
        m -= WEAPONS[id].price;
        this._switch('primary');
      } else if (m >= 700 && this.inv.secondary.id === 'natter' && ok('kobra') && Math.random() < (allow ? 0.7 : 0.4)) {
        this.inv.secondary = this._weapon('kobra');
        m -= WEAPONS.kobra.price;
        this._switch('secondary');
      }
    }
    if (b.armor < 100 && m >= 650 && !(this.L.weak && Math.random() < 0.5)) {
      const helmet = m >= 1000 + 800 && !this.L.weak;
      b.armor = 100;
      b.helmet = helmet;
      m -= helmet ? 1000 : 650;
    }
    this.money = m;
    this.roundArmor = { armor: b.armor, helmet: b.helmet };
  }

  // ---------- Wahrnehmung ----------
  _perceive(dt) {
    this.lookT -= dt;
    if (this.lookT > 0) return;
    this.lookT = 0.08;
    const p = this.g.player;
    const see = p.alive && this.blindT <= 0 && this._canSee(p);
    if (see) {
      if (!this.seeing) {
        // neuer Blickkontakt: erst reagieren, Zielpunkt wählen, mit Anfangsfehler starten
        this.seeing = true;
        this.reactT = this.L.reaction * rand(0.8, 1.35);
        this.aimHead = Math.random() < this.L.head;
        const a = Math.random() * Math.PI * 2;
        const e0 = this.L.aim * 2.2;
        this.errYaw = Math.cos(a) * e0;
        this.errPitch = Math.sin(a) * e0 * 0.6;
        this.burstLeft = 0;
        this.restT = 0;
      }
      this.lastSeen.copy(p.feet);
      this.seenAt = this.time;
    } else {
      this.seeing = false;
    }
    // Hören: rennende Schritte (Schleichen und Ducken sind leise)
    const running = p.alive && p.onGround && !p.ducked && p.horizontalSpeed > p.maxSpeed * 0.6 && !this.g.input.isDown('walk');
    if (running) this._hear(p.feet, this.L.hear);
  }

  _canSee(p) {
    const eye = this._eye(_e);
    const head = _t.copy(p.feet);
    head.y += p.eyeHeight + 0.05;
    const dx = head.x - eye.x, dz = head.z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 85) return false;
    // Blickfeld; ganz nahe Gegner und frische Treffer merkt man immer
    const fresh = this.time - this.alertAt < 1.2;
    if (dist > 3.5 && !fresh && Math.abs(wrap(yawTo(dx, dz) - this.body.yaw)) > (this.L.fov * DEG) / 2) return false;
    const chest = _c.copy(p.feet);
    chest.y += p.eyeHeight * 0.72;
    const physics = this.g.physics;
    let target = null;
    if (physics.lineOfSight(eye, head)) target = head;
    else if (physics.lineOfSight(eye, chest)) target = chest;
    if (!target) return false;
    // Rauch versperrt die Sicht
    for (const c of this.g.grenades.clouds) {
      if (c.t < 0.8 || c.t > GRENADES.smoke.duration + 1) continue;
      if (segDist(eye, target, c.center) < GRENADES.smoke.radius * 0.9) return false;
    }
    return true;
  }

  // ---------- Entscheiden ----------
  _think(dt) {
    const b = this.body;
    this.drawT = Math.max(0, this.drawT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this._finishReload();
    }
    this._maybeAirstrike();
    const flee = this._danger();
    const fight = this.seeing && this.g.player.alive;
    // Legen oder Entschärfen kurz vor dem Ende wird durchgezogen, sonst geht der Kampf vor
    const finishing = (this.plantT > BOMB.plantTime - 0.6) || (this.defuseT > BOMB.defuseTime - 1.2);
    let wish = null, look = null, sprint = false, crouch = false;
    if (fight && !finishing) {
      this.plantT = this.defuseT = 0;
      const r = this._fight(dt);
      wish = r.wish;
      crouch = r.crouch;
      if (flee) wish = this._follow(flee.x, flee.z);
    } else if (flee && !finishing) {
      this.plantT = this.defuseT = 0;
      wish = this._follow(flee.x, flee.z);
      sprint = true;
    } else {
      const o = this._objective(dt);
      wish = o.wish;
      look = o.look;
      sprint = o.sprint;
      this._idleWeapon();
    }
    if (!fight || finishing) {
      // Blick: frischer Treffer > Beobachtungspunkt > Laufrichtung
      let yaw = null, pitch = 0;
      const eye = this._eye(_e);
      const alerted = this.time - this.alertAt < 1.5;
      const at = alerted ? this.alertPos : look;
      if (at) {
        yaw = yawTo(at.x - eye.x, at.z - eye.z);
        // nach einem Treffer auf Brusthöhe des Schützen, sonst geradeaus
        if (alerted) pitch = Math.atan2(at.y + 1.2 - eye.y, Math.hypot(at.x - eye.x, at.z - eye.z));
      } else if (wish) {
        yaw = yawTo(wish.x, wish.z);
      }
      if (yaw !== null) this._turn(dt, yaw, pitch, this.L.turn * (alerted ? 1.4 : 0.8));
    }
    this._applyMove(wish, sprint && !fight, crouch);
  }

  _turn(dt, yaw, pitch, rateDeg) {
    const b = this.body;
    const step = rateDeg * DEG * dt;
    b.yaw += Math.max(-step, Math.min(step, wrap(yaw - b.yaw)));
    b.pitch += Math.max(-step * 0.7, Math.min(step * 0.7, pitch - b.pitch));
    b.pitch = Math.max(-1.4, Math.min(1.4, b.pitch));
  }

  // in der Kaufzeit ab und zu umschauen
  _lookAround(dt) {
    this.idleT = (this.idleT ?? 0) - dt;
    if (this.idleT <= 0) {
      this.idleT = rand(1, 2.5);
      this.idleYaw = SPAWNS.east.yaw + rand(-0.8, 0.8);
    }
    this._turn(dt, this.idleYaw ?? SPAWNS.east.yaw, 0, 90);
  }

  _applyMove(wish, sprint, crouch) {
    const b = this.body;
    const inp = this.in;
    inp.down.clear();
    if (!wish) {
      inp.moveX = inp.moveY = 0;
      this.stuckT = 0;
    } else {
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
      const k = wish.speed ?? 1;
      inp.moveY = (wish.x * fx + wish.z * fz) * k;
      inp.moveX = (wish.x * rx + wish.z * rz) * k;
      // festgefahren? neu planen, beim zweiten Mal springen
      this.stuckT += 1 / 120;
      if (this.stuckT > 0.8) {
        if (this.stuckPos.distanceTo(b.feet) < 0.3) {
          this.stuckCount++;
          this.path = null;
          if (this.stuckCount >= 2) {
            inp.jumpQ = true;
            this.stuckCount = 0;
          }
        } else {
          this.stuckCount = 0;
        }
        this.stuckT = 0;
        this.stuckPos.copy(b.feet);
      }
    }
    if (sprint && inp.moveY > 0.7) inp.down.add('sprint');
    if (crouch) inp.down.add('crouch');
  }

  /** dem Weg zu (x, z) folgen: Richtung {x, z, d} oder null, wenn angekommen */
  _follow(x, z) {
    const b = this.body;
    if (!this.goal || Math.hypot(this.goal.x - x, this.goal.z - z) > 1.2 || !this.path) {
      this.goal = { x, z };
      this.path = this.nav.path(b.feet.x, b.feet.z, x, z) || [{ x, z }];
      this.pathIdx = 0;
    }
    while (this.pathIdx < this.path.length) {
      const pt = this.path[this.pathIdx];
      const dx = pt.x - b.feet.x, dz = pt.z - b.feet.z;
      const d = Math.hypot(dx, dz);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? 0.45 : 0.7)) {
        this.pathIdx++;
        continue;
      }
      return { x: dx / d, z: dz / d, d };
    }
    return null;
  }

  _dist(p) {
    return Math.hypot(p.x - this.body.feet.x, p.z - this.body.feet.z);
  }

  _newPlan() {
    const plan = { lane: pick(MAP.bot.lanes), hunt: null, huntT: 0, hold: null, holdT: 0, guard: null, watch: null };
    if (this.bombMode) {
      if (this.attacking) {
        const s = BOMB_SITES.west;
        plan.site = this.nav.randomNear(s.x, s.z, BOMB.siteRadius - 1);
      } else {
        // Verteidigen: nicht über die Gassen, sondern direkt zum eigenen Platz
        plan.lane = null;
        plan.hold = this._holdSpot(BOMB_SITES.east, 7);
      }
    } else if (Math.random() < 0.2) {
      plan.lane = null;
    }
    this.plan = plan;
  }

  /** Platz zum Halten: begehbar, mit Blick auf center, möglichst an einer Deckung */
  _holdSpot(center, r) {
    let best = null, bestScore = -1;
    const eye = new THREE.Vector3();
    const tgt = new THREE.Vector3(center.x, 1.2, center.z);
    for (let k = 0; k < 24; k++) {
      const pt = this.nav.randomNear(center.x, center.z, r, 4);
      if (!pt) continue;
      eye.set(pt.x, 1.6, pt.z);
      if (!this.g.physics.lineOfSight(eye, tgt)) continue;
      const cx = this.nav.cellX(pt.x), cz = this.nav.cellZ(pt.z);
      const score = this.nav.extra[cz * this.nav.nx + cx] + Math.random() * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = pt;
      }
    }
    return best || this.nav.randomNear(center.x, center.z, r);
  }

  /** Ziel ohne Gegner im Blick: Bombe legen/entschärfen/bewachen, Platz halten, suchen */
  _objective(dt) {
    const b = this.body;
    const plan = this.plan || (this._newPlan(), this.plan);
    const now = this.time;
    const quiet = now - this.seenAt > 3;
    if (this.bombMode) {
      if (this.attacking && !this.bomb) {
        const site = BOMB_SITES.west;
        if (this._dist(site) < BOMB.siteRadius - 0.4 && now - this.seenAt > 1.2 && b.onGround) {
          this.plantT += dt;
          if (this.plantT >= BOMB.plantTime) this._plant();
          return { wish: null, look: this.g.player.feet };
        }
        this.plantT = 0;
        if (plan.lane && this._dist({ x: plan.lane[0], z: plan.lane[1] }) > 3 && b.feet.x > plan.lane[0] - 2) {
          return { wish: this._follow(plan.lane[0], plan.lane[1]), sprint: quiet };
        }
        plan.lane = null;
        return { wish: this._follow(plan.site.x, plan.site.z), sprint: quiet && this._dist(plan.site) > 8 };
      }
      if (this.attacking && this.bomb) {
        // Bombe bewachen: in der Nähe mit Blick auf sie
        plan.guard ||= this._holdSpot(this.bomb.pos, 8);
        const w = this._follow(plan.guard.x, plan.guard.z);
        return { wish: w, look: w ? null : this.bomb.pos, sprint: false };
      }
      if (!this.attacking && this.bomb && !this.defused) {
        const d = this._dist(this.bomb.pos);
        if (d <= BOMB.defuseRange - 0.25) {
          if (this.bomb.t > BOMB.defuseTime - this.defuseT + 0.1) {
            this.defuseT += dt;
            if (this.defuseT >= BOMB.defuseTime) this._defuse();
          }
          return { wish: null, look: this.bomb.pos };
        }
        this.defuseT = 0;
        return { wish: this._follow(this.bomb.pos.x, this.bomb.pos.z), sprint: true };
      }
      if (!this.attacking) {
        // Platz halten, ab und zu ein Stück versetzen; Blick dorthin, woher der Angreifer kommt
        // (Bereiche je Karte, z. B. die Gasse entlang nach Westen oder die Öffnung zur Mitte)
        plan.holdT -= dt;
        if (plan.holdT <= 0) {
          plan.holdT = rand(6, 11);
          if (Math.random() < 0.4) plan.hold = this._holdSpot(BOMB_SITES.east, 7);
          const [x0, x1, z0, z1] = pick(MAP.bot.watch);
          plan.watch = { x: rand(x0, x1), y: 1.2, z: rand(z0, z1) };
        }
        const w = this._follow(plan.hold.x, plan.hold.z);
        return { wish: w, look: w ? null : plan.watch, sprint: false };
      }
    }
    // Kampf: nach einem Abschuss erst zurückziehen
    if (now < this.retreatUntil && this.retreat) {
      const w = this._follow(this.retreat.x, this.retreat.z);
      return { wish: w, look: w ? null : SPAWNS.west.pos, sprint: false };
    }
    // erst zur letzten bekannten Stelle, sonst den Menschen suchen
    if (now - this.seenAt < 6) {
      const w = this._follow(this.lastSeen.x, this.lastSeen.z);
      if (w) return { wish: w, sprint: false };
    }
    if (now - this.heardAt < 5) {
      const w = this._follow(this.heard.x, this.heard.z);
      if (w) return { wish: w, look: w ? null : this.heard, sprint: false };
    }
    if (plan.lane && this._dist({ x: plan.lane[0], z: plan.lane[1] }) > 3 && b.feet.x > plan.lane[0] - 2) {
      return { wish: this._follow(plan.lane[0], plan.lane[1]), sprint: quiet };
    }
    plan.lane = null;
    // die KI ahnt ungefähr, wo der Mensch steckt (je schwerer, desto genauer), sonst würde man ewig suchen
    plan.huntT -= dt;
    if (!plan.hunt || plan.huntT <= 0) {
      const p = this.g.player.feet;
      let hx = p.x, hz = p.z;
      // nicht bis an seinen Startpunkt: dort höchstens bis auf 9 m heran
      const sp = SPAWNS.west.pos;
      const ds = Math.hypot(hx - sp.x, hz - sp.z);
      if (ds < 9) {
        const l = ds || 1;
        hx = sp.x + ((hx - sp.x) / l) * 9 + (ds < 0.5 ? 9 : 0);
        hz = sp.z + ((hz - sp.z) / l) * 9;
      }
      plan.hunt = this.nav.randomNear(hx, hz, this.L.hunt);
      plan.huntT = rand(4, 7);
    }
    const w = this._follow(plan.hunt.x, plan.hunt.z);
    if (!w) plan.huntT = Math.min(plan.huntT, 1.2);
    return { wish: w, look: w ? null : this.g.player.feet, sprint: quiet && !!w && w.d > 10 };
  }

  _plant() {
    const b = this.body;
    this.plantT = 0;
    this._earn(BOMB.plantReward);
    this._event({ t: 'plant', p: pack(b.feet), y: Math.round(b.yaw * 100) });
    // sofort merken, der Host bestätigt mit seiner nächsten Rundenmeldung
    this.bomb = { pos: b.feet.clone(), t: BOMB.timer };
    if (this.plan) this.plan.guard = null;
  }

  _defuse() {
    this.defuseT = 0;
    this.defused = true;
    this._earn(BOMB.defuseReward);
    this._event({ t: 'defused' });
  }

  /** Gefahr: im Kreis eines Luftschlags oder zu nah an der Bombe kurz vor der Explosion */
  _danger() {
    const b = this.body;
    for (const s of this.g.airstrikes.list) {
      if (s.next >= s.hits.length) continue;
      const dx = b.feet.x - s.point.x, dz = b.feet.z - s.point.z;
      const d = Math.hypot(dx, dz);
      if (d > SPECIAL.radius + 2.5) continue;
      const k = d > 0.3 ? (SPECIAL.radius + 5) / d : 0;
      const a = Math.random() * Math.PI * 2;
      const tx = d > 0.3 ? s.point.x + dx * k : s.point.x + Math.cos(a) * (SPECIAL.radius + 5);
      const tz = d > 0.3 ? s.point.z + dz * k : s.point.z + Math.sin(a) * (SPECIAL.radius + 5);
      return this.nav.snap(tx, tz);
    }
    const bomb = this.bomb;
    if (bomb && !this.defused) {
      const d = this._dist(bomb.pos);
      const canDefuse = !this.attacking && bomb.t > BOMB.defuseTime + d / 6 + 0.4;
      if (bomb.t < 9 && d < 15 && !canDefuse) {
        const dx = b.feet.x - bomb.pos.x, dz = b.feet.z - bomb.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        return this.nav.snap(bomb.pos.x + (dx / l) * 18, bomb.pos.z + (dz / l) * 18);
      }
    }
    return null;
  }

  /** Luftschlag anfordern, wenn die Leiste voll ist und der Mensch sich irgendwo versteckt */
  _maybeAirstrike() {
    if (this.special < SPECIAL.charge || this.seeing || this.time < this.airT) return;
    this.airT = this.time + 1.5;
    let known = null;
    if (this.time - this.seenAt < 8) known = this.lastSeen;
    else if (this.time - this.heardAt < 5) known = this.heard;
    if (!known || this._dist(known) < SPECIAL.radius + 7 || Math.random() > this.L.air) return;
    const x = known.x + rand(-2, 2), z = known.z + rand(-2, 2);
    // Boden unter dem Ziel (auch auf dem Balkon oder Laufsteg)
    const y0 = (known.y || 0) + 1.2;
    const hit = this.g.physics.raycast({ x, y: y0, z }, DOWN, 4);
    const point = new THREE.Vector3(x, hit ? y0 - hit.distance : 0, z);
    // unter einem Dach kommt der Jet nicht hin: lieber warten
    if (!this.g.airstrikes.openSky(point)) return;
    this.special = 0;
    this.protectT = 0;
    this._event({ t: 'air', p: pack(point), s: Math.floor(Math.random() * 2147483647), y: Math.round(this.body.yaw * 1000) });
  }

  // ---------- Waffe ----------
  _switch(slot) {
    if (!this.inv[slot] || this.cur === slot) return;
    this.cur = slot;
    this.drawT = this.inv[slot].def.draw;
    this.reloadT = 0;
    this.scoped = false;
    this.scopeT = 0;
    this.inacc = 0;
  }

  _reload() {
    const w = this.weapon;
    const def = w.def;
    if (this.reloadT > 0 || !def.mag || w.mag >= def.mag || w.reserve <= 0) return;
    this.reloadT = def.shellReload ? def.reloadStart + def.reload * (def.mag - w.mag) : def.reload;
    this.scoped = false;
  }

  _finishReload() {
    const w = this.weapon;
    const take = Math.min(w.def.mag - w.mag, w.reserve);
    w.mag += take;
    w.reserve -= take;
    this.reloadT = 0;
  }

  // ohne Gegner: nachladen und wieder zur Hauptwaffe greifen
  _idleWeapon() {
    if (this.time - this.seenAt < 1.5 || this.reloadT > 0 || this.drawT > 0) return;
    if (this.cur === 'secondary' && this.inv.primary && this.inv.primary.mag + this.inv.primary.reserve > 0) {
      this._switch('primary');
      return;
    }
    const w = this.weapon;
    if (w.def.mag && w.mag < w.def.mag * 0.5 && w.reserve > 0) this._reload();
  }

  _spread(def) {
    const s = def.spread;
    const b = this.body;
    let base = s.base;
    if (def.scope) base = this.scoped ? s.scoped : s.base;
    if (b.ducked) base *= 0.75;
    const max = def.speed;
    const moveFrac = Math.min(1, Math.max(0, (b.horizontalSpeed - MOVE.accurateSpeed * max) / (max * (1 - MOVE.accurateSpeed))));
    return base + s.move * moveFrac + (b.onGround ? 0 : s.air) + this.inacc;
  }

  // ---------- Kampf ----------
  _fight(dt) {
    const b = this.body;
    const p = this.g.player;
    const L = this.L;
    let w = this.weapon;
    // leer: nachladen oder (ab Mittel) schnell zur Pistole
    if (w.mag <= 0 && this.reloadT <= 0 && this.drawT <= 0) {
      if (L.pistol && this.cur === 'primary' && this.inv.secondary.mag > 0) this._switch('secondary');
      else if (w.reserve > 0) this._reload();
      else if (this.cur === 'primary') this._switch('secondary');
      w = this.weapon;
    }
    // Zielpunkt und Zielfehler (springt alle paar Zehntelsekunden, dazwischen weich)
    const aimPos = _t.copy(p.feet);
    aimPos.y += this.aimHead ? p.eyeHeight + 0.03 : p.eyeHeight * 0.72;
    this.jitT -= dt;
    if (this.jitT <= 0) {
      this.jitT = rand(0.18, 0.32);
      const a = Math.random() * Math.PI * 2;
      const m = L.aim * rand(0.2, 1) * (b.horizontalSpeed > 1.5 ? 1.5 : 1);
      this.jYaw = Math.cos(a) * m;
      this.jPitch = Math.sin(a) * m * 0.6;
    }
    const k = 1 - Math.exp(-dt / 0.3);
    this.errYaw += (this.jYaw - this.errYaw) * k;
    this.errPitch += (this.jPitch - this.errPitch) * k;
    const eye = this._eye(_e);
    const dx = aimPos.x - eye.x, dy = aimPos.y - eye.y, dz = aimPos.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = yawTo(dx, dz) + this.errYaw * DEG;
    const wantPitch = Math.atan2(dy, dist) + this.errPitch * DEG;
    this._turn(dt, wantYaw, wantPitch, L.turn);
    const off = Math.hypot(wrap(wantYaw - b.yaw), wantPitch - b.pitch) / DEG;
    this.reactT -= dt;
    // den bläulich schimmernden Spawn-Schutz des Menschen abwarten (außer auf Leicht);
    // danach braucht die KI trotzdem ihre Reaktionszeit, sonst schießt sie im selben Moment
    const shielded = this.g.match.protectT > 0 && this.level !== 'leicht';
    if (shielded) this.reactT = Math.max(this.reactT, this.L.reaction);
    const ready = this.reactT <= 0 && this.drawT <= 0 && this.reloadT <= 0 && w.mag > 0 && !shielded;
    const sniper = !!w.def.scope;
    if (sniper) {
      if (b.horizontalSpeed < 0.8 && off < 6) this.scopeT += dt;
      else this.scopeT = 0;
      this.scoped = this.scopeT > 0.3;
    }
    let fire = false;
    if (ready && off < (sniper ? 0.8 : 1.6) && (!sniper || this.scoped)) {
      if (w.def.auto) {
        if (this.restT > 0) this.restT -= dt;
        else {
          if (this.burstLeft <= 0) {
            this.burstLeft = randInt(L.burst[0], L.burst[1]);
            if (dist > 20) this.burstLeft = Math.max(1, Math.round(this.burstLeft / 2));
            this.crouchBurst = this.level === 'schwer' && dist > 12 && Math.random() < 0.35;
          }
          fire = true;
        }
      } else {
        fire = this.time >= this.tapAt;
      }
    }
    if (fire && this.time >= this.nextFire) this._shoot(w, dist);
    // Bewegung: ab Mittel zum Schießen stehen bleiben, zwischendurch seitlich ausweichen
    let wish = null;
    const aiming = ready && off < 5;
    if (dist < 2.5) {
      const l = dist || 1;
      wish = { x: -dx / l, z: -dz / l };
    } else if (!(L.stop && aiming) && !(sniper && this.scopeT > 0)) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.35, 0.8);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const rx = Math.cos(b.yaw) * this.strafeDir, rz = -Math.sin(b.yaw) * this.strafeDir;
      if (!this.nav.clear(b.feet.x, b.feet.z, b.feet.x + rx * 1.2, b.feet.z + rz * 1.2)) this.strafeDir *= -1;
      wish = { x: Math.cos(b.yaw) * this.strafeDir, z: -Math.sin(b.yaw) * this.strafeDir };
      // auf Leicht läuft die KI dabei auf den Gegner zu
      if (!L.stop && dist > 8) {
        const l = dist || 1;
        wish = { x: wish.x * 0.5 + (dx / l) * 0.8, z: wish.z * 0.5 + (dz / l) * 0.8 };
      }
    }
    return { wish, crouch: !!this.crouchBurst && this.burstLeft > 0 };
  }

  _shoot(w, dist) {
    const b = this.body;
    const def = w.def;
    const L = this.L;
    w.mag--;
    this.nextFire = this.time + 60 / def.rpm;
    this.tapAt = this.time + rand(L.tap[0], L.tap[1]) + (def.scope ? 0.35 : 0);
    this.protectT = 0;
    if (def.auto) {
      this.burstLeft--;
      if (this.burstLeft <= 0) this.restT = rand(L.rest[0], L.rest[1]) * (dist > 20 ? 1.4 : 1);
    }
    const eye = this._eye(_e);
    const spread = this._spread(def) / 1000;
    const cp = Math.cos(b.pitch);
    _d.set(-Math.sin(b.yaw) * cp, Math.sin(b.pitch), -Math.cos(b.yaw) * cp);
    _r.set(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
    _u.crossVectors(_r, _d);
    const ends = [];
    const zones = { head: 0, body: 0, legs: 0 };
    let hitPoint = null;
    const rays = def.pellets || 1;
    const cone = def.pellets ? def.pelletSpread / 1000 : 0;
    const a0 = Math.random() * Math.PI * 2, r0 = spread * Math.random();
    for (let i = 0; i < rays; i++) {
      const dir = _c.copy(_d).addScaledVector(_r, Math.cos(a0) * r0).addScaledVector(_u, Math.sin(a0) * r0);
      if (cone) {
        const a = Math.random() * Math.PI * 2, r = cone * Math.sqrt(Math.random());
        dir.addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u, Math.sin(a) * r);
      }
      dir.normalize();
      const world = this.g.physics.raycast(eye, dir, 250);
      const wd = world ? world.distance : 250;
      const hit = this.g.player.alive ? hitPlayer(eye, dir, wd, this.g.player) : null;
      if (hit) {
        const mul = hit.zone === 'head' ? def.headMul : hit.zone === 'legs' ? DUEL.legMul : 1;
        zones[hit.zone] += def.damage * mul * Math.pow(def.rangeMod, hit.distance / 10);
        hitPoint ||= hit.point;
        ends.push(shotEnd(hit.point));
      } else {
        _end.copy(eye).addScaledVector(dir, wd);
        ends.push(shotEnd(_end, world?.surface, world?.normal));
      }
    }
    this.inacc += def.spread.fire;
    if (def.scope) {
      this.scoped = false;
      this.scopeT = -0.6;
    }
    const tracer = def.tracer && this.shots++ % def.tracer === 0 ? 1 : 0;
    this._event({ t: 'f', w: def.id, m: pack(eye), e: ends, tr: tracer });
    if (hitPoint) {
      for (const zone of ['head', 'body', 'legs']) {
        if (zones[zone] > 0) this._event({ t: 'hit', id: ++this.hitId, d: Math.round(zones[zone]), z: zone, w: def.id, p: def.armorPen ?? 0.5 });
      }
    }
  }
}
