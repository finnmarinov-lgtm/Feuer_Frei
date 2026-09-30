const KEY = 'feuer-frei-einstellungen';
// Stand der gespeicherten Einstellungen. Ab Version 2 startet das Spiel auf niedriger Grafik, ab
// Version 3 mit automatischer Auflösung.
const VERSION = 3;

// staticShadows: Schatten der Arena nur einmal berechnen, Bewegliches wirft dann keinen Schatten
// aniso: Texturfilterung für schräg gesehene Flächen (Boden)
// Jede Stufe setzt das Bild erst im Hintergrund zusammen und gibt es dann in einem Stück aus:
// die Leinwand zeigt Zwischenstände sonst sichtbar an (Flackern, siehe renderer.js).
export const QUALITY = {
  niedrig: { label: 'Niedrig', pixelRatio: 1, shadowSize: 2048, ao: false, msaa: 0, staticShadows: true, aniso: 2 },
  mittel: { label: 'Mittel', pixelRatio: 1, shadowSize: 2048, ao: false, msaa: 4, staticShadows: false, aniso: 4 },
  hoch: { label: 'Hoch', pixelRatio: 1.5, shadowSize: 4096, ao: true, msaa: 4, staticShadows: false, aniso: 8 },
};

// Anteil der Bildschirmauflösung, in dem gezeichnet wird (hilft schwachen Grafikchips am meisten);
// 'auto': das Spiel geht selbst eine Stufe herunter, wenn es ruckelt (siehe AutoScale in renderer.js)
export const RENDER_SCALES = ['auto', 1, 0.85, 0.7, 0.5];

const DEFAULTS = {
  sensitivity: 2.0,
  fov: 74,
  viewmodelFov: 54,
  volume: 0.7,
  quality: 'niedrig',
  renderScale: 'auto',
  crosshairColor: '#5cff7a',
  showFps: false,
  // Radar oben links (kleine Karte mit Mitspielern und entdeckten Gegnern)
  radar: true,
  fullscreen: true,
  adsToggle: false,
  // Touch-Steuerung: 'auto' (an auf Handy und Tablet), 'an' oder 'aus'; Empfindlichkeit beim Wischen
  touch: 'auto',
  touchSens: 1,
  // eigene Tastenbelegung (Aktion -> Tasten), null = Standard
  keys: null,
  // Taste links neben der 1 (^): wechselt sofort zu einem weißen Notizblatt
  bossKey: 'Backquote',
  // getragene Skins { weapons: { wolf: 'gold', messer: 'regenbogen', … }, player: 'wald' },
  // nur freigeschaltete (siehe game/cosmetics.js)
  looks: null,
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    stored = {};
  }
  const s = { ...DEFAULTS, ...stored };
  const version = stored.version || 1;
  if (version < VERSION) {
    // früher war "hoch" voreingestellt: einmalig auf niedrig, danach gilt die eigene Wahl
    if (version < 2) s.quality = 'niedrig';
    // früher waren 100 % voreingestellt: einmalig auf automatisch, danach gilt die eigene Wahl
    if (version < 3 && s.renderScale === 1) s.renderScale = 'auto';
    s.version = VERSION;
    saveSettings(s);
  }
  if (!QUALITY[s.quality]) s.quality = DEFAULTS.quality;
  if (!RENDER_SCALES.includes(s.renderScale)) s.renderScale = DEFAULTS.renderScale;
  if (!['auto', 'an', 'aus'].includes(s.touch)) s.touch = DEFAULTS.touch;
  if (!(s.touchSens >= 0.3 && s.touchSens <= 2.5)) s.touchSens = DEFAULTS.touchSens;
  if (s.keys !== null && (typeof s.keys !== 'object' || Array.isArray(s.keys))) s.keys = null;
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher gelten die Einstellungen nur für diese Sitzung
  }
}
