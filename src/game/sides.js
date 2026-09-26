import * as THREE from 'three';

// Teams im Mehrspieler: Rot startet im Westen, Blau im Osten (wie Host und Gast im 1 gegen 1)
export const TEAM_IDS = ['rot', 'blau'];
export const TEAM_NAMES = { rot: 'Team Rot', blau: 'Team Blau' };
export const SIDE = { rot: 'west', blau: 'east' };
export const otherTeam = (t) => (t === 'rot' ? 'blau' : 'rot');
/** Bombenmodus im Team-Spiel: in ungeraden Runden greift Rot an, in geraden Blau */
export const teamAttacker = (round) => (round % 2 === 1 ? 'rot' : 'blau');

// Startplätze im eigenen Spawn: [nach vorne, nach rechts] in Metern
const SLOTS = [[0, 0], [0, 1.8], [0, -1.8], [-1.8, 0.9]];

/** Startpunkt für Platz slot eines Teams (sp: Startpunkt der Seite) */
export function slotSpawn(sp, slot = 0) {
  const [ahead, right] = SLOTS[slot % SLOTS.length];
  const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw);
  const rx = Math.cos(sp.yaw), rz = -Math.sin(sp.yaw);
  return {
    pos: new THREE.Vector3(sp.pos.x + fx * ahead + rx * right, sp.pos.y, sp.pos.z + fz * ahead + rz * right),
    yaw: sp.yaw,
  };
}
