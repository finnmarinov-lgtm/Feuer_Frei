import * as THREE from 'three';
import { DUEL, GRENADES, MOVE, SLOT_KEYS } from '../config.js';
import { Inventory } from './inventory.js';
import { shotEnd } from '../game/duel.js';

const DEG = Math.PI / 180;
const MAX_RANGE = 250;

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pdir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _end = new THREE.Vector3();
const _vel = new THREE.Vector3();

function dirFromAngles(out, pitch, yaw) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

// Schießen, Nachladen, Rückstoß, Streuung, Zielen, Messer und Granatenwurf.
export class WeaponSystem {
  constructor(game) {
    this.g = game;
    this.inv = new Inventory();
    this.time = 0;
    this.drawTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.nextFire = 0;
    this.lastShot = -10;
    this.recoilIndex = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.kick = { pitch: 0, yaw: 0 };
    this.fireInacc = 0;
    this.grenade = null;
    this.throwTimer = 0;
    this.pendingKnife = null;
    this.shotCounter = 0;
    this.spread = 0;
    // Zielen (Kimme und Korn, Rotpunkt oder Zielfernrohr): 0 = aus der Hüfte, 1 = voll im Anschlag
    this.ads = 0;
    this.adsToggled = false;
    this.adsBlockUntil = 0;
  }

  get active() {
    return this.inv.active;
  }

  get def() {
    return this.inv.active.def;
  }

  /** Zielfernrohr voll angelegt: Bild durch das Fernrohr statt Waffe in der Hand */
  get scoped() {
    return !!this.inv.active?.def.scope && this.ads >= 0.98;
  }

  resetForRound() {
    this.reloading = false;
    this.ads = 0;
    this.adsToggled = false;
    this.adsBlockUntil = 0;
    this.grenade = null;
    this.throwTimer = 0;
    this.pendingKnife = null;
    this.recoil.pitch = this.recoil.yaw = 0;
    this.recoilIndex = 0;
    this.fireInacc = 0;
    this.nextFire = this.time;
    if (!this.inv.active) this.inv.current = this.inv.bestSlot();
    this.equip(this.inv.current, true);
  }

  equip(slot, force = false) {
    if (!this.inv.slots[slot]) return;
    if (slot === this.inv.current && !force) return;
    this.reloading = false;
    this.ads = 0;
    this.adsToggled = false;
    this.adsBlockUntil = 0;
    this.grenade = null;
    this.pendingKnife = null;
    if (slot !== this.inv.current) this.inv.last = this.inv.current;
    this.inv.current = slot;
    const def = this.def;
    this.drawTimer = def.draw;
    this.nextFire = this.time;
    this.recoilIndex = 0;
    this.fireInacc = 0;
    this.g.viewmodel.equip(def);
    this.g.audio.play('draw');
    this.g.hud.onWeaponChange();
  }

  /** Nach einem Kauf: neue Waffe gleich in die Hand nehmen, wenn sie die aktuelle ersetzt */
  onBought(slot) {
    if (slot === this.inv.current || slot === 'primary' || (slot === 'secondary' && !this.inv.slots.primary)) {
      this.equip(slot, true);
    }
    this.g.hud.onWeaponChange();
  }

  currentSpread(def) {
    const s = def.spread;
    if (!s) return 0;
    const p = this.g.player;
    let base = s.base;
    let move = s.move;
    if (def.scope) {
      if (this.scoped) base = s.scoped;
    } else if (def.ads && this.ads > 0) {
      base *= 1 + (def.ads.spread - 1) * this.ads;
      move *= 1 - 0.25 * this.ads;
    }
    if (p.ducked) base *= 0.75;
    const max = def.speed;
    const speed = p.horizontalSpeed;
    const moveFrac = Math.min(1, Math.max(0, (speed - MOVE.accurateSpeed * max) / (max * (1 - MOVE.accurateSpeed))));
    return base + move * moveFrac + (p.onGround ? 0 : s.air) + this.fireInacc;
  }

  /** Öffnung des Schrotkegels in Milliradiant (im Anschlag etwas enger) */
  pelletCone(def) {
    const k = def.ads ? 1 + (def.ads.spread - 1) * this.ads : 1;
    return def.pelletSpread * k;
  }

  tick(dt, input) {
    this.time += dt;
    const inv = this.inv;
    const p = this.g.player;

    let target = null;
    for (let i = 1; i <= 5; i++) {
      if (input.consume('slot' + i)) {
        const k = SLOT_KEYS[i - 1];
        if (inv.slots[k]) target = k;
      }
    }
    if (input.consume('lastWeapon') && inv.slots[inv.last]) target = inv.last;
    const wheel = input.takeWheel();
    if (wheel) target = inv.cycle(wheel > 0 ? 1 : -1);
    if (target && target !== inv.current && this.throwTimer <= 0 && p.alive) this.equip(target);

    if (this.throwTimer > 0) {
      this.throwTimer -= dt;
      if (this.throwTimer <= 0) this.equip(inv.slots[inv.last] ? inv.last : inv.bestSlot(), true);
    }
    if (!p.alive || !inv.active) return;
    const w = inv.active;
    const def = w.def;
    this.drawTimer = Math.max(0, this.drawTimer - dt);

    if (input.consume('inspect') && this.drawTimer <= 0 && !this.reloading) this.g.viewmodel.inspect();

    // im Duell ist in der Kaufzeit Feuerpause
    const blocked = this.g.match.fireBlocked;
    if (def.grenade) {
      if (!blocked) this._tickGrenade(dt, input, w);
    } else if (def.slot === 'knife') {
      if (!blocked) this._tickKnife(input);
    } else {
      this._tickGun(dt, input, w, blocked);
    }

    p.maxSpeed = def.ads ? def.speed * (1 + (def.ads.speed - 1) * this.ads) : def.speed;

    if (def.spread) this.fireInacc *= Math.exp(-dt / def.spread.recovery);
    const interval = def.rpm ? 60 / def.rpm : 0.4;
    if (this.time - this.lastShot > interval * 1.3) {
      const k = Math.exp(-dt * 9);
      this.recoil.pitch *= k;
      this.recoil.yaw *= k;
      this.recoilIndex = Math.max(0, this.recoilIndex - dt * (def.recoil?.decay ?? 10));
    }
    const kk = Math.exp(-dt * 14);
    this.kick.pitch *= kk;
    this.kick.yaw *= kk;
    this.spread = this.currentSpread(def) + (def.pellets ? this.pelletCone(def) : 0);
  }

  // ---------- Schusswaffen ----------
  _tickGun(dt, input, w, blocked = false) {
    const def = w.def;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (def.shellReload) {
        if (this.reloadTimer <= 0) {
          if (w.mag < def.mag && w.reserve > 0) {
            w.mag++;
            w.reserve--;
            this.g.audio.play('shellIn');
            this.g.viewmodel.shellIn();
            this.g.hud.onAmmo();
          }
          if (w.mag >= def.mag || w.reserve <= 0) this._endShellReload(true);
          else this.reloadTimer = def.reload;
        }
        // Wie in CS: ein Schuss bricht das Nachladen ab
        if (this.reloading && input.firePressed && w.mag > 0) this._endShellReload(false);
      } else if (this.reloadTimer <= 0) {
        const take = Math.min(def.mag - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = false;
        this.g.hud.onAmmo();
      }
    }
    if (input.consume('reload')) this.startReload(w);
    if (def.ads) this._tickAds(dt, input);
    const wants = !blocked && (def.auto ? input.fire : input.firePressed);
    if (wants && this.drawTimer <= 0 && !this.reloading && this.time >= this.nextFire) {
      if (w.mag > 0) {
        this._shoot(w);
      } else {
        if (input.firePressed) this.g.audio.play('dry');
        this.nextFire = this.time + 0.2;
        this.startReload(w);
      }
    } else if (w.mag === 0 && w.reserve > 0 && !this.reloading && this.time >= this.nextFire && !input.fire) {
      this.startReload(w);
    }
  }

  // Rechte Maustaste: halten (Standard) oder umschalten. Beim Nachladen, Ziehen und
  // Repetieren des Scharfschützengewehrs geht es nicht.
  _tickAds(dt, input) {
    const def = this.def;
    let want;
    if (this.g.settings.adsToggle) {
      if (input.altPressed) this.adsToggled = !this.adsToggled;
      want = this.adsToggled;
    } else {
      want = input.alt;
    }
    if (this.reloading || this.drawTimer > 0) {
      want = false;
      this.adsToggled = false;
    }
    if (this.time < this.adsBlockUntil) want = false;
    const wasScoped = this.scoped;
    const step = dt / def.ads.time;
    this.ads = want ? Math.min(1, this.ads + step) : Math.max(0, this.ads - step);
    if (def.scope && !wasScoped && this.scoped) this.g.audio.play('scope');
  }

  startReload(w) {
    const def = w.def;
    if (this.reloading || !def.mag || w.mag >= def.mag || w.reserve <= 0 || this.drawTimer > 0) return;
    this.reloading = true;
    const a = this.g.audio;
    if (def.shellReload) {
      this.reloadTimer = def.reloadStart;
      this.g.viewmodel.shellReload(true);
      return;
    }
    this.reloadTimer = def.reload;
    this.g.viewmodel.reload(def, def.reload);
    a.play('magOut', { delay: def.reload * 0.18 });
    a.play('magIn', { delay: def.reload * 0.58 });
    a.play('rack', { delay: def.reload * 0.8 });
  }

  _endShellReload(pump) {
    this.reloading = false;
    this.g.viewmodel.shellReload(false);
    if (pump) {
      this.g.viewmodel.pump(0.1);
      this.g.audio.play('pump', { delay: 0.12 });
    }
  }

  _shoot(w) {
    const def = w.def;
    const p = this.g.player;
    this.g.match.onAttack?.();
    w.mag--;
    const interval = 60 / def.rpm;
    this.nextFire = (this.time - this.nextFire < 0.03 ? this.nextFire : this.time) + interval;
    this.lastShot = this.time;
    this.shotCounter++;

    // Rückstoß vor dem Schuss (der erste Schuss sitzt genau)
    const rc = def.recoil;
    const idx = Math.floor(this.recoilIndex);
    if (idx >= 1) {
      let up, side;
      if (rc.pattern && idx < rc.pattern.length) {
        [up, side] = rc.pattern[idx];
      } else {
        up = rc.up * (0.85 + Math.random() * 0.3);
        side = (Math.random() * 2 - 1) * rc.side;
      }
      this.recoil.pitch += up;
      this.recoil.yaw -= side;
    }
    this.recoilIndex += 1;

    const spread = this.currentSpread(def) / 1000;
    p.eyePosition(_eye);
    const pitch = p.pitch + this.recoil.pitch * DEG;
    const yaw = p.yaw + this.recoil.yaw * DEG;
    dirFromAngles(_dir, pitch, yaw);
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _up.crossVectors(_right, _dir);
    const a = Math.random() * Math.PI * 2;
    const r = spread * Math.random();
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

    if (!rc.pattern && idx === 0) {
      // Pistolen und Schrot: Rückstoß wirkt auf den nächsten Schuss
      this.recoil.pitch += rc.up * (0.85 + Math.random() * 0.3);
      this.recoil.yaw -= (Math.random() * 2 - 1) * rc.side;
    }
    const kickScale = 1 - 0.35 * this.ads;
    this.kick.pitch += rc.viewKick * (0.8 + Math.random() * 0.4) * kickScale;
    this.kick.yaw += (Math.random() - 0.5) * rc.viewKick * 0.4 * kickScale;
    this.fireInacc += def.spread.fire;

    this.g.viewmodel.fire(def);
    this.g.audio.shot(def.sound);
    this.g.viewmodel.muzzleWorld(_muzzle, _eye);
    this.g.effects.muzzleFlash(_muzzle);
    // Endpunkte für das Spiel des Gegners (Leuchtspur, Einschläge)
    const ends = [];
    let tracer = false;
    if (def.pellets) {
      this._firePellets(_eye, _dir, def, ends);
    } else {
      const end = this._trace(_eye, _dir, def, ends);
      tracer = !!def.tracer && this.shotCounter % def.tracer === 0;
      if (tracer) this.g.effects.tracer(_muzzle, end);
    }
    this.g.match.shotFx?.(def, _muzzle, ends, tracer);
    this.g.match.onShot();
    this.g.hud.onAmmo();
    if (w.mag === 0) this.g.viewmodel.onMagEmpty();

    if (def.scope) {
      // Zoom geht raus, nach dem Repetieren wieder rein, solange die Taste gehalten wird
      this.ads = 0;
      this.adsBlockUntil = this.nextFire;
      this.g.viewmodel.bolt();
      this.g.audio.play('bolt', { delay: 0.3 });
    }
    if (def.anim === 'shotgun') {
      this.g.viewmodel.pump(0.14);
      this.g.audio.play('pump', { delay: 0.3 });
    }
  }

  /** Nächster Treffer auf einem Klappziel oder dem Gegner (vor der Wand in maxDist) */
  _hitscan(eye, dir, maxDist) {
    const t = this.g.targets.raycast(eye, dir, maxDist);
    const r = this.g.remote.raycast(eye, dir, t ? t.distance : maxDist);
    return r || t;
  }

  /** Schaden eines Treffers vor Weste und Helm: Zone und Entfernung */
  _rawDamage(def, hit, base = def.damage) {
    const zone = hit.zone === 'head' ? def.headMul : hit.zone === 'legs' ? DUEL.legMul : 1;
    return base * zone * Math.pow(def.rangeMod, hit.distance / 10);
  }

  _trace(eye, dir, def, ends) {
    const world = this.g.physics.raycast(eye, dir, MAX_RANGE);
    const worldDist = world ? world.distance : MAX_RANGE;
    const hit = this._hitscan(eye, dir, worldDist);
    if (hit) {
      if (hit.remote) this._hitRemote(hit, def, this._rawDamage(def, hit));
      else if (hit.zone) this._damageTarget(hit, def, this._rawDamage(def, hit));
      else {
        this.g.effects.impact(hit.point, hit.normal, 'metal');
        this.g.audio.play('impact', { position: hit.point, surface: 'metal' });
      }
      ends.push(shotEnd(hit.point));
      return _end.copy(hit.point);
    }
    _end.copy(eye).addScaledVector(dir, worldDist);
    if (world) {
      this.g.effects.impact(_end, world.normal, world.surface);
      this.g.audio.play('impact', { position: _end, surface: world.surface, volume: 0.8 });
    }
    ends.push(shotEnd(_end, world?.surface, world?.normal));
    return _end;
  }

  // Schrot: jede Kugel einzeln verfolgen, Schaden pro Ziel zusammenzählen (ein Treffer, ein Klang)
  _firePellets(eye, aim, def, ends) {
    const cone = this.pelletCone(def) / 1000;
    _right.set(aim.z, 0, -aim.x).normalize();
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _up.crossVectors(_right, aim).normalize();
    const hits = new Map();
    // am Gegner pro Zone zusammenzählen, weil Weste und Helm je Zone anders schützen
    const remote = { head: 0, body: 0, legs: 0 };
    const shielded = this.g.remote.protected;
    let remotePoint = null;
    let firstImpact = null;
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = cone * Math.sqrt(Math.random());
      _pdir.copy(aim).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      const world = this.g.physics.raycast(eye, _pdir, MAX_RANGE);
      const worldDist = world ? world.distance : MAX_RANGE;
      const hit = this._hitscan(eye, _pdir, worldDist);
      if (hit?.remote) {
        remote[hit.zone] += this._rawDamage(def, hit);
        remotePoint ||= hit.point.clone();
        if (!shielded) this.g.effects.bloodHit(hit.point, hit.normal, hit.zone === 'head');
        ends.push(shotEnd(hit.point));
      } else if (hit) {
        const head = hit.zone === 'head';
        this.g.effects.targetHit(hit.point, hit.normal, head);
        ends.push(shotEnd(hit.point));
        if (!hit.zone) continue;
        let h = hits.get(hit.target);
        if (!h) {
          h = { target: hit.target, damage: 0, head: false, point: hit.point.clone() };
          hits.set(hit.target, h);
        }
        h.damage += this._rawDamage(def, hit);
        if (head) h.head = true;
      } else if (world) {
        const point = eye.clone().addScaledVector(_pdir, worldDist);
        this.g.effects.impact(point, world.normal, world.surface);
        ends.push(shotEnd(point, world.surface, world.normal));
        if (!firstImpact) firstImpact = { point, surface: world.surface };
      }
    }
    if (firstImpact) this.g.audio.play('impact', { position: firstImpact.point, surface: firstImpact.surface });
    for (const h of hits.values()) {
      const res = this.g.targets.damage(h.target, Math.round(h.damage));
      this.g.audio.play(h.head ? 'dingHead' : 'ding', { position: h.point });
      this.g.hud.hitmarker(h.head, res.killed);
      this.g.hud.damageNumber(h.point, res.damage, h.head);
      this.g.match.onHit(res.damage, h.head);
      if (res.killed) this.g.match.onKill(def, h.head);
    }
    if (remotePoint) {
      const head = remote.head > 0;
      if (shielded) {
        this.g.audio.play('shield');
        this.g.hud.hitmarker(false, false, true);
      } else {
        this.g.audio.play(head ? 'hitHead' : 'hitBody');
        this.g.hud.hitmarker(head, false);
      }
      this.g.match.onHit(0, head);
      for (const zone of ['head', 'body', 'legs']) {
        if (remote[zone] > 0) this.g.match.sendHit?.(remote[zone], zone, def, remotePoint);
      }
    }
  }

  // Treffer am Gegner: sofort Rückmeldung, den Schaden rechnet sein Spiel aus.
  // Hat er Spawn-Schutz, gibt es eine blaue Markierung statt Blut (sein Spiel ignoriert den Treffer).
  _hitRemote(hit, def, raw) {
    const head = hit.zone === 'head';
    if (this.g.remote.protected) {
      this.g.audio.play('shield');
      this.g.hud.hitmarker(false, false, true);
    } else {
      this.g.effects.bloodHit(hit.point, hit.normal, head);
      this.g.audio.play(head ? 'hitHead' : 'hitBody');
      this.g.hud.hitmarker(head, false);
    }
    this.g.match.onHit(0, head);
    this.g.match.sendHit?.(raw, hit.zone, def, hit.point);
  }

  _damageTarget(hit, def, raw) {
    const head = hit.zone === 'head';
    const res = this.g.targets.damage(hit.target, Math.round(raw));
    this.g.effects.targetHit(hit.point, hit.normal, head);
    this.g.audio.play(head ? 'dingHead' : 'ding', { position: hit.point });
    this.g.hud.hitmarker(head, res.killed);
    this.g.hud.damageNumber(hit.point, res.damage, head);
    this.g.match.onHit(res.damage, head);
    if (res.killed) this.g.match.onKill(def, head);
  }

  // ---------- Messer ----------
  _tickKnife(input) {
    const def = this.def;
    if (this.pendingKnife && this.time >= this.pendingKnife.at) {
      this._knifeHit(this.pendingKnife.attack);
      this.pendingKnife = null;
    }
    if (this.drawTimer > 0 || this.time < this.nextFire) return;
    let attack = null, kind = null;
    if (input.alt) { attack = def.stab; kind = 'stab'; }
    else if (input.fire) { attack = def.slash; kind = 'slash'; }
    if (!attack) return;
    this.nextFire = this.time + attack.rate;
    this.pendingKnife = { at: this.time + (kind === 'stab' ? 0.16 : 0.08), attack };
    this.g.viewmodel.knife(kind);
    this.g.audio.play('swing');
    this.g.match.swingFx?.();
    this.g.match.onAttack?.();
    this.g.match.onShot();
  }

  _knifeHit(attack) {
    const p = this.g.player;
    p.eyePosition(_eye);
    let best = null;
    for (const off of [0, -4, 4, -8, 8]) {
      dirFromAngles(_dir, p.pitch, p.yaw + off * DEG);
      const world = this.g.physics.raycast(_eye, _dir, attack.range);
      const limit = world ? world.distance : attack.range;
      const t = this._hitscan(_eye, _dir, limit);
      if (t && t.zone) { best = { t }; break; }
      if (!best && world) best = { world, point: _eye.clone().addScaledVector(_dir, world.distance) };
    }
    if (!best) return;
    if (best.t?.remote) {
      // Messer: fester Schaden, egal wo (zwei Treffer reichen)
      this._hitRemote(best.t, this.def, attack.damage);
      this.g.audio.play('knifeHit', { position: best.t.point });
    } else if (best.t) {
      const def = this.def;
      this._damageTarget(best.t, def, attack.damage);
      this.g.audio.play('knifeHit', { position: best.t.point });
    } else {
      this.g.effects.knifeSpark(best.point, best.world.normal);
      this.g.audio.play('impact', { position: best.point, surface: best.world.surface });
    }
  }

  // ---------- Granaten ----------
  _tickGrenade(dt, input, w) {
    if (this.throwTimer > 0 || this.drawTimer > 0) return;
    if (!this.grenade) {
      if (input.firePressed || input.altPressed) {
        this.grenade = { t: 0, lob: !input.fire, both: input.fire && input.alt };
        this.g.viewmodel.grenadePull();
        this.g.audio.play('pin');
      }
      return;
    }
    const gr = this.grenade;
    gr.t += dt;
    if (input.fire && input.alt) gr.both = true;
    if (!input.fire && !input.alt && gr.t >= 0.35) {
      this._throw(w, gr.both ? 'medium' : gr.lob ? 'lob' : 'full');
    }
  }

  _throw(w, mode) {
    const p = this.g.player;
    p.eyePosition(_eye);
    let pitchDeg = p.pitch / DEG;
    pitchDeg += (10 * (90 - Math.abs(pitchDeg))) / 90;
    dirFromAngles(_dir, pitchDeg * DEG, p.yaw);
    const speed = mode === 'full' ? GRENADES.throwSpeed : mode === 'lob' ? GRENADES.lobSpeed : (GRENADES.throwSpeed + GRENADES.lobSpeed) / 2;
    _vel.copy(_dir).multiplyScalar(speed).add(p.vel);
    if (mode === 'lob') _vel.y += 1.5;
    const wall = this.g.physics.raycast(_eye, _dir, 0.4);
    const start = _eye.clone().addScaledVector(_dir, wall ? Math.max(0, wall.distance - 0.12) : 0.35);
    start.y -= mode === 'lob' ? 0.35 : 0.05;
    const id = this.g.grenades.throw(w.def.grenade, start, _vel);
    this.g.match.nadeFx?.(id, w.def.grenade, start, _vel);
    this.g.match.onAttack?.();
    this.g.viewmodel.grenadeThrow();
    this.g.audio.play('throw');
    this.inv.remove(this.inv.current);
    this.grenade = null;
    this.throwTimer = 0.4;
    this.g.match.onGrenade();
    this.g.hud.onWeaponChange();
  }
}
