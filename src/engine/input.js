// Tastatur, Maus und Pointer Lock, auf dem Handy dazu die Touch-Steuerung (touch.js).
// Aktionen statt Tastencodes: jede Aktion hat bis zu zwei Tasten, die man in der Steuerung
// selbst belegen kann (auch die Maustasten 3 bis 5). Schießen, Zielen, Mausrad und Esc sind fest.
export const ACTIONS = [
  { id: 'forward', label: 'Vorwärts', keys: ['KeyW'] },
  { id: 'back', label: 'Rückwärts', keys: ['KeyS'] },
  { id: 'left', label: 'Links', keys: ['KeyA'] },
  { id: 'right', label: 'Rechts', keys: ['KeyD'] },
  { id: 'jump', label: 'Springen', keys: ['Space'] },
  { id: 'crouch', label: 'Ducken (genauer, leiser)', keys: ['ControlLeft', 'KeyC'] },
  { id: 'sprint', label: 'Sprinten (nur vorwärts)', keys: ['ShiftLeft'] },
  { id: 'walk', label: 'Schleichen (lautlos, genauer)', keys: ['AltLeft'] },
  { id: 'reload', label: 'Nachladen', keys: ['KeyR'] },
  { id: 'slot1', label: 'Hauptwaffe', keys: ['Digit1'] },
  { id: 'slot2', label: 'Pistole', keys: ['Digit2'] },
  { id: 'slot3', label: 'Messer', keys: ['Digit3'] },
  { id: 'slot4', label: 'Extra 1 (Granate)', keys: ['Digit4'] },
  { id: 'slot5', label: 'Extra 2 (Granate)', keys: ['Digit5'] },
  { id: 'lastWeapon', label: 'Letzte Waffe', keys: ['KeyQ'] },
  { id: 'buy', label: 'Kaufmenü (im Spawn, in der Kaufzeit)', keys: ['KeyB'] },
  { id: 'use', label: 'Bombe legen / entschärfen (halten)', keys: ['KeyE'] },
  { id: 'special', label: 'Luftschlag (Spezialleiste voll)', keys: ['KeyX'] },
  { id: 'inspect', label: 'Waffe begutachten', keys: ['KeyF'] },
  { id: 'scores', label: 'Statistik (halten)', keys: ['Tab'] },
  { id: 'chat', label: 'Schnellnachrichten öffnen (1 gegen 1)', keys: ['KeyT'] },
  { id: 'slot6', label: '6. Schnellnachricht (bei offener Liste)', keys: ['Digit6'] },
];
export const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]]));

// Maustasten, die man belegen kann (0 = links und 2 = rechts sind Schießen und Zielen)
const MOUSE_CODES = { 1: 'Mouse3', 3: 'Mouse4', 4: 'Mouse5' };

// Beschriftung für die deutsche Tastatur (KeyboardEvent.code folgt der US-Belegung)
const KEY_NAMES = {
  Backquote: '^', Minus: 'ß', Equal: '´', BracketLeft: 'Ü', BracketRight: '+', Semicolon: 'Ö',
  Quote: 'Ä', Backslash: '#', IntlBackslash: '<', Comma: ',', Period: '.', Slash: '-', KeyZ: 'Y', KeyY: 'Z',
  Space: 'Leertaste', Enter: 'Enter', Backspace: 'Rücktaste', CapsLock: 'Feststell', Tab: 'Tab',
  ShiftLeft: 'Shift', ShiftRight: 'Shift rechts', ControlLeft: 'Strg', ControlRight: 'Strg rechts',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Insert: 'Einfg', Delete: 'Entf', Home: 'Pos1', End: 'Ende',
  PageUp: 'Bild auf', PageDown: 'Bild ab', ArrowUp: 'Pfeil hoch', ArrowDown: 'Pfeil runter',
  ArrowLeft: 'Pfeil links', ArrowRight: 'Pfeil rechts', Pause: 'Pause', ScrollLock: 'Rollen',
  Mouse3: 'Maus 3', Mouse4: 'Maus 4', Mouse5: 'Maus 5',
};

// echte Beschriftung der Tastatur, falls der Browser sie kennt (Chrome, Edge)
let layoutMap = null;
navigator.keyboard?.getLayoutMap?.().then((m) => { layoutMap = m; }).catch(() => {});

export function keyLabel(code) {
  if (!code) return '–';
  const ch = layoutMap?.get(code);
  // groß schreiben, nur das ß nicht (daraus würde sonst "SS")
  if (ch && ch.trim() && !code.startsWith('Numpad')) return ch === 'ß' ? ch : ch.toUpperCase();
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.fire = false;
    this.alt = false;
    this.firePressed = false;
    this.altPressed = false;
    this.fireReleased = false;
    this.altReleased = false;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    this.onEscape = null;
    this.enabled = false;
    // Touch-Steuerung: kein Pointer Lock, Stick als Achsen (-1 bis 1), Blick in Grad
    this.touch = false;
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    // Notizblock-Taste und das Abfangen der nächsten Taste beim Umbelegen
    this.bossKey = null;
    this.onBossKey = null;
    this.capture = null;
    // Belegung: Aktion -> Tasten und umgekehrt
    this.setKeys(null);

    document.addEventListener('keydown', (e) => this._key(e, true));
    document.addEventListener('keyup', (e) => this._key(e, false));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ausreißer mancher Browser bei Pointer Lock verwerfen
      if (Math.abs(e.movementX) > 1500 || Math.abs(e.movementY) > 1500) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      const code = MOUSE_CODES[e.button];
      // Umbelegen: Maustaste 3 bis 5 als neue Taste übernehmen
      if (code && this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(code);
        return;
      }
      if (!this.locked) return;
      if (e.button === 0) { this.fire = true; this.firePressed = true; }
      if (e.button === 2) { this.alt = true; this.altPressed = true; }
      if (code) {
        e.preventDefault();
        this._press(code, true);
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (this.fire) this.fireReleased = true; this.fire = false; }
      if (e.button === 2) { if (this.alt) this.altReleased = true; this.alt = false; }
      const code = MOUSE_CODES[e.button];
      if (code) {
        // Seitentasten würden sonst im Browser zurück- oder vorblättern
        if (this.enabled) e.preventDefault();
        this._press(code, false);
      }
    });
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
      this.onLockChange?.(this.locked);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  _key(e, isDown) {
    if (isDown && this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    if (isDown && e.code === this.bossKey) {
      e.preventDefault();
      if (!e.repeat) this.onBossKey?.();
      return;
    }
    if (e.code === 'Escape' && isDown) {
      this.onEscape?.();
      return;
    }
    if (this.bindings[e.code] && this.enabled) e.preventDefault();
    this._press(e.code, isDown);
  }

  _press(code, isDown) {
    const action = this.bindings[code];
    if (!action) return;
    if (isDown) {
      if (!this.down.has(action)) this.pressed.add(action);
      this.down.add(action);
    } else {
      this.down.delete(action);
    }
  }

  /** Belegung setzen (Aktion -> bis zu zwei Tasten); fehlende Aktionen bekommen ihre Standardtasten */
  setKeys(keys) {
    this.keys = {};
    for (const a of ACTIONS) {
      const k = keys?.[a.id];
      this.keys[a.id] = Array.isArray(k) ? k.filter((c) => typeof c === 'string').slice(0, 2) : [...a.keys];
    }
    this.bindings = {};
    for (const [action, codes] of Object.entries(this.keys)) for (const c of codes) this.bindings[c] = action;
    this.down.clear();
  }

  /** Beschriftung der (ersten) Taste einer Aktion, z. B. für Hinweise im Spiel */
  label(action) {
    return keyLabel(this.keys[action]?.[0]);
  }

  /** Taste gehört schon zum Spiel (Aktion oder Esc) */
  isReserved(code) {
    return code === 'Escape' || !!this.bindings[code];
  }

  releaseAll() {
    this.down.clear();
    this.pressed.clear();
    this.fire = this.alt = false;
    this.firePressed = this.altPressed = this.fireReleased = this.altReleased = false;
    this.moveX = this.moveY = 0;
    this.lookX = this.lookY = 0;
    this.onRelease?.();
  }

  /** Aktion von außen setzen (Touch-Knöpfe): halten bzw. loslassen wie eine Taste */
  setAction(action, on) {
    if (on) {
      if (!this.down.has(action)) this.pressed.add(action);
      this.down.add(action);
    } else {
      this.down.delete(action);
    }
  }

  /** Schießen bzw. rechte Maustaste von außen (Touch-Knöpfe) */
  setFire(on) {
    if (on && !this.fire) this.firePressed = true;
    if (!on && this.fire) this.fireReleased = true;
    this.fire = on;
  }

  setAlt(on) {
    if (on && !this.alt) this.altPressed = true;
    if (!on && this.alt) this.altReleased = true;
    this.alt = on;
  }

  /** Blickänderung vom Touchscreen in Grad seit dem letzten Bild */
  takeLook() {
    const d = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return d;
  }

  isDown(action) {
    return this.down.has(action);
  }

  /** true genau einmal pro Tastendruck */
  consume(action) {
    if (this.pressed.has(action)) {
      this.pressed.delete(action);
      return true;
    }
    return false;
  }

  takeMouse() {
    const d = { x: this.mouseX, y: this.mouseY };
    this.mouseX = this.mouseY = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Einmal-Ereignisse nach jedem Simulationsschritt verwerfen, die niemand abgeholt hat */
  endTick() {
    this.pressed.clear();
    this.firePressed = this.altPressed = this.fireReleased = this.altReleased = false;
  }

  async lock() {
    // auf dem Touchscreen gibt es keinen Mauszeiger zum Fangen
    if (this.locked || this.touch) return;
    try {
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.canvas.requestPointerLock();
      } catch {
        // wird beim nächsten Klick erneut versucht
      }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
