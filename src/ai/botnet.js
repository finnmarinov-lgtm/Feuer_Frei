import { NavGrid } from './nav.js';
import { Bot, BOT_NAMES, LEVELS } from './bot.js';
import { MAP, SPAWNS } from '../world/map.js';
import { attackerOf } from '../game/duel.js';

// Verbindung zum KI-Gegner: sieht für das Duell aus wie die Netzverbindung zu einem Gast
// (gleiche Nachrichten), läuft aber komplett im eigenen Browser. Der Mensch ist immer Host.
export class BotNet {
  constructor(game, level) {
    this.bot = true;
    this.mode = 'bot';
    this.partner = 'bot';
    this.ping = 0;
    this.lost = false;
    this.code = null;
    this.known = new Set(['bot']);
    this.onMessage = null;
    this.g = game;
    this.level = LEVELS[level] ? level : 'mittel';
    this.name = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]} (KI)`;
    this.inbox = [];
    this.timers = [];
    // Wegenetz einmal pro Karte berechnen (die Karte muss schon geladen sein)
    game.navs ||= {};
    const nav = (game.navs[MAP.id] ||= new NavGrid(game.physics));
    this.brain = new Bot(game, nav, this.level, this.name, { key: 'guest', team: 'guest', world: duelWorld(game) });
    // Explosionen und Blendgranaten treffen auch die KI (ihr Spiel läuft hier mit)
    this._blast = (...a) => this.brain.blast(...a);
    this._flash = (pos) => this.brain.flash(pos);
    game.onBlast = this._blast;
    game.onFlash = this._flash;
  }

  get levelName() {
    return LEVELS[this.level].name;
  }

  /** Nachricht des Duells an den "Gast": erst im nächsten Schritt verarbeiten */
  send(data) {
    this.inbox.push(data);
    // Nochmal-Wunsch und Rundenende kommen auch, wenn das Spiel gerade nicht läuft (Auswertung)
    if (data.t === 'again') this._later(() => this._toGame({ t: 'again' }), 1200);
    if (data.t === 'ph' && data.ph === 'over' && !this.saidGg) {
      this.saidGg = true;
      if (Math.random() < 0.8) this._later(() => this._toGame({ t: 'chat', i: 0 }), 1500);
    }
    if (data.t === 'ph' && data.ph !== 'over') this.saidGg = false;
  }

  _later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  _toGame(msg) {
    this.onMessage?.(msg, 'bot');
  }

  setPartner() {}

  /** pro Simulationsschritt: Nachrichten zustellen, KI rechnen lassen, ihre Antworten abgeben */
  tick(dt) {
    const bot = this.brain;
    if (this.inbox.length) {
      const list = this.inbox;
      this.inbox = [];
      for (const m of list) bot.receive(m, 'host');
    }
    bot.tick(dt);
    if (bot.out.length) {
      const list = bot.out;
      bot.out = [];
      for (const m of list) this._toGame(m);
    }
  }

  close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    // nur die eigenen Haken entfernen (ein neues Spiel gegen die KI kann schon laufen)
    if (this.g.onBlast === this._blast) this.g.onBlast = null;
    if (this.g.onFlash === this._flash) this.g.onFlash = null;
    this.brain.dispose();
    this.onMessage = null;
  }
}

/**
 * Welt der KI im 1 gegen 1: ihr einziger Gegner ist der Mensch (Host, Rolle 'host'), sie selbst
 * ist der Gast. Rollen sind hier zugleich die Teams.
 */
function duelWorld(game) {
  const human = {
    key: 'host',
    team: 'host',
    get alive() {
      return game.player.alive;
    },
    get feet() {
      return game.player.feet;
    },
    get eyeHeight() {
      return game.player.eyeHeight;
    },
    // rennende Schritte hört man (Schleichen und Ducken sind leise)
    get running() {
      const p = game.player;
      return p.alive && p.onGround && !p.ducked && p.horizontalSpeed > p.maxSpeed * 0.6 && !game.input.isDown('walk');
    },
    get protected() {
      return game.match.protectT > 0;
    },
  };
  const foes = [human];
  return {
    duel: true,
    foes: () => foes,
    actor: (k) => (k === 'host' ? human : null),
    teamOf: (k) => k,
    attackerOf,
    livesOf: (msg) => msg.lv[1],
    homeSide: (team) => (team === 'host' ? 'west' : 'east'),
    spawn: (bot) => SPAWNS[bot.homeSide],
  };
}
