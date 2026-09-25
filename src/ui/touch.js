import { SLOT_KEYS, SPECIAL } from '../config.js';
import { MAP } from '../world/map.js';

// Touch-Steuerung fürs Handy (quer halten): linker Daumen bewegt über einen Stick, der dort
// erscheint, wo man hintippt (ganz nach vorne geschoben = Sprinten). Rechter Daumen wischt zum
// Umsehen. Knöpfe für Schießen, Zielen, Springen, Ducken, Nachladen, Waffen, Kaufen, Bombe,
// Luftschlag und Pause. Alles läuft über Pointer Events, damit mehrere Finger gleichzeitig gehen.

const $ = (id) => document.getElementById(id);
const STICK_R = 54;
const SLOT_SHORT = { primary: 'Haupt', secondary: 'Pistole', knife: 'Messer', util1: 'Extra', util2: 'Extra' };

/** Soll die Touch-Steuerung an sein? ?touch=1/0 in der Adresse, sonst Einstellung oder Gerät */
export function wantsTouch(settings) {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  if (settings.touch === 'an') return true;
  if (settings.touch === 'aus') return false;
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export class TouchControls {
  constructor(game, { onPause }) {
    this.g = game;
    this.input = game.input;
    this.onPause = onPause;
    this.root = $('touch');
    this.enabled = false;
    // Finger -> wer ihn gerade bedient (Stick, Blick oder ein Knopf)
    this.owners = new Map();
    this.stick = { id: null, bx: 0, by: 0, x: 0, y: 0, sprint: false };
    this.lookId = null;
    this.crouch = false;
    this.slotsKey = '';

    this.el = {
      move: $('t-move'), look: $('t-look'), base: $('t-stick'), knob: $('t-knob'),
      use: $('t-use'), special: $('t-special'), buy: $('t-buy'), chat: $('t-chat'),
      crouch: $('t-crouch'), slots: $('t-slots'), rotate: $('rotate-hint'),
    };
    this._bind();
  }

  setEnabled(on) {
    this.enabled = on;
    this.input.touch = on;
    document.body.classList.toggle('touch', on);
    if (!on) {
      this.root.hidden = true;
      this._releaseAll();
    }
  }

  // ---------- Finger verteilen ----------
  _own(e, handler) {
    e.preventDefault();
    this.owners.set(e.pointerId, handler);
    handler.down?.(e);
  }

  _bind() {
    const opt = { passive: false };
    window.addEventListener('pointermove', (e) => {
      const h = this.owners.get(e.pointerId);
      if (!h) return;
      e.preventDefault();
      h.move?.(e);
    }, opt);
    const end = (e) => {
      const h = this.owners.get(e.pointerId);
      if (!h) return;
      this.owners.delete(e.pointerId);
      h.up?.(e);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // alles wieder los, wenn das Spiel den Fokus verliert (Anruf, App gewechselt)
    this.input.onRelease = () => this._releaseAll(true);

    // Stick: erscheint unter dem Daumen
    this.el.move.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      this._own(e, {
        down: (ev) => this._stickDown(ev),
        move: (ev) => this._stickMove(ev),
        up: () => this._stickUp(),
      });
    }, opt);

    // Umsehen: Wischen auf der rechten Seite
    this.el.look.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this._own(e, this._lookHandler(() => { this.lookId = null; }));
    }, opt);

    for (const b of this.root.querySelectorAll('[data-hold]')) {
      const action = b.dataset.hold;
      // Schießen und Zielen: beim Halten weiter umsehen können (wie in Handy-Shootern üblich)
      const drag = action === 'fire' || action === 'alt';
      b.addEventListener('pointerdown', (e) => {
        const look = drag ? this._lookHandler() : null;
        this._own(e, {
          down: (ev) => {
            b.classList.add('on');
            this._hold(action, true);
            look?.down(ev);
          },
          move: (ev) => look?.move(ev),
          up: () => {
            b.classList.remove('on');
            this._hold(action, false);
          },
        });
      }, opt);
    }
    for (const b of this.root.querySelectorAll('[data-tap]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._tap(b.dataset.tap);
      }, opt);
    }
    this.el.crouch.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.crouch = !this.crouch;
      this.input.setAction('crouch', this.crouch);
      this.el.crouch.classList.toggle('on', this.crouch);
    }, opt);
    this.el.slots.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      e.preventDefault();
      this._tap(`slot${b.dataset.slot}`);
    }, opt);
    // Schnellnachrichten: Einträge der Liste antippen
    $('chat-menu').addEventListener('pointerdown', (e) => {
      const row = e.target.closest('[data-chat]');
      if (!row || !this.enabled) return;
      e.preventDefault();
      this.g.match.sendChat?.(Number(row.dataset.chat));
      this.g.hud.toggleChat(false);
    }, opt);
  }

  _hold(action, on) {
    if (action === 'fire') this.input.setFire(on);
    else if (action === 'alt') this.input.setAlt(on);
    else this.input.setAction(action, on);
  }

  _tap(action) {
    if (action === 'pause') {
      this.onPause?.();
      return;
    }
    this.input.setAction(action, true);
    this.input.setAction(action, false);
  }

  /** Wischen -> Blickänderung in Grad (Empfindlichkeit aus den Einstellungen) */
  _lookHandler(onUp = null) {
    let lx = 0, ly = 0;
    return {
      down: (e) => { lx = e.clientX; ly = e.clientY; },
      move: (e) => {
        const k = 0.24 * (this.g.settings.touchSens ?? 1);
        this.input.lookX += (e.clientX - lx) * k;
        this.input.lookY += (e.clientY - ly) * k;
        lx = e.clientX;
        ly = e.clientY;
      },
      up: () => onUp?.(),
    };
  }

  // ---------- Stick ----------
  _stickDown(e) {
    const s = this.stick;
    s.id = e.pointerId;
    // ganz sichtbar bleiben, auch wenn man nah am Rand hintippt
    s.bx = Math.max(STICK_R + 8, e.clientX);
    s.by = Math.min(window.innerHeight - STICK_R - 8, Math.max(STICK_R + 8, e.clientY));
    this.el.base.classList.add('active');
    this._stickMove(e);
  }

  _stickMove(e) {
    const s = this.stick;
    let dx = e.clientX - s.bx;
    let dy = e.clientY - s.by;
    let d = Math.hypot(dx, dy);
    // weit darüber hinaus gezogen: der Stick wandert mit, damit der Daumen nicht wegrutscht
    const far = STICK_R * 1.7;
    if (d > far) {
      s.bx += (dx / d) * (d - far);
      s.by += (dy / d) * (d - far);
      dx = e.clientX - s.bx;
      dy = e.clientY - s.by;
      d = far;
    }
    const k = Math.min(1, d / STICK_R);
    const dead = 0.12;
    const mag = k < dead ? 0 : (k - dead) / (1 - dead);
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : 0;
    this.input.moveX = nx * mag;
    this.input.moveY = -ny * mag;
    // Sprinten: deutlich über den Rand nach vorne schieben
    const forward = -ny > 0.75;
    const sprint = forward && d > STICK_R * (s.sprint ? 1.1 : 1.3);
    if (sprint !== s.sprint) {
      s.sprint = sprint;
      this.input.setAction('sprint', sprint);
    }
    s.x = nx * Math.min(d, STICK_R);
    s.y = ny * Math.min(d, STICK_R);
    this._drawStick();
  }

  _stickUp() {
    const s = this.stick;
    s.id = null;
    s.x = s.y = 0;
    this.input.moveX = this.input.moveY = 0;
    if (s.sprint) this.input.setAction('sprint', false);
    s.sprint = false;
    this.el.base.classList.remove('active');
    this._drawStick();
  }

  _drawStick() {
    const s = this.stick;
    const base = this.el.base;
    if (s.id !== null) base.style.transform = `translate(${s.bx - STICK_R}px, ${s.by - STICK_R}px)`;
    else base.style.transform = '';
    this.el.knob.style.transform = `translate(${s.x}px, ${s.y}px)`;
    base.classList.toggle('sprint', s.sprint);
  }

  /** alle Finger vergessen (Pause, Fokus weg); notify: Knöpfe bekommen ihr Loslassen noch mit */
  _releaseAll(notify = false) {
    if (notify) for (const h of this.owners.values()) h.up?.();
    this.owners.clear();
    this.lookId = null;
    if (this.stick.id !== null) this._stickUp();
    this.crouch = false;
    for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on');
  }

  // ---------- pro Bild: welche Knöpfe gerade Sinn ergeben ----------
  update() {
    if (!this.enabled) return;
    const g = this.g;
    const playing = g.state === 'playing';
    const show = playing && !g.buyMenu.open;
    if (this.root.hidden === show) this.root.hidden = !show;
    const portrait = playing && window.innerHeight > window.innerWidth;
    if (this.el.rotate.hidden === portrait) this.el.rotate.hidden = !portrait;
    if (!show) return;
    const m = g.match;
    const p = g.player;
    // Ducken: Zustand angleichen (z. B. nach neuer Runde oder Pause)
    if (!p.alive && this.crouch) {
      this.crouch = false;
      this.input.setAction('crouch', false);
      this.el.crouch.classList.remove('on');
    }
    const action = m.useAction ?? null;
    const busy = m.busy;
    const useLabel = busy ? (m.plantT > 0 ? 'Legen …' : 'Entschärfen …') : action === 'plant' ? 'Bombe legen' : action === 'defuse' ? 'Entschärfen' : '';
    this._toggle(this.el.use, !!useLabel);
    if (useLabel && this.el.use._label !== useLabel) {
      this.el.use._label = useLabel;
      this.el.use.textContent = useLabel;
    }
    this._toggle(this.el.buy, m.canBuy);
    this._toggle(this.el.chat, g.mode === 'duel');
    // Luftschlag: Ring füllt sich mit der Spezialleiste
    const k = Math.min(1, (m.special || 0) / SPECIAL.charge);
    const sp = this.el.special;
    const pct = `${Math.round(k * 100)}`;
    if (sp._pct !== pct) {
      sp._pct = pct;
      sp.style.setProperty('--k', `${k * 360}deg`);
    }
    sp.classList.toggle('ready', m.specialReady);
    this._toggle(sp, !!MAP.airstrike);
    sp.classList.toggle('on', g.airstrikes.targeting);
    this._slots();
  }

  _toggle(el, on) {
    if (el.hidden === on) el.hidden = !on;
  }

  // Waffenleiste unten: antippen wechselt die Waffe
  _slots() {
    const inv = this.g.weapons.inv;
    const key = SLOT_KEYS.map((k) => inv.slots[k]?.id || '-').join(',') + '|' + inv.current;
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.el.slots.innerHTML = SLOT_KEYS.map((k, i) => {
      const w = inv.slots[k];
      if (!w) return '';
      const cls = inv.current === k ? ' class="on"' : '';
      // in der Waffenleiste heißt das Messer immer "Messer" (welches es ist, zeigt die Munitionsanzeige)
      const label = SLOT_SHORT[k] === w.def.name ? '&nbsp;' : SLOT_SHORT[k];
      return `<button data-slot="${i + 1}"${cls}><small>${label}</small>${w.def.name}</button>`;
    }).join('');
  }
}
