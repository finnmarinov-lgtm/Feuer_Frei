import * as THREE from 'three';
import { SLOT_KEYS } from '../config.js';

const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} $`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Verbindungsart und Ping als kurzer Text */
export function netText(net) {
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
      protect: $('protect'),
    };
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

  /** 'training' oder 'duel': Punktestand, Leben und Verbindung nur im Duell */
  setMode(mode) {
    this.mode = mode;
    const duel = mode === 'duel';
    this.el.duelbar.hidden = !duel;
    this.el.net.hidden = !duel;
    this.el.targets.hidden = duel;
    this.el.protect.hidden = true;
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

  reset() {
    this.el.roundEnd.hidden = true;
    this.el.flash.style.opacity = 0;
    this.flashT = this.hurtT = this.dirT = 0;
    for (const n of this.numbers) n.el.remove();
    this.numbers = [];
    this.el.killfeed.innerHTML = '';
    this.kills = [];
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
    this.el.weapon.textContent = w.def.name;
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

  killfeed(weaponName, head, reward, killer = 'Du', victim = 'Ziel', mine = true) {
    const el = document.createElement('div');
    el.className = 'kill' + (mine ? '' : ' other');
    const who = (s) => `<b>${escapeHtml(s)}</b>`;
    const line = killer === victim
      ? `${who(killer)}<span class="w">[${weaponName}]</span>${killer === 'Du' ? 'selbst erwischt' : 'hat sich selbst erwischt'}`
      : `${who(killer)}<span class="w">[${weaponName}]</span>${who(victim)}${head ? ' <span class="h">Kopfschuss</span>' : ''}`;
    el.innerHTML = line + (reward ? `<span class="m">+${fmtMoney(reward)}</span>` : '');
    this.el.killfeed.prepend(el);
    this.kills.push({ el, t: 5 });
    if (this.kills.length > 5) this.kills.shift().el.remove();
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

  update(dt, camera, fps) {
    const g = this.g;
    const m = g.match;
    const p = g.player;
    const ws = g.weapons;
    const el = this.el;

    this._text(el.round, m.roundLabel);
    if (m.duel) this._duel(m);
    let phase = '', time = m.timer;
    if (m.phase === 'freeze') phase = 'Kaufzeit';
    else if (m.phase === 'live') phase = 'Runde läuft';
    else if (m.phase === 'end') phase = 'Rundenende';
    this._text(el.phase, phase);
    this._text(el.timer, fmtTime(time));
    el.timer.classList.toggle('low', m.phase === 'live' && time <= 10);
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
    const scoped = ws.scoped;
    const showCross = !!def && !scoped && def.anim !== 'grenade' && ws.ads < 0.5;
    this._set(el.cross.style, 'display', showCross ? '' : 'none');
    if (showCross) {
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
