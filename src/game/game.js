import * as THREE from 'three';
import { KNIFE_SKINS, MOVE, SPECIAL, TEAM_KNIFE, TICK, WEAPONS } from '../config.js';
import { mergeByMaterial } from '../engine/merge.js';
import { setupEnvironment } from '../world/environment.js';
import { Arena, MAP, MAPS, SPAWN, setMap } from '../world/map.js';
import { BombSites } from '../world/bombsites.js';
import { Effects } from '../effects/effects.js';
import { Targets } from './targets.js';
import { Training } from './match.js';
import { Duel } from './duel.js';
import { TeamMatch } from './teams.js';
import { RemotePlayer } from './remote.js';
import { KillCam } from './killcam.js';
import { Airstrikes } from './airstrike.js';
import { Player } from '../player/player.js';
import { Viewmodel } from '../weapons/viewmodel.js';
import { WeaponSystem } from '../weapons/weapons.js';
import { Grenades } from '../weapons/grenades.js';
import { Hud } from '../ui/hud.js';
import { BuyMenu } from '../ui/buymenu.js';
import { applyFinish, tickFinishes } from '../weapons/finishes.js';
import { PAINT, SLEEVE, cleanLooks, skinOf } from './cosmetics.js';

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
    // Fülllicht für die Waffe in der Hand, fest zur Blickrichtung: Rillen, Visier und Kanten
    // bleiben erkennbar, auch wenn die Sonne von vorne kommt
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.8);
    fill.position.set(0.4, 0.9, 0.6);
    fill.target.position.set(0, 0, -1);
    this.viewCamera.add(fill, fill.target);
    this.arena = new Arena(assets, physics, this.scene);
    this.arena.build();
    this.env.fitShadow(MAP.shadow);
    this.effects = new Effects(this.scene);
    this.targets = new Targets(this.scene, assets.models.target, audio, this.effects, this.physics);
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
    this.training = new Training(this);
    this.match = this.training;
    // 1 gegen 1: der Gegner. Team-Spiel: eine Figur pro Mitspieler (Kennung -> Figur), dazu
    // others (alle angezeigten Figuren) und foes (die Gegner, nur auf sie wird geschossen)
    this.remote = new RemotePlayer(this);
    this.teamRemotes = new Map();
    this.remotePool = [];
    this.others = [];
    this.foes = [];
    this.onRematch = null;
    this.onTeamRematch = null;
    this.sprintFov = 0;
    this.hud = new Hud(this);
    this.buyMenu = new BuyMenu(this);
    // nach dem eigenen Tod im Duell: Kill-Cam und Gegner-Sicht
    this.killcam = new KillCam(this);
    // eigene Skins (Waffen, Messer, Spieler), freigeschaltet über Aufgaben (game/cosmetics.js)
    this.looks = cleanLooks(settings.looks, true);
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
    for (const [key, m] of Object.entries(this.viewmodel.models)) {
      m.model.visible = true;
      // getragene Skins gleich mit übersetzen, sonst ruckelt es beim ersten Ziehen
      const [id, knife] = key.split(':');
      applyFinish(m.model, PAINT[knife || id] || [], skinOf(this.looks, knife ? 'messer' : id), knife ? 40 : 22);
      applyFinish(m.model, SLEEVE, skinOf(this.looks, 'spieler'), 9);
    }
    this.effects.muzzleLight.intensity = 1;
    this.effects.boomLight.intensity = 1;
    await r.compileAsync(this.scene, this.camera);
    await r.compileAsync(this.viewScene, this.viewCamera);
    for (const m of Object.values(this.viewmodel.models)) m.model.visible = false;
  }

  applySettings() {
    const s = this.settings;
    this.setLooks(s.looks);
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
    for (const r of [this.remote, ...this.teamRemotes.values()]) if (r.root.visible) hide.push(r.root);
    if (this.killcam.ghost?.root.visible) hide.push(this.killcam.ghost.root);
    for (const gr of this.grenades.list) if (gr.mesh.visible) hide.push(gr.mesh);
    if (this.bombSites.bomb.visible) hide.push(this.bombSites.bomb);
    for (const s of this.airstrikes.list) hide.push(s.plane);
    for (const o of hide) o.visible = false;
    this.renderer.bakeShadows();
    for (const o of hide) o.visible = true;
  }

  onResize() {
    this.renderer.resize();
    this.effects.setViewport(this.renderer.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
  }

  /**
   * Karte wechseln (vor einer Partie): alte Arena abbauen, neue bauen, Bombenplätze, Spuren und
   * Schatten anpassen. Liefert true, wenn sich etwas geändert hat.
   */
  loadMap(id) {
    const map = MAPS[id] ? id : 'hof';
    if (this.arena.mapId === map) return false;
    setMap(map);
    this.killcam.stop();
    this.grenades.clear();
    this.airstrikes.clear();
    this.targets.clear();
    this.effects.clearMarks();
    this.arena.clear();
    this.arena.build();
    this.env.fitShadow(MAP.shadow);
    this.bombSites.show(null);
    this.bombSites.remove();
    if (this.renderer.quality?.staticShadows) this.renderer.needsShadowBake = true;
    this.player.spawn(SPAWN.pos, SPAWN.yaw);
    return true;
  }

  /** eigene Skins ändern (Waffenkammer): gilt sofort, in der Kill-Cam erst beim Zurückkommen */
  setLooks(raw) {
    this.looks = cleanLooks(raw, true);
    if (this.killcam.saved) this.killcam.saved.looks = this.looks;
    else this.viewmodel.setLooks(this.looks);
  }

  /** eigene Kennung in der laufenden Partie (Rolle im 1 gegen 1, Kennung im Team-Spiel) */
  get myKey() {
    return this.match.me ?? 'ich';
  }

  /** Anzeigename einer Waffe; beim Messer das eigene (Karambit oder Butterfly) */
  weaponName(def, knifeSkin = this.viewmodel.knifeSkin) {
    return def.slot === 'knife' ? KNIFE_SKINS[knifeSkin].name : def.name;
  }

  /** Training auf der Karte mapId (sonst auf der aktuellen) */
  startMatch(mapId = MAP.id) {
    this.loadMap(mapId);
    this._setMode('training');
    this.match = this.training;
    // im Training entscheidet der Zufall, welches Messer man bekommt
    this.viewmodel.knifeSkin = Math.random() < 0.5 ? 'karambit' : 'butterfly';
    this.viewmodel.looks = this.looks;
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
   * 1 gegen 1 starten. opts: role ('host'/'guest'), lives, wins, mode, map, arms (Waffen-Modus),
   * myName, theirName, theirLooks (Skins des Gegners); mit resume (Stand der Partie) und saved
   * (eigener Stand) geht es in einer laufenden Partie weiter.
   */
  startDuel(net, opts) {
    this.loadMap(opts.map);
    this._setMode('duel');
    this.match.dispose?.();
    this._releaseTeamRemotes();
    this.killcam.reset();
    this.remote.setActive(true, opts.role === 'host' ? 'guest' : 'host');
    this.others = [this.remote];
    this.foes = [this.remote];
    this.remote.setLooks(cleanLooks(opts.theirLooks));
    // Team Rot (Host) hat das Karambit, Team Blau (Gast) das Butterflymesser
    this.viewmodel.knifeSkin = TEAM_KNIFE[opts.role];
    this.viewmodel.looks = this.looks;
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

  /**
   * Team-Spiel starten (1 gegen 1 mit KI bis 4 gegen 4). opts: key (eigene Kennung), isHost,
   * hostKey, hostPeer (Kennung des Hosts im Netz), cfg (Modus, Leben, Siege, Karte, Waffen,
   * KI-Stärke), roster (alle Spieler mit Team, Name, Skins, KI ja/nein), myName; mit resume (Stand
   * der Partie) und saved (eigener Stand) geht es in einer laufenden Partie weiter.
   */
  startTeam(net, opts) {
    this.loadMap(opts.cfg.map);
    this._setMode('duel');
    this.match.dispose?.();
    this.remote.setActive(false);
    this.killcam.reset();
    this._releaseTeamRemotes();
    const me = opts.roster.find((e) => e.key === opts.key);
    for (const e of opts.roster) {
      if (e.key === opts.key) continue;
      const r = this.remotePool.pop() || new RemotePlayer(this);
      r.key = e.key;
      r.name = e.name;
      // KI-Spieler laufen beim Host: dort hat ihr eigener Körper die Kollision
      r.local = !!e.bot && opts.isHost;
      r.peer = e.bot ? opts.hostPeer : e.peer;
      r.setActive(true, e.team);
      r.setLooks(cleanLooks(e.looks));
      r.solid = !r.local;
      this.teamRemotes.set(e.key, r);
    }
    this.others = [...this.teamRemotes.values()];
    this.foes = this.others.filter((r) => r.team !== me.team);
    this.viewmodel.knifeSkin = TEAM_KNIFE[me.team];
    this.viewmodel.looks = this.looks;
    this.match = new TeamMatch(this, net, opts);
    this.grenades.clear();
    this.airstrikes.clear();
    this.targets.clear();
    this.hud.reset();
    this.hud.show(true);
    this.state = 'playing';
    this.acc = 0;
    if (opts.resume) this.match.resume(opts.resume, opts.saved);
    else this.match.start();
    this.hud.onMoney(0);
  }

  // Figuren der Mitspieler zurück in den Vorrat (werden beim nächsten Team-Spiel wieder benutzt)
  _releaseTeamRemotes() {
    for (const r of this.teamRemotes.values()) {
      r.setActive(false);
      r.key = r.peer = null;
      r.local = false;
      this.remotePool.push(r);
    }
    this.teamRemotes.clear();
    this.others = [];
    this.foes = [];
  }

  _setMode(mode) {
    this.mode = mode;
    this.killcam.stop();
    if (mode !== 'duel') {
      this.remote.setActive(false);
      this._releaseTeamRemotes();
    }
    // Bombenplätze zeigt nur der Bombenmodus (in jeder Runde neu)
    this.bombSites.show(null);
    this.bombSites.remove();
    this.hud.setMode(mode);
  }

  quitToMenu() {
    if (this.mode === 'duel') this.match.leave();
    this.match.dispose?.();
    this.viewmodel.clearDrops();
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
    this.killcam.stop();
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

  /** Schaden durch Granate oder Luftschlag; by: wer sie geworfen bzw. angefordert hat */
  damagePlayer(amount, { armorPen, from, by = null, weapon = 'he' }) {
    const p = this.player;
    const m = this.match;
    if (!p.alive || m.immune) return 0;
    // Team-Spiel: Granaten und Luftschläge von Mitspielern schaden nicht (die eigenen schon)
    if (by !== null && by !== this.myKey && m.teamOf && m.teamOf(by) === m.myTeam) return 0;
    const dealt = p.applyDamage(amount, { armorPen });
    if (dealt > 0) {
      this.hud.hurt(dealt);
      this.audio.play('hurt');
      if (from) this.hud.hitFrom(from);
    }
    if (!p.alive) {
      if (this.mode === 'duel') {
        m.onLocalDeath({ by: by ?? m.me, w: weapon, head: false });
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
      if (!MAP.airstrike) this.hud.message('Kein Luftschlag', `In der ${MAP.name} gibt es keinen Luftschlag`, 1.6);
      else if (as.targeting) as.cancel();
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
        this.hud.message('Kein Ziel', 'Schau auf den Boden unter freiem Himmel, dort feuert der Jet hin', 1.6);
      }
    } else if (input.altPressed) {
      input.altPressed = false;
      as.cancel();
    }
  }

  frame(dt) {
    const duel = this.mode === 'duel';
    // bewegte Skins (Regenbogen, Lava, Neon, Galaxie)
    tickFinishes(performance.now() / 1000);
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
      if (duel) this.killcam.handleInput(input);
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
      for (const r of this.others) r.update(dt);
      this.match.netUpdate(dt);
      if (simulate) this.killcam.update(dt);
    }
    if (this.renderPaused) return;
    const alpha = simulate ? this.acc / TICK : 1;
    const sprinting = simulate && this.player.sprinting;
    this.sprintFov += ((sprinting ? 1 : 0) - this.sprintFov) * Math.min(1, dt * 6);
    this._updateCamera(dt, alpha);
    this.grenades.update(dt);
    this.airstrikes.update(dt);
    this.effects.update(dt);

    // Kill-Cam und Gegner-Sicht: seine Waffe in der Hand statt der eigenen
    const kc = this.killcam;
    const spectate = duel && kc.firstPerson;
    const scoped = spectate ? kc.scoped : this.weapons.scoped && simulate;
    const showVm = simulate && !scoped && (spectate || this.player.alive);
    if (showVm) {
      this._viewLighting(dt);
      if (spectate) {
        kc.drawViewmodel(dt);
      } else {
        const ws = this.weapons;
        this._aim.pitch = ws.recoil.pitch * 0.5 * DEG;
        this._aim.yaw = ws.recoil.yaw * 0.5 * DEG;
        this.viewmodel.update(dt, this.player, mouse, scoped, ws.ads, this._aim);
      }
    }
    if (simulate) this.hud.update(dt, this.camera);
    // hören, wo die Kamera ist (in der Kill-Cam also wie der Gegner)
    this.camera.getWorldDirection(_fwd);
    this.audio.updateListener(this.camera.position, _fwd);
    // Waffenkammer: die Vorschau dreht sich im Menü rechts im Bild
    const showcase = this.state === 'menu' && !!this.showcase?.visible;
    if (showcase) this._turnShowcase(dt);
    if (this.renderer.needsShadowBake) this._bakeShadows();
    this.renderer.render(showVm || showcase);
  }

  _updateCamera(dt, alpha) {
    const cam = this.camera;
    if (this.state === 'menu') {
      // langsamer Rundflug über die Arena hinter dem Hauptmenü
      this.menuAngle += dt * 0.05;
      const mc = MAP.menu;
      cam.position.set(Math.cos(this.menuAngle) * mc.rx, mc.y, Math.sin(this.menuAngle) * mc.rz);
      cam.lookAt(mc.look[0], mc.look[1], mc.look[2]);
      cam.fov = this.settings.fov;
      cam.updateProjectionMatrix();
      return;
    }
    const p = this.player;
    const ws = this.weapons;
    p.eyePosition(_eye, alpha);
    if (this.mode === 'duel' && !p.alive && this.state !== 'results') {
      this.killcam.camera(dt, _eye);
      return;
    }
    this.killcam.resetDeathView();
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
      if (this.mode !== 'duel') hud.message('Schnellnachrichten', 'Gibt es im Mehrspieler', 1.5);
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

  /**
   * Vorschau in der Waffenkammer: target = Waffe, 'messer' (beide Messer) oder 'spieler', skin =
   * Oberfläche. Gezeichnet wird sie wie die Waffe in der Hand (eigene Szene vor der Kamera). null = aus.
   */
  setShowcase(spec) {
    if (!this.showcase) {
      this.showcase = new THREE.Group();
      this.showcase.visible = false;
      this.viewCamera.add(this.showcase);
      this.showcaseModels = {};
    }
    const sc = this.showcase;
    for (const m of Object.values(this.showcaseModels)) m.visible = false;
    if (!spec) {
      sc.visible = false;
      this.viewmodel.root.visible = true;
      return;
    }
    const m = (this.showcaseModels[spec.target] ||= this._showcaseModel(spec.target));
    for (const part of m.userData.parts) applyFinish(part.model, part.names, spec.skin, part.scale);
    m.visible = true;
    sc.visible = true;
    // die Waffe in der Hand gehört nicht in die Vorschau, auch kein Magazin, das noch herausfiel
    this.viewmodel.root.visible = false;
    this.viewmodel.clearDrops();
    this.viewCamera.quaternion.identity();
    this.viewCamera.updateMatrixWorld();
    this.env.viewSun.intensity = 2.6;
    this.viewScene.environmentIntensity = 0.85;
  }

  // Modell für die Vorschau: Waffe ohne Arme, auf gleiche Größe gebracht, seitlich gezeigt
  _showcaseModel(target) {
    const holder = new THREE.Group();
    const parts = [];
    const add = (name, paint, scale, size, x) => {
      const src = this.assets.models[name].clone();
      const remove = [];
      src.traverse((o) => { if (/^(Hand|Wrist|Sleeve)/.test(o.name)) remove.push(o); });
      for (const o of remove) o.removeFromParent();
      mergeByMaterial(src);
      src.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const box = new THREE.Box3().setFromObject(src);
      const dim = box.getSize(new THREE.Vector3());
      const k = size / Math.max(dim.x, dim.y, dim.z);
      const pivot = new THREE.Group();
      src.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
      pivot.add(src);
      pivot.scale.setScalar(k);
      pivot.position.x = x;
      holder.add(pivot);
      parts.push({ model: src, names: paint, scale, pivot });
    };
    if (target === 'spieler') {
      add('soldier', ['Uniform'], 8, 1.85, 0);
      const soldier = parts[0].model;
      // Helm neutral (im Spiel zeigt er die Teamfarbe)
      soldier.traverse((o) => {
        if (o.isMesh && o.material.name === 'Helmet') o.material = Object.assign(o.material.clone(), { name: 'HelmetPreview' });
        if (o.isMesh && o.material.name === 'HelmetPreview') o.material.color.set('#3b4048');
      });
      // die Figur hat zwei linke Arme (für Gewehr und Pistole): nur den fürs Gewehr, dazu ein Gewehr
      // in die Hand, damit die Haltung stimmt
      soldier.getObjectByName('ArmLShort').visible = false;
      soldier.getObjectByName('ArmLLong').visible = true;
      const gun = this.assets.models.wolf.clone();
      const arms = [];
      gun.traverse((o) => { if (/^(Hand|Wrist|Sleeve)/.test(o.name)) arms.push(o); });
      for (const o of arms) o.removeFromParent();
      mergeByMaterial(gun);
      gun.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      applyFinish(gun, PAINT.wolf, skinOf(this.looks, 'wolf'));
      soldier.getObjectByName('WeaponAnchor').add(gun);
      holder.position.set(1.05, -0.05, -3.4);
      holder.userData.spin = true;
    } else if (target === 'messer') {
      add('karambit', PAINT.karambit, 40, 0.3, -0.2);
      add('butterfly', PAINT.butterfly, 40, 0.34, 0.2);
      holder.position.set(0.5, 0, -1.15);
    } else {
      const pistol = WEAPONS[target].slot === 'secondary';
      add(WEAPONS[target].model, PAINT[target] || [], 22, pistol ? 0.5 : 0.9, 0);
      holder.position.set(pistol ? 0.5 : 0.55, 0, pistol ? -1.2 : -1.45);
    }
    holder.userData.parts = parts;
    holder.userData.t = 0;
    this.showcase.add(holder);
    return holder;
  }

  _turnShowcase(dt) {
    for (const m of Object.values(this.showcaseModels)) {
      if (!m.visible) continue;
      m.userData.t += dt;
      const t = m.userData.t;
      for (const part of m.userData.parts) {
        // Spieler dreht sich ganz, Waffen schwenken hin und her (Lauf nach rechts)
        part.pivot.rotation.set(m.userData.spin ? 0 : 0.12 + Math.sin(t * 0.7) * 0.12,
          m.userData.spin ? t * 0.6 : -Math.PI / 2 + Math.sin(t * 0.5) * 0.55, 0);
      }
    }
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
