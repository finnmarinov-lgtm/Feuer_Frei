// Sprache der Oberfläche: Deutsch oder Englisch, in den Einstellungen wählbar. Ohne Wahl richtet
// sie sich nach dem Browser (Deutsch zuerst -> Deutsch, sonst Englisch).
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
  // noch nichts gewählt: Deutsch, wenn der Browser zuerst Deutsch möchte, sonst Englisch. Früher
  // immer Englisch; auf deutschen Handys ließen viele dann den Browser übersetzen, und die Texte
  // sprangen hin und her (das Spiel übersetzte zurück). Das Übersetzen ist jetzt abgeschaltet.
  const first = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  return first.startsWith('de') ? 'de' : 'en';
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

  // ---------- Ergänzt am 29.09.2026 (alles, was noch deutsch war) ----------
  // Seite, Laden, Pause
  'Feuer Frei – 3D-Shooter im Browser, kostenlos und ohne Installation': 'Feuer Frei – free 3D shooter in your browser, no install',
  'Baue Arena …': 'Building arena …',
  'Bereite Grafik vor …': 'Preparing graphics …',
  'Fehler beim Laden': 'Error while loading',
  'Spiel verlassen': 'Leave match',
  'Duell verlassen': 'Leave duel',
  'Spiel beenden': 'End match',
  'Vollbild': 'Fullscreen',
  'Vollbild verlassen: Esc · zurück: hier oder mit Weiter': 'Esc leaves fullscreen · get it back here or with Resume',
  'Klicken': 'Click',
  'Tippen': 'Tap',
  'Klicken zum Spielen': 'Click to play',
  'Tippen zum Spielen': 'Tap to play',
  'Tippen zum Weiterspielen': 'Tap to resume',
  'Notizen': 'Notes',

  // Spielstart (Klicken zum Spielen)
  '1 gegen 1': '1v1',
  'Kaufzeit läuft': 'Buy time is running',
  'Du greifst an und legst die Bombe': 'You attack and plant the bomb',
  'Du verteidigst deinen Bombenplatz': 'You defend your bomb site',
  'Ihr greift an': 'Your team attacks',
  'Ihr verteidigt': 'Your team defends',
  'Team Rot': 'Team Red',
  'Team Blau': 'Team Blue',
  'Rot': 'Red',
  'Blau': 'Blue',
  'Freies Training': 'Free training',
  'Team-Spiel': 'Team match',
  'KI-Gegner': 'AI opponent',

  // Kaufmenü
  'Du trägst die Bombe': 'You are carrying the bomb',
  'Abschussserie: 3 Abschüsse hintereinander, ohne zu sterben': 'Kill streak: 3 kills in a row without dying',
  'Schwere Pistole': 'Heavy pistol',
  'Maschinenpistole': 'SMG',
  'Sturmgewehr': 'Assault rifle',
  'Schrotflinte': 'Shotgun',
  'Sturmgewehr mit Rotpunkt': 'Assault rifle with red dot',
  'Pistolen': 'Pistols',
  'Gewehre': 'Rifles',
  '16 Sekunden Sichtschutz': '16 seconds of cover',
  'Kaufzeit vorbei': 'Buy time is over',
  'Nur im Spawn': 'Only at spawn',
  'Extra-Slots voll': 'Extra slots full',
  'Schon im Besitz': 'Already owned',
  'Zu wenig Geld': 'Not enough money',
  'Haupt': 'Primary',
  'Extra': 'Extra',

  // Steuerung
  'Entf': 'Delete',
  'Maus': 'Mouse',
  'Umsehen': 'Look around',
  'Schießen / Messerhieb / Granate weit werfen': 'Shoot / knife slash / throw grenade far',
  'Zielen (Kimme und Korn, Zielfernrohr) / Messerstich / Granate kurz werfen': 'Aim (iron sights, scope) / knife stab / throw grenade short',
  'Mausrad': 'Mouse wheel',
  'Waffe wechseln': 'Switch weapon',
  'Taste drücken …': 'Press a key …',
  'Klicken zum Ändern': 'Click to change',
  'Klicken zum Belegen': 'Click to assign',
  'Zweite Taste hinzufügen': 'Add a second key',
  'Notizblock: sofort weißes Blatt, Spiel pausiert, Ton aus (Taste in den Einstellungen)':
    'Notepad: instant blank page, game paused, sound off (key in the settings)',
  'Alle Tasten sind wieder wie am Anfang.': 'All keys are back to their defaults.',

  // Nach der Partie
  'Der Host hat das Spiel verlassen.': 'The host left the match.',
  'Es sind zu wenige Spieler für eine neue Partie übrig.': 'There are not enough players left for a new match.',
  'Mit „Nochmal“ startest du die nächste Partie für alle.': 'Press “Play again” to start the next match for everyone.',
  'Neue Partie startet …': 'New match starting …',
  'Ausgeschaltet': 'Eliminated',
  'Tode': 'Deaths',
  'Treffergenauigkeit': 'Accuracy',
  'Kopfschüsse': 'Headshots',
  'Kopfschuss': 'Headshot',
  'Schaden': 'Damage',
  'Geld verdient': 'Money earned',
  'Geld ausgegeben': 'Money spent',
  'Bomben gelegt': 'Bombs planted',
  'Entschärft': 'Defused',
  'Keine Leben mehr': 'No lives left',
  'Zeit': 'Time',
  'mehr Leben': 'more lives',
  'mehr Lebenspunkte': 'more health',
  'Gleichstand': 'Draw',
  'Bombe explodiert': 'Bomb exploded',
  'Bombe entschärft': 'Bomb defused',
  'keine Bombe': 'no bomb',
  'Team ausgeschaltet': 'Team eliminated',
  'Runde': 'Round',
  'Ergebnis': 'Result',
  'Wie': 'How',
  'Gewonnen': 'Won',
  'Unentschieden': 'Draw',
  'Verloren': 'Lost',
  'Der Host ist weg – Spiel vorbei': 'The host is gone – match over',
  'Die Gegner sind weg – dein Team gewinnt': 'The opponents are gone – your team wins',
  'Dein Team ist nicht mehr da': 'Your team is gone',
  'weg': 'gone',

  // Anzeige im Spiel
  'Nur mit KI': 'Bots only',
  'Direkt verbunden': 'Connected directly',
  'Teils über Server': 'Partly via server',
  'Über Server': 'Via server',
  'Verbindung unterbrochen …': 'Connection interrupted …',
  'Skin freigeschaltet!': 'Skin unlocked!',
  'selbst erwischt': 'got yourself',
  'hat sich selbst erwischt': 'got themselves',
  'Ziel': 'Target',
  'Luftschlag bereit!': 'Air strike ready!',
  'Gleich kommt die Auswertung': 'Results coming up',
  'Rundensiege': 'Rounds won',
  'Ausgeschaltet / Tode': 'Kills / deaths',
  'Verbindung': 'Connection',
  'Ziele umgelegt': 'Targets knocked down',
  'Granaten geworfen': 'Grenades thrown',
  'Luftschläge': 'Air strikes',
  'Spawn-Schutz': 'Spawn protection',
  'Dein Platz': 'Your site',
  'Angriff': 'Attack',
  'Verteidigung': 'Defence',
  'Keine Zeitgrenze': 'No time limit',
  'jederzeit': 'any time',
  'alles gratis': 'everything free',
  'Ziele klappen wieder hoch': 'targets pop back up',
  'Deine Waffen hast du noch': 'You still have your weapons',
  'Legen …': 'Planting …',
  'Weiter geht’s': 'Back in action',
  'Los!': 'Go!',
  'Zeit abgelaufen': 'Time is up',
  'du hast mehr Leben übrig': 'you have more lives left',
  'du hast mehr Lebenspunkte': 'you have more health left',
  'dein Team hat mehr Leben übrig': 'your team has more lives left',
  'dein Team hat mehr Lebenspunkte': 'your team has more health left',
  'Deine Bombe ist explodiert': 'Your bomb exploded',
  'Eure Bombe ist explodiert': 'Your bomb exploded',
  'Die Bombe ist explodiert': 'The bomb exploded',
  'keine Bombe gelegt': 'no bomb planted',
  'Die Bombe wurde gelegt!': 'The bomb has been planted!',
  'Selbst erwischt': 'You got yourself',
  'Verbindung weg': 'Connection lost',
  'Dein Team ist ausgeschaltet': 'Your team is eliminated',
  'Jetzt ist dein Team dran': 'It’s up to your team now',
  'Ein Gegner kommt von der anderen Seite': 'One opponent is coming from the other side',
  'verteidige deinen Platz': 'defend your site',
  'verteidigt euren Platz': 'defend your site',
  'tippe auf „Kaufen“': 'tap “Buy”',
  'Dein eigener Luftschlag war zu nah': 'Your own air strike was too close',
  'Deine eigene Granate war zu nah': 'Your own grenade was too close',
  'Kein Luftschlag': 'No air strike',
  'Luftschlag noch nicht bereit': 'Air strike not ready yet',
  'Erst wenn die Runde läuft': 'Only once the round is running',
  'Kein Ziel': 'No target',
  'Schau auf den Boden unter freiem Himmel, dort feuert der Jet hin': 'Look at open ground under the sky, that is where the jet fires',
  'Schnellnachrichten': 'Quick messages',
  'Gibt es im Mehrspieler': 'Available in multiplayer',
  'Luftschlag angefordert': 'Air strike called in',
  'Luftschlag deines Teams': 'Your team’s air strike',
  'Luftschlag!': 'Air strike!',
  'Raus aus dem roten Kreis!': 'Get out of the red circle!',
  'Achte auf den roten Rauch': 'Watch out for the red smoke',
  'Feuerknopf': 'Fire button',
  'Klick': 'click',
  'Mitspieler': 'Teammate',
  'Zuschauen': 'Spectating',
  'Gegner-Sicht': 'Opponent view',
  'nächster Mitspieler': 'next teammate',
  'eigene Sicht': 'own view',
  'Keine Leben mehr in dieser Runde': 'No lives left this round',
  'Kaufzeit noch': 'Buy time left',

  // Skins und Aufgaben
  'Standard': 'Default',
  'Standard (Teamfarbe)': 'Default (team colour)',
  'Wüstentarn': 'Desert camo',
  'Waldtarn': 'Woodland camo',
  'Arktis': 'Arctic',
  'Nachttarn': 'Night camo',
  'Chrom': 'Chrome',
  'Kupfer': 'Copper',
  'Kirschrot': 'Cherry red',
  'Ozeanblau': 'Ocean blue',
  'Regenbogen': 'Rainbow',
  'Galaxie': 'Galaxy',
  '✓ Ausgerüstet': '✓ Equipped',
  'Anklicken zum Ausrüsten': 'Click to equip',
  '✓ geschafft': '✓ done',
  'noch gesperrt': 'still locked',
  'der Natter': 'the Natter',
  'der Kobra': 'the Kobra',
  'der Falke': 'the Falke',
  'der Keiler': 'the Keiler',
  'dem Wolf': 'the Wolf',
  'dem Luchs': 'the Luchs',
  'dem Adler': 'the Adler',
  'dem Messer': 'the knife',

  // Lobby
  'Ihr habt verschiedene Versionen des Spiels. Bitte alle die Seite neu laden (Strg + F5).':
    'You have different versions of the game. Everyone please reload the page (Ctrl + F5).',
  'Eine Runde gewinnt, wer alle Gegner ausschaltet (mit 3 Leben muss jeder dreimal fallen).':
    'A round is won by eliminating all opponents (with 3 lives everyone has to fall three times).',
  'Code hat 6 Zeichen': 'The code has 6 characters',
  'Das Spiel ist schon vorbei oder der Host ist weg.': 'The match is already over or the host is gone.',
  'Jemand mit einer anderen Version des Spiels will mitspielen. Bitte alle neu laden (Strg + F5).':
    'Someone with a different version of the game wants to join. Everyone please reload (Ctrl + F5).',
  'Diese Lobby ist schon voll (4 gegen 4).': 'This lobby is already full (4v4).',
  'Der Host hat die Lobby verlassen.': 'The host left the lobby.',
  'Kopiert!': 'Copied!',
  'Markiert – Strg+C': 'Selected – Ctrl+C',
  'Feuer Frei – Mehrspieler': 'Feuer Frei – multiplayer',
  'KI entfernen': 'Remove bot',
  'frei': 'free',
  'Hierher wechseln': 'Switch here',
  '+ KI': '+ Bot',
  'gegen': 'vs',
  'der Host': 'the host',
  'Verbinde mit der Lobby …': 'Connecting to the lobby …',
  'Warte auf deine Freunde …': 'Waiting for your friends …',
  'Alle da? Dann starte das Spiel.': 'Everyone here? Then start the match.',
  'Im anderen Team fehlt noch jemand.': 'The other team still needs a player.',
  'Noch keine Lobby gefunden. Stimmt der Code, und ist der Host noch in der Lobby?':
    'No lobby found yet. Is the code right, and is the host still in the lobby?',
  'Schick deinen Freunden den Code oder den Link. Bis zu 8 Spieler (4 gegen 4), zu zweit wird es ein 1 gegen 1.':
    'Send your friends the code or the link. Up to 8 players (4v4); with two players it becomes a 1v1.',
  'Der Server antwortet noch nicht, versuche es direkt …': 'The server is not answering yet, trying directly …',

  // offene Lobbys, Rauswerfen
  'Öffentlich': 'Public',
  '(steht in der Liste, Fremde können beitreten)': '(listed, strangers can join)',
  'Offene Lobbys': 'Open lobbies',
  'Suche offene Lobbys …': 'Looking for open lobbies …',
  'Die Liste ist gerade nicht erreichbar.': 'The list cannot be reached right now.',
  'Gerade ist keine Lobby offen. Erstelle eine mit Häkchen bei „Öffentlich“.': 'No lobby is open right now. Create one with “Public” ticked.',
  'Voll': 'Full',
  'Spieler in der Lobby': 'Players in the lobby',
  'Sichtbarkeit': 'Visibility',
  'Nur mit Code': 'Code only',
  'Nur wer den Code oder den Link hat, kommt rein.': 'Only people with the code or the link can join.',
  'Steht in der Liste im Mehrspieler-Menü, jeder kann beitreten. Mit ✕ wirfst du jemanden raus.':
    'Listed in the multiplayer menu, anyone can join. Use ✕ to kick someone.',
  'Steht in der Liste im Mehrspieler-Menü, jeder kann beitreten.': 'Listed in the multiplayer menu, anyone can join.',
  'Warte auf Mitspieler …': 'Waiting for players …',
  'Deine Lobby steht jetzt in der Liste der offenen Lobbys. Bis zu 8 Spieler (4 gegen 4), zu zweit wird es ein 1 gegen 1.':
    'Your lobby is now in the list of open lobbies. Up to 8 players (4v4); with two players it becomes a 1v1.',
  '1 Mitspieler verbunden': '1 player connected',
  'Aus der Lobby werfen': 'Kick from the lobby',
  'Der Host hat dich aus der Lobby geworfen.': 'The host kicked you from the lobby.',

  // zurück in die Lobby, Zuschauer
  'Zur Lobby': 'Back to lobby',
  'Mit „Zur Lobby“ kommen alle mit zurück in die Lobby. Dort kannst du alles neu einstellen, und neue Leute können dazukommen.':
    'With “Back to lobby” everyone returns to the lobby. There you can change the settings, and new people can join.',
  'Geht der Host zurück in die Lobby, kommst du automatisch mit.': 'When the host goes back to the lobby, you follow automatically.',
  'Zuschauer': 'Spectator',
  'Zuschauen': 'Watch',
  'Spiel läuft': 'Match running',
  'Du schaust zu': 'You are spectating',
  'Gerade lebt niemand': 'Nobody is alive right now',
  'Team Rot gegen Team Blau': 'Team Red vs Team Blue',
  'Leertaste oder Klick': 'Space or click',
  'Hier läuft schon eine Partie: Du schaust zu, bis sie vorbei ist, danach geht es in der Lobby weiter':
    'A match is already running here: you spectate until it is over, then it continues in the lobby',

  // Luftschlag zu nah
  'Zu nah': 'Too close',
  'Zu nah an dir: weiter weg zielen (im Kreis trifft der Jet auch dich)': 'Too close to you: aim further away (the jet hits you too inside the circle)',

  // beim Durchspielen noch gefunden
  '+ Helm': '+ helmet',
  'gratis': 'free',
  'KI': 'bot',
  'MP & Schrot': 'SMG & shotgun',
  'Alle Aufgaben': 'All challenges',
  'Titel': 'Title',
  'Leg die Bombe auf dem Platz des Gegners': 'Plant the bomb on the opponent’s site',
  'Legt die Bombe auf dem Platz der Gegner': 'Plant the bomb on the opponents’ site',
  'Halte deinen Bombenplatz': 'Hold your bomb site',
  'Haltet euren Bombenplatz': 'Hold your bomb site',
};

// Trennzeichen, über die ein Platzhalter nur greifen darf, wenn die Vorlage sie selbst enthält
const GRENZEN = [' · ', ' – ', ': '];

// Zusammengesetzte Texte als Vorlagen: {} steht für beliebigen Text, {n} für eine Zahl. Im
// Englischen verweisen {1}, {2} … auf die Platzhalter in ihrer Reihenfolge (bloßes {} = der Reihe
// nach). Was in einem Platzhalter steht, wird selbst wieder übersetzt (Kartennamen, "E halten" …).
// Wird nur geprüft, wenn oben nichts genau passt.
const VORLAGEN = [
  ['Runde {n}', 'Round {1}'],
  ['Runde {n}/{n}', 'Round {1}/{2}'],
  ['Runde {n} · Sieg bei {n}', 'Round {1} · first to {2}'],
  ['Runde {n} · Du greifst an', 'Round {1} · you attack'],
  ['Runde {n} · Du verteidigst', 'Round {1} · you defend'],
  ['Runde {n} · Ihr greift an', 'Round {1} · your team attacks'],
  ['Runde {n} · Ihr verteidigt', 'Round {1} · your team defends'],
  ['Runde {n} · {} hat gewartet', 'Round {1} · {2} waited'],
  ['Runde {n}: {}', 'Round {1}: {2}'],
  ['Runde {n} gegen {}', 'Round {1} against {2}'],
  ['+{} Siegprämie', '+{1} win bonus'],
  ['+{} Niederlagenbonus', '+{1} loss bonus'],
  ['{} hat die Bombe entschärft', '{1} defused the bomb'],
  ['{} ist zurück', '{1} is back'],
  ['Noch {n} Abschuss hintereinander, ohne zu sterben', '{1} more kill in a row without dying'],
  ['Noch {n} Abschüsse hintereinander, ohne zu sterben', '{1} more kills in a row without dying'],
  ['{n} Abschüsse mit {}', '{1} kills with {2}'],
  ['{n} Kopfschüsse (Abschüsse) mit {}', '{1} headshot kills with {2}'],
  ['mit {} öffnest du das Kaufmenü', 'press {1} to open the buy menu'],
  ['Entschärfe sie: hingehen und {} ({})', 'Defuse it: walk over and {1} ({2})'],
  // Spielstart
  ['{} zum Spielen', '{1} to play'],
  ['{} zum Zuschauen', '{1} to spectate'],
  ['{}: nächster Spieler', '{1}: next player'],
  ['{} schaut zu', '{1} is spectating'],
  ['{} gewinnt', '{1} wins'],
  ['Im Kreis trifft der Jet auch dich. Ziel mindestens {n} m entfernt wählen.', 'The jet hits you too inside the circle. Pick a target at least {1} m away.'],
  ['Zurück im Duell – {} zum Weiterspielen', 'Back in the duel – {1} to resume'],
  ['Zurück im Spiel – {} zum Weiterspielen', 'Back in the match – {1} to resume'],
  ['1 gegen 1 gegen {}', '1v1 against {1}'],
  ['Bombenmodus gegen {}', 'Bomb mode against {1}'],
  ['{n} gegen {n}', '{1}v{2}'],
  ['{} im Bombenmodus', '{1} bomb mode'],
  ['Du bist in {}', 'You are in {1}'],
  ['{n} neue Skins freigeschaltet!', '{1} new skins unlocked!'],
  ['{}. Auswählen kannst du alle Skins unter „Skins & Aufgaben“.', '{1}. You can pick all skins under “Skins & challenges”.'],
  ['{} Auf dem Handy spielt die KI in jeder Stufe schwächer als am PC.', '{1} On phones the AI plays weaker at every level than on a PC.'],
  // Steuerung
  ['Schließen ({})', 'Close ({1})'],
  ['{} ist die Notizblock-Taste. Bitte eine andere wählen.', '{1} is the notepad key. Please pick another one.'],
  ['„{}“ hat jetzt keine Taste.', '“{1}” has no key now.'],
  ['{} war vorher bei „{}“ – dort ist sie jetzt frei.', '{1} was assigned to “{2}” before – it is free there now.'],
  ['{} braucht das Spiel selbst, bitte eine andere Taste wählen.', 'The game needs {1} itself, please pick another key.'],
  // Nach der Partie
  ['{} möchte nochmal spielen!', '{1} wants to play again!'],
  ['{} möchten nochmal spielen!', '{1} want to play again!'],
  ['Warte auf {} (Host) …', 'Waiting for {1} (host) …'],
  ['{} (Host) startet die nächste Partie.', '{1} (host) starts the next match.'],
  ['{} hat das Spiel verlassen.', '{1} left the match.'],
  ['{} hat das Spiel verlassen', '{1} left the match'],
  ['Warte auf {} …', 'Waiting for {1} …'],
  ['{} ist nicht mehr da – du gewinnst', '{1} is gone – you win'],
  ['Sieg gegen {}!', 'Victory against {1}!'],
  ['Niederlage gegen {}', 'Defeat against {1}'],
  ['Sieg für {}!', 'Victory for {1}!'],
  ['Niederlage für {}', 'Defeat for {1}'],
  ['{} (Du)', '{1} (you)'],
  ['{} (KI)', '{1} (bot)'],
  ['{} (KI):', '{1} (bot):'],
  // Anzeige im Spiel
  ['{n} Mitspieler ohne Verbindung', '{1} players disconnected'],
  ['Kaufzeit noch {n} s', 'Buy time: {1} s left'],
  ['{} Schaden', '{1} damage'],
  ['{n} Schuss', '{1} rounds'],
  ['{} drücken, Ziel anschauen, Linksklick', 'Press {1}, look at the target, left click'],
  ['Knopf halten', 'Hold button'],
  ['halten: {}', '(hold): {1}'],
  ['{} halten', 'hold {1}'],
  ['Umgelegt: {n}', 'Knocked down: {1}'],
  ['Ziele: {n} / {n}', 'Targets: {1} / {2}'],
  ['· noch {n} s', '· {1} s left'],
  ['· jederzeit, alles gratis', '· any time, everything free'],
  ['{n},{n} s', '{1}.{2} s'],
  ['{n} Leben', '{1} lives'],
  ['Noch {n} Leben', '{1} lives left'],
  ['in {n} s geht es weiter', 'back in {1} s'],
  ['{n} s Spawn-Schutz', '{1} s spawn protection'],
  ['Nicht bei „{}“', 'Not in “{1}”'],
  ['Kaufzeit – {}', 'Buy time – {1}'],
  ['Leg die Bombe auf dem roten Platz ({})', 'Plant the bomb on the red site ({1})'],
  ['Legt die Bombe auf dem roten Platz ({})', 'Plant the bomb on the red site ({1})'],
  ['{} greift an', '{1} attacks'],
  ['{} kommt von der anderen Seite', '{1} is coming from the other side'],
  ['{n} Gegner kommen von der anderen Seite', '{1} opponents are coming from the other side'],
  ['Verteidige sie {n} Sekunden lang', 'Defend it for {1} seconds'],
  ['{} hat keine Leben mehr', '{1} has no lives left'],
  ['{} hat mehr Leben übrig', '{1} has more lives left'],
  ['{} hat mehr Lebenspunkte', '{1} has more health left'],
  ['{} hat die Bombe nicht gelegt', '{1} did not plant the bomb'],
  ['{} ist ausgeschaltet', '{1} is eliminated'],
  ['Die Bombe tickt weiter – schafft {} es noch?', 'The bomb keeps ticking – can {1} make it?'],
  ['{} hat dich erwischt', '{1} got you'],
  ['in {n} s gewinnst du kampflos', 'you win by forfeit in {1} s'],
  ['in {n} s endet das Spiel', 'the match ends in {1} s'],
  ['In der {} gibt es keinen Luftschlag', 'There is no air strike in the {1}'],
  ['Der Jet feuert in {n} Sekunden', 'The jet fires in {1} seconds'],
  ['{} hat den Jet gerufen', '{1} called the jet'],
  ['{} / Klick', '{1} / click'],
  ['Zurück in {n} s', 'Back in {1} s'],
  // Lobby
  ['Die Seiten wechseln jede Runde: Wer angreift, legt die Bombe auf dem Platz der anderen ({} halten), wer verteidigt, entschärft sie.',
    'Sides switch every round: attackers plant the bomb on the other side’s site (hold {1}), defenders defuse it.'],
  ['Spieler {n}', 'Player {1}'],
  ['Spiel mit mir! Code {}', 'Play with me! Code {1}'],
  ['{} starten', 'Start {1}'],
  ['{} startet in {n} …', '{1} starts in {2} …'],
  ['Warte, bis {} startet …', 'Waiting for {1} to start …'],
  ['{n} Freund verbunden', '{1} friend connected'],
  ['{n} Freunde verbunden', '{1} friends connected'],
  ['{n} über Server', '{1} via server'],
  ['{n} Mitspieler verbunden', '{1} players connected'],
  ['Dieser Name ist nicht erlaubt. Die anderen sehen dich als „{}“.', 'This name is not allowed. Others will see you as “{1}”.'],
].map(([de, en]) => vorlage(de, en));

function vorlage(de, en) {
  let quelle = '';
  for (const teil of de.split(/(\{n?\})/)) {
    if (teil === '{}') quelle += '(.+?)';
    else if (teil === '{n}') quelle += '(\\d+(?:[.,]\\d+)?)';
    else quelle += teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  let n = 0;
  // Trennzeichen, über die ein Platzhalter hinweg greifen darf (nur die, die in der Vorlage stehen)
  const erlaubt = GRENZEN.filter((x) => de.includes(x));
  return [new RegExp(`^${quelle}$`), en.replace(/\{(\d*)\}/g, (_, k) => `{${k || ++n}}`), erlaubt];
}

// Trennzeichen, an denen ein Text in Teile zerfällt, die einzeln übersetzt werden
// ("Hof · Nur Pistolen", "Zurück im Duell – Klicken …", "Runde 1: Ihr greift an")
const TRENNER = [' · ', ' – ', ': ', ', '];

const merker = new Map();

/** Englisch zu einem deutschen Text oder null, wenn es keins gibt */
function englisch(text, tiefe = 0) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || !/[A-Za-zÄÖÜäöüß]/.test(t)) return null;
  if (tiefe === 0 && merker.has(t)) return merker.get(t);
  let r = EN[t] ?? null;
  if (r === null) {
    for (const [muster, ziel, erlaubt] of VORLAGEN) {
      const m = muster.exec(t);
      // "{} greift an" soll nicht "… · Runde 1: Ihr greift an" im Ganzen schlucken: Solche Texte
      // werden erst an den Trennzeichen zerlegt
      if (!m || m.slice(1).some((g) => GRENZEN.some((x) => g.includes(x) && !erlaubt.includes(x)))) continue;
      r = ziel.replace(/\{(\d+)\}/g, (_, k) => teil(m[+k], tiefe));
      break;
    }
  }
  if (r === null && tiefe < 4) {
    const trenner = TRENNER.find((x) => t.includes(x));
    if (trenner) {
      const stuecke = t.split(trenner);
      const neu = stuecke.map((s) => teil(s, tiefe));
      if (neu.some((s, i) => s !== stuecke[i])) r = neu.join(trenner);
    }
  }
  if (tiefe === 0) {
    if (merker.size > 4000) merker.clear();
    merker.set(t, r);
  }
  return r;
}

function teil(s, tiefe) {
  const r = englisch(s, tiefe + 1);
  return r === null ? s : r;
}

/** Text für Stellen, die nicht im Dokument landen (Teilen, Namen im Eingabefeld) */
export function t(text) {
  if (sprache() === 'de') return text;
  return englisch(text) ?? text;
}

/** Zahlenformat der gewählten Sprache */
export function locale() {
  return sprache() === 'de' ? 'de-DE' : 'en-GB';
}

/** Geldbetrag: auf Deutsch "2.200 $", auf Englisch "$2,200" */
export function geld(v) {
  const n = Math.round(v).toLocaleString(locale());
  return sprache() === 'de' ? `${n} $` : `$${n}`;
}

const ATTRIBUTE = ['aria-label', 'title', 'placeholder'];

// Nur schreiben, wenn sich wirklich etwas ändert: Jedes Setzen meldet der MutationObserver erneut,
// auch mit demselben Wert. Sonst übersetzt sich ein Text wie "Pause" endlos selbst, und die Seite
// friert ein (so geschehen in der Steuerung).
function uebersetzeText(knoten) {
  const roh = knoten.nodeValue;
  if (!roh || roh.length > 600) return;
  const text = roh.trim();
  const neu = englisch(text);
  if (neu === null || neu === text) return;
  const wert = roh.replace(text, neu);
  if (wert !== roh) knoten.nodeValue = wert;
}

function uebersetzeElement(el) {
  if (!el.getAttribute) return;
  for (const a of ATTRIBUTE) {
    const wert = el.getAttribute(a);
    if (!wert) continue;
    const neu = englisch(wert);
    if (neu !== null && neu !== wert) el.setAttribute(a, neu);
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
  const titel = englisch(document.title);
  if (titel) document.title = titel;

  const los = () => {
    uebersetze(document.body);
    // Alles, was das Spiel später einbaut oder ändert, ebenfalls übersetzen
    new MutationObserver((eintraege) => {
      for (const e of eintraege) {
        if (e.type === 'characterData') uebersetzeText(e.target);
        else if (e.type === 'attributes') uebersetzeElement(e.target);
        else for (const n of e.addedNodes) uebersetze(n);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTE });
  };

  if (document.body) los();
  else document.addEventListener('DOMContentLoaded', los, { once: true });
}
