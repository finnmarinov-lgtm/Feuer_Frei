import { SOLID } from '../engine/physics.js';

// Wegenetz für die KI: ein Raster aus 0,5-m-Feldern über der Karte. Ein Feld ist begehbar, wenn
// eine stehende Figur dort Platz hat (mit etwas Abstand zu Wänden). Wege sucht A*, danach wird
// der Weg geglättet: gerade Strecken überall dort, wo nichts im Weg ist.

const CELL = 0.5;
const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

/** kleiner Binär-Heap für die offene Liste (Kosten, Feld) */
class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }

  get size() {
    return this.k.length;
  }

  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

export class NavGrid {
  constructor(physics, { x0 = -30, x1 = 30, z0 = -20, z1 = 20 } = {}) {
    this.physics = physics;
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.round((x1 - x0) / CELL);
    this.nz = Math.round((z1 - z0) / CELL);
    const n = this.nx * this.nz;
    this.walk = new Uint8Array(n);
    // Felder dicht an Hindernissen kosten etwas mehr: Wege laufen nicht an Wänden entlang
    this.extra = new Float32Array(n);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    // Feld schon fertig untersucht (in dieser Suche): wird nicht noch einmal ausgebreitet
    this.closed = new Uint32Array(n);
    this.run = 0;
    this._build();
  }

  _build() {
    const R = this.physics.R;
    // stehende Figur: Zylinder von 0,25 bis 1,75 m Höhe, etwas breiter als der Spieler
    const shape = new R.Cylinder(0.75, 0.42);
    const pos = { x: 0, y: 1.0, z: 0 };
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        pos.x = this.x0 + (i + 0.5) * CELL;
        pos.z = this.z0 + (j + 0.5) * CELL;
        this.walk[j * this.nx + i] = this.physics.overlaps(shape, pos, SOLID) ? 0 : 1;
      }
    }
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        if (!this.walk[j * this.nx + i]) continue;
        let near = 0;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            if (!this.isWalk(i + di, j + dj)) near = Math.max(near, 3 - Math.max(Math.abs(di), Math.abs(dj)));
          }
        }
        this.extra[j * this.nx + i] = near * 0.35;
      }
    }
  }

  isWalk(i, j) {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.walk[j * this.nx + i] === 1;
  }

  cellX(x) {
    return Math.floor((x - this.x0) / CELL);
  }

  cellZ(z) {
    return Math.floor((z - this.z0) / CELL);
  }

  walkableAt(x, z) {
    return this.isWalk(this.cellX(x), this.cellZ(z));
  }

  /** nächstes begehbares Feld (Suche in wachsenden Ringen), als [i, j] oder null */
  nearest(i, j, maxR = 14) {
    if (this.isWalk(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.isWalk(i + di, j + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            best = [i + di, j + dj];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** nächster begehbarer Punkt zu (x, z) */
  snap(x, z) {
    const c = this.nearest(this.cellX(x), this.cellZ(z));
    if (!c) return null;
    return { x: this.x0 + (c[0] + 0.5) * CELL, z: this.z0 + (c[1] + 0.5) * CELL };
  }

  /** gerade Strecke ohne Hindernis (in Schritten von einem viertel Feld geprüft) */
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (CELL * 0.25)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.walkableAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** zufälliger begehbarer Punkt im Umkreis r um (x, z) */
  randomNear(x, z, r, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.walkableAt(px, pz)) return { x: px, z: pz };
    }
    return this.snap(x, z);
  }

  /** Weg von a nach b als Liste von Punkten {x, z} (ohne Startpunkt), oder null */
  path(ax, az, bx, bz) {
    const s = this.nearest(this.cellX(ax), this.cellZ(az));
    const e = this.nearest(this.cellX(bx), this.cellZ(bz));
    if (!s || !e) return null;
    const nx = this.nx;
    const start = s[1] * nx + s[0];
    const goal = e[1] * nx + e[0];
    const run = ++this.run;
    const { g, from, stamp, closed, walk, extra } = this;
    const heap = new Heap();
    const h = (i, j) => {
      const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    stamp[start] = run;
    g[start] = 0;
    from[start] = -1;
    heap.push(h(s[0], s[1]), start);
    let found = start === goal;
    let guard = 0;
    while (heap.size && !found && guard < 40000) {
      const cur = heap.pop();
      // ältere Einträge desselben Felds überspringen: sein bester Weg ist schon ausgebreitet
      if (closed[cur] === run) continue;
      closed[cur] = run;
      guard++;
      const ci = cur % nx, cj = (cur - ci) / nx;
      const gc = g[cur];
      for (const [di, dj, cost] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (!this.isWalk(ni, nj)) continue;
        // diagonal nur, wenn keine Ecke im Weg ist
        if (di && dj && (!walk[cj * nx + ni] || !walk[nj * nx + ci])) continue;
        const nIdx = nj * nx + ni;
        const ng = gc + cost + extra[nIdx];
        if (stamp[nIdx] === run && ng >= g[nIdx]) continue;
        stamp[nIdx] = run;
        g[nIdx] = ng;
        from[nIdx] = cur;
        if (nIdx === goal) {
          found = true;
          break;
        }
        heap.push(ng + h(ni, nj), nIdx);
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = stamp[c] === run ? from[c] : -1) {
      cells.push(c);
      if (c === start) break;
    }
    cells.reverse();
    const pts = cells.map((c) => {
      const i = c % nx, j = (c - i) / nx;
      return { x: this.x0 + (i + 0.5) * CELL, z: this.z0 + (j + 0.5) * CELL };
    });
    // Glätten: vom aktuellen Punkt aus so weit geradeaus wie möglich
    const out = [];
    let px = ax, pz = az;
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) {
        if (this.clear(px, pz, pts[m].x, pts[m].z)) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      px = pts[far].x;
      pz = pts[far].z;
      k = far + 1;
    }
    // das eigentliche Ziel, falls es begehbar ist
    if (this.walkableAt(bx, bz) && out.length) out[out.length - 1] = { x: bx, z: bz };
    return out;
  }
}
