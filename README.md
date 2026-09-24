# Feuer Frei

3D-Shooter im Browser im Stil von CS: Hauptwaffe, Pistole, Messer und zwei Extra-Slots für Granaten, dazu ein Kaufmenü mit Budget zu Beginn jeder Runde. Gebaut mit Three.js, Physik mit Rapier.

Aktueller Stand: **Einzelspieler-Training**. 5 Runden gegen Klappziele aus Stahl, danach eine Auswertung. Das 1 gegen 1 über eine Lobby (WebRTC mit Trystero, Rückfall auf Supabase Realtime) kommt als Nächstes.

## Starten

```
npm install
npm run dev
```

Danach `http://localhost:5173` öffnen und auf **Training starten** klicken.

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
| Natter | Pistole | 200 $ | Startwaffe |
| Kobra | Schwere Pistole | 700 $ | Kopftreffer tödlich |
| Falke | Maschinenpistole | 1.250 $ | Genau auch im Laufen |
| Keiler | Pump-Schrotflinte | 1.050 $ | 9 Schrotkugeln, auf kurze Distanz ein Treffer, lädt Patrone für Patrone |
| Wolf | Sturmgewehr | 2.700 $ | Stark, festes Rückstoßmuster |
| Luchs | Sturmgewehr mit Rotpunkt | 3.100 $ | Rotpunktvisier, ruhigerer Rückstoß |
| Adler | Scharfschützengewehr | 4.750 $ | Ein Körpertreffer reicht, Zielfernrohr nur beim Halten |
| Messer | Nahkampf | frei | Hieb (links), Stich (rechts) |

Dazu Schutzweste, Weste mit Helm und drei Granaten (Splitter, Blend, Rauch) für die zwei Extra-Slots.

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
| `src/game/` | Spielkern, Runden und Geld, Klappziele |
| `src/player/` | Bewegung wie in der Source-Engine (Beschleunigung, Reibung, Luftsteuerung, Ducken) |
| `src/weapons/` | Inventar mit 5 Slots, Schießen, Rückstoß, Waffe in der Hand, Granaten |
| `src/world/` | Arena, Himmel und Licht |
| `src/effects/` | Einschusslöcher, Funken, Staub, Leuchtspuren, Explosionen |
| `src/engine/` | Grafik, Physik, Steuerung, Ton (alle Geräusche werden per WebAudio erzeugt) |
| `src/ui/` | HUD und Kaufmenü |
| `blender/` | Python-Skripte, die alle eigenen 3D-Modelle in Blender bauen |
| `scripts/` | Laden der Poly-Haven-Dateien und Aufruf von Blender |
| `public/assets/` | Fertige Modelle, Texturen und Himmel, die das Spiel lädt |

## 3D-Modelle und Texturen

- **Eigene Modelle** (Waffen mit Händen, Granaten, Kisten, Klappziel) entstehen per Skript in Blender:

  ```
  npm run models
  npm run models -- --preview
  npm run models -- wolf natter
  ```

  Mit `--preview` legt Blender Vorschaubilder in `blender/preview/` ab. Blender wird unter `C:\Program Files\Blender Foundation` gesucht, sonst über die Umgebungsvariable `BLENDER`.

- **Texturen, Himmel und Requisiten** kommen von [Poly Haven](https://polyhaven.com) (CC0, frei nutzbar). `npm run assets` lädt alles herunter. Die Requisiten landen als Quelle in `assets-src/` (nicht im Repo). `npm run models` macht daraus die optimierte `public/assets/models/props.glb`.

## Veröffentlichen (GitHub Pages)

Repository: `Feuer_Frei` von `finnmarinov-lgtm`, spielbar unter https://finnmarinov-lgtm.github.io/Feuer_Frei/

Jeder Push auf `main` baut das Spiel automatisch neu und veröffentlicht es (`.github/workflows/pages.yml`). Den Stand sieht man im Repo unter *Actions*.

Lokal bauen und ansehen:

```
npm run build
npm run preview
```

Der Ordner `dist/` enthält die fertige Seite. Die Pfade sind relativ, sie läuft also auch in einem Unterordner.
