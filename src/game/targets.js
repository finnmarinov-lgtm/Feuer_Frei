import * as THREE from 'three';

const UP_TIME = 0.35;
const FALL_TIME = 0.45;
const DOWN_ANGLE = -Math.PI / 2;
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

// Klappziele aus Stahl: Kopf- und Körperplatte, klappen hoch, fallen bei 0 Lebenspunkten nach hinten um.
export class Targets {
  constructor(scene, template, audio, effects) {
    this.scene = scene;
    this.template = template;
    this.audio = audio;
    this.effects = effects;
    this.list = [];
    this.raycaster = new THREE.Raycaster();
    this.hitMeshes = [];
    // so viele Sekunden nach dem Umfallen klappt ein Ziel wieder hoch (0 = bleibt liegen)
    this.respawn = 0;
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
   * Stellt Ziele an den Standorten auf. moving = Anzahl beweglicher Ziele, respawn = nach so vielen
   * Sekunden am Boden klappt ein umgefallenes Ziel wieder hoch (0 = bleibt liegen)
   */
  setup(spots, moving, facingFrom, respawn = 0) {
    this.clear();
    this.respawn = respawn;
    while (this.list.length < spots.length) this._create();
    spots.forEach((spot, i) => {
      const t = this.list[i];
      t.spot = spot.clone();
      t.hp = 100;
      t.angle = DOWN_ANGLE;
      t.state = 'waiting';
      t.delay = 0.3 + Math.random() * 1.4;
      t.root.visible = true;
      t.root.position.copy(spot);
      t.root.rotation.y = Math.atan2(facingFrom.x - spot.x, facingFrom.z - spot.z);
      t.pivot.rotation.x = t.angle;
      t.move = null;
      if (i < moving) {
        const side = new THREE.Vector3(Math.cos(t.root.rotation.y), 0, -Math.sin(t.root.rotation.y));
        t.move = { side, range: 1.4, speed: 1.2 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2 };
      }
    });
    this._collectMeshes();
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
          this.audio.play('targetUp', { position: t.root.position });
        }
      }
      if (t.move && (t.state === 'up' || t.state === 'rising')) {
        const off = Math.sin(time * t.move.speed + t.move.phase) * t.move.range;
        t.root.position.copy(t.spot).addScaledVector(t.move.side, off);
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
