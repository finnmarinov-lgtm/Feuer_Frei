import { selfId } from '@trystero-p2p/core';
import { RealtimeClient } from '@supabase/realtime-js';
import { joinRoom } from './signal.js';

// Verbindung zwischen den Browsern einer Lobby. Beide Wege werden gleichzeitig aufgebaut:
// direkt von Rechner zu Rechner (WebRTC über Trystero, vermittelt über das eigene Supabase-Projekt,
// siehe signal.js) und als Rückfall über den Supabase-Server (Realtime Broadcast). Gesendet wird
// pro Mitspieler über den besten verfügbaren Weg, empfangen über beide. Im 1 gegen 1 gibt es einen
// Partner, im Team-Spiel eine Gruppe (group), an die alles geht.

const APP_ID = 'feuer-frei-duell-v1';
// Version des Netzprotokolls: beide Spieler brauchen denselben Stand des Spiels
// (6: Mehrspieler-Lobby mit Teams bis 4 gegen 4, 7: Karte Hafen, 8: Hafen mit weniger Durchgängen,
// 9: Luftschlag als Abschussserie, Entschärfen dauert 10 s, 10: offene Lobbys, Host kann rauswerfen,
// 11: nach der Partie zurück in die Lobby, Zuschauer bei laufenden Partien, 12: Adler tötet nur mit
// Kopftreffer sofort (den Schaden rechnet der Schütze aus), Weste 50 Punkte, 13: Verbindungsaufbau
// über das eigene Supabase statt Nostr, ältere Fassungen fänden sich nur noch über den Server)
export const PROTOCOL = 13;
export const SUPABASE_WS = 'wss://yzzipjtounvktdhhvrnt.supabase.co/realtime/v1';
const SUPABASE_REST = 'https://yzzipjtounvktdhhvrnt.supabase.co/realtime/v1/api/broadcast';
// "publishable" Schlüssel: darf öffentlich im Code stehen
export const SUPABASE_KEY = 'sb_publishable_OCNFFT4wa4CMaHyhcLAY4A_u2flZF1s';
const LOST_AFTER = 4000;
// Schnelle Spur: zweiter WebRTC-Kanal auf derselben Verbindung, ohne Nachschicken und ohne
// Reihenfolge (wie UDP). Der Kanal von Trystero schickt Verlorenes nach und hält bis dahin alles
// Folgende auf, im WLAN gibt das Ruckler von 100 bis 200 ms. Über die schnelle Spur laufen nur
// Zustände, die der nächste ohnehin ablöst (Positionen, Herzschlag). Beide Seiten legen den Kanal
// mit derselben Nummer an (negotiated), sonst landete er bei Trystero (ondatachannel). Benutzt wird
// er erst, wenn darüber etwas angekommen ist: Dann hat ihn die Gegenseite auch (sonst bekommt sie
// alles wie bisher über den sicheren Kanal).
const FAST_LABEL = 'ff-schnell';
const FAST_PROBE = '{"t":"fp"}';
// staut sich mehr als das, lieber einen Zustand auslassen als die Verzögerung erhöhen
const FAST_MAX_BUFFER = 16 * 1024;
// Ping: Median der letzten Messungen (ein einzelner Hänger, etwa beim Laden, verfälscht ihn nicht)
const PING_SAMPLES = 5;

/**
 * Nummer der schnellen Spur aus dem Raum (beide Seiten rechnen dasselbe). Trystero nutzt die
 * Verbindung zum selben Mitspieler auch im nächsten Raum weiter, so kommen sich alte und neue Spur
 * nicht in die Quere. Trysteros eigener Kanal hat 0 oder 1.
 */
function fastChannelId(roomId) {
  let h = 0;
  for (const c of roomId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 10 + (h % 240);
}

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
    // Team-Spiel: Kennungen aller Mitspieler (senden ohne Empfänger geht an sie)
    this.group = null;
    // Zuschauer in der Gruppe (nur beim Host): bekommen alles mit, zählen aber nicht für den
    // langsamsten Weg (sonst würden alle Spieler seltener senden, weil ein Zuschauer über den Server hängt)
    this.watchers = new Set();
    this.onMessage = null;
    this.onPeer = null;
    this.onChange = null;
    this.directPeers = new Set();
    this.serverPeers = new Set();
    this.known = new Set();
    this.serverReady = false;
    this.lastRecv = 0;
    this.ping = 0;
    // pro Mitspieler: letzte Nachricht (ms), letzte Pingmessungen und Ping
    this.recvAt = new Map();
    this.rtts = new Map();
    this.pings = new Map();
    // schnelle Spur pro direkt verbundenem Mitspieler: { pc, ch, ok } (ok: Gegenseite hat sie auch);
    // fastFail: Anlegen ging nicht, nicht jede Sekunde neu versuchen
    this.fast = new Map();
    this.fastFail = new Set();
    this.fastId = 0;
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
    const to = this.partner || (this.group?.size ? [...this.group] : null);
    if (!to || this.only === 'direkt') return;
    try {
      fetch(SUPABASE_REST, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ messages: [{ topic: this.roomId, event: 'm', payload: { f: this.id, to, d: data } }] }),
      }).catch(() => {});
    } catch {
      // dann merkt es der andere eben nach ein paar Sekunden ohne Nachricht
    }
  }

  /**
   * 'suche' (noch kein Partner), 'direkt', 'server' oder 'getrennt'. Im Team-Spiel der
   * langsamste Weg zu einem der Mitspieler (danach richtet sich, wie oft gesendet wird).
   */
  get mode() {
    const p = this.partner;
    if (!p && this.group) {
      let mode = 'direkt';
      for (const id of this.group) if (!this.watchers.has(id) && this.modeOf(id) === 'server') mode = 'server';
      return mode;
    }
    if (!p) return 'suche';
    return this.modeOf(p);
  }

  /** Weg zu einem Mitspieler: 'direkt', 'server' oder 'getrennt' */
  modeOf(id) {
    if (this.directPeers.has(id)) return 'direkt';
    if (this.serverPeers.has(id)) return 'server';
    return 'getrennt';
  }

  /** Partner meldet sich seit ein paar Sekunden nicht mehr */
  get lost() {
    return !!this.partner && performance.now() - this.lastRecv > LOST_AFTER;
  }

  /** ein Mitspieler meldet sich seit ein paar Sekunden nicht mehr (oder ist ganz weg) */
  lostPeer(id) {
    if (this.modeOf(id) === 'getrennt') return true;
    return performance.now() - (this.recvAt.get(id) ?? 0) > LOST_AFTER;
  }

  /** Ping zu einem Mitspieler (ms), sonst der zum Partner */
  pingOf(id) {
    return this.pings.get(id) || this.ping;
  }

  /** Team-Spiel: an diese Kennungen geht alles, was ohne Empfänger gesendet wird */
  setGroup(ids) {
    this.group = new Set(ids);
    const now = performance.now();
    for (const id of this.group) if (!this.recvAt.has(id)) this.recvAt.set(id, now);
    this._changed();
  }

  setPartner(id) {
    this.partner = id;
    this.lastRecv = performance.now();
    this._changed();
  }

  _startDirect(roomId) {
    try {
      this.room = joinRoom({ appId: APP_ID, relayConfig: { url: SUPABASE_WS, key: SUPABASE_KEY } }, roomId, {
        onJoinError: (e) => console.warn('Direktverbindung:', e.error),
      });
    } catch (err) {
      console.warn('Direktverbindung nicht möglich:', err);
      return;
    }
    this.fastId = fastChannelId(roomId);
    this.action = this.room.makeAction('m');
    this.action.onMessage = (data, ctx) => this._recv(data, ctx.peerId);
    this.room.onPeerJoin = (id) => {
      this.directPeers.add(id);
      this.fastFail.delete(id);
      this._openFast(id);
      this._seen(id);
      this._changed();
    };
    this.room.onPeerLeave = (id) => {
      this.directPeers.delete(id);
      this._closeFast(id);
      this._changed();
    };
  }

  /** schnelle Spur zu einem direkt verbundenen Mitspieler anlegen (pc: seine WebRTC-Verbindung) */
  _openFast(id, pc = this.room?.getPeers?.()[id]) {
    if (!pc || pc.connectionState === 'closed') return;
    const old = this.fast.get(id);
    if (old?.pc === pc && (old.ch.readyState === 'connecting' || old.ch.readyState === 'open')) return;
    this._closeFast(id);
    let ch;
    try {
      ch = pc.createDataChannel(FAST_LABEL, { negotiated: true, id: this.fastId, ordered: false, maxRetransmits: 0 });
    } catch (err) {
      this.fastFail.add(id);
      console.warn('Schnelle Spur nicht möglich:', err);
      return;
    }
    const f = { pc, ch, ok: false };
    ch.onopen = () => this._probe(f);
    ch.onclose = () => {
      if (this.fast.get(id) === f) this.fast.delete(id);
    };
    ch.onmessage = (e) => {
      if (this.closed || typeof e.data !== 'string' || e.data.length > 65536) return;
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      // die Gegenseite hat die Spur auch: ab jetzt darüber senden (und ihr das gleich zeigen)
      if (!f.ok) {
        f.ok = true;
        this._probe(f);
      }
      if (data?.t !== 'fp') this._recv(data, id);
    };
    this.fast.set(id, f);
  }

  /** bei der Gegenseite anklopfen, damit sie die Spur benutzt */
  _probe(f) {
    if (f.ch.readyState !== 'open') return;
    try {
      f.ch.send(FAST_PROBE);
    } catch {
      // dann beim nächsten Herzschlag
    }
  }

  _closeFast(id) {
    const f = this.fast.get(id);
    if (!f) return;
    this.fast.delete(id);
    try {
      f.ch.close();
    } catch {
      // schon zu
    }
  }

  _startServer(roomId) {
    try {
      this.rt = new RealtimeClient(SUPABASE_WS, { params: { apikey: SUPABASE_KEY } });
      const ch = this.rt.channel(roomId, { config: { broadcast: { self: false }, presence: { key: this.id } } });
      ch.on('broadcast', { event: 'm' }, (msg) => {
        const p = msg.payload;
        if (!p || (p.to && (Array.isArray(p.to) ? !p.to.includes(this.id) : p.to !== this.id))) return;
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

  /**
   * Nachricht an einen Mitspieler (Standard: Partner), an mehrere (Liste) oder ohne Empfänger an
   * die Gruppe (Team-Spiel) bzw. an alle im Raum (Lobby, solange noch niemand feststeht).
   */
  send(data, to = this.partner) {
    if (this.closed) return;
    if (!to && this.group) to = [...this.group];
    if (!to) {
      this.action?.send(data).catch(() => {});
      this._sendServer(data, null);
      return;
    }
    const ids = Array.isArray(to) ? to : [to];
    // jeder bekommt die Nachricht genau einmal: direkt, wenn es geht, sonst über den Server
    const direct = [];
    const server = [];
    for (const id of ids) {
      if (this.directPeers.has(id) && this.action) direct.push(id);
      else if (this.serverPeers.has(id)) server.push(id);
    }
    if (direct.length) {
      // klappt der direkte Weg gerade nicht (z. B. kurz beim Neuaushandeln), über den Server nachschicken
      this.action.send(data, { target: direct.length === 1 ? direct[0] : direct }).catch(() => {
        const back = direct.filter((id) => this.serverPeers.has(id));
        if (back.length) this._sendServer(data, back.length === 1 ? back[0] : back);
      });
    }
    if (server.length) this._sendServer(data, server.length === 1 ? server[0] : server);
  }

  /**
   * Wie send, nur bekommen es Mitspieler mit schneller Spur darüber: Es kann verloren gehen oder
   * andere Nachrichten überholen. Nur für Zustände, die der nächste ohnehin ablöst.
   * onlyFast: Mitspieler ohne schnelle Spur bekommen es gar nicht (Zusatz zu einer sicheren Nachricht)
   */
  sendFast(data, to = this.partner, onlyFast = false) {
    if (this.closed) return;
    if (!to && this.group) to = [...this.group];
    if (!to) {
      if (!onlyFast) this.send(data);
      return;
    }
    let text = null;
    const rest = [];
    for (const id of Array.isArray(to) ? to : [to]) {
      const f = this.directPeers.has(id) ? this.fast.get(id) : null;
      if (!f?.ok || f.ch.readyState !== 'open') {
        rest.push(id);
        continue;
      }
      // staut es sich gerade, diesen Zustand auslassen: der nächste ist ohnehin aktueller
      if (f.ch.bufferedAmount > FAST_MAX_BUFFER) continue;
      try {
        f.ch.send((text ??= JSON.stringify(data)));
      } catch {
        rest.push(id);
      }
    }
    if (rest.length && !onlyFast) this.send(data, rest.length === 1 ? rest[0] : rest);
  }

  _sendServer(data, to) {
    if (!this.serverReady) return;
    this.channel.send({ type: 'broadcast', event: 'm', payload: { f: this.id, to, d: data } }).catch(() => {});
  }

  _recv(data, from) {
    if (this.closed || !data || typeof data !== 'object') return;
    const now = performance.now();
    if (from === this.partner) this.lastRecv = now;
    this.recvAt.set(from, now);
    if (data.t === 'hb') {
      this.sendFast({ t: 'hb2', c: data.c }, from);
      return;
    }
    if (data.t === 'hb2') {
      const rtt = now - data.c;
      if (rtt >= 0 && rtt < 10000) {
        const l = this.rtts.get(from) || [];
        l.push(rtt);
        if (l.length > PING_SAMPLES) l.shift();
        this.rtts.set(from, l);
        // bei gerader Anzahl der kleinere der beiden mittleren Werte
        const v = [...l].sort((a, b) => a - b)[(l.length - 1) >> 1];
        this.pings.set(from, v);
        if (from === this.partner || !this.partner) this.ping = v;
      }
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
    if (this.partner || this.group?.size) this.sendFast({ t: 'hb', c: performance.now() });
    // schnelle Spur: fehlende anlegen (Trystero kann die Verbindung austauschen), unbestätigte anklopfen
    if (this.directPeers.size) {
      const peers = this.room?.getPeers?.() || {};
      for (const id of this.directPeers) {
        const f = this.fast.get(id);
        if (peers[id] && f?.pc !== peers[id] && !this.fastFail.has(id)) this._openFast(id, peers[id]);
        else if (f && !f.ok) this._probe(f);
      }
    }
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
    for (const id of [...this.fast.keys()]) this._closeFast(id);
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
