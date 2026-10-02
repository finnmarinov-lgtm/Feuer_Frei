import { SUPABASE_KEY } from './net.js';

// Konto mit Benutzername und Passwort (ohne E-Mail). Der Server (Supabase, supabase/konto.sql) speichert
// den Aufgaben-Fortschritt, die getragenen Skins und die Notizen; auf dem Gerät liegt nur der
// Anmelde-Schlüssel. Beim Speichern führt der Server beide Stände zusammen (Zähler: der größere Wert,
// Skins und Notizen: die neuere Fassung) und schickt das Ergebnis zurück, so passt es auf jedem Gerät.

const RPC = 'https://yzzipjtounvktdhhvrnt.supabase.co/rest/v1/rpc/';
const KEY = 'feuer-frei-konto';
// so lange nach der letzten Änderung wird gespeichert (Notizen schnell, Fortschritt gesammelt)
const WARTEN = { notizen: 2000, looks: 2000, fortschritt: 10000 };

export class KontoFehler extends Error {
  constructor(code, info = null) {
    super(code);
    this.code = code;
    this.info = info;
  }
}

async function rpc(fn, body, keepalive = false) {
  let res;
  try {
    res = await fetch(RPC + fn, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new KontoFehler('netz');
  }
  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json()).message || '';
    } catch {
      // keine Antwort
    }
    if (res.status === 404 || /could not find the function/i.test(msg)) throw new KontoFehler('kein_sql');
    throw new KontoFehler(msg || `fehler_${res.status}`);
  }
  const data = await res.json();
  if (data && typeof data === 'object' && data.fehler) throw new KontoFehler(data.fehler, data);
  return data;
}

function lies() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

/**
 * hooks.lesen(): Stand des Geräts { fortschritt, looks, notizen }
 * hooks.schreiben(daten): Stand vom Server übernehmen
 * hooks.leeren(): Fortschritt, Skins und Notizen vom Gerät nehmen (Abmelden)
 * hooks.onChange(): Anmeldung oder Status hat sich geändert (für die Anzeige)
 */
export class Konto {
  constructor(hooks) {
    this.hooks = hooks;
    const s = lies();
    this.name = typeof s.name === 'string' ? s.name : null;
    this.token = typeof s.token === 'string' ? s.token : null;
    // Zeitpunkt der letzten eigenen Änderung an Skins und Notizen (der Server nimmt die neuere Fassung)
    this.zeit = s.zeit && typeof s.zeit === 'object' ? s.zeit : {};
    // gibt es die Konten auf dem Server schon? (vorher bleibt der Knopf im Menü weg)
    this.bereit = false;
    // 'gespeichert', 'speichert', 'offline' oder ''
    this.status = '';
    this.gespeichertUm = 0;
    this.timer = null;
    this.faellig = 0;
    this.uebernimmt = false;
    this.laeuft = null;
    // beim Verlassen der Seite: Ausstehendes noch schnell wegschicken
    window.addEventListener('pagehide', () => {
      if (this.timer) this.speichern(true);
    });
  }

  get angemeldet() {
    return !!this.token;
  }

  _merken() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: this.name, token: this.token, zeit: this.zeit }));
    } catch {
      // ohne Speicher bleibt man nur bis zum Neuladen angemeldet
    }
  }

  _status(s) {
    this.status = s;
    if (s === 'gespeichert') this.gespeichertUm = Date.now();
    this.hooks.onChange?.();
  }

  /** gibt es die Konten schon? (Funktionen in Supabase eingerichtet) */
  async pruefen() {
    try {
      this.bereit = (await rpc('ff_bereit', {})) === true;
    } catch {
      this.bereit = false;
    }
    this.hooks.onChange?.();
    return this.bereit;
  }

  // Stand des Geräts; nie bearbeitete Skins und Notizen zählen als älter als jede echte Änderung (1)
  _daten() {
    return { ...this.hooks.lesen(), zeit: { looks: this.zeit.looks || 1, notizen: this.zeit.notizen || 1 } };
  }

  // Stand vom Server übernehmen: Fortschritt immer (er wächst nur), Skins und Notizen nur, wenn sie
  // neuer sind als auf dem Gerät (sonst überschriebe die Antwort gerade Getipptes)
  _uebernehmen(daten) {
    if (!daten || typeof daten !== 'object') return;
    const zeit = daten.zeit && typeof daten.zeit === 'object' ? daten.zeit : {};
    const teile = { fortschritt: daten.fortschritt };
    for (const k of ['looks', 'notizen']) {
      if (typeof zeit[k] !== 'number' || !(k in daten)) continue;
      if (zeit[k] > (this.zeit[k] || 0)) teile[k] = daten[k];
      this.zeit[k] = Math.max(this.zeit[k] || 0, zeit[k]);
    }
    this._merken();
    // was dabei auf dem Gerät gespeichert wird, soll nicht gleich wieder zum Server
    this.uebernimmt = true;
    try {
      this.hooks.schreiben(teile);
    } finally {
      this.uebernimmt = false;
    }
  }

  _angemeldet(r) {
    this.name = r.name;
    this.token = r.token;
    this._merken();
    this._uebernehmen(r.daten);
  }

  /** neues Konto; was schon auf dem Gerät ist, kommt mit hinein */
  async registrieren(name, passwort) {
    const r = await rpc('ff_registrieren', { p_name: name, p_passwort: passwort, p_daten: this._daten() });
    this._angemeldet(r);
    this._status('gespeichert');
  }

  /** anmelden und den Stand des Geräts mit dem des Kontos zusammenführen */
  async anmelden(name, passwort) {
    const r = await rpc('ff_anmelden', { p_name: name, p_passwort: passwort });
    this._angemeldet(r);
    await this.speichern();
  }

  /** abmelden: Fortschritt, Skins und Notizen bleiben im Konto, vom Gerät verschwinden sie */
  async abmelden() {
    const token = this.token;
    clearTimeout(this.timer);
    this.timer = null;
    this.token = this.name = null;
    this.zeit = {};
    this._merken();
    this.uebernimmt = true;
    try {
      this.hooks.leeren();
    } finally {
      this.uebernimmt = false;
    }
    this._status('');
    if (token) rpc('ff_abmelden', { p_token: token }).catch(() => {});
  }

  async passwortAendern(alt, neu) {
    await rpc('ff_passwort_aendern', { p_token: this.token, p_alt: alt, p_neu: neu });
  }

  async loeschen(passwort) {
    await rpc('ff_konto_loeschen', { p_token: this.token, p_passwort: passwort });
    this.token = this.name = null;
    this.zeit = {};
    this._merken();
    this._status('');
  }

  /** nach einer Änderung auf dem Gerät: teil = 'fortschritt', 'looks' oder 'notizen' */
  merken(teil) {
    if (this.uebernimmt) return;
    if (teil === 'looks' || teil === 'notizen') {
      // neuer als alles, was dieses Gerät schon gesehen hat (auch wenn ein anderes Gerät vorgeht)
      this.zeit[teil] = Math.max(Date.now(), (this.zeit[teil] || 0) + 1);
      this._merken();
    }
    if (!this.angemeldet) return;
    const wann = Date.now() + (WARTEN[teil] ?? 5000);
    // ein früherer Termin bleibt (Notizen sollen nicht auf den Fortschritt warten)
    if (this.timer && this.faellig <= wann && teil === 'fortschritt') return;
    clearTimeout(this.timer);
    this.faellig = wann;
    this.timer = setTimeout(() => this.speichern(), wann - Date.now());
  }

  /** Stand hochladen und den zusammengeführten zurück übernehmen (auch zum Holen von anderen Geräten) */
  async speichern(keepalive = false) {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.angemeldet) return;
    if (this.laeuft) return this.laeuft;
    const token = this.token;
    this._status('speichert');
    this.laeuft = (async () => {
      try {
        const r = await rpc('ff_speichern', { p_token: token, p_daten: this._daten() }, keepalive);
        if (this.token !== token) return;
        this._uebernehmen(r.daten);
        this._status('gespeichert');
      } catch (e) {
        if (e.code === 'abgemeldet') {
          // Schlüssel abgelaufen oder anderswo abgemeldet (z. B. Passwort geändert): Daten bleiben hier
          this.token = this.name = null;
          this._merken();
          this._status('');
        } else {
          this._status('offline');
        }
      } finally {
        this.laeuft = null;
      }
    })();
    return this.laeuft;
  }
}
