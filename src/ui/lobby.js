import { Net, PROTOCOL, randomCode, parseCode } from '../net/net.js';
import { ARMS } from '../config.js';
import { MAP } from '../world/map.js';
import { session, setUrlLobby } from '../net/session.js';
import { netText } from './hud.js';
import { BOT_NAMES, LEVELS } from '../ai/bot.js';
import { TEAM_IDS, TEAM_NAMES } from '../game/sides.js';

const NAME_KEY = 'feuer-frei-name';
const COUNTDOWN = 3;
const MAX_TEAM = 4;
// so lange (ms) hält der Host den Platz für jemanden frei, der gerade neu lädt
const AWAY_KEEP = 15000;
const VERSION_PROBLEM = 'Ihr habt verschiedene Versionen des Spiels. Bitte alle die Seite neu laden (Strg + F5).';
const MODE_INFO = {
  kampf: () => 'Eine Runde gewinnt, wer alle Gegner ausschaltet (mit 3 Leben muss jeder dreimal fallen).',
  bombe: (use) => `Die Seiten wechseln jede Runde: Wer angreift, legt die Bombe auf dem Platz der anderen (${use} halten), wer verteidigt, entschärft sie.`,
};
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

// Mehrspieler-Lobby: erstellen (Host) oder mit Code/Link beitreten. Wer beitritt, kommt ins kleinere
// Team (Rot oder Blau) und kann wechseln. Nur wenn der Host "Mit KI auffüllen" oder "+ KI" drückt,
// kommen KI-Spieler dazu. Der Host startet: Sind genau zwei Menschen da (einer pro Team), wird es das
// 1 gegen 1 (Duell), sonst ein Team-Spiel. Wer die Seite neu lädt, kommt zurück (in die Lobby oder
// ins laufende Spiel).
export class Lobby {
  constructor({ show, onStart, netMode = null, keyName = () => 'E', looks = () => null }) {
    this.show = show;
    this.onStart = onStart;
    this.netMode = netMode;
    // Beschriftung der eigenen Taste für eine Aktion (Tastenbelegung)
    this.keyName = keyName;
    // eigene Skins (werden mitgeschickt, damit die anderen sie sehen)
    this.looks = looks;
    this.net = null;
    this.role = null;
    this.key = session.key();
    // Stand einer laufenden Partie nach dem Neuladen: { kind: 'duel' | 'team', ... }
    this.rejoin = null;
    this.code = null;
    // Aufstellung: beim Host die maßgebliche, beim Gast die zuletzt vom Host geschickte
    this.roster = [];
    this.hostPeer = null;
    this.hostKey = null;
    // 1 gegen 1: Name und Skins des anderen
    this.partnerName = '';
    this.partnerLooks = null;
    this.opts = { mode: 'kampf', lives: 3, wins: 2, map: MAP.id, arms: 'alle', level: 'mittel' };
    this.countdown = 0;
    this.cdTimer = null;
    this.tickTimer = null;
    this.problem = '';
    this.enteredAt = 0;

    const nameInput = $('lobby-name');
    let saved = '';
    try {
      saved = localStorage.getItem(NAME_KEY) || '';
    } catch {
      // ohne Speicher gibt es jedes Mal einen neuen Namen
    }
    nameInput.value = saved || `Spieler ${Math.floor(10 + Math.random() * 90)}`;
    nameInput.addEventListener('input', () => {
      try {
        localStorage.setItem(NAME_KEY, cleanName(nameInput.value));
      } catch {
        // egal
      }
      if (this.role === 'host' && !this.rejoin) {
        const me = this.roster.find((e) => e.key === this.key);
        if (me) me.name = this.name;
        this._changed();
      } else if (this.hostPeer) {
        this._sayHi(this.hostPeer);
      }
      this._render();
    });
    $('btn-create').addEventListener('click', () => this.create());
    $('btn-join').addEventListener('click', () => this.join($('lobby-code-input').value));
    $('lobby-code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.join(e.target.value);
    });
    $('btn-copy').addEventListener('click', () => this._copy());
    $('btn-share').addEventListener('click', () => this._share());
    $('btn-lobby-back').addEventListener('click', () => this.back());
    $('btn-fill').addEventListener('click', () => this.fillBots());
    $('btn-go').addEventListener('click', () => this.startGame());
    $('lobby-teams').addEventListener('click', (e) => this._onTeamClick(e));
    if (!navigator.share) $('btn-share').hidden = true;
    for (const seg of document.querySelectorAll('#lobby-opts .seg')) {
      seg.addEventListener('click', (e) => {
        const raw = e.target.dataset?.v;
        if (!raw || this.role !== 'host' || this.rejoin) return;
        const v = ['mode', 'map', 'arms', 'level'].includes(seg.dataset.opt) ? raw : Number(raw);
        this.opts = { ...this.opts, [seg.dataset.opt]: v };
        this._stopCountdown();
        this._changed();
      });
    }
  }

  get name() {
    return cleanName($('lobby-name').value) || 'Spieler';
  }

  /** Lobby-Bildschirm zeigen; mit Code (aus einem Link) direkt beitreten */
  open(code = null) {
    this.show('lobby');
    if (!this.net) {
      $('lobby-choice').hidden = false;
      $('lobby-room').hidden = true;
      this.problem = '';
    }
    if (code) this.join(code);
  }

  create() {
    this.role = 'host';
    // die Karte aus dem Hauptmenü vorschlagen
    this.opts = { ...this.opts, map: MAP.id };
    this.rejoin = null;
    this._enterRoom(randomCode());
  }

  join(text) {
    const code = parseCode(text);
    if (!code) {
      $('lobby-code-input').focus();
      $('lobby-code-input').select();
      $('lobby-code-input').placeholder = 'Code hat 6 Zeichen';
      $('lobby-code-input').value = '';
      return;
    }
    // nach dem Neuladen: gleiche Rolle wie vorher, bei laufender Partie mit dem eigenen Stand
    const saved = session.lobby();
    const same = saved?.code === code;
    this.role = same ? saved.role : 'guest';
    this.rejoin = null;
    const duel = session.duel();
    const team = session.team();
    if (same && saved.kind === 'duel' && duel?.code === code && duel.role === this.role) this.rejoin = { kind: 'duel', ...duel };
    else if (same && saved.kind === 'team' && team?.code === code && team.key === this.key) this.rejoin = { kind: 'team', ...team };
    this._enterRoom(code);
  }

  back() {
    this.leave();
    this.show('menu');
  }

  leave() {
    this._stopTimers();
    if (this.net) {
      const net = this.net;
      net.send({ t: 'bye' }, this.role === 'host' ? undefined : this.hostPeer || undefined);
      setTimeout(() => net.close(), 300);
    }
    this.net = null;
    this.role = null;
    this.rejoin = null;
    this.roster = [];
    this.hostPeer = this.hostKey = null;
    this.partnerName = '';
    this.partnerLooks = null;
    this.countdown = 0;
    this.problem = '';
    session.clear();
    setUrlLobby(null);
  }

  _enterRoom(code) {
    const { role, rejoin } = this;
    if (this.net) this.leave();
    this.role = role;
    this.rejoin = rejoin;
    this.code = code;
    // Code in die Adresse und Rolle in den Tab-Speicher: Neuladen führt zurück
    session.setLobby(code, role, rejoin?.kind ?? null);
    setUrlLobby(code);
    this.problem = '';
    this.countdown = 0;
    this.hostPeer = this.hostKey = null;
    this.partnerName = '';
    this.partnerLooks = null;
    this.enteredAt = performance.now();
    const net = (this.net = new Net(code, { only: this.netMode }));
    this.roster = [];
    if (role === 'host') {
      this.hostKey = this.key;
      this.roster = [{ key: this.key, peer: net.id, name: this.name, looks: this.looks(), team: 'rot', host: true }];
    }
    net.onPeer = (id) => this._greet(id);
    net.onMessage = (msg, from) => this._onMsg(msg, from);
    net.onChange = () => this._render();
    this.tickTimer = setInterval(() => this._tick(), 2000);
    $('lobby-choice').hidden = true;
    $('lobby-room').hidden = false;
    this._render();
    // Host lädt mitten im Team-Spiel neu: gleich weiterspielen, die anderen finden ihn wieder
    if (role === 'host' && rejoin?.kind === 'team') this._resumeTeamHost();
  }

  // ---------- Nachrichten ----------
  _sayHi(id, ack = false) {
    const msg = { t: 'hi', v: PROTOCOL, key: this.key, name: this.name, looks: this.looks(), role: this.role, cfg: this.opts, ack };
    if (this.rejoin) {
      msg.rejoin = true;
      msg.kind = this.rejoin.kind;
    }
    this.net?.send(msg, id);
  }

  /** neuer Mitspieler im Raum gesehen */
  _greet(id) {
    if (this.role === 'host' && !this.rejoin) this._sendLobby(id);
    else this._sayHi(id);
  }

  /** alle 2 Sekunden: Plätze aufräumen, Stand schicken, "Hallo" wiederholen */
  _tick() {
    const net = this.net;
    if (!net) return;
    if (this.rejoin?.kind === 'duel') {
      if (!net.partner) for (const id of net.known) this._sayHi(id);
    } else if (this.role === 'host') {
      const now = performance.now();
      const n = this.roster.length;
      this.roster = this.roster.filter((e) => !e.away || now - e.away < AWAY_KEEP);
      if (this.roster.length !== n) {
        this._stopCountdown();
        this._changed();
      } else {
        this._sendLobby();
      }
    } else {
      // Gast: "Hallo" an alle, bis der Host einen aufgenommen hat (auch nach seinem Neuladen)
      const inRoom = this.hostPeer && this.roster.some((e) => e.key === this.key) && !net.lostPeer(this.hostPeer);
      if (!inRoom) for (const id of net.known) this._sayHi(id);
      // laufendes Team-Spiel wieder aufnehmen: kommt keine Antwort, ist es wohl vorbei
      if (this.rejoin?.kind === 'team' && performance.now() - this.enteredAt > 15000) {
        this.rejoin = null;
        session.setLobby(this.code, this.role);
        this.problem = 'Das Spiel ist schon vorbei oder der Host ist weg.';
      }
    }
    this._render();
  }

  _onMsg(msg, from) {
    if (!this.net || !msg || typeof msg !== 'object') return;
    if (this.rejoin?.kind === 'duel') this._duelRejoinMsg(msg, from);
    else if (this.role === 'host') this._hostMsg(msg, from);
    else this._guestMsg(msg, from);
  }

  // ---------- 1 gegen 1 nach dem Neuladen wieder aufnehmen ----------
  _adopt(id, name, looks) {
    const net = this.net;
    if (looks && typeof looks === 'object') this.partnerLooks = looks;
    if (name) this.partnerName = cleanName(name);
    if (net.partner !== id) net.setPartner(id);
    this.problem = '';
  }

  _duelRejoinMsg(msg, from) {
    const net = this.net;
    const saved = this.rejoin;
    if (msg.t === 'hi') {
      if (msg.v !== PROTOCOL) {
        this.problem = VERSION_PROBLEM;
        this._render();
        return;
      }
      if (msg.role === this.role) return;
      if (net.partner && net.partner !== from) return;
      this._adopt(from, msg.name, msg.looks);
      // das Duell läuft beim anderen noch: mit dem geschickten Stand wieder einsteigen
      if (msg.resume) {
        this._launchDuel(msg.cfg || saved.cfg, msg.resume);
        return;
      }
      // beide haben neu geladen: der Host hat den Stand der Partie in seinem Speicher
      if (this.role === 'host' && saved.phase && msg.rejoin) {
        net.send({ t: 'hi', v: PROTOCOL, ack: true, role: 'host', name: this.name, looks: this.looks(), cfg: saved.cfg, resume: saved.phase }, from);
        this._launchDuel(saved.cfg, saved.phase);
        return;
      }
      // der andere fängt neu an: alten Stand vergessen, ganz normal in der Lobby weiter
      if (!msg.rejoin) {
        this._dropRejoin();
        this._onMsg(msg, from);
      }
      return;
    }
    // der Host spielt schon: seine Rundenmeldung ist der Stand für den Wiedereinstieg
    if (msg.t === 'ph' && this.role === 'guest' && (from === net.partner || !net.partner)) {
      this._adopt(from, null, null);
      this._launchDuel(saved.cfg || this.opts, msg);
      return;
    }
    // der andere ist schon in einer neuen Lobby
    if (msg.t === 'lobby') {
      this._dropRejoin();
      this._onMsg(msg, from);
    }
  }

  _dropRejoin() {
    this.rejoin = null;
    session.setLobby(this.code, this.role);
    if (this.net) this.net.partner = null;
    if (this.role === 'host') {
      this.hostKey = this.key;
      this.roster = [{ key: this.key, peer: this.net.id, name: this.name, looks: this.looks(), team: 'rot', host: true }];
    }
  }

  // ---------- Host ----------
  _hostMsg(msg, from) {
    const e = this.roster.find((x) => !x.bot && x.peer === from && x.key !== this.key);
    switch (msg.t) {
      case 'hi': {
        if (msg.v !== PROTOCOL) {
          this.problem = 'Jemand mit einer anderen Version des Spiels will mitspielen. Bitte alle neu laden (Strg + F5).';
          this._sendLobby(from);
          this._render();
          return;
        }
        // ein 1 gegen 1 läuft noch (man hat neu geladen, der eigene Stand fehlte): weiterspielen
        if (msg.resume && msg.role === 'guest') {
          this._adopt(from, msg.name, msg.looks);
          this._launchDuel(msg.cfg || this.opts, msg.resume);
          return;
        }
        if (msg.role === 'host' || !msg.key || msg.key === this.key) return;
        let p = this.roster.find((x) => x.key === msg.key);
        if (p) {
          // schon da (z. B. nach dem Neuladen): neue Kennung, neuer Name
          p.peer = from;
          p.name = cleanName(msg.name) || p.name;
          p.looks = msg.looks && typeof msg.looks === 'object' ? msg.looks : p.looks;
          p.away = 0;
        } else {
          const team = this._freeTeam();
          if (!team) {
            this.net.send({ t: 'full' }, from);
            return;
          }
          this._makeRoom(team);
          p = { key: msg.key, peer: from, name: cleanName(msg.name) || 'Mitspieler', looks: msg.looks && typeof msg.looks === 'object' ? msg.looks : null, team };
          this.roster.push(p);
          this._stopCountdown();
        }
        this.problem = '';
        this._changed();
        return;
      }
      case 'team':
        if (e && TEAM_IDS.includes(msg.team) && e.team !== msg.team && this._canJoin(msg.team)) {
          this._makeRoom(msg.team);
          e.team = msg.team;
          this._stopCountdown();
          this._changed();
        }
        return;
      case 'bye':
        if (e) {
          this.roster.splice(this.roster.indexOf(e), 1);
          this._stopCountdown();
          this._changed();
        }
        return;
      case 'away':
        if (e) {
          e.away = performance.now();
          this._stopCountdown();
          this._changed();
        }
        return;
      default:
        break;
    }
  }

  _size(team) {
    return this.roster.filter((e) => e.team === team).length;
  }

  /** ins Team passt noch jemand (notfalls muss ein KI-Spieler Platz machen) */
  _canJoin(team) {
    return this._size(team) < MAX_TEAM || this.roster.some((e) => e.team === team && e.bot);
  }

  /** Team für einen neuen Mitspieler: das kleinere (oder null, wenn alles voll ist) */
  _freeTeam() {
    const [a, b] = TEAM_IDS;
    const order = this._size(a) <= this._size(b) ? [a, b] : [b, a];
    return order.find((t) => this._size(t) < MAX_TEAM) || order.find((t) => this._canJoin(t)) || null;
  }

  /** ist das Team voll, macht ein KI-Spieler Platz */
  _makeRoom(team) {
    if (this._size(team) < MAX_TEAM) return;
    const bots = this.roster.filter((e) => e.team === team && e.bot);
    if (bots.length) this.roster.splice(this.roster.indexOf(bots[bots.length - 1]), 1);
  }

  _addBot(team) {
    if (this._size(team) >= MAX_TEAM) return false;
    const used = new Set(this.roster.map((e) => e.name));
    const free = BOT_NAMES.filter((n) => !used.has(`${n} (KI)`));
    const name = `${free.length ? free[Math.floor(Math.random() * free.length)] : 'Robo'} (KI)`;
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    this.roster.push({ key: 'k' + a[0].toString(36), name, team, bot: true });
    return true;
  }

  /** "Mit KI auffüllen": das kleinere Team bekommt KI-Spieler, bis beide gleich groß sind */
  fillBots() {
    if (this.role !== 'host' || this.rejoin) return;
    const target = Math.max(1, ...TEAM_IDS.map((t) => this._size(t)));
    for (const t of TEAM_IDS) while (this._size(t) < target && this._addBot(t));
    this._stopCountdown();
    this._changed();
  }

  get canFill() {
    const target = Math.max(1, ...TEAM_IDS.map((t) => this._size(t)));
    return TEAM_IDS.some((t) => this._size(t) < target);
  }

  _onTeamClick(e) {
    const b = e.target.closest('button');
    if (!b || !this.net || this.rejoin) return;
    const act = b.dataset.act;
    if (act === 'join') {
      if (this.role === 'host') return;
      this.net.send({ t: 'team', team: b.dataset.team }, this.hostPeer);
    } else if (this.role === 'host' && act === 'bot') {
      if (this._addBot(b.dataset.team)) {
        this._stopCountdown();
        this._changed();
      }
    } else if (this.role === 'host' && act === 'kick') {
      const i = this.roster.findIndex((x) => x.key === b.dataset.key && x.bot);
      if (i >= 0) {
        this.roster.splice(i, 1);
        this._stopCountdown();
        this._changed();
      }
    }
  }

  /** Aufstellung fürs Netz (ohne interne Angaben) */
  _publicRoster() {
    return this.roster.map((e) => ({
      key: e.key, name: e.name, team: e.team, looks: e.looks || null, bot: !!e.bot, host: !!e.host,
      peer: e.bot ? null : e.peer, away: e.away ? 1 : 0, slot: e.slot || 0,
    }));
  }

  _sendLobby(to = undefined) {
    const net = this.net;
    if (!net || this.role !== 'host') return;
    const msg = { t: 'lobby', v: PROTOCOL, host: this.key, cfg: this.opts, roster: this._publicRoster(), cd: this.countdown };
    net.send(msg, to);
  }

  /** Host: Aufstellung geändert, an alle schicken */
  _changed() {
    if (this.role !== 'host' || !this.net || this.rejoin) {
      this._render();
      return;
    }
    const me = this.roster.find((e) => e.key === this.key);
    if (me) me.looks = this.looks();
    this.net.setGroup(this.roster.filter((e) => !e.bot && e.key !== this.key && e.peer).map((e) => e.peer));
    this._sendLobby();
    this._render();
  }

  /** in jedem Team ist jemand */
  get startable() {
    return TEAM_IDS.every((t) => this._size(t) > 0);
  }

  /** "1 gegen 1", "2 gegen 2", "3 gegen 2" … */
  get sizeLabel() {
    const [a, b] = TEAM_IDS.map((t) => this._size(t));
    return `${a} gegen ${b}`;
  }

  /** Knopf "Starten": kurzer Countdown für alle, dann geht es los */
  startGame() {
    if (this.role !== 'host' || this.rejoin || !this.startable || this.cdTimer) return;
    this.countdown = COUNTDOWN;
    this._changed();
    this.cdTimer = setInterval(() => {
      if (!this.net || !this.startable) {
        this._stopCountdown();
        this._changed();
        return;
      }
      this.countdown--;
      if (this.countdown > 0) {
        this._changed();
        return;
      }
      this._stopCountdown();
      this._go();
    }, 1000);
  }

  _go() {
    const net = this.net;
    // Startplätze im Spawn der Reihe nach
    for (const t of TEAM_IDS) this.roster.filter((e) => e.team === t).forEach((e, i) => { e.slot = i; });
    const humans = this.roster.filter((e) => !e.bot);
    const bots = this.roster.filter((e) => e.bot);
    // zwei Menschen, einer pro Team, keine KI: das 1 gegen 1
    if (humans.length === 2 && !bots.length && humans[0].team !== humans[1].team) {
      const other = humans.find((e) => e.key !== this.key);
      net.setPartner(other.peer);
      this.partnerName = other.name;
      this.partnerLooks = other.looks;
      net.send({ t: 'start', kind: 'duel', v: PROTOCOL, cfg: this.opts, host: this.key }, other.peer);
      this._launchDuel(this.opts);
      return;
    }
    const start = { t: 'start', kind: 'team', v: PROTOCOL, cfg: this.opts, roster: this._publicRoster(), host: this.key };
    net.send(start);
    this._launchTeam(start);
  }

  // ---------- Gast ----------
  _guestMsg(msg, from) {
    const net = this.net;
    switch (msg.t) {
      case 'hi':
        // ein 1 gegen 1 läuft noch (man hat neu geladen, der eigene Stand fehlte): weiterspielen
        if (msg.v === PROTOCOL && msg.resume && msg.role === 'host') {
          this._adopt(from, msg.name, msg.looks);
          this._launchDuel(msg.cfg || this.opts, msg.resume);
        }
        return;
      case 'lobby': {
        if (msg.v !== PROTOCOL) {
          this.problem = VERSION_PROBLEM;
          this._render();
          return;
        }
        // läuft schon ein Team-Spiel, kommt gleich dessen Stand
        if (this.rejoin?.kind === 'team') return;
        // ein anderer Host im selben Raum? den ersten behalten, außer er ist weg
        if (this.hostPeer && from !== this.hostPeer && msg.host !== this.hostKey && !net.lostPeer(this.hostPeer)) return;
        const first = !this.hostPeer || this.hostPeer !== from;
        this.hostPeer = from;
        this.hostKey = msg.host;
        net.setGroup([from]);
        this.roster = Array.isArray(msg.roster) ? msg.roster : [];
        if (msg.cfg) this.opts = msg.cfg;
        this.countdown = msg.cd || 0;
        if (this.roster.some((e) => e.key === this.key)) this.problem = '';
        else if (first) this._sayHi(from);
        this._render();
        return;
      }
      case 'full':
        if (!this.roster.some((e) => e.key === this.key)) {
          this.problem = 'Diese Lobby ist schon voll (4 gegen 4).';
          this._render();
        }
        return;
      case 'busy':
        this.problem = 'Dort läuft gerade schon ein Spiel. Warte, bis es vorbei ist, oder erstelle eine eigene Lobby.';
        this._render();
        return;
      case 'start':
        if (msg.v !== PROTOCOL || (this.hostPeer && from !== this.hostPeer)) return;
        this.hostPeer = from;
        if (msg.kind === 'duel') {
          const host = this.roster.find((e) => e.key === msg.host);
          this.partnerName = host?.name || 'Mitspieler';
          this.partnerLooks = host?.looks || null;
          net.setPartner(from);
          this._launchDuel(msg.cfg || this.opts);
        } else if (Array.isArray(msg.roster) && msg.roster.some((e) => e.key === this.key)) {
          this._launchTeam(msg);
        }
        return;
      case 'ph':
        // der Host spielt schon ein 1 gegen 1 mit einem (die Startmeldung ging verloren)
        if (from === this.hostPeer && this._duelRoster()) {
          const host = this.roster.find((e) => e.key === this.hostKey);
          this.partnerName = host?.name || 'Mitspieler';
          this.partnerLooks = host?.looks || null;
          net.setPartner(from);
          this._launchDuel(this.opts);
          net.onMessage?.(msg, from);
        }
        return;
      case 'resume':
        // Stand eines laufenden Team-Spiels (nach dem Neuladen oder weil der Start verloren ging)
        if (msg.v === PROTOCOL && msg.kind === 'team' && Array.isArray(msg.roster) && msg.roster.some((e) => e.key === this.key)) {
          this.hostPeer = from;
          this._launchTeam(msg, msg.phase);
        }
        return;
      case 'bye':
        if (from === this.hostPeer) {
          this.problem = 'Der Host hat die Lobby verlassen.';
          this.roster = [];
          this.hostPeer = null;
          this.countdown = 0;
          this._render();
        }
        return;
      case 'away':
        if (from === this.hostPeer) {
          this.countdown = 0;
          this._render();
        }
        return;
      default:
        break;
    }
  }

  /** Aufstellung ist ein 1 gegen 1 unter Menschen */
  _duelRoster() {
    const humans = this.roster.filter((e) => !e.bot);
    return humans.length === 2 && humans.length === this.roster.length && humans[0].team !== humans[1].team;
  }

  _stopCountdown() {
    clearInterval(this.cdTimer);
    this.cdTimer = null;
    this.countdown = 0;
  }

  _stopTimers() {
    this._stopCountdown();
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  // ---------- Start ----------
  _detach() {
    const net = this.net;
    this._stopTimers();
    this.net = null;
    net.onPeer = null;
    net.onChange = null;
    net.onMessage = null;
    $('lobby-choice').hidden = false;
    $('lobby-room').hidden = true;
    return net;
  }

  /** 1 gegen 1 starten; resume: Stand einer laufenden Partie (Wiedereinstieg) */
  _launchDuel(cfg, resume = null) {
    const saved = resume && this.rejoin?.kind === 'duel' ? this.rejoin : null;
    this.rejoin = null;
    session.setLobby(this.code, this.role, 'duel');
    const net = this._detach();
    this.onStart(net, {
      kind: 'duel', role: this.role, lives: cfg.lives, wins: cfg.wins, mode: cfg.mode, map: cfg.map, arms: cfg.arms,
      myName: this.name, theirName: this.partnerName || 'Mitspieler', theirLooks: this.partnerLooks,
      resume, saved,
    });
  }

  /** Team-Spiel starten; start: Startmeldung (cfg, roster, host), resume: Stand einer laufenden Partie */
  _launchTeam(start, resume = null) {
    const saved = resume && this.rejoin?.kind === 'team' ? this.rejoin : null;
    this.rejoin = null;
    session.setLobby(this.code, this.role, 'team');
    const isHost = this.role === 'host';
    const net = this._detach();
    this.onStart(net, {
      kind: 'team', key: this.key, isHost, hostKey: start.host, hostPeer: isHost ? net.id : this.hostPeer,
      cfg: start.cfg, roster: start.roster, myName: this.name,
      startMsg: isHost && !resume ? start : null, resume, saved,
    });
  }

  // Host lädt mitten im Team-Spiel neu: mit dem gespeicherten Stand weiter
  _resumeTeamHost() {
    const saved = this.rejoin;
    if (!saved.roster || !saved.phase) {
      this._dropRejoin();
      this._render();
      return;
    }
    this._launchTeam({ cfg: saved.cfg, roster: saved.roster, host: this.key }, saved.phase);
  }

  get link() {
    return `${location.origin}${location.pathname}?lobby=${this.code}`;
  }

  async _copy() {
    const btn = $('btn-copy');
    try {
      await navigator.clipboard.writeText(this.link);
      btn.textContent = 'Kopiert!';
    } catch {
      $('lobby-link').select();
      btn.textContent = 'Markiert – Strg+C';
    }
    setTimeout(() => { btn.textContent = 'Link kopieren'; }, 1800);
  }

  _share() {
    navigator.share?.({ title: 'Feuer Frei – Mehrspieler', text: `Spiel mit mir! Code ${this.code}`, url: this.link }).catch(() => {});
  }

  // ---------- Anzeige ----------
  _teamHtml(t) {
    const host = this.role === 'host';
    const list = this.roster.filter((e) => e.team === t);
    const mine = this.roster.find((e) => e.key === this.key);
    const level = LEVELS[this.opts.level]?.name ?? '';
    const rows = list.map((e) => {
      const tags = [];
      if (e.key === this.key) tags.push('Du');
      if (e.host) tags.push('Host');
      if (e.bot) tags.push(`KI · ${level}`);
      if (e.away) tags.push('lädt neu …');
      const kick = host && e.bot ? `<button class="x" data-act="kick" data-key="${escapeHtml(e.key)}" title="KI entfernen">✕</button>` : '';
      const cls = [e.key === this.key ? 'me' : '', e.bot ? 'bot' : '', e.away ? 'away' : ''].join(' ');
      return `<li class="${cls}"><span>${escapeHtml(e.name)}</span><small>${tags.join(' · ')}</small>${kick}</li>`;
    });
    if (list.length < MAX_TEAM) rows.push('<li class="free">frei</li>');
    const btns = [];
    const roomy = list.length < MAX_TEAM || list.some((e) => e.bot);
    if (mine && mine.team !== t && !host && roomy) btns.push(`<button data-act="join" data-team="${t}">Hierher wechseln</button>`);
    if (host && list.length < MAX_TEAM) btns.push(`<button data-act="bot" data-team="${t}">+ KI</button>`);
    return `<div class="team t-${t}"><h3>${TEAM_NAMES[t]} <small>${list.length}/${MAX_TEAM}</small></h3>`
      + `<ul>${rows.join('')}</ul><div class="team-btns">${btns.join('')}</div></div>`;
  }

  _render() {
    const net = this.net;
    if (!net) return;
    const host = this.role === 'host';
    const rejoining = !!this.rejoin;
    $('lobby-code').textContent = this.code;
    $('lobby-link').value = this.link;
    for (const seg of document.querySelectorAll('#lobby-opts .seg')) {
      const key = seg.dataset.opt;
      seg.classList.toggle('locked', !host || rejoining);
      const def = { mode: 'kampf', map: 'hof', arms: 'alle', level: 'mittel' }[key];
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(this.opts[key] ?? def));
    }
    $('lobby-mode-info').textContent = (MODE_INFO[this.opts.mode] || MODE_INFO.kampf)(this.keyName('use'));
    $('lobby-arms-info').textContent = (ARMS[this.opts.arms] || ARMS.alle).info;
    const bots = this.roster.some((e) => e.bot);
    $('lobby-level').hidden = !bots;
    $('lobby-teams').hidden = rejoining;
    if (!rejoining) {
      const html = TEAM_IDS.map((t) => this._teamHtml(t)).join('<div class="vs">gegen</div>');
      const el = $('lobby-teams');
      if (el._html !== html) {
        el._html = html;
        el.innerHTML = html;
      }
    }
    const humans = this.roster.filter((e) => !e.bot).length;
    $('lobby-actions').hidden = !host || rejoining;
    $('btn-fill').hidden = !this.canFill;
    const go = $('btn-go');
    go.disabled = !this.startable || this.countdown > 0;
    const duel = this._duelRoster();
    go.textContent = this.startable ? `${duel ? '1 gegen 1' : this.sizeLabel} starten` : 'Starten';
    $('lobby-title').textContent = this.startable && !rejoining ? (duel ? '1 gegen 1' : `Mehrspieler · ${this.sizeLabel}`) : 'Mehrspieler';

    let status;
    const waited = (performance.now() - this.enteredAt) / 1000;
    const inRoom = host || this.roster.some((e) => e.key === this.key);
    const hostName = this.roster.find((e) => e.host)?.name || 'der Host';
    if (this.problem) status = this.problem;
    else if (this.rejoin?.kind === 'duel') status = 'Zurück ins laufende Duell …';
    else if (this.rejoin) status = 'Zurück ins laufende Spiel …';
    else if (this.countdown > 0) status = `${duel ? '1 gegen 1' : this.sizeLabel} startet in ${this.countdown} …`;
    else if (!inRoom) status = 'Verbinde mit der Lobby …';
    else if (host) status = humans < 2 && !bots ? 'Warte auf deine Freunde …' : this.startable ? 'Alle da? Dann starte das Spiel.' : 'Im anderen Team fehlt noch jemand.';
    else status = `Warte, bis ${hostName} startet …`;
    $('lobby-status').textContent = status;

    let info = '';
    if (this.rejoin?.kind === 'duel' && net.partner) info = netText(net);
    else if (!host && this.hostPeer) info = netText(net);
    else if (host && humans > 1) {
      const peers = this.roster.filter((e) => !e.bot && e.key !== this.key && e.peer);
      const server = peers.filter((e) => net.modeOf(e.peer) === 'server').length;
      info = `${peers.length} ${peers.length === 1 ? 'Freund' : 'Freunde'} verbunden${server ? ` · ${server} über Server` : ''}`;
    } else if (!host && waited > 12) info = 'Noch keine Lobby gefunden. Stimmt der Code, und ist der Host noch in der Lobby?';
    else if (host) info = 'Schick deinen Freunden den Code oder den Link. Bis zu 8 Spieler (4 gegen 4), zu zweit wird es ein 1 gegen 1.';
    else if (waited > 6 && !net.serverReady) info = 'Der Server antwortet noch nicht, versuche es direkt …';
    $('lobby-net').textContent = info;
  }
}
