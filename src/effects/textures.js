import * as THREE from 'three';

// Kleine prozedurale Texturen für Partikel, Einschusslöcher und Mündungsfeuer.

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function sparkTexture() {
  return canvas(64, (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, n, n);
  });
}

export function puffTexture(seed = 3, size = 128, density = 0.34) {
  return canvas(size, (g, n) => {
    const rand = rng(seed);
    g.clearRect(0, 0, n, n);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * n * 0.2;
      const x = n / 2 + Math.cos(a) * d;
      const y = n / 2 + Math.sin(a) * d;
      const rad = n * (0.14 + rand() * 0.2);
      const r = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = 200 + Math.floor(rand() * 55);
      r.addColorStop(0, `rgba(${v},${v},${v},${density})`);
      r.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = r;
      g.fillRect(0, 0, n, n);
    }
    // weicher Rand
    const img = g.getImageData(0, 0, n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = (x - n / 2) / (n / 2), dy = (y - n / 2) / (n / 2);
        const f = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
        img.data[(y * n + x) * 4 + 3] *= Math.min(1, f * 1.8);
      }
    }
    g.putImageData(img, 0, 0);
  });
}

export function bulletHoleTexture() {
  return canvas(64, (g, n) => {
    const rand = rng(11);
    const c = n / 2;
    const ring = g.createRadialGradient(c, c, 0, c, c, c);
    ring.addColorStop(0, 'rgba(20,18,16,1)');
    ring.addColorStop(0.18, 'rgba(25,22,20,1)');
    ring.addColorStop(0.3, 'rgba(60,55,50,0.85)');
    ring.addColorStop(0.55, 'rgba(90,85,80,0.35)');
    ring.addColorStop(1, 'rgba(90,85,80,0)');
    g.fillStyle = ring;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(30,28,25,0.55)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 6, c + Math.sin(a) * 6);
      g.lineTo(c + Math.cos(a) * (12 + rand() * 14), c + Math.sin(a + (rand() - 0.5) * 0.3) * (12 + rand() * 14));
      g.stroke();
    }
  });
}

export function scorchTexture() {
  return canvas(128, (g, n) => {
    const rand = rng(5);
    const c = n / 2;
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * c * 0.5;
      const rad = c * (0.2 + rand() * 0.4);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const r = g.createRadialGradient(x, y, 0, x, y, rad);
      r.addColorStop(0, 'rgba(10,8,6,0.25)');
      r.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, n, n);
    }
  });
}

export function muzzleTexture() {
  return canvas(128, (g, n) => {
    const c = n / 2;
    g.translate(c, c);
    const rays = 7;
    for (let i = 0; i < rays; i++) {
      g.save();
      g.rotate((i / rays) * Math.PI * 2 + 0.3);
      const len = c * (0.65 + (i % 3) * 0.12);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, 'rgba(255,240,200,1)');
      grad.addColorStop(0.5, 'rgba(255,170,60,0.6)');
      grad.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -c * 0.1);
      g.lineTo(len, 0);
      g.lineTo(0, c * 0.1);
      g.closePath();
      g.fill();
      g.restore();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.45);
    core.addColorStop(0, 'rgba(255,255,240,1)');
    core.addColorStop(0.4, 'rgba(255,200,110,0.8)');
    core.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = core;
    g.fillRect(-c, -c, n, n);
  });
}
