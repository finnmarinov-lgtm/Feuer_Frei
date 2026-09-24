// Alle Spielwerte an einem Ort. Längen in Metern, Zeiten in Sekunden, Winkel in Grad (Rückstoß)
// bzw. Milliradiant (Streuung).

export const TICK = 1 / 120;

export const MOVE = {
  gravity: 20.3,
  jumpHeight: 1.2,
  accelerate: 5.5,
  airAccelerate: 12,
  airWishCap: 0.76,
  friction: 5.2,
  stopSpeed: 2.0,
  walkMul: 0.52,
  crouchMul: 0.34,
  radius: 0.35,
  standHeight: 1.83,
  crouchHeight: 1.37,
  eyeStand: 1.64,
  eyeCrouch: 1.18,
  duckTime: 0.16,
  // unter diesem Anteil der Höchstgeschwindigkeit gibt es keine Bewegungsstreuung (wie in CS)
  accurateSpeed: 0.34,
  // Sprinten (Shift): Tempo je Waffe steht bei den Waffen (sprint), dazu etwas mehr Sichtfeld
  sprintFov: 6,
};

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 16000,
  roundWin: 2000,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
};

export const TRAINING = {
  rounds: 5,
  freezeTime: 10,
  buyWindow: 20,
  roundTime: 75,
  roundEndTime: 5,
  targets: [5, 6, 7, 8, 10],
  moving: [0, 1, 2, 3, 4],
};

// 1 gegen 1 über die Lobby. Die Rundenzeit wächst mit der Zahl der Leben.
export const DUEL = {
  freezeTime: 12,
  firstFreezeTime: 15,
  buyWindow: 20,
  roundTimeBase: 60,
  roundTimePerLife: 30,
  roundEndTime: 5,
  respawnTime: 3,
  // Spawn-Schutz nach Rundenstart und Wiedereinstieg, endet früher beim ersten eigenen Angriff
  spawnProtect: 2,
  // so lange wird auf einen Gegner ohne Verbindung gewartet (Neuladen, WLAN weg), dann gewinnt man kampflos
  forfeitAfter: 60,
  legMul: 0.75,
};

// Bombenmodus im 1 gegen 1: Die Rollen wechseln jede Runde. Wer angreift, legt die Bombe auf dem
// Bombenplatz des anderen (E halten), wer verteidigt, entschärft sie (E halten).
export const BOMB = {
  plantTime: 3.2,
  defuseTime: 5,
  // so lange tickt die gelegte Bombe
  timer: 35,
  // Bombenplatz: Kreis um die Mitte, Entschärfen nur direkt an der Bombe
  siteRadius: 3.4,
  defuseRange: 1.5,
  // Rundenzeit bis zum Legen (danach zählt nur noch die Bombe)
  roundTimeBase: 45,
  roundTimePerLife: 25,
  plantReward: 300,
  defuseReward: 300,
  // Explosion: bis etwa 10 m tödlich, danach schnell schwächer (ab 20 m nichts mehr)
  blastRadius: 20,
  blastDamage: 400,
};

// Spezialleiste: füllt sich mit Schaden an Gegner und Zielen (plus Bonus pro Abschuss).
// Ist sie voll, gibt es einen Luftschlag (X): Ziel wählen, nach kurzer Warnung schlagen Bomben ein.
export const SPECIAL = {
  charge: 350,
  killBonus: 50,
  maxRange: 90,
  // Warnzeit bis zum ersten Einschlag: so lange hat man Zeit, aus dem roten Kreis zu laufen
  delay: 3.2,
  bombs: 6,
  radius: 6,
  spacing: 0.2,
  blastRadius: 5.5,
  damage: 130,
  armorPen: 0.6,
};

// Was außer Waffen noch jemanden ausschalten kann (für Abschussliste und Prämie)
export const KILLERS = {
  luftschlag: { id: 'luftschlag', name: 'Luftschlag', reward: 300 },
  bombe: { id: 'bombe', name: 'Bombe', reward: 0 },
};

// Schnellnachrichten im 1 gegen 1 (T, dann 1 bis 6). Übertragen wird nur die Nummer.
export const QUICK_CHAT = ['gg', 'Nice!', 'Sorry!', 'Glück gehabt!', 'Hahaha', 'Warte kurz'];

export const PLAYER = {
  health: 100,
  helmetHeadMul: 0.5,
};

export const ARMOR = {
  vest: { name: 'Schutzweste', price: 650 },
  helmet: { name: 'Weste + Helm', price: 1000, upgrade: 350 },
};

// speed = Lauftempo, sprint = Tempo beim Sprinten (Messer am schnellsten, dann Pistolen, das
// Scharfschützengewehr am langsamsten), sprintOut = Sekunden nach dem Sprint, bis man schießen kann.
// Zielen über Kimme und Korn (rechte Maustaste, "ads"): eye = Abstand Auge -> hinteres Visier,
// zoom = Vergrößerung, time = Sekunden bis voll im Anschlag, speed/spread = Faktoren für Tempo und Streuung.

// Rückstoßmuster: [hoch, rechts] in Grad pro Schuss
const WOLF_PATTERN = [
  [0, 0], [0.6, 0.0], [0.8, 0.06], [0.9, -0.05], [0.95, 0.1], [0.9, 0.16], [0.8, 0.22], [0.55, -0.35],
  [0.4, -0.55], [0.3, -0.6], [0.15, -0.42], [0.1, 0.5], [0.1, 0.7], [0.05, 0.6], [0.05, 0.3],
  [0.1, -0.5], [0.05, -0.7], [0.05, -0.5], [0.0, 0.4], [0.05, 0.62], [0.05, 0.5], [0.0, -0.3],
  [0.05, -0.62], [0.05, -0.45], [0.0, 0.3], [0.05, 0.55], [0.0, 0.4], [0.05, -0.4], [0.0, -0.55], [0.0, 0.2],
];
const FALKE_PATTERN = [
  [0, 0], [0.35, 0.02], [0.4, -0.03], [0.4, 0.05], [0.35, 0.08], [0.3, -0.1], [0.25, -0.2], [0.2, 0.2],
  [0.15, 0.26], [0.1, -0.25], [0.08, -0.3], [0.05, 0.3], [0.05, 0.28], [0.03, -0.26],
];
// ruhiger als der Wolf: erst hoch, dann nach rechts und links
const LUCHS_PATTERN = [
  [0, 0], [0.5, 0], [0.6, 0.04], [0.7, -0.03], [0.72, 0.05], [0.65, 0.1], [0.55, 0.15], [0.45, 0.22],
  [0.3, 0.3], [0.2, 0.25], [0.15, -0.2], [0.1, -0.45], [0.08, -0.5], [0.05, -0.4], [0.05, -0.2],
  [0.05, 0.3], [0.03, 0.45], [0.03, 0.4], [0, 0.2], [0.03, -0.3], [0.03, -0.45], [0, -0.35], [0.03, 0.25],
  [0.03, 0.4], [0, 0.3], [0.03, -0.2], [0, -0.35], [0.03, -0.2], [0, 0.25], [0, 0.3],
];

export const WEAPONS = {
  natter: {
    name: 'Natter', type: 'Pistole', slot: 'secondary', price: 200, reward: 150, model: 'natter',
    auto: false, rpm: 400, damage: 30, headMul: 2.4, armorPen: 0.5, rangeMod: 0.9,
    mag: 20, reserve: 120, reload: 2.2, draw: 0.45, speed: 6.0, sprint: 8.0, sprintOut: 0.12,
    spread: { base: 4.5, move: 22, air: 80, fire: 14, recovery: 0.28 },
    recoil: { up: 0.85, side: 0.15, decay: 8, viewKick: 1.4 },
    ads: { eye: 0.4, zoom: 1.15, time: 0.14, speed: 0.72, spread: 0.45 },
    view: { pos: [0.125, -0.15, -0.44], rot: [0.03, 0.12, -0.04] },
    sound: 'pistol', tracer: 0, anim: 'pistol', slide: 0.024,
  },
  kobra: {
    name: 'Kobra', type: 'Schwere Pistole', slot: 'secondary', price: 700, reward: 150, model: 'kobra',
    auto: false, rpm: 267, damage: 45, headMul: 2.4, armorPen: 0.93, rangeMod: 0.81,
    mag: 7, reserve: 35, reload: 2.2, draw: 0.55, speed: 5.8, sprint: 7.8, sprintOut: 0.14,
    spread: { base: 3, move: 45, air: 110, fire: 45, recovery: 0.45 },
    recoil: { up: 2.8, side: 0.4, decay: 4, viewKick: 3.2 },
    ads: { eye: 0.42, zoom: 1.15, time: 0.16, speed: 0.72, spread: 0.45 },
    view: { pos: [0.13, -0.16, -0.47], rot: [0.03, 0.12, -0.04] },
    sound: 'heavy', tracer: 0, anim: 'pistol', slide: 0.03,
  },
  falke: {
    name: 'Falke', type: 'Maschinenpistole', slot: 'primary', price: 1250, reward: 300, model: 'falke',
    auto: true, rpm: 750, damage: 18, headMul: 2.4, armorPen: 0.6, rangeMod: 0.85,
    mag: 30, reserve: 120, reload: 2.6, draw: 0.7, speed: 5.8, sprint: 7.6, sprintOut: 0.16,
    spread: { base: 9, move: 14, air: 55, fire: 5, recovery: 0.22 },
    recoil: { pattern: FALKE_PATTERN, up: 0.05, side: 0.3, decay: 12, viewKick: 0.5 },
    ads: { eye: 0.07, zoom: 1.2, time: 0.18, speed: 0.7, spread: 0.5 },
    view: { pos: [0.15, -0.18, -0.44], rot: [0.03, 0.1, -0.03] },
    sound: 'smg', tracer: 2, anim: 'rifle',
  },
  wolf: {
    name: 'Wolf', type: 'Sturmgewehr', slot: 'primary', price: 2700, reward: 150, model: 'wolf',
    auto: true, rpm: 600, damage: 25, headMul: 2.4, armorPen: 0.775, rangeMod: 0.98,
    mag: 30, reserve: 90, reload: 2.45, draw: 0.9, speed: 5.5, sprint: 7.1, sprintOut: 0.2,
    spread: { base: 3.5, move: 45, air: 90, fire: 7, recovery: 0.3 },
    recoil: { pattern: WOLF_PATTERN, up: 0.05, side: 0.5, decay: 10, viewKick: 0.7 },
    ads: { eye: 0.13, zoom: 1.3, time: 0.24, speed: 0.6, spread: 0.4 },
    view: { pos: [0.16, -0.19, -0.48], rot: [0.03, 0.1, -0.03] },
    sound: 'rifle', tracer: 2, anim: 'rifle',
  },
  keiler: {
    name: 'Keiler', type: 'Schrotflinte', slot: 'primary', price: 1050, reward: 450, model: 'keiler',
    auto: false, rpm: 68, damage: 26, pellets: 9, pelletSpread: 45, headMul: 2.0, armorPen: 0.5, rangeMod: 0.55,
    mag: 8, reserve: 32, reloadStart: 0.35, reload: 0.5, shellReload: true, draw: 0.8, speed: 5.5, sprint: 7.1, sprintOut: 0.2,
    spread: { base: 5, move: 25, air: 70, fire: 0, recovery: 0.3 },
    recoil: { up: 4.5, side: 0.6, decay: 3, viewKick: 5.5 },
    ads: { eye: 0.16, zoom: 1.12, time: 0.2, speed: 0.75, spread: 0.8 },
    view: { pos: [0.16, -0.19, -0.47], rot: [0.03, 0.1, -0.03] },
    sound: 'shotgun', tracer: 0, anim: 'shotgun',
  },
  luchs: {
    name: 'Luchs', type: 'Sturmgewehr mit Rotpunkt', slot: 'primary', price: 3100, reward: 150, model: 'luchs',
    auto: true, rpm: 666, damage: 23, headMul: 2.4, armorPen: 0.7, rangeMod: 0.97,
    mag: 30, reserve: 90, reload: 3.0, draw: 0.9, speed: 5.5, sprint: 7.1, sprintOut: 0.2,
    spread: { base: 3, move: 40, air: 90, fire: 6, recovery: 0.28 },
    recoil: { pattern: LUCHS_PATTERN, up: 0.04, side: 0.4, decay: 11, viewKick: 0.6 },
    ads: { eye: 0.1, zoom: 1.45, time: 0.22, speed: 0.6, spread: 0.35 },
    view: { pos: [0.16, -0.2, -0.48], rot: [0.03, 0.1, -0.03] },
    sound: 'rifle2', tracer: 2, anim: 'rifle', reddot: true,
  },
  adler: {
    name: 'Adler', type: 'Scharfschützengewehr', slot: 'primary', price: 4750, reward: 50, model: 'adler',
    auto: false, rpm: 41, damage: 100, headMul: 2.4, armorPen: 0.975, rangeMod: 0.99,
    mag: 5, reserve: 30, reload: 3.6, draw: 1.1, speed: 5.0, sprint: 6.3, sprintOut: 0.3,
    spread: { base: 70, scoped: 0.6, move: 90, air: 150, fire: 0, recovery: 0.3 },
    recoil: { up: 2.0, side: 0.2, decay: 3, viewKick: 4.5 },
    // eine Zoomstufe, nur solange die rechte Maustaste gehalten wird
    scope: true,
    ads: { eye: 0.05, zoom: 2.75, time: 0.15, speed: 0.51, spread: 1 },
    view: { pos: [0.17, -0.235, -0.56], rot: [0.04, 0.1, -0.04] },
    sound: 'sniper', tracer: 1, anim: 'sniper',
  },
  messer: {
    name: 'Messer', type: 'Messer', slot: 'knife', price: 0, reward: 750, model: 'messer',
    draw: 0.4, speed: 6.2, sprint: 8.8, sprintOut: 0, armorPen: 0.85,
    // zwei Treffer reichen immer, auch gegen eine Schutzweste
    slash: { damage: 60, range: 1.7, rate: 0.42 },
    stab: { damage: 90, range: 1.45, rate: 1.0 },
    view: { pos: [0.15, -0.13, -0.3], rot: [0.45, 0.45, -0.2] },
    anim: 'knife',
  },
  he: {
    name: 'Splittergranate', type: 'Granate', slot: 'utility', price: 300, reward: 150, model: 'he',
    grenade: 'he', draw: 0.5, speed: 6.0, sprint: 8.0, sprintOut: 0.1,
    view: { pos: [0.15, -0.125, -0.33], rot: [0.15, 0.25, -0.1] }, anim: 'grenade',
  },
  flash: {
    name: 'Blendgranate', type: 'Granate', slot: 'utility', price: 200, reward: 0, model: 'flash',
    grenade: 'flash', draw: 0.5, speed: 6.0, sprint: 8.0, sprintOut: 0.1,
    view: { pos: [0.15, -0.125, -0.33], rot: [0.15, 0.25, -0.1] }, anim: 'grenade',
  },
  smoke: {
    name: 'Rauchgranate', type: 'Granate', slot: 'utility', price: 300, reward: 0, model: 'smoke',
    grenade: 'smoke', draw: 0.5, speed: 6.0, sprint: 8.0, sprintOut: 0.1,
    view: { pos: [0.15, -0.125, -0.33], rot: [0.15, 0.25, -0.1] }, anim: 'grenade',
  },
};

// feste Reihenfolge, damit die Waffe im Netz als kleine Zahl übertragen werden kann
export const WEAPON_IDS = Object.keys(WEAPONS);
for (const id of WEAPON_IDS) WEAPONS[id].id = id;

export const GRENADES = {
  he: { fuse: 1.6, radius: 7.5, damage: 100, armorPen: 0.5 },
  flash: { fuse: 1.6, radius: 22, maxBlind: 4.5 },
  smoke: { fuse: 1.8, radius: 3.6, duration: 16, stopSpeed: 0.25 },
  throwSpeed: 15.5,
  lobSpeed: 7.0,
  bodyRadius: 0.04,
};

// Reihenfolge im Kaufmenü
export const SHOP = [
  { title: 'Pistolen', items: ['natter', 'kobra'] },
  { title: 'MP & Schrot', items: ['falke', 'keiler'] },
  { title: 'Gewehre', items: ['wolf', 'luchs', 'adler'] },
  { title: 'Ausrüstung', items: ['vest', 'helmet'] },
  { title: 'Granaten', items: ['he', 'flash', 'smoke'] },
];

export const SLOT_KEYS = ['primary', 'secondary', 'knife', 'util1', 'util2'];
