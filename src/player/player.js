import * as THREE from 'three';
import { MOVE, PLAYER } from '../config.js';
import { GROUP, groups } from '../engine/physics.js';

const JUMP_VEL = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight);
const DUCK_DELTA = MOVE.standHeight - MOVE.crouchHeight;
// Bewegung stößt an Welt, Rampen und den Gegner; Granaten des Gegners prallen vom Körper ab
const PLAYER_GROUPS = groups(GROUP.PLAYER, GROUP.WORLD | GROUP.CLIP | GROUP.OTHER);
const BODY_GROUPS = groups(GROUP.PLAYER, GROUP.WORLD | GROUP.CLIP | GROUP.OTHER | GROUP.GRENADE);
const DOWN = { x: 0, y: -1, z: 0 };

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

// Bewegung nach dem Vorbild der Source-Engine: Beschleunigung, Reibung, Luftsteuerung.
export class Player {
  constructor(physics, audio) {
    this.physics = physics;
    this.audio = audio;
    const R = physics.R;
    this.radius = MOVE.radius;
    this.halfStand = (MOVE.standHeight - 2 * this.radius) / 2;
    this.halfCrouch = (MOVE.crouchHeight - 2 * this.radius) / 2;
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(this.halfStand, this.radius).setCollisionGroups(BODY_GROUPS),
    );
    const c = physics.world.createCharacterController(0.02);
    c.disableAutostep();
    c.enableSnapToGround(0.35);
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(false);
    this.controller = c;
    this.standShape = new R.Capsule(this.halfStand, this.radius - 0.02);

    this.feet = new THREE.Vector3();
    this.prevFeet = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.ducked = false;
    this.duckAmount = 0;
    this.jumpBuffer = 0;
    this.stepDist = 0;
    this.landImpact = 0;
    this.maxSpeed = 5.5;
    // Sprinten: Tempo kommt von der Waffe, gesperrt beim Schießen, Zielen und Nachladen
    this.sprintSpeed = 7;
    this.sprintBlocked = false;
    // nach Schuss oder Zielen im Sprint: erst Shift loslassen, dann geht es wieder
    this.sprintSuppressed = false;
    this.sprinting = false;
    this.frozen = false;
    // beim Legen und Entschärfen der Bombe und beim Zielen für den Luftschlag: stillstehen, Waffe unten
    this.busy = false;
    this.health = PLAYER.health;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
  }

  spawn(pos, yaw) {
    this.feet.copy(pos);
    this.prevFeet.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.ducked = false;
    this.duckAmount = 0;
    this.collider.setHalfHeight(this.halfStand);
    this.onGround = true;
    this.alive = true;
    this.sprinting = false;
    this.busy = false;
    this.landImpact = 0;
    this._syncCollider();
  }

  get half() {
    return this.ducked ? this.halfCrouch : this.halfStand;
  }

  get eyeHeight() {
    return MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * this.duckAmount;
  }

  get horizontalSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  eyePosition(out, alpha = 1) {
    out.lerpVectors(this.prevFeet, this.feet, alpha);
    out.y += this.eyeHeight;
    return out;
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  _syncCollider() {
    this.collider.setTranslation({ x: this.feet.x, y: this.feet.y + this.radius + this.half, z: this.feet.z });
  }

  _standFree(feetY) {
    return !this.physics.overlaps(this.standShape, {
      x: this.feet.x, y: feetY + this.radius + this.halfStand + 0.01, z: this.feet.z,
    });
  }

  _duck() {
    this.ducked = true;
    this.collider.setHalfHeight(this.halfCrouch);
    if (!this.onGround) {
      // in der Luft werden die Beine angezogen, der Kopf bleibt stehen
      this.feet.y += DUCK_DELTA;
      this.prevFeet.y += DUCK_DELTA;
      this.duckAmount = 1;
    }
    this._syncCollider();
  }

  _tryUnduck() {
    if (!this.onGround && this._standFree(this.feet.y - DUCK_DELTA)) {
      this.feet.y -= DUCK_DELTA;
      this.prevFeet.y -= DUCK_DELTA;
      this.duckAmount = 0;
    } else if (!this._standFree(this.feet.y)) {
      return;
    }
    this.ducked = false;
    this.collider.setHalfHeight(this.halfStand);
    this._syncCollider();
  }

  _friction(dt) {
    const speed = this.horizontalSpeed;
    if (speed < 0.01) {
      this.vel.x = this.vel.z = 0;
      return;
    }
    const control = Math.max(speed, MOVE.stopSpeed);
    const drop = control * MOVE.friction * dt;
    const k = Math.max(speed - drop, 0) / speed;
    this.vel.x *= k;
    this.vel.z *= k;
  }

  _accelerate(wishdir, wishspeed, accel, dt, cap = Infinity) {
    const capped = Math.min(wishspeed, cap);
    const current = this.vel.x * wishdir.x + this.vel.z * wishdir.z;
    const add = capped - current;
    if (add <= 0) return;
    const step = Math.min(accel * dt * wishspeed, add);
    this.vel.x += step * wishdir.x;
    this.vel.z += step * wishdir.z;
  }

  tick(dt, input) {
    this.prevFeet.copy(this.feet);
    if (!this.alive) return;

    const walk = input.isDown('walk');
    const still = this.frozen || this.busy;
    let f = 0, s = 0;
    if (!still) {
      // Tastatur und Stick (Touch) zusammen; der Stick liefert Zwischenwerte
      f = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0) + input.moveY;
      s = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0) + input.moveX;
      if (input.consume('jump')) this.jumpBuffer = 0.12;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const wantDuck = input.isDown('crouch');
    if (wantDuck && !this.ducked) this._duck();
    else if (!wantDuck && this.ducked) this._tryUnduck();
    const duckTarget = this.ducked ? 1 : 0;
    const rate = dt / MOVE.duckTime;
    this.duckAmount += Math.max(-rate, Math.min(rate, duckTarget - this.duckAmount));

    // Sprinten nur vorwärts und im Stehen; in der Luft läuft ein Sprint weiter, beginnt aber nicht
    if (!input.isDown('sprint')) this.sprintSuppressed = false;
    const wantSprint = !still && input.isDown('sprint') && f > 0 && !this.ducked && !walk
      && !this.sprintBlocked && !this.sprintSuppressed;
    this.sprinting = wantSprint && (this.onGround || this.sprinting);

    let maxSpeed = this.maxSpeed;
    if (this.sprinting) maxSpeed = this.sprintSpeed;
    else if (this.ducked) maxSpeed *= MOVE.crouchMul;
    else if (walk) maxSpeed *= MOVE.walkMul;

    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s);
    // Tasten geben volles Tempo, ein halb gedrückter Stick nur halbes (und damit leise Schritte)
    const amount = Math.min(1, _wish.length());
    if (amount > 0) _wish.normalize();
    const wishspeed = maxSpeed * amount;

    if (this.onGround && this.jumpBuffer > 0) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
      this.jumpBuffer = 0;
    }
    if (this.onGround) {
      this._friction(dt);
      this._accelerate(_wish, wishspeed, MOVE.accelerate, dt);
      this.vel.y = -1.5;
    } else {
      this._accelerate(_wish, wishspeed, MOVE.airAccelerate, dt, MOVE.airWishCap);
      this.vel.y -= MOVE.gravity * dt;
    }
    if (still && this.onGround) this.vel.x = this.vel.z = 0;

    // Zwei Durchgänge: erst waagerecht, dann senkrecht. In einem gemeinsamen Durchgang
    // wertet Rapier den Bodenkontakt sonst sporadisch als Hindernis und bremst den Spieler.
    const c = this.controller;
    this._move(this.vel.x * dt, 0, this.vel.z * dt);
    this._clipAgainstWalls();

    const dy = this.vel.y * dt;
    const mv = this._move(0, dy, 0);
    const grounded = c.computedGrounded();
    if (this.vel.y > 0 && mv.y < dy - 1e-4) this.vel.y = 0;

    const wasGround = this.onGround;
    this.onGround = grounded && this.vel.y <= 0.01;
    if (this.onGround && !wasGround) {
      const fall = -this.vel.y;
      if (fall > 4) {
        this.landImpact = Math.min(1, fall / 12);
        this.audio.play('land', { position: this.feet, volume: Math.min(1, fall / 10) });
      }
    }

    // Schritte sind nur beim Rennen hörbar, Schleichen (Shift) und Ducken sind leise
    const speed = this.horizontalSpeed;
    if (this.onGround && speed > this.maxSpeed * 0.6 && !this.ducked) {
      this.stepDist += speed * dt;
      if (this.stepDist > 2.0) {
        this.stepDist = 0;
        const hit = this.physics.raycast({ x: this.feet.x, y: this.feet.y + 0.2, z: this.feet.z }, DOWN, 0.6);
        this.audio.play('step', { position: this.feet, surface: hit?.surface || 'sand', volume: this.sprinting ? 1.3 : 1 });
      }
    }
    this.landImpact = Math.max(0, this.landImpact - dt * 3);
  }

  // Wie ClipVelocity in Source: nur an Wänden den Anteil in die Wand hinein entfernen,
  // an begehbaren Hängen (Rampe) bleibt das Tempo erhalten.
  _clipAgainstWalls() {
    const c = this.controller;
    for (let i = 0; i < c.numComputedCollisions(); i++) {
      const n = c.computedCollision(i)?.normal1;
      if (!n || Math.abs(n.y) >= 0.7) continue;
      let nx = n.x, nz = n.z;
      const len = Math.hypot(nx, nz);
      if (len < 1e-4) continue;
      nx /= len;
      nz /= len;
      let d = this.vel.x * nx + this.vel.z * nz;
      if (d > 0) {
        nx = -nx;
        nz = -nz;
        d = -d;
      }
      this.vel.x -= nx * d;
      this.vel.z -= nz * d;
    }
  }

  _move(x, y, z) {
    this.controller.computeColliderMovement(this.collider, { x, y, z }, undefined, PLAYER_GROUPS);
    const m = this.controller.computedMovement();
    this.feet.x += m.x;
    this.feet.y += m.y;
    this.feet.z += m.z;
    this._syncCollider();
    return { x: m.x, y: m.y, z: m.z };
  }

  // Weste schützt den Körper, den Kopf nur mit Helm, die Beine nie (wie in CS)
  applyDamage(amount, { armorPen = 0.5, head = false, legs = false } = {}) {
    if (!this.alive) return 0;
    let dmg = amount;
    if (this.armor > 0 && !legs && (!head || this.helmet)) {
      let healthDmg = dmg * armorPen;
      let armorDmg = (dmg - healthDmg) * 0.5;
      if (armorDmg > this.armor) {
        armorDmg = this.armor;
        healthDmg = dmg - armorDmg * 2;
      }
      this.armor = Math.max(0, Math.round(this.armor - armorDmg));
      dmg = healthDmg;
    }
    // zurück kommt nur, was wirklich abgezogen wurde (kein Überschuss beim letzten Treffer)
    dmg = Math.min(this.health, Math.max(0, Math.round(dmg)));
    this.health -= dmg;
    if (this.health <= 0) this.alive = false;
    return dmg;
  }
}
