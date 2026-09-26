import * as THREE from 'three';

// Bauteile, die mehrere Karten nutzen. Alle Angaben in Metern, y = Höhe. "add" ist die Funktion,
// mit der ein Kasten angelegt wird (B oder mirror aus map.js).

// Blickrichtung (Yaw) so, dass die Kamera nach +X schaut
export const FACE_EAST = -Math.PI / 2;

/** Startpunkte: Westen bei -x (schaut nach Osten), Osten gespiegelt */
export const spawns = (x) => ({
  west: { pos: new THREE.Vector3(-x, 0, 0), yaw: FACE_EAST },
  east: { pos: new THREE.Vector3(x, 0, 0), yaw: -FACE_EAST },
});

// Farben (Anstrich, Tönung der Texturen)
export const T = {
  clad: [0.66, 0.72, 0.8], cladDark: [0.46, 0.5, 0.56], roof: [0.42, 0.44, 0.48],
  blue: [0.12, 0.27, 0.55], orange: [0.95, 0.42, 0.08], yellow: [0.96, 0.74, 0.1],
  dark: [0.13, 0.14, 0.16], grey: [0.5, 0.52, 0.55], white: [0.86, 0.87, 0.86],
  card: [0.6, 0.44, 0.27], wrap: [0.8, 0.83, 0.84], red: [0.6, 0.14, 0.1], door: [0.24, 0.3, 0.4],
};

/** Gabelstapler um (cx, cz), Gabel nach +X */
export function forklift(add, cx, cz) {
  add(cx - 1.0, cx + 0.6, 0.25, 1.25, cz - 0.6, cz + 0.6, 'paint', { tint: T.yellow });
  add(cx - 1.3, cx - 0.95, 0.27, 1.1, cz - 0.62, cz + 0.62, 'paint', { tint: T.dark });
  for (const [x, z] of [[cx - 0.75, cz - 0.62], [cx - 0.75, cz + 0.62], [cx + 0.3, cz - 0.62], [cx + 0.3, cz + 0.62]]) {
    add(x - 0.25, x + 0.25, 0, 0.5, z - 0.12, z + 0.12, 'paint', { tint: T.dark, collider: 'none' });
  }
  for (const x of [cx - 0.85, cx + 0.35]) {
    for (const z of [cz - 0.52, cz + 0.44]) add(x, x + 0.08, 1.25, 2.2, z, z + 0.08, 'paint', { tint: T.dark });
  }
  add(cx - 0.9, cx + 0.45, 2.2, 2.28, cz - 0.55, cz + 0.55, 'paint', { tint: T.dark });
  add(cx - 0.6, cx - 0.2, 1.25, 1.6, cz - 0.25, cz + 0.25, 'paint', { tint: T.dark, collider: 'none' });
  for (const z of [cz - 0.42, cz + 0.32]) add(cx + 0.62, cx + 0.72, 0.1, 2.5, z, z + 0.1, 'paint', { tint: T.dark });
  for (const z of [cz - 0.36, cz + 0.26]) add(cx + 0.72, cx + 1.9, 0.08, 0.14, z, z + 0.1, 'paint', { tint: T.dark, collider: 'none' });
  add(cx + 0.75, cx + 1.85, 0.14, 0.3, cz - 0.55, cz + 0.55, 'paint', { tint: T.card, collider: 'none' });
}

// Seecontainer: 2,44 m breit, 2,6 m hoch, 12,19 m (40 Fuß), 6,06 m (20 Fuß) oder 2,99 m (10 Fuß)
// lang. Gestapelt liegt alle 2,62 m eine Lage (dazwischen 2 cm Luft, die sieht man als feine Fuge).
export const BOX = { w: 2.44, h: 2.6, level: 2.62, long: 12.19, short: 6.06, tiny: 2.99 };

/**
 * Seecontainer mit Eckpfosten, Längsträgern und Türen an einem Ende. (x, z): Ecke mit den
 * kleinsten Werten, len: Länge, ax: längs zu X (sonst zu Z), y: Unterkante, c: Farbe,
 * door: Türen am Ende mit dem größeren Wert (1) oder dem kleineren (-1).
 * Nur der Körper hat Kollision; die Anbauteile stehen ein paar Zentimeter vor (kein z-fighting).
 */
export function container(add, x, z, len, ax, y, c, door = 1) {
  const W = BOX.w;
  const y1 = y + BOX.h;
  // u: längs, v: quer
  const put = (u0, u1, v0, v1, ya, yb, mat, opts) => (ax
    ? add(x + u0, x + u1, ya, yb, z + v0, z + v1, mat, opts)
    : add(x + v0, x + v1, ya, yb, z + u0, z + u1, mat, opts));
  put(0, len, 0, W, y, y1, 'sheet', { tint: c });
  const trim = { tint: c.map((v) => v * 0.45), collider: 'none' };
  for (const u of [-0.03, len - 0.13]) {
    for (const v of [-0.03, W - 0.13]) put(u, u + 0.16, v, v + 0.16, y, y1 + 0.012, 'paint', trim);
  }
  for (const v of [-0.02, W - 0.1]) {
    put(0.1, len - 0.1, v, v + 0.12, y1 - 0.14, y1 + 0.006, 'paint', trim);
    put(0.1, len - 0.1, v, v + 0.12, y, y + 0.14, 'paint', trim);
  }
  // Türen: Fläche etwas vor dem Ende, davor vier Verschlussstangen
  const u = door > 0 ? len - 0.02 : -0.012;
  const doors = { tint: c.map((v) => v * 0.82), collider: 'none' };
  put(u, u + 0.032, 0.13, W - 0.13, y + 0.14, y1 - 0.14, 'paint', doors);
  const bar = door > 0 ? len + 0.012 : -0.042;
  for (const v of [0.45, 0.85, W - 0.89, W - 0.49]) put(bar, bar + 0.03, v, v + 0.04, y + 0.2, y1 - 0.2, 'paint', trim);
}
