import * as THREE from 'three';
import { KNIFE_SKINS, MOVE, SPECIAL, TEAM_KNIFE, TICK } from '../config.js';
import { setupEnvironment } from '../world/environment.js';
import { Arena, SPAWN } from '../world/map.js';
import { BombSites } from '../world/bombsites.js';
import { Effects } from '../effects/effects.js';
import { Targets } from './targets.js';
import { Match } from './match.js';
import { Duel } from './duel.js';
import { RemotePlayer } from './remote.js';
import { Airstrikes } from './airstrike.js';
import { Player } from '../player/player.js';
import { Viewmodel } from '../weapons/viewmodel.js';
import { WeaponSystem } from '../weapons/weapons.js';
import { Grenades } from '../weapons/grenades.js';
import { Hud } from '../ui/hud.js';
import { BuyMenu } from '../ui/buymenu.js';

const DEG = Math.PI / 180;
const MAX_TICKS = 10;
const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export class Game {
  constructor({ renderer, physics, assets, input, audio, settings }) {
    this.renderer = renderer;
    this.physics = physics;
    this.assets = assets;
    this.input = input;
    this.audio = audio;
    this.settings = settings;
    this.state = 'menu';
    this.acc = 0;
    this.time = 0;
    this.shakeAmt = 0;
    this.onStateChange = null;
    this.onMatchOverCb = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.03, 500);
    this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(settings.viewmodelFov, window.innerWidth / window.innerHeight, 0.005, 10);
    this.viewCamera.rotation.order = 'YXZ';
    renderer.setup(this.scene, this.camera, this.viewScene, this.viewCamera);

    this.env = setupEnvironment(renderer.renderer, this.scene, this.viewScene, assets.sky);
    // Fülllicht für die Waffe in der Hand, fest zur Blickrichtung: Rillen, Visier und Kanten
    // bleiben erkennbar, auch wenn die Sonne von vorne kommt
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.8);
    fill.position.set(0.4, 0.9, 0.6);
    fill.target.position.set(0, 0, -1);
    this.viewCamera.add(fill, fill.target);
    this.arena = new Arena(assets, physics, this.scene);
    this.arena.build();
    this.effects = new Effects(this.scene);
    this.targets = new Targets(this.scene, assets.models.target, audio, this.effects);
    this.player = new Player(physics, audio);
    this.player.spawn(SPAWN.pos, SPAWN.yaw);
    this.viewmodel = new Viewmodel(assets, this.viewScene, this.viewCamera);
    this.viewmodel.worldCamera = this.camera;
    this.weapons = new WeaponSystem(this);
    this.grenades = new Grenades(this);
    this.bombSites = new BombSites(this.scene);
    this.airstrikes = new Airstrikes(this);
    // Training oder 1 gegen 1: match ist die gerade laufende Partie
    this.mode = 'training';
    this.training = new Match(this);
    this.match = this.training;
    this.remote = new RemotePlayer(this);
    this.onRematch = null;
    this.deathT = 0;
    this.sprintFov = 0;
    this.hud = new Hud(this);
    this.buyMenu = new BuyMenu(this);
    this.hud.setCrosshairColor(settings.crosshairColor);

    this.renderer.applyQuality(settings.quality, this.env.sun, settings.renderScale);
    this._applyTextureFilter();
    this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
    this.sunCheckT = 0;
    this.viewLight = 1;
    this.menuAngle = 0;
    this._aim = { pitch: 0, yaw: 0 };
    this._size = new THREE.Vector2();
  }

  /** Shader vorab übersetzen, damit es beim ersten Schuss nicht ruckelt */
  async warmup() {
    const r = this.renderer.renderer;
    for (const m of Object.values(this.viewmodel.models)) m.model.visible = true;
    this.effects.muzzleLight.intensity = 1;
    this.effects.boomLight.intensity = 1;
    await r.compileAsync(this.scene, this.camera);
    await r.compileAsync(this.viewScene, this.viewCamera);
    for (const m of Object.values(this.viewmodel.models)) m.model.visible = false;
  }

  applySettings() {
    const s = this.settings;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    this.hud.setCrosshairColor(s.crosshairColor);
    if (this.renderer.qualityKey !== s.quality || this.renderer.renderScale !== s.renderScale) {
      this.renderer.applyQuality(s.quality, this.env.sun, s.renderScale);
      this._applyTextureFilter();
    }
    this.onResize();
  }

  // Texturfilterung für schräg gesehene Flächen je nach Grafikstufe (vor allem der Boden)
  _applyTextureFilter() {
    const n = Math.min(this.renderer.quality.aniso, this.renderer.renderer.capabilities.getMaxAnisotropy());
    for (const set of Object.values(this.assets.textures)) {
      for (const t of [set.diff, set.nor, set.arm]) {
        if (t.anisotropy === n) continue;
        t.anisotropy = n;
        t.needsUpdate = true;
      }
    }
  }

  // Feste Schatten (niedrige Grafik): nur die Arena zählt, Bewegliches wird kurz ausgeblendet,
  // damit es nicht als Schatten an einer Stelle hängen bleibt
  _bakeShadows() {
    const hide = [];
    for (const t of this.targets.list) if (t.root.visible) hide.push(t.root);
    if (this.remote.root.visible) hide.push(this.remote.root);
    for (const gr of this.grenades.list) if (gr.mesh.visible) hide.push(gr.mesh);
    if (this.bombSites.bomb.visible) hide.push(this.bombSites.bomb);
    for (const s of this.airstrikes.list) hide.push(s.plane, ...s.bombs);
    for (const o of hide) o.visible = false;
    this.renderer.bakeShadows();
    for (const o of hide) o.visible = true;
  }

  onResize() {
    this.renderer.resize();
    this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
  }

  /** Anzeigename einer Waffe; beim Messer das eigene (Karambit oder Butterfly) */
  weaponName(def, knifeSkin = this.viewmodel.knifeSkin) {
    return def.slot === 'knife' ? KNIFE_SKINS[knifeSkin].name : def.name;
  }

  startMatch() {
    this._setMode('training');
    this.match = this.training;
    // im Training entscheidet der Zufall, welches Messer man bekommt
    this.viewmodel.knifeSkin = Math.random() < 0.5 ? 'karambit' : 'butterfly';
    this.grenades.clear();
    this.airstrikes.clear();
    this.hud.reset();
    this.match.start();
    this.hud.onMoney(0);
    this.hud.show(true);
    this.state = 'playing';
    this.acc = 0;
  }

  /**
   * 1 gegen 1 starten. opts: role ('host'/'guest'), lives, wins, myName, theirName;
   * mit resume (Stand der Partie) und saved (eigener Stand) geht es in einer laufenden Partie weiter.
   */
  startDuel(net, opts) {
    this._setMode('duel');
    this.remote.setActive(true, opts.role === 'host' ? 'guest' : 'host');
    // Team Rot (Host) hat das Karambit, Team Blau (Gast) das Butterflymesser
    this.viewmodel.knifeSkin = TEAM_KNIFE[opts.role];
    // gegen die KI hat ihr eigener Körper die Kollision, die Figur zeigt ihn nur an
    this.remote.solid = !net.bot;
    this.match = new Duel(this, net, opts);
    this.grenades.clear();
    this.airstrikes.clear();
    this.targets.clear();
    this.hud.reset();
    this.hud.show(true);
    this.state = 'playing';
    this.acc = 0;
    // ein Wiedereinstieg in eine schon beendete Partie geht direkt zur Auswertung
    if (opts.resume) this.match.resume(opts.resume, opts.saved);
    else this.match.start();
    this.hud.onMoney(0);
  }

  _setMode(mode) {
    this.mode = mode;
    if (mode !== 'duel') this.remote.setActive(false);
    // Bombenplätze zeigt nur der Bombenmodus (in jeder Runde neu)
    this.bombSites.show(null);
    this.bombSites.remove();
    this.hud.setMode(mode);
  }

  quitToMenu() {
    if (this.mode === 'duel') this.match.leave();
    this.state = 'menu';
    this.buyMenu.hide();
    this.hud.show(false);
    this.grenades.clear();
    this.airstrikes.clear();
    this.bombSites.show(null);
    this.bombSites.remove();
    this.targets.clear();
    this.match.phase = 'idle';
    this.match = this.training;
    this._setMode('training');
  }

  /** Hinweistexte passend zur Steuerung (Tastatur oder Touchscreen) */
  hint(what) {
    const touch = this.input.touch;
    if (what === 'buy') return touch ? 'tippe auf „Kaufen“' : `mit ${this.input.label('buy')} öffnest du das Kaufmenü`;
    if (what === 'use') return touch ? 'Bomben-Knopf halten' : `${this.input.label('use')} halten`;
    return '';
  }

  onMatchOver(summary) {
    this.state = 'results';
    this.buyMenu.hide();
    this.hud.show(false);
    this.onMatchOverCb?.(summary);
  }

  openBuyMenu() {
    if (this.state !== 'playing' || !this.match.canBuy) {
      if (this.state === 'playing') this.hud.message('Kaufen nicht möglich', this.match.blockReason('natter') || 'Nur im Spawn während der Kaufzeit', 1.5);
      return;
    }
    this.buyMenu.show();
    this.input.unlock();
  }

  closeBuyMenu() {
    if (!this.buyMenu.open) return;
    this.buyMenu.hide();
    if (this.state === 'playing') this.input.lock();
  }

  /** Schaden durch eine Granate (eigene oder vom Gegner) */
  damagePlayer(amount, { armorPen, from, byOpponent = false, weapon = 'he' }) {
    const p = this.player;
    if (!p.alive || this.match.immune) return 0;
    const dealt = p.applyDamage(amount, { armorPen });
    if (dealt > 0) {
      this.hud.hurt(dealt);
      this.audio.play('hurt');
      if (from) this.hud.hitFrom(from);
    }
    if (!p.alive) {
      if (this.mode === 'duel') {
        const m = this.match;
        m.onLocalDeath({ by: byOpponent ? m.them : m.me, w: weapon, head: false });
      } else {
        this.hud.message('Ausgeschaltet', weapon === 'luftschlag' ? 'Dein eigener Luftschlag war zu nah' : 'Deine eigene Granate war zu nah', 3);
        this.viewmodel.root.visible = false;
      }
    }
    return dealt;
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /**
   * Aktuelles Sichtfeld: beim Zielen (auch mit Zielfernrohr) vergrößert, beim Sprinten etwas
   * weiter. withSprint = false für die Mausempfindlichkeit (die ändert sich beim Sprinten nicht).
   */
  _targetFov(withSprint = true) {
    const ws = this.weapons;
    const def = ws.active?.def;
    const base = this.settings.fov;
    if (def?.ads && ws.ads > 0) {
      const zoomed = (2 * Math.atan(Math.tan((base * DEG) / 2) / def.ads.zoom)) / DEG;
      const e = ws.ads * ws.ads * (3 - 2 * ws.ads);
      return base + (zoomed - base) * e;
    }
    return withSprint ? base + MOVE.sprintFov * this.sprintFov : base;
  }

  /** mouse: Mausbewegung in Zählern, touch: Wischen auf dem Touchscreen in Grad */
  _look(mouse, touch) {
    const p = this.player;
    // Empfindlichkeit wie in CS; beim Zoomen im Verhältnis des Sichtfelds langsamer
    const zoom = Math.tan((this._targetFov(false) * DEG) / 2) / Math.tan((this.settings.fov * DEG) / 2);
    const k = this.settings.sensitivity * 0.022 * DEG * zoom;
    p.yaw -= mouse.x * k + touch.x * DEG * zoom;
    p.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, p.pitch - mouse.y * k - touch.y * DEG * zoom));
  }

  tick(dt) {
    this.time += dt;
    this.match.tick(dt);
    // Spiel gegen die KI: sie rechnet im selben Takt mit
    this.match.net?.tick?.(dt);
    // beim Legen, Entschärfen und Zielen für den Luftschlag steht man still
    this.player.busy = this.match.busy || this.airstrikes.targeting;
    this.player.tick(dt, this.input);
    this.weapons.tick(dt, this.input);
    this.grenades.tick(dt);
    this.airstrikes.tick(dt);
    this.targets.tick(dt, this.time);
    this.physics.step();
  }

  // Spezialleiste: X öffnet das Zielen für den Luftschlag, Linksklick bestätigt,
  // Rechtsklick oder nochmal X bricht ab
  _special(input) {
    const as = this.airstrikes;
    const m = this.match;
    if (input.consume('special')) {
      if (as.targeting) as.cancel();
      else if (!m.specialReady) {
        const pct = Math.floor((m.special / SPECIAL.charge) * 100);
        this.hud.message('Luftschlag noch nicht bereit', `Spezialleiste ${pct} % · lädt mit Treffern`, 1.6);
      } else if (!m.canUseSpecial) {
        this.hud.message('Luftschlag gerade nicht möglich', m.phase === 'live' ? '' : 'Erst wenn die Runde läuft', 1.4);
      } else {
        as.beginTargeting();
      }
    }
    if (!as.targeting) return;
    if (!m.canUseSpecial) {
      as.cancel();
      return;
    }
    if (input.firePressed) {
      input.firePressed = false;
      const point = as.confirm();
      if (point) {
        m.callAirstrike(point);
        // gehaltene Maustaste nach dem Bestätigen nicht als Schuss werten
        this.weapons.holdFire = true;
      } else {
        this.hud.message('Kein Ziel', 'Schau auf den Boden, wo die Bomben fallen sollen', 1.4);
      }
    } else if (input.altPressed) {
      input.altPressed = false;
      as.cancel();
    }
  }

  frame(dt) {
    const duel = this.mode === 'duel';
    // ein Duell übers Netz läuft in der Pause weiter (sonst hielte es auch beim Gegner an),
    // gegen die KI hält es wirklich an
    const online = duel && this.match.online;
    // hinter dem Notizblock nichts zeichnen (spart Strom und bleibt unauffällig)
    if (this.renderPaused && !online) return;
    if (window.innerWidth !== this._w || window.innerHeight !== this._h) {
      this._w = window.innerWidth;
      this._h = window.innerHeight;
      if (this._w > 0 && this._h > 0) this.onResize();
    }
    const input = this.input;
    let mouse = { x: 0, y: 0 };
    const playing = this.state === 'playing' && !this.renderPaused;
    // im Duell übers Netz läuft die Welt auch in der Pause weiter, man steht dann nur still
    const simulate = this.state === 'playing' || (online && this.state === 'paused');
    if (playing) {
      if (input.consume('buy')) {
        if (this.buyMenu.open) this.closeBuyMenu();
        else this.openBuyMenu();
      }
      this._quickChat(input);
      this._special(input);
      this.hud.showStats(input.isDown('scores'));
      mouse = input.takeMouse();
      this._look(mouse, input.takeLook());
    } else {
      input.takeMouse();
      input.takeLook();
      if (this.airstrikes.targeting) this.airstrikes.cancel();
      if (simulate) input.releaseAll();
    }
    if (simulate) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= TICK && n < MAX_TICKS) {
        this.tick(TICK);
        input.endTick();
        this.acc -= TICK;
        n++;
      }
      if (n === MAX_TICKS) this.acc = 0;
      this.buyMenu.tick();
    }
    if (duel) {
      this.remote.update(dt);
      this.match.netUpdate(dt);
    }
    if (this.renderPaused) return;
    const alpha = simulate ? this.acc / TICK : 1;
    const sprinting = simulate && this.player.sprinting;
    this.sprintFov += ((sprinting ? 1 : 0) - this.sprintFov) * Math.min(1, dt * 6);
    this._updateCamera(dt, alpha);
    this.grenades.update(dt);
    this.airstrikes.update(dt);
    this.effects.update(dt);

    const scoped = this.weapons.scoped && simulate;
    const showVm = simulate && this.player.alive && !scoped;
    if (showVm) {
      this._viewLighting(dt);
      const ws = this.weapons;
      this._aim.pitch = ws.recoil.pitch * 0.5 * DEG;
      this._aim.yaw = ws.recoil.yaw * 0.5 * DEG;
      this.viewmodel.update(dt, this.player, mouse, scoped, ws.ads, this._aim);
    }
    if (simulate) this.hud.update(dt, this.camera);
    this.player.forward(_fwd);
    this.audio.updateListener(this.camera.position, _fwd);
    if (this.renderer.needsShadowBake) this._bakeShadows();
    this.renderer.render(showVm);
  }

  _updateCamera(dt, alpha) {
    const cam = this.camera;
    if (this.state === 'menu') {
      // langsamer Rundflug über die Arena hinter dem Hauptmenü
      this.menuAngle += dt * 0.05;
      cam.position.set(Math.cos(this.menuAngle) * 24, 9, Math.sin(this.menuAngle) * 17);
      cam.lookAt(0, 1.5, 0);
      cam.fov = this.settings.fov;
      cam.updateProjectionMatrix();
      return;
    }
    const p = this.player;
    const ws = this.weapons;
    p.eyePosition(_eye, alpha);
    if (this.mode === 'duel' && !p.alive && this.state !== 'results') {
      this._deathCamera(dt);
      return;
    }
    this.deathT = 0;
    cam.position.copy(_eye);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
    const sh = this.shakeAmt * this.shakeAmt;
    const pitch = p.pitch + (ws.recoil.pitch * 0.5 + ws.kick.pitch) * DEG + (Math.random() - 0.5) * sh * 0.05;
    const yaw = p.yaw + (ws.recoil.yaw * 0.5 + ws.kick.yaw) * DEG + (Math.random() - 0.5) * sh * 0.05;
    cam.rotation.set(pitch, yaw, (Math.random() - 0.5) * sh * 0.03);
    const fov = this._targetFov();
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(this._size).y, fov);
    }
    cam.updateMatrixWorld();
    this.viewCamera.quaternion.copy(cam.quaternion);
    this.viewCamera.updateMatrixWorld();
  }

  // Schnellnachrichten: T öffnet die Liste, solange sie offen ist, wählen 1 bis 6 eine Nachricht
  // (die Zahlentasten wechseln dann nicht die Waffe)
  _quickChat(input) {
    const hud = this.hud;
    if (input.consume('chat')) {
      if (this.mode !== 'duel') hud.message('Schnellnachrichten', 'Gibt es im 1 gegen 1', 1.5);
      else hud.toggleChat(!hud.chatOpen);
    }
    if (!hud.chatOpen) return;
    for (let i = 1; i <= 6; i++) {
      if (!input.consume('slot' + i)) continue;
      this.match.sendChat?.(i - 1);
      hud.toggleChat(false);
      break;
    }
  }

  // Nach dem eigenen Tod: Blick sinkt zu Boden und dreht sich zum Gegner (wie in CS)
  _deathCamera(dt) {
    const cam = this.camera;
    const p = this.player;
    this.deathT += dt;
    const k = smooth(this.deathT / 0.9);
    _eye.y -= (p.eyeHeight - 0.45) * k;
    let yaw = p.yaw, pitch = p.pitch;
    if (this.remote.shown) {
      this.remote.headPosition(_to).sub(_eye);
      const targetYaw = Math.atan2(-_to.x, -_to.z);
      const targetPitch = Math.atan2(_to.y, Math.hypot(_to.x, _to.z));
      yaw += Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw)) * k;
      pitch += (targetPitch - pitch) * k;
    }
    cam.position.copy(_eye);
    cam.rotation.set(pitch, yaw, 0.2 * k);
    if (cam.fov !== this.settings.fov) {
      cam.fov = this.settings.fov;
      cam.updateProjectionMatrix();
      this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(this._size).y, cam.fov);
    }
    cam.updateMatrixWorld();
    this.viewCamera.quaternion.copy(cam.quaternion);
    this.viewCamera.updateMatrixWorld();
  }

  // Waffe im Schatten dunkler machen: Strahl vom Auge Richtung Sonne
  _viewLighting(dt) {
    this.sunCheckT -= dt;
    if (this.sunCheckT <= 0) {
      this.sunCheckT = 0.1;
      const hit = this.physics.raycast(this.camera.position, this.env.sunDir, 90);
      this.viewLightTarget = hit ? 0.22 : 1;
    }
    this.viewLight += ((this.viewLightTarget ?? 1) - this.viewLight) * Math.min(1, dt * 6);
    this.env.viewSun.intensity = 2.6 * this.viewLight;
    this.viewScene.environmentIntensity = 0.5 + 0.35 * this.viewLight;
  }
}
