import * as THREE from 'three';
import { DUEL, ECONOMY, WEAPONS, WEAPON_IDS } from '../config.js';
import { SPAWNS } from '../world/map.js';
import { Match } from './match.js';
import { FLAG } from './remote.js';

const other = (role) => (role === 'host' ? 'guest' : 'host');
const pack = (v) => [Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)];
const unpack = (a, out = new THREE.Vector3()) => out.set(a[0] / 100, a[1] / 100, a[2] / 100);
// Oberflächen als Zahl (0 = kein Einschlag, z. B. Treffer am Spieler)
const SURFACES = ['', 'stone', 'sand', 'metal', 'wood'];

const _muzzle = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Endpunkt eines Schusses fürs Netz: Punkt, bei einem Einschlag dazu Oberfläche und Normale */
export function shotEnd(point, surface, normal) {
  const e = pack(point);
  const s = SURFACES.indexOf(surface || '');
  if (s > 0) e.push(s, Math.round(normal.x * 100), Math.round(normal.y * 100), Math.round(normal.z * 100));
  return e;
}

// 1 gegen 1: gleiche Wirtschaft wie im Training, dazu Leben pro Runde und Rundensiege.
// Wer die Lobby erstellt hat (Host), bestimmt Rundenstart und Rundenende. Treffer meldet
// der Schütze, der Getroffene zieht sich die Lebenspunkte selbst ab.
export class Duel extends Match {
  constructor(game, net, opts) {
    super(game);
    this.duel = true;
    this.net = net;
    this.me = opts.role;
    this.them = other(opts.role);
    this.isHost = opts.role === 'host';
    this.side = this.isHost ? 'west' : 'east';
    this.cfg = { lives: opts.lives, wins: opts.wins };
    this.names = { [this.me]: opts.myName, [this.them]: opts.theirName };
    this.queue = [];
    this.urgent = false;
    this.sendT = 0;
    this.sinceSend = 0;
    this.phT = 0;
    this.hitId = 0;
    this.hitPoints = new Map();
    this.onAgainChange = null;
    net.onMessage = (msg, from) => {
      if (from === net.partner) this._onMessage(msg);
    };
  }

  reset() {
    super.reset();
    this.stats.deaths = 0;
    this.lives = { host: 0, guest: 0 };
    this.wins = { host: 0, guest: 0 };
    this.respawnT = 0;
    this.protectT = 0;
    this.lostT = 0;
    this.left = false;
    this.again = { host: false, guest: false };
    this.loadoutArmor = { armor: 0, helmet: false };
  }

  get roundTime() {
    return DUEL.roundTimeBase + DUEL.roundTimePerLife * this.cfg.lives;
  }

  get fireBlocked() {
    return this.phase === 'freeze' || this.phase === 'over' || this.phase === 'idle';
  }

  // Schaden gibt es nur in der laufenden Runde und nicht direkt nach dem Wiedereinstieg
  get immune() {
    return this.phase !== 'live' || this.protectT > 0;
  }

  get roundLabel() {
    return `Runde ${this.round} · Sieg bei ${this.cfg.wins}`;
  }

  name(role) {
    return role === this.me ? 'Du' : this.names[role];
  }

  start() {
    this.reset();
    const { player, weapons } = this.g;
    weapons.inv.reset();
    player.armor = 0;
    player.helmet = false;
    this.round = 0;
    // beide beginnen sofort, der Host bestätigt die Runde gleich danach
    this.lives = { host: this.cfg.lives, guest: this.cfg.lives };
    this.timer = DUEL.firstFreezeTime;
    this._beginRound(1);
    if (this.isHost) this._hostPhase({ ph: 'freeze', r: 1, tm: DUEL.firstFreezeTime });
  }

  // ---------- Rundenablauf (Host entscheidet, beide spielen ihn gleich ab) ----------
  _phaseMsg(patch) {
    return {
      t: 'ph', ph: this.phase, r: this.round, tm: Math.round(this.timer * 100) / 100,
      lv: [this.lives.host, this.lives.guest], w: [this.wins.host, this.wins.guest], ...patch,
    };
  }

  _hostPhase(patch) {
    const msg = this._phaseMsg(patch);
    this._applyPhase(msg);
    this.last = msg;
    this.net.send(msg);
    this.phT = 1;
  }

  _applyPhase(msg) {
    const newRound = msg.r !== this.round;
    const changed = newRound || msg.ph !== this.phase;
    this.lives.host = msg.lv[0];
    this.lives.guest = msg.lv[1];
    this.wins.host = msg.w[0];
    this.wins.guest = msg.w[1];
    const lat = this.isHost ? 0 : Math.min(0.3, this.net.ping / 2000);
    this.timer = Math.max(0, msg.tm - lat);
    if (!changed || this.phase === 'over') return;
    if (newRound) this._beginRound(msg.r);
    if (msg.ph === 'live') this._goLive();
    else if (msg.ph === 'end') this._roundOver(msg);
    else if (msg.ph === 'over') this._finish();
  }

  _beginRound(r) {
    const g = this.g;
    this.round = r;
    this.phase = 'freeze';
    this.purchases = [];
    this.roundStats = { kills: 0, heads: 0, shots: 0, hits: 0, deaths: 0, reward: 0 };
    g.grenades.clear();
    const sp = SPAWNS[this.side];
    g.player.spawn(sp.pos, sp.yaw);
    g.player.health = 100;
    g.player.frozen = true;
    g.viewmodel.root.visible = true;
    g.weapons.inv.refillAmmo();
    g.weapons.resetForRound();
    this.respawnT = 0;
    this.protectT = 0;
    this.loadoutArmor = { armor: g.player.armor, helmet: g.player.helmet };
    g.hud.message(`Runde ${r}`, 'Kaufzeit – mit B öffnest du das Kaufmenü', 3);
    g.hud.onWeaponChange();
    g.hud.onMoney(0);
    this.lastBeep = Math.ceil(this.timer);
  }

  _goLive() {
    const g = this.g;
    this.phase = 'live';
    this.buyTimer = DUEL.buyWindow;
    g.player.frozen = false;
    // Spawn-Schutz auch beim Rundenstart: sonst trifft man sich sofort durch den Tunnel in der Mitte
    this.protectT = DUEL.spawnProtect;
    g.audio.play('roundStart');
    const lives = this.cfg.lives > 1 ? ` · ${this.cfg.lives} Leben` : '';
    g.hud.message('Los!', `${this.names[this.them]} kommt von der anderen Seite${lives}`, 1.8);
  }

  /** eigener Angriff (Schuss, Messer, Wurf) beendet den Spawn-Schutz sofort */
  onAttack() {
    this.protectT = 0;
  }

  _roundOver(msg) {
    const g = this.g;
    this.phase = 'end';
    const draw = msg.win === 'draw';
    const won = msg.win === this.me;
    let bonus;
    if (won) {
      bonus = ECONOMY.roundWin;
      this.lossStreak = 0;
    } else {
      bonus = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * this.lossStreak);
      if (!draw) this.lossStreak++;
    }
    this.addMoney(bonus);
    this.rounds.push({ won, draw, why: msg.why, kills: this.roundStats.kills, deaths: this.roundStats.deaths });
    const last = Math.max(msg.w[0], msg.w[1]) >= this.cfg.wins;
    g.hud.roundEnd(won, this._reason(msg), bonus, last, draw);
    g.audio.play(won ? 'roundWin' : 'roundLose');
    g.player.frozen = true;
    this.respawnT = 0;
    if (!g.player.alive) {
      // wie in CS: wer tot ist, verliert seine Ausrüstung
      g.weapons.inv.reset();
      g.player.armor = 0;
      g.player.helmet = false;
    }
  }

  _reason(msg) {
    const them = this.names[this.them];
    const won = msg.win === this.me;
    switch (msg.why) {
      case 'elim': return won ? `${them} hat keine Leben mehr` : 'Du hast keine Leben mehr';
      case 'time-lives': return `Zeit abgelaufen · ${won ? 'du hast' : `${them} hat`} mehr Leben übrig`;
      case 'time-hp': return `Zeit abgelaufen · ${won ? 'du hast' : `${them} hat`} mehr Lebenspunkte`;
      default: return 'Zeit abgelaufen · Gleichstand';
    }
  }

  tick(dt) {
    const g = this.g;
    this._tickConnection(dt);
    if (this.phase === 'over' || this.phase === 'idle') return;
    this.protectT = Math.max(0, this.protectT - dt);
    if (this.isHost) {
      this.phT -= dt;
      if (this.phT <= 0 && this.last) {
        // regelmäßig wiederholen, falls eine Nachricht verloren ging (mit Sieger der Runde)
        this.net.send(this._phaseMsg({ win: this.last.win, why: this.last.why }));
        this.phT = 1;
      }
    }
    if (this.phase === 'freeze') {
      this.timer = Math.max(0, this.timer - dt);
      g.player.frozen = true;
      const s = Math.ceil(this.timer);
      if (s !== this.lastBeep && s <= 3 && s > 0) g.audio.play('beep', { freq: 660 });
      this.lastBeep = s;
      if (this.isHost && this.timer <= 0) this._hostPhase({ ph: 'live', tm: this.roundTime });
    } else if (this.phase === 'live') {
      this.timer = Math.max(0, this.timer - dt);
      this.buyTimer -= dt;
      this._tickRespawn(dt);
      if (this.isHost && this.timer <= 0) this._hostTimeUp();
    } else if (this.phase === 'end') {
      this.timer = Math.max(0, this.timer - dt);
      if (this.isHost && this.timer <= 0) {
        if (Math.max(this.wins.host, this.wins.guest) >= this.cfg.wins) this._hostPhase({ ph: 'over', tm: 0 });
        else this._hostPhase({ ph: 'freeze', r: this.round + 1, tm: DUEL.freezeTime, lv: [this.cfg.lives, this.cfg.lives] });
      }
    }
  }

  _hostTimeUp() {
    const g = this.g;
    const lv = this.lives;
    const hp = {
      [this.me]: g.player.alive ? g.player.health : 0,
      [this.them]: g.remote.alive ? g.remote.hp : 0,
    };
    let win = 'draw', why = 'time-draw';
    if (lv.host !== lv.guest) {
      win = lv.host > lv.guest ? 'host' : 'guest';
      why = 'time-lives';
    } else if (hp.host !== hp.guest) {
      win = hp.host > hp.guest ? 'host' : 'guest';
      why = 'time-hp';
    }
    this._hostEndRound(win, why);
  }

  _hostEndRound(win, why, lv = this.lives) {
    const w = { ...this.wins };
    if (win !== 'draw') w[win]++;
    this._hostPhase({ ph: 'end', tm: DUEL.roundEndTime, w: [w.host, w.guest], lv: [lv.host, lv.guest], win, why });
  }

  _hostDeath(victim) {
    if (this.phase !== 'live') return;
    const lv = { ...this.lives };
    lv[victim] = Math.max(0, lv[victim] - 1);
    if (lv[victim] === 0) this._hostEndRound(other(victim), 'elim', lv);
    else this._hostPhase({ lv: [lv.host, lv.guest] });
  }

  // ---------- Tod und Wiedereinstieg ----------
  /** eigener Tod: by = Rolle des Schützen (bei eigener Granate die eigene Rolle) */
  onLocalDeath({ by, w, head }) {
    const g = this.g;
    g.viewmodel.root.visible = false;
    this.stats.deaths++;
    if (this.roundStats) this.roundStats.deaths++;
    this.respawnT = DUEL.respawnTime;
    this._queue({ t: 'dead', by, w, h: head ? 1 : 0 }, true);
    this._feed(by, this.me, w, head);
    const left = this.lives[this.me] - 1;
    const sub = this.phase === 'live' && left > 0
      ? `Noch ${left} ${left === 1 ? 'Leben' : 'Leben'} · gleich geht es weiter` : '';
    const title = by === this.me ? 'Selbst erwischt' : `${this.names[by]} hat dich erwischt`;
    g.hud.message(title, sub, 3);
    if (this.isHost) this._hostDeath(this.me);
  }

  _tickRespawn(dt) {
    const g = this.g;
    if (g.player.alive || this.respawnT <= 0) return;
    this.respawnT -= dt;
    if (this.respawnT > 0 || this.lives[this.me] <= 0) return;
    const sp = SPAWNS[this.side];
    const p = g.player;
    p.spawn(sp.pos, sp.yaw);
    p.health = 100;
    p.frozen = false;
    p.armor = this.loadoutArmor.armor;
    p.helmet = this.loadoutArmor.helmet;
    g.weapons.inv.refillAmmo();
    g.weapons.resetForRound();
    g.viewmodel.root.visible = true;
    this.protectT = DUEL.spawnProtect;
    const n = this.lives[this.me];
    g.hud.message('Weiter geht’s', `Noch ${n} Leben · ${DUEL.spawnProtect} s Spawn-Schutz`, 1.5);
  }

  _feed(killer, victim, w, head) {
    const def = WEAPONS[w];
    this.g.hud.killfeed(def ? def.name : '?', head, 0, this.name(killer), this.name(victim), killer === this.me || victim === this.me);
  }

  // Geld und Statistik für einen eigenen Abschuss (die Meldung kommt vom Gegner)
  onKill(def, head) {
    this.stats.kills++;
    if (head) this.stats.heads++;
    if (this.roundStats) {
      this.roundStats.kills++;
      if (head) this.roundStats.heads++;
      this.roundStats.reward += def.reward;
    }
    this.addMoney(def.reward);
  }

  buy(id) {
    const r = super.buy(id);
    this.loadoutArmor = { armor: this.g.player.armor, helmet: this.g.player.helmet };
    return r;
  }

  refund(id) {
    const r = super.refund(id);
    this.loadoutArmor = { armor: this.g.player.armor, helmet: this.g.player.helmet };
    return r;
  }

  // ---------- Meldungen der eigenen Waffen an den Gegner ----------
  sendHit(damage, zone, def, point) {
    const id = ++this.hitId;
    this.hitPoints.set(id, point.clone());
    if (this.hitPoints.size > 64) this.hitPoints.delete(this.hitPoints.keys().next().value);
    this._queue({ t: 'hit', id, d: Math.round(damage), z: zone, w: def.id, p: def.armorPen ?? 0.5 }, true);
  }

  shotFx(def, muzzle, ends, tracer) {
    this._queue({ t: 'f', w: def.id, m: pack(muzzle), e: ends, tr: tracer ? 1 : 0 });
  }

  swingFx() {
    this._queue({ t: 'k' });
  }

  nadeFx(id, type, pos, vel) {
    this._queue({ t: 'n', id, k: type, p: pack(pos), v: pack(vel) }, true);
  }

  boomFx(id, type, pos) {
    this._queue({ t: 'b', id, k: type, p: pack(pos) }, true);
  }

  // ---------- Netz ----------
  _queue(ev, urgent = false) {
    this.queue.push(ev);
    if (urgent) this.urgent = true;
  }

  /** pro Bild: Zustand senden (direkt 30-mal, über den Server 12-mal pro Sekunde) */
  netUpdate(dt) {
    this.sinceSend += dt;
    this.sendT -= dt;
    const server = this.net.mode === 'server';
    const due = this.sendT <= 0 || (this.urgent && (!server || this.sinceSend >= 0.05));
    if (!due) return;
    this.sendT = server ? 1 / 12 : 1 / 30;
    this._sendState();
  }

  _sendState() {
    const g = this.g;
    const p = g.player;
    const ws = g.weapons;
    let f = 0;
    if (p.alive) f |= FLAG.ALIVE;
    if (p.onGround) f |= FLAG.GROUND;
    if (ws.reloading) f |= FLAG.RELOAD;
    if (ws.ads > 0.5) f |= FLAG.ADS;
    if (g.input.isDown('walk')) f |= FLAG.WALK;
    if (this.protectT > 0 && this.phase === 'live') f |= FLAG.PROTECT;
    const msg = {
      t: 's', k: Math.round(performance.now()), p: pack(p.feet),
      y: Math.round(p.yaw * 1000), a: Math.round(p.pitch * 1000), d: Math.round(p.duckAmount * 100),
      w: ws.active ? WEAPON_IDS.indexOf(ws.active.id) : -1, f, hp: Math.ceil(p.health),
    };
    if (this.queue.length) {
      msg.ev = this.queue;
      this.queue = [];
    }
    this.urgent = false;
    this.sinceSend = 0;
    this.net.send(msg);
  }

  _onMessage(msg) {
    const g = this.g;
    switch (msg.t) {
      case 's':
        g.remote.push(msg);
        if (msg.ev) for (const ev of msg.ev) this._onEvent(ev);
        break;
      case 'ph':
        if (!this.isHost) this._applyPhase(msg);
        break;
      case 'again':
        this.again[this.them] = true;
        this._checkAgain();
        break;
      case 'start':
        if (!this.isHost && this.phase === 'over') g.onRematch?.(msg.cfg);
        break;
      case 'bye':
        this._opponentLeft();
        break;
      default:
        break;
    }
  }

  _onEvent(ev) {
    const g = this.g;
    switch (ev.t) {
      case 'hit': this._onHit(ev); break;
      case 'ack': this._onAck(ev); break;
      case 'dead': {
        g.remote.die();
        if (ev.by === this.me) {
          this.onKill(WEAPONS[ev.w] || WEAPONS.natter, !!ev.h);
          g.audio.play('kill');
          g.hud.hitmarker(!!ev.h, true);
        }
        this._feed(ev.by, this.them, ev.w, !!ev.h);
        if (this.isHost) this._hostDeath(this.them);
        break;
      }
      case 'f': this._onFire(ev); break;
      case 'k':
        g.remote.jabMove();
        g.audio.play('swing', { position: g.remote.position });
        break;
      case 'n': {
        const pos = unpack(ev.p);
        g.grenades.throw(ev.k, pos, unpack(ev.v), { ghost: true, id: ev.id });
        g.remote.jabMove();
        g.audio.play('throw', { position: pos });
        break;
      }
      case 'b': g.grenades.remoteBoom(ev.id, ev.k, unpack(ev.p)); break;
      default: break;
    }
  }

  // Treffer vom Gegner: selbst abziehen (Weste und Helm zählen hier) und Ergebnis zurückmelden
  _onHit(ev) {
    const g = this.g;
    const p = g.player;
    let dealt = 0;
    if (p.alive && !this.immune) {
      dealt = p.applyDamage(ev.d, { armorPen: ev.p, head: ev.z === 'head', legs: ev.z === 'legs' });
      if (dealt > 0) {
        g.hud.hurt(dealt);
        g.hud.hitFrom(g.remote.position);
        g.audio.play('hurt');
        // wie in CS: Treffer bremsen
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
      }
    }
    this._queue({ t: 'ack', id: ev.id, n: dealt, z: ev.z, k: p.alive ? 0 : 1 }, true);
    if (dealt > 0 && !p.alive) this.onLocalDeath({ by: this.them, w: ev.w, head: ev.z === 'head' });
  }

  _onAck(ev) {
    const point = this.hitPoints.get(ev.id);
    this.hitPoints.delete(ev.id);
    this.stats.damage += ev.n;
    if (point && ev.n > 0) this.g.hud.damageNumber(point, ev.n, ev.z === 'head');
  }

  _onFire(ev) {
    const g = this.g;
    const def = WEAPONS[ev.w];
    if (!def) return;
    g.remote.fire(def);
    g.remote.muzzlePosition(_muzzle);
    g.audio.shot(def.sound, _muzzle);
    g.effects.muzzleFlash(_muzzle);
    let sound = true;
    for (const e of ev.e || []) {
      unpack(e, _p);
      if (e.length > 3) {
        _n.set(e[4] / 100, e[5] / 100, e[6] / 100).normalize();
        const surface = SURFACES[e[3]];
        g.effects.impact(_p, _n, surface);
        if (sound) g.audio.play('impact', { position: _p, surface, volume: 0.8 });
        sound = false;
      }
      if (ev.tr) g.effects.tracer(_muzzle, _p);
    }
  }

  // ---------- Verbindung, Nochmal, Verlassen ----------
  _tickConnection(dt) {
    if (this.left) return;
    if (this.net.lost || this.net.mode === 'getrennt') {
      this.lostT += dt;
      if (this.lostT > DUEL.forfeitAfter) this._opponentLeft();
    } else {
      this.lostT = 0;
    }
  }

  _opponentLeft() {
    if (this.left) return;
    this.left = true;
    if (this.phase !== 'over') this._finish(true);
    else this.onAgainChange?.();
  }

  requestAgain() {
    if (this.left) return;
    this.again[this.me] = true;
    this.net.send({ t: 'again' });
    this._checkAgain();
  }

  _checkAgain() {
    this.onAgainChange?.();
    if (this.isHost && this.again.host && this.again.guest && !this.left) {
      this.again.host = this.again.guest = false;
      this.net.send({ t: 'start', cfg: this.cfg });
      this.g.onRematch?.(this.cfg);
    }
  }

  /** Duell verlassen: Gegner Bescheid geben, dann die Verbindung schließen */
  leave() {
    const net = this.net;
    net.onMessage = null;
    net.send({ t: 'bye' });
    setTimeout(() => net.close(), 300);
  }

  _finish(forfeit = false) {
    this.phase = 'over';
    this.g.player.frozen = true;
    const s = this.stats;
    const my = this.wins[this.me];
    const their = this.wins[this.them];
    this.g.onMatchOver({
      duel: true, forfeit, won: forfeit || my > their, score: [my, their],
      opponent: this.names[this.them], rounds: this.rounds,
      kills: s.kills, deaths: s.deaths, damage: s.damage,
      accuracy: s.shots ? s.hits / s.shots : 0, headshots: s.kills ? s.heads / s.kills : 0,
      earned: s.earned, spent: s.spent, grenades: s.grenades,
    });
  }
}
