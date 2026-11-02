import * as THREE from 'three';
import { T } from './parts.js';

// Uhrturm auf dem Haus in der Mitte des Hofs (meistgelikter Wunsch aus den YouTube-Kommentaren,
// 02.11.2026). Er steht genau in der Mitte, die Karte bleibt also für beide Seiten gleich. Betreten
// kann man ihn nicht, unten bleibt alles wie vorher (Tunnel, Wege der KI, Radar).
// - clockTowerLayout(): Kästen mit Textur und Kollision, kommen wie alle Bauteile in die Karte
// - buildClockTower(): Zifferblätter, Zeiger, Glocke und Dach als eigene Meshes
// Die Uhr zeigt die echte Uhrzeit des Spielers. Trifft eine Kugel die Glocke (Oberfläche 'bell'),
// läutet sie: Klang in audio.js, Schwingen hier über ringBell().

const ROOF = 5.15; // Oberkante der Abdeckung auf dem Haus
const CLOCK_Y = 14.5; // Mitte der Zifferblätter
const CLOCK_R = 1.3;
const FACE = 2.35; // halbe Breite des Uhrgeschosses
const BELL_TOP = 19.1; // Aufhängung der Glocke (Unterkante des Balkens)
const BELL_H = 1.9;
const BELL_R = 1.0; // Radius am Rand unten
const ROOF_Y = 19.8; // Unterkante des Spitzdachs
const BRICK = [0.95, 0.7, 0.58];
const CREAM = [1.0, 0.97, 0.9];

export function clockTowerLayout(B) {
  const brick = { tint: BRICK };
  B(-2.45, 2.45, ROOF, 5.6, -2.45, 2.45, 'concrete');
  B(-2.2, 2.2, 5.6, 12.6, -2.2, 2.2, 'sandstone', brick);
  // Eckpfeiler und schmale Fenster, damit der Schaft nicht wie ein glatter Klotz wirkt
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [x0, x1] = sx > 0 ? [1.9, 2.32] : [-2.32, -1.9];
      const [z0, z1] = sz > 0 ? [1.9, 2.32] : [-2.32, -1.9];
      B(x0, x1, 5.6, 12.6, z0, z1, 'sandstone', brick);
    }
  }
  for (const s of [-1, 1]) {
    const a = s > 0 ? 2.2 : -2.23;
    B(-0.3, 0.3, 7.6, 10.4, a, a + 0.03, 'glass', { collider: 'none' });
    B(a, a + 0.03, 7.6, 10.4, -0.3, 0.3, 'glass', { collider: 'none' });
    const c = s > 0 ? 2.2 : -2.32;
    B(-0.42, 0.42, 7.48, 7.6, c, c + 0.12, 'concrete', { collider: 'none' });
    B(c, c + 0.12, 7.48, 7.6, -0.42, 0.42, 'concrete', { collider: 'none' });
  }
  B(-2.42, 2.42, 12.6, 12.9, -2.42, 2.42, 'concrete');
  // Uhrgeschoss, Gesims und Glockenstube mit vier Eckpfeilern
  B(-FACE, FACE, 12.9, 16.1, -FACE, FACE, 'plaster', { tint: CREAM });
  // Gesims schmal und ohne Brüstung, Glocke hoch aufgehängt: vom Boden aus sieht man sie ab gut
  // 18 m Abstand (näher dran verdeckt das Gesims sie). Spitze bei 23,4 m, der Jet fliegt über 24 m.
  B(-2.45, 2.45, 16.1, 16.4, -2.45, 2.45, 'concrete');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [x0, x1] = sx > 0 ? [1.75, 2.35] : [-2.35, -1.75];
      const [z0, z1] = sz > 0 ? [1.75, 2.35] : [-2.35, -1.75];
      B(x0, x1, 16.4, 19.4, z0, z1, 'sandstone', brick);
    }
  }
  B(-2.55, 2.55, 19.4, ROOF_Y, -2.55, 2.55, 'concrete');
  B(-2.35, 2.35, BELL_TOP, 19.4, -0.12, 0.12, 'paint', { tint: T.dark, collider: 'none' });
  // nur Kollision: Spitzdach (grob) und Glocke
  B(-2.3, 2.3, ROOF_Y, ROOF_Y + 1.6, -2.3, 2.3, null, { surface: 'stone' });
  B(-BELL_R, BELL_R, BELL_TOP - BELL_H, BELL_TOP - 0.1, -BELL_R, BELL_R, null, { surface: 'bell' });
}

// Zifferblatt einmal zeichnen und für alle Karten-Aufbauten behalten
let dialTexture = null;
function dial() {
  if (dialTexture) return dialTexture;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  g.fillStyle = '#2a2622';
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f3ecdc';
  g.beginPath();
  g.arc(m, m, m - 22, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2622';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const hour = i % 5 === 0;
    const r0 = hour ? m - 66 : m - 48;
    g.lineWidth = hour ? 9 : 3;
    g.beginPath();
    g.moveTo(m + Math.sin(a) * r0, m - Math.cos(a) * r0);
    g.lineTo(m + Math.sin(a) * (m - 34), m - Math.cos(a) * (m - 34));
    g.stroke();
  }
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#2a2622';
  g.font = 'bold 44px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  roman.forEach((txt, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r = m - 112;
    g.fillText(txt, m + Math.sin(a) * r, m - Math.cos(a) * r);
  });
  dialTexture = new THREE.CanvasTexture(c);
  dialTexture.colorSpace = THREE.SRGBColorSpace;
  dialTexture.anisotropy = 4;
  return dialTexture;
}

// Zeitquelle: die Zeit des Spieltakts (game.frameTime). Bei einer Aufnahme in festen Schritten
// laufen Zeiger und Glocke so im Takt des Videos, nicht nach der Uhr des Rechners.
let clockNow = () => performance.now();
const WALL0 = Date.now();
const PERF0 = performance.now();
/** fn liefert Millisekunden wie performance.now() */
export function setClockSource(fn) {
  clockNow = fn;
}

// Glocke: schwingt nach einem Treffer, schaukelt sich bei mehreren Treffern höher
const swing = { t0: -1e9, amp: 0 };
const PERIOD = 1.7;
const DAMP = 3.2;

/** Glocke anstoßen (Treffer einer Kugel) */
export function ringBell() {
  const now = clockNow() / 1000;
  const left = swing.amp * Math.exp(-(now - swing.t0) / DAMP);
  swing.amp = Math.min(0.6, left + 0.35);
  swing.t0 = now;
}

function swingAngle() {
  const t = clockNow() / 1000 - swing.t0;
  if (t > 20) return 0;
  return swing.amp * Math.exp(-t / DAMP) * Math.sin((t / PERIOD) * Math.PI * 2);
}

// Winkel der Zeiger (im Uhrzeigersinn ab 12) aus der echten Uhrzeit; der Sekundenzeiger springt
function handAngle(kind) {
  const d = new Date(WALL0 + clockNow() - PERF0);
  const s = d.getSeconds();
  const min = d.getMinutes() + s / 60;
  if (kind === 'h') return (((d.getHours() % 12) + min / 60) / 12) * Math.PI * 2;
  if (kind === 'm') return (min / 60) * Math.PI * 2;
  return (s / 60) * Math.PI * 2;
}

/**
 * Meshes des Turms in group legen (flach, ohne Untergruppen: Arena.clear() räumt die Kinder
 * einzeln ab). keep(material) merkt sich Materialien zum Aufräumen.
 * Zeiger und Glocke stellen sich in onBeforeRender selbst, also nur, wenn sie gezeichnet werden.
 */
export function buildClockTower(group, keep) {
  const mat = (m) => (keep(m), m);
  const faceMat = mat(new THREE.MeshStandardMaterial({
    map: dial(), roughness: 0.75, metalness: 0, emissive: 0xffffff, emissiveMap: dial(), emissiveIntensity: 0.12,
  }));
  const handMat = mat(new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.5, metalness: 0.4 }));
  const redMat = mat(new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5, metalness: 0.2 }));
  const hands = [
    // [Art, Breite, Länge, Abstand vor der Wand, Material]
    ['h', 0.13, 0.72, 0.07, handMat],
    ['m', 0.085, 1.08, 0.1, handMat],
    ['s', 0.03, 1.15, 0.13, redMat],
  ];
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const face = new THREE.Mesh(new THREE.CircleGeometry(CLOCK_R, 48), faceMat);
    face.position.copy(out).multiplyScalar(FACE + 0.05).setY(CLOCK_Y);
    face.rotation.y = yaw;
    face.receiveShadow = true;
    face.name = 'Clock_face';
    group.add(face);
    for (const [kind, w, len, off, m] of hands) {
      // Drehpunkt am Ursprung, ein kurzes Stück ragt nach hinten über
      const geo = new THREE.BoxGeometry(w, len, 0.025).translate(0, len / 2 - 0.12, 0);
      const hand = new THREE.Mesh(geo, m);
      hand.position.copy(out).multiplyScalar(FACE + off).setY(CLOCK_Y);
      hand.name = 'Clock_hand';
      hand.onBeforeRender = () => {
        // Euler XYZ: erst um die eigene Achse drehen (Zeiger), dann zur Seite des Turms
        hand.rotation.set(0, yaw, -handAngle(kind));
        hand.updateMatrix();
        hand.matrixWorld.multiplyMatrices(group.matrixWorld, hand.matrix);
      };
      group.add(hand);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16).rotateX(Math.PI / 2), handMat);
    hub.position.copy(out).multiplyScalar(FACE + 0.15).setY(CLOCK_Y);
    hub.rotation.y = yaw;
    hub.name = 'Clock_hub';
    group.add(hub);
  }

  // Glocke aus Bronze, gedreht aus einem Umriss; Drehpunkt oben an der Aufhängung
  const profile = [
    [0.7, 0], [0.69, 0.07], [0.6, 0.18], [0.5, 0.38], [0.44, 0.65], [0.42, 0.92],
    [0.37, 1.12], [0.24, 1.25], [0.08, 1.3], [0.08, 1.35], [0, 1.35],
  ].map(([r, y]) => new THREE.Vector2(r * (BELL_R / 0.7), y * (BELL_H / 1.35)));
  const bellGeo = new THREE.LatheGeometry(profile, 32).translate(0, -BELL_H, 0);
  const bell = new THREE.Mesh(bellGeo, mat(new THREE.MeshStandardMaterial({
    color: 0xc49a4a, roughness: 0.3, metalness: 0.75, side: THREE.DoubleSide,
  })));
  bell.position.set(0, BELL_TOP, 0);
  bell.castShadow = true;
  bell.name = 'Clock_bell';
  bell.onBeforeRender = () => {
    bell.rotation.x = swingAngle();
    bell.updateMatrix();
    bell.matrixWorld.multiplyMatrices(group.matrixWorld, bell.matrix);
  };
  group.add(bell);

  // Spitzdach mit Kupfer-Patina und Spitze
  const roofH = 2.8;
  const roofGeo = new THREE.ConeGeometry(2.68 * Math.SQRT2, roofH, 4, 1).rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, mat(new THREE.MeshStandardMaterial({
    color: 0x4e8a76, roughness: 0.6, metalness: 0.3, flatShading: true,
  })));
  roof.position.set(0, ROOF_Y + roofH / 2, 0);
  roof.castShadow = roof.receiveShadow = true;
  roof.name = 'Clock_roof';
  group.add(roof);
  const gold = mat(new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 }));
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 8), gold);
  spire.position.set(0, ROOF_Y + roofH + 0.35, 0);
  spire.name = 'Clock_spire';
  group.add(spire);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), gold);
  ball.position.set(0, ROOF_Y + roofH + 0.48, 0);
  ball.name = 'Clock_ball';
  group.add(ball);
}
