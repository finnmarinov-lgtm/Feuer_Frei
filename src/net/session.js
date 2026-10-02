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
  /**
   * code, role ('host'/'guest'), kind ('duel' oder 'team', sobald das Spiel läuft); beim Host in der
   * Lobby auch die Einstellungen (opts), damit sie ein Neuladen überstehen (z. B. "Öffentlich")
   */
  setLobby: (code, role, kind = null, opts = null) => write(LOBBY, { code, role, kind, opts }),
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

// echte Adresse, solange der Notizblock eine unauffällige zeigt (sonst null)
let realUrl = null;

/**
 * Notizblock: statt der Adresse des Spiels eine unauffällige zeigen (path, z. B. '/notizen') bzw.
 * mit null die echte zurückholen. Ändern lässt sich nur der Teil hinter der Domain. Alles Geladene
 * ist beim Start schon da, relative Pfade stören also nicht.
 */
export function maskUrl(path) {
  if (path && realUrl === null) {
    realUrl = location.pathname + location.search + location.hash;
    history.replaceState(history.state, '', path);
  } else if (!path && realUrl !== null) {
    history.replaceState(history.state, '', realUrl);
    realUrl = null;
  }
}

/** Lobby-Code in der Adresse setzen (Neuladen führt zurück) oder entfernen; andere Angaben bleiben */
export function setUrlLobby(code) {
  // beim Notizblock nur die gemerkte echte Adresse ändern, die angezeigte bleibt unauffällig
  const url = new URL(realUrl ?? location.href, location.href);
  if (code) url.searchParams.set('lobby', code);
  else url.searchParams.delete('lobby');
  const next = url.pathname + url.search;
  if (realUrl !== null) realUrl = next;
  else history.replaceState(null, '', next);
}
