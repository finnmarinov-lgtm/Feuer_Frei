import { WEAPONS, SLOT_KEYS } from '../config.js';

// Slots wie in CS: 1 Hauptwaffe, 2 Pistole, 3 Messer, 4 und 5 Extras (Granaten).
export class Inventory {
  constructor() {
    this.slots = {};
    this.reset();
  }

  reset() {
    for (const k of SLOT_KEYS) this.slots[k] = null;
    this.slots.knife = this._make('messer');
    this.slots.secondary = this._make('natter');
    this.current = 'secondary';
    this.last = 'knife';
  }

  _make(id) {
    const def = WEAPONS[id];
    return { id, def, mag: def.mag ?? 0, reserve: def.reserve ?? 0 };
  }

  get active() {
    return this.slots[this.current];
  }

  slotFor(id) {
    const s = WEAPONS[id].slot;
    if (s !== 'utility') return s;
    if (!this.slots.util1) return 'util1';
    if (!this.slots.util2) return 'util2';
    return null;
  }

  get utilityCount() {
    return (this.slots.util1 ? 1 : 0) + (this.slots.util2 ? 1 : 0);
  }

  /** Legt eine Waffe in ihren Slot, ersetzt ggf. die alte. Gibt den Slot zurück oder null. */
  give(id) {
    const slot = this.slotFor(id);
    if (!slot) return null;
    this.slots[slot] = this._make(id);
    return slot;
  }

  remove(slot) {
    this.slots[slot] = null;
  }

  has(id) {
    return SLOT_KEYS.some((k) => this.slots[k]?.id === id);
  }

  refillAmmo() {
    for (const k of SLOT_KEYS) {
      const w = this.slots[k];
      if (w && w.def.mag) {
        w.mag = w.def.mag;
        w.reserve = w.def.reserve;
      }
    }
  }

  /** Beste verfügbare Waffe (für nach dem Wurf einer Granate) */
  bestSlot() {
    for (const k of ['primary', 'secondary', 'knife']) if (this.slots[k]) return k;
    return 'knife';
  }

  cycle(dir) {
    const order = SLOT_KEYS.filter((k) => this.slots[k]);
    const i = order.indexOf(this.current);
    return order[(i + dir + order.length) % order.length];
  }
}
