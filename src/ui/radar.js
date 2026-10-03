import * as THREE from 'three';
import { BOMB, GRENADES } from '../config.js';
import { BUY_ZONES, MAP } from '../world/map.js';
import { otherTeam } from '../game/sides.js';

// Radar oben links wie in CS: die Karte von oben (Boden hell, Wände dunkel, Kisten und halbhohe
// Mauern dazwischen), darauf man selbst als Pfeil in Blickrichtung, die Mitspieler als Punkte und
// Gegner nur, solange jemand aus dem eigenen Team sie sieht (Rauch versteckt sie). Danach verblasst
// der Punkt an der Stelle, an der der Gegner zuletzt zu sehen war. Dazu die Startbereiche in den
// Teamfarben, im Bombenmodus der Bombenplatz der Runde und die gelegte Bombe, im Training die Ziele.

// Größe in CSS-Pixeln (Seitenverhältnis wie die Karten, 3 : 2) und Rand um die Karte in Metern
const W = 216;
const H = 150;
const PAD = 1.5;
const FLOOR = 'rgba(190, 185, 172, 0.78)';
const LOW = 'rgba(96, 98, 104, 0.92)';
const STAIR = 'rgba(152, 148, 138, 0.92)';
const WALL = 'rgba(24, 26, 31, 0.96)';
const TEAM_COLOR = { rot: '#ff6d57', blau: '#6fa8ff', host: '#ff6d57', guest: '#6fa8ff' };
const ZONE_COLOR = { rot: 'rgba(255, 109, 87, 0.2)', blau: 'rgba(111, 168, 255, 0.2)' };
const ZONE_COLOR_DUEL = { host: ZONE_COLOR.rot, guest: ZONE_COLOR.blau };
const ME = '#ffd24a';
// Blickfeld beim Entdecken (halber Winkel) und größte Entfernung
const SPOT_FOV = (80 * Math.PI) / 180;
const SPOT_RANGE = 90;
// so lange bleibt ein Gegner nach dem letzten Sehen noch als verblassender Punkt stehen (Sekunden)
const FADE = 2.5;

const _eye = new THREE.Vector3();
const _head = new THREE.Vector3();
const _chest = new THREE.Vector3();

/** kleinster Abstand von p zur Strecke a-b */
function segDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

export class Radar {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('radar');
    this.ctx = this.el.getContext('2d');
    // Karte als Hintergrund, einmal pro Karte gezeichnet
    this.bg = document.createElement('canvas');
    this.mapId = null;
    this.dpr = 0;
    // Gegner -> { t, x, z }: wann und wo zuletzt gesehen
    this.seen = new Map();
    this.spotT = 0;
    this.time = 0;
  }

  /** neue Partie: nichts mehr als gesehen merken */
  reset() {
    this.seen.clear();
    this.spotT = 0;
  }

  // Weltkoordinaten -> Pixel: Norden (-z) ist oben, Westen links
  _layout() {
    const b = MAP.bounds;
    const x0 = b.x0 - PAD, x1 = b.x1 + PAD, z0 = b.z0 - PAD, z1 = b.z1 + PAD;
    this.k = Math.min(W / (x1 - x0), H / (z1 - z0));
    this.ox = (W - (x1 - x0) * this.k) / 2 - x0 * this.k;
    this.oz = (H - (z1 - z0) * this.k) / 2 - z0 * this.k;
  }

  _sx(x) {
    return this.ox + x * this.k;
  }

  _sy(z) {
    return this.oz + z * this.k;
  }

  // Grundriss der Karte: Boden, dann niedrige Teile, Treppen, zuletzt die hohen Wände obendrauf
  _paintMap() {
    const a = this.g.arena;
    const dpr = this.dpr;
    this.bg.width = this.el.width = Math.round(W * dpr);
    this.bg.height = this.el.height = Math.round(H * dpr);
    const c = this.bg.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    this._layout();
    const k = this.k;
    const rect = (x0, z0, x1, z1) => c.fillRect(this._sx(x0), this._sy(z0), (x1 - x0) * k, (z1 - z0) * k);
    const b = MAP.bounds;
    c.fillStyle = FLOOR;
    rect(b.x0, b.z0, b.x1, b.z1);
    const layers = { low: [], stair: [], wall: [] };
    for (const box of a.boxes) {
      // unsichtbare Wände nur für Spieler, Boden, Sockel und alles über Kopfhöhe (Dächer) zählen nicht
      if (box.collider === 'none' || box.collider === 'clip' || box.mat === 'ground') continue;
      const y0 = box.min[1], y1 = box.max[1];
      if (y1 <= 0.35 || y0 >= 2.2) continue;
      layers[box.collider === 'stair' ? 'stair' : y1 < 1.4 ? 'low' : 'wall'].push(box);
    }
    c.fillStyle = LOW;
    for (const box of layers.low) rect(box.min[0], box.min[2], box.max[0], box.max[2]);
    // Kisten und Fässer (niedrige Deckung)
    for (const p of a.props) {
      if (p.top < 0.6) continue;
      c.save();
      c.translate(this._sx(p.x), this._sy(p.z));
      c.beginPath();
      if (p.round) c.arc(0, 0, Math.max(p.hx, p.hz) * k, 0, Math.PI * 2);
      else {
        c.rotate(-p.yaw);
        c.rect(-p.hx * k, -p.hz * k, 2 * p.hx * k, 2 * p.hz * k);
      }
      c.fill();
      c.restore();
    }
    c.fillStyle = STAIR;
    for (const box of layers.stair) rect(box.min[0], box.min[2], box.max[0], box.max[2]);
    c.fillStyle = WALL;
    for (const box of layers.wall) rect(box.min[0], box.min[2], box.max[0], box.max[2]);
  }

  // Gegner entdecken: wen sieht man selbst oder ein Mitspieler (Blickfeld, freie Sicht, kein Rauch)?
  _spot() {
    const g = this.g;
    const eyes = [];
    if (g.player.alive) eyes.push([g.player.eyePosition(new THREE.Vector3()), g.player.yaw]);
    for (const r of g.others) {
      if (g.foes.includes(r) || !r.alive || r.hidden) continue;
      eyes.push([r.headPosition(new THREE.Vector3()), r.root.rotation.y]);
    }
    for (const f of g.foes) {
      if (!f.alive || f.hidden) continue;
      f.headPosition(_head);
      _chest.copy(f.root.position);
      _chest.y += 1.15;
      for (const [eye, yaw] of eyes) {
        if (this._sees(eye, yaw, _head) || this._sees(eye, yaw, _chest)) {
          this.seen.set(f, { t: this.time, x: f.root.position.x, z: f.root.position.z });
          break;
        }
      }
    }
  }

  _sees(eye, yaw, p) {
    const dx = p.x - eye.x, dz = p.z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SPOT_RANGE) return false;
    // Winkel zur Blickrichtung (vorne = -z, gedreht um yaw); ganz nahe sieht man immer
    const ang = Math.atan2(-dx, -dz) - yaw;
    if (dist > 3 && Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) > SPOT_FOV) return false;
    if (!this.g.physics.lineOfSight(eye, p)) return false;
    for (const c of this.g.grenades.clouds) {
      if (c.t < 0.8 || c.t > GRENADES.smoke.duration + 1) continue;
      if (segDist(eye, p, c.center) < GRENADES.smoke.radius * 0.9) return false;
    }
    return true;
  }

  update(dt) {
    const g = this.g;
    const on = g.settings.radar !== false;
    if (this.el.hidden !== !on) {
      this.el.hidden = !on;
      document.body.classList.toggle('radar', on);
    }
    if (!on) return;
    this.time += dt;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (g.arena.mapId !== this.mapId || dpr !== this.dpr) {
      this.dpr = dpr;
      this.mapId = g.arena.mapId;
      this._paintMap();
    }
    const m = g.match;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.drawImage(this.bg, 0, 0, W, H);
    if (m.duel) {
      this.spotT -= dt;
      if (this.spotT <= 0) {
        this.spotT = 0.1;
        this._spot();
      }
      this._zones(c, m);
      this._bomb(c, m);
      this._players(c, m);
      this._pings(c);
    } else {
      // Training: die stehenden Ziele
      c.fillStyle = '#ff9a3d';
      for (const t of g.targets.standing()) c.fillRect(this._sx(t.root.position.x) - 2, this._sy(t.root.position.z) - 2, 4, 4);
    }
    if (g.player.alive) this._arrow(c, g.player.feet.x, g.player.feet.z, g.player.yaw, ME, 6.5);
  }

  // Startbereiche: der eigene in der eigenen Teamfarbe, der andere in der des Gegners
  _zones(c, m) {
    const colors = m.teamMode ? ZONE_COLOR : ZONE_COLOR_DUEL;
    const theirs = m.teamMode ? otherTeam(m.myTeam) : m.them;
    const sides = [[m.side, colors[m.myTeam]], [m.side === 'west' ? 'east' : 'west', colors[theirs]]];
    for (const [side, color] of sides) {
      const z = BUY_ZONES[side];
      if (!z || !color) continue;
      c.fillStyle = color;
      c.fillRect(this._sx(z.x0), this._sy(z.z0), (z.x1 - z.x0) * this.k, (z.z1 - z.z0) * this.k);
    }
  }

  // Bombenplatz dieser Runde und die gelegte Bombe (blinkt)
  _bomb(c, m) {
    if (!m.bombMode || !['freeze', 'live', 'end'].includes(m.phase)) return;
    const s = m.site;
    if (s) {
      c.beginPath();
      c.arc(this._sx(s.x), this._sy(s.z), Math.max(6, BOMB.siteRadius * this.k), 0, Math.PI * 2);
      c.fillStyle = 'rgba(255, 150, 60, 0.22)';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(255, 150, 60, 0.95)';
      c.stroke();
    }
    const b = m.bomb;
    if (b && !b.done) {
      const blink = 0.55 + 0.45 * Math.sin(this.time * 9);
      c.beginPath();
      c.arc(this._sx(b.pos.x), this._sy(b.pos.z), 4, 0, Math.PI * 2);
      c.fillStyle = `rgba(255, 45, 30, ${blink.toFixed(2)})`;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = '#fff';
      c.stroke();
    }
  }

  // Mitspieler (mit Blickrichtung) und entdeckte Gegner
  _players(c, m) {
    const g = this.g;
    for (const r of g.others) {
      if (!r.alive || r.hidden || g.foes.includes(r)) continue;
      this._dot(c, r.root.position.x, r.root.position.z, TEAM_COLOR[r.team], '#fff', 1, r.root.rotation.y);
    }
    for (const f of g.foes) {
      const s = this.seen.get(f);
      if (!s) continue;
      const age = this.time - s.t;
      // tot oder lange nicht gesehen: weg damit
      if (!f.alive || age > FADE) {
        this.seen.delete(f);
        continue;
      }
      // gerade zu sehen: an der echten Stelle, sonst verblassend an der letzten
      const now = age < 0.25;
      const x = now ? f.root.position.x : s.x;
      const z = now ? f.root.position.z : s.z;
      this._dot(c, x, z, TEAM_COLOR[f.team], 'rgba(0, 0, 0, 0.8)', now ? 1 : Math.max(0.15, 1 - age / FADE));
    }
  }

  // Markierungen der Mitspieler (hud.ping): Punkt mit Ring, der sich immer wieder ausbreitet
  _pings(c) {
    for (const mk of this.g.hud.pings.values()) {
      const sx = this._sx(mk.pos.x), sy = this._sy(mk.pos.z);
      const color = mk.foe ? '255, 80, 60' : '242, 179, 61';
      const k = (this.time * 1.4) % 1;
      c.beginPath();
      c.arc(sx, sy, 3 + k * 9, 0, Math.PI * 2);
      c.lineWidth = 1.5;
      c.strokeStyle = `rgba(${color}, ${(1 - k).toFixed(2)})`;
      c.stroke();
      c.beginPath();
      c.arc(sx, sy, 3, 0, Math.PI * 2);
      c.fillStyle = `rgb(${color})`;
      c.fill();
    }
  }

  _dot(c, x, z, fill, stroke, alpha, yaw = null) {
    const sx = this._sx(x), sy = this._sy(z);
    c.globalAlpha = alpha;
    if (yaw !== null) {
      // kurzer Strich in Blickrichtung
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx - Math.sin(yaw) * 8, sy - Math.cos(yaw) * 8);
      c.lineWidth = 1.6;
      c.strokeStyle = fill;
      c.stroke();
    }
    c.beginPath();
    c.arc(sx, sy, 3.6, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = stroke;
    c.stroke();
    c.globalAlpha = 1;
  }

  // Pfeil in Blickrichtung (Spitze vorne)
  _arrow(c, x, z, yaw, fill, size) {
    c.save();
    c.translate(this._sx(x), this._sy(z));
    // vorne ist -z, auf dem Radar also oben; gedreht wie der Blick
    c.rotate(-yaw);
    c.beginPath();
    c.moveTo(0, -size);
    c.lineTo(size * 0.72, size * 0.75);
    c.lineTo(0, size * 0.35);
    c.lineTo(-size * 0.72, size * 0.75);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 1.3;
    c.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    c.stroke();
    c.restore();
  }
}
