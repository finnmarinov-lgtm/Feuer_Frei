// Sprache der Oberfläche. Englisch ist die Voreinstellung, Deutsch lässt sich
// in den Einstellungen wählen.
//
// So funktioniert es: Die Seite ist auf Deutsch geschrieben, das bleibt die Quelle.
// Beim Start werden die Texte im Dokument gegen die englischen getauscht - auch bei
// allem, was später dazukommt (Kaufmenü, Lobby, Meldungen), dafür sorgt der
// MutationObserver. Steht die Sprache auf Deutsch, passiert schlicht nichts.
//
// Vorteil: Es müssen keine 300 Stellen im Quelltext umgebaut werden, und im
// HTML bleibt der deutsche Text stehen, den Google liest.

const KEY = 'feuer-frei-sprache';

export function sprache() {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'de' || s === 'en') return s;
  } catch {}
  return 'en';
}

export function setSprache(code) {
  try { localStorage.setItem(KEY, code === 'de' ? 'de' : 'en'); } catch {}
  location.reload();
}

// Deutsch -> Englisch. Schlüssel ist der Text, wie er im Dokument steht.
const EN = {
  // Laden und Hauptmenü
  'Lade Arena …': 'Loading arena …',
  'Mit Freunden online (1 gegen 1 bis 4 gegen 4), gegen die KI oder Training':
    'Play online with friends (1v1 up to 4v4), against the AI, or practise',
  'Mehrspieler': 'Multiplayer',
  'Gegen KI': 'Vs AI',
  'Training': 'Training',
  'Skins & Aufgaben': 'Skins & challenges',
  'Einstellungen': 'Settings',
  'Steuerung': 'Controls',
  'Karte': 'Map',
  'Hof': 'Yard',
  'Lagerhalle': 'Warehouse',
  'Hafen': 'Harbour',

  // Beschreibungstext unter dem Menü
  'Feuer Frei – 3D-Shooter im Browser': 'Feuer Frei – a 3D shooter in your browser',
  'Ein kostenloses Browserspiel: Der Shooter läuft ohne Installation und ohne Konto direkt im Browser, am PC mit Maus und Tastatur, am Handy und Tablet mit Touch-Steuerung.':
    'A free browser game: the shooter runs without any install and without an account, on desktop with mouse and keyboard, on phones and tablets with touch controls.',
  'Lobby erstellen, Link verschicken – zu zweit 1 gegen 1, mit mehr Leuten Team-Spiel bis 4 gegen 4.':
    'Create a lobby, send the link – two players make it 1v1, more turn it into a team match up to 4v4.',
  '1 gegen 1 gegen einen Computer-Gegner in vier Stärken.': '1v1 against a computer opponent in four difficulty levels.',
  'freies Üben an Klappzielen, ohne Zeitgrenze.': 'free practice on flip targets, no time limit.',
  'Hof, Lagerhalle und Hafen.': 'Yard, Warehouse and Harbour.',
  'alle Waffen, nur Pistolen oder Scharfschützen, dazu Messer und Granaten aus dem Kaufmenü.':
    'all weapons, pistols only or snipers, plus knife and grenades from the buy menu.',
  'für Waffen, Messer und Figur, freigeschaltet über Aufgaben.': 'for weapons, knife and character, unlocked through challenges.',
  'Gebaut mit Three.js und der Physik-Engine Rapier.': 'Built with Three.js and the Rapier physics engine.',
  'Mehrspieler:': 'Multiplayer:',
  'Gegen KI:': 'Vs AI:',
  'Training:': 'Training:',
  'Karten:': 'Maps:',
  'Waffen:': 'Weapons:',
  'Skins': 'Skins',

  // Lobby
  'Dein Name': 'Your name',
  'Lobby erstellen': 'Create lobby',
  'Du bekommst einen Code und einen Link für deine Freunde. Zu zweit wird es ein 1 gegen 1, mit mehr Leuten ein Team-Spiel bis 4 gegen 4.':
    'You get a code and a link for your friends. Two players make it 1v1, more turn it into a team match up to 4v4.',
  'Beitreten': 'Join',
  'Code oder Link von deinem Freund:': 'Code or link from your friend:',
  'z. B. K7P2QX': 'e.g. K7P2QX',
  'Lobby-Code': 'Lobby code',
  'Link kopieren': 'Copy link',
  'Teilen': 'Share',
  'Mit KI auffüllen': 'Fill with bots',
  'Das kleinere Team bekommt KI-Spieler, bis beide gleich groß sind': 'The smaller team gets bots until both sides are equal',
  'Starten': 'Start',
  'Modus': 'Mode',
  'Kampf': 'Deathmatch',
  'Bombe': 'Bomb',
  'Waffen': 'Weapons',
  'Alle': 'All',
  'Nur Pistolen': 'Pistols only',
  'Scharfschützen': 'Snipers',
  'Leben pro Runde': 'Lives per round',
  'Gewonnen hat, wer zuerst': 'Winner is whoever first wins',
  'Runden gewinnt': 'rounds',
  'KI-Stärke': 'Bot difficulty',
  'Anfänger': 'Beginner',
  'Leicht': 'Easy',
  'Mittel': 'Medium',
  'Schwer': 'Hard',
  'Zurück': 'Back',

  // Gegen KI
  'Ein Computer-Gegner spielt nach denselben Regeln wie ein Freund im 1 gegen 1.':
    'A computer opponent plays by the same rules as a friend would in a 1v1.',
  'Schwierigkeit': 'Difficulty',
  'Los geht’s': 'Start',

  // Pause
  'Pause': 'Pause',
  'Das Spiel läuft weiter – du stehst gerade still.': 'The match keeps running – you are standing still right now.',
  'Weiter': 'Resume',
  'Training beenden': 'End training',
  'Klicken zum Weiterspielen': 'Click to resume',

  // Einstellungen
  'Mausempfindlichkeit': 'Mouse sensitivity',
  '(wie in CS)': '(as in CS)',
  'Sichtfeld': 'Field of view',
  'Lautstärke': 'Volume',
  'Grafik': 'Graphics',
  '(niedrig läuft auch auf schwachen Laptops)': '(low also runs on weak laptops)',
  'Niedrig': 'Low',
  'Hoch': 'High',
  'Auflösung': 'Resolution',
  '(weniger = flüssiger, aber unschärfer)': '(less = smoother, but blurrier)',
  'Fadenkreuzfarbe': 'Crosshair colour',
  'Grün': 'Green',
  'Weiß': 'White',
  'Gelb': 'Yellow',
  'Türkis': 'Cyan',
  'Pink': 'Pink',
  'Notizblock-Taste': 'Notepad key',
  '(wechselt sofort zum weißen Notizblatt)': '(switches instantly to a blank white page)',
  'Touch-Steuerung': 'Touch controls',
  '(Handy und Tablet)': '(phone and tablet)',
  'Automatisch': 'Automatic',
  'An': 'On',
  'Aus': 'Off',
  'Touch-Empfindlichkeit': 'Touch sensitivity',
  '(Umsehen per Wischen)': '(looking around by swiping)',
  'Zielen per Klick umschalten (statt Taste halten)': 'Toggle aiming with a click (instead of holding)',
  'Vollbild beim Start (schützt Strg+W)': 'Fullscreen on start (protects Ctrl+W)',
  'Radar anzeigen (kleine Karte oben links)': 'Show radar (small map, top left)',
  'Bilder pro Sekunde anzeigen': 'Show frames per second',
  'Sprache': 'Language',

  // Steuerung
  'Zum Ändern auf eine Taste klicken und die neue drücken (auch Maustaste 3 bis 5).':
    'To change a key, click it and press the new one (mouse buttons 3 to 5 work too).',
  'löscht die Belegung,': 'clears the binding,',
  'bricht ab. Mit': 'cancels. With',
  'kommt eine zweite Taste dazu.': 'you add a second key.',
  'Auf dem Handy': 'On a phone',
  'Linker Daumen: Stick zum Laufen (ganz nach vorne schieben = Sprinten). Rechter Daumen: wischen zum Umsehen. Roter Knopf: schießen, beim Halten weiter wischen und zielen. Kreis-Knopf: Zielen an/aus. Pfeile: springen und ducken. Unten tippst du die Waffe an. Flugzeug: Luftschlag, wenn der Ring voll ist.':
    'Left thumb: stick to move (push it all the way forward to sprint). Right thumb: swipe to look around. Red button: shoot, keep swiping while holding to aim. Circle button: aiming on/off. Arrows: jump and crouch. Tap a weapon at the bottom. Plane: air strike once the ring is full.',
  'Tipp wie in CS: Im Stehen treffen die Waffen am besten. Kurz vor dem Schuss stoppen, und bei langen Salven die Maus nach unten ziehen.':
    'Tip, same as in CS: weapons are most accurate standing still. Stop just before you shoot, and pull the mouse down during long bursts.',
  'Standard wiederherstellen': 'Reset to default',

  // Ergebnis
  'Training beendet': 'Training finished',
  'Neuer Skin freigeschaltet!': 'New skin unlocked!',
  'Nochmal': 'Play again',
  'Hauptmenü': 'Main menu',

  // Kaufmenü und Anzeige im Spiel
  'Kaufmenü': 'Buy menu',
  'Schließen (B)': 'Close (B)',
  'Linksklick kaufen · Rechtsklick zurückgeben (nur in der Kaufzeit) ·': 'Left click to buy · right click to refund (only during buy time) ·',
  'schließen': 'to close',
  'Kaufzeit': 'Buy time',
  'Du': 'You',
  'Gegner': 'Opponent',
  'Bombe legen': 'Plant bomb',
  'Kaufen': 'Buy',

  // Kartenbeschreibungen im Menü
  'Sandiger Innenhof: zwei Gassen, Tunnel durch das Haus in der Mitte, Balkon.':
    'Sandy courtyard: two alleys, a tunnel through the building in the middle, balcony.',
  'Halle mit Hochregalen, Büro in der Mitte, Laufsteg und Rolltoren. Enger, mehr Nahkampf.':
    'Warehouse with tall shelves, an office in the middle, a catwalk and roller doors. Tighter, more close combat.',
  'Groß und offen: Containerhafen auf einer Mole mit Wasser zu beiden Seiten, Kran in der Mitte. Für 3 gegen 3 und 4 gegen 4.':
    'Big and open: a container harbour on a pier with water on both sides and a crane in the middle. Made for 3v3 and 4v4.',

  // KI-Stärken
  'Reagiert sehr langsam, trifft kaum, kauft keine Gewehre und fordert keine Luftschläge an. Zum Üben.':
    'Reacts very slowly, rarely hits, buys no rifles and calls no air strikes. For practice.',
  'Reagiert langsam, trifft selten und läuft beim Schießen herum. Gut zum Reinkommen.':
    'Reacts slowly, rarely hits and keeps moving while shooting. Good for getting started.',
  'Solider Gegner: bleibt zum Schießen stehen, hört deine Schritte, fordert Luftschläge an.':
    'A solid opponent: stops to shoot, hears your footsteps, calls air strikes.',
  'Reagiert blitzschnell, trifft oft den Kopf und spielt die Bombe klug. Wer sie besiegt, bekommt eine Überraschung.':
    'Reacts in a flash, often hits the head and plays the bomb smartly. Beat it and you get a surprise.',

  // Waffen-Modi
  'Alle Waffen': 'All weapons',
  'Alles darf gekauft werden.': 'Everything can be bought.',
  'Nur Natter und Kobra, dazu Granaten und Weste. Wer trifft, gewinnt.':
    'Natter and Kobra only, plus grenades and vest. Whoever hits, wins.',
  'Jede Runde gibt es ein Adler geschenkt, sonst nur Pistolen, Granaten und Weste.':
    'Every round you get an Adler for free, otherwise pistols, grenades and vest only.',

  // Touch-Knöpfe (Vorlesehilfe)
  'Schießen': 'Shoot',
  'Zielen': 'Aim',
  'Springen': 'Jump',
  'Ducken': 'Crouch',
  'Nachladen': 'Reload',
  'Luftschlag': 'Air strike',
  'Schnellnachricht': 'Quick message',
  'Statistik': 'Scoreboard',
  'Bitte dreh dein Handy quer': 'Please turn your phone sideways',
  'Das Spiel läuft im Querformat.': 'The game runs in landscape.',

  // ---------- Anzeige im Spiel ----------
  'Runde gewonnen': 'Round won',
  'Runde verloren': 'Round lost',
  'Siegprämie': 'win bonus',
  'Niederlagenbonus': 'loss bonus',
  'Runde läuft': 'Round running',
  'Rundenende': 'Round over',
  'Bombe wird gelegt …': 'Planting bomb …',
  'Bombe wird entschärft …': 'Defusing bomb …',
  'Bombe entschärfen': 'Defuse bomb',
  'Bombe tickt': 'Bomb ticking',
  'Bombenplatz': 'Bomb site',
  'Bombe gelegt!': 'Bomb planted!',
  'Du hast die Bombe entschärft': 'You defused the bomb',
  'Du hast keine Leben mehr': 'You are out of lives',
  'Zurück im Duell': 'Back in the duel',
  'Zurück im Spiel': 'Back in the match',
  'Abschüsse': 'Kills',
  'Luftschlag gerade nicht möglich': 'Air strike not available right now',
  'Tippe auf den Luftschlag-Knopf und wähle das Ziel': 'Tap the air strike button and pick the target',
  'Luftschlag: Ziel anschauen · roter Knopf bestätigt · Flugzeug bricht ab':
    'Air strike: look at the target · red button confirms · plane cancels',
  'Luftschlag: Ziel anschauen ·': 'Air strike: look at the target ·',
  'bestätigen ·': 'confirms ·',
  'abbrechen': 'cancels',
  'oder': 'or',
  'Linksklick': 'Left click',
  'Rechtsklick': 'Right click',
  'Bomben-Knopf halten': 'Hold the bomb button',
  'Entschärfen …': 'Defusing …',
  'Entschärfen': 'Defuse',

  // Kaufmenü
  'Standardpistole, genau im Stand': 'Standard pistol, accurate when standing still',
  'Kopftreffer sind tödlich': 'Headshots are lethal',
  'Genau auch im Laufen': 'Accurate even while moving',
  'Nah ein Treffer, weit schwach': 'One hit up close, weak at range',
  'Stark, aber mit Rückstoß': 'Strong, but with recoil',
  'Rotpunktvisier, ruhiger Rückstoß': 'Red dot sight, calm recoil',
  'Ein Körpertreffer reicht': 'One body hit is enough',
  'Weniger Schaden am Körper': 'Less damage to the body',
  'Schützt auch den Kopf': 'Protects the head as well',
  'Schaden im Umkreis': 'Damage in a radius',
  'Blendet, wer hinsieht': 'Blinds whoever looks at it',
  'Ausrüstung': 'Equipment',
  'Kaufen gerade nicht möglich': 'Can’t buy right now',
  'Kaufen jederzeit': 'Buy any time',
  'Kaufen nicht möglich': 'Can’t buy',
  'Nur im Spawn während der Kaufzeit': 'Only at spawn during buy time',
  'Schon ausgerüstet': 'Already equipped',

  // Waffen und Ausrüstung
  'Schutzweste': 'Vest',
  'Weste + Helm': 'Vest + helmet',
  'Messer': 'Knife',
  'Granate': 'Grenade',
  'Granaten': 'Grenades',
  'Splittergranate': 'Frag grenade',
  'Blendgranate': 'Flashbang',
  'Rauchgranate': 'Smoke grenade',
  'Scharfschützengewehr': 'Sniper rifle',
  'Spieler': 'Player',

  // Schnellnachrichten
  'Glück gehabt!': 'Lucky!',
  'Warte kurz': 'One sec',

  // Aufgaben bei den Skins
  'Gewinne eine Partie bei „Nur Pistolen“': 'Win a match in “Pistols only”',
  'Gewinne eine Partie bei „Scharfschützen“': 'Win a match in “Snipers”',
  'Besiege die KI auf „Schwer“': 'Beat the AI on “Hard”',
  'Gewinne 3 Partien im 1 gegen 1 (KI oder Freund)': 'Win 3 matches in 1v1 (AI or friend)',
  'Lege 5 Bomben': 'Plant 5 bombs',
  'Entschärfe 3 Bomben': 'Defuse 3 bombs',
  'Lege im Training 100 Klappziele um': 'Knock down 100 flip targets in training',
  'Schalte 3 Gegner mit dem Luftschlag aus': 'Take out 3 opponents with the air strike',
  'Gewinne 3 Partien online gegen einen Freund': 'Win 3 online matches against a friend',

  // Tastenbelegung
  'Vorwärts': 'Forward',
  'Rückwärts': 'Backward',
  'Links': 'Left',
  'Rechts': 'Right',
  'Ducken (genauer, leiser)': 'Crouch (more accurate, quieter)',
  'Sprinten (nur vorwärts)': 'Sprint (forward only)',
  'Schleichen (lautlos, genauer)': 'Walk (silent, more accurate)',
  'Hauptwaffe': 'Primary',
  'Pistole': 'Pistol',
  'Extra 1 (Granate)': 'Extra 1 (grenade)',
  'Extra 2 (Granate)': 'Extra 2 (grenade)',
  'Letzte Waffe': 'Last weapon',
  'Kaufmenü (im Spawn, in der Kaufzeit)': 'Buy menu (at spawn, during buy time)',
  'Bombe legen / entschärfen (halten)': 'Plant / defuse bomb (hold)',
  'Luftschlag (nach 3 Abschüssen hintereinander)': 'Air strike (after 3 kills in a row)',
  'Waffe begutachten': 'Inspect weapon',
  'Statistik (halten)': 'Scoreboard (hold)',
  'Schnellnachrichten öffnen (1 gegen 1)': 'Open quick messages (1v1)',
  '6. Schnellnachricht (bei offener Liste)': '6th quick message (while the list is open)',
  'Rücktaste': 'Backspace',

  // Lobby und Verbindung
  'Dort läuft gerade schon ein Spiel. Warte, bis es vorbei ist, oder erstelle eine eigene Lobby.':
    'A match is already running there. Wait until it is over, or create your own lobby.',
  'lädt neu …': 'reloading …',
  'Zurück ins laufende Duell …': 'Back into the running duel …',
  'Zurück ins laufende Spiel …': 'Back into the running match …',
  'Direktverbindung nicht möglich:': 'Direct connection not possible:',
  'Server-Verbindung nicht möglich:': 'Server connection not possible:',
};

// Zusammengesetzte Texte (Runde 3, +250 Siegprämie …). Wird nur geprüft,
// wenn oben nichts genau passt.
const MUSTER = [
  [/^Runde (\d+)$/, 'Round $1'],
  [/^Runde (\d+)\/(\d+)$/, 'Round $1/$2'],
  [/^Runde (\d+) · Sieg bei (\d+)$/, 'Round $1 · first to $2'],
  [/^Runde (\d+) · Du greifst an$/, 'Round $1 · you attack'],
  [/^Runde (\d+) · Du verteidigst$/, 'Round $1 · you defend'],
  [/^Runde (\d+) · Ihr greift an$/, 'Round $1 · your team attacks'],
  [/^Runde (\d+) · Ihr verteidigt$/, 'Round $1 · your team defends'],
  [/^Runde (\d+) · (.+) hat gewartet$/, 'Round $1 · $2 waited'],
  [/^\+(\S+) Siegprämie$/, '+$1 win bonus'],
  [/^\+(\S+) Niederlagenbonus$/, '+$1 loss bonus'],
  [/^(.+) hat die Bombe entschärft$/, '$1 defused the bomb'],
  [/^(.+) ist zurück$/, '$1 is back'],
  [/^Zeit abgelaufen · du hast mehr Leben übrig$/, 'Time is up · you have more lives left'],
  [/^Zeit abgelaufen · dein Team hat mehr Leben übrig$/, 'Time is up · your team has more lives left'],
  [/^Zeit abgelaufen · (.+) hat mehr Leben übrig$/, 'Time is up · $1 has more lives left'],
  [/^Noch (\d+) Abschuss hintereinander, ohne zu sterben$/, '$1 more kill in a row without dying'],
  [/^Noch (\d+) Abschüsse hintereinander, ohne zu sterben$/, '$1 more kills in a row without dying'],
  [/^(\d+) Abschüsse mit (.+)$/, '$1 kills with $2'],
  [/^(\d+) Kopfschüsse \(Abschüsse\) mit (.+)$/, '$1 headshot kills with $2'],
  [/^Teils über Server(.*)$/, 'Partly via server$1'],
  [/^Über Server(.*)$/, 'Via server$1'],
  [/^mit (.+) öffnest du das Kaufmenü$/, 'press $1 to open the buy menu'],
  [/^Entschärfe sie: hingehen und (.+) \((.+)\)$/, 'Defuse it: walk over and $1 ($2)'],
];

const ATTRIBUTE = ['aria-label', 'title', 'placeholder'];

function uebersetzeText(knoten) {
  const roh = knoten.nodeValue;
  if (!roh) return;
  const text = roh.trim();
  if (!text || text.length > 400) return;
  const treffer = EN[text];
  if (treffer) { knoten.nodeValue = roh.replace(text, treffer); return; }
  for (const [muster, ersatz] of MUSTER) {
    if (muster.test(text)) { knoten.nodeValue = roh.replace(text, text.replace(muster, ersatz)); return; }
  }
}

function uebersetzeElement(el) {
  for (const a of ATTRIBUTE) {
    const wert = el.getAttribute && el.getAttribute(a);
    if (wert && EN[wert.trim()]) el.setAttribute(a, EN[wert.trim()]);
  }
}

function uebersetze(wurzel) {
  if (wurzel.nodeType === Node.TEXT_NODE) { uebersetzeText(wurzel); return; }
  if (wurzel.nodeType !== Node.ELEMENT_NODE) return;
  uebersetzeElement(wurzel);
  const lauf = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = lauf.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) uebersetzeText(n);
    else uebersetzeElement(n);
    n = lauf.nextNode();
  }
}

export function starteUebersetzung() {
  const code = sprache();
  document.documentElement.lang = code;
  if (code === 'de') return;

  const los = () => {
    uebersetze(document.body);
    // Alles, was das Spiel später einbaut, ebenfalls übersetzen
    new MutationObserver((eintraege) => {
      for (const e of eintraege) {
        if (e.type === 'characterData') uebersetzeText(e.target);
        else for (const n of e.addedNodes) uebersetze(n);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.body) los();
  else document.addEventListener('DOMContentLoaded', los, { once: true });
}
