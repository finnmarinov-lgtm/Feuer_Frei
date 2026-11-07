// Testlauf-Werkzeug (nur für den Entwicklungsserver, kommt nicht ins fertige Spiel).
// Im Tab laden:   const T = await import('/scripts/testlauf/harness.js'); T.install();
//
// Was es macht:
// - Takt über einen Worker statt requestAnimationFrame: Das Spiel läuft auch in Hintergrund-Tabs
//   und im versteckten Browser-Bereich weiter (dort kommt sonst kein Bild).
// - Schwarze Bilder: liest nach jedem gezeichneten Bild 20 Pixel aus der Leinwand. Sind fast alle
//   schwarz, wird das Bild mit Spielzustand notiert.
// - Leinwand geleert und nicht neu gezeichnet (Größe geändert, aber kein Bild danach).
// - Ungültige Zahlen (NaN) in Kamera und Spielerposition.
// - Fehler: window error, unhandledrejection, console.error/warn, rote Fehleranzeige des Spiels.
// - Bildzeiten, Runden, Partien.
// - Autopilot für die eigene Figur: läuft zum nächsten Gegner, zielt, schießt (mit/ohne Zielen).

const S = {
  installed: false,
  frames: 0,
  renders: 0,
  started: 0,
  black: [],
  blackCount: 0,
  clearedNoDraw: 0,
  nan: [],
  errors: [],
  warns: [],
  fehlerBox: [],
  frameMs: [],
  rounds: 0,
  matchesOver: 0,
  lastRound: null,
  lastState: null,
  phases: {},
  shots: 0,
  kills: 0,
  deaths: 0,
  notes: [],
};

const game = () => window.__game;
const now = () => performance.now();

function snap() {
  const g = game();
  const m = g?.match;
  const p = g?.player;
  const c = g?.camera?.position;
  return {
    t: Math.round((now() - S.started) / 100) / 10,
    state: g?.state,
    mode: g?.mode,
    map: g?.arena?.mapId,
    phase: m?.phase,
    round: m?.round,
    alive: p?.alive,
    killcam: !!g?.killcam?.active || !!g?.killcam?.firstPerson,
    weapon: g?.weapons?.inv?.active?.def?.id,
    ads: Math.round((g?.weapons?.ads ?? 0) * 100) / 100,
    cam: c ? [c.x, c.y, c.z].map((v) => Math.round(v * 10) / 10) : null,
    size: [window.innerWidth, window.innerHeight],
  };
}

function rec(list, item, max = 40) {
  if (list.length < max) list.push(item);
}

function finite(arr) {
  for (const v of arr) if (!Number.isFinite(v)) return false;
  return true;
}

const PIX = new Uint8Array(4);
let ROW = null;
function sampleBlack() {
  const g = game();
  const r = g.renderer.renderer;
  const gl = r.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  if (w < 4 || h < 4) return;
  r.setRenderTarget(null);
  // erst eine einzige Zeile in Bildmitte lesen (ein Aufruf statt 20, readPixels wartet jedes Mal auf
  // die Grafikkarte); nur wenn sie fast ganz schwarz ist, die 20 Punkte übers Bild
  if (!ROW || ROW.length < w * 4) ROW = new Uint8Array(w * 4);
  gl.readPixels(0, Math.floor(h / 2), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, ROW);
  let dark = 0;
  for (let i = 0; i < 20; i++) {
    const o = Math.floor(w * (0.05 + 0.9 * i / 19)) * 4;
    if (ROW[o] + ROW[o + 1] + ROW[o + 2] < 18) dark++;
  }
  if (dark < 18) return;
  let black = 0, n = 0;
  for (let iy = 0; iy < 4; iy++) {
    for (let ix = 0; ix < 5; ix++) {
      const x = Math.floor(w * (0.1 + 0.8 * ix / 4));
      const y = Math.floor(h * (0.15 + 0.7 * iy / 3));
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PIX);
      n++;
      if (PIX[0] + PIX[1] + PIX[2] < 18) black++;
    }
  }
  if (black >= n - 1) {
    S.blackCount++;
    rec(S.black, { ...snap(), black: `${black}/${n}` });
  }
}

/** Werkzeug einbauen. tick: Takt in ms (16 = ~60 Bilder pro Sekunde) */
export function install({ tick = 16 } = {}) {
  if (S.installed) return report();
  const g = game();
  if (!g) throw new Error('window.__game fehlt (läuft der Entwicklungsserver? Seite fertig geladen?)');
  S.installed = true;
  S.started = now();

  const frame = g.frame.bind(g);
  g.frame = () => {};

  const rnd = g.renderer;
  const render = rnd.render.bind(rnd);
  let drewThisFrame = false;
  rnd.render = (show) => {
    render(show);
    drewThisFrame = true;
    S.renders++;
    try {
      sampleBlack();
    } catch (e) {
      rec(S.errors, { ...snap(), msg: `sampleBlack: ${e.message}` });
    }
  };
  let resized = false;
  const onResize = g.onResize.bind(g);
  g.onResize = () => {
    onResize();
    resized = true;
  };

  addEventListener('error', (e) => rec(S.errors, { ...snap(), msg: `${e.message} @ ${e.filename}:${e.lineno}` }));
  addEventListener('unhandledrejection', (e) => rec(S.errors, { ...snap(), msg: `rejection: ${e.reason?.message || e.reason}` }));
  const ce = console.error.bind(console);
  console.error = (...a) => {
    const msg = a.map((x) => x?.stack || x?.message || String(x)).join(' ').slice(0, 400);
    // normales Verbindungsende (Mitspieler lädt neu), das Spiel zeigt es nur als Hinweis (net/signal.js)
    if (!/peer error: .*User-Initiated Abort/.test(msg)) rec(S.errors, { ...snap(), msg });
    ce(...a);
  };
  const cw = console.warn.bind(console);
  console.warn = (...a) => {
    rec(S.warns, { ...snap(), msg: a.map(String).join(' ').slice(0, 300) });
    cw(...a);
  };

  const blob = new Blob([`setInterval(() => postMessage(0), ${tick});`], { type: 'text/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));
  let last = now();
  worker.onmessage = () => {
    const t = now();
    // Takte, die sich hinter einem langen Bild gestaut haben, verwerfen (sonst reagiert der Tab
    // minutenlang nicht mehr, weil er hunderte Bilder nachholt)
    if (t - last < tick * 0.6) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    drewThisFrame = false;
    resized = false;
    try {
      autopilotStep(dt);
      frame(dt, t);
    } catch (e) {
      rec(S.errors, { ...snap(), msg: `frame: ${e.stack || e.message}`.slice(0, 500) });
    }
    const ms = now() - t;
    S.frameMs.push(ms);
    if (S.frameMs.length > 3000) S.frameMs.splice(0, 1000);
    S.frames++;
    if (resized && !drewThisFrame) {
      S.clearedNoDraw++;
      rec(S.notes, { ...snap(), msg: 'Größe geändert, danach nicht gezeichnet (Leinwand leer)' });
    }
    watch();
  };
  S.worker = worker;
  return 'installiert';
}

function watch() {
  const g = game();
  const p = g.player;
  const cam = g.camera;
  if (!finite(cam.matrixWorld.elements) || !finite([p.feet.x, p.feet.y, p.feet.z, p.yaw, p.pitch])) {
    rec(S.nan, snap());
  }
  const m = g.match;
  if (m && m.round !== undefined && m.round !== S.lastRound) {
    if (S.lastRound) S.rounds++;
    S.lastRound = m.round;
  }
  if (m?.phase) S.phases[m.phase] = (S.phases[m.phase] || 0) + 1;
  if (g.state !== S.lastState) {
    if (g.state === 'results') S.matchesOver++;
    S.lastState = g.state;
  }
  const box = document.getElementById('fehler');
  if (box && !box.hidden) {
    const text = `${document.getElementById('fehler-titel')?.textContent} | ${document.getElementById('fehler-text')?.textContent}`;
    if (!S.fehlerBox.some((f) => f.text === text)) rec(S.fehlerBox, { ...snap(), text });
  }
  if (p.alive) ap.wasAlive = true;
  else if (ap.wasAlive) {
    ap.wasAlive = false;
    S.deaths++;
  }
}

// ---------- Autopilot ----------
const ap = { on: false, ads: 'mixed', buy: 'wolf', moveT: 0, stuckT: 0, lastPos: null, turn: 0, semiT: 0, adsNow: false, wasAlive: false, bought: -1, err: 0 };

/**
 * Autopilot an/aus. ads: 'always' | 'never' | 'mixed'; buy: Waffen-ID zum Kaufen in der Kaufzeit
 * ('wolf', 'luchs', 'falke', 'keiler', 'adler' oder null)
 */
export function autopilot(on = true, { ads = 'mixed', buy = 'wolf' } = {}) {
  ap.on = on;
  ap.ads = ads;
  ap.buy = buy;
  if (!on) {
    const i = game().input;
    i.setFire(false);
    i.setAlt(false);
    i.moveX = i.moveY = 0;
  }
  return `Autopilot ${on ? 'an' : 'aus'}`;
}

function angleTo(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), dist: Math.hypot(dx, dy, dz) };
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function autopilotStep(dt) {
  const g = game();
  if (!ap.on || g.state !== 'playing') return;
  const p = g.player;
  const input = g.input;
  const m = g.match;
  if (!p.alive) {
    input.setFire(false);
    input.setAlt(false);
    input.moveX = input.moveY = 0;
    return;
  }
  // in der Kaufzeit einmal pro Runde kaufen
  if (ap.buy && m?.round !== ap.bought && (m?.phase === 'freeze' || m?.phase === 'buy')) {
    ap.bought = m.round;
    try {
      m.buy?.(ap.buy);
      m.buy?.('vest');
    } catch (e) {
      rec(S.notes, { ...snap(), msg: `Kauf: ${e.message}` });
    }
  }
  const eye = g.camera.position.clone();
  const head = eye.clone();
  let best = null;
  for (const f of g.foes || []) {
    if (!f.alive) continue;
    f.headPosition ? f.headPosition(head) : head.copy(f.position).setY(f.position.y + 1.5);
    const vis = g.physics.lineOfSight(eye, head);
    const a = angleTo(eye, head);
    const score = a.dist + (vis ? 0 : 1000);
    if (!best || score < best.score) best = { f, vis, a, score, pos: f.position.clone() };
  }
  const DEG = Math.PI / 180;
  const ws = g.weapons;
  const def = ws.inv?.active?.def;
  if (best?.vis) {
    // zielen und den halben Rückstoß ausgleichen (wie ein Mensch, der gegenzieht)
    if (Math.random() < dt * 0.6) ap.err = (Math.random() - 0.5) * 0.02;
    const ty = best.a.yaw + ap.err;
    const tp = best.a.pitch - ws.recoil.pitch * DEG * 0.5;
    const dy = wrap(ty - p.yaw), dp = tp - p.pitch;
    const maxTurn = 7 * dt;
    p.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
    p.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp));
    const onTarget = Math.abs(dy) < 0.05 && Math.abs(dp) < 0.05;
    if (ap.ads === 'always') ap.adsNow = true;
    else if (ap.ads === 'never') ap.adsNow = false;
    else if (Math.random() < dt * 0.5) ap.adsNow = !ap.adsNow;
    input.setAlt(ap.adsNow && !!def?.ads);
    if (def?.auto) {
      input.setFire(onTarget);
    } else {
      ap.semiT -= dt;
      if (onTarget && ap.semiT <= 0) {
        input.setFire(!input.fire);
        ap.semiT = 0.12;
      }
    }
    input.moveY = 0;
    input.moveX = Math.sin(now() / 700) * 0.6;
    return;
  }
  input.setFire(false);
  input.setAlt(false);
  // kein Gegner zu sehen: in seine Richtung laufen, festhängen erkennen
  if (best) {
    const want = angleTo(eye, best.pos).yaw + ap.turn;
    p.yaw += Math.max(-3 * dt, Math.min(3 * dt, wrap(want - p.yaw)));
    p.pitch *= 0.9;
  }
  input.moveY = 1;
  input.moveX = 0;
  ap.stuckT += dt;
  if (ap.stuckT > 1.5) {
    const pos = p.feet.clone();
    if (ap.lastPos && pos.distanceTo(ap.lastPos) < 0.6) {
      ap.turn = (Math.random() - 0.5) * Math.PI * 1.6;
      input.setAction('jump', true);
      setTimeout(() => input.setAction('jump', false), 100);
    } else if (Math.random() < 0.3) {
      ap.turn = 0;
    }
    ap.lastPos = pos;
    ap.stuckT = 0;
  }
}

// ---------- Partien starten ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = now() + ms;
  while (now() < end) {
    if (fn()) return true;
    await wait(100);
  }
  return false;
}

/**
 * Team-Spiel mit KI (über die Mehrspieler-Lobby, man selbst in Team Rot).
 * perTeam: Größe je Team (1–4), map: 'hof' | 'halle' | 'hafen', mode: 'kampf' | 'bombe'
 */
export async function startTeam({ perTeam = 3, map = 'hof', mode = 'kampf', wins = 3, lives = 3 } = {}) {
  const L = window.__lobby;
  L.create();
  const ok = await until(() => L.roster?.some((e) => e.key === L.key));
  if (!ok) return 'Lobby kam nicht zustande (Netz?)';
  L.opts = { ...L.opts, map, mode, wins, lives };
  for (let i = 1; i < perTeam; i++) L._addBot('rot');
  for (let i = 0; i < perTeam; i++) L._addBot('blau');
  L._go();
  await until(() => game().state === 'playing', 20000);
  return snap();
}

/** 1 gegen 1 gegen die KI (Menü "Gegen KI"); level: 'anfaenger' | 'leicht' | 'mittel' | 'schwer' */
export async function startVsBot({ map = 'hof', mode = 'kampf', level = 'leicht' } = {}) {
  const $ = (id) => document.getElementById(id);
  $('btn-bots').click();
  await wait(200);
  const pick = (opt, v) => document.querySelector(`#bots [data-opt="${opt}"] [data-v="${v}"], #bots [data-opt="${opt}"][data-v="${v}"]`)?.click();
  pick('map', map);
  pick('mode', mode);
  pick('level', level);
  await wait(100);
  $('btn-bot-start').click();
  await until(() => game().state === 'playing', 20000);
  return snap();
}

/**
 * Größenwechsel testen: n-mal die Auflösung der Leinwand wirklich ändern (Stufe 1 / 0,85 im Wechsel).
 * Misst, ob die Leinwand zwischen Größenänderung und Zeichnen schon die neue (leere) Größe hatte.
 */
export async function resizeStress(n = 20) {
  const g = game();
  const gl = g.renderer.renderer.getContext();
  const keep = g.renderer.renderScale;
  let earlyClear = 0;
  for (let i = 0; i < n; i++) {
    const before = gl.drawingBufferWidth;
    g.renderer.setScale(i % 2 ? keep : keep * 0.85);
    g.onResize();
    if (gl.drawingBufferWidth !== before) earlyClear++;
    await wait(60);
  }
  g.renderer.setScale(keep);
  g.onResize();
  return { leinwandSofortGeleert: earlyClear, schwarzeBilder: S.blackCount };
}

/** Streuung messen: aktuelle Waffe, n Schüsse Dauerfeuer simuliert (ohne zu schießen), mit/ohne Zielen */
export function spreadTable(id = 'wolf') {
  const g = game();
  const ws = g.weapons;
  const def = g.weapons.inv?.active?.def?.id === id ? g.weapons.inv.active.def : null;
  if (!def) return `erst die Waffe ${id} in die Hand nehmen`;
  const keep = { ads: ws.ads, fire: ws.fireInacc };
  const out = {};
  for (const ads of [0, 1]) {
    ws.ads = ads;
    const row = [];
    ws.fireInacc = 0;
    for (let i = 0; i < 10; i++) {
      row.push(Math.round(ws.currentSpread(def) * 10) / 10);
      ws.fireInacc = ws.fireInacc * Math.exp(-(60 / def.rpm) / def.spread.recovery) + def.spread.fire;
    }
    out[ads ? 'imAnschlag' : 'ausDerHuefte'] = row;
  }
  ws.ads = keep.ads;
  ws.fireInacc = keep.fire;
  return out;
}

/** Zusammenfassung (für den Bericht) */
export function report() {
  const ms = [...S.frameMs].sort((a, b) => a - b);
  const q = (f) => (ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * f))] * 10) / 10 : null);
  return {
    jetzt: snap(),
    laufzeitS: Math.round((now() - S.started) / 1000),
    frames: S.frames,
    renders: S.renders,
    runden: S.rounds,
    partienBeendet: S.matchesOver,
    tode: S.deaths,
    phasen: S.phases,
    schwarzeBilder: S.blackCount,
    schwarzBeispiele: S.black.slice(0, 8),
    leinwandGeleertOhneBild: S.clearedNoDraw,
    nan: S.nan.slice(0, 5),
    nanAnzahl: S.nan.length,
    fehler: S.errors.slice(0, 15),
    fehlerAnzahl: S.errors.length,
    warnungen: S.warns.slice(0, 8),
    warnAnzahl: S.warns.length,
    fehlerAnzeige: S.fehlerBox,
    notizen: S.notes.slice(0, 10),
    bildMs: { median: q(0.5), p95: q(0.95), p99: q(0.99), max: q(0.9999) },
  };
}

export const state = S;
