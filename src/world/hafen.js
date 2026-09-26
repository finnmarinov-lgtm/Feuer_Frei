import * as THREE from 'three';
import { BOX, T, container, forklift, spawns } from './parts.js';

// ---------- Hafen ----------
// Große, offene Karte für 3 gegen 3 und 4 gegen 4: eine Mole (88 x 59 m zum Laufen) mit Wasser an
// beiden Längsseiten, an den Enden je ein Speicher aus Backstein hinter dem Startpunkt. Punktsymmetrisch
// wie die anderen Karten: alles aus der Westhälfte steht gespiegelt auch in der Osthälfte.
// - Kranbahn: breite Straße in der Mitte mit dem Portalkran (an ihm hängt ein Container) und je
//   einem Sattelzug.
// - Stapelfeld (Norden der Westhälfte): Containerreihen mit Gassen, ein Container mit Treppe als
//   Ausguck.
// - Umschlagplatz (Süden der Westhälfte): offen, mit dem Bombenplatz, der Hafenmeisterei (aufs Dach
//   führt eine Treppe, die Brüstung schützt geduckt) und einem Gabelstapler.
// - Kaikanten: breite Wege am Wasser mit Pollern; eine unsichtbare Wand hält einen an Land.

// Farben (Tönung der Texturen bzw. Anstrich)
const H = {
  brick: [1.0, 0.64, 0.52], plaster: [1.0, 0.95, 0.86], crane: [0.95, 0.66, 0.08],
  dark: [0.08, 0.08, 0.09], steel: [0.33, 0.35, 0.37], cab: [0.7, 0.1, 0.07], gate: [0.2, 0.3, 0.26],
};
// Containerfarben, der Reihe nach vergeben
const PAINT = [
  [0.58, 0.12, 0.08], [0.1, 0.23, 0.48], [0.13, 0.36, 0.2], [0.86, 0.4, 0.08],
  [0.78, 0.78, 0.75], [0.08, 0.38, 0.42], [0.4, 0.42, 0.44], [0.38, 0.58, 0.78], [0.55, 0.1, 0.28],
];
const { long: L, short: S, tiny: S10, w: W, level: LV } = BOX;

function hafenLayout({ B, mirror, cap }) {
  // ---- Mole: Boden (nur Kollision, gezeichnet wird er extra), Kaimauern, Kante, Poller ----
  B(-47, 47, -1, 0, -30, 30, 'ground');
  mirror(-46.9, 46.9, -2.6, 0, 30, 30.35, 'concrete');
  mirror(-46.9, 46.9, 0, 0.2, 29.8, 30.35, 'concrete', { tint: [0.85, 0.83, 0.8] });
  // unsichtbare Wand vor der Kante, nur für Spieler (Kugeln und Granaten fliegen hindurch)
  mirror(-44, 44, 0, 3, 29.5, 29.8, null, { collider: 'clip' });
  for (let x = -40; x <= 40; x += 8) {
    mirror(x - 0.19, x + 0.19, 0.2, 0.78, 29.88, 30.26, 'paint', { tint: H.dark });
    mirror(x - 0.25, x + 0.25, 0.78, 0.86, 29.82, 30.32, 'paint', { tint: H.dark });
  }
  // Fender aus Gummi außen an der Kaimauer
  for (const x of [-36, -20, -4, 12, 28]) mirror(x - 1.1, x + 1.1, -1.15, -0.3, 30.35, 30.6, 'paint', { tint: H.dark, collider: 'none' });

  // ---- Speicher aus Backstein hinter den Startpunkten ----
  // (steht 5 cm über die Kaimauer hinaus, damit keine Flächen aufeinanderliegen)
  mirror(-47, -44, -2.6, 11, -30.4, 30.4, 'sandstone', { tint: H.brick });
  cap(-47, -44, -30.4, 30.4, 11, mirror);
  for (const z of [-27, -18, -9, 9, 18, 27]) mirror(-44, -43.7, 0, 11, z - 0.45, z + 0.45, 'sandstone', { tint: H.brick });
  for (const z of [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5]) {
    for (const [y0, y1] of [[4.4, 6.4], [7.8, 9.8]]) {
      if (y0 < 7 && Math.abs(z) < 6) continue;
      mirror(-44.02, -43.97, y0, y1, z - 1.2, z + 1.2, 'glass', { collider: 'none' });
      mirror(-44.04, -43.88, y0 - 0.14, y0, z - 1.35, z + 1.35, 'concrete', { collider: 'none' });
      mirror(-44.03, -43.94, y1, y1 + 0.28, z - 1.35, z + 1.35, 'concrete', { collider: 'none' });
    }
  }
  // Ladetor hinter dem Startpunkt
  mirror(-44.03, -43.96, 0, 4.4, -3.2, 3.2, 'sheet', { tint: H.gate, collider: 'none' });
  mirror(-44.05, -43.9, 4.4, 4.7, -3.4, 3.4, 'concrete', { collider: 'none' });
  for (const z of [-3.4, 3.2]) mirror(-44.05, -43.9, 0, 4.4, z, z + 0.2, 'concrete', { collider: 'none' });

  // ---- Container ----
  let n = 0;
  const box = (x, z, len, ax, lv, door = 1) => container(mirror, x, z, len, ax, lv * LV, PAINT[n++ % PAINT.length], door);
  // Block aus rows Reihen nebeneinander (quer zu X) und levels Lagen übereinander
  const stack = (x, z, len, rows, levels) => {
    for (let r = 0; r < rows; r++) {
      for (let lv = 0; lv < levels; lv++) box(x, z + r * (W + 0.1), len, true, lv, (r + lv) % 2 ? 1 : -1);
    }
  };
  // vor dem Startpunkt quer: versperrt die Sicht über die Kranbahn zum anderen Startpunkt; vor den
  // beiden Ausgängen daneben je eine Wand, um die man herumgeht (sonst sähe man vom Startbereich
  // schräg bis weit in die andere Hälfte)
  for (const lv of [0, 1]) box(-30.24, -L / 2, L, false, lv);
  box(-25.2, 6.5, S10, false, 0);
  box(-25.2, -9.49, S, false, 0);
  // Reihe A (Norden, zwei Container breit): am Startpunkt, im Stapelfeld und der Ausguck
  stack(-41, 9.6, L, 2, 2);
  stack(-25.5, 9.6, S, 2, 2);
  stack(-9, 9.6, S, 2, 1);
  // Reihe B (Norden, einer breit), dazwischen die Gasse
  stack(-41, 18.5, L, 1, 1);
  stack(-25.5, 18.5, L, 1, 2);
  stack(-10, 18.5, S, 1, 1);
  // Süden: Block am Startpunkt, Sichtschutz zur Kranbahn, Container an beiden Seiten des Bombenplatzes
  // (der östliche unterbricht auch die lange Gasse) und in der Ecke am Wasser
  stack(-41, -9.6 - 2 * W - 0.1, L, 2, 2);
  stack(-23, -12.4, S, 1, 2);
  box(-13.4, -23.2, S, false, 0);
  box(-3.5, -19.5, S, false, 0);
  stack(-41, -27, S, 2, 1);
  // Kaiwege: Container direkt an der Kante und in der Mitte, damit man nicht von einem Ende bis
  // zum anderen schauen kann
  box(-17, -29.44, S, true, 0);
  box(-22, 27, S, true, 0);
  box(-33, 20.94, S, true, 0);
  box(-L / 2, 23.3, L, true, 0);
  // unter dem Kran: steht bereit, der hängende soll darauf (versperrt die Sicht längs der Kranbahn)
  container(B, -W / 2, -S / 2, S, false, 0, PAINT[6]);

  // ---- Treppe auf den Ausguck (Container im Stapelfeld), aus Stahl, seitlich zu ----
  for (let k = 0; k < 10; k++) {
    const x1 = -9 - 0.5 * k;
    mirror(x1 - 0.5, x1, 0, 2.6 * (1 - (k + 0.5) / 10), 13.1, 14.5, 'paint', { tint: H.steel, collider: 'stair' });
  }
  for (const [z0, z1] of [[12.98, 13.1], [14.5, 14.62]]) mirror(-14, -9, 0, 3.8, z0, z1, null, { collider: 'clip' });
  for (const z of [13.03, 14.53]) {
    for (const x of [-13.8, -12.4, -11, -9.6]) {
      mirror(x, x + 0.05, 0, 1.0 + 2.6 * (x + 14) / 5, z - 0.03, z + 0.03, 'paint', { tint: T.yellow, collider: 'none' });
    }
  }

  // ---- Sattelzug auf der Kranbahn: Auflieger mit Container, davor die Zugmaschine (nach +X) ----
  const truck = (x0, z0) => {
    const z1 = z0 + 2.5;
    mirror(x0, x0 + 12.2, 0.95, 1.25, z0 + 0.3, z1 - 0.3, 'paint', { tint: H.dark });
    // unter dem Auflieger nur für Spieler zu: Kugeln fliegen zwischen den Rädern durch
    mirror(x0, x0 + 12.2, 0, 0.95, z0, z1, null, { collider: 'clip' });
    container(mirror, x0 + 0.005, z0 + 0.03, L, true, 1.25, PAINT[3], -1);
    for (const x of [x0 + 0.7, x0 + 1.75, x0 + 2.8]) {
      for (const [a, b] of [[z0, z0 + 0.55], [z1 - 0.55, z1]]) mirror(x - 0.48, x + 0.48, 0, 0.96, a, b, 'paint', { tint: H.dark });
    }
    for (const z of [z0 + 0.5, z1 - 0.6]) mirror(x0 + 8.6, x0 + 8.7, 0, 0.95, z, z + 0.1, 'paint', { tint: H.dark, collider: 'none' });
    mirror(x0 + 10.6, x0 + 15, 0.45, 0.95, z0 + 0.35, z1 - 0.35, 'paint', { tint: H.dark });
    mirror(x0 + 12.4, x0 + 15, 0.95, 3.35, z0, z1, 'paint', { tint: H.cab });
    for (const x of [x0 + 11.6, x0 + 14.25]) {
      for (const [a, b] of [[z0 - 0.02, z0 + 0.5], [z1 - 0.5, z1 + 0.02]]) mirror(x - 0.5, x + 0.5, 0, 1.0, a, b, 'paint', { tint: H.dark });
    }
    mirror(x0 + 14.99, x0 + 15.02, 2.05, 3.05, z0 + 0.18, z1 - 0.18, 'glass', { collider: 'none' });
    for (const [a, b] of [[z0 - 0.02, z0 + 0.01], [z1 - 0.01, z1 + 0.02]]) mirror(x0 + 13.6, x0 + 14.8, 2.05, 2.95, a, b, 'glass', { collider: 'none' });
    mirror(x0 + 15, x0 + 15.06, 1.05, 1.85, z0 + 0.45, z1 - 0.45, 'paint', { tint: H.dark, collider: 'none' });
  };
  truck(-22.5, 4.4);

  // ---- Portalkran über der Mitte: vier Beine auf Fahrwerken, oben Träger und Laufkatze mit
  // Kabine, darunter hängt ein Container ----
  for (const x of [-6.5, 5.5]) {
    mirror(x, x + 1, 0.9, 15.6, 8.4, 9.4, 'paint', { tint: H.crane });
    mirror(x - 0.8, x + 1.8, 0, 0.9, 8.3, 9.5, 'paint', { tint: H.dark });
  }
  mirror(-6.5, 6.5, 15.6, 16.8, 8.4, 9.4, 'paint', { tint: H.crane });
  mirror(-6.3, -5.7, 16.8, 17.6, -9.4, 9.4, 'paint', { tint: H.crane });
  B(-6.5, 6.5, 17.6, 18.5, -1.5, 1.5, 'paint', { tint: H.crane });
  B(-1.1, 1.1, 15.2, 17.6, -1, 1, 'paint', { tint: PAINT[4] });
  B(-1.13, 1.13, 15.6, 16.9, -1.03, 1.03, 'glass', { collider: 'none' });
  for (const z of [0.86, -0.94]) mirror(4.46, 4.54, 9.3, 17.6, z, z + 0.08, 'paint', { tint: H.dark, collider: 'none' });
  B(-6.2, 6.2, 9.02, 9.3, -1.32, 1.32, 'paint', { tint: H.crane });
  container(B, -L / 2, -W / 2, L, true, 6.4, PAINT[1]);

  // ---- Hafenmeisterei: flaches Haus, auf dem Dach eine Brüstung (stehend schaut man darüber,
  // geduckt ist man dahinter geschützt), Treppe an der Westseite ----
  mirror(-27, -20, 0, 3.45, -22, -17, 'plaster', { tint: H.plaster });
  mirror(-27.1, -19.9, 3.45, 3.6, -22.1, -16.9, 'concrete');
  mirror(-27.1, -19.9, 3.6, 4.9, -17.1, -16.9, 'plaster', { tint: H.plaster });
  mirror(-27.1, -19.9, 3.6, 4.9, -22.1, -21.9, 'plaster', { tint: H.plaster });
  mirror(-20.1, -19.9, 3.6, 4.9, -21.9, -17.1, 'plaster', { tint: H.plaster });
  mirror(-27.1, -26.9, 3.6, 4.9, -20.15, -17.1, 'plaster', { tint: H.plaster });
  for (const x of [-25.4, -22.2]) {
    mirror(x - 0.8, x + 0.8, 1.1, 2.4, -17.02, -16.96, 'glass', { collider: 'none' });
    mirror(x - 0.8, x + 0.8, 1.1, 2.4, -22.04, -21.98, 'glass', { collider: 'none' });
  }
  mirror(-20.02, -19.96, 1.1, 2.4, -21.3, -20.1, 'glass', { collider: 'none' });
  mirror(-20.03, -19.96, 0, 2.2, -19.1, -17.9, 'sheet', { tint: H.gate, collider: 'none' });
  for (let k = 0; k < 14; k++) {
    const x1 = -27.1 - 0.5 * k;
    mirror(x1 - 0.5, x1, 0, 3.6 * (1 - (k + 0.5) / 14), -21.75, -20.25, 'concrete', { collider: 'stair' });
  }
  for (const [z0, z1] of [[-21.85, -21.75], [-20.25, -20.15]]) mirror(-34.1, -27.1, 0, 5, z0, z1, null, { collider: 'clip' });
  for (const z of [-21.8, -20.2]) {
    for (const x of [-33.9, -32.1, -30.3, -28.5, -27.3]) {
      mirror(x, x + 0.05, 0, 1.0 + 3.6 * (x + 34.1) / 7, z - 0.03, z + 0.03, 'paint', { tint: T.yellow, collider: 'none' });
    }
  }

  // ---- Gabelstapler am Bombenplatz, Lichtmasten ----
  forklift(mirror, -16, -15.5);
  for (const [x, z] of [[-36, 23.5], [-14, 23.5], [0, 21.6], [-28, -25], [-9, -25]]) {
    mirror(x - 0.3, x + 0.3, 0, 0.45, z - 0.3, z + 0.3, 'concrete');
    mirror(x - 0.12, x + 0.12, 0.45, 13, z - 0.12, z + 0.12, 'paint', { tint: H.steel });
    mirror(x - 0.9, x + 0.9, 13, 13.28, z - 0.35, z + 0.35, 'paint', { tint: H.dark });
    mirror(x - 0.8, x + 0.8, 12.96, 13, z - 0.27, z + 0.27, 'lamp', { collider: 'none' });
  }
}

export const HAFEN = {
  id: 'hafen',
  name: 'Hafen',
  airstrike: true,
  desc: 'Groß und offen: Containerhafen auf einer Mole mit Wasser zu beiden Seiten, Kran in der Mitte. Für 3 gegen 3 und 4 gegen 4.',
  ground: 'concrete',
  // die Kranbahn in der Mitte ist asphaltiert (dunkler)
  groundTint: (x, z) => (Math.abs(z) < 9.4 ? 0.74 : 1),
  bounds: { x0: -44, x1: 44, z0: -30, z1: 30 },
  size: [94, 60],
  shadow: 56,
  water: -1.4,
  spawns: spawns(38),
  // Bombenplätze auf den Umschlagplätzen nah an der Mitte, vom Startpunkt aus nicht zu sehen
  sites: { west: new THREE.Vector3(-8, 0, -16), east: new THREE.Vector3(8, 0, 16) },
  buyZones: { west: { x0: -44, x1: -30.3, z0: -9.6, z1: 9.6 }, east: { x0: 30.3, x1: 44, z0: -9.6, z1: 9.6 } },
  targets: [
    [-19, 8, 0], [-15, -2, 0], [-6, 4, 0], [3, -2, 0], [2, 12.5, 0], [-5.5, -17.5, 0], [-8, -16, 0], [-16, -19.5, 0],
    [-24, 25, 0], [-17, 16.5, 0], [-6, 12, 2.6], [-23.5, -19.5, 3.6], [7, -12, 2.6], [12, 2, 0], [20, -2.5, 0],
    [11, 24.5, 0], [18, -16.5, 0], [8, 16, 0], [24, 13, 0], [33, 17, 0], [40, -5, 0], [-37, -19.5, 0], [-30, 16.5, 0],
    [-8, -27.5, 0], [3, 27, 0], [-3, 21.5, 0], [30, -25, 0],
  ],
  // Treppen: [x unten, x oben, Höhe oben, z0, z1] (Ausguck, Dach der Hafenmeisterei)
  ramps: [[-14, -9, 2.6, 13.1, 14.5], [-34.1, -27.1, 3.6, -21.75, -20.25]],
  rails: [
    [-14, 1.0, -9, 3.6, 13.03], [-14, 1.0, -9, 3.6, 14.53],
    [-34.1, 1.0, -27.1, 4.6, -21.8], [-34.1, 1.0, -27.1, 4.6, -20.2],
  ],
  layout: hafenLayout,
  props: [
    // am Startpunkt
    ['Crate_L', -42.8, -5.6, 0.05, 0], ['Crate_S', -42.7, -5.5, 0.3, 1.3], ['Crate_S', -41.3, -6.3, 0.1, 0],
    ['Barrel_01', -37, 8.9, 0.4, 0], ['barrel_03', -36.2, 9.1, 1.1, 0],
    // Kranbahn: Kistenstapel (höher als Augenhöhe) in den Randstreifen und neben dem Container
    // unter dem Kran
    ['Crate_L', -17, -7.2, 0.1, 0], ['Crate_S', -17.1, -7.1, -0.25, 1.3], ['Crate_S', -15.7, -7.5, 0.2, 0],
    ['Crate_L', -17.9, -8.4, 0.2, 0], ['Crate_S', -17.8, -8.3, 0.5, 1.3],
    ['Crate_L', -0.6, 3.75, 0.08, 0], ['Crate_S', -0.5, 3.8, 0.3, 1.3],
    ['concrete_road_barrier', -20.5, -2.8, 0.25, 0], ['concrete_road_barrier', -8.5, -6, Math.PI / 2, 0],
    ['Barrel_01', -22, 8.2, 0.3, 0], ['barrel_03', -21.3, 8.7, 1.4, 0],
    // Umschlagplatz und Bombenplatz
    ['Crate_L', -5.2, -12.6, 0.12, 0], ['Crate_S', -5.1, -12.5, -0.2, 1.3], ['Crate_S', -3.9, -12.9, 0.3, 0],
    ['old_military_crate', -10, -12.8, 0.4, 0], ['wooden_crate_02', -7.2, -20.6, 0.2, 0],
    ['Barrel_01', -5.3, -21.6, 0.5, 0], ['barrel_03', -4.6, -22.2, 1.8, 0], ['metal_jerrycan', -16.8, -13.6, 0.9, 0],
    ['concrete_road_barrier', -15.5, -21, Math.PI / 2, 0],
    // an den Kaikanten
    ['Crate_L', -9, 26.3, 0.05, 0], ['Crate_S', -9, 26.3, 0.4, 1.3], ['Crate_L', -7.7, 27.5, -0.1, 0],
    ['Crate_S', -7.6, 27.4, 0.2, 1.3],
    ['Barrel_01', -36.5, 22.4, 0.2, 0], ['barrel_03', -35.8, 22, 1, 0], ['wooden_crate_02', -26, 27.8, 0.3, 0],
    ['Crate_L', -33.2, -27.3, 0.1, 0], ['Crate_S', -32, -27.6, 0.4, 0], ['Barrel_01', -24.2, -28.4, 0.6, 0],
  ],
  // Rundflug hinter dem Hauptmenü
  menu: { rx: 36, rz: 24, y: 17, look: [0, 3, 0] },
  // KI: Stellen zwischen den Hälften (Kranbahn, beide Seiten, beide Kaiwege) und wohin sie beim
  // Verteidigen ihres Platzes schaut (von der Kranbahn, von beiden Seiten des Containers davor, vom Kai)
  bot: {
    lanes: [[3, 6], [0, 13], [0, -17], [0, 27.8], [2, -22.5], [-6, 6]],
    watch: [[3, 8, 5, 9], [0, 4, 10.5, 13], [0, 4, 20, 23], [4, 10, 23, 28]],
  },
};
