import * as THREE from 'three';
import { KILLERS, KNIFE_SKINS, MOVE, TEAM_KNIFE, WEAPONS, WEAPON_IDS } from '../config.js';
import { FLAG, RemotePlayer, sampleSnaps } from './remote.js';

// Nach dem eigenen Tod, bis zum Wiedereinstieg (oder bis zur nächsten Runde):
// 1. Der Blick sinkt zu Boden und dreht sich zum Schützen.
// 2. Kill-Cam: die letzten Sekunden noch einmal durch die Augen des Schützen, mit seiner Waffe in
//    der Hand, seinen Schüssen und der eigenen Figur so, wie er sie gesehen hat.
// 3. Live zuschauen: im 1 gegen 1 der Gegner, im Team-Spiel die Mitspieler (sind keine mehr
//    übrig, der Schütze).
// Springen oder ein Klick (auf dem Handy der Feuer- oder Sprungknopf) wechselt zwischen Kill-Cam
// und Zuschauen, im Team-Spiel auch zum nächsten Mitspieler.
// Nach dem letzten Leben im Team-Spiel läuft die Kill-Cam nur 2 Sekunden und ist danach weg: man
// schaut dann nur noch den Mitspielern zu (Springen oder Klick wechselt reihum zwischen ihnen).

const DEATH_TIME = 0.75;
// Ausschnitt der Kill-Cam: so viele Sekunden vor dem Abschuss bis so viele danach (man sieht sich fallen)
const BEFORE = 2.0;
const AFTER = 0.9;
// nach dem letzten Leben im Team-Spiel: so lange läuft die Kill-Cam (endet wie sonst kurz nach dem Abschuss)
const LAST_REPLAY = 2.0;
// so lange (ms) werden die eigenen Zustände und die Schüsse der anderen gemerkt
const KEEP = 6000;
const DEG = Math.PI / 180;
// Oberflächen in den Schussmeldungen (wie in duel.js)
const SURFACES = ['', 'stone', 'sand', 'metal', 'wood'];
const NO_MOUSE = { x: 0, y: 0 };

const _to = new THREE.Vector3();
const _m = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _body = new THREE.Vector3();
const _size = new THREE.Vector2();

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Figur kann man gerade ansehen (aktiv, verbunden, lebt) */
const watchable = (r) => !!r && r.active && !r.hidden && r.shown && !r.dead;

export class KillCam {
  constructor(game) {
    this.g = game;
    // eigene Zustände, so wie sie an die anderen gingen (Ortszeit in ms)
    this.self = [];
    // Schüsse, Messerhiebe und Würfe der anderen mit der Absenderzeit (seine Uhr) und seiner Kennung
    this.events = [];
    // eigene Figur für die Kill-Cam (wird beim ersten Mal gebaut)
    this.ghost = null;
    this.active = false;
    // gewählte Ansicht ('death', 'replay', 'live') und die gerade gezeigte
    this.view = null;
    this.shown = null;
    this.deathT = 0;
    // killer: Figur des Schützen, watch: wem man live zuschaut, eyes: durch wessen Augen man gerade sieht
    this.killer = null;
    this.killerKey = null;
    this.watch = null;
    this.eyes = null;
    this.s = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, duck: 0, f: 0, w: -1, t: 0 };
    this.lastPos = new THREE.Vector3();
    // was die Waffe in der Hand vom Spieler wissen will (Wippen beim Laufen, Sprinten …)
    this.proxy = { horizontalSpeed: 0, onGround: true, sprinting: false, busy: false, vel: { y: 0 }, landImpact: 0, duckAmount: 0 };
    this.vmId = null;
    this.vmFor = null;
    this.saved = null;
    this.ads = 0;
    this.flags = 0;
    this.scoped = false;
    // letztes Leben im Team-Spiel: Kill-Cam nur einmal kurz, danach nur noch Mitspieler
    this.last = false;
  }

  /** man sieht durch die Augen eines anderen (Kill-Cam oder Zuschauen) */
  get firstPerson() {
    return this.active && (this.shown === 'replay' || this.shown === 'live');
  }

  /** man schaut gerade live durch die Augen von r */
  watching(r) {
    return this.shown === 'live' && this.eyes === r;
  }

  /** neue Partie: alles vergessen */
  reset() {
    this.stop();
    this.self.length = 0;
    this.events.length = 0;
  }

  /** eigener Zustand, so wie er gerade an die anderen geht (aus Duel._sendState) */
  noteSelf(msg) {
    const list = this.self;
    const last = list[list.length - 1];
    if (last && msg.k <= last.t) return;
    list.push({
      t: msg.k, pos: new THREE.Vector3(msg.p[0] / 100, msg.p[1] / 100, msg.p[2] / 100),
      yaw: msg.y / 1000, pitch: msg.a / 1000, duck: msg.d / 100, f: msg.f, w: msg.w,
    });
    while (list[0].t < msg.k - KEEP) list.shift();
  }

  /** Ereignis eines anderen (from); k = Absenderzeit des Zustands, in dem es kam */
  noteEvent(k, ev, from) {
    if (ev.t !== 'f' && ev.t !== 'k' && ev.t !== 'n') return;
    const list = this.events;
    list.push({ k, ev, from });
    // nach Zeit sortiert pro Absender; alte Einträge (jeder Absender hat seine eigene Uhr) fliegen
    // spätestens raus, wenn es zu viele werden
    while (list.length > 400 || (list[0].from === from && list[0].k < k - KEEP)) list.shift();
  }

  /**
   * eigener Tod: by = wer einen erwischt hat (Rolle bzw. Kennung), w = Waffe (Id),
   * last = letztes Leben im Team-Spiel (Kill-Cam nur kurz, danach nur noch Mitspieler)
   */
  start(by, w, last = false) {
    const g = this.g;
    const m = g.match;
    const r = m.remoteOf?.(by) ?? null;
    this.stop();
    this.active = true;
    this.view = 'death';
    this.deathT = 0;
    this.killer = r;
    this.killerKey = by;
    this.watch = null;
    this.last = last;
    this.label = weaponLabel(w, m.teamOf ? m.teamOf(by) : by);
    const h = r?.history;
    // Kill-Cam nur, wenn ein anderer einen erwischt hat und genug von ihm aufgezeichnet ist
    this.canReplay = !!r && w !== 'bombe' && r.clockOff !== null && h.length > 5;
    if (!this.canReplay) return;
    const kill = performance.now() + r.clockOff;
    this.r1 = kill + AFTER * 1000;
    this.r0 = Math.max(h[0].t, this.r1 - (last ? LAST_REPLAY : BEFORE + AFTER) * 1000);
    this.offset = r.clockOff;
    // so viel später hat der Schütze einen gesehen: Weg hin und zurück plus sein Puffer gegen
    // Ruckeln (die KI im eigenen Browser sieht einen sofort)
    const net = m.net;
    this.lag = net.bot || r.local ? 0 : (net.pingOf?.(r.peer) || net.ping || 80) + r.delay;
  }

  /** Wiedereinstieg, neue Runde, Ende: wieder mit eigenen Augen und eigener Waffe */
  stop() {
    if (!this.active) return;
    const g = this.g;
    this.active = false;
    this.view = this.shown = null;
    this.scoped = false;
    this.eyes = this.watch = this.killer = null;
    for (const r of g.others) r.firstPerson = false;
    g.remote.firstPerson = false;
    if (this.ghost) this.ghost.root.visible = false;
    if (this.saved) {
      const vm = g.viewmodel;
      vm.knifeSkin = this.saved.skin;
      vm.looks = this.saved.looks;
      this.saved = null;
      const own = g.weapons.inv.active;
      if (own) vm.equip(own.def);
    }
    this.vmId = null;
    this.vmFor = null;
    g.hud.spectate(null);
  }

  /** Springen oder Klick: Ansicht wechseln (pro Bild, vor der Simulation) */
  handleInput(input) {
    if (!this.active) return;
    const press = input.consume('jump') || input.firePressed;
    if (!press || this.deathT < DEATH_TIME) return;
    input.firePressed = false;
    this.toggle();
  }

  toggle() {
    if (!this.active || this.deathT < DEATH_TIME) return;
    if (this.view === 'replay') {
      this._endReplay();
      return;
    }
    // Team-Spiel: der Reihe nach allen lebenden Mitspielern zuschauen, danach die Kill-Cam
    // (nach dem letzten Leben gibt es keine mehr: dann wieder beim ersten Mitspieler weiter)
    if (this.view === 'live' && this.g.match.teamMode) {
      const list = this._candidates();
      const i = list.indexOf(this.watch);
      if (i >= 0 && i < list.length - 1) {
        this.watch = list[i + 1];
        return;
      }
      if (this.last && list.length) {
        this.watch = list[0];
        return;
      }
    }
    if (this.canReplay) this._beginReplay();
    else if (this.view === 'live') this.view = 'death';
    else {
      this.view = 'live';
      this.watch = null;
    }
  }

  // wem man zuschauen kann: im Team-Spiel die lebenden Mitspieler, sonst der Schütze oder irgendwer
  _candidates() {
    const g = this.g;
    const m = g.match;
    if (!m.teamMode) return watchable(g.remote) ? [g.remote] : [];
    const mates = g.others.filter((r) => r.team === m.myTeam && watchable(r));
    if (mates.length) return mates;
    if (watchable(this.killer)) return [this.killer];
    return g.others.filter(watchable);
  }

  /** wem man live zuschaut (bleibt, solange er lebt) */
  _watchTarget() {
    if (watchable(this.watch) && this._candidates().includes(this.watch)) return this.watch;
    this.watch = this._candidates()[0] || null;
    return this.watch;
  }

  _beginReplay() {
    const g = this.g;
    this.view = 'replay';
    this.rt = this.r0;
    // nur die Ereignisse des Schützen (jeder Absender hat seine eigene Uhr)
    this.replay = this.events.filter((e) => e.from === this.killerKey && e.k >= this.r0);
    this.evIdx = 0;
    // eigene Figur mit den eigenen Zuständen
    this.ghost ||= new RemotePlayer(g, { ghost: true });
    const gh = this.ghost;
    gh.setActive(true, g.match.myTeam);
    gh.setLooks(g.looks);
    gh.snaps = this.self.slice();
    gh.clockOff = 0;
    this.flags = 0;
    this.ads = 0;
  }

  get canWatch() {
    return this._candidates().length > 0;
  }

  /** Zeit läuft (nur während die Welt läuft) */
  update(dt) {
    if (!this.active) return;
    this.deathT += dt;
    if (this.view === 'death' && this.deathT >= DEATH_TIME && this.deathT - dt < DEATH_TIME) {
      if (this.canReplay) this._beginReplay();
      else this.view = 'live';
    }
    if (this.view === 'replay') {
      this.rt += dt * 1000;
      if (this.rt >= this.r1) this._endReplay();
    }
  }

  // Kill-Cam vorbei (abgelaufen oder weggeschaltet): live zuschauen; nach dem letzten Leben im
  // Team-Spiel ist sie damit weg
  _endReplay() {
    this.view = 'live';
    this.watch = null;
    if (this.last) this.canReplay = false;
  }

  /**
   * Kamera, solange man tot ist (auch ohne Kill-Cam, z. B. nach dem Neuladen).
   * eye: eigene Augenposition (für den Blick zu Boden)
   */
  camera(dt, eye) {
    const g = this.g;
    let view = this.active ? this.view : 'death';
    let r = null;
    if (view === 'live') {
      r = this._watchTarget();
      if (!r) view = 'death';
    }
    if (view === 'replay') {
      r = this.killer;
      if (!r || !sampleSnaps(r.history, this.rt, this.s)) view = 'death';
    }
    this.shown = view;
    const fp = view === 'replay' || view === 'live';
    this.eyes = fp ? r : null;
    for (const o of g.others) o.firstPerson = fp && o === r;
    if (view === 'replay') {
      // eigene Figur zu der Zeit, als der Schütze sie so gesehen hat
      this.ghost.update(dt, this.rt - this.offset - this.lag);
      this._replayEvents();
    } else if (this.ghost) {
      this.ghost.root.visible = false;
    }
    if (!fp) {
      this.scoped = false;
      this._deathView(dt, eye);
    } else {
      if (view === 'live') copyState(r.state, this.s);
      this._eyes(dt);
    }
    this._hud(view);
  }

  // durch die Augen eines anderen: Position, Blick, Zielen (Zoom), Zielfernrohr
  _eyes(dt) {
    const g = this.g;
    const cam = g.camera;
    const s = this.s;
    const id = s.w >= 0 ? WEAPON_IDS[s.w] : null;
    const def = id ? WEAPONS[id] : null;
    const f = s.f;
    const rose = f & ~this.flags;
    const fell = this.flags & ~f;
    this.flags = f;
    const vm = g.viewmodel;
    if (def && this.vmId === id && def.mag) {
      if (rose & FLAG.RELOAD) {
        if (def.shellReload) vm.shellReload(true);
        else vm.reload(def, def.reload);
      }
      if (def.shellReload && fell & FLAG.RELOAD) {
        vm.shellReload(false);
        vm.pump(0.1);
      }
    }
    const adsTime = def?.ads?.time ?? 0.2;
    const aiming = !!def?.ads && (f & FLAG.ADS) !== 0;
    this.ads = aiming ? Math.min(1, this.ads + dt / adsTime) : Math.max(0, this.ads - dt / adsTime);
    this.scoped = !!def?.scope && this.ads >= 0.98;

    const eyeH = MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * s.duck;
    cam.position.set(s.pos.x, s.pos.y + eyeH, s.pos.z);
    cam.rotation.set(s.pitch, s.yaw, 0);
    let fov = g.settings.fov;
    if (def?.ads && this.ads > 0) {
      const zoomed = (2 * Math.atan(Math.tan((fov * DEG) / 2) / def.ads.zoom)) / DEG;
      fov += (zoomed - fov) * smooth(this.ads);
    }
    this._fov(fov);
    cam.updateMatrixWorld();
    g.viewCamera.quaternion.copy(cam.quaternion);
    g.viewCamera.updateMatrixWorld();
  }

  // eigene Sicht nach dem Tod: Blick sinkt zu Boden und dreht sich zum Schützen (wie in CS)
  _deathView(dt, eye) {
    const g = this.g;
    const cam = g.camera;
    const p = g.player;
    if (!this.active) this.deathT += dt;
    const k = smooth(this.deathT / 0.9);
    eye.y -= (p.eyeHeight - 0.45) * k;
    let yaw = p.yaw, pitch = p.pitch;
    const r = this.killer || (g.match.teamMode ? null : g.remote);
    if (r?.shown && !r.hidden) {
      r.headPosition(_to).sub(eye);
      const targetYaw = Math.atan2(-_to.x, -_to.z);
      const targetPitch = Math.atan2(_to.y, Math.hypot(_to.x, _to.z));
      yaw += Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw)) * k;
      pitch += (targetPitch - pitch) * k;
    }
    cam.position.copy(eye);
    cam.rotation.set(pitch, yaw, 0.2 * k);
    this._fov(g.settings.fov);
    cam.updateMatrixWorld();
    g.viewCamera.quaternion.copy(cam.quaternion);
    g.viewCamera.updateMatrixWorld();
  }

  /** nach dem Leben: eigene Uhr für die Sicht nach unten wieder von vorne */
  resetDeathView() {
    if (!this.active) this.deathT = 0;
  }

  _fov(fov) {
    const g = this.g;
    const cam = g.camera;
    if (Math.abs(cam.fov - fov) < 0.01) return;
    cam.fov = fov;
    cam.updateProjectionMatrix();
    g.effects.setViewport(g.renderer.renderer.getDrawingBufferSize(_size).y, fov);
  }

  /** Waffe des anderen in der eigenen Hand zeigen (pro Bild, statt der eigenen) */
  drawViewmodel(dt) {
    const g = this.g;
    const s = this.s;
    this._equip(s.w);
    if (!this.vmId) return;
    const p = this.proxy;
    const moved = Math.hypot(s.pos.x - this.lastPos.x, s.pos.z - this.lastPos.z);
    this.lastPos.copy(s.pos);
    const spd = dt > 0 && moved < 1 ? moved / dt : 0;
    p.horizontalSpeed += (spd - p.horizontalSpeed) * Math.min(1, dt * 10);
    p.onGround = (s.f & FLAG.GROUND) !== 0;
    p.sprinting = (s.f & FLAG.SPRINT) !== 0;
    p.busy = (s.f & FLAG.BUSY) !== 0;
    p.duckAmount = s.duck;
    g.viewmodel.update(dt, p, NO_MOUSE, false, this.ads, null);
  }

  _equip(w) {
    const id = w >= 0 ? WEAPON_IDS[w] : null;
    const r = this.eyes;
    if (!id || !r || (id === this.vmId && r === this.vmFor)) return;
    const g = this.g;
    const vm = g.viewmodel;
    // eigenes Messer und eigene Skins merken, dann die des anderen (sein Team, seine Skins)
    this.saved ||= { skin: vm.knifeSkin, looks: vm.looks };
    vm.knifeSkin = TEAM_KNIFE[r.team];
    vm.looks = r.looks;
    vm.equip(WEAPONS[id]);
    this.vmId = id;
    this.vmFor = r;
    this.flags &= ~FLAG.RELOAD;
  }

  // Ereignisse des Schützen in der Wiederholung bis zur aktuellen Zeit abspielen
  _replayEvents() {
    const list = this.replay;
    while (this.evIdx < list.length && list[this.evIdx].k <= this.rt) this._event(list[this.evIdx++].ev, true);
  }

  /** Schuss, Messerhieb oder Wurf von r, während man live durch seine Augen schaut */
  liveEvent(ev, r) {
    if (this.watching(r)) this._event(ev, false);
  }

  // Waffe in der Hand bewegen; in der Wiederholung auch Knall, Leuchtspur, Einschläge und
  // Treffer an der eigenen Figur (live kommt das schon vom Spiel)
  _event(ev, replay) {
    const g = this.g;
    const vm = g.viewmodel;
    if (ev.t === 'k') {
      if (this.vmId === 'messer') vm.knife('slash');
      if (replay) g.audio.play('swing');
      return;
    }
    if (ev.t === 'n') {
      if (WEAPONS[this.vmId]?.grenade) vm.grenadeThrow();
      if (replay) g.audio.play('throw');
      return;
    }
    const def = WEAPONS[ev.w];
    if (!def) return;
    this._equip(WEAPON_IDS.indexOf(ev.w));
    vm.fire(def);
    if (def.scope) vm.bolt();
    if (def.anim === 'shotgun') vm.pump(0.14);
    if (!replay) return;
    g.audio.shot(def.sound);
    if (def.scope) g.audio.play('bolt', { delay: 0.3 });
    if (def.anim === 'shotgun') g.audio.play('pump', { delay: 0.3 });
    const cam = g.camera;
    vm.muzzleWorld(_m, cam.position, cam);
    g.effects.muzzleFlash(_m);
    const gh = this.ghost;
    let hit = false, head = false, sound = true;
    for (const e of ev.e || []) {
      _p.set(e[0] / 100, e[1] / 100, e[2] / 100);
      if (e.length > 3) {
        _n.set(e[4] / 100, e[5] / 100, e[6] / 100).normalize();
        const surface = SURFACES[e[3]];
        g.effects.impact(_p, _n, surface, false);
        if (sound) g.audio.play('impact', { position: _p, surface, volume: 0.8 });
        sound = false;
      } else if (gh?.shown && !gh.dead) {
        // Treffer an der eigenen Figur: Blut und Trefferzeichen wie beim Schützen
        _body.copy(gh.position);
        const up = _p.y - _body.y;
        _body.y = _p.y;
        if (_body.distanceTo(_p) < 0.9 && up > -0.2 && up < 2.1) {
          _n.subVectors(_m, _p).normalize();
          g.effects.bloodHit(_p, _n, up > 1.45);
          hit = true;
          head ||= up > 1.45;
        }
      }
      if (ev.tr) g.effects.tracer(_m, _p);
    }
    if (hit) {
      g.hud.hitmarker(head, false);
      g.audio.play(head ? 'hitHead' : 'hitBody');
    }
  }

  // Schriftzug unten: was man gerade sieht, wie man umschaltet, wann es weitergeht
  _hud(view) {
    const g = this.g;
    const m = g.match;
    if (!this.active || !m.duel) {
      g.hud.spectate(null);
      return;
    }
    const team = !!m.teamMode;
    const killer = m.name(this.killerKey);
    const key = g.input.touch ? 'Feuerknopf' : `${g.input.label('jump')} / Klick`;
    const mates = team ? this._candidates().filter((r) => r.team === m.myTeam) : [];
    let tag = '', who = '', hint = '';
    if (view === 'replay') {
      tag = 'Kill-Cam';
      who = `${killer} · ${this.label}`;
      hint = `${key}: ${team ? 'Zuschauen' : 'Gegner-Sicht'}`;
    } else if (view === 'live') {
      const r = this.eyes;
      const mate = team && r?.team === m.myTeam;
      tag = team ? (mate ? 'Mitspieler' : 'Zuschauen') : 'Gegner-Sicht';
      who = team ? r?.name ?? '' : m.names[m.them];
      if (team && mates.length > 1 && mates.indexOf(r) < mates.length - 1) hint = `${key}: nächster Mitspieler`;
      else if (this.canReplay) hint = `${key}: Kill-Cam`;
      // nach dem letzten Leben: nur noch reihum zuschauen
      else if (this.last) hint = this._candidates().length > 1 ? `${key}: ${mate ? 'nächster Mitspieler' : 'weiter'}` : '';
      else hint = `${key}: eigene Sicht`;
    } else if (this.deathT >= DEATH_TIME && this.canWatch) {
      hint = `${key}: ${this.canReplay ? 'Kill-Cam' : team ? 'Zuschauen' : 'Gegner-Sicht'}`;
    }
    let left = '';
    const lives = m.lives[m.me] ?? 0;
    if (m.phase === 'live' && m.respawnT > 0 && lives > 0) left = `Zurück in ${Math.ceil(m.respawnT)} s`;
    else if (m.phase === 'live' && lives <= 0) left = 'Keine Leben mehr in dieser Runde';
    g.hud.spectate({ view, tag, who, hint, left });
  }
}

function copyState(from, to) {
  to.pos.copy(from.pos);
  to.yaw = from.yaw;
  to.pitch = from.pitch;
  to.duck = from.duck;
  to.f = from.f;
  to.w = from.w;
  to.t = from.t;
}

/** Name der Waffe für die Kill-Cam (beim Messer das des Teams: Karambit oder Butterfly) */
function weaponLabel(w, team) {
  const def = WEAPONS[w] || KILLERS[w];
  if (def?.slot === 'knife') return KNIFE_SKINS[TEAM_KNIFE[team]]?.name ?? def.name;
  return def?.name ?? '';
}
