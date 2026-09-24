import { Net, randomCode, parseCode } from '../net/net.js';
import { netText } from './hud.js';

// Version des Netzprotokolls: beide Spieler brauchen denselben Stand des Spiels
export const PROTOCOL = 1;
const NAME_KEY = 'feuer-frei-name';
const COUNTDOWN = 5;
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

// Lobby: erstellen (Host) oder mit Code/Link beitreten (Gast). Sobald beide da sind,
// läuft ein Countdown und das Spiel startet von selbst.
export class Lobby {
  constructor({ show, onStart, netMode = null }) {
    this.show = show;
    this.onStart = onStart;
    this.netMode = netMode;
    this.net = null;
    this.role = null;
    this.code = null;
    this.partnerName = '';
    this.opts = { lives: 3, wins: 2 };
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
        const v = Number(e.target.dataset?.v);
        if (!v || this.role !== 'host') return;
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
    this.role = 'guest';
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
    this.partnerName = '';
    this.problem = '';
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  _enterRoom(code) {
    if (this.net) this.leave();
    this.code = code;
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
    this.net?.send({ t: 'hi', v: PROTOCOL, name: this.name, role: this.role, cfg: this.opts, ack }, id);
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
      if (!msg.ack) this._sayHi(from, true);
      if (this.role === 'guest' && msg.cfg) this.opts = msg.cfg;
      if (isNew && this.role === 'host') this._startCountdown();
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
    } else if ((msg.t === 'start' || msg.t === 'ph') && this.role === 'guest') {
      // "ph" heißt: der Host spielt schon (Startmeldung verloren gegangen)
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

  _launch(cfg) {
    const net = this.net;
    this._stopTimers();
    this.net = null;
    net.onPeer = null;
    net.onChange = null;
    net.onMessage = null;
    $('lobby-choice').hidden = false;
    $('lobby-room').hidden = true;
    this.onStart(net, {
      role: this.role, lives: cfg.lives, wins: cfg.wins,
      myName: this.name, theirName: this.partnerName || 'Mitspieler',
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
      for (const b of seg.children) b.classList.toggle('on', Number(b.dataset.v) === this.opts[key]);
    }
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
