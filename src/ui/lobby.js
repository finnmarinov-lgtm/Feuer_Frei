import { Net, PROTOCOL, randomCode, parseCode } from '../net/net.js';
import { session, setUrlLobby } from '../net/session.js';
import { netText } from './hud.js';

const NAME_KEY = 'feuer-frei-name';
const COUNTDOWN = 5;
const MODE_INFO = {
  kampf: () => 'Wer dem anderen alle Leben nimmt, gewinnt die Runde.',
  bombe: (use) => `Die Rollen wechseln jede Runde: Einer legt die Bombe auf dem Platz des anderen (${use} halten), der andere verteidigt und entschärft sie.`,
};
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

// Lobby: erstellen (Host) oder mit Code/Link beitreten (Gast). Sobald beide da sind,
// läuft ein Countdown und das Spiel startet von selbst. Wer die Seite neu lädt, kommt mit
// derselben Rolle zurück, bei einem laufenden Duell auch zurück ins Spiel (rejoin).
export class Lobby {
  constructor({ show, onStart, netMode = null, keyName = () => 'E' }) {
    this.show = show;
    this.onStart = onStart;
    this.netMode = netMode;
    // Beschriftung der eigenen Taste für eine Aktion (Tastenbelegung)
    this.keyName = keyName;
    this.net = null;
    this.role = null;
    this.rejoin = null;
    this.code = null;
    this.partnerName = '';
    this.opts = { mode: 'kampf', lives: 3, wins: 2 };
    this.countdown = 0;
    this.cdTimer = null;
    this.hiTimer = null;
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
      if (this.net?.partner) this._sayHi(this.net.partner, true);
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
    if (!navigator.share) $('btn-share').hidden = true;
    for (const seg of document.querySelectorAll('#lobby-opts .seg')) {
      seg.addEventListener('click', (e) => {
        const raw = e.target.dataset?.v;
        if (!raw || this.role !== 'host') return;
        const v = seg.dataset.opt === 'mode' ? raw : Number(raw);
        this.opts = { ...this.opts, [seg.dataset.opt]: v };
        if (this.net?.partner) {
          this.net.send({ t: 'cfg', cfg: this.opts });
          this._startCountdown();
        }
        this._render();
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
    // nach dem Neuladen: gleiche Rolle wie vorher, bei laufendem Duell mit dem eigenen Stand
    const saved = session.lobby();
    this.role = saved?.code === code ? saved.role : 'guest';
    const duel = session.duel();
    this.rejoin = duel?.code === code && duel.role === this.role ? duel : null;
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
      net.send({ t: 'bye' });
      setTimeout(() => net.close(), 300);
    }
    this.net = null;
    this.role = null;
    this.rejoin = null;
    this.partnerName = '';
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
    // Code in die Adresse und Rolle in den Tab-Speicher: Neuladen führt zurück in die Lobby
    session.setLobby(code, role);
    setUrlLobby(code);
    this.problem = '';
    this.partnerName = '';
    this.countdown = 0;
    this.enteredAt = performance.now();
    const net = (this.net = new Net(code, { only: this.netMode }));
    net.onPeer = (id) => this._sayHi(id);
    net.onMessage = (msg, from) => this._onMsg(msg, from);
    net.onChange = () => this._render();
    // bis der Partner feststeht, regelmäßig "Hallo" an alle sagen
    this.hiTimer = setInterval(() => {
      if (!net.partner) for (const id of net.known) this._sayHi(id);
      this._render();
    }, 2000);
    $('lobby-choice').hidden = true;
    $('lobby-room').hidden = false;
    this._render();
  }

  _sayHi(id, ack = false) {
    this.net?.send({ t: 'hi', v: PROTOCOL, name: this.name, role: this.role, cfg: this.opts, ack, rejoin: !!this.rejoin }, id);
  }

  _adopt(id, name) {
    const net = this.net;
    if (net.partner === id) {
      if (name) this.partnerName = cleanName(name);
      return false;
    }
    net.setPartner(id);
    this.partnerName = cleanName(name) || 'Mitspieler';
    this.problem = '';
    return true;
  }

  _onMsg(msg, from) {
    const net = this.net;
    if (!net) return;
    if (msg.t === 'hi') {
      if (msg.v !== PROTOCOL) {
        this.problem = 'Ihr habt verschiedene Versionen des Spiels. Bitte beide die Seite neu laden (Strg + F5).';
        this._render();
        return;
      }
      if (msg.role === this.role) return;
      if (net.partner && net.partner !== from) {
        if (this.role === 'host') net.send({ t: 'full' }, from);
        return;
      }
      const isNew = this._adopt(from, msg.name);
      // Das Duell läuft beim anderen noch: mit dem geschickten Stand wieder einsteigen
      if (msg.resume) {
        this._launch(msg.cfg || this.opts, msg.resume);
        return;
      }
      // Beide haben neu geladen: der Host hat den Stand der Partie in seinem Speicher
      if (this.role === 'host' && this.rejoin?.phase && msg.rejoin) {
        const saved = this.rejoin;
        net.send({ t: 'hi', v: PROTOCOL, ack: true, role: 'host', name: this.name, cfg: saved.cfg, resume: saved.phase }, from);
        this._launch(saved.cfg, saved.phase);
        return;
      }
      // Der andere fängt neu an: alten Stand vergessen, ganz normal starten
      if (this.rejoin && !msg.rejoin) this.rejoin = null;
      if (!msg.ack) this._sayHi(from, true);
      if (this.role === 'guest' && msg.cfg) this.opts = msg.cfg;
      if (isNew && this.role === 'host' && !this.rejoin) this._startCountdown();
      this._render();
      return;
    }
    if (msg.t === 'away' && from === net.partner) {
      // Partner lädt neu: Platz für seine neue Kennung freimachen
      net.partner = null;
      this.partnerName = '';
      this.countdown = 0;
      this._stopCountdown();
      this._render();
      return;
    }
    if (msg.t === 'full' && this.role === 'guest' && !net.partner) {
      this.problem = 'Diese Lobby ist schon voll.';
      this._render();
      return;
    }
    // der Gast übernimmt den Host auch über Countdown oder Start, falls ein "Hallo" fehlte
    if (this.role === 'guest' && !net.partner && ['cd', 'start', 'ph'].includes(msg.t)) this._adopt(from, msg.name);
    if (from !== net.partner) return;
    if (msg.t === 'cfg' && this.role === 'guest') {
      this.opts = msg.cfg;
    } else if (msg.t === 'cd' && this.role === 'guest') {
      this.countdown = msg.n;
      if (msg.cfg) this.opts = msg.cfg;
    } else if (msg.t === 'ph' && this.rejoin) {
      // Host spielt schon: seine Rundenmeldung ist der Stand für den Wiedereinstieg
      this._launch(this.rejoin.cfg || this.opts, msg);
      return;
    } else if ((msg.t === 'start' || msg.t === 'ph') && this.role === 'guest') {
      // "ph" heißt: der Host spielt schon (Startmeldung verloren gegangen)
      this.rejoin = null;
      this._launch(msg.cfg || this.opts);
      if (msg.t === 'ph') net.onMessage?.(msg, from);
      return;
    } else if (msg.t === 'bye') {
      net.partner = null;
      this.partnerName = '';
      this.countdown = 0;
      this._stopCountdown();
      this.problem = this.role === 'host'
        ? 'Dein Freund hat die Lobby verlassen. Der Link gilt weiter.'
        : 'Dein Freund hat die Lobby verlassen.';
    }
    this._render();
  }

  _startCountdown() {
    this._stopCountdown();
    const send = () => {
      this.net.send({ t: 'cd', n: this.countdown, cfg: this.opts, name: this.name });
      this._render();
    };
    this.countdown = COUNTDOWN;
    send();
    this.cdTimer = setInterval(() => {
      const net = this.net;
      if (!net?.partner) {
        this._stopCountdown();
        this.countdown = 0;
        this._render();
        return;
      }
      this.countdown--;
      if (this.countdown > 0) {
        send();
        return;
      }
      this._stopCountdown();
      net.send({ t: 'start', cfg: this.opts, name: this.name });
      this._launch(this.opts);
    }, 1000);
  }

  _stopCountdown() {
    clearInterval(this.cdTimer);
    this.cdTimer = null;
  }

  _stopTimers() {
    this._stopCountdown();
    clearInterval(this.hiTimer);
    this.hiTimer = null;
  }

  /** resume: Stand einer laufenden Partie (Wiedereinstieg), sonst beginnt eine neue */
  _launch(cfg, resume = null) {
    const net = this.net;
    const saved = resume ? this.rejoin : null;
    this._stopTimers();
    this.net = null;
    this.rejoin = null;
    net.onPeer = null;
    net.onChange = null;
    net.onMessage = null;
    $('lobby-choice').hidden = false;
    $('lobby-room').hidden = true;
    this.onStart(net, {
      role: this.role, lives: cfg.lives, wins: cfg.wins, mode: cfg.mode,
      myName: this.name, theirName: this.partnerName || 'Mitspieler',
      resume, saved,
    });
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
    navigator.share?.({ title: 'Feuer Frei – 1 gegen 1', text: `Spiel mit mir! Code ${this.code}`, url: this.link }).catch(() => {});
  }

  _render() {
    const net = this.net;
    if (!net) return;
    const host = this.role === 'host';
    $('lobby-code').textContent = this.code;
    $('lobby-link').value = this.link;
    $('lobby-link-row').hidden = !host;
    for (const seg of document.querySelectorAll('#lobby-opts .seg')) {
      const key = seg.dataset.opt;
      seg.classList.toggle('locked', !host);
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(this.opts[key] ?? 'kampf'));
    }
    $('lobby-mode-info').textContent = (MODE_INFO[this.opts.mode] || MODE_INFO.kampf)(this.keyName('use'));
    const me = `${escapeHtml(this.name)}<small>${host ? 'Host · Westen' : 'Gast · Osten'}</small>`;
    const partner = net.partner
      ? `${escapeHtml(this.partnerName)}<small>${host ? 'Gast · Osten' : 'Host · Westen'}</small>`
      : 'wartet …';
    $('lobby-p1').innerHTML = me;
    $('lobby-p2').innerHTML = partner;
    $('lobby-p2').classList.toggle('empty', !net.partner);

    let status;
    const waited = (performance.now() - this.enteredAt) / 1000;
    if (this.problem) status = this.problem;
    else if (this.rejoin) status = 'Zurück ins laufende Duell …';
    else if (net.partner && this.countdown > 0) status = `Spiel startet in ${this.countdown} …`;
    else if (net.partner) status = 'Gleich geht’s los …';
    else if (host) status = 'Warte auf deinen Freund …';
    else status = 'Verbinde mit der Lobby …';
    $('lobby-status').textContent = status;

    let info = '';
    if (net.partner) info = netText(net);
    else if (!host && waited > 12) info = 'Noch keine Lobby gefunden. Stimmt der Code, und ist dein Freund noch in der Lobby?';
    else if (host) info = 'Schick deinem Freund den Code oder den Link. Sobald er drin ist, startet das Spiel von selbst.';
    else if (waited > 6 && !net.serverReady) info = 'Der Server antwortet noch nicht, versuche es direkt …';
    $('lobby-net').textContent = info;
  }
}
