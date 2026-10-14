import * as THREE from 'three';
import { BANANA } from '../config.js';
import { MAP } from '../world/map.js';
import { NavGrid } from '../ai/nav.js';

// Goldene Banane (Wunsch aus den YouTube-Kommentaren): taucht selten mitten in einer Runde irgendwo
// auf der Karte auf, schwebt, dreht sich und leuchtet mit einem Lichtstrahl nach oben, damit man sie
// von weitem findet. Wer sie zuerst berührt, bekommt den goldenen Spieler-Skin (nur so zu haben).
// Ob und wo sie erscheint und wer sie bekommt, entscheidet der Host (siehe duel.js); dieses Modul
// zeigt sie nur an und meldet, ob der eigene Spieler sie berührt.

const LENGTH_SEGMENTS = 28;
const RADIAL_SEGMENTS = 12;

/** Bananenform: gebogener Schlauch, dick in der Mitte, spitz an den Enden, mit fünf flachen Kanten */
function bananaGeometry() {
  const R = 0.32;
  const a0 = -0.75, a1 = 0.75;
  const pos = [];
  const idx = [];
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const side = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= LENGTH_SEGMENTS; i++) {
    const t = i / LENGTH_SEGMENTS;
    const a = a0 + (a1 - a0) * t;
    // Mittellinie auf einem Kreisbogen (die Banane liegt mit dem Bauch nach unten)
    center.set(Math.sin(a) * R, -Math.cos(a) * R + R, 0);
    normal.set(-Math.sin(a), Math.cos(a), 0);
    const r = Math.max(0.006, 0.058 * Math.pow(Math.sin(Math.PI * t), 0.55));
    for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
      const th = (j / RADIAL_SEGMENTS) * Math.PI * 2;
      const ridge = 1 + 0.07 * Math.cos(th * 5);
      const c = Math.cos(th) * r * ridge, s = Math.sin(th) * r * ridge;
      pos.push(center.x + normal.x * c + side.x * s, center.y + normal.y * c + side.y * s, center.z + normal.z * c + side.z * s);
    }
  }
  const row = RADIAL_SEGMENTS + 1;
  for (let i = 0; i < LENGTH_SEGMENTS; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // um die Mitte drehen lassen
  geo.translate(0, -0.06, 0);
  return geo;
}

/** weicher Verlauf für Strahl und Schein (einmal gezeichnet) */
function gradientTexture(radial) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = radial ? x.createRadialGradient(32, 32, 0, 32, 32, 32) : x.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(radial ? 0.35 : 0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Banana {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'GoldeneBanane';
    this.root.visible = false;
    // die Banane selbst: poliertes Gold, das leicht von innen glüht
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffc93c, metalness: 1, roughness: 0.18, emissive: 0x8a5a00, emissiveIntensity: 0.55,
    });
    this.fruit = new THREE.Group();
    const body = new THREE.Mesh(bananaGeometry(), gold);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 6), new THREE.MeshStandardMaterial({
      color: 0x8a5a14, metalness: 0.6, roughness: 0.5,
    }));
    // Stiel am oberen Ende des Bogens
    stem.position.set(-0.24, 0.17, 0);
    stem.rotation.z = 0.9;
    this.fruit.add(body, stem);
    this.fruit.scale.setScalar(1.25);
    this.root.add(this.fruit);
    // Schein um die Banane und Lichtsäule nach oben (beide additiv, werfen keinen Schatten)
    const glowMat = new THREE.SpriteMaterial({
      map: gradientTexture(true), color: 0xffcf4a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(1.3);
    this.root.add(this.glow);
    const beamMat = new THREE.MeshBasicMaterial({
      map: gradientTexture(false), color: 0xffc23a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 14, 16, 1, true), beamMat);
    this.beam.position.y = 7 - 0.9;
    this.root.add(this.beam);
    this.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    scene.add(this.root);
    this.t = 0;
  }

  get shown() {
    return this.root.visible;
  }

  /** Banane auf den Boden bei pos stellen (sie schwebt knapp einen Meter darüber) */
  show(pos) {
    this.base = pos.clone();
    this.root.position.copy(pos);
    this.root.visible = true;
    this.t = 0;
  }

  hide() {
    this.root.visible = false;
  }

  update(dt) {
    if (!this.root.visible) return;
    this.t += dt;
    const t = this.t;
    // beim Erscheinen kurz aufploppen, danach schweben und drehen
    const pop = Math.min(1, t / 0.35);
    const s = pop < 1 ? 1.25 * (0.3 + 0.7 * pop + Math.sin(pop * Math.PI) * 0.35) : 1.25;
    this.fruit.scale.setScalar(s);
    this.fruit.position.y = 0.95 + Math.sin(t * 2.2) * 0.08;
    this.fruit.rotation.y = t * 1.8;
    this.fruit.rotation.z = Math.sin(t * 1.3) * 0.15;
    this.glow.position.y = this.fruit.position.y;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    this.glow.material.opacity = 0.6 + 0.3 * pulse;
    this.glow.scale.setScalar(1.15 + 0.25 * pulse);
    this.beam.material.opacity = 0.3 + 0.15 * pulse;
  }

  /** berührt ein Spieler mit den Füßen bei feet die Banane? */
  touches(feet) {
    if (!this.root.visible) return false;
    const p = this.root.position;
    const dy = feet.y - p.y;
    return Math.hypot(feet.x - p.x, feet.z - p.z) < BANANA.reach && dy > -0.6 && dy < 1.6;
  }
}

/** Wegenetz der Karte (dasselbe wie für die KI, einmal pro Karte gebaut) */
export function bananaNav(game) {
  game.navs ||= {};
  return (game.navs[MAP.id] ||= new NavGrid(game.physics, MAP.bounds));
}

const _down = { x: 0, y: -1, z: 0 };

/**
 * Zufällige Stelle für die Banane: begehbar, eher im mittleren Teil der Karte, nicht in einem
 * Startbereich und mit festem Boden darunter (nicht im Wasser). null, wenn nichts passt.
 */
export function findBananaSpot(game) {
  const nav = bananaNav(game);
  const b = MAP.bounds;
  const w = b.x1 - b.x0;
  const arena = game.arena;
  const p = new THREE.Vector3();
  for (let k = 0; k < 80; k++) {
    // die mittleren 70 % der Länge: zwischen den Startbereichen, wo gekämpft wird
    p.set(b.x0 + w * (0.15 + Math.random() * 0.7), 0, b.z0 + (b.z1 - b.z0) * (0.08 + Math.random() * 0.84));
    if (!nav.walkableAt(p.x, p.z)) continue;
    if (arena.inBuyZone(p, 'west') || arena.inBuyZone(p, 'east')) continue;
    // Boden suchen: von knapp über Hüfthöhe nach unten
    const hit = game.physics.raycast({ x: p.x, y: 1.0, z: p.z }, _down, 1.3);
    if (!hit) continue;
    p.y = 1.0 - hit.distance;
    return p.clone();
  }
  return null;
}
