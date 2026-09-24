# Feuer Frei

3D-Shooter im Browser im Stil von CS: Hauptwaffe, Pistole, Messer und zwei Extra-Slots für Granaten, dazu ein Kaufmenü mit Budget zu Beginn jeder Runde. Gebaut mit Three.js, Physik mit Rapier.

Zwei Spielarten:

- **1 gegen 1** über eine Lobby: einer erstellt sie und schickt Code oder Link, der Freund klickt drauf und ist drin. Kein Konto, keine Installation. Danach läuft alles von selbst: Countdown, Startpunkte, Runden, Ergebnis, Nochmal-Knopf.
- **Training**: 5 Runden gegen Klappziele aus Stahl, danach eine Auswertung.

## Starten

```
npm install
npm run dev
```

Danach `http://localhost:5173` öffnen und auf **1 gegen 1** oder **Training** klicken.

## 1 gegen 1

1. **1 gegen 1 → Lobby erstellen.** Es erscheinen ein Code (z. B. `K7P2QX`) und ein Link. Den Link mit **Link kopieren** oder **Teilen** an den Freund schicken.
2. Der Freund öffnet den Link und ist sofort in der Lobby. Alternativ: **1 gegen 1 → Beitreten** und den Code eintippen.
3. Wer die Lobby erstellt hat (Host), stellt ein: **1 oder 3 Leben pro Runde** und **Sieg bei 2, 3 oder 5 Rundensiegen**.
4. Sind beide da, startet nach 5 Sekunden das Spiel. Einmal ins Bild klicken, damit die Maus gefangen wird.

Regeln:

- Host startet im Westen, Gast im Osten. Jeder hat seine eigene Kaufzone am Startpunkt.
- Pro Runde hat jeder so viele Leben wie eingestellt. Wer stirbt und noch Leben hat, ist nach 3 Sekunden am eigenen Startpunkt zurück (mit voller Gesundheit und eigener Ausrüstung).
- **Spawn-Schutz:** 2 Sekunden nach dem Rundenstart und nach jedem Wiedereinstieg zählen keine Treffer (auch keine Granaten). Der Schutz endet sofort, wenn man selbst schießt, sticht oder wirft. Den eigenen Schutz zeigt ein Hinweis unten in der Mitte, ein geschützter Gegner schimmert bläulich und Treffer auf ihn werden blau markiert.
- Die Runde gewinnt, wer dem anderen alle Leben nimmt. Läuft die Zeit ab, gewinnt, wer mehr Leben übrig hat, danach wer mehr Lebenspunkte hat.
- Geld wie im Training: 800 $ zum Start, Prämie pro Abschuss, Siegprämie, Niederlagenbonus. Wer am Rundenende tot ist, verliert seine Ausrüstung.
- In der Pause läuft das Duell weiter (man steht still). Wer das Duell verlässt oder den Tab schließt, verliert. Bricht die Verbindung länger als 30 Sekunden ab, gewinnt der andere.

Technik:

- **Verbindung:** direkt von Rechner zu Rechner per WebRTC ([Trystero](https://github.com/dmotz/trystero), Vermittlung über öffentliche Nostr-Server). Parallel läuft ein Kanal über **Supabase Realtime**. Klappt die Direktverbindung nicht, geht alles über den Server. Oben links im Spiel steht, welcher Weg gerade genutzt wird, dazu der Ping.
- **Treffer:** Der Schütze prüft den Treffer und meldet ihn, der Getroffene zieht sich die Lebenspunkte selbst ab (Weste und Helm zählen dabei). Granaten rechnet jeder für sich aus.
- **Host:** bestimmt Rundenstart und Rundenende, Leben und Rundensiege.
- **Bewegung des Gegners:** direkt 30, über den Server 12 Zustände pro Sekunde. Dazwischen wird mit etwa 0,1 s Verzögerung weich übergeblendet.
- Zum Testen lässt sich ein Weg erzwingen: `?netz=server` oder `?netz=direkt` an die Adresse hängen.

## Steuerung

| Taste | Aktion |
|---|---|
| `W` `A` `S` `D` | Laufen |
| Maus | Umsehen |
| Linksklick | Schießen, Messerhieb, Granate weit werfen |
| Rechtsklick halten | Zielen über Kimme und Korn bzw. Rotpunkt (langsamer, genauer, leichter Zoom), Zielfernrohr (eine Stufe); außerdem Messerstich, Granate kurz werfen |
| Leertaste | Springen |
| `Strg` oder `C` | Ducken |
| `Shift` | Schleichen (lautlos und genauer) |
| `R` | Nachladen |
| `1` – `5` | Hauptwaffe, Pistole, Messer, Extra 1, Extra 2 |
| `Q`, Mausrad | Letzte Waffe, Waffe wechseln |
| `B` | Kaufmenü (im Spawn, in der Kaufzeit) |
| `F` | Waffe begutachten |
| `Tab` | Statistik |
| `Esc` | Pause |
| `^` (änderbar) | Notizblock: sofort ein weißes Notizblatt, Spiel pausiert, Ton aus; nochmal drücken zum Zurückschalten |

Das Spiel geht beim Start in den Vollbildmodus. So fängt Chrome auch `Strg+W` ab, sonst würde Ducken plus Vorwärtslaufen den Tab schließen. Abschalten lässt sich das in den Einstellungen.

## Waffen

| Waffe | Art | Preis | Besonderheit |
|---|---|---|---|
| Natter | Pistole | 200 $ | Startwaffe, 30 Schaden (Kopf 72) |
| Kobra | Schwere Pistole | 700 $ | Kopftreffer tödlich |
| Falke | Maschinenpistole | 1.250 $ | Genau auch im Laufen |
| Keiler | Pump-Schrotflinte | 1.050 $ | 9 Schrotkugeln, auf kurze Distanz ein Treffer, lädt Patrone für Patrone |
| Wolf | Sturmgewehr | 2.700 $ | Stark, festes Rückstoßmuster |
| Luchs | Sturmgewehr mit Rotpunkt | 3.100 $ | Rotpunktvisier, ruhigerer Rückstoß |
| Adler | Scharfschützengewehr | 4.750 $ | Ein Körpertreffer reicht, Zielfernrohr nur beim Halten |
| Messer | Nahkampf | frei | Hieb (links, 60) und Stich (rechts, 90): zwei Treffer reichen immer, auch gegen eine Weste |

Dazu Schutzweste, Weste mit Helm und drei Granaten (Splitter, Blend, Rauch) für die zwei Extra-Slots.

Trefferzonen: Kopf (Faktor je Waffe, meist 2,4), Körper und Arme (1), Beine (0,75, dort schützt die Weste nicht). Die Trefferzonen sind etwas größer als die sichtbaren Figuren und Klappziele, damit man leichter trifft.

## Spielregeln im Training

- Start mit 800 $, Natter (Pistole) und Messer.
- 10 Sekunden Kaufzeit (eingefroren), danach 20 Sekunden Kaufen im Spawn.
- Pro Runde 5 bis 10 Klappziele, ab Runde 2 bewegen sich einige.
- 100 Lebenspunkte je Ziel, Kopftreffer zählen 2,4-fach (Sturmgewehr: 25 Körper, 60 Kopf).
- Geld pro Treffer je nach Waffe, Siegprämie 2.000 $, Niederlagenbonus ab 1.400 $ (steigt mit jeder Niederlage in Folge).
- Wer sich mit der eigenen Granate ausschaltet, verliert die Runde und seine Ausrüstung.

Alle Werte (Waffen, Rückstoßmuster, Streuung, Preise, Rundenzeiten) stehen in `src/config.js`.

## Dateien

| Ordner / Datei | Zweck |
|---|---|
| `src/config.js` | Alle Spielwerte an einem Ort |
| `src/game/` | Spielkern, Runden und Geld, Klappziele, 1 gegen 1 (`duel.js`) und der Gegner im eigenen Spiel (`remote.js`) |
| `src/net/` | Verbindung zwischen zwei Browsern (Trystero und Supabase Realtime) |
| `src/player/` | Bewegung wie in der Source-Engine (Beschleunigung, Reibung, Luftsteuerung, Ducken) |
| `src/weapons/` | Inventar mit 5 Slots, Schießen, Rückstoß, Waffe in der Hand, Granaten |
| `src/world/` | Arena, Himmel und Licht |
| `src/effects/` | Einschusslöcher, Funken, Staub, Leuchtspuren, Explosionen |
| `src/engine/` | Grafik, Physik, Steuerung, Ton (alle Geräusche werden per WebAudio erzeugt) |
| `src/ui/` | HUD, Kaufmenü und Lobby |
| `blender/` | Python-Skripte, die alle eigenen 3D-Modelle in Blender bauen |
| `scripts/` | Laden der Poly-Haven-Dateien und Aufruf von Blender |
| `public/assets/` | Fertige Modelle, Texturen und Himmel, die das Spiel lädt |

## 3D-Modelle und Texturen

- **Eigene Modelle** (Waffen mit Händen, Granaten, Kisten, Klappziel, Soldat für das 1 gegen 1) entstehen per Skript in Blender:

  ```
  npm run models
  npm run models -- --preview
  npm run models -- wolf natter
  ```

  Mit `--preview` legt Blender Vorschaubilder in `blender/preview/` ab. Blender wird unter `C:\Program Files\Blender Foundation` gesucht, sonst über die Umgebungsvariable `BLENDER`.

- **Texturen, Himmel und Requisiten** kommen von [Poly Haven](https://polyhaven.com) (CC0, frei nutzbar). `npm run assets` lädt alles herunter, danach verkleinert `npm run textures` die Texturen (JPEG-Qualität 85, gleiche Auflösung, rund ein Viertel der Dateigröße). Die Requisiten landen als Quelle in `assets-src/` (nicht im Repo). `npm run models` macht daraus die optimierte `public/assets/models/props.glb` (etwa 1.000 Dreiecke und 512er-Texturen pro Requisit).

## Grafik und Leistung

Das Spiel startet auf **Niedrig**, damit es auch auf schwachen Laptops (Intel-Grafik) flüssig läuft. In den Einstellungen gibt es:

| Stufe | Was sie macht |
|---|---|
| Niedrig | ohne Kantenglättung und Umgebungsverdeckung, Schatten der Arena werden nur einmal berechnet (Bewegliches wirft keinen Schatten), wenig Texturfilterung |
| Mittel | Schatten in jedem Bild, 4-fache Kantenglättung |
| Hoch | dazu Umgebungsverdeckung (weiche Kontaktschatten), schärfere Schatten, höhere Auflösung auf hochauflösenden Bildschirmen |

Dazu die **Auflösung** (100 %, 85 %, 70 %, 50 %): weniger Pixel sind der größte Hebel für schwache Grafikchips, das Bild wird dafür etwas unschärfer.

Damit das Spiel sparsam bleibt: Teile, die sich gemeinsam bewegen und dasselbe Material haben, werden beim Laden zu einem Mesh zusammengefasst (`src/engine/merge.js`). Einschusslöcher und Rauchschwaden sind je ein Instanz-Mesh, also ein Zeichenaufruf statt vieler.

Die Leinwand ist auf geringe Verzögerung eingestellt (`desynchronized`). Dabei kann der Browser Zwischenstände anzeigen, deshalb wird jedes Bild erst im Hintergrund fertig zusammengesetzt und dann in einem Zug ausgegeben. Direkt in mehreren Durchgängen ins sichtbare Bild zu zeichnen führt zu Flackern.

## Veröffentlichen (GitHub Pages)

Repository: `Feuer_Frei` von `finnmarinov-lgtm`, spielbar unter https://finnmarinov-lgtm.github.io/Feuer_Frei/

Jeder Push auf `main` baut das Spiel automatisch neu und veröffentlicht es (`.github/workflows/pages.yml`). Den Stand sieht man im Repo unter *Actions*.

Lokal bauen und ansehen:

```
npm run build
npm run preview
```

Der Ordner `dist/` enthält die fertige Seite. Die Pfade sind relativ, sie läuft also auch in einem Unterordner.
