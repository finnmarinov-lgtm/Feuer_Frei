const KEY = 'feuer-frei-einstellungen';

export const QUALITY = {
  niedrig: { label: 'Niedrig', pixelRatio: 1, shadowSize: 1024, ao: false, msaa: 0 },
  mittel: { label: 'Mittel', pixelRatio: 1, shadowSize: 2048, ao: false, msaa: 4 },
  hoch: { label: 'Hoch', pixelRatio: 1.5, shadowSize: 4096, ao: true, msaa: 4 },
};

const DEFAULTS = {
  sensitivity: 2.0,
  fov: 74,
  viewmodelFov: 54,
  volume: 0.7,
  quality: 'hoch',
  crosshairColor: '#5cff7a',
  showFps: false,
  fullscreen: true,
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    stored = {};
  }
  const s = { ...DEFAULTS, ...stored };
  if (!QUALITY[s.quality]) s.quality = DEFAULTS.quality;
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher gelten die Einstellungen nur für diese Sitzung
  }
}
