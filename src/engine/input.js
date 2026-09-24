// Tastatur, Maus und Pointer Lock. Aktionen statt Tastencodes, damit man später umbelegen kann.
const BINDINGS = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ControlLeft: 'crouch', KeyC: 'crouch', ShiftLeft: 'walk',
  KeyR: 'reload', KeyQ: 'lastWeapon', KeyB: 'buy', KeyF: 'inspect', Tab: 'scores',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5',
};

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
      if (!this.locked) return;
      if (e.button === 0) { this.fire = true; this.firePressed = true; }
      if (e.button === 2) { this.alt = true; this.altPressed = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (this.fire) this.fireReleased = true; this.fire = false; }
      if (e.button === 2) { if (this.alt) this.altReleased = true; this.alt = false; }
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
    if (e.code === 'Escape' && isDown) {
      this.onEscape?.();
      return;
    }
    const action = BINDINGS[e.code];
    if (!action) return;
    if (this.enabled) e.preventDefault();
    if (isDown) {
      if (!this.down.has(action)) this.pressed.add(action);
      this.down.add(action);
    } else {
      this.down.delete(action);
    }
  }

  releaseAll() {
    this.down.clear();
    this.pressed.clear();
    this.fire = this.alt = false;
    this.firePressed = this.altPressed = this.fireReleased = this.altReleased = false;
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
    if (this.locked) return;
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
