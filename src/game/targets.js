import * as THREE from 'three';

const UP_TIME = 0.35;
const FALL_TIME = 0.45;
const DOWN_ANGLE = -Math.PI / 2;
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
// Bewegliche Ziele fahren höchstens so weit zur Seite. Wo eine Wand, Kiste oder Kante näher ist,
// fahren sie nur so weit, wie Platz ist; bleibt weniger als MIN_RANGE, fährt dort keins.
const MOVE_RANGE = 1.4;
const MIN_RANGE = 0.7;
// so fein wird der Platz abgemessen
const STEP = 0.05;
// so weit rückt ein Ziel höchstens nach vorn, wenn es hinten anstößt (umgefallen liegt die Platte
// bis gut 1,5 m hinter dem Sockel)
const MAX_PUSH = 1.5;
// Maße des Modells: Drehpunkt der Platte über dem Boden, Mitte der Platte (mit Kopf) vom Drehpunkt aus
const PIVOT_Y = 0.165;
const PLATE_MID = 1.15;
// Stellungen der Platte, in denen sie nirgends hineinragen darf: stehend, beim Umklappen, liegend
const SWEEP = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2];
const DOWN = { x: 0, y: -1, z: 0 };
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// Klappziele aus Stahl: Kopf- und Körperplatte, klappen hoch, fallen bei 0 Lebenspunkten nach hinten um.
export class Targets {
  constructor(scene, template, audio, effects, physics) {
    this.scene = scene;
    this.template = template;
    this.audio = audio;
    this.effects = effects;
    this.physics = physics;
    this.list = [];
    this.raycaster = new THREE.Raycaster();
    this.hitMeshes = [];
    // so viele Sekunden nach dem Umfallen klappt ein Ziel wieder hoch (0 = bleibt liegen)
    this.respawn = 0;
    // zum Abmessen des Platzes: Sockel und Platte (halbe Maße, etwas größer als das Modell)
    this.baseShape = new physics.R.Cuboid(0.29, 0.09, 0.26);
    this.plateShape = new physics.R.Cuboid(0.25, 0.4, 0.05);
  }

  _create() {
    const root = this.template.clone();
    const pivot = root.getObjectByName('Pivot');
    const t = { root, pivot, hp: 100, state: 'hidden', angle: DOWN_ANGLE, timer: 0, delay: 0, move: null, spot: null, hitboxes: [] };
    const plates = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.name === 'Head' || o.name === 'Body') plates.push(o);
      // Sockel und Pfosten halten Kugeln auf, zählen aber nicht als Treffer
      if (o.name === 'Base' || o.name === 'Post') {
        o.userData.target = t;
        o.userData.zone = null;
        t.hitboxes.push(o);
      }
    });
    // Unsichtbare Trefferkästen, etwas größer als die Platten: man trifft leichter
    for (const plate of plates) {
      const zone = plate.name === 'Head' ? 'head' : 'body';
      plate.geometry.computeBoundingBox();
      const size = plate.geometry.boundingBox.getSize(new THREE.Vector3());
      const center = plate.geometry.boundingBox.getCenter(new THREE.Vector3());
      const grow = zone === 'head' ? 0.06 : 0.1;
      const box = new THREE.Mesh(new THREE.BoxGeometry(size.x + grow, size.y + grow, 0.12), HITBOX_MATERIAL);
      box.position.copy(center);
      box.visible = false;
      box.userData.target = t;
      box.userData.zone = zone;
      plate.add(box);
      t.hitboxes.push(box);
    }
    root.visible = false;
    this.scene.add(root);
    this.list.push(t);
    return t;
  }

  clear() {
    for (const t of this.list) {
      t.state = 'hidden';
      t.root.visible = false;
    }
    this.hitMeshes = [];
  }

  /**
   * Stellt bis zu count Ziele an den ersten passenden Standorten aus spots auf, alle schauen zu
   * facingFrom. moving davon fahren hin und her (nur dort, wo genug Platz ist). respawn = nach so
   * vielen Sekunden am Boden klappt ein umgefallenes Ziel wieder hoch (0 = bleibt liegen)
   */
  setup(spots, count, moving, facingFrom, respawn = 0) {
    this.clear();
    this.respawn = respawn;
    let n = 0;
    for (const spot of spots) {
      if (n >= count) break;
      const place = this._place(spot, facingFrom);
      if (!place) continue;
      const t = this.list[n] ?? this._create();
      n++;
      t.spot = place.pos;
      t.off = 0;
      t.hp = 100;
      t.angle = DOWN_ANGLE;
      t.state = 'waiting';
      t.delay = 0.3 + Math.random() * 1.4;
      t.root.visible = true;
      t.root.position.copy(place.pos);
      t.root.rotation.y = place.yaw;
      t.pivot.rotation.x = t.angle;
      t.move = null;
      if (moving <= 0) continue;
      // fährt zwischen lo und hi hin und her (vom Standort aus gemessen)
      const lo = -this._reach(place, -1);
      const hi = this._reach(place, 1);
      if (hi - lo < 2 * MIN_RANGE) continue;
      moving--;
      t.move = { side: place.side, mid: (lo + hi) / 2, range: (hi - lo) / 2, speed: 1.2 + Math.random() * 0.8, phase: 0 };
    }
    this._collectMeshes();
  }

  /**
   * Wo ein Ziel an spot stehen kann, ohne in Wände, Kisten oder Treppen zu ragen (weder stehend noch
   * beim Umklappen oder liegend) und ohne über einer Kante zu schweben: stößt es hinten an, rückt es
   * ein Stück nach vorn, zu facingFrom hin. null, wenn es dort gar nicht passt.
   */
  _place(spot, facingFrom) {
    const yaw = Math.atan2(facingFrom.x - spot.x, facingFrom.z - spot.z);
    const place = {
      yaw,
      fwd: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      side: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
      pos: new THREE.Vector3(),
    };
    const steps = Math.round(MAX_PUSH / STEP);
    for (let i = 0; i <= steps; i++) {
      place.pos.copy(spot).addScaledVector(place.fwd, i * STEP);
      if (this._fits(place, 0)) return place;
    }
    return null;
  }

  /** wie weit ein Ziel von seinem Standort aus in Richtung dir (-1 links, 1 rechts) fahren kann */
  _reach(place, dir) {
    const steps = Math.round(MOVE_RANGE / STEP);
    let k = 0;
    while (k < steps && this._fits(place, dir * (k + 1) * STEP)) k++;
    return k * STEP;
  }

  /** passt das Ziel, um off zur Seite verschoben? */
  _fits(place, off) {
    const ph = this.physics;
    const { yaw, fwd, side } = place;
    const p = _p.copy(place.pos).addScaledVector(side, off);
    // Boden unter beiden Enden des Sockels
    for (const s of [-0.25, 0.25]) {
      _c.copy(p).addScaledVector(side, s);
      _c.y += 0.3;
      const hit = ph.raycast(_c, DOWN, 0.4);
      if (!hit || hit.distance > 0.35) return false;
    }
    _q.setFromEuler(_e.set(0, yaw, 0));
    _c.copy(p).addScaledVector(fwd, -0.02);
    _c.y += 0.11;
    if (ph.overlaps(this.baseShape, _c, undefined, _q)) return false;
    for (const a of SWEEP) {
      // Platte um a nach hinten geklappt (dreht sich um die Achse quer zur Blickrichtung)
      _q.setFromEuler(_e.set(-a, yaw, 0));
      _c.copy(p).addScaledVector(fwd, -PLATE_MID * Math.sin(a));
      _c.y += PIVOT_Y + PLATE_MID * Math.cos(a);
      if (ph.overlaps(this.plateShape, _c, undefined, _q)) return false;
    }
    return true;
  }

  /** bewegliches Ziel fährt beim Hochklappen dort los, wo es gerade steht (sonst springt es) */
  _startMoving(t, time) {
    const m = t.move;
    if (!m) return;
    const a = Math.asin(Math.max(-1, Math.min(1, (t.off - m.mid) / m.range)));
    // in zufällige Richtung
    m.phase = (Math.random() < 0.5 ? a : Math.PI - a) - time * m.speed;
  }

  _collectMeshes() {
    this.hitMeshes = [];
    for (const t of this.list) {
      if (t.root.visible) this.hitMeshes.push(...t.hitboxes);
    }
  }

  get remaining() {
    return this.list.filter((t) => t.root.visible && (t.state === 'waiting' || t.state === 'rising' || t.state === 'up')).length;
  }

  get total() {
    return this.list.filter((t) => t.root.visible).length;
  }

  tick(dt, time) {
    for (const t of this.list) {
      if (!t.root.visible) continue;
      if (t.state === 'waiting') {
        t.delay -= dt;
        if (t.delay <= 0) {
          t.state = 'rising';
          t.timer = 0;
          this._startMoving(t, time);
          this.audio.play('targetUp', { position: t.root.position });
        }
      } else if (t.state === 'rising') {
        t.timer += dt;
        const k = Math.min(1, t.timer / UP_TIME);
        const e = 1 - Math.pow(1 - k, 3);
        t.angle = DOWN_ANGLE * (1 - e) + Math.sin(k * Math.PI) * 0.05;
        if (k >= 1) {
          t.state = 'up';
          t.angle = 0;
        }
      } else if (t.state === 'falling') {
        t.timer += dt;
        const k = Math.min(1, t.timer / FALL_TIME);
        t.angle = DOWN_ANGLE * k * k;
        if (k >= 1) {
          t.state = 'down';
          t.timer = 0;
        }
      } else if (t.state === 'down' && this.respawn > 0) {
        t.timer += dt;
        if (t.timer >= this.respawn) {
          t.hp = 100;
          t.state = 'rising';
          t.timer = 0;
          this._startMoving(t, time);
          this.audio.play('targetUp', { position: t.root.position });
        }
      }
      if (t.move && (t.state === 'up' || t.state === 'rising')) {
        const m = t.move;
        t.off = m.mid + Math.sin(time * m.speed + m.phase) * m.range;
        t.root.position.copy(t.spot).addScaledVector(m.side, t.off);
      }
      t.pivot.rotation.x = t.angle;
    }
  }

  /** Strahl gegen alle stehenden Ziele. Liefert nächsten Treffer bis maxDist. */
  raycast(origin, dir, maxDist) {
    if (!this.hitMeshes.length) return null;
    for (const t of this.list) if (t.root.visible) t.root.updateMatrixWorld(true);
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    for (const h of hits) {
      const t = h.object.userData.target;
      if (t.state !== 'up' && t.state !== 'rising') continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
      return { target: t, zone: h.object.userData.zone, point: h.point, normal, distance: h.distance };
    }
    return null;
  }

  /** Schaden anwenden. Gibt { killed, damage } zurück. */
  damage(t, amount) {
    if (t.state !== 'up' && t.state !== 'rising') return { killed: false, damage: 0 };
    const dealt = Math.min(t.hp, amount);
    t.hp -= amount;
    if (t.hp <= 0) {
      t.state = 'falling';
      t.timer = 0;
      this.audio.play('targetDown', { position: t.root.position });
      return { killed: true, damage: dealt };
    }
    return { killed: false, damage: dealt };
  }

  /** Mittelpunkte stehender Ziele (für Granatenschaden) */
  standing() {
    return this.list.filter((t) => t.root.visible && (t.state === 'up' || t.state === 'rising'));
  }
}
