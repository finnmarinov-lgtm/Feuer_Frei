// Zählt Seitenaufrufe in der eigenen Supabase-Datenbank.
// Gespeichert wird nur Datum und Herkunft (z. B. "itch.io"), keine IP, kein Cookie,
// nichts, womit sich eine Person wiedererkennen ließe. Deshalb braucht es auch kein Banner.
//
// Die Tabelle und die Funktion dazu liegen in Supabase (siehe README, Abschnitt Zähler).

const SUPABASE_RPC = 'https://yzzipjtounvktdhhvrnt.supabase.co/rest/v1/rpc/seite_aufgerufen';
const SUPABASE_KEY = 'sb_publishable_OCNFFT4wa4CMaHyhcLAY4A_u2flZF1s';

// Woher kommt der Besuch? Nur der Hostname, nicht die ganze Adresse.
function herkunft() {
  try {
    if (!document.referrer) return 'direkt';
    const host = new URL(document.referrer).hostname.replace(/^www\./, '');
    if (host === location.hostname) return 'direkt';
    return host.slice(0, 60);
  } catch {
    return 'direkt';
  }
}

export function zaehleAufruf() {
  // Nur im Netz zählen, nicht beim lokalen Entwickeln
  if (!location.protocol.startsWith('http') || location.hostname === 'localhost') return;
  try {
    fetch(SUPABASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ p_quelle: herkunft() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Zählen ist Nebensache: Wenn es nicht klappt, läuft das Spiel trotzdem.
  }
}
