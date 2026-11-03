import { RealtimeClient } from '@supabase/realtime-js';
import { SUPABASE_WS, SUPABASE_KEY } from './net.js';

// Wie viele spielen gerade? Jedes offene Spiel meldet sich in einem gemeinsamen Kanal auf dem
// Supabase-Server an (Presence) und verschwindet von selbst, wenn der Tab zugeht oder die Verbindung
// abbricht. Petri Heil meldet sich im selben Kanal an, die Seite fmcode.de/online/ hört nur zu.
// Mitgeschickt wird nur der Spielname und ob man im Menü ist oder spielt: kein Name, kein Konto.
// Beim Entwickeln auf localhost ein eigener Kanal, damit Tests die echte Zahl nicht verfälschen.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const ONLINE_CHANNEL = LOCAL ? 'fmcode-online-test' : 'fmcode-online';
const GAME = 'feuer-frei';
// so lange (ms) darf der Tab im Hintergrund liegen, bevor er nicht mehr mitzählt
const HIDDEN_GRACE = 60_000;

function randomKey() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return 'f' + a[0].toString(36) + a[1].toString(36);
}

export class Online {
  constructor() {
    this.key = randomKey();
    this.where = 'menu';
    this.visible = document.visibilityState !== 'hidden';
    this.sent = null;
    this.ready = false;
    this.hideTimer = null;
    // Zahlen für dieses Spiel: alle, davon im Menü und im Spiel
    this.count = { online: 0, menu: 0, spiel: 0 };
    this.onChange = null;
    this._open();
    document.addEventListener('visibilitychange', () => {
      clearTimeout(this.hideTimer);
      if (document.visibilityState === 'hidden') {
        this.hideTimer = setTimeout(() => { this.visible = false; this._send(); }, HIDDEN_GRACE);
      } else {
        this.visible = true;
        this._send();
      }
    });
  }

  /** 'menu' oder 'spiel' */
  setWhere(where) {
    if (where === this.where) return;
    this.where = where;
    this._send();
  }

  _open() {
    try {
      const rt = new RealtimeClient(SUPABASE_WS, { params: { apikey: SUPABASE_KEY } });
      const ch = rt.channel(ONLINE_CHANNEL, { config: { presence: { key: this.key } } });
      ch.on('presence', { event: 'sync' }, () => this._sync());
      ch.subscribe((status) => {
        this.ready = status === 'SUBSCRIBED';
        // nach einem Neuverbinden neu anmelden
        if (this.ready) { this.sent = null; this._send(); }
      });
      this.ch = ch;
    } catch (err) {
      // Zählen ist Nebensache: ohne Verbindung läuft das Spiel genauso
      console.warn('Online-Zähler nicht erreichbar:', err);
    }
  }

  _send() {
    if (!this.ready || !this.ch) return;
    const want = this.visible ? JSON.stringify({ spiel: GAME, wo: this.where }) : null;
    if (want === this.sent) return;
    this.sent = want;
    const ch = this.ch;
    (want ? ch.track(JSON.parse(want)) : ch.untrack()).catch(() => { this.sent = undefined; });
  }

  _sync() {
    const c = { online: 0, menu: 0, spiel: 0 };
    for (const metas of Object.values(this.ch.presenceState())) {
      // pro Tab zählt nur der neueste Eintrag
      const m = metas[metas.length - 1];
      if (m?.spiel !== GAME) continue;
      c.online++;
      if (m.wo === 'spiel') c.spiel++;
      else c.menu++;
    }
    this.count = c;
    this.onChange?.(c);
  }
}
