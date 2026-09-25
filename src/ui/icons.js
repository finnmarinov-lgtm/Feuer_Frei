// Waffen-Symbole für den Kill-Feed: einfache Umrisse, Mündung nach rechts (zum Opfer hin).
// viewBox 48 x 20, Füllung in der Textfarbe.

const PATHS = {
  pistol: 'M12 4h26v5H26l-1 2h-4l-2 8h-6l2-8h-2l-1-2h-2z',
  heavy: 'M8 3h33v6H27l-1 3h-5l-2 8h-7l2-8h-2l-1-3H8z',
  smg: 'M5 6h31l5 1v4H30l-2 2h-3l-1 6h-4l1-6h-3l-2 3h-6l2-5H5zM26 13h4v6h-4z',
  rifle: 'M2 8h9l2-2h24V5h3v1h6v4H34l-2 2h-6l-2 7h-4l2-7h-3l-3 5H9l3-5H2z',
  shotgun: 'M2 8h11l2-2h31v4H31v2h-9v-2h-5l-3 6H7l3-6H2z',
  sniper: 'M2 9h9l2-2h26V6h8v3h-8v2H33l-2 2h-5l-2 6h-4l2-6h-3l-3 4H9l3-4H2zM16 2h14v3H16z',
  karambit: 'M9 5a5 5 0 1 0 .1 0zm0 3a2 2 0 1 1-.1 0zM13 8h11c9 0 16 3 20 10-6-4-12-5-18-5H13z',
  butterfly: 'M3 8h20v5H3zM5 9h3v3H5zm5 0h3v3h-3zm5 0h3v3h-3zM23 8l22 2-22 3z',
  grenade: 'M24 7a7 7 0 1 1-.1 0zM21 3h7v3h-7zM28 4l5 3-1 2-5-3z',
  plane: 'M3 10l9-1 6-7h3l-2 7h13l4-4h3l-2 5 2 5h-3l-4-4H19l2 7h-3l-6-7-9-1z',
  bomb: 'M7 7h34v10H7zM11 4h7v3h-7zM36 9h3v2h-3z',
};

// Waffe (Id) -> Symbol; Messer je nach Ausführung
const WEAPON_ICON = {
  natter: 'pistol', kobra: 'heavy', falke: 'smg', keiler: 'shotgun', wolf: 'rifle', luchs: 'rifle',
  adler: 'sniper', he: 'grenade', flash: 'grenade', smoke: 'grenade', luftschlag: 'plane', bombe: 'bomb',
  karambit: 'karambit', butterfly: 'butterfly',
};

export function weaponIcon(key, title = '') {
  const d = PATHS[WEAPON_ICON[key] || key] || PATHS.pistol;
  return `<svg class="wicon" viewBox="0 0 48 20" aria-label="${title}"><title>${title}</title><path d="${d}" fill-rule="evenodd"/></svg>`;
}

// Kopfschuss: Kopf mit Fadenkreuz
export const HEADSHOT_ICON = '<svg class="hs" viewBox="0 0 20 20" aria-label="Kopfschuss"><title>Kopfschuss</title>'
  + '<path d="M10 4a6 6 0 1 1-.1 0zm0 3a3 3 0 1 0 .1 0z" fill-rule="evenodd"/><path d="M9 0h2v5H9zM9 15h2v5H9zM0 9h5v2H0zM15 9h5v2h-5z"/></svg>';
