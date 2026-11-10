import { FINISHES } from '../weapons/finishes.js';

// Skins und Aufgaben: Jede Waffe (und das Messer) hat drei Skins, dazu gibt es Spieler-Skins.
// Freigeschaltet wird jeder Skin durch eine Aufgabe (Abschüsse, Kopfschüsse, Bomben, Siege …).
// Weitere Skins gibt es nur aus Kisten (siehe "Kisten" unten); die kosten Münzen, die man beim
// Spielen verdient.
// Der Fortschritt zählt im 1 gegen 1 (gegen die KI oder einen Freund), manche Aufgaben im Training.
// Alles steht im Browser-Speicher; welche Skins man trägt, steht in den Einstellungen (looks).

const KEY = 'feuer-frei-aufgaben';
// gesetzt nach dem Abmelden: ohne Konto gibt es auf diesem Gerät kein Startguthaben mehr
const NO_START_KEY = 'feuer-frei-kein-startgeld';
// alter Speicher des Regenbogen-Messers (Easter Egg vor den Aufgaben)
const OLD_GIFT_KEY = 'feuer-frei-geschenke';

// Welche Teile einer Waffe den Skin bekommen (Materialnamen aus Blender); kleine Teile wie Visier,
// Lauf, Gummi und Stifte bleiben
export const PAINT = {
  natter: ['SlideNitride', 'FramePolymer', 'GripStipple'],
  kobra: ['Steel', 'GunDark'],
  falke: ['Gunmetal', 'Polymer', 'GunDark'],
  keiler: ['Wood', 'ShotgunReceiver', 'Gunmetal'],
  wolf: ['Gunmetal', 'Wood', 'GunDark'],
  luchs: ['Anodized', 'Polymer', 'GunDark'],
  adler: ['OliveStock', 'Gunmetal', 'GunDark'],
  karambit: ['KarambitSteel'],
  butterfly: ['ButterflySteel'],
};
// Ärmel in der Ego-Ansicht tragen den Spieler-Skin
export const SLEEVE = ['Sleeve'];

// Die Waffen mit ihren Skins in der Reihenfolge der Waffenkammer
export const LOCKER = [
  { id: 'natter', name: 'Natter', skins: ['wueste', 'kirsch', 'neon'] },
  { id: 'kobra', name: 'Kobra', skins: ['nacht', 'gold', 'lava'] },
  { id: 'falke', name: 'Falke', skins: ['wald', 'ozean', 'galaxie'] },
  { id: 'keiler', name: 'Keiler', skins: ['wald', 'kupfer', 'lava'] },
  { id: 'wolf', name: 'Wolf', skins: ['arktis', 'gold', 'regenbogen'] },
  { id: 'luchs', name: 'Luchs', skins: ['nacht', 'chrom', 'neon'] },
  { id: 'adler', name: 'Adler', skins: ['arktis', 'kupfer', 'galaxie'] },
  { id: 'messer', name: 'Messer', skins: ['gold', 'galaxie', 'regenbogen'] },
  { id: 'spieler', name: 'Spieler', skins: ['wueste', 'wald', 'nacht', 'arktis', 'kupfer', 'galaxie', 'gold'] },
];

// ---------- Kisten ----------
// Skins, die es nur aus Kisten gibt (Oberflächen mit tier in finishes.js). Eine Kiste kostet
// Münzen; die verdient man beim Spielen (COIN_FOR). Echtes Geld gibt es nirgends.
export const CASE_SKINS = {
  natter: ['mint', 'rosa', 'karbon', 'plasma', 'diamant'],
  kobra: ['schwarz', 'titan', 'rubin', 'blutmond', 'diamant'],
  falke: ['orange', 'violett', 'stadt', 'gift', 'diamant'],
  keiler: ['titan', 'mint', 'zebra', 'blutmond', 'diamant'],
  wolf: ['schwarz', 'orange', 'karbon', 'tiger', 'plasma', 'diamant'],
  luchs: ['rosa', 'violett', 'bonbon', 'gift', 'diamant'],
  adler: ['titan', 'schwarz', 'stadt', 'smaragd', 'plasma', 'diamant'],
  messer: ['violett', 'mint', 'rubin', 'zebra', 'blutmond', 'diamant'],
  spieler: ['schwarz', 'rosa', 'stadt', 'bonbon', 'tiger', 'gift', 'diamant'],
};
for (const l of LOCKER) l.skins.push(...CASE_SKINS[l.id]);
const LOCKER_BY_ID = Object.fromEntries(LOCKER.map((l) => [l.id, l]));

/** Seltenheitsstufen von häufig nach selten: chance = Anteil beim Öffnen, refund = Münzen für ein Doppeltes */
export const TIERS = {
  selten: { name: 'Selten', chance: 0.6, refund: 50 },
  episch: { name: 'Episch', chance: 0.28, refund: 100 },
  legendaer: { name: 'Legendär', chance: 0.1, refund: 250 },
  jackpot: { name: 'Jackpot', chance: 0.02, refund: 0 },
};
/**
 * price = Preis einer Kiste, start = Startguthaben (eine Kiste geschenkt), account = Geschenk fürs
 * Konto (zählt, solange man angemeldet ist), jackpotCoins = Münzen zusätzlich zum Diamant-Skin,
 * jackpotAll = Münzen, wenn man schon alle Diamant-Skins hat
 */
export const CASE = { price: 250, start: 250, account: 1000, jackpotCoins: 1000, jackpotAll: 2500 };
/** alles, was in der Kiste steckt: { target, skin, tier, id } */
export const CASE_ITEMS = LOCKER.flatMap((l) => CASE_SKINS[l.id].map((skin) => (
  { target: l.id, skin, tier: FINISHES[skin].tier, id: `k:${l.id}:${skin}` })));
const CASE_IDS = new Set(CASE_ITEMS.map((i) => i.id));
// Münzen fürs Spielen, nach Zähler (Anfang des Namens); Training (targets) gibt nichts
const COIN_FOR = [['kill:', 10], ['head:', 5], ['plant', 15], ['defuse', 15], ['wins', 100], ['banane', 250]];
const coinFor = (key) => COIN_FOR.find(([start]) => key === start || (start.endsWith(':') && key.startsWith(start)))?.[1] || 0;
// Zähler im Fortschritt: verdiente und ausgegebene Münzen, geöffnete Kisten. Beide Münz-Zähler
// wachsen nur, so führt das Konto sie wie alle Zähler zusammen (der größere Wert gilt).
const PLUS = 'm:plus';
const MINUS = 'm:minus';
const OPENED = 'kisten';

// Aufgaben: stat = Zähler, goal = Ziel, reward = [Waffe/'messer'/'spieler', Skin]
// Zähler: kill:<waffe>, head:<waffe>, kill:luftschlag, plant, defuse, wins, win:<modus>, win:schwer, targets,
// banane (goldene Banane eingesammelt, siehe banana.js)
const k = (w, goal, skin, name) => ({ id: `${w}-${skin}`, stat: `kill:${w}`, goal, reward: [w, skin], text: `${goal} Abschüsse mit ${name}` });
const h = (w, goal, skin, name) => ({ id: `${w}-${skin}`, stat: `head:${w}`, goal, reward: [w, skin], text: `${goal} Kopfschüsse (Abschüsse) mit ${name}` });
export const TASKS = [
  k('natter', 5, 'wueste', 'der Natter'), h('natter', 3, 'kirsch', 'der Natter'), k('natter', 25, 'neon', 'der Natter'),
  k('kobra', 5, 'nacht', 'der Kobra'), h('kobra', 5, 'gold', 'der Kobra'),
  { id: 'kobra-lava', stat: 'win:pistolen', goal: 1, reward: ['kobra', 'lava'], text: 'Gewinne eine Partie bei „Nur Pistolen“' },
  k('falke', 10, 'wald', 'der Falke'), h('falke', 5, 'ozean', 'der Falke'), k('falke', 40, 'galaxie', 'der Falke'),
  k('keiler', 5, 'wald', 'der Keiler'), k('keiler', 15, 'kupfer', 'der Keiler'), k('keiler', 40, 'lava', 'der Keiler'),
  k('wolf', 10, 'arktis', 'dem Wolf'), h('wolf', 10, 'gold', 'dem Wolf'), k('wolf', 50, 'regenbogen', 'dem Wolf'),
  k('luchs', 10, 'nacht', 'dem Luchs'), h('luchs', 8, 'chrom', 'dem Luchs'), k('luchs', 40, 'neon', 'dem Luchs'),
  k('adler', 3, 'arktis', 'dem Adler'), k('adler', 15, 'kupfer', 'dem Adler'),
  { id: 'adler-galaxie', stat: 'win:adler', goal: 1, reward: ['adler', 'galaxie'], text: 'Gewinne eine Partie bei „Scharfschützen“' },
  k('messer', 3, 'gold', 'dem Messer'), k('messer', 10, 'galaxie', 'dem Messer'),
  { id: 'messer-regenbogen', stat: 'win:schwer', goal: 1, reward: ['messer', 'regenbogen'], text: 'Besiege die KI auf „Schwer“' },
  { id: 'spieler-wueste', stat: 'wins', goal: 3, reward: ['spieler', 'wueste'], text: 'Gewinne 3 Partien im 1 gegen 1 (KI oder Freund)' },
  { id: 'spieler-wald', stat: 'plant', goal: 5, reward: ['spieler', 'wald'], text: 'Lege 5 Bomben' },
  { id: 'spieler-nacht', stat: 'defuse', goal: 3, reward: ['spieler', 'nacht'], text: 'Entschärfe 3 Bomben' },
  { id: 'spieler-arktis', stat: 'targets', goal: 100, reward: ['spieler', 'arktis'], text: 'Lege im Training 100 Klappziele um' },
  { id: 'spieler-kupfer', stat: 'kill:luftschlag', goal: 3, reward: ['spieler', 'kupfer'], text: 'Schalte 3 Gegner mit dem Luftschlag aus' },
  { id: 'spieler-galaxie', stat: 'win:online', goal: 3, reward: ['spieler', 'galaxie'], text: 'Gewinne 3 Partien online gegen einen Freund' },
  // Gold gibt es nur über die goldene Banane, die selten mitten in einer Runde auftaucht (bis
  // 14.10.2026 gab es Gold für 3 Luftschlag-Abschüsse; wer es so bekommen hat, behält es)
  { id: 'spieler-gold', stat: 'banane', goal: 1, reward: ['spieler', 'gold'], text: 'Schnapp dir die goldene Banane (taucht ganz selten mitten in einer Runde auf)' },
];
const TASK_BY_REWARD = Object.fromEntries(TASKS.map((t) => [t.reward.join(':'), t]));

/** Aufgabe, die einen Skin freischaltet */
export const taskFor = (target, skin) => TASK_BY_REWARD[`${target}:${skin}`] || null;

// ---------- Fortschritt ----------

let state = load();
const listeners = new Set();

function load() {
  let s = { stats: {}, done: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      s = { stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {}, done: Array.isArray(raw.done) ? raw.done : [] };
    }
    // wer das Regenbogen-Messer schon als Geschenk hatte, behält es
    const old = JSON.parse(localStorage.getItem(OLD_GIFT_KEY) || '[]');
    if (Array.isArray(old) && old.includes('regenbogen') && !s.done.includes('messer-regenbogen')) {
      s.done.push('messer-regenbogen');
      s.stats['win:schwer'] = Math.max(1, s.stats['win:schwer'] || 0);
    }
    // Aufgaben, deren Ziel der Zähler schon erreicht hat (neu dazugekommen oder umgestellt, z. B.
    // Kupfer für 3 Luftschlag-Abschüsse): gleich als geschafft zählen
    for (const t of TASKS) if (!s.done.includes(t.id) && (s.stats[t.stat] || 0) >= t.goal) s.done.push(t.id);
  } catch {
    // ohne Speicher gilt der Fortschritt nur bis zum Neuladen
  }
  return s;
}

// nach jedem Speichern (für das Konto: Fortschritt auch dort sichern)
const savedListeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // egal
  }
  for (const fn of savedListeners) fn();
}

/** Zuhören: fn() nach jeder Änderung des Fortschritts */
export function onProgressSaved(fn) {
  savedListeners.add(fn);
  return () => savedListeners.delete(fn);
}

/** Fortschritt für das Konto */
export const progressSnapshot = () => ({ stats: { ...state.stats }, done: [...state.done] });

/**
 * Fortschritt aus dem Konto dazunehmen: je Zähler der größere Wert, geschaffte Aufgaben alle.
 * Liefert die dabei neu geschafften Aufgaben (deren Skins kommen dazu).
 */
export function mergeProgress(p) {
  if (!p || typeof p !== 'object') return [];
  let changed = false;
  if (p.stats && typeof p.stats === 'object') {
    for (const [key, v] of Object.entries(p.stats)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > (state.stats[key] || 0)) {
        state.stats[key] = v;
        changed = true;
      }
    }
  }
  const fresh = [];
  const ids = new Set(TASKS.map((t) => t.id));
  for (const id of Array.isArray(p.done) ? p.done : []) {
    if (state.done.includes(id)) continue;
    if (ids.has(id)) fresh.push(TASKS.find((t) => t.id === id));
    // Skins aus Kisten stehen als 'k:<waffe>:<skin>' in derselben Liste
    else if (!CASE_IDS.has(id)) continue;
    state.done.push(id);
    changed = true;
  }
  if (changed) save();
  return fresh;
}

/** Fortschritt vom Gerät nehmen (beim Abmelden: er bleibt im Konto) */
export function resetProgress() {
  state = { stats: {}, done: [] };
  // das Startguthaben für Kisten gibt es nur einmal, nicht nach jedem Abmelden neu (siehe coins)
  noStart = true;
  try {
    localStorage.setItem(NO_START_KEY, '1');
  } catch {
    // egal
  }
  save();
}

/** Zuhören: fn({ task, value, done }) bei jedem Fortschritt einer Aufgabe */
export function onProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const stat = (key) => state.stats[key] || 0;
export const isDone = (task) => state.done.includes(task.id);

/** Zähler erhöhen; meldet Fortschritt und neu geschaffte Aufgaben */
export function count(key, n = 1) {
  if (!(n > 0)) return;
  state.stats[key] = (state.stats[key] || 0) + n;
  const c = coinFor(key) * n;
  if (c) {
    state.stats[PLUS] = (state.stats[PLUS] || 0) + c;
    gain += c;
  }
  const fresh = [];
  for (const t of TASKS) {
    if (t.stat !== key || isDone(t)) continue;
    const value = Math.min(t.goal, state.stats[key]);
    const done = value >= t.goal;
    if (done) {
      state.done.push(t.id);
      fresh.push(t);
    }
    for (const fn of listeners) fn({ task: t, value, done });
  }
  save();
  return fresh;
}

/** Skin freigeschaltet? ('standard' immer; sonst über seine Aufgabe oder aus einer Kiste) */
export function unlocked(target, skin) {
  if (!skin || skin === 'standard') return true;
  const t = taskFor(target, skin);
  return t ? isDone(t) : state.done.includes(`k:${target}:${skin}`);
}

// ---------- Münzen und Kisten ----------

let gain = 0;
// Geschenk fürs Konto: Es wird nirgends gespeichert, sondern zählt einfach mit, solange man
// angemeldet ist. So gibt es das Geschenk auf jedem Gerät genau einmal, und Ab- und wieder Anmelden
// bringt nichts ein.
let accountBonus = false;
// Nach dem Abmelden ist der Fortschritt vom Gerät verschwunden. Gäbe es dann wieder das
// Startguthaben, könnte man damit eine Kiste öffnen, sich anmelden und den Skin behalten, ohne
// dass das Konto dafür bezahlt hat. Im Konto selbst bleibt das Startguthaben erhalten.
let noStart = false;
try {
  noStart = localStorage.getItem(NO_START_KEY) === '1';
} catch {
  // ohne Speicher gilt das Startguthaben
}

/** angemeldet oder nicht (main.js meldet jede Änderung) */
export function setAccountBonus(on) {
  accountBonus = !!on;
}

/** Münzen auf dem Konto */
export const coins = () => Math.max(0, (accountBonus ? CASE.start + CASE.account : noStart ? 0 : CASE.start)
  + (state.stats[PLUS] || 0) - (state.stats[MINUS] || 0));

/** beim Spielen verdiente Münzen seit dem letzten Aufruf (für die Auswertung nach der Partie) */
export function takeCoinGain() {
  const g = gain;
  gain = 0;
  return g;
}

export const casesOpened = () => state.stats[OPENED] || 0;
export const ownsCaseItem = (item) => state.done.includes(item.id);

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/** Stufe auswürfeln (nach TIERS.chance) */
export function rollTier(rng = Math.random) {
  let r = rng();
  for (const [id, t] of Object.entries(TIERS)) {
    r -= t.chance;
    if (r < 0) return id;
  }
  return 'selten';
}

/** ein zufälliger Inhalt, gewichtet wie beim Öffnen (für die Rolle, die am Gewinn vorbeiläuft) */
export function rollItem(rng = Math.random) {
  const tier = rollTier(rng);
  return pick(CASE_ITEMS.filter((i) => i.tier === tier), rng);
}

/**
 * Kiste öffnen: zieht den Preis ab und würfelt. Liefert null, wenn die Münzen nicht reichen, sonst
 * { item, fresh, refund, bonus }: fresh = neuer Skin; refund = Münzen für ein Doppeltes; bonus =
 * Münzen aus dem Jackpot. Der Jackpot gibt immer einen Diamant-Skin, den man noch nicht hat (hat
 * man alle: item = irgendeiner davon, fresh = false und dafür mehr Münzen).
 */
export function openCase(rng = Math.random) {
  if (coins() < CASE.price) return null;
  state.stats[MINUS] = (state.stats[MINUS] || 0) + CASE.price;
  state.stats[OPENED] = (state.stats[OPENED] || 0) + 1;
  const tier = rollTier(rng);
  const pool = CASE_ITEMS.filter((i) => i.tier === tier);
  const open = pool.filter((i) => !ownsCaseItem(i));
  const item = pick(tier === 'jackpot' && open.length ? open : pool, rng);
  const fresh = !ownsCaseItem(item);
  if (fresh) state.done.push(item.id);
  const refund = fresh ? 0 : TIERS[tier].refund;
  const bonus = tier === 'jackpot' ? (fresh ? CASE.jackpotCoins : CASE.jackpotAll) : 0;
  if (refund + bonus) state.stats[PLUS] = (state.stats[PLUS] || 0) + refund + bonus;
  save();
  return { item, fresh, refund, bonus };
}

/** nächste offene Aufgabe für eine Waffe (für die Live-Anzeige im Spiel) */
export function nextTaskFor(target) {
  const l = LOCKER_BY_ID[target];
  if (!l) return null;
  for (const skin of l.skins) {
    const t = taskFor(target, skin);
    if (t && !isDone(t)) return t;
  }
  return null;
}

// ---------- getragene Skins (looks) ----------

/** Standard: überall Stahl bzw. Teamfarben */
export const emptyLooks = () => ({ weapons: {}, player: 'standard' });

/**
 * Skins aus Einstellungen oder vom Netz prüfen: nur bekannte Namen, die zur Waffe passen.
 * mine = true: außerdem nur freigeschaltete (die eigenen); vom Gegner wird alles Gültige angezeigt.
 */
export function cleanLooks(raw, mine = false) {
  const out = emptyLooks();
  if (!raw || typeof raw !== 'object') return out;
  const ok = (target, skin) => typeof skin === 'string' && FINISHES[skin]
    && LOCKER_BY_ID[target]?.skins.includes(skin) && (!mine || unlocked(target, skin));
  if (raw.weapons && typeof raw.weapons === 'object') {
    for (const l of LOCKER) {
      if (l.id === 'spieler') continue;
      const s = raw.weapons[l.id];
      if (ok(l.id, s)) out.weapons[l.id] = s;
    }
  }
  if (ok('spieler', raw.player)) out.player = raw.player;
  return out;
}

/** Skin einer Waffe ('messer' für beide Messer) oder 'standard' */
export const skinOf = (looks, target) => (target === 'spieler' ? looks?.player : looks?.weapons?.[target]) || 'standard';
