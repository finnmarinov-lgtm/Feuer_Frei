import * as THREE from 'three';
import { TICK } from '../config.js';
import { setupEnvironment } from '../world/environment.js';
import { Arena, SPAWN } from '../world/map.js';
import { Effects } from '../effects/effects.js';
import { Targets } from './targets.js';
import { Match } from './match.js';
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
    this.match = new Match(this);
    this.hud = new Hud(this);
    this.buyMenu = new BuyMenu(this);
    this.hud.setCrosshairColor(settings.crosshairColor);

    this.renderer.applyQuality(settings.quality, this.env.sun);
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
    if (this.renderer.qualityKey !== s.quality) this.renderer.applyQuality(s.quality, this.env.sun);
    this.onResize();
  }

  onResize() {
    this.renderer.resize();
    this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
  }

  startMatch() {
    this.grenades.clear();
    this.hud.reset();
    this.match.start();
    this.hud.onMoney(0);
    this.hud.show(true);
    this.state = 'playing';
    this.acc = 0;
  }

  quitToMenu() {
    this.state = 'menu';
    this.buyMenu.hide();
    this.hud.show(false);
    this.grenades.clear();
    this.targets.clear();
    this.match.phase = 'idle';
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

  damagePlayer(amount, { armorPen, from }) {
    const p = this.player;
    const dealt = p.applyDamage(amount, { armorPen });
    if (dealt > 0) {
      this.hud.hurt(dealt);
      this.audio.play('hurt');
    }
    if (!p.alive) {
      this.hud.message('Ausgeschaltet', 'Deine eigene Granate war zu nah', 3);
      this.viewmodel.root.visible = false;
    }
    return dealt;
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** Aktuelles Sichtfeld: beim Zielen (auch mit Zielfernrohr) vergrößert, sonst normal */
  _targetFov() {
    const ws = this.weapons;
    const def = ws.active?.def;
    const base = this.settings.fov;
    if (def?.ads && ws.ads > 0) {
      const zoomed = (2 * Math.atan(Math.tan((base * DEG) / 2) / def.ads.zoom)) / DEG;
      const e = ws.ads * ws.ads * (3 - 2 * ws.ads);
      return base + (zoomed - base) * e;
    }
    return base;
  }

  _look(mouse) {
    const p = this.player;
    // Empfindlichkeit wie in CS; beim Zoomen im Verhältnis des Sichtfelds langsamer
    const k = this.settings.sensitivity * 0.022 * DEG
      * (Math.tan((this._targetFov() * DEG) / 2) / Math.tan((this.settings.fov * DEG) / 2));
    p.yaw -= mouse.x * k;
    p.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, p.pitch - mouse.y * k));
  }

  tick(dt) {
    this.time += dt;
    this.match.tick(dt);
    this.player.tick(dt, this.input);
    this.weapons.tick(dt, this.input);
    this.grenades.tick(dt);
    this.targets.tick(dt, this.time);
    this.physics.step();
  }

  frame(dt) {
    // hinter dem Notizblock nichts zeichnen (spart Strom und bleibt unauffällig)
    if (this.renderPaused) return;
    if (window.innerWidth !== this._w || window.innerHeight !== this._h) {
      this._w = window.innerWidth;
      this._h = window.innerHeight;
      if (this._w > 0 && this._h > 0) this.onResize();
    }
    const input = this.input;
    let mouse = { x: 0, y: 0 };
    if (this.state === 'playing') {
      if (input.consume('buy')) {
        if (this.buyMenu.open) this.closeBuyMenu();
        else this.openBuyMenu();
      }
      this.hud.showStats(input.isDown('scores'));
      mouse = input.takeMouse();
      this._look(mouse);
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
    } else {
      input.takeMouse();
    }
    const alpha = this.state === 'playing' ? this.acc / TICK : 1;
    this._updateCamera(dt, alpha);
    this.grenades.update(dt);
    this.effects.update(dt);

    const scoped = this.weapons.scoped && this.state === 'playing';
    const showVm = this.state === 'playing' && this.player.alive && !scoped;
    if (showVm) {
      this._viewLighting(dt);
      const ws = this.weapons;
      this._aim.pitch = ws.recoil.pitch * 0.5 * DEG;
      this._aim.yaw = ws.recoil.yaw * 0.5 * DEG;
      this.viewmodel.update(dt, this.player, mouse, scoped, ws.ads, this._aim);
    }
    if (this.state === 'playing') this.hud.update(dt, this.camera);
    this.player.forward(_fwd);
    this.audio.updateListener(this.camera.position, _fwd);
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
