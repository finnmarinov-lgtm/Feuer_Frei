# Feuer Frei

3D-Shooter im Browser im Stil von CS: Hauptwaffe, Pistole, Messer und zwei Extra-Slots für Granaten, dazu ein Kaufmenü mit Budget zu Beginn jeder Runde. Gebaut mit Three.js, Physik mit Rapier.

**Spielen:** https://finnmarinov-lgtm.github.io/Feuer_Frei/ · auch auf itch.io: https://fm323.itch.io/feuer-frei

Drei Spielarten:

- **Mehrspieler** über eine Lobby: einer erstellt sie und schickt Code oder Link, die Freunde klicken drauf und sind drin. Kein Konto, keine Installation. Zu zweit wird es ein **1 gegen 1**, mit mehr Leuten ein **Team-Spiel** (Rot gegen Blau, bis 4 gegen 4). Freie Plätze füllt der Host nur auf Knopfdruck mit KI-Spielern auf. Wer mag, macht seine Lobby **öffentlich**: Dann steht sie in einer Liste, und auch Fremde können mit einem Klick beitreten.
- **Gegen KI**: das 1 gegen 1 gegen einen Computer-Gegner (Anfänger, Leicht, Mittel, Schwer), ohne dass ein Freund online sein muss.
- **Training**: freies Üben gegen Klappziele aus Stahl, ohne Zeitgrenze, alles gratis.

Dazu drei Karten (**Hof**, **Lagerhalle** und der große, offene **Hafen** für Team-Spiele), drei Waffen-Modi (**Alle Waffen**, **Nur Pistolen**, **Scharfschützen**) und **Skins** für alle Waffen, das Messer und die eigene Figur, die man über **Aufgaben** freischaltet (Menüpunkt **Skins & Aufgaben**).

Es läuft am PC (Maus und Tastatur) und auf dem Handy oder Tablet (Touch-Steuerung, quer halten).

## Starten

```
npm install
npm run dev
```

Danach `http://localhost:5173` öffnen und auf **Mehrspieler**, **Gegen KI** oder **Training** klicken.

## Mehrspieler (1 gegen 1 bis 4 gegen 4)

1. **Mehrspieler → Lobby erstellen.** Es erscheinen ein Code (z. B. `K7P2QX`) und ein Link. Den Link mit **Link kopieren** oder **Teilen** an die Freunde schicken (bis zu 7, also höchstens 8 Spieler).
2. Wer den Link öffnet, ist sofort in der Lobby. Alternativ: **Mehrspieler → Beitreten** und den Code eintippen.
3. Die Lobby zeigt zwei Spalten, **Team Rot** und **Team Blau** (je bis zu 4 Plätze). Der Host ist in Rot, wer beitritt, kommt ins kleinere Team und kann mit **Hierher wechseln** tauschen.
4. **KI-Spieler nur auf Knopfdruck:** **Mit KI auffüllen** gibt dem kleineren Team so viele KI-Spieler, bis beide gleich groß sind. Mit **+ KI** kommt in ein bestimmtes Team ein KI-Spieler dazu, **✕** nimmt ihn wieder heraus (bei Menschen: siehe Rauswerfen unten). Tritt noch ein Freund bei, während ein Team voll ist, macht ein KI-Spieler Platz. Wie stark die KI-Spieler sind, stellt der Host unter **KI-Stärke** ein.
5. Der Host stellt ein: **Modus** (Kampf oder Bombe), **Karte** (Hof, Lagerhalle oder Hafen; der Hafen ist größer und passt am besten zu 3 gegen 3 und 4 gegen 4), **Waffen** (Alle, Nur Pistolen, Scharfschützen), **1 oder 3 Leben pro Runde** und **Sieg bei 2, 3 oder 5 Rundensiegen**.
6. Sind alle da, drückt der Host **Starten** (der Knopf zeigt, was es wird, z. B. „2 gegen 2 starten“). Nach 3 Sekunden geht es los. Einmal ins Bild klicken, damit die Maus gefangen wird.

**Zu zweit (ein Mensch pro Team, keine KI) wird daraus das 1 gegen 1**, genau wie bisher. Sonst ist es ein Team-Spiel (siehe unten).

**Nach der Partie zurück in die Lobby:** In der Auswertung führt **Zur Lobby** in dieselbe Lobby zurück (statt „Nochmal“). Die Verbindung bleibt dabei bestehen, alle sind sofort wieder da. Geht der Host zurück, kommen alle anderen automatisch mit, auch wer noch die Auswertung ansieht. Jeder landet in seinem alten Team, die KI-Spieler bleiben, und wer nicht zurückkommt, verliert seinen Platz nach einer Minute. Der Host kann dann alles neu einstellen und wieder starten; neue Leute können beitreten. Das Hauptmenü verlässt die Lobby ganz.

**Zuschauen:** Wer einer Lobby beitritt, während dort gespielt wird, schaut zu, bis die Partie vorbei ist, und spielt danach in der Lobby mit. Man sieht durch die Augen der Spieler (wie nach dem eigenen Tod), `Leertaste` oder Klick wechselt zum nächsten. Lebt gerade niemand, kreist die Kamera über der Karte. Geld, Leben, Munition, Luftschlag und Radar sind dabei ausgeblendet. Der Host meldet „… schaut zu“. Wer aus der Lobby geworfen wurde, darf nicht zuschauen.

### Offene Lobbys (mit Fremden spielen)

- **Öffentlich machen:** Beim Erstellen das Häkchen **Öffentlich** setzen. Im Raum lässt es sich unter **Sichtbarkeit** jederzeit umstellen (**Nur mit Code** oder **Öffentlich**).
- **Liste:** Unter **Mehrspieler** steht unten **Offene Lobbys** mit Host, Karte, Modus und Spielerzahl (z. B. „2/8“). **Beitreten** reicht, ein Code ist nicht nötig. Volle Lobbys stehen hinten mit **Voll**. Läuft dort gerade eine Partie, steht sie mit „Spiel läuft“ und **Zuschauen** weiter in der Liste: Wer dazukommt, schaut zu und spielt danach mit. Verlässt der Host die Lobby oder geht sein Tab zu, verschwindet sie aus der Liste.
- **Rauswerfen:** Der Host sieht bei jedem Mitspieler ein **✕**. Wer rausfliegt, landet wieder in der Auswahl mit dem Hinweis „Der Host hat dich aus der Lobby geworfen.“, sieht die Lobby nicht mehr in seiner Liste und kommt auch per Code nicht mehr hinein (solange der Host die Seite nicht neu lädt).
- **Namensfilter:** Namen mit groben Wörtern (Schimpfwörter, Beleidigungen, Nazi-Begriffe, auf Deutsch und Englisch) sehen alle anderen als „Spieler NN“. Getarnte Schreibweisen wie `F1ck`, `F.i.c.k` oder `Fiiick` fallen auch darunter. Wer so einen Namen eintippt, sieht unter dem Namensfeld, wie die anderen ihn sehen. Der Filter gilt immer, also auch in Lobbys nur mit Code. Er fängt das Gröbste, nicht alles; für den Rest gibt es das Rauswerfen.

Regeln im 1 gegen 1:

- Host startet im Westen, Gast im Osten. Jeder hat seine eigene Kaufzone am Startpunkt. Vor beiden Startpunkten stehen Kisten als Deckung, damit niemand direkt durch die Lücke in der Mitte beschossen werden kann.
- Pro Runde hat jeder so viele Leben wie eingestellt. Wer stirbt und noch Leben hat, ist nach 4 Sekunden am eigenen Startpunkt zurück (mit voller Gesundheit, eigener Ausrüstung und wieder voller Munition). Bei mehr als einem Leben zeigt unten links neben Lebenspunkten und Weste ein Herz mit Punkten, wie viele man noch hat (●●○ = noch 2 von 3), im 1 gegen 1 und im Team-Spiel.
- **Kill-Cam und Gegner-Sicht:** Nach dem eigenen Tod sinkt der Blick kurz zu Boden, dann zeigt die **Kill-Cam** die letzten zwei Sekunden noch einmal durch die Augen des Gegners: mit seiner Waffe in der Hand, seinen Schüssen und Leuchtspuren und der eigenen Figur so, wie er sie gesehen hat (Kinobalken oben und unten). Neben seinem Namen steht, wie viele Lebenspunkte er beim Abschuss noch hatte (♥ 37), bei mehreren Leben dazu seine Leben als Punkte. Danach sieht man bis zum Wiedereinstieg in der **Gegner-Sicht** live, was er gerade sieht. `Leertaste` oder ein Klick wechselt zwischen beiden (auf dem Handy der Feuer- oder Sprungknopf). Hat man keine Leben mehr, kann man dem Gegner bis zum Rundenende zuschauen, im Bombenmodus also auch beim Entschärfen.
- **Spawn-Schutz:** 2 Sekunden nach dem Rundenstart und nach jedem Wiedereinstieg zählen keine Treffer (auch keine Granaten). Der Schutz endet sofort, wenn man selbst schießt, sticht oder wirft. Den eigenen Schutz zeigt ein Hinweis unten in der Mitte, ein geschützter Gegner schimmert bläulich und Treffer auf ihn werden blau markiert.
- Die Runde gewinnt, wer dem anderen alle Leben nimmt. Läuft die Zeit ab, gewinnt, wer mehr Leben übrig hat, danach wer mehr Lebenspunkte hat.
- Geld wie in CS: 800 $ zum Start, Prämie pro Abschuss, Siegprämie 2.000 $, Niederlagenbonus ab 1.400 $ (steigt mit jeder Niederlage in Folge). Wer am Rundenende tot ist, verliert seine Ausrüstung.
- In der Pause (`Esc`) läuft das Duell weiter, man steht dann still. Wer das Duell über das Menü verlässt, verliert sofort.
- **Zurück ins laufende Duell:** Lädt jemand die Seite neu oder reißt die Verbindung ab, hält das Duell für beide an: Die Zeit steht, niemand kann getroffen werden, eine Anzeige zählt die Sekunden herunter. Nach dem Neuladen ist man automatisch wieder drin, mit Runde, Leben, Siegen, Geld, Waffen und Lebenspunkten, am eigenen Startpunkt und mit 2 Sekunden Spawn-Schutz. Kommt der andere nicht innerhalb von 60 Sekunden zurück (etwa weil er den Tab geschlossen hat), gewinnt man kampflos.
- **Schnellnachrichten:** `T` öffnet die Liste, `1` – `6` schickt „gg“, „Nice!“, „Sorry!“, „Glück gehabt!“, „Hahaha“ oder „Warte kurz“. Die Nachrichten erscheinen bei allen unten links und verschwinden nach ein paar Sekunden.

### Team-Spiel

Alles wie im 1 gegen 1 (Geld, Kaufen, Leben pro Runde, Kill-Cam, Bombenmodus, Luftschlag), nur mit Teams:

- **Team Rot startet im Westen, Team Blau im Osten**, jeder Spieler auf seinem eigenen Platz im Spawn. Team Rot hat Karambits, Team Blau Butterflymesser.
- **Kein Eigenbeschuss:** Kugeln fliegen an Mitspielern vorbei, Granaten und Luftschläge des eigenen Teams schaden einem nicht (die eigenen schon, wie bisher).
- **Runde gewonnen** hat das Team, das alle Gegner ausschaltet (jeder hat so viele Leben wie eingestellt). Läuft die Zeit ab, gewinnt das Team mit mehr Leben übrig, danach mit mehr Lebenspunkten.
- **Bombenmodus:** In ungeraden Runden greift Rot an, in geraden Blau. Jeder Angreifer kann die Bombe legen, jeder Verteidiger sie entschärfen (Geld und Aufgabe bekommt, wer es getan hat). Liegt die Bombe, tickt sie weiter, auch wenn alle Angreifer draußen sind.
- **Anzeige:** Oben stehen die Teams mit den Rundensiegen und darunter ein Punkt pro Spieler (voll = lebt). Über den Mitspielern schweben ihre Namen, auch durch Wände. `Tab` zeigt die Tabelle mit allen Spielern (Abschüsse, Tode, Ping).
- **Nach dem Tod:** Erst die Kill-Cam aus Sicht des Schützen (auch wenn es ein KI-Spieler war), danach schaut man den eigenen Mitspielern zu. `Leertaste` oder Klick wechselt zum nächsten Mitspieler und zurück zur Kill-Cam.
- **Nach dem letzten Leben** (keine Leben mehr in dieser Runde) läuft die Kill-Cam nur noch 2 Sekunden (bis zum Abschuss und dem Fallen) und ist danach weg: Man schaut nur noch den Mitspielern zu, `Leertaste` oder Klick wechselt reihum zwischen ihnen. Wer sie überspringt, kommt auch nicht mehr zurück.
- **KI-Spieler** spielen wie im Modus „Gegen KI“ (kaufen, hören Schritte, legen und entschärfen die Bombe, fordern Luftschläge an), nur mit mehreren Gegnern und Mitspielern. Sie laufen im Browser des Hosts mit.
- **Verbindung:** Lädt ein Spieler neu, ist er gleich wieder drin (mit Geld, Waffen und Tabelle). Wer länger als 20 Sekunden weg ist, zählt in der Runde als ausgeschieden. Lädt der Host neu, warten alle anderen auf ihn (die Zeit steht), danach geht es weiter. Ist der Host länger als 60 Sekunden weg oder verlässt er das Spiel, ist die Partie vorbei. Ist ein ganzes Team 60 Sekunden lang weg, gewinnt das andere kampflos.
- **Danach geht es in der Lobby weiter** (siehe unten).

### Bombenmodus

- Die Rollen wechseln jede Runde: In ungeraden Runden greift der Host an, in geraden der Gast.
- Jede Seite hat einen **Bombenplatz** in der Gasse ihrer Hälfte, nah an der Mitte vor dem Container (rot aufgemalt). Wer angreift, legt die Bombe auf dem Platz des anderen: im Kreis stehen und **E halten** (3,2 s, man steht dabei still). Eine Wegmarke zeigt, wo der Platz ist. Vom Startpunkt des Verteidigers sieht man den Platz nicht, der Weg dorthin ist für beide fast gleich lang (Verteidiger rund 29 m, Angreifer 33 m). Wer den Verteidiger erwischt, hat also Zeit zum Legen, bevor er wieder da ist.
- Die gelegte Bombe tickt 35 Sekunden und piept immer schneller. Wer verteidigt, entschärft sie direkt an der Bombe mit **E halten** (10 s, wie in CS ohne Entschärfungskit). So hat das angreifende Team nach einem Tod am Platz noch Zeit, zurückzukommen und das Entschärfen zu stören.
- Die Runde gewinnt, wer angreift, wenn die Bombe explodiert oder der Verteidiger keine Leben mehr hat. Wer verteidigt, gewinnt beim Entschärfen, wenn die Zeit ohne gelegte Bombe abläuft oder der Angreifer vor dem Legen keine Leben mehr hat. Liegt die Bombe schon, tickt sie auch weiter, wenn der Angreifer ausgeschaltet ist.
- Die Explosion ist bis etwa 10 m tödlich (auch für den, der sie gelegt hat). Wer dabei stirbt, verliert wie sonst am Rundenende seine Ausrüstung.
- Legen und Entschärfen bringen je 300 $.

### Abschussserie und Luftschlag

- Den **Luftschlag** gibt es für eine **Abschussserie**: 3 Abschüsse hintereinander, ohne selbst zu sterben (im Training zählen die Klappziele). Rechts über der Munition zeigen drei Punkte, wie weit man ist. Stirbt man, fängt die Serie von vorne an. Ein schon verdienter Luftschlag bleibt aber, bis man ihn einsetzt. Die Serie läuft über die Runden weiter, Abschüsse mit dem Luftschlag selbst zählen nicht.
- Ist die Serie geschafft, **X** drücken und das Ziel anschauen: ein Kreis zeigt, wohin der Jet feuert. **Linksklick** bestätigt, **Rechtsklick** oder **X** bricht ab. Beim Zielen kann man weiterlaufen. Das Ziel muss unter freiem Himmel liegen (nicht im Tunnel). Man darf es auch direkt neben sich setzen, muss dann aber rechtzeitig aus dem Kreis laufen. Auf der Karte Lagerhalle gibt es keinen Luftschlag.
- Am Ziel steigt roter Rauch auf, alle hören eine Warnung. Der Warnkreis hat keinen Rand: in der Mitte ist er kräftig rot, nach außen immer blasser, genau so verteilt sich auch der Schaden. Nach 3,2 Sekunden kommt ein Jet im Sturzflug und feuert mit der **Bordkanone** („Drrrrrt“, 48 Granaten in 1,2 Sekunden). Die Einschläge wandern in Flugrichtung durch den Kreis, mit Leuchtspuren, Feuer und Sandfontänen. In der Mitte ist das fast immer tödlich, 3 m daneben kostet es im Schnitt gut 90 Lebenspunkte, am Rand kaum noch etwas. Deckung schützt. Wer rechtzeitig aus dem Kreis läuft, überlebt. Auch der eigene Luftschlag trifft einen selbst.
- Ein Abschuss mit dem Luftschlag bringt 300 $, zählt aber nicht für die nächste Serie. Nach dem Einsatz fängt die Serie wieder bei 0 an. Der Luftschlag geht im Training und im Mehrspieler. Den Luftschlag eines Mitspielers kündigt eine eigene Meldung an, er schadet einem nicht.

## Radar

Oben links zeigt ein **Radar** die ganze Karte von oben, wie in CS: Boden hell, Wände und Container dunkel, Kisten und halbhohe Mauern grau.

- **Du** bist der gelbe Pfeil, er zeigt in deine Blickrichtung.
- **Mitspieler** sind Punkte in der Teamfarbe mit einem kurzen Strich in ihre Blickrichtung.
- **Gegner** erscheinen nur, solange du oder ein Mitspieler sie sehen (Blickfeld, freie Sicht, Rauch versteckt sie). Danach verblasst der Punkt noch 2,5 Sekunden an der Stelle, an der der Gegner zuletzt zu sehen war.
- Die **Startbereiche** sind in den Teamfarben getönt. Im **Bombenmodus** zeigt ein oranger Ring den Bombenplatz der Runde, eine gelegte Bombe blinkt rot.
- Im **Training** stehen die Klappziele als orange Punkte darauf.
- Abschalten lässt es sich in den Einstellungen (*Radar anzeigen*). Auf dem Handy ist es kleiner, Geld und Leben stehen daneben.

Gezeichnet wird es in `src/ui/radar.js` aus den Bauteilen der Karte (`arena.boxes`, `arena.props`), einmal pro Karte, darauf dann jedes Bild die Punkte. Welche Gegner zu sehen sind, prüft es zehnmal pro Sekunde mit denselben Sichtlinien wie die KI.

## Sprache

Die Oberfläche ist auf **Deutsch oder Englisch**, wählbar unter *Einstellungen → Sprache* (gespeichert unter `feuer-frei-sprache`). Ohne Wahl richtet sie sich nach dem Browser: Steht dort Deutsch an erster Stelle, ist das Spiel deutsch, sonst englisch. Das Übersetzen durch den Browser ist abgeschaltet (`translate="no"`, `<meta name="google" content="notranslate">`): Auf dem Handy übersetzte Chrome sonst die englische Seite ins Deutsche, das Spiel übersetzte zurück, und die Texte sprangen hin und her. Geschrieben ist alles auf Deutsch, das bleibt die Quelle und steht so auch im HTML, das Google liest. `src/i18n.js` tauscht beim Start und bei jeder Änderung die Texte im Dokument gegen die englischen:

- **Wörterbuch `EN`** für feste Texte, dazu **Vorlagen** für zusammengesetzte (`'{} hat dich erwischt' → '{1} got you'`, `{n}` steht für eine Zahl). Was in einem Platzhalter steht, wird selbst wieder übersetzt (Kartennamen, „E halten“).
- Texte mit ` · `, ` – `, `: ` oder `, ` zerfallen in Teile, die einzeln übersetzt werden („Hof · Nur Pistolen“ → „Yard · Pistols only“). Namen von Spielern bleiben dabei stehen.
- Geschrieben wird nur, wenn sich der Text wirklich ändert: Der MutationObserver meldet jedes Setzen erneut, auch mit demselben Wert. Vorher übersetzte sich „Pause“ in der Steuerung endlos selbst, und die Seite fror ein.
- Tastennamen (`Space`, `Ctrl`) und Geld (`$2,200`) kommen direkt in der gewählten Sprache (`keyLabel`, `geld`), Texte außerhalb des Dokuments (Teilen, Name im Eingabefeld) über `t()`.

Neue Texte im Spiel brauchen einen Eintrag in `EN` oder eine Vorlage, sonst bleiben sie auf Englisch deutsch.

## Karten

Im Hauptmenü wählt man die Karte für das Training (und für den Hintergrund des Menüs), bei **Gegen KI** und in der Lobby jeweils extra. Alle Karten sind punktsymmetrisch: Der Host startet im Westen, der Gast gespiegelt im Osten.

- **Hof:** sandiger Innenhof mit zwei Gassen, einem Haus mit Tunnel in der Mitte, einem Balkon und Containern. Eher weite Blicke.
- **Lagerhalle:** eine große Halle mit Hochregalen (drei Gänge pro Hälfte, mit Lücken zum Durchschlüpfen), einem Büro-Container in der Mitte, der die Sicht von Tor zu Tor versperrt, einem Gabelstapler und einem Laufsteg mit Treppe und Handlauf (in der Westhälfte an der Nordwand, gespiegelt im Osten; die Treppe ist so flach wie die im Hof, damit man nicht herunterrutscht). Gelaufen wird auf allen Treppen über eine unsichtbare Rampe, die Stufen selbst halten nur Kugeln und Granaten auf. Unter dem Laufsteg konnte man deshalb von unten in die Stufen hineinlaufen; jetzt steht am oberen Ende jeder Treppe eine unsichtbare Wand bis knapp unter die Rampe. Auch das Aufstehen nach dem Ducken prüft nur, woran man beim Laufen stößt (Wände, Decken, Rampen): Weil die Stufenkanten ein paar Zentimeter durch die Rampe ragen, blieb man geduckt auf der Treppe hängen und kam nur per Sprung wieder hoch. Das Dach hat drei offene Lichtbänder, durch die die Sonne fällt. Vor der Halle liegen die Höfe mit den Startpunkten, einem Lkw-Anhänger und einem Container, hinein geht es durch drei halb offene Rolltore pro Seite. Enger als der Hof, mehr Nahkampf. Die Bombenplätze liegen in der Halle nah an der Mitte (vom Startpunkt des Verteidigers aus nicht zu sehen, Wege etwa 28 m zu 33 m). In der Lagerhalle gibt es keinen Luftschlag (die Anzeige der Abschussserie ist dort ausgeblendet, auch die KI fordert keinen an).

- **Hafen:** groß und offen, gedacht für 3 gegen 3 und 4 gegen 4 (88 x 59 m statt 60 x 40 m). Eine Mole mit Wasser an beiden Längsseiten, an den Enden je ein Speicher aus Backstein hinter dem Startpunkt. In der Mitte die breite Kranbahn mit einem gelben Portalkran, an dem ein Container hängt, darunter ein Container und Kisten als Deckung, dazu je ein Sattelzug. Auf der einen Seite jeder Hälfte das Stapelfeld (Containerreihen mit Gassen und einem Container mit Treppe als Ausguck), auf der anderen der offene Umschlagplatz mit dem Bombenplatz, einem Gabelstapler und der Hafenmeisterei: auf ihr Dach führt eine Treppe, die Brüstung schützt geduckt. An beiden Kaikanten ein breiter Weg am Wasser mit Pollern; eine unsichtbare Wand hält einen an Land. Vor den Ausgängen der Startbereiche stehen Container, damit man nicht von Startbereich zu Startbereich schauen kann (die längsten Sichtlinien sind Diagonalen um 60 m). Damit man nicht von überall erwischt wird, sind einige Durchgänge zu: Eine Containerreihe teilt die Kranbahn längs (mit einer schmalen Lücke am Kran), die Kaiwege sind hinter dem Stapelfeld und an der Hafenmeisterei unterbrochen, die Bombenplätze haben eine Rück- und eine Seitenwand, und hinter den Startblöcken führt kein Weg mehr zum Kai. Die Wege zu den Bombenplätzen sind dadurch nicht länger geworden (Angreifer etwa 56 m, Verteidiger etwa 36 m). Granaten, die ins Wasser fallen, gehen unter, ohne zu zünden. Der Luftschlag geht hier wieder.

Die Karte wird beim Wechsel komplett neu aufgebaut (Wände, Kollision, Bombenplätze, Schatten). Das Wegenetz der KI rechnet sich für jede Karte einmal selbst aus (auch auf dem großen Hafen in einem Bruchteil einer Sekunde). Wege sucht A* mit leicht überschätzter Restentfernung (Faktor 1,5): auf dem Hafen im Schnitt 4-mal so schnell wie die genaue Suche (0,3 statt 1,4 ms, lange Wege quer über die Karte vorher bis 10 ms am Stück), und nach dem Glätten sind die Wege gleich lang.

## Waffen-Modi

- **Alle Waffen:** wie gewohnt.
- **Nur Pistolen:** Kaufen kann man nur Natter und Kobra, dazu Granaten und Weste. Gewehre und Maschinenpistolen sind im Kaufmenü gesperrt.
- **Scharfschützen:** Jede Runde gibt es einen Adler geschenkt, dazu nur Pistolen, Granaten und Weste.

Die KI hält sich an denselben Modus (bei „Nur Pistolen“ kauft sie öfter die Kobra).

## Skins und Aufgaben

Unter **Skins & Aufgaben** im Hauptmenü stehen links die Waffen (Natter, Kobra, Falke, Keiler, Wolf, Luchs, Adler), das Messer und die eigene Figur, daneben ihre Skins. Rechts im Bild dreht sich die Waffe (oder der Soldat) mit dem Skin, zur Vorschau auch mit gesperrten Skins (einfach mit der Maus darüberfahren). Ein Klick auf einen freigeschalteten Skin legt ihn an. Gesperrte Skins zeigen ihre Aufgabe mit Fortschrittsbalken. Der zweite Reiter **Alle Aufgaben** listet alles, offene zuerst.

| Waffe | Skins (Aufgabe) |
|---|---|
| Natter | Wüstentarn (5 Abschüsse), Kirschrot (3 Kopfschüsse), Neon (25 Abschüsse) |
| Kobra | Nachttarn (5 Abschüsse), Gold (5 Kopfschüsse), Lava (eine Partie „Nur Pistolen“ gewinnen) |
| Falke | Waldtarn (10), Ozeanblau (5 Kopfschüsse), Galaxie (40) |
| Keiler | Waldtarn (5), Kupfer (15), Lava (40) |
| Wolf | Arktis (10), Gold (10 Kopfschüsse), Regenbogen (50) |
| Luchs | Nachttarn (10), Chrom (8 Kopfschüsse), Neon (40) |
| Adler | Arktis (3), Kupfer (15), Galaxie (eine Partie „Scharfschützen“ gewinnen) |
| Messer | Gold (3 Messer-Abschüsse), Galaxie (10), Regenbogen (die KI auf „Schwer“ besiegen) |
| Spieler | Wüstentarn (3 Siege), Waldtarn (5 Bomben legen), Nachttarn (3 Bomben entschärfen), Arktis (100 Klappziele im Training), Gold (3 Luftschlag-Abschüsse), Galaxie (3 Online-Siege) |

- **Zählen:** Abschüsse und Kopfschüsse zählen im Mehrspieler (auch gegen KI-Spieler) und gegen die KI. Ein Kopfschuss ist hier ein Abschuss mit Kopftreffer. Siege zählen nicht, wenn der Gegner einfach geht.
- **Live im Spiel:** Links oben steht die nächste Aufgabe zur Waffe in der Hand mit Fortschritt (im Training die Klappziele). Tut sich etwas, leuchtet sie kurz auf. Wird ein Skin frei, erscheint oben eine Einblendung mit Regenbogen-Rahmen. Steht der Platz noch auf „Standard“, trägt man den neuen Skin sofort. Die Auswertung am Ende listet alle neuen Skins der Partie.
- **Aussehen:** Tarnmuster (Wüste, Wald, Arktis und Nacht, die letzten beiden eckig wie Digitaltarn), Metall (Gold, Chrom, Kupfer), Lack (Kirschrot, Ozeanblau) und bewegte Muster: **Regenbogen** (Farben wandern über die Waffe), **Lava** (dunkles Gestein mit glühenden, fließenden Rissen), **Neon** (schwarz mit pulsierenden türkisen und pinken Linien) und **Galaxie** (tiefblaue Nebel mit funkelnden Sternen). Alles rechnet der Shader aus der Lage im Modell aus, ohne Texturen (`src/weapons/finishes.js`). Kleine Teile wie Visier, Lauf und Gummigriffe bleiben original.
- **Spieler-Skins** färben die Uniform der eigenen Figur und die Ärmel in der Ego-Ansicht. Mit Spieler-Skin zeigt der Helm kräftig die Teamfarbe (Rot oder Blau).
- **Die anderen sehen sie:** Im Mehrspieler schickt die Lobby die eigenen Skins mit. Gegner und Mitspieler sehen Waffen, Messer und Uniform so, wie man sie trägt, auch in der Kill-Cam und beim Zuschauen.
- Gespeichert wird im Browser: der Fortschritt unter `feuer-frei-aufgaben`, die getragenen Skins in den Einstellungen. Wer das Regenbogen-Messer schon vor den Aufgaben geschenkt bekommen hatte, behält es. Mit einem Konto (nächster Abschnitt) zusätzlich auf dem Server.

## Konto

Mit Benutzername und Passwort (ohne E-Mail) lassen sich Aufgaben-Fortschritt, getragene Skins und die Notizen vom Notizblock auf jedem Gerät nutzen. Der Knopf **Konto** im Hauptmenü erscheint erst, wenn die Datenbank eingerichtet ist.

- **Anlegen und Anmelden:** Name mit 3 bis 20 Zeichen (Buchstaben auch mit Umlauten, Ziffern, Punkt, Strich, Unterstrich; Groß- und Kleinschreibung zählt nicht, grobe Namen filtert `rude()` aus `src/names.js`), Passwort mit 6 bis 72 Zeichen. Was schon auf dem Gerät ist, kommt beim Anlegen ins Konto. Ein vergessenes Passwort lässt sich nicht zurücksetzen (es gibt keine E-Mail).
- **Abgleich:** Notizen werden 2 Sekunden nach dem letzten Tippen gespeichert, Skins sofort, der Fortschritt gesammelt höchstens alle 10 Sekunden; beim Verlassen der Seite geht Ausstehendes noch mit. Geholt wird beim Start, beim Öffnen von Konto und Notizblock und wenn der Tab wieder sichtbar wird (höchstens alle 10 Sekunden). Der Server führt beide Stände zusammen: Zähler jeweils der größere Wert, geschaffte Aufgaben alle, Skins und Notizen die neuere Fassung. Eigene Änderungen zählen immer als neuer als alles, was das Gerät schon gesehen hat (auch wenn die Uhr eines anderen Geräts vorgeht), und eine Antwort vom Server überschreibt nie, was gerade getippt wurde.
- **Abmelden** nimmt Fortschritt, Skins und Notizen vom Gerät (wichtig auf geteilten Rechnern), im Konto bleiben sie. **Passwort ändern** meldet alle anderen Geräte ab. **Konto löschen** entfernt alles auf dem Server (Passwort zur Bestätigung).
- **Sicherheit:** Passwörter liegen nur als bcrypt-Hash vor (pgcrypto, Kosten 10), der Anmelde-Schlüssel des Geräts (32 Zufallsbytes) nur als SHA-256 und läuft nach 180 Tagen ohne Nutzung ab, höchstens 20 Geräte je Konto. Nach 10 falschen Passwörtern ist das Konto 10 Minuten gesperrt. Die Tabellen `ff_konto` und `ff_sitzung` sind für die Webseite gesperrt (Row Level Security ohne Regeln), alles läuft über Funktionen (`security definer`), die Eingaben prüfen (Form, höchstens 200.000 Zeichen).
- **Einrichten:** `supabase/konto.sql` einmal im SQL-Editor des Supabase-Projekts ausführen (dasselbe Projekt wie Mitbringliste und Petri Heil, nochmal ausführen schadet nicht). Testen ohne Server: `npm i --no-save @electric-sql/pglite` und `node supabase/konto.test.mjs` (Postgres im Speicher, 52 Prüfungen). Der Code im Spiel steht in `src/net/konto.js`, die Anbindung (Notizen, Skins, Bildschirm) in `src/main.js`.

## Gegen KI

**Gegen KI** im Hauptmenü: Schwierigkeit, Modus (Kampf oder Bombe), Karte, Waffen-Modus, Leben und Rundensiege wählen, dann **Los geht’s**. Die Einstellungen merkt sich das Spiel.

Die KI spielt nach denselben Regeln wie ein Freund im 1 gegen 1 (sie ist dabei der Gast im Osten):

- Sie kauft in der Kaufzeit mit ihrem eigenen Geld (Gewehr, MP oder Schrotflinte, Weste, mit viel Geld auch Helm) und verliert ihre Waffen, wenn sie am Rundenende tot ist.
- Sie läuft über ein Wegenetz um Wände und Kisten herum und nimmt jede Runde einen anderen Weg (Gassen oben und unten, Tunnel, am Gebäude vorbei).
- Sie sieht nur, was in ihrem Blickfeld und nicht hinter Wänden oder im Rauch liegt, hört rennende Schritte und Schüsse und dreht sich um, wenn sie getroffen wird. Blendgranaten blenden auch sie.
- Sie zielt mit Reaktionszeit und Zielfehler, schießt Feuerstöße, lädt nach, wechselt im Notfall zur Pistole und fordert nach 3 Abschüssen in Folge (wie man selbst) Luftschläge an. Aus Luftschlag-Kreisen und von der Bombe kurz vor der Explosion läuft sie weg.
- Im Kampf-Modus zieht sie sich nach einem Abschuss ein paar Sekunden zurück und sucht dich nicht direkt an deinem Startpunkt. Solange du Spawn-Schutz hast, schießt sie nicht (außer auf Leicht).
- Im Bombenmodus legt sie die Bombe auf deinem Platz und bewacht sie, oder sie hält ihren eigenen Platz und entschärft deine Bombe.

| Stufe | Reaktion | Zielfehler | Besonderheiten |
|---|---|---|---|
| Anfänger | 1,15 s | sehr groß | schießt zögerlich, kauft keine Gewehre, keine Luftschläge, läuft etwas langsamer |
| Leicht | 0,75 s | groß | läuft beim Schießen herum, selten Kopfschüsse |
| Mittel | 0,4 s | mittel | bleibt zum Schießen stehen, hört Schritte weiter |
| Schwer | 0,25 s | klein | dreht sich schnell, oft Kopfschüsse, duckt sich bei langen Salven |

Auf dem Handy spielt die KI in jeder Stufe schwächer, weil Zielen mit dem Finger schwerer ist: 0,3 s längere Reaktion, anderthalbfacher Zielfehler, langsameres Drehen und Schießen, halb so oft Luftschläge. Ohne gespeicherte Wahl beginnt man dort bei den Anfängern, am PC auf **Leicht** (auch die KI-Spieler in der Lobby).

**Fair bleiben** (nach einer Rückmeldung auf Reddit, 29.09.2026): Die KI trifft einen Menschen über dieselbe Körperbreite (50 cm), die man selbst bei ihr treffen muss (vorher 64 cm). Sie ahnt zwar ungefähr, wo man steckt, damit sie nicht ewig sucht, schaut aber beim Suchen und beim Bombelegen nur auf eine vermutete Stelle und nicht mehr durch Wände genau auf einen.

**Überraschung:** Wer die KI auf **Schwer** besiegt, bekommt die **Regenbogen-Klinge** fürs Messer (siehe Skins und Aufgaben).

Gegen die KI hält die Pause das Spiel wirklich an. Technisch hängt die KI wie ein zweiter Spieler am Duell: Sie schickt und bekommt dieselben Nachrichten wie ein Gast, nur ohne Netz (`src/ai/`).

## Auf dem Handy

Auf Handy und Tablet schaltet sich die Touch-Steuerung von selbst ein (in den Einstellungen: Automatisch, An oder Aus; zum Testen am PC `?touch=1` an die Adresse hängen). Das Spiel läuft im Querformat, im Hochformat erscheint ein Hinweis zum Drehen.

- **Linker Daumen:** Stick zum Laufen. Er erscheint dort, wo man hintippt. Ganz nach vorne über den Rand schieben = Sprinten, halb gedrückt = langsam und leise.
- **Rechter Daumen:** wischen zum Umsehen (Empfindlichkeit in den Einstellungen).
- **Roter Knopf:** schießen. Beim Halten kann man weiter wischen und nachzielen.
- **Kreis:** Zielen an und aus. Beim Messer ist das der Stich, bei Granaten der kurze Wurf.
- **Pfeile:** springen und ducken (Ducken schaltet um). Der runde Pfeil lädt nach.
- **Waffenleiste unten:** Waffe antippen. **Kaufen** (oben links) in der Kaufzeit, **Sprechblase** für Schnellnachrichten, oben rechts Statistik und Pause.
- **Flugzeug:** Luftschlag. Der Ring füllt sich mit der Abschussserie, der rote Knopf bestätigt das Ziel.
- **Bombe legen / Entschärfen:** Der Knopf erscheint auf dem Bombenplatz bzw. an der Bombe und wird gehalten.

Beim Start geht das Spiel in den Vollbildmodus und sperrt das Querformat, soweit der Browser das erlaubt (Android ja, iPhone nicht). Wechselt man die App, pausiert das Spiel.

Technik:

- **Verbindung:** direkt von Rechner zu Rechner per WebRTC ([Trystero](https://github.com/dmotz/trystero), Vermittlung über öffentliche Nostr-Server). Parallel läuft ein Kanal über **Supabase Realtime**. Klappt die Direktverbindung nicht, geht alles über den Server (im Team-Spiel pro Mitspieler: jeder bekommt jede Nachricht genau einmal, direkt oder über den Server). Oben links im Spiel steht, welcher Weg gerade genutzt wird, dazu der Ping.
- **Treffer:** Der Schütze prüft den Treffer und meldet ihn, der Getroffene zieht sich die Lebenspunkte selbst ab (Weste und Helm zählen dabei). Granaten rechnet jeder für sich aus. Im Team-Spiel geht jede Treffermeldung an einen bestimmten Spieler (`to`), Treffer von Mitspielern werden ignoriert.
- **Host:** bestimmt Rundenstart und Rundenende, Leben (im Team-Spiel pro Spieler) und Rundensiege, prüft Legen und Entschärfen und rechnet die KI-Spieler. Ihre Zustände schickt er gesammelt an die anderen.
- **Spieler-Kennung:** Jeder Tab hat eine feste Kennung (`sessionStorage`), die beim Neuladen bleibt, während die Kennung im Netz wechselt. Daran erkennt der Host einen zurückkehrenden Spieler.
- **Bewegung der anderen:** direkt 30, über den Server 12 Zustände pro Sekunde (im Team-Spiel ab 5 Menschen 8, ab 7 Menschen 6), in gleichmäßigen Abständen. Dazwischen wird mit etwa 0,1 s Verzögerung weich übergeblendet. Jeder Zustand trägt als Zeitstempel den Zeitpunkt des Simulationsschritts, aus dem er stammt (`game.simNow`), nicht die Uhrzeit beim Senden: Die lag je nach Bildrate bis zu einen Schritt (8 ms) daneben, und bei mehreren Schritten in einem Bild bekamen zwei Zustände denselben Stempel (der zweite ging verloren). Gegner liefen dadurch beim anderen leicht ungleichmäßig; gemessen schwankte ihre Geschwindigkeit von Bild zu Bild bei 9 von 10 Bildern um bis zu 23 %, jetzt um bis zu 7,5 %. Übergeblendet wird zur Zeit des Bilds (Zeitstempel von `requestAnimationFrame`), nicht zur Uhrzeit mitten in der Berechnung.
- **Kill-Cam:** Jedes Spiel merkt sich die letzten 6 Sekunden: die Zustände des Gegners samt seinen Schüssen und die eigenen, so wie sie an ihn gingen. Die eigene Figur läuft in der Wiederholung um Ping plus seinen Puffer verzögert, also so, wie er sie auf seinem Bildschirm gesehen hat. Dafür muss nichts Zusätzliches übers Netz.
- **Wiedereinstieg:** Jeder Tab merkt sich Lobby, Rolle und den eigenen Stand im `sessionStorage` (übersteht das Neuladen, nicht das Schließen des Tabs). Auch beim Host steht der Lobby-Code in der Adresse. Beim Verlassen der Seite meldet sich der Tab ab, zusätzlich per `fetch` mit `keepalive` über die REST-Schnittstelle von Supabase, damit die Abmeldung auch bei schnellem Neuladen ankommt. Wer zurückkommt, bekommt vom anderen den Stand der Partie (Runde, Phase, Zeit, Leben, Siege).
- **Offene Lobbys:** Der Host einer öffentlichen Lobby meldet sie in einem gemeinsamen Kanal auf Supabase Realtime an (Presence, Kanal `ff-offen-v` plus Protokollversion) und trägt Änderungen nach (Spielerzahl, Karte, Modus). Das Mehrspieler-Menü hört dort mit, solange es offen ist. Bricht die Verbindung des Hosts ab, streicht der Server den Eintrag von selbst. Einträge anderer werden geprüft (Code, Karte, Modus, Zahlen), Namen laufen durch den Filter.
- **Namen:** `src/names.js` räumt jeden Namen auf, bevor er angezeigt wird (Steuer- und unsichtbare Zeichen raus, höchstens 16 Zeichen) und ersetzt grobe Wörter durch „Spieler NN“ (die Zahl hängt am Namen, alle sehen dieselbe). Vor dem Vergleich werden Ziffern und Zeichen zurückgebaut (`1` → i oder l, `3` → e, `@` → a …), ebenso gleich aussehende kyrillische und griechische Buchstaben. Lange Wörter zählen auch mitten im Namen, kurze nur als ganzes Wort (sonst träfe es „Marsch“, „Cocktail“ oder „Kanal“).
- **Zuschauer:** Der Host schickt ihnen den Stand der Partie (`spec`, wie beim Wiedereinstieg) und reicht alle Zustände weiter (`fw`, mit der Kennung des Spielers); von den anderen Spielern bekommen sie selbst nichts. Im Team-Spiel stehen sie dazu in der Gruppe des Hosts, zählen aber nicht für den langsamsten Weg (`net.watchers`). Ein 1 gegen 1 schickt der Host im Format des Team-Spiels (Rot = Host, Blau = Gast, feste Kennungen aus der Lobby). Beim Zuschauer läuft ein Team-Spiel ohne eigenen Spieler (`spectate`), mit größerem Puffer gegen Ruckeln (220 ms), weil alles über zwei Wege kommt.
- **Zurück in die Lobby:** Die Partie gibt ihre Verbindung ohne Tschüss an die Lobby zurück (`Game.leaveToLobby`, `Lobby.returnFromMatch`). Der Host schickt den Stand der Lobby alle 2 Sekunden an alle im Raum; wer noch in der Auswertung steht, folgt damit von selbst.
- Beide Browser brauchen dieselbe Protokollversion (`PROTOCOL` in `src/net/net.js`). Nach einem Update also beide die Seite neu laden.
- Zum Testen lässt sich ein Weg erzwingen: `?netz=server` oder `?netz=direkt` an die Adresse hängen.

## Steuerung

Die Tabelle zeigt die Standardbelegung. **Eigene Tastenbelegung:** Unter *Steuerung* (im Hauptmenü und in der Pause) auf eine Taste klicken und die neue drücken. Das geht auch mit den Maustasten 3 bis 5 (Mitte und Seitentasten). Jede Aktion kann zwei Tasten haben (mit **+** kommt die zweite dazu). `Entf` löscht eine Belegung, `Esc` bricht ab. Ist eine Taste schon woanders belegt, wird sie dort frei (mit Hinweis). **Standard wiederherstellen** setzt alles zurück. Fest sind nur Schießen (Linksklick), Zielen (Rechtsklick), Waffenwechsel (Mausrad) und Pause (`Esc`). Die Belegung wird im Browser gespeichert, und alle Hinweise im Spiel (Kaufmenü, Bombe, Luftschlag, Schnellnachrichten) zeigen die eigenen Tasten.

**Mausempfindlichkeit** (unter *Einstellungen*): zählt wie in CS (0,022° pro Mausschritt mal Wert) und reicht von 0,2 bis 20. Der Regler ist logarithmisch: In der Mitte steht 2, nach rechts wird jeder Schritt größer. So lässt sich der übliche Bereich fein einstellen, und für Touchpads oder Mäuse mit wenig DPI reicht es trotzdem. Das Spiel liest die Maus ohne die Beschleunigung von Windows (Pointer Lock mit `unadjustedMovement`).

| Taste | Aktion |
|---|---|
| `W` `A` `S` `D` | Laufen |
| Maus | Umsehen |
| Linksklick | Schießen, Messerhieb, Granate weit werfen |
| Rechtsklick halten | Zielen über Kimme und Korn bzw. Rotpunkt (langsamer, genauer, leichter Zoom), Zielfernrohr (eine Stufe); außerdem Messerstich, Granate kurz werfen |
| Leertaste | Springen |
| `Strg` oder `C` | Ducken |
| `Shift` halten | Sprinten (nur vorwärts, siehe unten) |
| `Alt` (links) halten | Schleichen (lautlos und genauer) |
| `R` | Nachladen |
| `1` – `5` | Hauptwaffe, Pistole, Messer, Extra 1, Extra 2 |
| `Q`, Mausrad | Letzte Waffe, Waffe wechseln |
| `B` | Kaufmenü (im Spawn, in der Kaufzeit) |
| `F` | Waffe begutachten |
| `Tab` | Statistik |
| `T`, dann `1` – `6` | Schnellnachricht (im Mehrspieler) |
| `E` halten | Bombe legen bzw. entschärfen (Bombenmodus) |
| `X` | Luftschlag, nach 3 Abschüssen hintereinander |
| `Esc` | Pause; in den Menüs zurück (wie der Zurück-Knopf, in der Auswertung zum Hauptmenü); schließt auch Kaufmenü und Schnellnachrichten |
| `^` (änderbar) | Notizblock: sofort ein weißes Notizblatt, Spiel pausiert, Ton aus, der Tab heißt wie die Notiz und die Adresse zeigt `…/notizen` statt des Spiels (die Domain selbst lässt sich nicht ändern); nochmal drücken zum Zurückschalten |

**Sprinten** geht nur vorwärts und nicht beim Ducken, Schleichen, Schießen, Zielen, Nachladen oder Ausholen zum Granatenwurf. Wie schnell man ist, hängt von der Waffe in der Hand ab (Meter pro Sekunde, Laufen / Sprinten):

| Waffe in der Hand | Laufen | Sprinten |
|---|---|---|
| Messer | 6,2 | 8,8 |
| Natter, Granaten | 6,0 | 8,0 |
| Kobra | 5,8 | 7,8 |
| Falke | 5,8 | 7,6 |
| Keiler, Wolf, Luchs | 5,5 | 7,1 |
| Adler | 5,0 | 6,3 |

Nach dem Sprinten braucht die Waffe einen Moment, bis sie schießt (Natter 0,12 s, Adler 0,3 s, Messer sofort). Wer beim Sprinten klickt, hört auf zu sprinten und schießt, sobald die Waffe bereit ist. Zum Weitersprinten `Shift` neu drücken.

Weil `Strg` Ducken ist und das Mausrad die Waffe wechselt, fängt das Spiel `Strg` + Mausrad (und `Strg` + Plus/Minus/0) ab, solange man spielt: sonst würde der Browser die ganze Seite zoomen. Ist die Seite schon verkleinert, stellt `Strg` + `0` sie zurück.

Das Spiel geht beim Start in den Vollbildmodus. `Esc` verlässt ihn (das macht der Browser immer, zusammen mit der Maus). Mit **Weiter** oder einem Klick ins Spiel kommt das Vollbild zurück, in der Pause gibt es dafür außerdem den Knopf **Vollbild**. So fängt Chrome auch `Strg+W` ab, sonst würde Ducken plus Vorwärtslaufen den Tab schließen. Abschalten lässt sich das in den Einstellungen.

## Waffen

| Waffe | Art | Preis | Besonderheit |
|---|---|---|---|
| Natter | Pistole | 200 $ | Startwaffe, 30 Schaden (Kopf 72); moderne Polymerpistole mit Bronzelauf und Visier mit drei weißen Punkten |
| Kobra | Schwere Pistole | 700 $ | Kopftreffer tödlich |
| Falke | Maschinenpistole | 1.250 $ | Genau auch im Laufen; Geisterring-Visier (dünner Ring mit großer Öffnung), 1,3-facher Zoom |
| Keiler | Pump-Schrotflinte | 1.050 $ | 9 Schrotkugeln, auf kurze Distanz ein Treffer, lädt Patrone für Patrone; erhöhte Laufschiene mit Messingkorn, im Anschlag liegt das Gehäuse knapp 3 cm unter der Visierlinie |
| Wolf | Sturmgewehr | 2.700 $ | Stark, festes Rückstoßmuster; Kimme und Korn 1,6 cm höher als beim Vorbild, schmaler Kimmenfuß: im Anschlag bleibt der Gehäusedeckel unten aus dem Bild |
| Luchs | Sturmgewehr mit Rotpunkt | 3.100 $ | Rotpunktvisier mit dünnwandigem Rohr (14 cm vor dem Auge), ruhigerer Rückstoß |
| Adler | Scharfschützengewehr | 4.500 $ | Ein Kopftreffer reicht immer, auch mit Helm. Am Körper 88 Schaden (wie die Scout in CS): Es bleiben je nach Entfernung und Weste 12 bis 22 Lebenspunkte, ein zweiter Treffer oder ein Pistolenschuss erledigt den Rest. Zielfernrohr nur beim Halten |
| Messer | Nahkampf | frei | Karambit oder Butterfly (siehe unten). Hieb (links, 60) und Stich (rechts, 90): zwei Treffer reichen immer, auch gegen eine Weste |

Dazu Schutzweste, Weste mit Helm und drei Granaten (Splitter, Blend, Rauch) für die zwei Extra-Slots. Die Splittergranate macht direkt daneben 130 Schaden (1 m: 105, 2 m: 82, 3 m: 60, 4 m: 41), eine Weste hält die Hälfte ab.

Die Weste hat **50 Punkte** (früher 100, die hat in einem Leben nie jemand aufgebraucht). Jeder Treffer am Körper kostet sie die Hälfte des Schadens, den sie abhält. Bis zum Tod reicht sie trotzdem fast immer: Die Zahl der Treffer bis zum Tod ist mit 50 Punkten dieselbe wie mit 100. Schneller leer ist sie nur bei vielen Treffern hintereinander, etwa im Luftschlag, oder wenn man mit einer angeschlagenen Weste in die nächste Runde geht (nachkaufen füllt sie wieder auf 50).

**Aus der Hüfte und im Anschlag:** Aus der Hüfte (ohne rechte Maustaste) schlagen alle Schusswaffen 1,6-mal so stark aus und streuen mehr, die Ansicht wackelt stärker (`HIP_RECOIL` in `src/config.js`). Im Anschlag bleibt der Rückstoß wie gehabt. Beim Scharfschützengewehr baut sich der Rückstoß schon während des Repetierens ab, so steht der Blick still, wenn man wieder im Zielfernrohr ist (vorher zog er ihn dann noch nach unten). Mit einer Granate in der Hand zeigt die Bildmitte statt des Fadenkreuzes nur einen Punkt, der die Wurfrichtung markiert.

**Munition** (Magazin + Ersatz, pro Leben): Die Hauptwaffen haben nur zwei Ersatzmagazine, wer viel schießt, muss zwischendurch zur Pistole greifen. Nach dem Wiedereinstieg und zu Beginn jeder Runde ist alles wieder voll.

| Waffe | Munition |
|---|---|
| Falke, Wolf, Luchs | 30 + 60 |
| Keiler | 8 + 16 |
| Adler | 5 + 15 |
| Natter | 20 + 120 |
| Kobra | 7 + 35 |

Beim Nachladen einer Waffe mit Magazin kippt die Waffe zur Seite, das leere Magazin fällt heraus und die linke Hand steckt ein neues ein. Die Keiler lädt weiter Patrone für Patrone.

**Messer:** Im Mehrspieler hat Team Rot (im 1 gegen 1 der Host) ein **Karambit**, Team Blau (Gast, auch die KI) ein **Butterflymesser**. Im Training entscheidet der Zufall. Beim Ziehen und beim Begutachten (`F`) dreht sich das Karambit einmal um den Zeigefinger, das Butterfly klappt auf: Klinge und zweite Griffhälfte schwingen über die Faust, dann klappt die Griffhälfte unten herum zurück. Ein Hieb bricht das sofort ab. Beide Messer haben dieselben Werte. In der Waffenleiste heißt es weiter „Messer“, welches es ist, steht über der Munitionsanzeige und im Kill-Feed. Wer das Geschenk hat (Sieg gegen die KI auf Schwer), trägt eine Regenbogen-Klinge.

**Kill-Feed** oben rechts: Schütze, Waffen-Symbol (Kopfschüsse mit eigenem Zeichen), Opfer. Im Mehrspieler stehen die Namen in Teamfarben (Rot und Blau), eigene Abschüsse und der eigene Tod sind gelb umrandet. Wer durch die Bombe stirbt, wird dem angreifenden Team zugeschrieben.

Trefferzonen: Kopf (Faktor je Waffe, meist 2,4), Körper und Arme (1), Beine (0,75, dort schützt die Weste nicht). Die Trefferzonen sind etwas größer als die sichtbaren Figuren und Klappziele, damit man leichter trifft.

## Freies Training

- Keine Runden und keine Zeitgrenze: Man übt, so lange man will, und beendet es über die Pause (`Esc` → *Training beenden*).
- Geld ohne Ende: Alles ist gratis und lässt sich jederzeit und überall kaufen (`B`), auch mitten auf der Karte. Zurückgeben geht mit Rechtsklick.
- Die Ersatzmunition geht nicht aus, nachladen muss man trotzdem.
- 10 Klappziele an zufälligen Stellen der Karte, 3 davon fahren hin und her. Jedes Ziel misst beim Aufstellen, wie viel Platz es hat: Bewegliche Ziele fahren nie in Wände, Kisten oder über Kanten, und wo ein umgefallenes Ziel hinten anstoßen würde, rückt es ein Stück nach vorn. Jedes Ziel klappt etwa 2 Sekunden nach dem Umfallen wieder hoch. Oben steht, wie viele man schon umgelegt hat, `Tab` zeigt dazu Zeit, Treffergenauigkeit und Kopfschüsse.
- 100 Lebenspunkte je Ziel, Kopftreffer zählen 2,4-fach (Sturmgewehr: 25 Körper, 60 Kopf).
- Wer sich mit der eigenen Granate oder dem eigenen Luftschlag ausschaltet, ist nach 2 Sekunden wieder am Startpunkt und behält seine Waffen.

Alle Werte (Waffen, Rückstoßmuster, Streuung, Preise, Rundenzeiten, Training) stehen in `src/config.js`.

## Dateien

| Ordner / Datei | Zweck |
|---|---|
| `src/config.js` | Alle Spielwerte an einem Ort |
| `src/game/` | Spielkern, Runden und Geld, Klappziele, 1 gegen 1 mit Bombenmodus (`duel.js`), Team-Spiel (`teams.js`, Teams und Startplätze in `sides.js`), die anderen Spieler im eigenen Spiel (`remote.js`), Kill-Cam und Zuschauen (`killcam.js`), der Luftschlag (`airstrike.js`) sowie Skins und Aufgaben (`cosmetics.js`) |
| `src/net/` | Verbindung zwischen zwei Browsern (Trystero und Supabase Realtime), Tab-Speicher für den Wiedereinstieg, Liste der offenen Lobbys (`lobbylist.js`) |
| `src/names.js` | Namensfilter: grobe Wörter werden zu „Spieler NN“ |
| `src/ai/` | KI-Spieler: Wegenetz (`nav.js`), Verhalten (`bot.js`), die Verbindung zum Duell ohne Netz (`botnet.js`) und die KI-Spieler im Team-Spiel beim Host (`squad.js`) |
| `src/player/` | Bewegung wie in der Source-Engine (Beschleunigung, Reibung, Luftsteuerung, Ducken) |
| `src/weapons/` | Inventar mit 5 Slots, Schießen, Rückstoß, Waffe in der Hand, Granaten, Oberflächen der Skins (`finishes.js`) |
| `src/world/` | Karten Hof und Lagerhalle mit Auf- und Abbau (`map.js`), der Hafen (`hafen.js`), Bauteile für mehrere Karten wie Seecontainer und Gabelstapler (`parts.js`), Himmel und Licht, Bombenplätze und Bombe (`bombsites.js`) |
| `src/effects/` | Einschusslöcher, Funken, Staub, Leuchtspuren, Explosionen |
| `src/engine/` | Grafik, Physik, Steuerung, Ton (alle Geräusche werden per WebAudio erzeugt) |
| `src/ui/` | HUD, Radar (`radar.js`), Kaufmenü, Lobby, Touch-Steuerung (`touch.js`) und die Waffenkammer „Skins & Aufgaben“ (`locker.js`) |
| `blender/` | Python-Skripte, die alle eigenen 3D-Modelle in Blender bauen |
| `scripts/` | Laden der Poly-Haven-Dateien und Aufruf von Blender |
| `public/assets/` | Fertige Modelle, Texturen und Himmel, die das Spiel lädt |

## 3D-Modelle und Texturen

- **Eigene Modelle** (Waffen mit Händen, Granaten, Kisten, Klappziel, Soldat für das 1 gegen 1) entstehen per Skript in Blender:

  ```
  npm run models
  npm run models -- --preview
  npm run models -- wolf natter
  npm run models -- texturen
  ```

  Mit `--preview` legt Blender Vorschaubilder in `blender/preview/` ab (für die Pistolen zusätzlich eine größere Ansicht von links hinten, so wie man sie im Spiel sieht). Blender wird unter `C:\Program Files\Blender Foundation` gesucht, sonst über die Umgebungsvariable `BLENDER`.

  Die Oberflächen von Natter, Karambit und Butterfly (geschliffener Stahl, mattierter Kunststoff, Griffnarbung, G10) rechnet das Skript selbst als kleine, kachelbare Texturen aus (`tex_brushed`, `tex_grain`, `tex_stipple` in `blender/lib.py`), es braucht dafür keine Fremddateien. Schrift wie die Gravur „NATTER 9x19“ entsteht mit `text_mesh`. Teile, deren Name mit `Hand`, `Wrist` oder `Sleeve` beginnt, gelten als Arm und fehlen bei der Figur des Gegners.

  **Gemeinsame Oberflächen aller Waffen** (seit 02.10.2026): Sechs kachelbare Texturen rechnet `npm run models -- texturen` aus (`weapon_surfaces` in `blender/lib.py`) und legt sie unter `public/assets/textures/waffen/` ab, zusammen rund 350 KB: *Abnutzung* (Waffenstahl mit feinem Korn, Fingerabdrücken, Ölflecken und Kratzern), *gebürstet* (Stahl), *Korn* (Kunststoff, Gummi, Handschuh), *Holz* (Maserung mit Spätholz und Poren), *Narbung* (Schaft des Adler) und *Stoff* (Ärmel). Jede hat drei Bilder: `col` und `arm` enthalten nur Faktoren knapp unter 1 auf Farbe und Rauheit, Grundfarbe, Rauheit und Metall bleiben im Material aus Blender. So reicht ein Satz für alle Waffen (einmal geladen, einmal im Grafikspeicher), und eine Waffe in fremder Hand, die ohne Texturen zu einem Mesh zusammengefasst wird (`flattenParts`), sieht fast gleich aus und braucht nicht mehr Zeichenaufrufe. Welches Material welche Oberfläche bekommt, steht in `src/weapons/surfaces.js`. Dazu kommen **abgegriffene Kanten**: Der Shader erkennt gerundete Kanten an ihrer Krümmung (Änderung der Flächenrichtung je Meter, gilt auf jede Entfernung gleich) und lässt dort fleckig blanken Stahl, helleres Holz oder abgewetzten Kunststoff durchscheinen (Flecken aus dem roten Kanal von `arm`). Dafür bekommen alle Teile der Waffen Textur-Koordinaten (Box-Projektion, 10 cm pro Kachel, längs zur Waffe), die Modelldateien sind dadurch zusammen etwa 0,9 MB größer. Skins ersetzen Farbe und Rauheit, das Relief bleibt.

  Die Waffe in der Hand wird mit einer entsättigten Kopie des Himmels beleuchtet, damit schwarze Waffen schwarz und nicht dunkelblau wirken.

- **Texturen, Himmel und Requisiten** kommen von [Poly Haven](https://polyhaven.com) (CC0, frei nutzbar). `npm run assets` lädt alles herunter, danach verkleinert `npm run textures` die Texturen (JPEG-Qualität 85, gleiche Auflösung, rund ein Viertel der Dateigröße). Die Requisiten landen als Quelle in `assets-src/` (nicht im Repo). `npm run models` macht daraus die optimierte `public/assets/models/props.glb` (etwa 1.000 Dreiecke und 512er-Texturen pro Requisit).

## Grafik und Leistung

Das Spiel startet auf **Niedrig**, damit es auch auf schwachen Laptops (Intel-Grafik) flüssig läuft. In den Einstellungen gibt es:

| Stufe | Was sie macht |
|---|---|
| Niedrig | ohne Kantenglättung und Umgebungsverdeckung, Schatten der Arena werden nur einmal berechnet (Bewegliches wirft keinen Schatten), wenig Texturfilterung |
| Mittel | Schatten in jedem Bild, 4-fache Kantenglättung |
| Hoch | dazu Umgebungsverdeckung (weiche Kontaktschatten), schärfere Schatten, höhere Auflösung auf hochauflösenden Bildschirmen |

Dazu die **Auflösung** (Automatisch, 100 %, 85 %, 70 %, 50 %): weniger Pixel sind der größte Hebel für schwache Grafikchips, das Bild wird dafür etwas unschärfer. Voreingestellt ist **Automatisch**: Das Spiel misst beim Spielen die Bilder pro Sekunde und zeichnet unter 40 eine Stufe kleiner (100 → 85 → 70 → 50 %). Bringt eine Stufe nichts (dann bremst der Prozessor, nicht die Grafik, oder der Browser zeigt im Stromsparmodus ohnehin nur 30 Bilder), geht es eine zurück und bleibt dabei. Wieder hoch geht es erst beim nächsten Laden der Seite. Wer vorher die Voreinstellung 100 % hatte, ist einmalig auf Automatisch umgestellt; eine eigene Wahl bleibt.

**Shader vorab übersetzen:** Beim Laden und nach jedem Kartenwechsel übersetzt das Spiel alle Shader auf einmal (`precompile` in `src/game/game.js`): Arena, Figuren mit allen Waffen, Mündungsfeuer, Funken, Granaten, Rauch und Jet. Sonst übersetzt sie der Browser erst, wenn etwas zum ersten Mal zu sehen ist, und das Bild hängt kurz (auf einer RTX 4060 13 bis 17 ms, auf schwachen Laptops ein Vielfaches). Übersetzt wird für den Zwischenpuffer, in den das Spiel zeichnet: Die Fassung für die direkte Ausgabe auf den Bildschirm ist eine andere und wurde bis zum 30.09.2026 umsonst übersetzt (gut 20 Shader), die richtigen kamen erst mitten im Spiel dazu. Nach einem Kartenwechsel läuft das Übersetzen neben dem Spiel her; bis es fertig ist (meist Bruchteile einer Sekunde, höchstens 3 s), bleibt das letzte Bild stehen, statt dass alles stillsteht.

**Mehr als 60 Bilder pro Sekunde** gibt es im Browser nur auf einem Bildschirm, der mehr kann: Der Browser zeichnet höchstens so oft, wie der Bildschirm das Bild erneuert (60, 144, 180 Hz …). Welche Bildrate der Browser liefert, zeigt z. B. https://www.testufo.com.

Die Waffe in der Hand federt bei Mausbewegungen leicht nach. Diese Feder wird in Schritten von höchstens 1/120 Sekunde gerechnet, damit sie auch bei wenigen Bildern pro Sekunde ruhig bleibt (vorher schaukelte sie sich unter 30 Bildern pro Sekunde auf: die Waffe sprang auf und ab und verschwand dann ganz).

Damit das Spiel sparsam bleibt: Teile, die sich gemeinsam bewegen und dasselbe Material haben, werden beim Laden zu einem Mesh zusammengefasst (`src/engine/merge.js`). Einschusslöcher und Rauchschwaden sind je ein Instanz-Mesh, also ein Zeichenaufruf statt vieler.

**Figuren der anderen Spieler** sind besonders sparsam gebaut, damit auch 4 gegen 4 flüssig läuft:

- Der Körper ist ein biegsames Modell (`SkinnedMesh`, `skinParts` in `merge.js`): Jedes Teil hängt fest an seinem Gelenk, die Gelenke sind die Knochen. Uniform und Helm haben eigene Materialien (Teamfarbe, Skins), alle anderen Teile teilen sich eins, das Farbe, Rauheit und Metall pro Ecke mitbringt. So braucht ein Körper 3 Zeichenaufrufe statt gut 20. Welcher Arm zur Waffe passt, entscheidet die Größe seines Gelenks (0 = unsichtbar).
- Die Waffe in fremder Hand ist ganz zusammengefasst (`flattenParts`): nur Teile mit Skin oder Textur bleiben für sich, meist 2 bis 4 Zeichenaufrufe statt bis zu 15. In der Hand hängt nur die Waffe, die der Spieler gerade trägt, die anderen sind nicht im Szenengraph.
- Die Geometrie teilen sich alle Figuren. Gemessen im 4 gegen 4 auf dem Hof: 87 statt 245 Zeichenaufrufe pro Bild, 312 statt 1.688 Knoten im Szenengraph, das Zeichnen selbst dauert etwa halb so lang.

Die Leinwand ist auf geringe Verzögerung eingestellt (`desynchronized`). Dabei kann der Browser Zwischenstände anzeigen, deshalb wird jedes Bild erst im Hintergrund fertig zusammengesetzt und dann in einem Zug ausgegeben. Direkt in mehreren Durchgängen ins sichtbare Bild zu zeichnen führt zu Flackern.

## Datenschutz und Nutzungsbedingungen

Seit dem 03.10.2026 gibt es [Datenschutzerklärung](public/datenschutz.html) und [Nutzungsbedingungen](public/nutzungsbedingungen.html), beide deutsch und englisch auf einer Seite (öffnen in der Sprache des Spiels, `#de`/`#en` erzwingt eine). Verlinkt sind sie im Hauptmenü unter dem Infotext und beim Anlegen eines Kontos. Verantwortlich ist Finn Marinov, Kontakt per E-Mail (siehe Seite).

Die Erklärung beschreibt alle Datenflüsse. Ändert sich daran etwas, muss sie mit:
- **GitHub Pages:** speichert die IP-Adresse der Besucher zur Sicherheit.
- **Browser-Speicher:** Einstellungen, Fortschritt, Notizen, Name, Konto-Schlüssel; keine Cookies.
- **Zähler:** nur Datum, Spiel und Herkunfts-Domain.
- **Mehrspieler:** Direktverbindung über Trystero. Die Mitspieler sehen die IP-Adresse; die Verbindungsangebote laufen AES-GCM-verschlüsselt über öffentliche Nostr-Relais; die STUN-Server von Google und Cloudflare sehen die IP-Adresse. Rückfall und Lobby-Liste laufen über Supabase Realtime und werden nur weitergeleitet.
- **Konto:** liegt bei Supabase Pte. Ltd., mit Auftragsverarbeitung und Standardvertragsklauseln.

**Schrift:** Rajdhani kommt nicht mehr von Google Fonts, sondern aus dem Paket `@fontsource/rajdhani`. Vite bündelt die Dateien mit, die Lizenz (SIL Open Font License) liegt unter `public/lizenzen/`. Vorher ging beim Laden die IP-Adresse jedes Besuchers an Google.

## Zähler für Seitenaufrufe

`src/net/zaehler.js` meldet bei jedem Laden der Seite einen Aufruf an die eigene Supabase-Datenbank. Gespeichert werden nur **Datum und Herkunft** (der Hostname der verweisenden Seite, z. B. `itch.io`) – keine IP, kein Cookie, nichts Personenbezogenes. Auf `localhost` zählt es nicht mit.

Einmalig in Supabase anzulegen (SQL-Editor):

```sql
create table if not exists aufrufe (
  tag date not null default current_date,
  quelle text not null default 'direkt',
  anzahl integer not null default 0,
  primary key (tag, quelle)
);

alter table aufrufe enable row level security;

create or replace function seite_aufgerufen(p_quelle text default 'direkt')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into aufrufe (tag, quelle, anzahl)
  values (current_date, coalesce(nullif(p_quelle, ''), 'direkt'), 1)
  on conflict (tag, quelle) do update set anzahl = aufrufe.anzahl + 1;
end;
$$;

grant execute on function seite_aufgerufen(text) to anon;
```

Auswerten im SQL-Editor:

```sql
select tag, sum(anzahl) as aufrufe from aufrufe group by tag order by tag desc;
select quelle, sum(anzahl) as aufrufe from aufrufe group by quelle order by aufrufe desc;
```

## Veröffentlichen (GitHub Pages)

Repository: `Feuer_Frei` von `finnmarinov-lgtm`, spielbar unter https://finnmarinov-lgtm.github.io/Feuer_Frei/

Zweiter Ort: die itch.io-Seite https://fm323.itch.io/feuer-frei mit demselben Build zum Mitspielen. Sie wird nicht automatisch aktualisiert – nach größeren Änderungen dort ein neues Zip aus `dist` hochladen. Wichtig: Das Zip nicht mit `Compress-Archive` packen (schreibt Backslashes in die Pfade, itch entpackt es dann falsch und das Spiel bleibt im Ladebildschirm hängen), sondern zum Beispiel mit Python `zipfile` und Schrägstrichen.

Einladungslinks für den Mehrspieler-Modus funktionieren nur auf GitHub Pages zuverlässig; im itch-Fenster läuft das Spiel in einem Rahmen, dort geht der Lobby-Code zum Eintippen.

Jeder Push auf `main` baut das Spiel automatisch neu und veröffentlicht es (`.github/workflows/pages.yml`). Den Stand sieht man im Repo unter *Actions*.

Lokal bauen und ansehen:

```
npm run build
npm run preview
```

Der Ordner `dist/` enthält die fertige Seite. Die Pfade sind relativ, sie läuft also auch in einem Unterordner.
