// Merkt sich Lobby und laufendes Duell im Tab (sessionStorage). Das übersteht ein Neuladen,
// damit man ins laufende Duell zurückkommt; ein neuer Tab oder ein neues Fenster fängt frisch an.
const LOBBY = 'feuer-frei-lobby';
const DUEL = 'feuer-frei-duell';

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

export const session = {
  lobby: () => read(LOBBY),
  setLobby: (code, role) => write(LOBBY, { code, role }),
  duel: () => read(DUEL),
  setDuel: (data) => write(DUEL, data),
  clear() {
    try {
      sessionStorage.removeItem(LOBBY);
      sessionStorage.removeItem(DUEL);
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
