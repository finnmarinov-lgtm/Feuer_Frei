import * as THREE from 'three';
import { GROUP } from '../engine/physics.js';
import { T, forklift, spawns } from './parts.js';
import { HAFEN } from './hafen.js';

// Drei Arenen, alle punktsymmetrisch um die Mitte: der Host startet im Westen, der Gast gespiegelt
// im Osten (im Training startet man im Westen). Alle Angaben in Metern, y = Höhe.
// - "Hof": sandiger Innenhof mit zwei Gassen, Tunnel durch das Gebäude in der Mitte und Balkon.
// - "Lagerhalle": Halle mit Hochregalen, Büro-Container in der Mitte, Laufsteg und Dach mit
//   Lichtbändern, davor je ein Hof mit dem Startpunkt.
// - "Hafen" (hafen.js): große, offene Mole mit Containerstapeln, Kran und Wasser zu beiden Seiten.
// Die ersten beiden sind 60 x 40 m groß; wer größer ist, gibt bounds (Wegenetz der KI), size (Boden)
// und shadow (Radius, den die Schatten abdecken) an. water: Höhe des Wassers rund um die Karte.

const MATS = {
  ground: { tex: 'sandy_gravel_02', tile: 3.0, surface: 'sand' },
  sandstone: { tex: 'sandstone_blocks_08', tile: 2.6, surface: 'stone' },
  plaster: { tex: 'patterned_clay_plaster', tile: 2.6, surface: 'stone' },
  concrete: { tex: 'concrete_floor_worn_001', tile: 2.2, surface: 'stone' },
  metal: { tex: 'rusty_corrugated_iron', tile: 2.4, surface: 'metal' },
  // gestrichenes Trapezblech: nur das Relief der Wellblech-Textur, Farbe aus tint
  sheet: { tex: 'rusty_corrugated_iron', tile: 2.4, surface: 'metal' },
  // glatter Anstrich ohne Textur (Regale, Stapler, Geländer), die Farbe kommt aus tint
  paint: { surface: 'metal' },
  glass: { surface: 'stone' },
  lamp: { surface: 'metal' },
};

// ---------- Hof ----------

function hofLayout({ B, mirror, wall, cap }) {
  // Boden und Außenmauern
  B(-33, 33, -1, 0, -23, 23, 'ground');
  B(-31, 31, 0, 7, -21, -20, 'sandstone');
  B(-31, 31, 0, 7, 20, 21, 'sandstone');
  B(-31, -30, 0, 7, -20, 20, 'sandstone');
  B(30, 31, 0, 7, -20, 20, 'sandstone');
  cap(-31, 31, -21, -20, 7);
  cap(-31, 31, 20, 21, 7);
  cap(-31, -30, -20, 20, 7);
  cap(30, 31, -20, 20, 7);
  B(-30, 30, 0, 0.35, -20, -19.92, 'concrete');
  B(-30, 30, 0, 0.35, 19.92, 20, 'concrete');
  B(-30, -29.92, 0, 0.35, -19.92, 19.92, 'concrete');
  B(29.92, 30, 0, 0.35, -19.92, 19.92, 'concrete');

  // Trennmauern zwischen Mitte und den Gassen, jeweils mit Durchgang
  wall(-22, -16, -8.3, -7.7, 4, 'plaster', mirror);
  wall(-14, -6, -8.3, -7.7, 4, 'plaster', mirror);
  mirror(-16, -14, 2.7, 4, -8.3, -7.7, 'plaster');
  cap(-22, -6, -8.3, -7.7, 4, mirror);
  wall(-22, -11, 7.7, 8.3, 4, 'plaster', mirror);
  wall(-9, -6, 7.7, 8.3, 4, 'plaster', mirror);
  mirror(-11, -9, 2.7, 4, 7.7, 8.3, 'plaster');
  cap(-22, -6, 7.7, 8.3, 4, mirror);

  // Gebäude in der Mitte mit Tunnel
  wall(-4, 4, -5, -1.4, 5, 'plaster', mirror);
  B(-4, 4, 3, 5, -1.4, 1.4, 'plaster');
  cap(-4, 4, -5, 5, 5);
  B(-4, 4, 0, 0.012, -1.4, 1.4, 'concrete', { collider: 'none' });
  // angedeutete Fenster (dunkles Glas mit Betonsims)
  for (const x of [-2.2, 2.2]) {
    mirror(x - 0.6, x + 0.6, 3.1, 4.3, -5.03, -5.0, 'glass');
    mirror(x - 0.7, x + 0.7, 2.98, 3.1, -5.12, -5.0, 'concrete');
  }

  // Podest (Balkon) mit Treppe und Brüstung, im Westen der Südgasse bzw. gespiegelt im Osten der Nordgasse
  mirror(-30, -18, 0, 2.4, 14.5, 20, 'concrete');
  for (let k = 0; k < 7; k++) {
    mirror(-18 + 0.55 * k, -18 + 0.55 * (k + 1), 0, 2.1 - 0.3 * k, 16.3, 19.9, 'concrete', { collider: 'stair' });
  }
  mirror(-30, -18, 2.4, 3.45, 14.5, 14.8, 'concrete');
  mirror(-18.3, -18, 2.4, 3.45, 14.8, 16.3, 'concrete');

  // Container mitten in den Gassen
  mirror(-3, 3, 0, 2.6, 15, 17.5, 'metal');
  // niedrige Deckungsmauern
  mirror(-12, -8, 0, 1.1, 12, 12.4, 'concrete');
  mirror(-24, -20, 0, 1.1, -12.3, -11.9, 'concrete');
}

const HOF = {
  id: 'hof',
  name: 'Hof',
  airstrike: true,
  desc: 'Sandiger Innenhof: zwei Gassen, Tunnel durch das Haus in der Mitte, Balkon.',
  ground: 'ground',
  // Wegenetz der KI, Boden (Breite, Tiefe) und Radius, den die Schatten abdecken
  bounds: { x0: -30, x1: 30, z0: -20, z1: 20 },
  size: [66, 46],
  shadow: 38,
  spawns: spawns(26.5),
  // Bombenplätze: je einer in der Gasse der eigenen Hälfte, nah an der Mitte vor dem Container.
  // Vom Startpunkt des Verteidigers aus sieht man den Platz nicht (erst nach gut 18 m Weg), die
  // Wege sind fast gleich lang (Verteidiger etwa 29 m, Angreifer 33 m).
  sites: { west: new THREE.Vector3(-3, 0, -12.5), east: new THREE.Vector3(3, 0, 12.5) },
  buyZones: { west: { x0: -30, x1: -21.5, z0: -8, z1: 8 }, east: { x0: 21.5, x1: 30, z0: -8, z1: 8 } },
  // mögliche Standorte der Klappziele (x, z, Bodenhöhe)
  targets: [
    [-14, -12, 0], [-8, -14, 0], [-18, 12.5, 0], [-10, 16, 0], [-6, 4, 0], [-15, 0, 0],
    [0, -6.5, 0], [0, 6.5, 0], [0, 0, 0], [0, -12, 0], [0, 12, 0], [0, -18.8, 0], [0, 18.8, 0],
    [8, -10, 0], [13, -13.5, 0], [24, -17, 2.4], [20.5, -18.8, 2.4], [12, 0, 0], [18, 3, 0],
    [15.5, -6.2, 0], [26, 5, 0], [26.5, -2.5, 0], [10, 14, 0], [21, 13.8, 0], [24, 17.5, 0],
    [-24, -16, 0], [-26, 17.5, 2.4],
  ],
  // unsichtbare Rampen über den Treppen: [x unten, x oben, Höhe oben, z0, z1], gespiegelt
  ramps: [[-13.6, -18, 2.4, 16.3, 19.9]],
  layout: hofLayout,
  // Requisiten: [Modell, x, z, Drehung, Höhe], jeweils gespiegelt in die andere Hälfte
  props: [
    ['Crate_L', -12, -6.2, 0, 0], ['Crate_S', -12, -6.2, 0.3, 1.3], ['Crate_S', -13.25, -6.4, 0.1, 0],
    ['Crate_L', -17, 3.5, 0, 0], ['Crate_L', -17, 4.85, 0.05, 0],
    ['concrete_road_barrier', -9, 2.5, Math.PI / 2, 0],
    ['Crate_L', -7, 18.8, 0, 0], ['Crate_S', -5.6, 19.0, 0.2, 0],
    ['Barrel_01', -20.5, 9.2, 0.4, 0], ['barrel_03', -19.8, 9.7, 1.2, 0],
    ['barrel_03', -26.5, -6.6, 0.2, 0], ['Barrel_01', -27.3, -6.1, 2.2, 0],
    ['wooden_crate_02', -25, 5.8, 0.1, 0], ['wooden_crate_02', -15.5, 17.9, 1.5, 0],
    ['old_military_crate', -14.6, 10.2, 0.4, 0], ['metal_jerrycan', -20.9, 10.4, 2.5, 0],
    ['metal_jerrycan', -28.6, 18.8, 0.6, 2.4], ['Crate_S', -6.5, 11.2, 0.15, 0], ['Crate_L', -24.5, 13, 0, 0],
    ['Crate_L', -15, -14.5, 0, 0], ['Crate_S', -13.7, -14.2, 0.2, 0], ['Crate_S', -15, -14.5, -0.2, 1.3],
    ['concrete_road_barrier', -9, -17, 0.2, 0], ['Barrel_01', -7, -9.2, 0.9, 0], ['barrel_03', -6.3, -9.7, 0.1, 0],
    // Kistenstapel vor dem Startpunkt: versperrt die Sicht durch den Tunnel zum anderen Startpunkt
    ['Crate_L', -22.9, -0.72, 0.04, 0], ['Crate_L', -22.95, 0.62, -0.06, 0],
    ['Crate_S', -22.85, -0.55, 0.12, 1.3], ['Crate_S', -22.95, 0.5, -0.2, 1.3],
  ],
  // Rundflug hinter dem Hauptmenü
  menu: { rx: 24, rz: 17, y: 9, look: [0, 1.5, 0] },
  // KI: Wegpunkte für verschiedene Wege (sie ist immer der Gast im Osten) und wohin sie beim
  // Verteidigen ihres Platzes schaut ([x0, x1, z0, z1]: die Gasse nach Westen, die Öffnung zur Mitte)
  bot: {
    lanes: [[0, 12.5], [0, -12.5], [0, 0], [-6, 6.5], [6, -6.5]],
    watch: [[-13, -3, 9.5, 16.5], [-3, 5, 1, 7]],
  },
};

// ---------- Lagerhalle ----------

function halleLayout({ B, mirror, cap }) {
  // Boden und Außenmauern: die Halle reicht von Nord- bis Südwand, davor zwei Höfe
  B(-33, 33, -1, 0, -23, 23, 'ground');
  B(-17.3, 17.3, 0, 9.3, 20, 21, 'sheet', { tint: T.clad });
  B(-17.3, 17.3, 0, 9.3, -21, -20, 'sheet', { tint: T.clad });
  mirror(-31, -17.3, 0, 6, 20, 21, 'concrete');
  mirror(-31, -17.3, 0, 6, -21, -20, 'concrete');
  mirror(-31, -30, 0, 6, -20, 20, 'concrete');
  cap(-31, -17.3, 20, 21, 6, mirror);
  cap(-31, -17.3, -21, -20, 6, mirror);
  cap(-31, -30, -19.8, 19.8, 6, mirror);
  // Sockel aus Beton an den Hallenwänden (innen)
  B(-16.62, 16.62, 0, 1.1, 19.85, 20, 'concrete');
  B(-16.62, 16.62, 0, 1.1, -20, -19.85, 'concrete');

  // Stirnwände der Halle mit je drei Rolltoren (halb heruntergelassen, man läuft darunter durch)
  // Keine Fläche darf genau auf einer anderen liegen, sonst flimmern beide (z-fighting): Sockel
  // schmaler als die Torrahmen, Rahmen ragen etwas in die Öffnung, Rolltor endet in den Rahmen.
  for (const [z0, z1] of [[-20, -13], [-9.5, -1.8], [1.8, 9.5], [13, 20]]) {
    mirror(-17.3, -16.7, 0, 9.2, z0, z1, 'sheet', { tint: T.clad });
    mirror(-17.38, -16.62, 0, 1.1, z0, z1, 'concrete');
  }
  for (const [z0, z1] of [[-13, -9.5], [-1.8, 1.8], [9.5, 13]]) {
    mirror(-17.3, -16.7, 4.2, 9.2, z0, z1, 'sheet', { tint: T.clad });
    mirror(-17.12, -16.88, 3.0, 4.2, z0 + 0.01, z1 - 0.01, 'sheet', { tint: T.door });
    mirror(-17.42, -16.58, 0, 4.24, z0 - 0.14, z0 + 0.04, 'paint', { tint: T.yellow, collider: 'none' });
    mirror(-17.42, -16.58, 0, 4.24, z1 - 0.04, z1 + 0.14, 'paint', { tint: T.yellow, collider: 'none' });
  }

  // Dach mit drei offenen Lichtbändern: dort scheint die Sonne herein
  for (const [z0, z1] of [[-20, -12], [-9, -1.5], [1.5, 9], [12, 20]]) B(-17.4, 17.4, 9, 9.3, z0, z1, 'sheet', { tint: T.roof });
  for (const [z0, z1] of [[-12, -9], [-1.5, 1.5], [9, 12]]) mirror(-17.4, -15, 9, 9.3, z0, z1, 'sheet', { tint: T.roof });
  // Dachträger und Lampen (nur zum Ansehen)
  for (const x of [-14, -7, 0, 7, 14]) B(x - 0.15, x + 0.15, 8.4, 9, -20, 20, 'paint', { tint: T.dark, collider: 'none' });
  for (const x of [-12, -4, 4, 12]) {
    for (const z of [-15.5, -4.5, 4.5, 15.5]) {
      B(x - 1.6, x + 1.6, 7.05, 7.16, z - 0.13, z + 0.13, 'lamp', { collider: 'none' });
      B(x - 1.7, x + 1.7, 7.16, 7.3, z - 0.18, z + 0.18, 'paint', { tint: T.dark, collider: 'none' });
    }
  }

  // Hochregale: Körper für Kollision und Kugeln, darin Rückwand, Stützen, Träger und Böden
  const shelf = (x0, x1, z0, z1) => {
    const H = 4.2;
    mirror(x0, x1, 0, H, z0, z1, null, { surface: 'metal' });
    const zm = (z0 + z1) / 2;
    mirror(x0 + 0.05, x1 - 0.05, 0.1, H - 0.14, zm - 0.02, zm + 0.02, 'paint', { tint: T.dark, collider: 'none' });
    // Stützen: etwas hinter den Querträgern, an den Enden 1 cm vorstehend, oben in der Abdeckung
    const n = Math.max(1, Math.round((x1 - x0) / 2.3));
    for (let i = 0; i <= n; i++) {
      const x = i === 0 ? x0 - 0.01 : i === n ? x1 - 0.09 : x0 + ((x1 - x0) * i) / n - 0.05;
      for (const z of [z0 + 0.02, z1 - 0.12]) mirror(x, x + 0.1, 0, H - 0.05, z, z + 0.1, 'paint', { tint: T.blue, collider: 'none' });
    }
    for (const y of [1.45, 3.0]) {
      for (const z of [z0, z1 - 0.08]) mirror(x0, x1, y, y + 0.12, z, z + 0.08, 'paint', { tint: T.orange, collider: 'none' });
      mirror(x0 + 0.02, x1 - 0.02, y + 0.1, y + 0.14, z0 + 0.05, z1 - 0.05, 'metal', { tint: T.grey, collider: 'none' });
    }
    mirror(x0, x1, H - 0.1, H, z0, z1, 'paint', { tint: T.orange, collider: 'none' });
  };
  // Ware in den Regalen: Kartons und eingeschweißte Paletten (Kisten stehen bei den Requisiten)
  const goods = (x0, x1, y, z0, z1, h, tint) => mirror(x0, x1, y, y + h, z0, z1, 'paint', { tint, collider: 'none' });
  // Reihe im Süden (in der Westhälfte) mit Lücke, Reihe im Norden mit Lücke
  shelf(-14.5, -10, -6.6, -5.4);
  shelf(-8.4, -4, -6.6, -5.4);
  shelf(-14.5, -11.6, 5.4, 6.6);
  shelf(-10, -6.5, 5.4, 6.6);
  goods(-14.3, -12.4, 0.02, -6.45, -5.55, 1.1, T.card);
  goods(-13.9, -12.6, 1.59, -6.45, -5.55, 0.9, T.wrap);
  goods(-11.6, -10.3, 3.14, -6.45, -5.55, 0.8, T.card);
  goods(-6.05, -4.2, 0.02, -6.45, -5.55, 1.2, T.wrap);
  goods(-8.1, -6.9, 3.14, -6.45, -5.55, 0.9, T.card);
  goods(-14.2, -12.8, 3.14, 5.55, 6.45, 0.85, T.wrap);
  goods(-9.75, -8.4, 0.02, 5.55, 6.45, 1.15, T.card);
  goods(-8.1, -6.65, 1.59, 5.55, 6.45, 1.0, T.card);

  // Büro-Container in der Mitte: versperrt die Sicht von Tor zu Tor
  B(-3, 3, 0, 3, -2.4, 2.4, 'sheet', { tint: T.white });
  B(-3.1, 3.1, 3, 3.12, -2.5, 2.5, 'paint', { tint: T.dark });
  for (const x of [-2.2, 1.0]) mirror(x, x + 1.2, 1.1, 2.1, -2.43, -2.4, 'glass');
  mirror(-3.03, -3, 0, 2.2, -0.5, 0.5, 'paint', { tint: T.door, collider: 'none' });

  // Laufsteg an der Nordwand (Westhälfte) bzw. Südwand (Osthälfte): Boden auf Stützen, darunter frei
  mirror(-16.7, -8, 2.9, 3.2, 16.2, 20, 'concrete');
  for (const x of [-16.35, -12.3, -8.35]) mirror(x - 0.15, x + 0.15, 0, 2.9, 16.3, 16.6, 'paint', { tint: T.yellow });
  // Geländer: unsichtbare Wand für Spieler (Kugeln fliegen durch), sichtbar nur die Stangen
  mirror(-16.7, -8, 3.2, 4.3, 16.2, 16.3, null, { collider: 'clip' });
  mirror(-16.7, -8, 4.1, 4.16, 16.2, 16.28, 'paint', { tint: T.yellow, collider: 'none' });
  mirror(-16.7, -8, 3.65, 3.7, 16.2, 16.28, 'paint', { tint: T.yellow, collider: 'none' });
  for (let x = -16.4; x < -8; x += 1.4) mirror(x, x + 0.05, 3.2, 4.12, 16.21, 16.27, 'paint', { tint: T.yellow, collider: 'none' });
  // kurzes Stück Geländer zwischen Laufsteg-Kante und Treppe
  mirror(-8.06, -8.0, 3.2, 4.3, 16.28, 17.1, null, { collider: 'clip' });
  for (const y of [3.65, 4.1]) mirror(-8.06, -8.0, y, y + 0.05, 16.28, 17.1, 'paint', { tint: T.yellow, collider: 'none' });
  // Treppe nach Osten hinunter, 29 Grad steil wie im Hof (ab 35 Grad rutscht man), seitlich zu
  // (nur von unten betretbar); der schräge Handlauf steht bei den Geländern (rails)
  const steps = 15, top = -8, run = (-2.2 - top) / steps;
  for (let k = 0; k < steps; k++) {
    const x0 = top + run * k;
    mirror(x0, x0 + run, 0, 3.2 * (1 - (k + 0.5) / steps), 17.2, 19.85, 'concrete', { collider: 'stair' });
  }
  mirror(top, -2.2, 0, 4.3, 17.1, 17.2, null, { collider: 'clip' });
  for (const x of [-2.45, -4.35, -6.25, -7.95]) {
    const h = 3.2 * (-2.2 - x) / (-2.2 - top) + 1.0;
    mirror(x, x + 0.05, 0, h, 17.13, 17.19, 'paint', { tint: T.yellow, collider: 'none' });
  }

  // Gabelstapler in der Südgasse (Westhälfte), Gabel nach Osten
  forklift(mirror, -9.2, -14.2);

  // Sattelauflieger im Hof an der Außenmauer (unten nur für Spieler zu, Kugeln fliegen drunter durch)
  const tx0 = -29.6, tx1 = -27.1, tz0 = 7, tz1 = 19;
  mirror(tx0, tx1, 1.05, 3.9, tz0, tz1, 'paint', { tint: T.white });
  mirror(tx0 - 0.02, tx1 + 0.02, 2.3, 2.6, tz0 + 0.2, tz1 - 0.2, 'paint', { tint: T.blue, collider: 'none' });
  mirror(tx0 + 0.2, tx1 - 0.2, 0.75, 1.05, tz0, tz1, 'paint', { tint: T.dark });
  mirror(tx0, tx1, 0, 0.75, tz0, tz1, null, { collider: 'clip' });
  for (const z of [tz1 - 3.2, tz1 - 1.9]) mirror(tx0 + 0.05, tx1 - 0.05, 0, 0.95, z - 0.47, z + 0.47, 'paint', { tint: T.dark });
  mirror(tx0 + 0.5, tx1 - 0.5, 0, 0.75, tz0 + 1.2, tz0 + 1.4, 'paint', { tint: T.dark, collider: 'none' });
  // Überseecontainer im Hof
  mirror(-24.5, -22.1, 0, 2.6, -19.6, -13.6, 'sheet', { tint: T.red });

  // gelbe Linien am Boden neben den Regalen und um das Büro
  for (const z of [-7.25, 7.25]) B(-16.6, 16.6, 0, 0.012, z - 0.06, z + 0.06, 'paint', { tint: T.yellow, collider: 'none' });
  for (const z of [-3.1, 3.1]) B(-3.7, 3.7, 0, 0.012, z - 0.06, z + 0.06, 'paint', { tint: T.yellow, collider: 'none' });
  for (const x of [-3.7, 3.7]) B(x - 0.06, x + 0.06, 0, 0.012, -3.04, 3.04, 'paint', { tint: T.yellow, collider: 'none' });
}

const HALLE = {
  id: 'halle',
  name: 'Lagerhalle',
  // in der Halle gibt es keinen Luftschlag (unter einem Dach passt er nicht)
  airstrike: false,
  desc: 'Halle mit Hochregalen, Büro in der Mitte, Laufsteg und Rolltoren. Enger, mehr Nahkampf.',
  ground: 'concrete',
  // Boden: in den Höfen dunkler (Asphalt), in der Halle heller Beton
  groundTint: (x) => (Math.abs(x) > 17.2 ? 0.62 : 1),
  bounds: { x0: -30, x1: 30, z0: -20, z1: 20 },
  size: [66, 46],
  shadow: 38,
  spawns: spawns(25),
  // Bombenplätze in der Südgasse (Westhälfte) bzw. Nordgasse (Osthälfte), nah an der Mitte: vom
  // Startpunkt aus nicht zu sehen, Wege etwa 28 m (Verteidiger) zu 33 m (Angreifer)
  sites: { west: new THREE.Vector3(-3, 0, -11), east: new THREE.Vector3(3, 0, 11) },
  buyZones: { west: { x0: -30, x1: -20.5, z0: -8, z1: 8 }, east: { x0: 20.5, x1: 30, z0: -8, z1: 8 } },
  targets: [
    [-14, -17, 0], [-6.5, -16.8, 0], [-12.5, -9, 0], [-6, -9.5, 0], [-15, 0, 0], [-8, 3.5, 0],
    [-11, 11, 0], [-4.5, 16.5, 0], [-13.5, 18, 3.2], [0, -12, 0], [0, 12, 0], [0, 17, 0], [0, -4.2, 0],
    [14, 17, 0], [6.5, 16.8, 0], [12.5, 9, 0], [6, 9.5, 0], [15, 0, 0], [8, -3.5, 0], [11, -11, 0],
    [4.5, -16.5, 0], [13.5, -18, 3.2], [-23, 12, 0], [-25, -9, 0], [24, -12, 0], [26, 9, 0], [-20, -17, 0],
  ],
  ramps: [[-2.2, -8, 3.2, 17.2, 19.85]],
  // schräge Handläufe: [x unten, Höhe unten, x oben, Höhe oben, z], gespiegelt
  rails: [[-2.2, 1.0, -8, 4.2, 17.16]],
  layout: halleLayout,
  props: [
    // Kisten in den Regalen (Westhälfte, gespiegelt in die Osthälfte)
    ['Crate_S', -11, -6, 0, 0], ['Crate_S', -13.2, -6, 0.05, 3.14], ['Crate_L', -7.5, -6, 0, 0],
    ['Crate_S', -5.2, -6, 0.1, 1.59], ['Crate_S', -12.9, 6, 0, 0], ['Crate_S', -12.2, 6, 0, 1.59],
    ['Crate_L', -7.4, 6, 0, 0], ['wooden_crate_02', -9.25, 6, Math.PI / 2, 3.14],
    // Deckung in den Gassen
    ['Crate_L', -13.5, -11, 0.1, 0], ['Crate_S', -13.4, -11.1, 0.35, 1.3], ['Crate_S', -12.3, -11.4, 0.1, 0],
    ['old_military_crate', -4.2, -17.8, 0, 0], ['Barrel_01', -15.6, -18.6, 0.3, 0], ['barrel_03', -15, -19, 1.1, 0],
    // Deckung auf dem Bombenplatz
    ['Crate_L', -4.9, -12.9, 0.12, 0], ['Crate_S', -4.8, -12.8, -0.2, 1.3], ['concrete_road_barrier', -1.2, -13.3, 0.15, 0],
    ['Crate_S', -10.5, 2.4, 0.2, 0], ['wooden_crate_02', -12.4, -2.9, 0.3, 0], ['Barrel_01', -6.5, -3.6, 0.6, 0],
    ['Crate_L', -5, 11.6, 0, 0], ['Crate_S', -3.75, 11.3, 0.25, 0], ['barrel_03', -14.8, 9.5, 0.4, 0],
    ['Crate_S', -15.8, 14.6, 0.1, 0], ['metal_jerrycan', -15.2, 13.9, 1.4, 0],
    // Höfe: Kisten zwischen Startpunkt und mittlerem Tor, Fässer in den Ecken
    ['Crate_L', -20.8, -0.72, 0.04, 0], ['Crate_L', -20.85, 0.62, -0.06, 0], ['Crate_S', -20.8, -0.5, 0.15, 1.3],
    ['Barrel_01', -29, -8.5, 0.4, 0], ['barrel_03', -28.3, -9.1, 1.2, 0], ['wooden_crate_02', -21.5, 10.5, 0.2, 0],
    ['concrete_road_barrier', -19.5, -12.3, Math.PI / 2, 0], ['Crate_S', -25.5, 16.5, 0.3, 0],
  ],
  menu: { rx: 11, rz: 9, y: 5.2, look: [0, 1.8, 0] },
  bot: {
    lanes: [[0, 13], [0, -13], [0, 4.2], [0, -4.2], [-6, 9]],
    watch: [[-12, -2, 8, 17], [-3, 3, 3.2, 5.6], [7.5, 10.5, 2, 5]],
  },
};

export const MAPS = { hof: HOF, halle: HALLE, hafen: HAFEN };
export const MAP_IDS = Object.keys(MAPS);

// Die aktuelle Karte. Die übrigen Werte sind "live": Module, die sie importieren, sehen nach
// setMap() gleich die der neuen Karte.
export let MAP = HOF;
export let SPAWNS = HOF.spawns;
export let SPAWN = HOF.spawns.west;
export let BOMB_SITES = HOF.sites;
export let BUY_ZONES = HOF.buyZones;

export function setMap(id) {
  MAP = MAPS[id] || HOF;
  SPAWNS = MAP.spawns;
  SPAWN = MAP.spawns.west;
  BOMB_SITES = MAP.sites;
  BUY_ZONES = MAP.buyZones;
  return MAP;
}

function defineLayout(map) {
  const list = [];
  // opts.collider: 'world' (Standard), 'stair' (nur Kugeln/Granaten), 'clip' (nur Spieler) oder 'none';
  // opts.tint: Farbe [r, g, b], mit der die Textur bzw. der Anstrich eingefärbt wird;
  // mat null: nur Kollision, nichts zu sehen (opts.surface für den Klang der Einschläge)
  const B = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => list.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat, ...opts });
  const mirror = (x0, x1, y0, y1, z0, z1, mat, opts) => {
    B(x0, x1, y0, y1, z0, z1, mat, opts);
    B(-x1, -x0, y0, y1, -z1, -z0, mat, opts);
  };
  // Wandstück mit Sockel aus Beton
  const wall = (x0, x1, z0, z1, h, mat, add = B) => {
    add(x0, x1, 0, h, z0, z1, mat);
    add(x0 - 0.05, x1 + 0.05, 0, 0.3, z0 - 0.05, z1 + 0.05, 'concrete');
  };
  const cap = (x0, x1, z0, z1, y, add = B) => add(x0 - 0.08, x1 + 0.08, y, y + 0.15, z0 - 0.08, z1 + 0.08, 'concrete');
  map.layout({ B, mirror, wall, cap });
  return list;
}

const PROP_SURFACE = {
  Crate_L: 'wood', Crate_S: 'wood', wooden_crate_02: 'wood', old_military_crate: 'wood',
  Barrel_01: 'metal', barrel_03: 'metal', metal_jerrycan: 'metal', concrete_road_barrier: 'stone',
};

// Box mit Welt-UVs, damit die Texturen über alle Bauteile gleich groß und nahtlos laufen
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

function pushBox(acc, min, max, tile, tint) {
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const f of FACES) {
    const base = acc.pos.length / 3;
    const hu = Math.abs(dot(f.u, h)), hv = Math.abs(dot(f.v, h)), hn = Math.abs(dot(f.n, h));
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((i) => c[i] + f.n[i] * hn + f.u[i] * su * hu + f.v[i] * sv * hv);
      acc.pos.push(...p);
      acc.nrm.push(...f.n);
      acc.uv.push(dot(p, f.u) / tile, dot(p, f.v) / tile);
      acc.col.push(tint[0], tint[1], tint[2]);
    }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function makeMaterial(assets, key) {
  if (key === 'glass') {
    return new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.12, metalness: 0.2 });
  }
  if (key === 'lamp') {
    // Leuchtröhren: hell, ohne Licht und Schatten
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.35, 2.15) });
  }
  if (key === 'paint') {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2, vertexColors: true });
  }
  if (key === 'rail') {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...T.yellow), roughness: 0.55, metalness: 0.25 });
  }
  if (key === 'water') {
    // glatt: spiegelt den Himmel, in der Ferne verschwimmt es im Dunst
    return new THREE.MeshStandardMaterial({ color: 0x0f3440, roughness: 0.12, metalness: 0.1 });
  }
  if (key === 'sheet') {
    const t = assets.textures[MATS.sheet.tex];
    return new THREE.MeshStandardMaterial({ normalMap: t.nor, roughness: 0.5, metalness: 0.3, vertexColors: true });
  }
  const t = assets.textures[MATS[key].tex];
  return new THREE.MeshStandardMaterial({
    map: t.diff, normalMap: t.nor, roughnessMap: t.arm, metalnessMap: t.arm, aoMap: t.arm,
    roughness: 1, metalness: 1, vertexColors: true,
  });
}

// Baut die aktuelle Karte (MAP): Kästen mit Welt-UVs, Kollision, Rampen, Requisiten per Instancing.
// clear() räumt alles wieder ab, damit die nächste Karte gebaut werden kann.
export class Arena {
  constructor(assets, physics, scene) {
    this.assets = assets;
    this.physics = physics;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Arena';
    scene.add(this.group);
    this.targetSpots = [];
    this.colliders = [];
    this.materials = [];
    this.mapId = null;
  }

  build() {
    this.map = MAP;
    this._buildGeometry();
    this._placeProps();
    this._validateSpots();
    this.mapId = MAP.id;
  }

  /** alles der alten Karte entfernen: Meshes, Materialien, Kollision */
  clear() {
    const { world, surfaces } = this.physics;
    for (const c of this.colliders) {
      surfaces.delete(c.handle);
      world.removeCollider(c, false);
    }
    this.colliders = [];
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      // Requisiten teilen sich die Geometrie mit ihren Vorlagen
      if (o.isInstancedMesh) o.dispose();
      else o.geometry.dispose();
    }
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.targetSpots = [];
    this.mapId = null;
  }

  _material(key) {
    const m = makeMaterial(this.assets, key);
    this.materials.push(m);
    return m;
  }

  _collider(c) {
    this.colliders.push(c);
    return c;
  }

  _buildGeometry() {
    const byMat = {};
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const b of defineLayout(this.map)) {
      if (b.mat && b.mat !== 'ground') {
        const acc = (byMat[b.mat] ||= { pos: [], nrm: [], uv: [], col: [], idx: [] });
        // leichte Unterschiede von Bauteil zu Bauteil, beim Anstrich weniger
        const k = b.mat === 'paint' ? 0.96 + rand() * 0.05 : 0.9 + rand() * 0.14;
        const t = b.tint || [1, 1, 1];
        pushBox(acc, b.min, b.max, MATS[b.mat]?.tile ?? 1, [t[0] * k, t[1] * k, t[2] * k]);
      }
      if (b.collider === 'none') continue;
      const half = { x: (b.max[0] - b.min[0]) / 2, y: (b.max[1] - b.min[1]) / 2, z: (b.max[2] - b.min[2]) / 2 };
      const center = { x: b.min[0] + half.x, y: b.min[1] + half.y, z: b.min[2] + half.z };
      const member = b.collider === 'stair' ? GROUP.STAIR : b.collider === 'clip' ? GROUP.CLIP : GROUP.WORLD;
      const surface = MATS[b.mat]?.surface ?? b.surface ?? 'stone';
      this._collider(this.physics.addBox(center, half, surface, null, member));
    }
    this._addRamps();
    this._buildRails();
    this._buildWater();
    for (const [key, acc] of Object.entries(byMat)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
      g.setIndex(acc.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this._material(key));
      mesh.name = `Arena_${key}`;
      // Lampen werfen keinen Schatten (hängen unter dem Dach)
      mesh.castShadow = key !== 'lamp';
      mesh.receiveShadow = key !== 'lamp';
      this.group.add(mesh);
    }
    this._buildGround();
  }

  // Eine Kapsel kann nicht auf einer Stufenkante stehen, deshalb laufen Spieler über eine flache Rampe
  _addRamps() {
    const t = 0.3;
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (const [xLow, xHigh, h, z0, z1] of this.map.ramps) {
      for (const s of [1, -1]) {
        const x0 = xLow * s, x1 = xHigh * s;
        const len = Math.hypot(x1 - x0, h);
        const ux = (x1 - x0) / len, uy = h / len;
        // Normale der Oberseite (zeigt nach oben und zum unteren Ende hin)
        const nx = ux > 0 ? -uy : uy, ny = Math.abs(ux);
        const q = new THREE.Quaternion().setFromAxisAngle(zAxis, Math.atan2(uy, ux));
        const center = {
          x: (x0 + x1) / 2 - nx * t / 2,
          y: h / 2 - ny * t / 2,
          z: ((z0 + z1) / 2) * s,
        };
        this._collider(this.physics.addBox(center, { x: len / 2, y: t / 2, z: (z1 - z0) / 2 }, 'stone', q, GROUP.CLIP));
      }
    }
  }

  // schräge Handläufe an Treppen (nur zum Ansehen, die Treppe ist seitlich für Spieler zu)
  _buildRails() {
    const rails = this.map.rails || [];
    if (!rails.length) return;
    const mat = this._material('rail');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const [x0, y0, x1, y1, z] of rails) {
      for (const s of [1, -1]) {
        a.set(x0 * s, y0, z * s);
        b.set(x1 * s, y1, z * s);
        const m = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), 0.06, 0.06), mat);
        m.position.addVectors(a, b).multiplyScalar(0.5);
        m.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
        m.castShadow = true;
        m.name = 'Arena_rail';
        this.group.add(m);
      }
    }
  }

  // Wasser rund um die Karte (Hafen): eine große Fläche bis zum Horizont, ohne Kollision
  _buildWater() {
    if (this.map.water === undefined) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), this._material('water'));
    mesh.position.y = this.map.water;
    mesh.receiveShadow = true;
    mesh.name = 'Arena_water';
    this.group.add(mesh);
  }

  // Boden als feines Raster mit weichen Farbflecken, damit die Kachelung nicht auffällt
  _buildGround() {
    const [w, d] = this.map.size;
    const nx = w, nz = d;
    const key = this.map.ground;
    const tile = MATS[key].tile;
    const shade = this.map.groundTint || (() => 1);
    const pos = [], uv = [], col = [], idx = [];
    const noise = (x, z) => 0.5
      + 0.22 * Math.sin(x * 0.19 + Math.sin(z * 0.11) * 2.3)
      + 0.18 * Math.sin(z * 0.23 + Math.cos(x * 0.09) * 2.1)
      + 0.1 * Math.sin((x + z) * 0.47);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = -w / 2 + (w * i) / nx;
        const z = -d / 2 + (d * j) / nz;
        pos.push(x, 0, z);
        uv.push(x / tile, -z / tile);
        const n = Math.min(1, Math.max(0, noise(x, z)));
        const k = (0.8 + 0.24 * n) * shade(x, z);
        col.push(k, k * (0.97 + 0.03 * n), k * (0.93 + 0.07 * n));
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this._material(key));
    mesh.name = 'Arena_ground';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _template(name) {
    this._templates ||= {};
    if (this._templates[name]) return this._templates[name];
    const lib = name.startsWith('Crate_') ? this.assets.models.crates : this.assets.models.props;
    const src = lib.getObjectByName(name).clone();
    src.position.set(0, 0, 0);
    src.traverse((o) => {
      if (o.isMesh && o.material.name === 'CrateFrame') {
        this._frameMat ||= Object.assign(o.material.clone(), { name: 'CrateFrameTinted' });
        this._frameMat.color.setScalar(0.58);
        o.material = this._frameMat;
      }
    });
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    this._templates[name] = { src, box };
    return this._templates[name];
  }

  // Gleiche Requisiten werden per Instancing gezeichnet: ein Draw Call pro Teil für alle Kopien
  _placeProps() {
    const placements = {};
    for (const [name, x, z, yaw, y] of this.map.props) {
      (placements[name] ||= []).push([x, z, yaw, y], [-x, -z, yaw + Math.PI, y]);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (const [name, list] of Object.entries(placements)) {
      const { src, box } = this._template(name);
      const parts = [];
      src.traverse((o) => { if (o.isMesh) parts.push(o); });
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        inst.name = `${name}_${part.name}`;
        inst.castShadow = inst.receiveShadow = true;
        list.forEach(([x, z, yaw, y], i) => {
          m.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), one).multiply(part.matrixWorld);
          inst.setMatrixAt(i, m);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        this.group.add(inst);
      }
      const size = box.getSize(new THREE.Vector3());
      const localCenter = box.getCenter(new THREE.Vector3());
      const surface = PROP_SURFACE[name] || 'stone';
      for (const [x, z, yaw, y] of list) {
        q.setFromAxisAngle(up, yaw);
        const center = localCenter.clone().applyQuaternion(q).add(p.set(x, y, z));
        if (/^barrel/i.test(name)) {
          this._collider(this.physics.addCylinder(center, size.y / 2, Math.max(size.x, size.z) / 2, surface));
        } else {
          this._collider(this.physics.addBox(center, { x: size.x / 2, y: size.y / 2, z: size.z / 2 }, surface, q.clone()));
        }
      }
    }
  }

  // Zielstandorte, die in einem Hindernis stecken würden, werden aussortiert
  _validateSpots() {
    const R = this.physics.R;
    const shape = new R.Cuboid(0.3, 0.5, 0.3);
    this.physics.step(); // Abfragestruktur mit den neuen Kollisionskörpern füllen
    for (const [x, z, y] of this.map.targets) {
      if (this.physics.overlaps(shape, { x, y: y + 0.6, z })) {
        console.warn('Zielstandort blockiert:', x, z);
        continue;
      }
      this.targetSpots.push(new THREE.Vector3(x, y, z));
    }
  }

  inBuyZone(p, side = 'west') {
    const z = BUY_ZONES[side];
    return p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1;
  }
}
