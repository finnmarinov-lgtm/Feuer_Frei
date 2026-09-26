import { MOVE } from '../config.js';
import { MAP, SPAWNS } from '../world/map.js';
import { FLAG } from '../game/remote.js';
import { SIDE, slotSpawn, teamAttacker } from '../game/sides.js';
import { NavGrid } from './nav.js';
import { Bot } from './bot.js';

// KI-Spieler im Team-Spiel. Sie laufen nur im Browser des Hosts (aufgefüllt in der Lobby): der Host
// gibt ihnen alle Nachrichten der Partie (Runden, Zustände, Treffer), schickt ihre Zustände an die
// anderen und zeigt sie selbst mit den Figuren wie jeden anderen Spieler an.

// Figuren, die eine KI als Gegner oder Mitspieler kennt: key, team, alive, feet, eyeHeight,
// running (rennt hörbar) und protected (Spawn-Schutz)

/** der Mensch am Rechner des Hosts */
function playerActor(game, match) {
  return {
    key: match.me,
    team: match.team,
    get alive() {
      return game.player.alive && match.phase !== 'idle';
    },
    get feet() {
      return game.player.feet;
    },
    get eyeHeight() {
      return game.player.eyeHeight;
    },
    get running() {
      const p = game.player;
      return p.alive && p.onGround && !p.ducked && p.horizontalSpeed > p.maxSpeed * 0.6 && !game.input.isDown('walk');
    },
    get protected() {
      return match.protectT > 0 && match.phase === 'live';
    },
  };
}

/** ein Mensch aus dem Netz: so, wie ihn der Host gerade sieht (seine Figur) */
function remoteActor(r) {
  return {
    key: r.key,
    team: r.team,
    get alive() {
      return r.alive && !r.hidden;
    },
    get feet() {
      return r.root.position;
    },
    get eyeHeight() {
      return MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * r.state.duck;
    },
    get running() {
      const f = r.state.f;
      return r.speed > 3.2 && !(f & FLAG.WALK) && r.state.duck < 0.5 && (f & FLAG.GROUND) !== 0;
    },
    get protected() {
      return r.protected;
    },
  };
}

/** eine andere KI: ihr Körper */
function botActor(bot) {
  const b = bot.body;
  return {
    key: bot.key,
    team: bot.team,
    get alive() {
      return b.alive && bot.phase !== 'idle';
    },
    get feet() {
      return b.feet;
    },
    get eyeHeight() {
      return b.eyeHeight;
    },
    get running() {
      return b.alive && b.onGround && !b.ducked && b.horizontalSpeed > b.maxSpeed * 0.6;
    },
    get protected() {
      return bot.protectT > 0 && bot.phase === 'live';
    },
  };
}

export class Squad {
  /** entries: KI-Spieler aus der Aufstellung (key, name, team, slot) */
  constructor(game, match, entries) {
    this.g = game;
    this.m = match;
    game.navs ||= {};
    const nav = (game.navs[MAP.id] ||= new NavGrid(game.physics, MAP.bounds));
    this.actors = new Map();
    this.actors.set(match.me, playerActor(game, match));
    for (const e of match.roster.values()) {
      const r = game.teamRemotes.get(e.key);
      if (!e.bot && r) this.actors.set(e.key, remoteActor(r));
    }
    const world = {
      duel: false,
      foes: (bot) => this.foes[bot.team === 'rot' ? 'blau' : 'rot'],
      actor: (k) => this.actors.get(k) || null,
      teamOf: (k) => match.teamOf(k),
      attackerOf: teamAttacker,
      livesOf: (msg, key) => (msg.lv && !Array.isArray(msg.lv) ? msg.lv[key] ?? 0 : 0),
      homeSide: (team) => SIDE[team],
      spawn: (bot) => slotSpawn(SPAWNS[SIDE[bot.team]], bot.slot),
    };
    this.bots = new Map();
    for (const e of entries) {
      const bot = new Bot(game, nav, match.cfg.level, e.name, { key: e.key, team: e.team, slot: e.slot, world });
      this.bots.set(e.key, bot);
      this.actors.set(e.key, botActor(bot));
    }
    // Gegner je Team (fest für die ganze Partie)
    this.foes = { rot: [], blau: [] };
    for (const a of this.actors.values()) this.foes[a.team].push(a);
    // was noch an die anderen geht: neuester Zustand und alle Ereignisse seitdem, pro KI
    this.pending = new Map();
    this.seq = new Map();
    // Explosionen und Blendgranaten treffen auch die KI-Spieler (ihr Spiel läuft hier mit)
    this._blast = (...a) => {
      for (const b of this.bots.values()) b.blast(...a);
    };
    this._flash = (pos) => {
      for (const b of this.bots.values()) b.flash(pos);
    };
    game.onBlast = this._blast;
    game.onFlash = this._flash;
  }

  /** Nachricht der Partie (from: Absender) an alle KI-Spieler außer dem Absender selbst */
  receive(msg, from) {
    // auf Schnellnachrichten antworten sie nur Menschen (sonst reden sie ewig miteinander)
    if (msg.t === 'chat' && this.bots.has(from)) return;
    for (const bot of this.bots.values()) if (bot.key !== from) bot.receive(msg, from);
  }

  tick(dt) {
    for (const bot of this.bots.values()) {
      bot.tick(dt);
      if (!bot.out.length) continue;
      const list = bot.out;
      bot.out = [];
      for (const msg of list) this._fromBot(msg, bot.key);
    }
  }

  _fromBot(msg, key) {
    if (msg.t === 'chat') {
      this.m.botChat(key, msg.i);
      return;
    }
    if (msg.t !== 's') return;
    msg.b = key;
    // beim Host gleich verarbeiten, als wäre es übers Netz gekommen
    this.m._onState(msg, key);
    let p = this.pending.get(key);
    if (!p) this.pending.set(key, (p = { s: null, ev: [] }));
    p.s = msg;
    if (msg.ev) p.ev.push(...msg.ev);
  }

  /** Zustände für das Netz (seit dem letzten Mal): der neueste pro KI, mit allen Ereignissen */
  takeNet() {
    const out = [];
    for (const [key, p] of this.pending) {
      if (!p.s) continue;
      const s = { ...p.s };
      delete s.ev;
      if (p.ev.length) s.ev = p.ev;
      const q = (this.seq.get(key) || 0) + 1;
      this.seq.set(key, q);
      s.q = q;
      out.push(s);
    }
    this.pending.clear();
    return out;
  }

  dispose() {
    if (this.g.onBlast === this._blast) this.g.onBlast = null;
    if (this.g.onFlash === this._flash) this.g.onFlash = null;
    for (const b of this.bots.values()) b.dispose();
    this.bots.clear();
  }
}
