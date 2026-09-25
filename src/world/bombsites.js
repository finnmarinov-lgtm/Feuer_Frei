import * as THREE from 'three';
import { BOMB } from '../config.js';
import { BOMB_SITES } from './map.js';

// Bombenmodus: aufgemalte Bombenplätze am Boden und die gelegte Bombe (blinkt und piept,
// je näher die Explosion, desto schneller).

/** Aufgesprühte Markierung: Kreis mit schraffiertem Rand und Bombe in der Mitte */
function siteTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const mid = S / 2;
  const paint = 'rgba(214, 76, 34, 0.85)';
  x.fillStyle = 'rgba(214, 76, 34, 0.1)';
  x.beginPath();
  x.arc(mid, mid, mid - 8, 0, Math.PI * 2);
  x.fill();
  // Rand: dicker Ring und Schraffur nach innen
  x.strokeStyle = paint;
  x.lineWidth = 18;
  x.beginPath();
  x.arc(mid, mid, mid - 14, 0, Math.PI * 2);
  x.stroke();
  x.save();
  x.beginPath();
  x.arc(mid, mid, mid - 14, 0, Math.PI * 2);
  x.arc(mid, mid, mid - 62, 0, Math.PI * 2, true);
  x.clip();
  x.lineWidth = 12;
  for (let i = -S; i < S * 2; i += 38) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + S, S);
    x.stroke();
  }
  x.restore();
  // Bombe: Kugel mit Zündschnur und Funken
  x.fillStyle = paint;
  x.beginPath();
  x.arc(mid - 10, mid + 22, 74, 0, Math.PI * 2);
  x.fill();
  x.fillRect(mid + 28, mid - 70, 44, 36);
  x.lineWidth = 12;
  x.beginPath();
  x.moveTo(mid + 50, mid - 70);
  x.quadraticCurveTo(mid + 70, mid - 120, mid + 110, mid - 112);
  x.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    x.beginPath();
    x.moveTo(mid + 122 + Math.cos(a) * 14, mid - 116 + Math.sin(a) * 14);
    x.lineTo(mid + 122 + Math.cos(a) * 32, mid - 116 + Math.sin(a) * 32);
    x.stroke();
  }
  // leicht fleckig wie Sprühfarbe auf Sand
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`;
    x.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Sprengsatz: vier Stangen mit Klebeband, oben das Kästchen mit Anzeige und Lämpchen */
function bombModel() {
  const root = new THREE.Group();
  root.name = 'Bombe';
  const stickMat = new THREE.MeshStandardMaterial({ color: 0x8c805a, roughness: 0.85 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.6 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.3 });
  const stick = new THREE.CylinderGeometry(0.029, 0.029, 0.27, 12).rotateZ(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(stick, stickMat);
    m.position.set(0, 0.029, (i - 1.5) * 0.059);
    root.add(m);
  }
  for (const x of [-0.08, 0.08]) {
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.066, 0.25), tapeMat);
    tape.position.set(x, 0.031, 0);
    root.add(tape);
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.036, 0.1), boxMat);
  box.position.set(0, 0.075, 0);
  root.add(box);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0d1a0d, emissive: 0x39ff5a, emissiveIntensity: 0.9 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.028), screenMat);
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(-0.012, 0.0935, -0.018);
  root.add(screen);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03), new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.7 }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(-0.012, 0.0935, 0.022);
  root.add(keys);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 0 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), ledMat);
  led.position.set(0.048, 0.096, 0);
  root.add(led);
  // zwei Drähte vom Kästchen zu den Stangen
  for (const [color, z] of [[0xc4231b, -0.03], [0xd8b21e, 0.03]]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.065, 0.075, z),
      new THREE.Vector3(0.11, 0.1, z * 1.4),
      new THREE.Vector3(0.14, 0.06, z * 1.8),
    ]);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.004, 5), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    root.add(wire);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, ledMat, screenMat };
}

export class BombSites {
  constructor(scene) {
    this.scene = scene;
    const tex = siteTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(BOMB.siteRadius * 2, BOMB.siteRadius * 2);
    this.sites = {};
    for (const [side, pos] of Object.entries(BOMB_SITES)) {
      const m = new THREE.Mesh(geo, mat);
      m.name = `Bombenplatz_${side}`;
      m.rotation.set(-Math.PI / 2, 0, side === 'west' ? 0.3 : 0.3 + Math.PI);
      m.position.set(pos.x, 0.015, pos.z);
      m.receiveShadow = true;
      m.renderOrder = -1;
      m.visible = false;
      scene.add(m);
      this.sites[side] = m;
    }
    const b = bombModel();
    this.bomb = b.root;
    this.ledMat = b.ledMat;
    this.screenMat = b.screenMat;
    this.bomb.visible = false;
    scene.add(this.bomb);
    this.planted = false;
    this.beepT = 0;
    this.ledT = 0;
  }

  /** Nur den Platz zeigen, um den es in dieser Runde geht (null = keinen); Lage aus der aktuellen Karte */
  show(side) {
    for (const [s, m] of Object.entries(this.sites)) {
      const pos = BOMB_SITES[s];
      m.position.set(pos.x, pos.y + 0.015, pos.z);
      m.visible = s === side;
    }
  }

  place(pos, yaw = 0) {
    this.bomb.position.copy(pos);
    this.bomb.rotation.set(0, yaw, 0);
    this.bomb.visible = true;
    this.planted = true;
    this.beepT = 0;
    this.ledT = 0;
  }

  remove() {
    this.bomb.visible = false;
    this.planted = false;
    this.ledMat.emissiveIntensity = 0;
  }

  get position() {
    return this.bomb.position;
  }

  /**
   * Blinken und Piepen: left = Sekunden bis zur Explosion. Das Piepen wird immer schneller,
   * in den letzten Sekunden fast ein Dauerton. defused: Bombe ist aus (kein Piepen mehr).
   */
  update(dt, left, audio, defused = false) {
    if (!this.planted) return;
    this.ledT = Math.max(0, this.ledT - dt);
    if (defused) {
      this.ledMat.emissiveIntensity = 0;
      this.screenMat.emissiveIntensity = 0.25;
      return;
    }
    this.screenMat.emissiveIntensity = 0.9;
    this.beepT -= dt;
    if (this.beepT <= 0 && left > 0) {
      const frac = Math.max(0, Math.min(1, left / BOMB.timer));
      this.beepT = left < 2 ? 0.1 : 0.14 + 0.9 * frac * frac;
      this.ledT = Math.min(0.12, this.beepT * 0.6);
      audio.play('bombBeep', { position: this.bomb.position, freq: left < 2 ? 3300 : 2800 });
    }
    this.ledMat.emissiveIntensity = this.ledT > 0 ? 6 : 0.15;
  }
}
