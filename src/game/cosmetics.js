import { FINISHES } from '../weapons/finishes.js';

// Skins und Aufgaben: Jede Waffe (und das Messer) hat drei Skins, dazu gibt es Spieler-Skins.
// Freigeschaltet wird jeder Skin durch eine Aufgabe (Abschüsse, Kopfschüsse, Bomben, Siege …).
// Der Fortschritt zählt im 1 gegen 1 (gegen die KI oder einen Freund), manche Aufgaben im Training.
// Alles steht im Browser-Speicher; welche Skins man trägt, steht in den Einstellungen (looks).

const KEY = 'feuer-frei-aufgaben';
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
  { id: 'spieler', name: 'Spieler', skins: ['wueste', 'wald', 'nacht', 'arktis', 'gold', 'galaxie'] },
];
const LOCKER_BY_ID = Object.fromEntries(LOCKER.map((l) => [l.id, l]));

// Aufgaben: stat = Zähler, goal = Ziel, reward = [Waffe/'messer'/'spieler', Skin]
// Zähler: kill:<waffe>, head:<waffe>, kill:luftschlag, plant, defuse, wins, win:<modus>, win:schwer, targets
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
  { id: 'spieler-gold', stat: 'kill:luftschlag', goal: 3, reward: ['spieler', 'gold'], text: 'Schalte 3 Gegner mit dem Luftschlag aus' },
  { id: 'spieler-galaxie', stat: 'win:online', goal: 3, reward: ['spieler', 'galaxie'], text: 'Gewinne 3 Partien online gegen einen Freund' },
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
  } catch {
    // ohne Speicher gilt der Fortschritt nur bis zum Neuladen
  }
  return s;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // egal
  }
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

/** Skin freigeschaltet? ('standard' immer) */
export function unlocked(target, skin) {
  if (!skin || skin === 'standard') return true;
  const t = taskFor(target, skin);
  return !!t && isDone(t);
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

/** alles zurücksetzen (nur zum Testen) */
export function resetProgress() {
  state = { stats: {}, done: [] };
  save();
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
