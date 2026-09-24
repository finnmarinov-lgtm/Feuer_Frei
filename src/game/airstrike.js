import * as THREE from 'three';
import { KILLERS, SPECIAL } from '../config.js';

// Luftschlag (Spezialleiste voll, Taste X): erst Ziel wählen, dann steigt roter Rauch auf und ein
// roter Kreis warnt alle. Nach der Warnzeit fliegt ein Jet über den Hof und wirft Bomben, die
// nacheinander im Kreis einschlagen. Schaden rechnet jedes Spiel für den eigenen Spieler
// (wie bei Granaten), die Klappziele trifft nur der eigene Luftschlag.

const DOWN = { x: 0, y: -1, z: 0 };
const PLANE_HEIGHT = 34;
const PLANE_SPEED = 120;
const FALL_TIME = 0.6;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();

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

function ringMesh(radius, color) {
  const geo = new THREE.RingGeometry(radius - 0.22, radius, 64).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const ring = new THREE.Mesh(geo, mat);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.22, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  );
  const g = new THREE.Group();
  g.add(ring, fill);
  g.renderOrder = 2;
  g.visible = false;
  return { group: g, ring: mat, fill: fill.material };
}

/** Jet aus einfachen Formen, die Nase zeigt nach -Z */
function planeModel() {
  const g = new THREE.Group();
  g.name = 'Jet';
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
  return g;
}

function bombMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 10), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.22), mat);
    fin.position.set(0, 0, 0.5);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.translateY(0.14);
    g.add(fin);
  }
  return g;
}

export class Airstrikes {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.targeting = false;
    this.aimPoint = new THREE.Vector3();
    this.aimValid = false;
    const aim = ringMesh(SPECIAL.radius, 0xffb23d);
    this.aim = aim;
    game.scene.add(aim.group);
    this.planeTemplate = planeModel();
    this.bombTemplate = bombMesh();
  }

  // ---------- Ziel wählen ----------
  beginTargeting() {
    this.targeting = true;
    this.aimValid = false;
  }

  cancel() {
    this.targeting = false;
    this.aim.group.visible = false;
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
      this.aimValid = true;
    }
    const grp = this.aim.group;
    grp.visible = this.aimValid;
    if (this.aimValid) {
      grp.position.copy(this.aimPoint).y += 0.04;
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 120);
      this.aim.ring.opacity = 0.9 * pulse;
    }
  }

  /** Ziel bestätigen: liefert den Punkt oder null (z. B. in den Himmel gezielt) */
  confirm() {
    if (!this.aimValid) return null;
    this.cancel();
    return this.aimPoint.clone();
  }

  // ---------- Ablauf ----------
  /**
   * Luftschlag starten. mine = eigener (trifft auch Klappziele), sonst der des Gegners.
   * yaw: Flugrichtung (Blickrichtung des Anfordernden), seed: Lage der Einschläge.
   */
  start(point, seed, yaw, mine) {
    const g = this.g;
    const rand = seeded(seed);
    const fly = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    // Einschläge im Kreis, entlang der Flugrichtung sortiert: die Bomben fallen nacheinander
    const hits = [];
    for (let i = 0; i < SPECIAL.bombs; i++) {
      const a = rand() * Math.PI * 2;
      const r = i === 0 ? rand() * 1.2 : Math.sqrt(rand()) * SPECIAL.radius * 0.92;
      const p = new THREE.Vector3(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r);
      // Boden unter dem Einschlag suchen (Dächer, Container, Balkon)
      _a.set(p.x, point.y + 12, p.z);
      const ground = g.physics.raycast(_a, DOWN, 30);
      if (ground) p.y = _a.y - ground.distance;
      hits.push(p);
    }
    hits.sort((p, q) => (p.x - point.x) * fly.x + (p.z - point.z) * fly.z - ((q.x - point.x) * fly.x + (q.z - point.z) * fly.z));
    const marker = ringMesh(SPECIAL.radius, 0xff2a1a);
    marker.group.position.copy(point).y += 0.05;
    marker.group.visible = true;
    g.scene.add(marker.group);
    const plane = this.planeTemplate.clone();
    plane.rotation.y = yaw;
    plane.visible = false;
    g.scene.add(plane);
    const bombs = hits.map(() => {
      const b = this.bombTemplate.clone();
      b.visible = false;
      g.scene.add(b);
      return b;
    });
    const strike = {
      point: point.clone(), fly, yaw, mine, hits, bombs, plane, marker,
      t: 0, next: 0, smokeT: 0, jet: false, whistles: 0,
      over: SPECIAL.delay - 0.35,
      end: SPECIAL.delay + (SPECIAL.bombs - 1) * SPECIAL.spacing + 1.5,
    };
    this.list.push(strike);
    // Warnung: wer im oder nahe am Kreis steht, bekommt Piepen und Hinweis
    const p = g.player;
    const near = Math.hypot(p.feet.x - point.x, p.feet.z - point.z) < SPECIAL.radius + 5;
    if (mine) {
      g.audio.play('radio');
      g.hud.message('Luftschlag angefordert', `Einschlag in ${Math.round(SPECIAL.delay)} Sekunden`, 2);
    } else {
      g.hud.message('Luftschlag!', near ? 'Raus aus dem roten Kreis!' : 'Achte auf den roten Rauch', 2.2);
      g.audio.play('airWarn');
    }
    if (mine && near) g.audio.play('airWarn', { delay: 0.6 });
    return strike;
  }

  clear() {
    for (const s of this.list) this._remove(s);
    this.list = [];
    this.cancel();
  }

  _remove(s) {
    const scene = this.g.scene;
    scene.remove(s.plane, s.marker.group, ...s.bombs);
    s.marker.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }

  /** Zeitablauf und Einschläge (pro Simulationsschritt) */
  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      const g = this.g;
      if (!s.jet && s.t >= s.over - 1.4) {
        s.jet = true;
        g.audio.play('jet', { duration: 2.8 });
      }
      while (s.whistles < s.hits.length && s.t >= SPECIAL.delay + s.whistles * SPECIAL.spacing - FALL_TIME) {
        g.audio.play('whistle', { position: s.hits[s.whistles] });
        s.whistles++;
      }
      while (s.next < s.hits.length && s.t >= SPECIAL.delay + s.next * SPECIAL.spacing) {
        this._impact(s, s.hits[s.next]);
        s.bombs[s.next].visible = false;
        s.next++;
      }
      if (s.t >= s.end) {
        this._remove(s);
        this.list.splice(i, 1);
      }
    }
  }

  _impact(s, pos) {
    const g = this.g;
    _a.copy(pos).y += 0.3;
    g.effects.explosion(_a, pos.y, 1.3);
    g.audio.play('explosion', { position: _a, volume: 1.2 });
    const r = SPECIAL.blastRadius;
    if (s.mine) {
      for (const t of g.targets.standing()) {
        _b.copy(t.root.position).y += 1.2;
        const d = _a.distanceTo(_b);
        if (d > r || !g.physics.lineOfSight(_a, _b)) continue;
        const dmg = Math.round(SPECIAL.damage * Math.pow(1 - d / r, 1.4));
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
      const dmg = SPECIAL.damage * Math.pow(1 - d / r, 1.4);
      if (dmg >= 1) g.damagePlayer(dmg, { armorPen: SPECIAL.armorPen, from: _a, byOpponent: !s.mine, weapon: 'luftschlag' });
    }
    g.shake(Math.max(0, 1 - d / 26));
  }

  /** Bild für Bild: Rauch, Warnkreis, Jet und fallende Bomben */
  update(dt) {
    this.updateAim();
    const g = this.g;
    for (const s of this.list) {
      // roter Rauch steigt am Ziel auf, solange die Bomben noch nicht gefallen sind
      if (s.next < s.hits.length) {
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
      const fade = s.next >= s.hits.length ? Math.max(0, 1 - (s.t - (s.end - 1.5)) / 1.2) : 1;
      const pulse = 0.6 + 0.4 * Math.sin(s.t * 9);
      s.marker.ring.opacity = 0.9 * pulse * fade;
      s.marker.fill.opacity = 0.18 * fade;
      // Jet: fliegt in Blickrichtung des Anfordernden über den Zielpunkt
      const k = s.t - s.over;
      s.plane.visible = Math.abs(k) < 1.5;
      if (s.plane.visible) {
        s.plane.position.copy(s.point).addScaledVector(s.fly, k * PLANE_SPEED);
        s.plane.position.y = s.point.y + PLANE_HEIGHT;
        s.plane.rotation.set(0, s.yaw, Math.sin(s.t * 2) * 0.06);
      }
      // Bomben: aus dem Jet nach unten, zuletzt steil
      s.hits.forEach((hit, i) => {
        const b = s.bombs[i];
        const land = SPECIAL.delay + i * SPECIAL.spacing;
        const f = 1 - (land - s.t) / FALL_TIME;
        if (i < s.next || f < 0 || f >= 1) {
          b.visible = false;
          return;
        }
        b.visible = true;
        const u = 1 - f;
        b.position.copy(hit).addScaledVector(s.fly, -14 * u);
        b.position.y = hit.y + 0.3 + (PLANE_HEIGHT - 2) * u * u;
        _v.copy(s.fly).multiplyScalar(14).setY(-2 * (PLANE_HEIGHT - 2) * u);
        b.lookAt(_a.copy(b.position).sub(_v));
      });
    }
  }
}
