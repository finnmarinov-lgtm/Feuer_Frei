import { ECONOMY, TRAINING, WEAPONS, ARMOR, SPECIAL } from '../config.js';
import { SPAWN } from '../world/map.js';
import { count } from './cosmetics.js';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Trainingsmodus: Runden mit Kaufzeit, Klappzielen, Geld und Auswertung.
export class Match {
  constructor(game) {
    this.g = game;
    this.phase = 'idle';
    this.side = 'west';
    this.reset();
  }

  // im Training darf man jederzeit schießen und nur die eigene Granate kann einen treffen
  get fireBlocked() {
    return false;
  }

  get immune() {
    return false;
  }

  // Bombe legen oder entschärfen gibt es nur im Duell (siehe duel.js)
  get busy() {
    return false;
  }

  get roundLabel() {
    return `Runde ${this.round}/${TRAINING.rounds}`;
  }

  reset() {
    this.round = 0;
    this.money = ECONOMY.startMoney;
    this.lossStreak = 0;
    this.phase = 'idle';
    this.timer = 0;
    this.buyTimer = 0;
    this.stats = { shots: 0, hits: 0, heads: 0, kills: 0, damage: 0, grenades: 0, spent: 0, earned: 0, airstrikes: 0 };
    this.rounds = [];
    this.roundStats = null;
    this.purchases = [];
    this.lastBeep = 0;
    // Spezialleiste (Punkte bis SPECIAL.charge), bleibt über die Runden erhalten
    this.special = 0;
  }

  // ---------- Spezialleiste und Luftschlag ----------
  get specialReady() {
    return this.special >= SPECIAL.charge;
  }

  get canUseSpecial() {
    const p = this.g.player;
    return this.phase === 'live' && p.alive && !this.fireBlocked && !this.busy;
  }

  addCharge(points) {
    if (this.specialReady || !(points > 0)) return;
    this.special = Math.min(SPECIAL.charge, this.special + points);
    if (this.specialReady) {
      this.g.audio.play('specialReady');
      this.g.hud.specialReady();
    }
  }

  /** Luftschlag auf point anfordern: Flugrichtung ist die eigene Blickrichtung */
  callAirstrike(point) {
    const g = this.g;
    const yaw = g.player.yaw;
    const seed = Math.floor(Math.random() * 2147483647);
    this.special = 0;
    this.stats.airstrikes++;
    this.onAttack?.();
    g.airstrikes.start(point, seed, yaw, true);
    this.airFx?.(point, seed, yaw);
  }

  start() {
    this.reset();
    const { player, weapons } = this.g;
    weapons.inv.reset();
    player.armor = 0;
    player.helmet = false;
    this._startRound();
  }

  _startRound() {
    const g = this.g;
    this.round++;
    this.phase = 'freeze';
    this.timer = TRAINING.freezeTime;
    this.purchases = [];
    this.roundStats = { kills: 0, heads: 0, shots: 0, hits: 0, reward: 0 };
    g.grenades.clear();
    g.airstrikes.clear();
    g.targets.clear();
    g.player.spawn(SPAWN.pos, SPAWN.yaw);
    g.player.health = 100;
    g.player.frozen = true;
    g.weapons.inv.refillAmmo();
    g.weapons.resetForRound();
    const n = TRAINING.targets[Math.min(this.round - 1, TRAINING.targets.length - 1)];
    this.pendingSpots = shuffle([...g.arena.targetSpots]).slice(0, n);
    this.pendingMoving = TRAINING.moving[Math.min(this.round - 1, TRAINING.moving.length - 1)];
    g.hud.message(`Runde ${this.round} von ${TRAINING.rounds}`, `Kaufzeit – ${g.hint('buy')}`, 3);
    g.hud.onWeaponChange();
    this.lastBeep = Math.ceil(this.timer);
  }

  get isLastRound() {
    return this.round >= TRAINING.rounds;
  }

  get canBuy() {
    const p = this.g.player;
    const inTime = this.phase === 'freeze' || (this.phase === 'live' && this.buyTimer > 0);
    return inTime && p.alive && this.g.arena.inBuyZone(p.feet, this.side);
  }

  get buyTimeLeft() {
    if (this.phase === 'freeze') return this.timer + TRAINING.buyWindow;
    if (this.phase === 'live') return Math.max(0, this.buyTimer);
    return 0;
  }

  tick(dt) {
    const g = this.g;
    if (this.phase === 'freeze') {
      this.timer -= dt;
      g.player.frozen = true;
      const s = Math.ceil(this.timer);
      if (s !== this.lastBeep && s <= 3 && s > 0) g.audio.play('beep', { freq: 660 });
      this.lastBeep = s;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = TRAINING.roundTime;
        this.buyTimer = TRAINING.buyWindow;
        g.player.frozen = false;
        g.targets.setup(this.pendingSpots, this.pendingMoving, g.player.feet);
        g.audio.play('roundStart');
        g.hud.message('Los!', `${this.pendingSpots.length} Ziele – triff sie alle`, 1.6);
      }
    } else if (this.phase === 'live') {
      this.timer -= dt;
      this.buyTimer -= dt;
      if (g.targets.remaining === 0) this._endRound(true, 'Alle Ziele getroffen');
      else if (!g.player.alive) this._endRound(false, 'Du hast dich selbst erwischt');
      else if (this.timer <= 0) this._endRound(false, 'Die Zeit ist abgelaufen');
    } else if (this.phase === 'end') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.isLastRound) this._finish();
        else this._startRound();
      }
    }
  }

  _endRound(won, reason) {
    const g = this.g;
    const used = TRAINING.roundTime - Math.max(0, this.timer);
    this.phase = 'end';
    this.timer = TRAINING.roundEndTime;
    let bonus;
    if (won) {
      bonus = ECONOMY.roundWin;
      this.lossStreak = 0;
    } else {
      bonus = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * this.lossStreak);
      this.lossStreak++;
    }
    this.addMoney(bonus);
    this.rounds.push({
      won, reason, time: used, kills: this.roundStats.kills, targets: g.targets.total,
      heads: this.roundStats.heads, bonus, reward: this.roundStats.reward,
    });
    g.hud.roundEnd(won, reason, bonus, this.isLastRound);
    g.audio.play(won ? 'roundWin' : 'roundLose');
    g.player.frozen = true;
    if (!g.player.alive) {
      // wie in CS: wer stirbt, verliert seine Ausrüstung
      g.weapons.inv.reset();
      g.player.armor = 0;
      g.player.helmet = false;
    }
  }

  _finish() {
    this.phase = 'over';
    const s = this.stats;
    this.g.onMatchOver({
      rounds: this.rounds,
      won: this.rounds.filter((r) => r.won).length,
      kills: s.kills,
      targets: this.rounds.reduce((a, r) => a + r.targets, 0),
      accuracy: s.shots ? s.hits / s.shots : 0,
      headshots: s.kills ? s.heads / s.kills : 0,
      earned: s.earned,
      spent: s.spent,
      time: this.rounds.reduce((a, r) => a + r.time, 0),
      grenades: s.grenades,
    });
  }

  addMoney(v) {
    const before = this.money;
    this.money = Math.min(ECONOMY.maxMoney, this.money + v);
    const got = this.money - before;
    if (got > 0) this.stats.earned += got;
    this.g.hud.onMoney(got);
  }

  onShot() {
    this.stats.shots++;
    if (this.roundStats) this.roundStats.shots++;
  }

  /** charge = false: Schaden lädt die Spezialleiste nicht (z. B. vom Luftschlag selbst) */
  onHit(damage, head, bullet = true, charge = true) {
    if (bullet) {
      this.stats.hits++;
      if (this.roundStats) this.roundStats.hits++;
    }
    this.stats.damage += damage;
    if (charge) this.addCharge(damage);
  }

  onKill(def, head) {
    this.stats.kills++;
    if (head) this.stats.heads++;
    if (this.roundStats) {
      this.roundStats.kills++;
      if (head) this.roundStats.heads++;
      this.roundStats.reward += def.reward;
    }
    this.addMoney(def.reward);
    const knife = def.slot === 'knife';
    this.g.hud.killfeed({
      weapon: knife ? this.g.viewmodel.knifeSkin : def.id, label: def.slot ? this.g.weaponName(def) : def.name,
      head, reward: def.reward,
    });
    if (def.id !== 'luftschlag') this.addCharge(SPECIAL.killBonus);
    // Aufgabe: Klappziele im Training
    count('targets');
  }

  onGrenade() {
    this.stats.grenades++;
  }

  // ---------- Kaufen ----------
  priceOf(id) {
    const p = this.g.player;
    if (id === 'vest') return ARMOR.vest.price;
    if (id === 'helmet') return p.armor >= 100 && !p.helmet ? ARMOR.helmet.upgrade : ARMOR.helmet.price;
    return WEAPONS[id].price;
  }

  /** Warum ein Gegenstand gerade nicht kaufbar ist (oder null) */
  blockReason(id) {
    const g = this.g;
    const p = g.player;
    const inv = g.weapons.inv;
    if (!this.canBuy) return this.phase === 'live' && this.buyTimer <= 0 ? 'Kaufzeit vorbei' : 'Nur im Spawn';
    if (id === 'vest' && p.armor >= 100) return 'Schon ausgerüstet';
    if (id === 'helmet' && p.armor >= 100 && p.helmet) return 'Schon ausgerüstet';
    if (WEAPONS[id]) {
      const def = WEAPONS[id];
      if (def.slot === 'utility') {
        if (inv.utilityCount >= 2) return 'Extra-Slots voll';
      } else if (inv.has(id)) return 'Schon im Besitz';
    }
    if (this.money < this.priceOf(id)) return 'Zu wenig Geld';
    return null;
  }

  buy(id) {
    const g = this.g;
    const reason = this.blockReason(id);
    if (reason) {
      g.audio.play('deny');
      return reason;
    }
    const price = this.priceOf(id);
    this.money -= price;
    this.stats.spent += price;
    const p = g.player;
    const inv = g.weapons.inv;
    if (id === 'vest') {
      this.purchases.push({ id, price, armorBefore: p.armor, helmetBefore: p.helmet });
      p.armor = 100;
    } else if (id === 'helmet') {
      this.purchases.push({ id, price, armorBefore: p.armor, helmetBefore: p.helmet });
      p.armor = 100;
      p.helmet = true;
    } else {
      const slot = inv.slotFor(id);
      const replaced = inv.slots[slot];
      inv.give(id);
      this.purchases.push({ id, price, slot, replaced });
      g.weapons.onBought(slot);
    }
    g.audio.play('buy');
    g.hud.onMoney(-price);
    return null;
  }

  /** Rückgabe in der Kaufzeit (nur Dinge aus dieser Runde) */
  refund(id) {
    const g = this.g;
    if (!this.canBuy) return false;
    const i = this.purchases.map((x) => x.id).lastIndexOf(id);
    if (i < 0) return false;
    const pur = this.purchases[i];
    const inv = g.weapons.inv;
    const p = g.player;
    if (pur.slot) {
      if (inv.slots[pur.slot]?.id !== id) return false;
      inv.slots[pur.slot] = pur.replaced || null;
      if (inv.current === pur.slot && !inv.slots[pur.slot]) inv.current = inv.bestSlot();
      g.weapons.equip(inv.current, true);
    } else {
      p.armor = pur.armorBefore;
      p.helmet = pur.helmetBefore;
    }
    this.purchases.splice(i, 1);
    this.money += pur.price;
    this.stats.spent -= pur.price;
    g.audio.play('buy');
    g.hud.onMoney(pur.price);
    return true;
  }

  canRefund(id) {
    return this.canBuy && this.purchases.some((x) => x.id === id);
  }
}
