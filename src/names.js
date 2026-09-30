// Namen von Mitspielern. Seit es offene Lobbys gibt, spielt man auch mit Fremden: Jeder Name läuft
// hier durch, bevor er angezeigt wird (der eigene, die aus der Lobby und die im Spiel). Steuer- und
// Richtungszeichen fliegen raus, und ein Name mit einem groben Wort wird zu "Spieler NN". Die Zahl
// hängt am Namen, so sehen alle dieselbe.
//
// Die Liste fängt das Gröbste, nicht alles. Getarnt wird gern mit Ziffern (F1ck), Zeichen dazwischen
// (F.i.c.k), gedehnten Vokalen (Fiiick) oder gleich aussehenden Buchstaben aus anderen Schriften;
// das wird vor dem Vergleich zurückgebaut. Was trotzdem durchrutscht: Der Host kann rauswerfen.

const MAX = 16;

// Wörter, die auch mitten im Namen nichts Harmloses sind ("xXFickerXx", "Hurensöhne")
const ANYWHERE = [
  'fick', 'fotz', 'votze', 'hurenso', 'hurenki', 'wichs', 'wixer', 'wixxer', 'spast', 'schlampe', 'nutte',
  'missgeburt', 'schwuchtel', 'kanake', 'kanack', 'neger', 'zigeuner', 'kruppel', 'mongoloid',
  'behindert', 'bastard', 'arschloch', 'arschgeige', 'scheis', 'pimmel', 'titten', 'muschi',
  'schwanzlutsch', 'drecksau', 'vergewaltig', 'inzest', 'padophil', 'hitler', 'nsdap', 'siegheil',
  'judensau', 'hakenkreuz', 'porno', 'hentai',
  'fuck', 'fvck', 'bitch', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'penis',
  'vagina', 'dildo', 'pussy', 'dickhead', 'cocksucker', 'asshole', 'arsehole', 'wanker', 'twat',
  'bollocks', 'jizz', 'cumshot', 'bullshit', 'shithead', 'killyourself', 'suckmy', 'tranny',
  'wetback', 'incest', 'pedophil', 'swastika',
];
// Kurze Wörter, die in harmlosen stecken ("Marsch", "Cocktail", "Kanal", "Therapist"): nur als
// ganzes Wort, abgetrennt durch Leerzeichen, Zeichen, Ziffern oder einen Großbuchstaben
const WHOLE = [
  'arsch', 'hure', 'huren', 'schwanz', 'transe', 'mongo', 'nazi', 'nazis', 'kkk', 'negro',
  'shit', 'fuk', 'fck', 'cock', 'wank', 'sex', 'porn', 'cum', 'tits', 'boobs', 'anal', 'anus',
  'rape', 'rapist', 'fag', 'fags', 'pedo', 'horny', 'kys', 'gook', 'chink',
];

// Vokale dürfen sich beliebig wiederholen ("Fiiick"), Mitlaute nicht: sonst würde aus "neger"
// auch "Schönegger" (ein Nachname)
function pattern(word) {
  return word.replace(/(.)\1*/g, (run, c) => ('aeiouy'.includes(c) ? `${c}{${run.length},}` : run));
}
const ANY_RE = new RegExp(ANYWHERE.map(pattern).join('|'));
const WHOLE_RE = new RegExp(`^(?:${WHOLE.map(pattern).join('|')})$`);

// Ziffern und Zeichen, die für Buchstaben stehen, und Buchstaben aus anderen Schriften, die wie
// lateinische aussehen (kyrillisch, griechisch). "1", "!" und "|" können i oder l sein.
const LOOK = {
  0: 'o', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', '@': 'a', $: 's', '€': 'e', ß: 'ss',
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ı: 'i', α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ν: 'v',
  ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};

/** nur Kleinbuchstaben a–z; one: wofür "1", "!" und "|" stehen, digits: Ziffern umdeuten oder weglassen */
function fold(s, one, digits) {
  let out = '';
  for (const c of s.normalize('NFKD').toLowerCase()) {
    if (c >= 'a' && c <= 'z') out += c;
    else if (c === '1' || c === '!' || c === '|') out += digits ? one : '';
    else if (c >= '0' && c <= '9') out += digits ? LOOK[c] ?? '' : '';
    else out += LOOK[c] ?? '';
  }
  return out;
}

/** der Name in den Formen, in denen er verglichen wird */
function forms(s) {
  return [fold(s, 'i', true), fold(s, 'l', true), fold(s, '', false)];
}

const seen = new Map();

/** enthält der Name ein grobes Wort? */
export function rude(name) {
  const s = String(name ?? '');
  if (seen.has(s)) return seen.get(s);
  // Wörter: getrennt an allem außer Buchstaben, Ziffern und Tarnzeichen, und vor Großbuchstaben
  const words = s.normalize('NFKD').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{M}\p{N}@$€!|]+/u).filter(Boolean);
  // buchstabiert ("S E X", "F.i.c.k"): dann zählt alles zusammen als ein Wort
  if (words.length > 1 && words.every((w) => Array.from(w).length <= 2)) words.push(words.join(''));
  const bad = /14\D{0,2}88/.test(s)
    || forms(s).some((f) => ANY_RE.test(f))
    || words.some((w) => forms(w).some((f) => WHOLE_RE.test(f)));
  if (seen.size > 500) seen.clear();
  seen.set(s, bad);
  return bad;
}

/** Steuer- und unsichtbare Zeichen entfernen, Leerraum zusammenfassen, höchstens 16 Zeichen */
export function tidyName(s) {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // nach Zeichen kürzen, nicht nach UTF-16-Einheiten (sonst zerfällt ein Emoji am Ende)
  return Array.from(t).slice(0, MAX).join('').trim();
}

/** "Spieler NN" für einen Namen, der nicht geht (für alle gleich) */
export function standIn(name) {
  let h = 2166136261;
  for (const c of String(name)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return `Spieler ${10 + ((h >>> 0) % 90)}`;
}

/** Name zum Anzeigen: aufgeräumt und ohne grobe Wörter ('' wenn nichts übrig bleibt) */
export function cleanName(s) {
  const t = tidyName(s);
  return t && rude(t) ? standIn(t) : t;
}
