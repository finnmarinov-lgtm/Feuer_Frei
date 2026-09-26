import * as THREE from 'three';
import { KILLERS, SPECIAL } from '../config.js';
import { muzzleTexture } from '../effects/textures.js';

// Luftschlag (Spezialleiste voll, Taste X): erst Ziel wählen, dann steigt roter Rauch auf und ein
// roter Kreis warnt alle: in der Mitte kräftig rot, nach außen immer blasser (genau so verteilt
// sich auch der Schaden). Nach der Warnzeit kommt ein Jet im Sturzflug und feuert mit der
// Bordkanone ("Brrrrrt"): die Einschläge wandern in Flugrichtung durch den Kreis, in der Mitte am
// dichtesten. Schaden rechnet jedes Spiel für den eigenen Spieler (wie bei Granaten), die
// Klappziele trifft nur der eigene Luftschlag. Aus derselben Zahl (seed) entstehen bei beiden
// Spielern dieselben Einschläge.

const DOWN = { x: 0, y: -1, z: 0 };
const UP = { x: 0, y: 1, z: 0 };
// Anflug: Tempo (m/s), Höhe beim Überflug, Sturzflug davor und Steigflug danach
const PLANE_SPEED = 95;
const PASS_HEIGHT = 24;
const DIVE = Math.tan((15 * Math.PI) / 180);
const CLIMB = Math.tan((14 * Math.PI) / 180);
// so lange nach der letzten Granate zieht der Jet über den Kreis hinweg
const PASS_AFTER = 0.35;
// Leuchtspur der Bordkanone: Tempo und Länge des Strichs
const TRACER = { width: 9, speed: 900, streak: 14 };
// Mündung der Kanone am Jet (Nase zeigt nach -Z)
const NOSE = new THREE.Vector3(0, -0.35, -8.6);

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** kleiner Zufallsgenerator: gleiche Zahl ergibt bei beiden Spielern die gleichen Einschläge */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kreis ohne Rand: innen kräftig, nach außen immer blasser (Farbe kommt vom Material)
let gradient = null;
function gradientTexture() {
  if (gradient) return gradient;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, a] of [[0, 1], [0.22, 0.86], [0.46, 0.62], [0.68, 0.4], [0.86, 0.2], [1, 0]]) {
    g.addColorStop(at, `rgba(255, 255, 255, ${a})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  gradient = new THREE.CanvasTexture(c);
  return gradient;
}

function markerMesh(radius, color) {
  const mat = new THREE.MeshBasicMaterial({
    color, map: gradientTexture(), transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), mat);
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}

/** Jet aus einfachen Formen, die Nase zeigt nach -Z; dazu das Mündungsfeuer der Bordkanone */
function planeModel() {
  const g = new THREE.Group();
  g.name = 'Jet';
  g.rotation.order = 'YXZ';
  const body = new THREE.MeshStandardMaterial({ color: 0x5f666d, roughness: 0.45, metalness: 0.5 });
  // beidseitig: die gespiegelten Flügel haben umgedrehte Flächen
  const dark = new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.1, metalness: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.55, 0.75, 11, 12), body, 0, 0, 0, Math.PI / 2);
  add(new THREE.ConeGeometry(0.75, 3.2, 12), body, 0, 0, -7.1, -Math.PI / 2);
  add(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.45, -3.8).scale.set(1, 0.8, 2.2);
  // Pfeilflügel und Leitwerk
  const wing = new THREE.Shape([new THREE.Vector2(0, -1.5), new THREE.Vector2(7.5, 2.6), new THREE.Vector2(7.5, 3.6), new THREE.Vector2(0, 3.2)]);
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.18, bevelEnabled: false }).rotateX(Math.PI / 2);
  add(wingGeo, dark, 0.3, 0.05, -0.6);
  add(wingGeo.clone().scale(-1, 1, 1), dark, -0.3, 0.05, -0.6);
  const tail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 1.8), new THREE.Vector2(2.4, 2.7), new THREE.Vector2(0, 1.4)]);
  const tailGeo = new THREE.ExtrudeGeometry(tail, { depth: 0.14, bevelEnabled: false }).rotateX(Math.PI / 2);
  add(tailGeo, dark, 0.2, 0, 3.6);
  add(tailGeo.clone().scale(-1, 1, 1), dark, -0.2, 0, 3.6);
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 2.8), new THREE.Vector2(-1, 2.8), new THREE.Vector2(-3, 0)]);
  add(new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: false }), dark, -0.08, 0.3, 5.4, 0, -Math.PI / 2);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.5) }));
  glow.position.set(0, 0, 5.52);
  g.add(glow);
  // Rohr der Kanone unter der Nase, davor das Mündungsfeuer
  add(new THREE.CylinderGeometry(0.09, 0.11, 1.4, 8), dark, 0, -0.35, -8.0, Math.PI / 2);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: muzzleTexture(), color: new THREE.Color(4, 2.3, 1.1), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  flash.name = 'Mündungsfeuer';
  flash.position.copy(NOSE);
  flash.scale.setScalar(2.6);
  flash.visible = false;
  g.add(flash);
  return g;
}

export class Airstrikes {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.targeting = false;
    this.aimPoint = new THREE.Vector3();
    this.aimValid = false;
    this.aim = markerMesh(SPECIAL.radius, 0xffb23d);
    game.scene.add(this.aim);
    this.planeTemplate = planeModel();
  }

  // ---------- Ziel wählen ----------
  beginTargeting() {
    this.targeting = true;
    this.aimValid = false;
  }

  cancel() {
    this.targeting = false;
    this.aim.visible = false;
  }

  /** Zielpunkt: dort, wo man hinschaut (an Wänden der Boden davor) */
  updateAim() {
    if (!this.targeting) return;
    const g = this.g;
    const cam = g.camera;
    cam.getWorldDirection(_dir);
    const hit = g.physics.raycast(cam.position, _dir, SPECIAL.maxRange);
    this.aimValid = false;
    if (hit) {
      _a.copy(cam.position).addScaledVector(_dir, hit.distance);
      if (hit.normal.y < 0.6) {
        // Wand getroffen: etwas davor senkrecht nach unten
        _a.addScaledVector(_dir, -0.4);
        const down = g.physics.raycast(_a, DOWN, 40);
        if (down) _a.y -= down.distance;
      }
      this.aimPoint.copy(_a);
      // unter einem Dach (Lagerhalle) kommt der Jet nicht hin
      this.aimValid = this.openSky(_a);
    }
    const m = this.aim;
    m.visible = this.aimValid;
    if (this.aimValid) {
      m.position.copy(this.aimPoint).y += 0.04;
      m.material.opacity = 0.7 + 0.2 * Math.sin(performance.now() / 120);
    }
  }

  /** über dem Punkt ist freier Himmel (kein Dach, keine Decke) */
  openSky(p) {
    _b.set(p.x, p.y + 0.5, p.z);
    return !this.g.physics.raycast(_b, UP, 60);
  }

  /** Ziel bestätigen: liefert den Punkt oder null (z. B. in den Himmel gezielt) */
  confirm() {
    if (!this.aimValid) return null;
    this.cancel();
    return this.aimPoint.clone();
  }

  // ---------- Ablauf ----------
  /**
   * Luftschlag starten. owner: wer ihn angefordert hat (der eigene trifft auch Klappziele).
   * yaw: Flugrichtung (Blickrichtung des Anfordernden), seed: Lage der Einschläge.
   */
  start(point, seed, yaw, owner) {
    const g = this.g;
    const mine = owner === g.myKey;
    // im Team-Spiel schadet der Luftschlag eines Mitspielers einem nicht
    const m = g.match;
    const friendly = !mine && !!m.teamOf && m.teamOf(owner) === m.myTeam;
    const rand = seeded(seed);
    const fly = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const R = SPECIAL.radius;
    const sigma = R * SPECIAL.scatter;
    // Einschläge: um die Mitte gestreut (Normalverteilung, nichts außerhalb des Kreises) und
    // entlang der Flugrichtung sortiert; die Kanone feuert gleichmäßig, die Einschläge wandern also
    // am Rand schnell und in der dichten Mitte langsam
    const hits = [];
    for (let i = 0; i < SPECIAL.rounds; i++) {
      let x, z;
      do {
        const r = Math.sqrt(-2 * Math.log(1 - rand())) * sigma;
        const a = rand() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      } while (x * x + z * z > R * R);
      const p = new THREE.Vector3(point.x + x, point.y, point.z + z);
      // Boden unter dem Einschlag suchen (Dächer, Container, Balkon)
      _a.set(p.x, point.y + 12, p.z);
      const ground = g.physics.raycast(_a, DOWN, 30);
      if (ground) p.y = _a.y - ground.distance;
      hits.push({ pos: p, along: x * fly.x + z * fly.z });
    }
    hits.sort((p, q) => p.along - q.along);
    const pass = SPECIAL.delay + SPECIAL.burst + PASS_AFTER;
    const strike = {
      point: point.clone(), fly, yaw, mine, owner, hits, pass,
      t: 0, next: 0, fired: 0, smokeT: 0, jet: false, brrt: false,
      end: pass + 2.2,
    };
    hits.forEach((h, i) => {
      h.at = SPECIAL.delay + (SPECIAL.burst * i) / (hits.length - 1);
      // abgefeuert etwas früher: so lange fliegt die Granate vom Jet bis zum Boden
      h.fire = h.at - this._muzzleAt(strike, h.at, _a).distanceTo(h.pos) / TRACER.speed;
    });
    strike.marker = markerMesh(R, 0xff2a1a);
    strike.marker.position.copy(point).y += 0.05;
    strike.marker.visible = true;
    g.scene.add(strike.marker);
    strike.plane = this.planeTemplate.clone();
    strike.plane.visible = false;
    strike.flash = strike.plane.getObjectByName('Mündungsfeuer');
    g.scene.add(strike.plane);
    this.list.push(strike);
    // Warnung: wer im oder nahe am Kreis steht, bekommt Piepen und Hinweis
    const p = g.player;
    const near = Math.hypot(p.feet.x - point.x, p.feet.z - point.z) < R + 5;
    if (mine) {
      g.audio.play('radio');
      g.hud.message('Luftschlag angefordert', `Der Jet feuert in ${Math.round(SPECIAL.delay)} Sekunden`, 2);
    } else if (friendly) {
      g.audio.play('radio');
      g.hud.message('Luftschlag deines Teams', `${m.name(owner)} hat den Jet gerufen`, 2);
    } else {
      g.hud.message('Luftschlag!', near ? 'Raus aus dem roten Kreis!' : 'Achte auf den roten Rauch', 2.2);
      g.audio.play('airWarn');
    }
    if ((mine || friendly) && near) g.audio.play('airWarn', { delay: 0.6 });
    return strike;
  }

  /** Ort des Jets zur Zeit t (Sekunden seit dem Anfordern); liefert die Strecke zum Überflug */
  _planeAt(s, t, out) {
    const d = (t - s.pass) * PLANE_SPEED;
    out.copy(s.point).addScaledVector(s.fly, d);
    out.y = s.point.y + PASS_HEIGHT + (d < 0 ? -d * DIVE : d * CLIMB);
    return d;
  }

  /** Neigung des Jets: im Sturzflug Nase unten, nach dem Überflug steil nach oben */
  _pitch(d) {
    const k = smooth((d + 18) / 36);
    return -Math.atan(DIVE) * (1 - k) + Math.atan(CLIMB) * k;
  }

  /** Mündung der Kanone zur Zeit t */
  _muzzleAt(s, t, out) {
    const d = this._planeAt(s, t, out);
    _e.set(this._pitch(d), s.yaw, 0);
    return out.add(_v.copy(NOSE).applyEuler(_e));
  }

  clear() {
    for (const s of this.list) this._remove(s);
    this.list = [];
    this.cancel();
  }

  _remove(s) {
    this.g.scene.remove(s.plane, s.marker);
    s.marker.geometry.dispose();
    s.marker.material.dispose();
  }

  /** Zeitablauf, Schüsse und Einschläge (pro Simulationsschritt) */
  tick(dt) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      if (!s.jet && s.t >= s.pass - 1.9) {
        s.jet = true;
        g.audio.play('jet', { duration: 3.4 });
      }
      // das "Brrrrt" der Kanone, dort wo der Jet mitten im Feuerstoß ist
      if (!s.brrt && s.t >= SPECIAL.delay - 0.05) {
        s.brrt = true;
        this._planeAt(s, SPECIAL.delay + SPECIAL.burst / 2, _a);
        g.audio.play('cannon', { position: _a, duration: SPECIAL.burst });
      }
      // Leuchtspuren (jede zweite Granate) aus der Kanone zum Einschlag
      while (s.fired < s.hits.length && s.t >= s.hits[s.fired].fire) {
        if (s.fired % 2 === 0) {
          const h = s.hits[s.fired];
          g.effects.tracer(this._muzzleAt(s, h.fire, _a), h.pos, TRACER);
        }
        s.fired++;
      }
      while (s.next < s.hits.length && s.t >= s.hits[s.next].at) {
        this._impact(s, s.hits[s.next], s.next);
        s.next++;
      }
      if (s.t >= s.end) {
        this._remove(s);
        this.list.splice(i, 1);
      }
    }
  }

  // eine Granate der Bordkanone schlägt ein: kleiner Sprengradius, Schaden nach Abstand
  _impact(s, h, i) {
    const g = this.g;
    const pos = h.pos;
    g.effects.cannonHit(pos, i % 2 === 0);
    if (i % 3 === 0) g.audio.play('cannonHit', { position: pos });
    _a.copy(pos).y += 0.3;
    const r = SPECIAL.blastRadius;
    if (s.mine) {
      for (const t of g.targets.standing()) {
        _b.copy(t.root.position).y += 1.2;
        const d = _a.distanceTo(_b);
        if (d > r || !g.physics.lineOfSight(_a, _b)) continue;
        const dmg = Math.round(SPECIAL.damage * Math.pow(1 - d / r, 1.2));
        if (dmg <= 0) continue;
        const res = g.targets.damage(t, dmg);
        g.hud.damageNumber(_b, res.damage, false);
        g.match.onHit(res.damage, false, false, false);
        if (res.killed) g.match.onKill(KILLERS.luftschlag, false);
      }
    }
    const p = g.player;
    _b.copy(p.feet).y += 1.0;
    const d = _a.distanceTo(_b);
    if (p.alive && d < r && g.physics.lineOfSight(_a, _b)) {
      const dmg = SPECIAL.damage * Math.pow(1 - d / r, 1.2);
      if (dmg >= 1) g.damagePlayer(dmg, { armorPen: SPECIAL.armorPen, from: _a, by: s.owner, weapon: 'luftschlag' });
    }
    g.onBlast?.(_a, r, SPECIAL.damage, SPECIAL.armorPen, 1.2, s.owner, 'luftschlag', true);
    g.shake(Math.max(0, 0.45 - d / 40));
  }

  /** Bild für Bild: Rauch, Warnkreis, Jet und Mündungsfeuer */
  update(dt) {
    this.updateAim();
    const g = this.g;
    for (const s of this.list) {
      // roter Rauch steigt am Ziel auf, bis die Kanone feuert
      if (s.next === 0) {
        s.smokeT -= dt;
        if (s.smokeT <= 0) {
          s.smokeT = 0.07;
          _v.set((Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6);
          g.effects.dust.spawn(s.point, _v, {
            color: [0.85, 0.1, 0.06], life: 2.4 + Math.random(), size0: 0.3, size1: 1.8 + Math.random(),
            alpha: 0.75, gravity: -0.3, drag: 0.9,
          });
        }
      }
      // Warnkreis pulsiert, nach dem Feuerstoß blendet er aus
      const done = s.next >= s.hits.length;
      const fade = done ? Math.max(0, 1 - (s.t - SPECIAL.delay - SPECIAL.burst) / 0.8) : 1;
      s.marker.material.opacity = (0.84 + 0.14 * Math.sin(s.t * 9)) * fade;
      s.marker.visible = fade > 0;
      // Jet: im Sturzflug auf den Kreis zu, danach steil nach oben weg
      const plane = s.plane;
      const d = this._planeAt(s, s.t, plane.position);
      plane.visible = d > -330 && d < 260;
      if (plane.visible) plane.rotation.set(this._pitch(d), s.yaw, Math.sin(s.t * 2) * 0.05);
      // Mündungsfeuer flackert, solange die Kanone feuert
      const firing = s.fired > 0 && s.fired < s.hits.length;
      s.flash.visible = firing && plane.visible;
      if (s.flash.visible) {
        s.flash.material.rotation = Math.random() * Math.PI;
        s.flash.scale.setScalar(2 + Math.random() * 1.6);
      }
    }
  }
}
