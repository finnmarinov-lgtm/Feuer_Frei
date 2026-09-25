import * as THREE from 'three';
import { BOMB, QUICK_CHAT, SLOT_KEYS, SPECIAL } from '../config.js';
import { HEADSHOT_ICON, weaponIcon } from './icons.js';
import { LOCKER, isDone, nextTaskFor, onProgress, stat, TASKS } from '../game/cosmetics.js';
import { FINISHES } from '../weapons/finishes.js';
import { MAP } from '../world/map.js';

const TARGET_NAME = Object.fromEntries(LOCKER.map((l) => [l.id, l.name]));
const skinName = (t) => `${TARGET_NAME[t.reward[0]]} · ${FINISHES[t.reward[1]].name}`;

const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} $`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Verbindungsart und Ping als kurzer Text */
export function netText(net) {
  if (net.bot) return `KI-Gegner · ${net.levelName}`;
  if (net.lost) return 'Verbindung unterbrochen …';
  const ms = net.ping ? ` · ${Math.round(net.ping)} ms` : '';
  if (net.mode === 'direkt') return `Direkt verbunden${ms}`;
  if (net.mode === 'server') return `Über Server${ms}`;
  return 'Verbindung unterbrochen …';
}
const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const SLOT_LABEL = { primary: '1', secondary: '2', knife: '3', util1: '4', util2: '5' };

const _p = new THREE.Vector3();

export class Hud {
  constructor(game) {
    this.g = game;
    this.el = {
      root: $('hud'), cross: $('crosshair'), hit: $('hitmarker'), dmgLayer: $('damage-layer'),
      round: $('hud-round'), timer: $('hud-timer'), phase: $('hud-phase'), targets: $('hud-targets'),
      money: $('hud-money'), moneyDelta: $('money-delta'), buyhint: $('buyhint'), buyhintTime: $('buyhint-time'),
      health: $('hud-health'), armor: $('hud-armor'), helmet: $('hud-helmet'),
      ammo: $('ammo'), weapon: $('hud-weapon'), mag: $('hud-mag'), reserve: $('hud-reserve'),
      slots: $('slots'), killfeed: $('killfeed'), center: $('center-msg'), roundEnd: $('round-end'),
      stats: $('stats-panel'), fps: $('fps'), scope: $('scope'), vignette: $('vignette'), flash: $('flash'),
      duelbar: $('duelbar'), duelMe: $('duel-me'), duelThem: $('duel-them'), duelScore: $('duel-score'),
      livesMe: $('lives-me'), livesThem: $('lives-them'), net: $('net-status'), dmgdir: $('dmgdir'),
      protect: $('protect'), chatMenu: $('chat-menu'), chatLog: $('chat-log'),
      usebar: $('usebar'), usebarLabel: $('usebar-label'), usebarFill: $('usebar-fill'), useprompt: $('useprompt'),
      waypoint: $('waypoint'), waypointText: $('waypoint-text'), bombBadge: $('bomb-badge'),
      special: $('special'), specialFill: $('special-fill'), specialHint: $('special-hint'),
      spectate: $('spectate'), specTag: $('spec-tag'), specWho: $('spec-who'), specHint: $('spec-hint'),
      specLeft: $('spec-left'), killbars: $('killbars'),
      tasks: $('tasks-hud'), toast: $('task-toast'),
    };
    this.spectating = false;
    // Aufgaben: Fortschritt live mitzählen, neue Skins kurz einblenden
    this.recent = null;
    this.toastT = 0;
    this.tasksT = 0;
    onProgress(({ task, done }) => {
      // bei mehreren Aufgaben auf einmal die, die am nächsten am Ziel ist
      if (this.recent && this.recent.t > 3.9 && this.recent.task.goal < task.goal && !done) return;
      this.recent = { task, t: 4, flash: 0.6 };
      this.tasksT = 0;
      if (done) this._toast(task);
    });
    this.refreshKeys();
    this.chatOpen = false;
    this.chatT = 0;
    this.chats = [];
    this.mode = 'training';
    this.dirT = 0;
    this.dirFrom = new THREE.Vector3();
    this.hitT = 0;
    this.centerT = 0;
    this.slotsT = 0;
    this.moneyT = 0;
    this.flashT = 0;
    this.flashDur = 0;
    this.flashAmt = 0;
    this.hurtT = 0;
    this.numbers = [];
    this.kills = [];
    this.fpsFrames = 0;
    this.fpsTime = 0;
  }

  show(on) {
    this.el.root.hidden = !on;
  }

  /** Tastenhinweise an die eigene Tastenbelegung anpassen (nach dem Umbelegen erneut aufrufen) */
  refreshKeys() {
    const input = this.g.input;
    const key = (a) => escapeHtml(input.label(a));
    this.el.buyhint.querySelector('kbd').textContent = input.label('buy');
    this.el.special.querySelector('kbd').textContent = input.label('special');
    this.el.chatMenu.innerHTML = '<div class="head">Schnellnachricht</div>' +
      QUICK_CHAT.map((t, i) => `<div data-chat="${i}"><kbd>${key('slot' + (i + 1))}</kbd>${escapeHtml(t)}</div>`).join('');
    // dynamische Hinweise beim nächsten Anzeigen neu aufbauen
    this.el.useprompt._html = null;
    this.el.specialHint._touch = null;
  }

  /** 'training' oder 'duel': Punktestand, Leben und Verbindung nur im Duell */
  setMode(mode) {
    this.mode = mode;
    const duel = mode === 'duel';
    this.el.duelbar.hidden = !duel;
    this.el.net.hidden = !duel;
    this.el.targets.hidden = duel;
    this.el.protect.hidden = true;
  }

  /** Liste der Schnellnachrichten zeigen oder verstecken (schließt sich nach 5 s von selbst) */
  toggleChat(open) {
    this.chatOpen = open;
    this.chatT = 5;
    this.el.chatMenu.hidden = !open;
  }

  /** Nachricht im Verlauf links unten, verschwindet nach ein paar Sekunden */
  chatLine(name, text, mine) {
    const el = document.createElement('div');
    el.className = 'chat' + (mine ? ' mine' : '');
    el.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    this.el.chatLog.appendChild(el);
    this.chats.push({ el, t: 6 });
    if (this.chats.length > 4) this.chats.shift().el.remove();
  }

  /** Roter Bogen am Bildschirmrand in Richtung der Schadensquelle */
  hitFrom(pos) {
    this.dirFrom.copy(pos);
    this.dirT = 1.2;
  }

  // DOM nur anfassen, wenn sich der Wert ändert (spart dem Browser Layout-Arbeit pro Bild)
  _text(el, v) {
    if (el._v !== v) {
      el._v = v;
      el.textContent = v;
    }
  }

  _set(style, prop, v) {
    if (style[prop] !== v) style[prop] = v;
  }

  _setVar(el, name, v) {
    const key = '_var' + name;
    if (el[key] !== v) {
      el[key] = v;
      el.style.setProperty(name, v);
    }
  }

  /**
   * Kill-Cam und Gegner-Sicht: Schriftzug unten, in der Kill-Cam Kinobalken; null = aus.
   * info: { view ('replay', 'live', 'death'), tag, who, hint, left }
   */
  spectate(info) {
    const el = this.el;
    const on = !!info;
    if (this.spectating !== on) {
      this.spectating = on;
      el.root.classList.toggle('spectating', on);
    }
    this._show(el.killbars, on && info.view === 'replay');
    this._show(el.spectate, on && !!(info.tag || info.hint || info.left));
    if (!on) return;
    el.spectate.classList.toggle('live', info.view === 'live');
    this._show(el.specTag.parentElement, !!info.tag);
    this._text(el.specTag, info.tag);
    this._text(el.specWho, info.who);
    this._text(el.specHint, info.hint);
    this._text(el.specLeft, info.left);
    this._show(el.specLeft, !!info.left);
    this._show(el.specHint, !!info.hint);
  }

  // neuer Skin: Einblendung oben mit Klang
  _toast(task) {
    const el = this.el.toast;
    el.querySelector('.title').textContent = 'Skin freigeschaltet!';
    el.querySelector('.sub').textContent = `${skinName(task)} · ${task.text}`;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.toastT = 4.5;
    this.g.audio.play('specialReady');
  }

  /**
   * Live-Fortschritt links oben: die nächste Aufgabe zur Waffe in der Hand (im Training die
   * Klappziele), dazu kurz die Aufgabe, bei der sich gerade etwas getan hat.
   */
  _tasks(dt) {
    const el = this.el;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el.toast.hidden = true;
    }
    if (this.recent) {
      this.recent.t -= dt;
      this.recent.flash -= dt;
      if (this.recent.t <= 0) this.recent = null;
    }
    this.tasksT -= dt;
    if (this.tasksT > 0) return;
    this.tasksT = 0.25;
    const g = this.g;
    const list = [];
    let focus = null;
    if (g.mode === 'duel') {
      focus = g.weapons.active?.id;
      const t = focus && nextTaskFor(focus);
      if (t) list.push(t);
    } else {
      const t = TASKS.find((x) => x.stat === 'targets');
      if (t && !isDone(t)) list.push(t);
      focus = 'spieler';
    }
    // dazu kurz, was sich gerade woanders getan hat (z. B. Bombe gelegt, Luftschlag), sonst reicht
    // die Aufgabe der Waffe in der Hand
    const r = this.recent?.task;
    if (r && r.reward[0] !== focus && !list.includes(r)) list.push(r);
    const html = list.map((t) => {
      const v = Math.min(t.goal, stat(t.stat));
      const done = isDone(t);
      const pct = Math.round((v / t.goal) * 100);
      const hot = this.recent?.task === t && this.recent.flash > 0;
      return `<div class="trk${hot ? ' hot' : ''}${done ? ' done' : ''}"><b>${escapeHtml(skinName(t))}</b>`
        + `<span>${escapeHtml(t.text)}</span><div class="prog"><i style="width:${pct}%"></i></div><em>${done ? '✓' : `${v} / ${t.goal}`}</em></div>`;
    }).join('');
    if (el.tasks._html !== html) {
      el.tasks._html = html;
      el.tasks.innerHTML = html;
    }
    this._show(el.tasks, !!list.length && !this.spectating);
  }

  reset() {
    this.spectate(null);
    this.recent = null;
    this.toastT = 0;
    this.el.toast.hidden = true;
    this.el.roundEnd.hidden = true;
    for (const k of ['usebar', 'useprompt', 'waypoint', 'bombBadge', 'specialHint']) this.el[k].hidden = true;
    this.el.flash.style.opacity = 0;
    this.flashT = this.hurtT = this.dirT = 0;
    for (const n of this.numbers) n.el.remove();
    this.numbers = [];
    this.el.killfeed.innerHTML = '';
    this.kills = [];
    this.el.chatLog.innerHTML = '';
    this.chats = [];
    this.toggleChat(false);
  }

  setCrosshairColor(c) {
    document.documentElement.style.setProperty('--cross', c);
  }

  onWeaponChange() {
    const inv = this.g.weapons.inv;
    this.el.slots.innerHTML = SLOT_KEYS.map((k) => {
      const w = inv.slots[k];
      const cls = ['slot', inv.current === k ? 'active' : '', w ? '' : 'empty'].join(' ');
      return `<div class="${cls}"><span class="key">${SLOT_LABEL[k]}</span><span>${w ? w.def.name : '–'}</span></div>`;
    }).join('');
    this.el.slots.classList.add('show');
    this.slotsT = 2;
    this.onAmmo();
  }

  onAmmo() {
    const w = this.g.weapons.active;
    if (!w) return;
    this.el.weapon.textContent = this.g.weaponName(w.def);
    const hasAmmo = !!w.def.mag;
    this.el.mag.textContent = hasAmmo ? w.mag : '';
    this.el.reserve.textContent = hasAmmo ? `/ ${w.reserve}` : '';
    this.el.ammo.classList.toggle('empty', hasAmmo && w.mag === 0);
  }

  onMoney(delta) {
    this.el.money.textContent = fmtMoney(this.g.match.money);
    if (!delta) return;
    const d = this.el.moneyDelta;
    d.textContent = `${delta > 0 ? '+' : '−'}${fmtMoney(Math.abs(delta))}`;
    d.classList.toggle('neg', delta < 0);
    d.classList.add('show');
    this.moneyT = 1.6;
    this.g.buyMenu?.refresh();
  }

  /** shield: Gegner hat Spawn-Schutz, der Treffer zählt nicht */
  hitmarker(head, kill, shield = false) {
    this.el.hit.classList.toggle('shield', shield);
    this.el.hit.classList.toggle('head', head && !shield);
    this.el.hit.style.transform = kill ? 'scale(1.35)' : 'scale(1)';
    this.hitT = kill ? 0.35 : 0.22;
  }

  damageNumber(point, amount, head) {
    if (amount <= 0) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (head ? ' head' : '');
    el.textContent = amount;
    this.el.dmgLayer.appendChild(el);
    this.numbers.push({ el, pos: point.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
    if (this.numbers.length > 24) this.numbers.shift().el.remove();
  }

  /**
   * Eintrag im Kill-Feed: Schütze, Waffen-Symbol (dazu das Kopfschuss-Zeichen), Opfer.
   * weapon: Waffen-Id bzw. 'karambit', 'butterfly', 'luftschlag', 'bombe'; label: Name der Waffe (Tooltip);
   * killerTeam/victimTeam: 'host' (Rot) oder 'guest' (Blau) für die Namensfarbe;
   * mine: eigener Abschuss oder eigener Tod (hervorgehoben)
   */
  killfeed({ weapon, label = '', head = false, reward = 0, killer = 'Du', victim = 'Ziel', mine = true, killerTeam = null, victimTeam = null }) {
    const el = document.createElement('div');
    el.className = 'kill' + (mine ? '' : ' other');
    const who = (s, team) => `<b${team ? ` class="t-${team}"` : ''}>${escapeHtml(s)}</b>`;
    const icon = weaponIcon(weapon, escapeHtml(label)) + (head ? HEADSHOT_ICON : '');
    const line = killer === victim
      ? `${who(killer, killerTeam)}${icon}<span class="self">${killer === 'Du' ? 'selbst erwischt' : 'hat sich selbst erwischt'}</span>`
      : `${who(killer, killerTeam)}${icon}${who(victim, victimTeam)}`;
    el.innerHTML = line + (reward ? `<span class="m">+${fmtMoney(reward)}</span>` : '');
    this.el.killfeed.prepend(el);
    this.kills.push({ el, t: 6 });
    if (this.kills.length > 5) this.kills.shift().el.remove();
  }

  /** Spezialleiste ist voll */
  specialReady() {
    this.message('Luftschlag bereit!', this.g.input.touch
      ? 'Tippe auf den Luftschlag-Knopf und wähle das Ziel'
      : `${this.g.input.label('special')} drücken, Ziel anschauen, Linksklick`, 2.6);
  }

  message(title, sub, duration = 2.5) {
    this.el.center.querySelector('.title').textContent = title;
    this.el.center.querySelector('.sub').textContent = sub || '';
    this.el.center.classList.add('show');
    this.centerT = duration;
  }

  roundEnd(won, reason, bonus, last, draw = false) {
    const r = this.el.roundEnd;
    r.className = won ? 'win' : draw ? 'draw' : 'loss';
    r.querySelector('.title').textContent = won ? 'Runde gewonnen' : draw ? 'Unentschieden' : 'Runde verloren';
    r.querySelector('.sub').textContent = reason + (last ? ' · Gleich kommt die Auswertung' : '');
    r.querySelector('.bonus').textContent = `+${fmtMoney(bonus)} ${won ? 'Siegprämie' : 'Niederlagenbonus'}`;
    r.hidden = false;
    this.el.center.classList.remove('show');
  }

  flashbang(duration, amount) {
    this.flashDur = Math.max(this.flashT, duration);
    this.flashT = this.flashDur;
    this.flashAmt = Math.min(1, amount * 1.3);
  }

  hurt(amount) {
    this.hurtT = Math.min(1, this.hurtT + amount / 40);
  }

  showStats(on) {
    const el = this.el.stats;
    if (!on) {
      el.hidden = true;
      return;
    }
    const m = this.g.match;
    const s = m.stats;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const hs = s.kills ? Math.round((s.heads / s.kills) * 100) : 0;
    const html = m.duel
      ? `<h3>1 gegen 1 · ${escapeHtml(m.names[m.them])} · Runde ${m.round}</h3>
      <div class="row"><span>Rundensiege</span><b>${m.wins[m.me]} : ${m.wins[m.them]}</b></div>
      <div class="row"><span>Ausgeschaltet / Tode</span><b>${s.kills} / ${s.deaths}</b></div>
      <div class="row"><span>Treffergenauigkeit</span><b>${acc} %</b></div>
      <div class="row"><span>Kopfschüsse</span><b>${hs} %</b></div>
      <div class="row"><span>Schaden</span><b>${s.damage}</b></div>
      <div class="row"><span>Verbindung</span><b>${netText(m.net)}</b></div>`
      : `<h3>Training · Runde ${m.round}</h3>
      <div class="row"><span>Ziele umgelegt</span><b>${s.kills}</b></div>
      <div class="row"><span>Treffergenauigkeit</span><b>${acc} %</b></div>
      <div class="row"><span>Kopfschüsse</span><b>${hs} %</b></div>
      <div class="row"><span>Schaden</span><b>${s.damage}</b></div>
      <div class="row"><span>Granaten geworfen</span><b>${s.grenades}</b></div>
      <div class="row"><span>Geld ausgegeben</span><b>${fmtMoney(s.spent)}</b></div>`;
    if (el._html !== html) {
      el._html = html;
      el.innerHTML = html;
    }
    el.hidden = false;
  }

  // Punktestand, Leben (Punkte unter den Namen) und Verbindung
  _duel(m) {
    const el = this.el;
    this._text(el.duelMe, m.names[m.me]);
    this._text(el.duelThem, m.names[m.them]);
    this._text(el.duelScore, `${m.wins[m.me]} : ${m.wins[m.them]}`);
    const pips = (n) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, m.cfg.lives - n));
    this._text(el.livesMe, m.cfg.lives > 1 ? pips(m.lives[m.me]) : '');
    this._text(el.livesThem, m.cfg.lives > 1 ? pips(m.lives[m.them]) : '');
    this._text(el.net, netText(m.net));
    el.net.classList.toggle('bad', m.net.lost || m.net.mode === 'getrennt');
    el.net.classList.toggle('server', m.net.mode === 'server');
    // eigener Spawn-Schutz mit Restzeit
    const guarded = m.phase === 'live' && m.protectT > 0 && this.g.player.alive;
    if (el.protect.hidden !== !guarded) el.protect.hidden = !guarded;
    if (guarded) this._text(el.protect, `Spawn-Schutz · ${m.protectT.toFixed(1).replace('.', ',')} s`);
  }

  _show(el, on) {
    if (el.hidden !== !on) el.hidden = !on;
  }

  // Bombenmodus: Fortschritt beim Legen/Entschärfen, Hinweis "E halten", Wegmarke, Bomben-Symbol
  _bomb(m, camera) {
    const el = this.el;
    const g = this.g;
    const on = !!m.bombMode;
    const busy = on && m.busy;
    this._show(el.usebar, busy);
    if (busy) {
      const planting = m.plantT > 0;
      this._text(el.usebarLabel, planting ? 'Bombe wird gelegt …' : 'Bombe wird entschärft …');
      const k = planting ? m.plantT / BOMB.plantTime : m.defuseT / BOMB.defuseTime;
      this._set(el.usebarFill.style, 'width', `${Math.min(100, k * 100).toFixed(1)}%`);
      el.usebar.classList.toggle('defuse', !planting);
    }
    const action = on && !busy ? m.useAction : null;
    this._show(el.useprompt, !!action);
    if (action) {
      const what = action === 'plant' ? 'Bombe legen' : 'Bombe entschärfen';
      const html = g.input.touch ? `Knopf halten: ${what}` : `<kbd>${escapeHtml(g.input.label('use'))}</kbd> halten: ${what}`;
      if (el.useprompt._html !== html) {
        el.useprompt._html = html;
        el.useprompt.innerHTML = html;
      }
    }
    const p = g.player;
    this._show(el.bombBadge, on && m.attacking && !m.bomb && p.alive && (m.phase === 'freeze' || m.phase === 'live'));

    // Wegmarke: zur gelegten Bombe, sonst zum Bombenplatz dieser Runde
    let target = null;
    let label = '';
    if (on && (m.phase === 'freeze' || m.phase === 'live')) {
      if (m.bomb && !m.bomb.done) {
        target = m.bomb.pos;
        label = 'Bombe';
      } else if (!m.bomb) {
        target = m.site;
        label = m.attacking ? 'Bombenplatz' : 'Dein Platz';
      }
    }
    let visible = false;
    if (target) {
      const d = Math.hypot(target.x - p.feet.x, target.z - p.feet.z);
      _p.copy(target).y += 1.3;
      _p.project(camera);
      if (d > 3.5 && _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1) {
        visible = true;
        const w = window.innerWidth, h = window.innerHeight;
        const x = Math.min(w - 40, Math.max(40, (_p.x * 0.5 + 0.5) * w));
        const y = Math.min(h - 60, Math.max(60, (-_p.y * 0.5 + 0.5) * h));
        this._set(el.waypoint.style, 'transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
        this._text(el.waypointText, `${label} · ${Math.round(d)} m`);
        el.waypoint.classList.toggle('armed', !!m.bomb);
      }
    }
    this._show(el.waypoint, visible);
  }

  // Spezialleiste (Luftschlag) und Hinweis beim Zielen
  _special(m) {
    const el = this.el;
    // auf Karten ohne Luftschlag (Lagerhalle) keine Leiste
    this._show(el.special, !!MAP.airstrike);
    const k = Math.min(1, m.special / SPECIAL.charge);
    this._set(el.specialFill.style, 'width', `${(k * 100).toFixed(1)}%`);
    const ready = k >= 1;
    if (el.special._ready !== ready) {
      el.special._ready = ready;
      el.special.classList.toggle('ready', ready);
    }
    const targeting = this.g.airstrikes.targeting;
    this._show(el.specialHint, targeting);
    const touch = this.g.input.touch;
    if (targeting && el.specialHint._touch !== touch) {
      el.specialHint._touch = touch;
      el.specialHint.innerHTML = touch
        ? 'Luftschlag: Ziel anschauen · roter Knopf bestätigt · Flugzeug bricht ab'
        : `Luftschlag: Ziel anschauen · <kbd>Linksklick</kbd> bestätigen · <kbd>Rechtsklick</kbd> oder <kbd>${escapeHtml(this.g.input.label('special'))}</kbd> abbrechen`;
    }
  }

  update(dt, camera, fps) {
    const g = this.g;
    const m = g.match;
    const p = g.player;
    const ws = g.weapons;
    const el = this.el;

    this._text(el.round, m.roundLabel);
    this._tasks(dt);
    if (m.duel) this._duel(m);
    this._bomb(m, camera);
    this._special(m);
    let phase = '', time = m.timer;
    // liegt die Bombe, zeigt die Uhr ihre Restzeit
    const ticking = m.phase === 'live' && m.bomb && !m.bomb.done;
    if (m.phase === 'freeze') phase = 'Kaufzeit';
    else if (ticking) {
      phase = 'Bombe tickt';
      time = m.bomb.t;
    } else if (m.phase === 'live') phase = m.bombMode ? (m.attacking ? 'Angriff' : 'Verteidigung') : 'Runde läuft';
    else if (m.phase === 'end') phase = 'Rundenende';
    this._text(el.phase, phase);
    this._text(el.timer, fmtTime(time));
    el.timer.classList.toggle('low', ticking || (m.phase === 'live' && time <= 10));
    this._text(el.targets, m.phase === 'live' || m.phase === 'end'
      ? `Ziele: ${g.targets.total - g.targets.remaining} / ${g.targets.total}` : '');
    this._text(el.health, String(Math.ceil(p.health)));
    el.health.parentElement.classList.toggle('hurt', p.health <= 25);
    this._text(el.armor, String(Math.ceil(p.armor)));
    if (el.helmet.hidden !== !p.helmet) el.helmet.hidden = !p.helmet;
    el.ammo.classList.toggle('reloading', ws.reloading);

    const canBuy = m.canBuy;
    const hideHint = !canBuy || g.buyMenu.open;
    if (el.buyhint.hidden !== hideHint) el.buyhint.hidden = hideHint;
    if (canBuy) this._text(el.buyhintTime, `· noch ${Math.ceil(m.buyTimeLeft)} s`);

    // Fadenkreuz spreizt sich mit der echten Streuung
    const def = ws.active?.def;
    // Kill-Cam und Gegner-Sicht: sein Zielfernrohr, sonst ein ruhiges Fadenkreuz
    const kc = g.killcam;
    const spec = this.spectating;
    const scoped = spec ? kc.scoped : ws.scoped;
    // Granate: nur ein Punkt in der Mitte, damit man sieht, wohin man wirft
    const grenade = !spec && def?.anim === 'grenade';
    if (el.cross._dotOnly !== grenade) {
      el.cross._dotOnly = grenade;
      el.cross.classList.toggle('dot-only', grenade);
    }
    const showCross = spec ? kc.firstPerson && !scoped && kc.ads < 0.5 : !!def && !scoped && (grenade || ws.ads < 0.5);
    this._set(el.cross.style, 'display', showCross ? '' : 'none');
    if (showCross && (grenade || spec)) {
      if (spec) this._setVar(el.cross, '--gap', '6px');
      this._set(el.cross.style, 'opacity', '1');
    } else if (showCross) {
      const px = Math.tan(ws.spread / 1000) * (window.innerHeight / 2) / Math.tan((camera.fov * Math.PI) / 360);
      this._setVar(el.cross, '--gap', `${Math.round(4 + Math.min(px, 90))}px`);
      this._set(el.cross.style, 'opacity', String(1 - ws.ads * 2));
    }
    el.scope.classList.toggle('on', scoped);

    this.hitT -= dt;
    this._set(el.hit.style, 'opacity', this.hitT > 0 ? String(Math.min(1, this.hitT * 6)) : '0');

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      _p.copy(n.pos).project(camera);
      if (n.t > 0.9 || _p.z > 1) {
        n.el.remove();
        this.numbers.splice(i, 1);
        continue;
      }
      const x = (_p.x * 0.5 + 0.5) * window.innerWidth + n.dx * n.t;
      const y = (-_p.y * 0.5 + 0.5) * window.innerHeight - 50 * n.t;
      n.el.style.left = `${x}px`;
      n.el.style.top = `${y}px`;
      n.el.style.opacity = String(1 - Math.max(0, (n.t - 0.5) / 0.4));
    }
    for (let i = this.kills.length - 1; i >= 0; i--) {
      const k = this.kills[i];
      k.t -= dt;
      k.el.style.opacity = String(Math.min(1, k.t));
      if (k.t <= 0) {
        k.el.remove();
        this.kills.splice(i, 1);
      }
    }
    for (let i = this.chats.length - 1; i >= 0; i--) {
      const c = this.chats[i];
      c.t -= dt;
      c.el.style.opacity = String(Math.min(1, c.t));
      if (c.t <= 0) {
        c.el.remove();
        this.chats.splice(i, 1);
      }
    }
    if (this.chatOpen) {
      this.chatT -= dt;
      if (this.chatT <= 0) this.toggleChat(false);
    }

    this.centerT -= dt;
    if (this.centerT <= 0) el.center.classList.remove('show');
    if (m.phase !== 'end') el.roundEnd.hidden = true;
    this.slotsT -= dt;
    if (this.slotsT <= 0) el.slots.classList.remove('show');
    this.moneyT -= dt;
    if (this.moneyT <= 0) el.moneyDelta.classList.remove('show');

    // Blendung: erst voll weiß, dann langsam ausblenden
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = this.flashT / this.flashDur;
      this._set(el.flash.style, 'opacity', String(this.flashAmt * Math.min(1, k * 2.2)));
    } else {
      this._set(el.flash.style, 'opacity', '0');
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 0.8);
    this._set(el.vignette.style, 'opacity', String(Math.max(this.hurtT, p.health < 30 && p.alive ? 0.35 : 0)));

    // Schadensrichtung relativ zur Blickrichtung (0 = vorne, im Uhrzeigersinn)
    if (this.dirT > 0) {
      this.dirT -= dt;
      const dx = this.dirFrom.x - p.feet.x;
      const dz = this.dirFrom.z - p.feet.z;
      const angle = Math.atan2(-dx, -dz) - p.yaw;
      this._set(el.dmgdir.style, 'transform', `translate(-50%, -50%) rotate(${(-angle * 180) / Math.PI}deg)`);
      this._set(el.dmgdir.style, 'opacity', String(Math.min(1, this.dirT * 1.5)));
    } else {
      this._set(el.dmgdir.style, 'opacity', '0');
    }

    if (el.fps.hidden !== !g.settings.showFps) el.fps.hidden = !g.settings.showFps;
    if (g.settings.showFps) {
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        this._text(el.fps, `${Math.round(this.fpsFrames / this.fpsTime)} FPS`);
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
    }
  }
}
