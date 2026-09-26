import * as THREE from 'three';
import { ARMS, BOMB, DUEL, ECONOMY, KILLERS, KNIFE_SKINS, QUICK_CHAT, SLOT_KEYS, SPECIAL, TEAM_KNIFE, WEAPONS, WEAPON_IDS } from '../config.js';
import { BOMB_SITES, MAPS, SPAWNS } from '../world/map.js';
import { PROTOCOL } from '../net/net.js';
import { session } from '../net/session.js';
import { Match } from './match.js';
import { cleanLooks, count } from './cosmetics.js';
import { FLAG } from './remote.js';

const other = (role) => (role === 'host' ? 'guest' : 'host');
const pack = (v) => [Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)];
const unpack = (a, out = new THREE.Vector3()) => out.set(a[0] / 100, a[1] / 100, a[2] / 100);
// Oberflächen als Zahl (0 = kein Einschlag, z. B. Treffer am Spieler)
const SURFACES = ['', 'stone', 'sand', 'metal', 'wood'];

const _muzzle = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Bombenmodus: in ungeraden Runden greift der Host an, in geraden der Gast */
export const attackerOf = (round) => (round % 2 === 1 ? 'host' : 'guest');

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
// Zwei Modi: "kampf" (wer alle Leben des anderen nimmt, gewinnt die Runde) und "bombe"
// (einer greift an und legt die Bombe, der andere verteidigt; die Rollen wechseln jede Runde).
export class Duel extends Match {
  constructor(game, net, opts) {
    super(game);
    this.duel = true;
    this.net = net;
    this.me = opts.role;
    this.them = other(opts.role);
    this.isHost = opts.role === 'host';
    this.side = this.isHost ? 'west' : 'east';
    this.cfg = {
      lives: opts.lives, wins: opts.wins, mode: opts.mode === 'bombe' ? 'bombe' : 'kampf',
      map: MAPS[opts.map] ? opts.map : 'hof', arms: ARMS[opts.arms] ? opts.arms : 'alle',
    };
    this.bombMode = this.cfg.mode === 'bombe';
    this.names = { [this.me]: opts.myName, [this.them]: opts.theirName };
    this.queue = [];
    this.urgent = false;
    this.sendT = 0;
    this.sinceSend = 0;
    this.phT = 0;
    this.hitId = 0;
    this.hitPoints = new Map();
    this.onAgainChange = null;
    this.saveT = 0;
    // Nachrichten vom Partner; ein "Hallo" von einer neuen Kennung ist ein Wiedereinstieg
    net.onMessage = (msg, from) => {
      if (from === net.partner) this._onMessage(msg);
      else if (msg.t === 'hi') this._onRejoin(msg, from);
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
    this.waiting = false;
    this.awayMsg = false;
    this.lastPhase = null;
    this.again = { host: false, guest: false };
    this.loadoutArmor = { armor: 0, helmet: false };
    this.stats.planted = 0;
    this.stats.defused = 0;
    // Bombe: null oder { pos, yaw, t (Sekunden bis zur Explosion), done, defused }
    this.bomb = null;
    this.plantT = 0;
    this.defuseT = 0;
    this.keyT = 0;
    this.remoteKeyT = 0;
  }

  /** gegen einen Menschen übers Netz (sonst gegen die KI im eigenen Browser) */
  get online() {
    return !this.net.bot;
  }

  get roundTime() {
    if (this.bombMode) return BOMB.roundTimeBase + BOMB.roundTimePerLife * this.cfg.lives;
    return DUEL.roundTimeBase + DUEL.roundTimePerLife * this.cfg.lives;
  }

  // ---------- Bombenmodus: Rollen und Bombenplatz dieser Runde ----------
  get attacker() {
    return this.bombMode ? attackerOf(this.round) : null;
  }

  get defender() {
    return this.bombMode ? other(attackerOf(this.round)) : null;
  }

  get attacking() {
    return this.bombMode && this.attacker === this.me;
  }

  /** Seite des Bombenplatzes, um den es geht (der des Verteidigers) */
  get siteSide() {
    return this.defender === 'host' ? 'west' : 'east';
  }

  get site() {
    return BOMB_SITES[this.siteSide];
  }

  /** Legen oder Entschärfen läuft gerade (Spieler steht still, Waffe unten) */
  get busy() {
    return this.plantT > 0 || this.defuseT > 0;
  }

  inSite(pos) {
    const s = this.site;
    return Math.hypot(pos.x - s.x, pos.z - s.z) <= BOMB.siteRadius && Math.abs(pos.y - s.y) < 1.2;
  }

  nearBomb(pos) {
    const b = this.bomb;
    return !!b && Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) <= BOMB.defuseRange && Math.abs(pos.y - b.pos.y) < 1.4;
  }

  /** Was die Taste E gerade tun würde: 'plant', 'defuse' oder null (für Hinweis und Touch-Knopf) */
  get useAction() {
    const p = this.g.player;
    if (!this.bombMode || this.phase !== 'live' || this.waiting || !p.alive) return null;
    if (this.attacking && !this.bomb && p.onGround && this.inSite(p.feet)) return 'plant';
    if (!this.attacking && this.bomb && !this.bomb.done && this.nearBomb(p.feet)) return 'defuse';
    return null;
  }

  get fireBlocked() {
    return this.phase === 'freeze' || this.phase === 'over' || this.phase === 'idle' || this.waiting;
  }

  // Schaden gibt es nur in der laufenden Runde, nicht direkt nach dem Wiedereinstieg
  // und nicht, solange auf den Gegner gewartet wird
  get immune() {
    return this.phase !== 'live' || this.protectT > 0 || this.waiting;
  }

  get roundLabel() {
    return `Runde ${this.round} · Sieg bei ${this.cfg.wins}`;
  }

  /** Waffen-Modus dieser Partie (Alle, Nur Pistolen, Scharfschützen) */
  get arms() {
    return ARMS[this.cfg.arms] || ARMS.alle;
  }

  blockReason(id) {
    const allow = this.arms.allow;
    if (allow && !allow.includes(id)) return `Nicht bei „${this.arms.name}“`;
    return super.blockReason(id);
  }

  name(role) {
    return role === this.me ? 'Du' : this.names[role];
  }

  // ---------- Haken, die das Team-Spiel (teams.js) anders beantwortet ----------
  /** eigenes Team: im 1 gegen 1 die eigene Rolle */
  get myTeam() {
    return this.me;
  }

  /** Team eines Spielers (im 1 gegen 1 ist die Rolle das Team) */
  teamOf(k) {
    return k;
  }

  /** Figur eines anderen Spielers (im 1 gegen 1 nur der Gegner) */
  remoteOf(k) {
    return k === this.them ? this.g.remote : null;
  }

  /** eigener Startpunkt */
  _spawnPoint() {
    return SPAWNS[this.side];
  }

  /** Leben und Siege aus einer Rundenmeldung übernehmen */
  _readScores(msg) {
    this.lives.host = msg.lv[0];
    this.lives.guest = msg.lv[1];
    this.wins.host = msg.w[0];
    this.wins.guest = msg.w[1];
  }

  /** Leben zu Beginn einer neuen Runde (für die Rundenmeldung) */
  _freshLives() {
    return [this.cfg.lives, this.cfg.lives];
  }

  _maxWins() {
    return Math.max(this.wins.host, this.wins.guest);
  }

  /** eigener Zustand, kurz bevor er gesendet wird */
  _outgoing() {}

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
    const msg = {
      t: 'ph', ph: this.phase, r: this.round, tm: Math.round(this.timer * 100) / 100,
      lv: [this.lives.host, this.lives.guest], w: [this.wins.host, this.wins.guest],
    };
    // gelegte Bombe: Ort, Restzeit und Drehung
    const b = this.bomb;
    if (b && !b.done) msg.bm = [...pack(b.pos), Math.round(b.t * 100) / 100, Math.round(b.yaw * 100)];
    return Object.assign(msg, patch);
  }

  _hostPhase(patch) {
    const msg = this._phaseMsg(patch);
    this._applyPhase(msg);
    this.net.send(msg);
    this.phT = 1;
  }

  /** aktueller Stand der Partie als Rundenmeldung (auch für den Wiedereinstieg) */
  _currentPhase() {
    return this._phaseMsg({ win: this.lastPhase?.win, why: this.lastPhase?.why });
  }

  _applyPhase(msg) {
    const newRound = msg.r !== this.round;
    const changed = newRound || msg.ph !== this.phase;
    this.lastPhase = msg;
    this.saveT = 0;
    this._readScores(msg);
    const lat = this.isHost ? 0 : Math.min(0.3, this.net.ping / 2000);
    this.timer = Math.max(0, msg.tm - lat);
    if (!changed || this.phase === 'over') {
      if (!newRound && msg.ph === 'live') this._syncBomb(msg.bm, lat);
      return;
    }
    if (newRound) this._beginRound(msg.r);
    if (msg.ph === 'live') {
      this._goLive();
      this._syncBomb(msg.bm, lat);
    } else if (msg.ph === 'end') this._roundOver(msg);
    else if (msg.ph === 'over') this._finish();
  }

  /** Bombe aus der Rundenmeldung des Hosts übernehmen (neu gelegt oder Restzeit angleichen) */
  _syncBomb(bm, lat = 0) {
    if (!bm || !this.bombMode) return;
    const t = Math.max(0, bm[3] - lat);
    if (!this.bomb) this._setBomb(unpack(bm), t, bm[4] / 100);
    else if (!this.bomb.done) this.bomb.t = t;
  }

  _beginRound(r) {
    const g = this.g;
    this.round = r;
    this.phase = 'freeze';
    this.purchases = [];
    this.roundStats = { kills: 0, heads: 0, shots: 0, hits: 0, deaths: 0, reward: 0 };
    g.killcam.stop();
    g.grenades.clear();
    const sp = this._spawnPoint();
    g.player.spawn(sp.pos, sp.yaw);
    g.player.health = 100;
    g.player.frozen = true;
    g.viewmodel.root.visible = true;
    // Scharfschützen: das Adler gibt es jede Runde geschenkt (wer es noch hat, behält es)
    const free = this.arms.free;
    if (free && !g.weapons.inv.has(free)) {
      g.weapons.inv.give(free);
      g.weapons.inv.current = g.weapons.inv.slotFor(free);
    }
    g.weapons.inv.refillAmmo();
    g.weapons.resetForRound();
    g.airstrikes.clear();
    this.respawnT = 0;
    this.protectT = 0;
    this.loadoutArmor = { armor: g.player.armor, helmet: g.player.helmet };
    this.bomb = null;
    this.plantT = this.defuseT = 0;
    g.bombSites.remove();
    g.bombSites.show(this.bombMode ? this.siteSide : null);
    if (this.bombMode) {
      g.hud.message(
        this.attacking ? `Runde ${r} · Du greifst an` : `Runde ${r} · Du verteidigst`,
        `${this.attacking ? 'Leg die Bombe auf dem Platz des Gegners' : 'Halte deinen Bombenplatz'} · Kaufzeit: ${g.hint('buy')}`,
        3.5,
      );
    } else {
      g.hud.message(`Runde ${r}`, `Kaufzeit – ${g.hint('buy')}`, 3);
    }
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
    if (this.bombMode) {
      g.hud.message('Los!', this.attacking
        ? `Leg die Bombe auf dem roten Platz (${g.hint('use')})${lives}`
        : `${this.names[this.them]} greift an · verteidige deinen Platz${lives}`, 2.2);
    } else {
      g.hud.message('Los!', `${this.names[this.them]} kommt von der anderen Seite${lives}`, 1.8);
    }
  }

  // ---------- Bombe legen, entschärfen, explodieren ----------
  _setBomb(pos, t, yaw = 0) {
    const g = this.g;
    this.bomb = { pos: pos.clone(), yaw, t, done: false, defused: false };
    g.bombSites.place(this.bomb.pos, yaw);
    g.audio.play('bombPlanted');
    const mine = this.attacking;
    g.hud.message(mine ? 'Bombe gelegt!' : 'Die Bombe wurde gelegt!',
      mine ? `Verteidige sie ${BOMB.timer} Sekunden lang` : `Entschärfe sie: hingehen und ${g.hint('use')} (${BOMB.defuseTime} s)`, 2.5);
  }

  /** pro Simulationsschritt: Restzeit der Bombe, eigenes Legen und Entschärfen */
  _tickBomb(dt) {
    const g = this.g;
    const b = this.bomb;
    if (b && !b.done) {
      b.t = Math.max(0, b.t - dt);
      if (this.isHost && b.t <= 0 && this.phase === 'live') {
        b.done = true;
        this._hostEndRound(this.attacker, 'bomb');
        return;
      }
    }
    if (b) g.bombSites.update(dt, b.t, g.audio, b.defused);
    const action = g.input.isDown('use') ? this.useAction : null;
    // Legen: stillstehen und die Taste halten, zwischendurch Tastentöne
    if (action === 'plant') {
      this.plantT += dt;
      this._keySound(dt, 'plantKey', 0.32);
      if (this.plantT >= BOMB.plantTime) this._plant();
    } else {
      this.plantT = 0;
    }
    if (action === 'defuse') {
      this.defuseT += dt;
      this._keySound(dt, 'defuseTick', 0.45);
      if (this.defuseT >= BOMB.defuseTime) this._defuse();
    } else {
      this.defuseT = 0;
    }
  }

  _keySound(dt, name, every) {
    this.keyT -= dt;
    if (this.keyT > 0) return;
    this.keyT = every;
    this.g.audio.play(name, { position: this.g.player.feet });
  }

  _plant() {
    const p = this.g.player;
    this.plantT = 0;
    this.stats.planted++;
    count('plant');
    this.addMoney(BOMB.plantReward);
    const pos = p.feet.clone();
    if (this.isHost) {
      this._hostPlant(pos, p.yaw);
    } else {
      // sofort zeigen, der Host bestätigt mit seiner nächsten Rundenmeldung
      this._setBomb(pos, BOMB.timer, p.yaw);
      this._queue({ t: 'plant', p: pack(pos), y: Math.round(p.yaw * 100) }, true);
    }
  }

  _hostPlant(pos, yaw) {
    if (this.phase !== 'live' || this.bomb) return;
    this._setBomb(pos, BOMB.timer, yaw);
    this._hostPhase({});
  }

  _defuse() {
    this.defuseT = 0;
    if (this.isHost) this._hostDefuse(this.me);
    else this._queue({ t: 'defused' }, true);
  }

  _hostDefuse(by) {
    const b = this.bomb;
    if (this.phase !== 'live' || !b || b.done || b.t <= 0) return;
    b.done = true;
    this._hostEndRound(by, 'defuse');
  }

  // Explosion am Rundenende: große Wolke, wer zu nah steht, stirbt (und verliert damit seine Waffen)
  _explodeBomb() {
    const g = this.g;
    const b = this.bomb;
    if (!b) return;
    b.done = true;
    g.bombSites.remove();
    const pos = b.pos;
    g.effects.explosion(_p.copy(pos).setY(pos.y + 0.4), pos.y, 3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      g.effects.explosion(_p.set(pos.x + Math.cos(a) * 2.5, pos.y + 1 + Math.random() * 2, pos.z + Math.sin(a) * 2.5), null, 1.6);
    }
    g.audio.play('bombExplode', { position: pos });
    // KI-Gegner (läuft im selben Browser): Schaden ohne Deckung, wie beim Menschen
    g.onBlast?.(pos, BOMB.blastRadius, BOMB.blastDamage, 0.85, 2, this.attacker, 'bombe', false);
    const p = g.player;
    _p.copy(p.feet).y += 1;
    const d = _p.distanceTo(pos);
    g.shake(Math.min(1.4, Math.max(0, 1.4 - d / 30)));
    if (!p.alive || d >= BOMB.blastRadius) return;
    const dealt = p.applyDamage(BOMB.blastDamage * Math.pow(1 - d / BOMB.blastRadius, 2), { armorPen: 0.85 });
    if (dealt > 0) {
      g.hud.hurt(dealt);
      g.hud.hitFrom(pos);
    }
    if (!p.alive) {
      g.viewmodel.root.visible = false;
      this.stats.deaths++;
      this._queue({ t: 'dead', by: this.attacker, w: 'bombe', h: 0 }, true);
      this._feed(this.attacker, this.me, 'bombe', false);
    }
  }

  /** eigener Angriff (Schuss, Messer, Wurf) beendet den Spawn-Schutz sofort */
  onAttack() {
    this.protectT = 0;
  }

  _roundOver(msg) {
    const g = this.g;
    this.phase = 'end';
    this.plantT = this.defuseT = 0;
    const draw = msg.win === 'draw';
    const won = msg.win === this.myTeam;
    if (msg.why === 'bomb') this._explodeBomb();
    else if (msg.why === 'defuse' && this.bomb) {
      this.bomb.done = true;
      this.bomb.defused = true;
      g.audio.play('bombDefused', { position: this.bomb.pos });
      // im Team-Spiel bekommt nur, wer entschärft hat, Geld und Aufgabe
      if (won && (msg.by === undefined || msg.by === this.me)) {
        this.stats.defused++;
        this.addMoney(BOMB.defuseReward);
        count('defuse');
      }
    }
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
      case 'bomb': return won ? 'Deine Bombe ist explodiert' : 'Die Bombe ist explodiert';
      case 'defuse': return won ? 'Du hast die Bombe entschärft' : `${them} hat die Bombe entschärft`;
      case 'time-bomb': return won ? `Zeit abgelaufen · ${them} hat die Bombe nicht gelegt` : 'Zeit abgelaufen · keine Bombe gelegt';
      default: return 'Zeit abgelaufen · Gleichstand';
    }
  }

  tick(dt) {
    const g = this.g;
    this._tickConnection(dt);
    // eigenen Stand regelmäßig im Tab merken (für den Wiedereinstieg nach dem Neuladen)
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this._save();
      this.saveT = 0.5;
    }
    // ist der Gegner weg, steht die Partie still (auch die Zeit)
    if (this.phase === 'over' || this.phase === 'idle' || this.waiting) return;
    this.protectT = Math.max(0, this.protectT - dt);
    if (this.isHost) {
      this.phT -= dt;
      if (this.phT <= 0 && this.lastPhase) {
        // regelmäßig wiederholen, falls eine Nachricht verloren ging (mit Sieger der Runde)
        this.net.send(this._currentPhase());
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
      if (this.bombMode) this._tickBomb(dt);
      // liegt die Bombe, zählt nur noch ihre Zeit
      if (this.isHost && this.phase === 'live' && !this.bomb && this.timer <= 0) this._hostTimeUp();
    } else if (this.phase === 'end') {
      if (this.bomb) this.g.bombSites.update(dt, this.bomb.t, this.g.audio, this.bomb.defused);
      this.timer = Math.max(0, this.timer - dt);
      if (this.isHost && this.timer <= 0) {
        if (this._maxWins() >= this.cfg.wins) this._hostPhase({ ph: 'over', tm: 0 });
        else this._hostPhase({ ph: 'freeze', r: this.round + 1, tm: DUEL.freezeTime, lv: this._freshLives() });
      }
    }
  }

  _hostTimeUp() {
    const g = this.g;
    const lv = this.lives;
    // Bombenmodus: Zeit um und keine Bombe gelegt, dann gewinnt, wer verteidigt
    if (this.bombMode) {
      this._hostEndRound(this.defender, 'time-bomb');
      return;
    }
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
    // liegt die Bombe schon, tickt sie weiter, auch wenn der Angreifer keine Leben mehr hat:
    // dann muss der Verteidiger sie noch entschärfen
    const bombTicks = this.bombMode && victim === this.attacker && this.bomb && !this.bomb.done;
    if (lv[victim] === 0 && !bombTicks) this._hostEndRound(other(victim), 'elim', lv);
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
    let sub = this.phase === 'live' && left > 0
      ? `Noch ${left} Leben · in ${DUEL.respawnTime} s geht es weiter` : '';
    if (!sub && this.attacking && this.bomb && !this.bomb.done) sub = `Die Bombe tickt weiter – schafft ${this.names[this.them]} es noch?`;
    const title = by === this.me ? 'Selbst erwischt' : `${this.names[by]} hat dich erwischt`;
    // kurz, danach zeigt die Kill-Cam, wie es passiert ist
    g.hud.message(title, sub, 1.6);
    g.killcam.start(by, w);
    if (this.isHost) this._hostDeath(this.me);
  }

  _tickRespawn(dt) {
    const g = this.g;
    if (g.player.alive || this.respawnT <= 0) return;
    this.respawnT -= dt;
    if (this.respawnT > 0 || this.lives[this.me] <= 0) return;
    g.killcam.stop();
    const sp = this._spawnPoint();
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
    const def = WEAPONS[w] || KILLERS[w];
    // Messer: Karambit (Rot) oder Butterfly (Blau), je nach Team des Schützen
    const knife = def?.slot === 'knife' ? TEAM_KNIFE[this.teamOf(killer)] : null;
    this.g.hud.killfeed({
      weapon: knife || w, label: knife ? KNIFE_SKINS[knife].name : def?.name ?? '?', head,
      killer: this.name(killer), victim: this.name(victim), mine: killer === this.me || victim === this.me,
      killerTeam: this.teamOf(killer), victimTeam: this.teamOf(victim),
    });
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
    if (def.id !== 'luftschlag') this.addCharge(SPECIAL.killBonus);
    // Aufgaben: Abschüsse und Kopfschüsse je Waffe
    count(`kill:${def.id}`);
    if (head) count(`head:${def.id}`);
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
  /** Treffer melden (target: getroffene Figur, im 1 gegen 1 immer der Gegner) */
  sendHit(damage, zone, def, point, target = null) {
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

  /** Schnellnachricht Nummer i an den Gegner (höchstens eine pro Sekunde) */
  sendChat(i) {
    const now = performance.now();
    if (!QUICK_CHAT[i] || now - (this.lastChat || 0) < 1000) return;
    this.lastChat = now;
    this.net.send({ t: 'chat', i });
    this.g.hud.chatLine(this.name(this.me), QUICK_CHAT[i], true);
    this.g.audio.play('chat');
  }

  nadeFx(id, type, pos, vel) {
    this._queue({ t: 'n', id, k: type, p: pack(pos), v: pack(vel) }, true);
  }

  boomFx(id, type, pos) {
    this._queue({ t: 'b', id, k: type, p: pack(pos) }, true);
  }

  airFx(point, seed, yaw) {
    this._queue({ t: 'air', p: pack(point), s: seed, y: Math.round(yaw * 1000) }, true);
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
    if (p.sprinting) f |= FLAG.SPRINT;
    if (this.protectT > 0 && this.phase === 'live') f |= FLAG.PROTECT;
    if (this.busy) f |= FLAG.BUSY;
    const msg = {
      t: 's', k: Math.round(performance.now()), p: pack(p.feet),
      y: Math.round(p.yaw * 1000), a: Math.round(p.pitch * 1000), d: Math.round(p.duckAmount * 100),
      w: ws.active ? WEAPON_IDS.indexOf(ws.active.id) : -1, f, hp: Math.ceil(p.health),
    };
    // für die Kill-Cam: so hat einen der Gegner gesehen
    g.killcam.noteSelf(msg);
    if (this.queue.length) {
      msg.ev = this.queue;
      this.queue = [];
    }
    this.urgent = false;
    this.sinceSend = 0;
    this._outgoing(msg);
    this.net.send(msg);
  }

  _onMessage(msg) {
    const g = this.g;
    switch (msg.t) {
      case 's':
        // Zustände kommen weiter: doch nicht weg (z. B. Seite wurde nicht wirklich verlassen)
        this.awayMsg = false;
        g.remote.push(msg);
        if (msg.ev) {
          for (const ev of msg.ev) {
            g.killcam.noteEvent(msg.k, ev, this.them);
            this._onEvent(ev);
          }
        }
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
      case 'away':
        // Gegner lädt neu oder schließt den Tab: sofort pausieren und auf ihn warten
        this.awayMsg = true;
        break;
      case 'hi':
        // der zurückgekehrte Gegner fragt nochmal nach dem Stand
        if (!msg.ack) this._sendResume(this.net.partner);
        break;
      case 'chat':
        if (QUICK_CHAT[msg.i]) {
          g.hud.chatLine(this.names[this.them], QUICK_CHAT[msg.i], false);
          g.audio.play('chat');
        }
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
        // die Bombe zählt für niemanden als Abschuss
        if (ev.by === this.me && ev.w !== 'bombe') {
          this.onKill(WEAPONS[ev.w] || KILLERS[ev.w] || WEAPONS.natter, !!ev.h);
          g.audio.play('kill');
          g.hud.hitmarker(!!ev.h, true);
        }
        this._feed(ev.by, this.them, ev.w, !!ev.h);
        if (this.isHost) this._hostDeath(this.them);
        break;
      }
      // Bombenmodus: der Gast meldet Legen und Entschärfen, der Host prüft und entscheidet
      case 'plant':
        if (this.isHost && this.bombMode && this.attacker === this.them && g.remote.alive) this._hostPlant(unpack(ev.p), (ev.y || 0) / 100);
        break;
      case 'defused':
        if (this.isHost && this.bombMode && this.defender === this.them) this._hostDefuse(this.them);
        break;
      // Luftschlag des Gegners: gleicher Ablauf wie beim eigenen, Schaden rechnet jeder für sich
      case 'air':
        g.airstrikes.start(unpack(ev.p), ev.s, (ev.y || 0) / 1000, this.them);
        break;
      case 'f': this._onFire(ev); break;
      case 'k':
        g.remote.jabMove();
        g.killcam.liveEvent(ev, g.remote);
        g.audio.play('swing', { position: g.remote.position });
        break;
      case 'n': {
        const pos = unpack(ev.p);
        g.grenades.throw(ev.k, pos, unpack(ev.v), { ghost: true, id: ev.id, owner: this.them });
        g.remote.jabMove();
        g.killcam.liveEvent(ev, g.remote);
        g.audio.play('throw', { position: pos });
        break;
      }
      case 'b': g.grenades.remoteBoom(ev.id, ev.k, unpack(ev.p), this.them); break;
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
    // erst die Rückmeldung sagt, wie viel Schaden ankam: damit lädt die Spezialleiste
    this.addCharge(ev.n);
    if (point && ev.n > 0) this.g.hud.damageNumber(point, ev.n, ev.z === 'head');
  }

  /** Schuss eines anderen (r: seine Figur, im 1 gegen 1 der Gegner) */
  _onFire(ev, r = this.g.remote) {
    const g = this.g;
    const def = WEAPONS[ev.w];
    if (!def) return;
    r.fire(def);
    // in der Gegner-Sicht kommt die Leuchtspur aus der Waffe in der Hand
    g.killcam.liveEvent(ev, r);
    if (g.killcam.watching(r)) g.viewmodel.muzzleWorld(_muzzle, g.camera.position, g.camera);
    else r.muzzlePosition(_muzzle);
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

  // ---------- Verbindung, Wiedereinstieg, Nochmal, Verlassen ----------
  _tickConnection(dt) {
    if (this.left) return;
    const gone = this.awayMsg || this.net.lost || this.net.mode === 'getrennt';
    if (!gone) {
      this.lostT = 0;
      if (this.waiting) this._stopWaiting();
      return;
    }
    this.lostT += dt;
    if (!this.waiting && this.phase !== 'over' && (this.awayMsg || this.lostT > 1)) this._startWaiting();
    if (this.waiting) {
      const left = Math.max(0, Math.ceil(DUEL.forfeitAfter - this.lostT));
      if (left !== this.waitShown) {
        this.waitShown = left;
        this.g.hud.message(`Warte auf ${this.names[this.them]} …`, `Verbindung weg · in ${left} s gewinnst du kampflos`, 1.5);
      }
    }
    if (this.lostT > DUEL.forfeitAfter) this._opponentLeft();
  }

  // Partie anhalten: beide stehen still, die Zeit läuft nicht, niemand kann getroffen werden
  _startWaiting() {
    this.waiting = true;
    this.waitShown = null;
    this.g.remote.hidden = true;
    this.g.player.frozen = true;
    this.g.buyMenu.hide();
  }

  _stopWaiting() {
    this.waiting = false;
    this.g.remote.hidden = false;
    this.g.player.frozen = this.phase !== 'live';
    this.g.hud.message(`${this.names[this.them]} ist zurück`, 'Weiter geht’s', 2);
  }

  // Gegner meldet sich mit neuer Kennung zurück (Seite neu geladen): nur annehmen, solange
  // der alte Partner weg ist, dann bekommt er den Stand der Partie
  _onRejoin(msg, from) {
    if (msg.v !== PROTOCOL || msg.role !== this.them || this.left) return;
    const gone = this.waiting || this.awayMsg || this.net.lost || this.net.mode === 'getrennt';
    if (!gone) return;
    this.net.setPartner(from);
    this.awayMsg = false;
    if (msg.name) this.names[this.them] = String(msg.name).replace(/[<>]/g, '').slice(0, 16);
    if (msg.looks) this.g.remote.setLooks(cleanLooks(msg.looks));
    this.g.remote.resetStream();
    this._sendResume(from);
  }

  _sendResume(to) {
    this.net.send({
      t: 'hi', v: PROTOCOL, ack: true, role: this.me, name: this.names[this.me], looks: this.g.looks, cfg: this.cfg,
      resume: this._currentPhase(),
    }, to);
  }

  /**
   * Nach dem Neuladen zurück ins laufende Duell. sync: Stand der Partie (Runde, Phase, Zeit,
   * Leben, Siege), saved: eigener Stand aus dem Tab-Speicher (Geld, Waffen, Lebenspunkte …).
   * Man steht dann wieder am eigenen Startpunkt, mit kurzem Spawn-Schutz.
   */
  resume(sync, saved) {
    this.reset();
    const g = this.g;
    const p = g.player;
    const inv = g.weapons.inv;
    inv.reset();
    p.armor = 0;
    p.helmet = false;
    if (saved) {
      this.money = saved.money ?? this.money;
      this.lossStreak = saved.lossStreak ?? 0;
      this.special = Math.min(SPECIAL.charge, saved.special || 0);
      Object.assign(this.stats, saved.stats || {});
      this.rounds = saved.rounds || [];
      this.loadoutArmor = saved.loadoutArmor || this.loadoutArmor;
      for (const k of SLOT_KEYS) inv.slots[k] = null;
      for (const [slot, id, mag, reserve] of saved.inv || []) {
        if (!WEAPONS[id] || !SLOT_KEYS.includes(slot)) continue;
        const w = inv._make(id);
        w.mag = mag;
        w.reserve = reserve;
        inv.slots[slot] = w;
      }
      if (!inv.slots.knife) inv.slots.knife = inv._make('messer');
      inv.current = inv.slots[saved.current] ? saved.current : inv.bestSlot();
      p.armor = saved.armor || 0;
      p.helmet = !!saved.helmet;
    }
    this.round = sync.r;
    this.phase = sync.ph;
    this.timer = sync.tm;
    this._readScores(sync);
    this.lastPhase = sync;
    g.airstrikes.clear();
    g.bombSites.remove();
    g.bombSites.show(this.bombMode ? this.siteSide : null);
    if (sync.ph === 'live') this._syncBomb(sync.bm);
    this.purchases = [];
    this.roundStats = { kills: 0, heads: 0, shots: 0, hits: 0, deaths: 0, reward: 0 };
    g.grenades.clear();
    const sp = this._spawnPoint();
    p.spawn(sp.pos, sp.yaw);
    p.health = saved?.alive && saved.health > 0 ? saved.health : 100;
    g.viewmodel.root.visible = true;
    g.weapons.resetForRound();
    g.hud.onWeaponChange();
    g.hud.onMoney(0);
    if (sync.ph === 'over') {
      this._finish();
      return;
    }
    p.frozen = sync.ph !== 'live';
    if (sync.ph === 'live') {
      this.buyTimer = 0;
      this.protectT = DUEL.spawnProtect;
      if (saved && saved.alive === false) {
        // war beim Neuladen tot: wie sonst nach 3 s zurück, wenn noch Leben übrig sind
        p.alive = false;
        p.health = 0;
        g.viewmodel.root.visible = false;
        this.respawnT = DUEL.respawnTime;
      }
    }
    if (this.isHost) this.phT = 0;
    g.hud.message('Zurück im Duell', `Runde ${this.round} · ${this.names[this.them]} hat gewartet`, 2.5);
    this._save();
  }

  // eigener Stand für den Wiedereinstieg (im Tab, übersteht das Neuladen)
  _save() {
    if (!this.online) return;
    const g = this.g;
    const p = g.player;
    const inv = g.weapons.inv;
    session.setDuel({
      code: this.net.code, role: this.me, cfg: this.cfg,
      money: this.money, lossStreak: this.lossStreak, stats: this.stats, rounds: this.rounds, special: this.special,
      loadoutArmor: this.loadoutArmor, armor: p.armor, helmet: p.helmet, health: p.health, alive: p.alive,
      inv: SLOT_KEYS.filter((k) => inv.slots[k]).map((k) => [k, inv.slots[k].id, inv.slots[k].mag, inv.slots[k].reserve]),
      current: inv.current,
      phase: this._currentPhase(),
    });
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
    this.left = true;
    session.clear();
  }

  _finish(forfeit = false) {
    this.phase = 'over';
    this.g.killcam.stop();
    this.g.player.frozen = true;
    const s = this.stats;
    const my = this.wins[this.me];
    const their = this.wins[this.them];
    // Aufgaben: Siege (ein kampfloser Sieg zählt nicht)
    if (!forfeit && my > their) {
      count('wins');
      count(`win:${this.cfg.arms}`);
      if (this.net.bot && this.net.level === 'schwer') count('win:schwer');
      if (this.online) count('win:online');
    }
    this.g.onMatchOver({
      duel: true, forfeit, won: forfeit || my > their, score: [my, their],
      opponent: this.names[this.them], rounds: this.rounds,
      kills: s.kills, deaths: s.deaths, damage: s.damage,
      accuracy: s.shots ? s.hits / s.shots : 0, headshots: s.kills ? s.heads / s.kills : 0,
      earned: s.earned, spent: s.spent, grenades: s.grenades,
      bomb: this.bombMode, planted: s.planted || 0, defused: s.defused || 0,
    });
  }
}
