import { RealtimeClient } from '@supabase/realtime-js';
import { PROTOCOL, SUPABASE_WS, SUPABASE_KEY, parseCode } from './net.js';
import { cleanName } from '../names.js';
import { MAPS } from '../world/map.js';
import { ARMS } from '../config.js';

// Offene Lobbys: Ein Host mit öffentlicher Lobby meldet sie in einem gemeinsamen Kanal auf dem
// Supabase-Server an (Presence). Wer das Mehrspieler-Menü offen hat, hört dort mit und bekommt die
// Liste. Schließt der Host den Tab oder bricht seine Verbindung ab, streicht der Server den Eintrag
// von selbst. Der Kanal trägt die Protokoll-Version: Lobbys einer anderen Version tauchen gar nicht
// erst auf (beitreten ginge ohnehin nicht).
const CHANNEL = `ff-offen-v${PROTOCOL}`;
// so lange (ms) werden Änderungen gesammelt, bevor sie rausgehen (z. B. beim Tippen des Namens)
const DELAY = 500;
const MODES = ['kampf', 'bombe'];

function randomKey() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return 'l' + a[0].toString(36) + a[1].toString(36);
}

/** Eintrag von jemand anderem prüfen: nur bekannte Werte, Name durch den Filter */
function readEntry(m) {
  const code = parseCode(m?.code);
  if (!code) return null;
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  return {
    code,
    host: cleanName(m.host) || 'Spieler',
    n: num(m.n, 1, 8),
    bots: num(m.bots, 0, 8),
    map: MAPS[m.map] ? m.map : 'hof',
    mode: MODES.includes(m.mode) ? m.mode : 'kampf',
    arms: ARMS[m.arms] ? m.arms : 'alle',
    since: num(m.since, 0, Number.MAX_SAFE_INTEGER),
  };
}

export class LobbyList {
  constructor() {
    this.rt = null;
    this.ch = null;
    this.key = randomKey();
    // 'aus', 'verbinde', 'da' oder 'fehler'
    this.state = 'aus';
    this.listening = false;
    // eigene Lobby, die angemeldet sein soll (Host), und was zuletzt davon rausging
    this.mine = null;
    this.sent = null;
    this.timer = null;
    this.lobbies = [];
    this.onChange = null;
  }

  /** Liste mithören (Mehrspieler-Menü offen) oder nicht mehr */
  listen(on) {
    if (this.listening === on) return;
    this.listening = on;
    this._update();
  }

  /** eigene Lobby anmelden bzw. ändern; null meldet sie ab */
  announce(info) {
    this.mine = info;
    clearTimeout(this.timer);
    if (info) this.timer = setTimeout(() => this._update(), DELAY);
    else this._update();
  }

  _update() {
    if (!this.listening && !this.mine) {
      this._close();
      return;
    }
    if (!this.ch) this._open();
    if (this.state !== 'da') return;
    const json = this.mine ? JSON.stringify(this.mine) : null;
    if (json === this.sent) return;
    this.sent = json;
    const ch = this.ch;
    (this.mine ? ch.track(this.mine) : ch.untrack()).catch(() => {
      // beim nächsten Mal nochmal versuchen
      if (this.ch === ch) this.sent = undefined;
    });
  }

  _open() {
    this.state = 'verbinde';
    this.sent = null;
    try {
      const rt = new RealtimeClient(SUPABASE_WS, { params: { apikey: SUPABASE_KEY } });
      const ch = rt.channel(CHANNEL, { config: { presence: { key: this.key } } });
      ch.on('presence', { event: 'sync' }, () => {
        if (this.ch === ch) this._sync();
      });
      ch.subscribe((status) => {
        if (this.ch !== ch) return;
        if (status === 'SUBSCRIBED') {
          this.state = 'da';
          this.sent = null;
          this._update();
        } else if (status !== 'CLOSED') {
          // Fehler oder Zeitüberschreitung: die Bibliothek versucht es von selbst weiter
          this.state = 'fehler';
        }
        this.onChange?.();
      });
      this.rt = rt;
      this.ch = ch;
    } catch (err) {
      console.warn('Lobby-Liste nicht erreichbar:', err);
      this.state = 'fehler';
    }
    this.onChange?.();
  }

  _close() {
    clearTimeout(this.timer);
    const { rt, ch } = this;
    this.rt = this.ch = null;
    this.state = 'aus';
    this.sent = null;
    this.lobbies = [];
    if (rt) rt.removeChannel(ch).catch(() => {}).finally(() => rt.disconnect());
  }

  _sync() {
    const seen = new Map();
    for (const [key, metas] of Object.entries(this.ch.presenceState())) {
      if (key === this.key) continue;
      for (const m of metas) {
        const e = readEntry(m);
        // derselbe Code zweimal (z. B. Host lädt neu): der neuere Eintrag gilt
        if (e && (!seen.has(e.code) || seen.get(e.code).since < e.since)) seen.set(e.code, e);
      }
    }
    this.lobbies = [...seen.values()];
    this.onChange?.();
  }
}
