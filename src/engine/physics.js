import RAPIER from '@dimforge/rapier3d-compat';
import { TICK } from '../config.js';

// STAIR: sichtbare Treppenstufen, nur für Kugeln und Granaten
// CLIP: unsichtbare Rampen über den Treppen, nur für den Spieler
// OTHER: Körper des Gegners im 1 gegen 1 (Kugeln treffen ihn über eigene Trefferzonen)
export const GROUP = { WORLD: 0x0001, PLAYER: 0x0002, GRENADE: 0x0004, STAIR: 0x0008, CLIP: 0x0010, OTHER: 0x0020 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

const WORLD_ONLY = groups(0xffff, GROUP.WORLD | GROUP.STAIR);
const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };
/** alles Feste inklusive der unsichtbaren Rampen (für das Wegenetz der KI) */
export const SOLID = groups(0xffff, GROUP.WORLD | GROUP.STAIR | GROUP.CLIP);

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = TICK;
    this.fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.surfaces = new Map();
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  _add(desc, surface, center, quat, member = GROUP.WORLD) {
    desc.setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(member, 0xffff))
      .setFriction(0.8);
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const c = this.world.createCollider(desc, this.fixed);
    this.surfaces.set(c.handle, surface);
    return c;
  }

  addBox(center, half, surface, quat, member) {
    return this._add(this.R.ColliderDesc.cuboid(half.x, half.y, half.z), surface, center, quat, member);
  }

  addCylinder(center, halfHeight, radius, surface) {
    return this._add(this.R.ColliderDesc.cylinder(halfHeight, radius), surface, center);
  }

  /** Strahl gegen die feste Welt. dir muss normiert sein. */
  raycast(origin, dir, maxDist) {
    const r = this._ray;
    r.origin = { x: origin.x, y: origin.y, z: origin.z };
    r.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(r, maxDist, true, undefined, WORLD_ONLY);
    if (!hit) return null;
    return {
      distance: hit.timeOfImpact,
      normal: hit.normal,
      surface: this.surfaces.get(hit.collider.handle) || 'stone',
    };
  }

  /** true, wenn zwischen a und b nichts Festes liegt */
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const hit = this.raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len);
    return !hit || hit.distance >= len - 0.05;
  }

  /** prüft, ob eine Form an dieser Stelle (gedreht um rot) etwas Festes überlappt */
  overlaps(shape, pos, filter = WORLD_ONLY, rot = NO_ROT) {
    return !!this.world.intersectionWithShape(pos, rot, shape, undefined, filter);
  }

  step() {
    this.world.step();
  }
}
