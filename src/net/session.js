// Merkt sich Lobby und laufende Partie im Tab (sessionStorage). Das übersteht ein Neuladen,
// damit man ins laufende Spiel zurückkommt; ein neuer Tab oder ein neues Fenster fängt frisch an.
const LOBBY = 'feuer-frei-lobby';
const DUEL = 'feuer-frei-duell';
const TEAM = 'feuer-frei-team';
const KEY = 'feuer-frei-spieler';

function read(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ohne Speicher gibt es eben keinen Wiedereinstieg
  }
}

let tabKey = null;

export const session = {
  lobby: () => read(LOBBY),
  /** code, role ('host'/'guest'), kind ('duel' oder 'team', sobald das Spiel läuft) */
  setLobby: (code, role, kind = null) => write(LOBBY, { code, role, kind }),
  duel: () => read(DUEL),
  setDuel: (data) => write(DUEL, data),
  /** eigener Stand im Team-Spiel (beim Host auch der Stand der ganzen Partie) */
  team: () => read(TEAM),
  setTeam: (data) => write(TEAM, data),
  /**
   * Feste Kennung dieses Tabs im Team-Spiel: bleibt beim Neuladen gleich (die Kennung im Netz
   * wechselt), so erkennt der Host einen zurückkehrenden Mitspieler.
   */
  key() {
    if (tabKey) return tabKey;
    tabKey = read(KEY);
    if (typeof tabKey !== 'string' || tabKey.length < 6) {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      tabKey = 'p' + a[0].toString(36) + a[1].toString(36);
      write(KEY, tabKey);
    }
    return tabKey;
  },
  clear() {
    try {
      sessionStorage.removeItem(LOBBY);
      sessionStorage.removeItem(DUEL);
      sessionStorage.removeItem(TEAM);
    } catch {
      // egal
    }
  },
};

/** Lobby-Code in der Adresse setzen (Neuladen führt zurück) oder entfernen; andere Angaben bleiben */
export function setUrlLobby(code) {
  const params = new URLSearchParams(location.search);
  if (code) params.set('lobby', code);
  else params.delete('lobby');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
}
