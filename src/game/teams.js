import * as THREE from 'three';
import { DUEL, KILLERS, QUICK_CHAT, SLOT_KEYS, WEAPONS } from '../config.js';
import { SPAWNS } from '../world/map.js';
import { PROTOCOL } from '../net/net.js';
import { session } from '../net/session.js';
import { Duel } from './duel.js';
import { cleanLooks, count } from './cosmetics.js';
import { SIDE, TEAM_IDS, TEAM_NAMES, otherTeam, slotSpawn, teamAttacker } from './sides.js';
import { Squad } from '../ai/squad.js';

const unpack = (a, out = new THREE.Vector3()) => out.set(a[0] / 100, a[1] / 100, a[2] / 100);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
// so lange (s) darf ein Mitspieler ohne Verbindung sein, dann zählt er in der Runde als ausgeschieden
const AWAY_OUT = 20;
// Host: so lange die Startmeldung an alle wiederholen, von denen noch nichts kam
const START_REPEAT = 6;
// Host nach dem Neuladen: so lange den anderen die neue Kennung sagen
const HI_REPEAT = 15;

// Team-Spiel (ab drei Spielern oder mit KI): zwei Teams mit je bis zu vier Spielern. Läuft wie das
// 1 gegen 1 (gleiche Wirtschaft, Leben pro Runde, Bombenmodus), nur mit mehreren Spielern:
// - Der Host bestimmt den Ablauf (Runden, Leben jedes Spielers, Siege) und rechnet die KI-Spieler.
// - Jeder schickt seinen Zustand an alle (Kennung im Netz -> feste Spieler-Kennung aus der Lobby).
// - Treffer meldet der Schütze an den Getroffenen (to), Mitspieler treffen sich nicht.
// - Eine Runde gewinnt das Team, das alle Gegner ausschaltet (bzw. im Bombenmodus wie im 1 gegen 1).
// - Wer neu lädt, kommt mit seinem Stand zurück; lädt der Host neu, warten die anderen auf ihn.
export class TeamMatch extends Duel {
  constructor(game, net, opts) {
    const cfg = opts.cfg;
    super(game, net, {
      role: opts.isHost ? 'host' : 'guest', lives: cfg.lives, wins: cfg.wins, mode: cfg.mode, map: cfg.map,
      arms: cfg.arms, myName: opts.myName, theirName: '',
    });
    this.teamMode = true;
    this.cfg.level = cfg.level || 'mittel';
    this.me = opts.key;
    this.them = null;
    this.hostKey = opts.hostKey;
    this.hostPeer = opts.isHost ? net.id : opts.hostPeer;
    this.roster = new Map();
    this.peerKey = new Map();
    for (const e of opts.roster) {
      const entry = {
        key: e.key, name: cleanName(e.name) || 'Spieler', team: e.team === 'blau' ? 'blau' : 'rot', looks: e.looks || null,
        bot: !!e.bot, peer: e.bot ? null : e.peer || null, slot: e.slot || 0, left: !!e.left,
      };
      this.roster.set(e.key, entry);
      if (entry.peer && e.key !== this.me) this.peerKey.set(entry.peer, e.key);
    }
    const mine = this.roster.get(this.me);
    mine.peer = net.id;
    this.team = mine.team;
    this.side = SIDE[this.team];
    this.board = new Map();
    for (const k of this.roster.keys()) this.board.set(k, { kills: 0, deaths: 0 });
    this.seq = 0;
    this.lastSeq = new Map();
    this.awayT = new Map();
    this.awayKeys = new Set();
    this.goneT = { rot: 0, blau: 0 };
    this.sendBotsT = 0;
    // Host: Startmeldung wiederholen, bis von jedem etwas kam; nach dem Neuladen die neue Kennung sagen
    this.heard = new Set();
    this.startMsg = opts.startMsg || null;
    this.startT = this.isHost && this.startMsg ? START_REPEAT : 0;
    this.repT = 0;
    this.hiT = 0;
    net.partner = null;
    net.setGroup(this._peers());
    net.onMessage = (msg, from) => this._recvNet(msg, from);
    // die KI-Spieler rechnet nur der Host
    const bots = [...this.roster.values()].filter((e) => e.bot && !e.left);
    this.squad = this.isHost && bots.length ? new Squad(game, this, bots) : null;
  }

  reset() {
    super.reset();
    this.lives = {};
    this.wins = { rot: 0, blau: 0 };
    this.again = new Set();
    if (this.roster) for (const k of this.roster.keys()) this.board.set(k, { kills: 0, deaths: 0 });
  }

  /** KI-Spieler abbauen (Partie vorbei, Menü, neue Partie) */
  dispose() {
    this.squad?.dispose();
    this.squad = null;
  }

  // ---------- wer ist wer ----------
  get myTeam() {
    return this.team;
  }

  teamOf(k) {
    return this.roster.get(k)?.team ?? (TEAM_IDS.includes(k) ? k : null);
  }

  remoteOf(k) {
    return this.g.teamRemotes.get(k) || null;
  }

  name(k) {
    if (k === this.me) return 'Du';
    return this.roster.get(k)?.name ?? TEAM_NAMES[k] ?? '?';
  }

  /** Spieler im Team (ohne die, die gegangen sind) */
  members(team) {
    return [...this.roster.values()].filter((e) => e.team === team && !e.left);
  }

  /** lebt gerade (Figur bzw. eigener Spieler) */
  isAlive(k) {
    if (k === this.me) return this.g.player.alive;
    const r = this.remoteOf(k);
    return !!r && r.alive && !r.hidden;
  }

  _peers() {
    const out = [];
    for (const e of this.roster.values()) if (!e.bot && !e.left && e.key !== this.me && e.peer) out.push(e.peer);
    return out;
  }

  get _humans() {
    let n = 0;
    for (const e of this.roster.values()) if (!e.bot && !e.left) n++;
    return n;
  }

  /** über den Server kommen bei vielen Spielern weniger Zustände pro Sekunde (siehe netUpdate) */
  get slowServer() {
    return this._humans > 4;
  }

  // ---------- Bombenmodus: Rollen der Teams ----------
  get attacker() {
    return this.bombMode ? teamAttacker(this.round) : null;
  }

  get defender() {
    return this.bombMode ? otherTeam(teamAttacker(this.round)) : null;
  }

  get attacking() {
    return this.bombMode && this.attacker === this.team;
  }

  get siteSide() {
    return SIDE[this.defender];
  }

  // ---------- Stand der Partie ----------
  _spawnPoint() {
    return slotSpawn(SPAWNS[this.side], this.roster.get(this.me).slot);
  }

  _phaseMsg(patch) {
    const msg = {
      t: 'ph', ph: this.phase, r: this.round, tm: Math.round(this.timer * 100) / 100,
      lv: { ...this.lives }, w: [this.wins.rot, this.wins.blau],
    };
    const b = this.bomb;
    if (b && !b.done) {
      msg.bm = [Math.round(b.pos.x * 100), Math.round(b.pos.y * 100), Math.round(b.pos.z * 100), Math.round(b.t * 100) / 100, Math.round(b.yaw * 100)];
    }
    return Object.assign(msg, patch);
  }

  _readScores(msg) {
    if (msg.lv && typeof msg.lv === 'object' && !Array.isArray(msg.lv)) this.lives = { ...msg.lv };
    this.wins.rot = msg.w[0];
    this.wins.blau = msg.w[1];
  }

  _freshLives() {
    const lv = {};
    for (const e of this.roster.values()) lv[e.key] = e.left ? 0 : this.cfg.lives;
    return lv;
  }

  _maxWins() {
    return Math.max(this.wins.rot, this.wins.blau);
  }

  _hostPhase(patch) {
    super._hostPhase(patch);
    // die KI-Spieler im eigenen Browser bekommen die Rundenmeldung sofort
    this.squad?.receive(this.lastPhase, this.me);
  }

  start() {
    this.reset();
    const { player, weapons } = this.g;
    weapons.inv.reset();
    player.armor = 0;
    player.helmet = false;
    this.round = 0;
    this.lives = this._freshLives();
    this.timer = DUEL.firstFreezeTime;
    this._beginRound(1);
    if (this.isHost) this._hostPhase({ ph: 'freeze', r: 1, tm: DUEL.firstFreezeTime });
  }

  _beginRound(r) {
    super._beginRound(r);
    const g = this.g;
    if (this.bombMode) {
      g.hud.message(
        this.attacking ? `Runde ${r} · Ihr greift an` : `Runde ${r} · Ihr verteidigt`,
        `${this.attacking ? 'Legt die Bombe auf dem Platz der Gegner' : 'Haltet euren Bombenplatz'} · Kaufzeit: ${g.hint('buy')}`,
        3.5,
      );
    }
  }

  _goLive() {
    const g = this.g;
    this.phase = 'live';
    this.buyTimer = DUEL.buyWindow;
    g.player.frozen = !g.player.alive;
    this.protectT = DUEL.spawnProtect;
    g.audio.play('roundStart');
    const lives = this.cfg.lives > 1 ? ` · ${this.cfg.lives} Leben` : '';
    const n = this.members(otherTeam(this.team)).length;
    if (this.bombMode) {
      g.hud.message('Los!', this.attacking
        ? `Legt die Bombe auf dem roten Platz (${g.hint('use')})${lives}`
        : `${TEAM_NAMES[this.attacker]} greift an · verteidigt euren Platz${lives}`, 2.2);
    } else {
      g.hud.message('Los!', `${n === 1 ? 'Ein Gegner kommt' : `${n} Gegner kommen`} von der anderen Seite${lives}`, 1.8);
    }
  }

  get roundLabel() {
    return `Runde ${this.round} · Sieg bei ${this.cfg.wins}`;
  }

  // ---------- Host: Runde entscheiden ----------
  _hostEndRound(win, why, lv = this.lives, by = undefined) {
    const w = { ...this.wins };
    if (win !== 'draw') w[win]++;
    const patch = { ph: 'end', tm: DUEL.roundEndTime, w: [w.rot, w.blau], lv: { ...lv }, win, why };
    if (by) patch.by = by;
    this._hostPhase(patch);
  }

  _hostDefuse(by) {
    const b = this.bomb;
    if (this.phase !== 'live' || !b || b.done || b.t <= 0) return;
    b.done = true;
    this._hostEndRound(this.defender, 'defuse', this.lives, by);
  }

  _hostDeath(victim) {
    if (this.phase !== 'live') return;
    const lv = { ...this.lives };
    lv[victim] = Math.max(0, (lv[victim] ?? 0) - 1);
    this._hostCheck(lv);
  }

  /** Runde vorbei, wenn ein Team keine Leben mehr hat (außer die Bombe der Angreifer tickt noch) */
  _hostCheck(lv) {
    const out = (team) => [...this.roster.values()].every((e) => e.team !== team || (lv[e.key] ?? 0) <= 0);
    const bombTicks = this.bombMode && this.bomb && !this.bomb.done;
    for (const team of TEAM_IDS) {
      if (!out(team) || (bombTicks && team === this.attacker)) continue;
      this._hostEndRound(otherTeam(team), 'elim', lv);
      return;
    }
    this._hostPhase({ lv });
  }

  _hostTimeUp() {
    if (this.bombMode) {
      this._hostEndRound(this.defender, 'time-bomb');
      return;
    }
    const sum = { rot: 0, blau: 0 };
    const hp = { rot: 0, blau: 0 };
    for (const e of this.roster.values()) {
      sum[e.team] += this.lives[e.key] ?? 0;
      hp[e.team] += this._hpOf(e.key);
    }
    let win = 'draw', why = 'time-draw';
    if (sum.rot !== sum.blau) {
      win = sum.rot > sum.blau ? 'rot' : 'blau';
      why = 'time-lives';
    } else if (hp.rot !== hp.blau) {
      win = hp.rot > hp.blau ? 'rot' : 'blau';
      why = 'time-hp';
    }
    this._hostEndRound(win, why);
  }

  _hpOf(k) {
    if (k === this.me) return this.g.player.alive ? this.g.player.health : 0;
    const r = this.remoteOf(k);
    return r && r.alive && !r.hidden ? r.hp : 0;
  }

  _reason(msg) {
    const won = msg.win === this.team;
    const them = TEAM_NAMES[otherTeam(this.team)];
    switch (msg.why) {
      case 'elim': return won ? `${them} ist ausgeschaltet` : 'Dein Team ist ausgeschaltet';
      case 'time-lives': return `Zeit abgelaufen · ${won ? 'dein Team hat' : `${them} hat`} mehr Leben übrig`;
      case 'time-hp': return `Zeit abgelaufen · ${won ? 'dein Team hat' : `${them} hat`} mehr Lebenspunkte`;
      case 'bomb': return won ? 'Eure Bombe ist explodiert' : 'Die Bombe ist explodiert';
      case 'defuse': return msg.by === this.me ? 'Du hast die Bombe entschärft' : `${this.name(msg.by)} hat die Bombe entschärft`;
      case 'time-bomb': return won ? `Zeit abgelaufen · ${them} hat die Bombe nicht gelegt` : 'Zeit abgelaufen · keine Bombe gelegt';
      default: return 'Zeit abgelaufen · Gleichstand';
    }
  }

  // ---------- Tod, Abschüsse, Punkte ----------
  onLocalDeath({ by, w, head }) {
    const g = this.g;
    g.viewmodel.root.visible = false;
    this.stats.deaths++;
    if (this.roundStats) this.roundStats.deaths++;
    this.respawnT = DUEL.respawnTime;
    this._queue({ t: 'dead', by, w, h: head ? 1 : 0 }, true);
    this._score(this.me, by);
    this._feed(by, this.me, w, head);
    const left = (this.lives[this.me] ?? 1) - 1;
    let sub = '';
    if (this.phase === 'live' && left > 0) sub = `Noch ${left} Leben · in ${DUEL.respawnTime} s geht es weiter`;
    else if (this.phase === 'live' && this.members(this.team).some((e) => e.key !== this.me && this.isAlive(e.key))) sub = 'Jetzt ist dein Team dran';
    const title = by === this.me ? 'Selbst erwischt' : `${this.name(by)} hat dich erwischt`;
    g.hud.message(title, sub, 1.6);
    g.killcam.start(by, w);
    if (this.isHost) this._hostDeath(this.me);
  }

  // die Bombe explodiert: wer zu nah steht, stirbt (zählt in der Tabelle als Tod)
  _explodeBomb() {
    const alive = this.g.player.alive;
    super._explodeBomb();
    if (alive && !this.g.player.alive) this._score(this.me, this.attacker);
  }

  /** Tod eines anderen (Meldung aus seinem Zustand) */
  _onDead(victim, ev) {
    const g = this.g;
    this.remoteOf(victim)?.die();
    if (ev.by === this.me && victim !== this.me && ev.w !== 'bombe') {
      this.onKill(WEAPONS[ev.w] || KILLERS[ev.w] || WEAPONS.natter, !!ev.h);
      g.audio.play('kill');
      g.hud.hitmarker(!!ev.h, true);
    }
    this._score(victim, ev.by);
    this._feed(ev.by, victim, ev.w, !!ev.h);
    if (this.isHost) this._hostDeath(victim);
  }

  /** Abschüsse und Tode für die Tabelle (Tab) */
  _score(victim, by) {
    const v = this.board.get(victim);
    if (v) v.deaths++;
    const k = this.board.get(by);
    if (k && by !== victim && this.teamOf(by) !== this.teamOf(victim)) k.kills++;
  }

  /** Tabelle: alle Spieler mit Team, Abschüssen, Toden und ob sie gerade leben */
  boardRows() {
    const rows = [];
    for (const e of this.roster.values()) {
      const b = this.board.get(e.key) || { kills: 0, deaths: 0 };
      rows.push({
        key: e.key, name: e.name, me: e.key === this.me, team: e.team, bot: e.bot, left: e.left,
        kills: b.kills, deaths: b.deaths, alive: this.isAlive(e.key), host: e.key === this.hostKey,
        ping: e.bot || e.key === this.me || !e.peer ? null : Math.round(this.net.pingOf?.(e.peer) || 0),
      });
    }
    return rows.sort((a, b) => (a.team === b.team ? b.kills - a.kills || a.deaths - b.deaths : a.team === this.team ? -1 : 1));
  }

  // ---------- Meldungen an die anderen ----------
  sendHit(damage, zone, def, point, target) {
    if (!target?.key) return;
    const id = ++this.hitId;
    this.hitPoints.set(id, point.clone());
    if (this.hitPoints.size > 64) this.hitPoints.delete(this.hitPoints.keys().next().value);
    this._queue({ t: 'hit', to: target.key, id, d: Math.round(damage), z: zone, w: def.id, p: def.armorPen ?? 0.5 }, true);
  }

  sendChat(i) {
    const now = performance.now();
    if (!QUICK_CHAT[i] || now - (this.lastChat || 0) < 1000) return;
    this.lastChat = now;
    this.net.send({ t: 'chat', i });
    this.g.hud.chatLine(this.name(this.me), QUICK_CHAT[i], true);
    this.g.audio.play('chat');
    this.squad?.receive({ t: 'chat', i }, this.me);
  }

  /** Schnellnachricht eines KI-Spielers (beim Host) */
  botChat(key, i) {
    this.net.send({ t: 'chat', i, b: key });
    this._chatFrom(key, i);
  }

  _chatFrom(who, i) {
    if (!QUICK_CHAT[i]) return;
    this.g.hud.chatLine(this.name(who), QUICK_CHAT[i], false);
    this.g.audio.play('chat');
    this.squad?.receive({ t: 'chat', i }, who);
  }

  _outgoing(msg) {
    msg.q = ++this.seq;
    // die KI-Spieler im eigenen Browser hören und spüren den eigenen Zustand sofort
    this.squad?.receive(msg, this.me);
  }

  /** eigener Zustand (direkt 30-mal pro Sekunde, über den Server je nach Spielerzahl seltener), dazu die KI */
  netUpdate(dt) {
    this.sinceSend += dt;
    this.sendT -= dt;
    const server = this.net.mode === 'server';
    const n = this._humans;
    const rate = server ? (n > 6 ? 6 : n > 4 ? 8 : 12) : 30;
    const due = this.sendT <= 0 || (this.urgent && (!server || this.sinceSend >= 0.05));
    if (due) {
      this.sendT = 1 / rate;
      this._sendState();
    }
    if (!this.squad) return;
    this.sendBotsT -= dt;
    if (this.sendBotsT > 0) return;
    this.sendBotsT = 1 / rate;
    const l = this.squad.takeNet();
    if (l.length && this.net.group?.size) this.net.send({ t: 'sb', l });
  }

  // ---------- Nachrichten ----------
  _recvNet(msg, from) {
    if (msg.t === 'hi') {
      this._onHi(msg, from);
      return;
    }
    const key = this.peerKey.get(from);
    if (key) this._handle(msg, key);
  }

  _handle(msg, key) {
    const g = this.g;
    if (this.isHost) this.heard.add(key);
    switch (msg.t) {
      case 's':
        this._onState(msg, key);
        break;
      case 'sb':
        // Zustände der KI-Spieler, die beim Host laufen
        if (key !== this.hostKey) break;
        for (const s of msg.l || []) if (this.roster.get(s.b)?.bot) this._onState(s, s.b);
        break;
      case 'ph':
        if (!this.isHost && key === this.hostKey) this._applyPhase(msg);
        break;
      case 'ros':
        if (!this.isHost && key === this.hostKey) this._onRoster(msg);
        break;
      case 'again':
        if (this.isHost && !this.again.has(key)) {
          this.again.add(key);
          this.onAgainChange?.();
        }
        break;
      case 'start':
        if (!this.isHost && key === this.hostKey && this.phase === 'over') g.onTeamRematch?.(msg);
        break;
      case 'bye':
        this._onBye(key);
        break;
      case 'away':
        // lädt neu oder schließt den Tab
        this.awayKeys.add(key);
        break;
      case 'chat':
        this._chatFrom(msg.b && key === this.hostKey ? msg.b : key, msg.i);
        break;
      default:
        break;
    }
  }

  /** Zustand eines Spielers (auch der KI-Spieler, beim Host direkt aus dem eigenen Browser) */
  _onState(msg, key) {
    // doppelt angekommene Zustände nur einmal (Nummer q steigt)
    if (msg.q !== undefined) {
      const last = this.lastSeq.get(key);
      if (last !== undefined && msg.q <= last) return;
      this.lastSeq.set(key, msg.q);
    }
    this.awayKeys.delete(key);
    const g = this.g;
    this.remoteOf(key)?.push(msg);
    if (msg.ev) {
      for (const ev of msg.ev) {
        g.killcam.noteEvent(msg.k, ev, key);
        this._onEvent(ev, key);
      }
    }
    this.squad?.receive(msg, key);
  }

  _onEvent(ev, from) {
    const g = this.g;
    const r = this.remoteOf(from);
    switch (ev.t) {
      case 'hit':
        if (ev.to === this.me) this._onHit(ev, from);
        break;
      case 'ack':
        if (ev.to === this.me) this._onAck(ev);
        break;
      case 'dead':
        this._onDead(from, ev);
        break;
      // Bombenmodus: jeder Angreifer darf legen, jeder Verteidiger entschärfen (der Host prüft)
      case 'plant':
        if (this.isHost && this.bombMode && this.teamOf(from) === this.attacker && this.isAlive(from)) {
          this._hostPlant(unpack(ev.p), (ev.y || 0) / 100);
        }
        break;
      case 'defused':
        if (this.isHost && this.bombMode && this.teamOf(from) === this.defender) this._hostDefuse(from);
        break;
      case 'air':
        g.airstrikes.start(unpack(ev.p), ev.s, (ev.y || 0) / 1000, from);
        break;
      case 'f':
        if (r) this._onFire(ev, r);
        break;
      case 'k':
        if (!r) break;
        r.jabMove();
        g.killcam.liveEvent(ev, r);
        g.audio.play('swing', { position: r.position });
        break;
      case 'n': {
        const pos = unpack(ev.p);
        g.grenades.throw(ev.k, pos, unpack(ev.v), { ghost: true, id: ev.id, owner: from });
        r?.jabMove();
        g.killcam.liveEvent(ev, r);
        g.audio.play('throw', { position: pos });
        break;
      }
      case 'b':
        g.grenades.remoteBoom(ev.id, ev.k, unpack(ev.p), from);
        break;
      default:
        break;
    }
  }

  // Treffer: selbst abziehen und zurückmelden; Treffer von Mitspielern zählen nicht
  _onHit(ev, from) {
    const g = this.g;
    const p = g.player;
    let dealt = 0;
    const friendly = from !== this.me && this.teamOf(from) === this.team;
    if (p.alive && !this.immune && !friendly) {
      dealt = p.applyDamage(ev.d, { armorPen: ev.p, head: ev.z === 'head', legs: ev.z === 'legs' });
      if (dealt > 0) {
        g.hud.hurt(dealt);
        const r = this.remoteOf(from);
        if (r) g.hud.hitFrom(r.position);
        g.audio.play('hurt');
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
      }
    }
    this._queue({ t: 'ack', to: from, id: ev.id, n: dealt, z: ev.z, k: p.alive ? 0 : 1 }, true);
    if (dealt > 0 && !p.alive) this.onLocalDeath({ by: from, w: ev.w, head: ev.z === 'head' });
  }

  // ---------- Verbindung: Mitspieler weg, Host weg, Wiedereinstieg ----------
  _hostGone() {
    return this.awayKeys.has(this.hostKey) || this.net.lostPeer(this.hostPeer);
  }

  _tickConnection(dt) {
    if (this.left) return;
    const net = this.net;
    const hostGone = !this.isHost && this._hostGone();
    for (const e of this.roster.values()) {
      if (e.key === this.me) continue;
      const gone = e.left || (e.bot ? hostGone : this.awayKeys.has(e.key) || !e.peer || net.lostPeer(e.peer));
      const r = this.remoteOf(e.key);
      if (r && r.hidden !== gone) r.hidden = gone;
      const t = gone ? (this.awayT.get(e.key) || 0) + dt : 0;
      this.awayT.set(e.key, t);
      // Host: wer zu lange weg ist, zählt in dieser Runde als ausgeschieden
      if (this.isHost && !e.bot && gone && t > AWAY_OUT && this.phase === 'live' && (this.lives[e.key] ?? 0) > 0) {
        this._hostCheck({ ...this.lives, [e.key]: 0 });
      }
    }
    if (this.isHost) {
      this._tickForfeit(dt);
      return;
    }
    // ohne Host steht die Partie still (auch die Zeit), bis er zurück ist
    if (!hostGone) {
      this.lostT = 0;
      if (this.waiting) this._stopWaiting();
      return;
    }
    this.lostT += dt;
    if (!this.waiting && this.phase !== 'over' && (this.awayKeys.has(this.hostKey) || this.lostT > 1)) this._startWaiting();
    if (this.waiting) {
      const left = Math.max(0, Math.ceil(DUEL.forfeitAfter - this.lostT));
      if (left !== this.waitShown) {
        this.waitShown = left;
        this.g.hud.message(`Warte auf ${this.name(this.hostKey)} (Host) …`, `Verbindung weg · in ${left} s endet das Spiel`, 1.5);
      }
    }
    if (this.lostT > DUEL.forfeitAfter) this._hostLeft();
  }

  // Host: ist ein ganzes Team schon lange weg (niemand verbunden, keine KI), gewinnt das andere kampflos
  _tickForfeit(dt) {
    if (this.phase === 'over') return;
    for (const team of TEAM_IDS) {
      const here = [...this.roster.values()].some((e) => e.team === team && !e.left
        && (e.key === this.me || e.bot || (this.awayT.get(e.key) || 0) === 0));
      this.goneT[team] = here ? 0 : this.goneT[team] + dt;
      if (this.goneT[team] > DUEL.forfeitAfter) {
        this._hostPhase({ ph: 'over', tm: 0, ff: team });
        return;
      }
    }
  }

  _startWaiting() {
    this.waiting = true;
    this.waitShown = null;
    this.g.player.frozen = true;
    this.g.buyMenu.hide();
  }

  _stopWaiting() {
    this.waiting = false;
    this.g.player.frozen = this.phase !== 'live';
    this.g.hud.message(`${this.name(this.hostKey)} ist zurück`, 'Weiter geht’s', 2);
  }

  _hostLeft() {
    if (this.left) return;
    this.left = true;
    this.hostLeft = true;
    if (this.phase !== 'over') this._finish(true, 'host');
    else this.onAgainChange?.();
  }

  _onBye(key) {
    const e = this.roster.get(key);
    if (!e) return;
    if (key === this.hostKey) {
      this._hostLeft();
      return;
    }
    if (e.left) return;
    e.left = true;
    this.net.setGroup(this._peers());
    const r = this.remoteOf(key);
    if (r) r.hidden = true;
    this.g.hud.notice(`${e.name} hat das Spiel verlassen`);
    if (this.isHost) {
      if (this.phase === 'live' && (this.lives[key] ?? 0) > 0) this._hostCheck({ ...this.lives, [key]: 0 });
      this._sendRoster();
    }
    this.onAgainChange?.();
  }

  /** Kennung im Netz eines Spielers hat sich geändert (Neuladen) */
  _mapPeer(e, peer) {
    if (e.peer) this.peerKey.delete(e.peer);
    e.peer = peer;
    e.left = false;
    this.peerKey.set(peer, e.key);
    this.lastSeq.delete(e.key);
    this.awayKeys.delete(e.key);
    this.awayT.set(e.key, 0);
    const r = this.remoteOf(e.key);
    if (r) {
      r.peer = peer;
      r.resetStream();
    }
    // die KI-Spieler kommen über den Host: ihre Zustände fangen nach seinem Neuladen neu an
    if (e.key === this.hostKey) {
      this.hostPeer = peer;
      for (const x of this.roster.values()) {
        if (!x.bot) continue;
        this.lastSeq.delete(x.key);
        const rb = this.remoteOf(x.key);
        if (rb) {
          rb.peer = peer;
          rb.resetStream();
        }
      }
    }
    this.net.setGroup(this._peers());
  }

  _rosterList() {
    return [...this.roster.values()].map((e) => ({
      key: e.key, name: e.name, team: e.team, looks: e.looks, bot: e.bot, peer: e.peer, slot: e.slot, left: e.left,
    }));
  }

  _sendRoster(to = undefined) {
    const l = [...this.roster.values()].map((e) => [e.key, e.peer, e.left ? 1 : 0]);
    this.net.send({ t: 'ros', l }, to);
  }

  _onRoster(msg) {
    for (const [key, peer, left] of msg.l || []) {
      const e = this.roster.get(key);
      if (!e || key === this.me) continue;
      if (left && !e.left) this._onBye(key);
      else if (!left && peer && !e.bot && e.peer !== peer) this._mapPeer(e, peer);
    }
  }

  _resumeMsg() {
    return {
      t: 'resume', v: PROTOCOL, kind: 'team', cfg: this.cfg, roster: this._rosterList(), host: this.hostKey,
      phase: this._currentPhase(), board: [...this.board],
    };
  }

  // "Hallo" von einer neuen Kennung: ein Spieler nach dem Neuladen (beim Host) bzw. der Host
  // nach seinem Neuladen (bei den anderen)
  _onHi(msg, from) {
    if (msg.v !== PROTOCOL || !msg.key) return;
    const e = this.roster.get(msg.key);
    if (this.isHost) {
      if (!e || e.bot || msg.key === this.me) {
        // wer nicht mitspielt, kann nicht mitten in die Partie
        if (!e) this.net.send({ t: 'busy' }, from);
        return;
      }
      const back = e.peer !== from || e.left;
      if (back) this._mapPeer(e, from);
      if (msg.looks && typeof msg.looks === 'object') {
        e.looks = msg.looks;
        this.remoteOf(e.key)?.setLooks(cleanLooks(msg.looks));
      }
      this.net.send(this._resumeMsg(), from);
      this._sendRoster();
      if (back) this.g.hud.notice(`${e.name} ist zurück`);
      return;
    }
    if (e && msg.key === this.hostKey && msg.host && e.peer !== from) this._mapPeer(e, from);
  }

  tick(dt) {
    if (!this.waiting && this.phase !== 'over') this.squad?.tick(dt);
    super.tick(dt);
    if (!this.isHost) return;
    // Startmeldung wiederholen, bis von jedem ein Zustand kam (falls sie unterwegs verloren ging)
    this.repT -= dt;
    if (this.repT > 0) return;
    this.repT = 1;
    if (this.startT > 0) {
      this.startT -= 1;
      const missing = [];
      for (const e of this.roster.values()) if (!e.bot && !e.left && e.key !== this.me && e.peer && !this.heard.has(e.key)) missing.push(e.peer);
      if (missing.length) this.net.send(this.startMsg, missing);
    }
    if (this.hiT > 0) {
      this.hiT -= 1;
      this.net.send({ t: 'hi', v: PROTOCOL, key: this.me, host: true });
      this._sendRoster();
    }
  }

  // ---------- Wiedereinstieg und Speichern ----------
  resume(sync, saved) {
    super.resume(sync, saved);
    for (const [k, v] of saved?.board || sync.board || []) if (this.board.has(k)) this.board.set(k, v);
    // Host nach dem Neuladen: den anderen die neue Kennung sagen, die KI-Spieler steigen in die
    // laufende Runde ein
    if (this.isHost) {
      this.hiT = HI_REPEAT;
      this.squad?.receive(this._currentPhase(), this.me);
    }
    if (sync.ph !== 'over') this.g.hud.message('Zurück im Spiel', `Runde ${this.round}`, 2.5);
  }

  _save() {
    const g = this.g;
    const p = g.player;
    const inv = g.weapons.inv;
    const data = {
      code: this.net.code, key: this.me, cfg: this.cfg, host: this.isHost, hostKey: this.hostKey,
      money: this.money, lossStreak: this.lossStreak, stats: this.stats, rounds: this.rounds, special: this.special,
      loadoutArmor: this.loadoutArmor, armor: p.armor, helmet: p.helmet, health: p.health, alive: p.alive,
      inv: SLOT_KEYS.filter((k) => inv.slots[k]).map((k) => [k, inv.slots[k].id, inv.slots[k].mag, inv.slots[k].reserve]),
      current: inv.current,
      phase: this._currentPhase(),
      board: [...this.board],
    };
    // der Host merkt sich auch, wer mitspielt (nach seinem Neuladen geht es damit weiter)
    if (this.isHost) data.roster = this._rosterList();
    session.setTeam(data);
  }

  // ---------- Ende, Nochmal, Verlassen ----------
  /** Host: genug Spieler für eine neue Partie (in jedem Team noch jemand) */
  get canRematch() {
    return !this.left && TEAM_IDS.every((t) => this.members(t).length > 0);
  }

  requestAgain() {
    if (this.left) return;
    if (this.isHost) {
      this._rematch();
      return;
    }
    this.again.add(this.me);
    this.net.send({ t: 'again' }, this.hostPeer);
    this.onAgainChange?.();
  }

  _rematch() {
    if (!this.canRematch) return;
    const roster = this._rosterList().filter((e) => !e.left);
    const msg = { t: 'start', kind: 'team', v: PROTOCOL, cfg: this.cfg, roster, host: this.hostKey };
    this.net.send(msg);
    this.g.onTeamRematch?.(msg);
  }

  leave() {
    const net = this.net;
    net.onMessage = null;
    net.send({ t: 'bye' });
    setTimeout(() => net.close(), 300);
    this.left = true;
    session.clear();
    this.dispose();
  }

  /** forfeit: kampflos vorbei; reason: 'host' (Host ist weg) oder das Ergebnis ('won'/'lost') */
  _finish(forfeit = false, reason = null) {
    this.phase = 'over';
    this.g.killcam.stop();
    this.g.player.frozen = true;
    const ff = this.lastPhase?.ff;
    if (ff && !reason) {
      forfeit = true;
      reason = ff === this.team ? 'lost' : 'won';
    }
    const s = this.stats;
    const my = this.wins[this.team];
    const their = this.wins[otherTeam(this.team)];
    const won = forfeit ? reason === 'won' : my > their;
    // Aufgaben: Siege (kampflos zählt nicht, "online" nur gegen Menschen)
    if (!forfeit && my > their) {
      count('wins');
      count(`win:${this.cfg.arms}`);
      if (this.members(otherTeam(this.team)).some((e) => !e.bot)) count('win:online');
    }
    this.g.onMatchOver({
      duel: true, team: true, forfeit, reason, won, score: [my, their], myTeam: this.team,
      board: this.boardRows(), rounds: this.rounds,
      kills: s.kills, deaths: s.deaths, damage: s.damage,
      accuracy: s.shots ? s.hits / s.shots : 0, headshots: s.kills ? s.heads / s.kills : 0,
      earned: s.earned, spent: s.spent, grenades: s.grenades,
      bomb: this.bombMode, planted: s.planted || 0, defused: s.defused || 0,
    });
  }
}
