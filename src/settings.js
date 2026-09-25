const KEY = 'feuer-frei-einstellungen';
// Stand der gespeicherten Einstellungen. Ab Version 2 startet das Spiel auf niedriger Grafik.
const VERSION = 2;

// staticShadows: Schatten der Arena nur einmal berechnen, Bewegliches wirft dann keinen Schatten
// aniso: Texturfilterung für schräg gesehene Flächen (Boden)
// Jede Stufe setzt das Bild erst im Hintergrund zusammen und gibt es dann in einem Stück aus:
// die Leinwand zeigt Zwischenstände sonst sichtbar an (Flackern, siehe renderer.js).
export const QUALITY = {
  niedrig: { label: 'Niedrig', pixelRatio: 1, shadowSize: 2048, ao: false, msaa: 0, staticShadows: true, aniso: 2 },
  mittel: { label: 'Mittel', pixelRatio: 1, shadowSize: 2048, ao: false, msaa: 4, staticShadows: false, aniso: 4 },
  hoch: { label: 'Hoch', pixelRatio: 1.5, shadowSize: 4096, ao: true, msaa: 4, staticShadows: false, aniso: 8 },
};

// Anteil der Bildschirmauflösung, in dem gezeichnet wird (hilft schwachen Grafikchips am meisten)
export const RENDER_SCALES = [1, 0.85, 0.7, 0.5];

const DEFAULTS = {
  sensitivity: 2.0,
  fov: 74,
  viewmodelFov: 54,
  volume: 0.7,
  quality: 'niedrig',
  renderScale: 1,
  crosshairColor: '#5cff7a',
  showFps: false,
  fullscreen: true,
  adsToggle: false,
  // Touch-Steuerung: 'auto' (an auf Handy und Tablet), 'an' oder 'aus'; Empfindlichkeit beim Wischen
  touch: 'auto',
  touchSens: 1,
  // Taste links neben der 1 (^): wechselt sofort zu einem weißen Notizblatt
  bossKey: 'Backquote',
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    stored = {};
  }
  const s = { ...DEFAULTS, ...stored };
  if ((stored.version || 1) < VERSION) {
    // früher war "hoch" voreingestellt: einmalig auf niedrig, danach gilt die eigene Wahl
    s.quality = 'niedrig';
    s.version = VERSION;
    saveSettings(s);
  }
  if (!QUALITY[s.quality]) s.quality = DEFAULTS.quality;
  if (!RENDER_SCALES.includes(s.renderScale)) s.renderScale = DEFAULTS.renderScale;
  if (!['auto', 'an', 'aus'].includes(s.touch)) s.touch = DEFAULTS.touch;
  if (!(s.touchSens >= 0.3 && s.touchSens <= 2.5)) s.touchSens = DEFAULTS.touchSens;
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher gelten die Einstellungen nur für diese Sitzung
  }
}
