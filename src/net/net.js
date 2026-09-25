import { joinRoom, selfId } from 'trystero';
import { RealtimeClient } from '@supabase/realtime-js';

// Verbindung zwischen zwei Browsern. Beide Wege werden gleichzeitig aufgebaut:
// direkt von Rechner zu Rechner (WebRTC über Trystero) und als Rückfall über den
// Supabase-Server (Realtime Broadcast). Gesendet wird über den besten verfügbaren Weg,
// empfangen über beide.

const APP_ID = 'feuer-frei-duell-v1';
// Version des Netzprotokolls: beide Spieler brauchen denselben Stand des Spiels
// (4: Karte und Waffen-Modus in der Lobby, Skins werden mitgeschickt)
export const PROTOCOL = 4;
const SUPABASE_WS = 'wss://yzzipjtounvktdhhvrnt.supabase.co/realtime/v1';
const SUPABASE_REST = 'https://yzzipjtounvktdhhvrnt.supabase.co/realtime/v1/api/broadcast';
// "publishable" Schlüssel: darf öffentlich im Code stehen
const SUPABASE_KEY = 'sb_publishable_OCNFFT4wa4CMaHyhcLAY4A_u2flZF1s';
const LOST_AFTER = 4000;

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(len = 6) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => CODE_CHARS[v % CODE_CHARS.length]).join('');
}

/** Code aus einer Eingabe oder einem Link herauslesen (Groß-/Kleinschreibung egal) */
export function parseCode(text) {
  const m = String(text || '').match(/lobby=([a-z0-9]+)/i);
  const raw = (m ? m[1] : String(text || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 6 && [...raw].every((c) => CODE_CHARS.includes(c)) ? raw : null;
}

export class Net {
  /** only: 'direkt' oder 'server' schaltet den anderen Weg ab (zum Testen) */
  constructor(code, { only = null } = {}) {
    this.code = code;
    this.only = only;
    this.id = selfId;
    this.partner = null;
    this.onMessage = null;
    this.onPeer = null;
    this.onChange = null;
    this.directPeers = new Set();
    this.serverPeers = new Set();
    this.known = new Set();
    this.serverReady = false;
    this.lastRecv = 0;
    this.ping = 0;
    this.closed = false;
    const room = (this.roomId = 'ff-' + code);
    if (only !== 'server') this._startDirect(room);
    if (only !== 'direkt') this._startServer(room);
    this._hb = setInterval(() => this._heartbeat(), 1000);
    // Tab wird geschlossen oder neu geladen: dem anderen sofort Bescheid geben. Das ist kein
    // Aufgeben, nach dem Neuladen kann man zurück ins Duell (Aufgeben ist 'bye' über das Menü).
    // Über WebRTC und den offenen Socket kommt das beim Entladen oft nicht mehr raus, deshalb
    // zusätzlich als Anfrage mit keepalive, die der Browser auch dann noch abschickt.
    this._onHide = () => {
      this.send({ t: 'away' });
      this._beacon({ t: 'away' });
    };
    window.addEventListener('pagehide', this._onHide);
  }

  _beacon(data) {
    if (!this.partner || this.only === 'direkt') return;
    try {
      fetch(SUPABASE_REST, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ messages: [{ topic: this.roomId, event: 'm', payload: { f: this.id, to: this.partner, d: data } }] }),
      }).catch(() => {});
    } catch {
      // dann merkt es der andere eben nach ein paar Sekunden ohne Nachricht
    }
  }

  /** 'suche' (noch kein Partner), 'direkt', 'server' oder 'getrennt' */
  get mode() {
    const p = this.partner;
    if (!p) return 'suche';
    if (this.directPeers.has(p)) return 'direkt';
    if (this.serverPeers.has(p)) return 'server';
    return 'getrennt';
  }

  /** Partner meldet sich seit ein paar Sekunden nicht mehr */
  get lost() {
    return !!this.partner && performance.now() - this.lastRecv > LOST_AFTER;
  }

  setPartner(id) {
    this.partner = id;
    this.lastRecv = performance.now();
    this._changed();
  }

  _startDirect(roomId) {
    try {
      this.room = joinRoom({ appId: APP_ID }, roomId, {
        onJoinError: (e) => console.warn('Direktverbindung:', e.error),
      });
    } catch (err) {
      console.warn('Direktverbindung nicht möglich:', err);
      return;
    }
    this.action = this.room.makeAction('m');
    this.action.onMessage = (data, ctx) => this._recv(data, ctx.peerId);
    this.room.onPeerJoin = (id) => {
      this.directPeers.add(id);
      this._seen(id);
      this._changed();
    };
    this.room.onPeerLeave = (id) => {
      this.directPeers.delete(id);
      this._changed();
    };
  }

  _startServer(roomId) {
    try {
      this.rt = new RealtimeClient(SUPABASE_WS, { params: { apikey: SUPABASE_KEY } });
      const ch = this.rt.channel(roomId, { config: { broadcast: { self: false }, presence: { key: this.id } } });
      ch.on('broadcast', { event: 'm' }, (msg) => {
        const p = msg.payload;
        if (!p || (p.to && p.to !== this.id)) return;
        this._recv(p.d, p.f);
      });
      ch.on('presence', { event: 'sync' }, () => {
        const ids = Object.keys(ch.presenceState()).filter((k) => k !== this.id);
        this.serverPeers = new Set(ids);
        for (const id of ids) this._seen(id);
        this._changed();
      });
      ch.subscribe((status) => {
        if (this.closed) return;
        if (status === 'SUBSCRIBED') {
          this.serverReady = true;
          ch.track({ at: Date.now() }).catch(() => {});
        } else {
          this.serverReady = false;
        }
        this._changed();
      });
      this.channel = ch;
    } catch (err) {
      console.warn('Server-Verbindung nicht möglich:', err);
    }
  }

  /** Nachricht an einen Mitspieler (Standard: Partner) oder an alle (to = null) */
  send(data, to = this.partner) {
    if (this.closed) return;
    if (!to) {
      this.action?.send(data).catch(() => {});
      this._sendServer(data, null);
      return;
    }
    if (this.directPeers.has(to)) {
      // klappt der direkte Weg gerade nicht (z. B. kurz beim Neuaushandeln), über den Server nachschicken
      this.action.send(data, { target: to }).catch(() => {
        if (this.serverPeers.has(to)) this._sendServer(data, to);
      });
    } else if (this.serverPeers.has(to)) {
      this._sendServer(data, to);
    }
  }

  _sendServer(data, to) {
    if (!this.serverReady) return;
    this.channel.send({ type: 'broadcast', event: 'm', payload: { f: this.id, to, d: data } }).catch(() => {});
  }

  _recv(data, from) {
    if (this.closed || !data || typeof data !== 'object') return;
    if (from === this.partner) this.lastRecv = performance.now();
    if (data.t === 'hb') {
      this.send({ t: 'hb2', c: data.c }, from);
      return;
    }
    if (data.t === 'hb2') {
      const rtt = performance.now() - data.c;
      if (rtt >= 0 && rtt < 10000) this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt;
      return;
    }
    this.onMessage?.(data, from);
  }

  _seen(id) {
    if (this.known.has(id)) return;
    this.known.add(id);
    this.onPeer?.(id);
  }

  // läuft per Timer, also auch in einem Hintergrund-Tab (dort höchstens einmal pro Sekunde)
  _heartbeat() {
    if (this.partner) this.send({ t: 'hb', c: performance.now() });
    this._changed();
  }

  _changed() {
    if (!this.closed) this.onChange?.();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this._hb);
    window.removeEventListener('pagehide', this._onHide);
    this.onMessage = this.onPeer = this.onChange = null;
    try {
      this.room?.leave();
    } catch {
      // schon getrennt
    }
    if (this.rt) {
      const rt = this.rt;
      rt.removeChannel(this.channel).catch(() => {}).finally(() => rt.disconnect());
    }
  }
}
