import { DUEL, ECONOMY, TRAINING, WEAPONS, ARMOR, SPECIAL } from '../config.js';
import { MAP, SPAWN } from '../world/map.js';
import { count } from './cosmetics.js';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Grundlage jeder Partie: Geld, Kaufen, Spezialleiste (Luftschlag) und Statistik. Darauf bauen das
// 1 gegen 1 (duel.js), das Team-Spiel (teams.js) und das freie Training (unten) auf.
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
    return `Runde ${this.round}`;
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
    return MAP.airstrike && this.phase === 'live' && p.alive && !this.fireBlocked && !this.busy;
  }

  addCharge(points) {
    if (!MAP.airstrike || this.specialReady || !(points > 0)) return;
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
    g.airstrikes.start(point, seed, yaw, g.myKey);
    this.airFx?.(point, seed, yaw);
  }

  start() {
    this.reset();
  }

  tick() {}

  /** Kaufen nur in der Kaufzeit und in der eigenen Kaufzone */
  get canBuy() {
    const p = this.g.player;
    const inTime = this.phase === 'freeze' || (this.phase === 'live' && this.buyTimer > 0);
    return inTime && p.alive && this.g.arena.inBuyZone(p.feet, this.side);
  }

  get buyTimeLeft() {
    if (this.phase === 'freeze') return this.timer + DUEL.buyWindow;
    if (this.phase === 'live') return Math.max(0, this.buyTimer);
    return 0;
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
    if (def.id !== 'luftschlag') this.addCharge(SPECIAL.killBonus);
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

// Freies Training: keine Runden und keine Zeitgrenze, Geld ohne Ende (alles gratis, überall und
// jederzeit kaufen), die Ersatzmunition geht nicht aus. Klappziele stehen an zufälligen Stellen der
// Karte, einige bewegen sich, und jedes klappt kurz nach dem Umfallen wieder hoch. Wer sich selbst
// erwischt (eigene Granate, eigener Luftschlag), ist nach kurzer Zeit wieder am Startpunkt.
export class Training extends Match {
  constructor(game) {
    super(game);
    this.free = true;
  }

  get roundLabel() {
    return 'Freies Training';
  }

  get canBuy() {
    return this.phase === 'live' && this.g.player.alive;
  }

  get buyTimeLeft() {
    return Infinity;
  }

  reset() {
    super.reset();
    this.money = Infinity;
    this.respawnT = 0;
    // so lange läuft das Training schon (für die Anzeige auf Tab)
    this.time = 0;
  }

  // alles gratis: das Geld bleibt unbegrenzt
  priceOf() {
    return 0;
  }

  addMoney(v) {
    if (v > 0) this.stats.earned += v;
  }

  start() {
    this.reset();
    const g = this.g;
    g.weapons.inv.reset();
    g.player.armor = 0;
    g.player.helmet = false;
    this.round = 1;
    this.phase = 'live';
    this.timer = Infinity;
    this.roundStats = { kills: 0, heads: 0, shots: 0, hits: 0, reward: 0 };
    g.grenades.clear();
    g.airstrikes.clear();
    g.targets.clear();
    this._spawn();
    // Standorte, an denen ein Ziel nicht passt, lässt setup aus und nimmt den nächsten
    const spots = shuffle([...g.arena.targetSpots]);
    g.targets.setup(spots, TRAINING.targets, TRAINING.moving, g.player.feet, TRAINING.targetRespawn);
    g.audio.play('roundStart');
    g.hud.message('Freies Training', `Keine Zeitgrenze · ${g.hint('buy')}, alles gratis · Ziele klappen wieder hoch`, 3.5);
    g.hud.onWeaponChange();
  }

  _spawn() {
    const g = this.g;
    const p = g.player;
    p.spawn(SPAWN.pos, SPAWN.yaw);
    p.health = 100;
    p.frozen = false;
    g.viewmodel.root.visible = true;
    g.weapons.inv.refillAmmo();
    g.weapons.resetForRound();
  }

  tick(dt) {
    const g = this.g;
    this.time += dt;
    // Ersatzmunition geht nie aus (nachladen muss man trotzdem)
    let refilled = false;
    for (const w of Object.values(g.weapons.inv.slots)) {
      if (w?.def.mag && w.reserve !== w.def.reserve) {
        w.reserve = w.def.reserve;
        refilled = true;
      }
    }
    if (refilled) g.hud.onAmmo();
    // selbst erwischt: kurz warten, dann mit allen Waffen zurück an den Startpunkt
    if (!g.player.alive) {
      this.respawnT += dt;
      if (this.respawnT >= TRAINING.respawn) {
        this.respawnT = 0;
        this._spawn();
        g.hud.message('Weiter geht’s', 'Deine Waffen hast du noch', 1.5);
      }
    }
  }

  onKill(def, head) {
    this.stats.kills++;
    if (head) this.stats.heads++;
    if (this.roundStats) {
      this.roundStats.kills++;
      if (head) this.roundStats.heads++;
    }
    const knife = def.slot === 'knife';
    this.g.hud.killfeed({
      weapon: knife ? this.g.viewmodel.knifeSkin : def.id, label: def.slot ? this.g.weaponName(def) : def.name, head,
    });
    if (def.id !== 'luftschlag') this.addCharge(SPECIAL.killBonus);
    // Aufgabe: Klappziele im Training
    count('targets');
  }
}
