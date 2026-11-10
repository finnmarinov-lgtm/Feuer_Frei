import {
  CASE, CASE_ITEMS, LOCKER, TIERS, casesOpened, cleanLooks, coins, openCase, ownsCaseItem, rollItem, skinOf,
} from '../game/cosmetics.js';
import { FINISHES } from '../weapons/finishes.js';
import { locale } from '../i18n.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const NAME = Object.fromEntries(LOCKER.map((l) => [l.id, l.name]));
const num = (v) => Math.round(v).toLocaleString(locale());
// seltenste Stufe zuerst (für die Inhaltsliste)
const TIER_ORDER = Object.keys(TIERS).reverse();

// Die Rolle: so viele Karten laufen durch, die Karte an der Stelle WIN ist der Gewinn
const REEL = { cards: 48, win: 42, dur: 5600 };

const card = (item, cls = '') => `<div class="kcard tier-${item.tier} ${cls}" data-id="${item.id}">`
  + `<i class="swatch sw-${item.skin}"></i><span>${esc(NAME[item.target])}</span><b>${esc(FINISHES[item.skin].name)}</b></div>`;

// Kisten: links Münzen, die Kiste mit Preis, die Chancen und der ganze Inhalt; rechts im Bild
// dreht sich die Vorschau (wie in der Waffenkammer). Beim Öffnen läuft eine Rolle mit Karten
// durch und bleibt auf dem Gewinn stehen. Gewürfelt und gespeichert wird schon beim Klick
// (cosmetics.openCase), die Rolle zeigt das Ergebnis nur noch.
export class Kisten {
  constructor(game, audio, { show, looks, setLooks }) {
    this.g = game;
    this.audio = audio;
    this.show = show;
    this.getLooks = looks;
    this.putLooks = setLooks;
    this.roll = null;
    this.result = null;
    // Münzen aus dem laufenden Öffnen (Doppeltes, Jackpot) erst zeigen, wenn die Rolle steht
    this.hold = 0;
    this.hover = null;
    this.picked = null;
    $('btn-kiste-open').addEventListener('click', () => this._open());
    $('btn-roll-again').addEventListener('click', () => this._open());
    $('btn-roll-done').addEventListener('click', () => this._closeRoll());
    $('btn-roll-equip').addEventListener('click', () => this._equip());
    // während die Rolle läuft: ein Klick springt zum Ergebnis
    $('roll-stage').addEventListener('click', () => this._skip());
    const items = $('kisten-items');
    items.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      this.picked = b.dataset.id;
      this.render();
    });
    items.addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b || b.dataset.id === this.hover) return;
      this.hover = b.dataset.id;
      this._preview();
    });
    items.addEventListener('pointerleave', () => {
      this.hover = null;
      this._preview();
    });
  }

  open() {
    this.hover = this.picked = null;
    this.render();
    this.show('kisten');
  }

  /** Zurück: erst die Rolle schließen (läuft sie noch, zum Ergebnis springen); true = Bildschirm darf zu */
  back() {
    if (this.roll) {
      this._skip();
      return false;
    }
    if (!$('kiste-roll').hidden) {
      this._closeRoll();
      return false;
    }
    this.g.setShowcase(null);
    return true;
  }

  render() {
    const have = coins() - this.hold;
    $('kisten-coins').textContent = num(have);
    $('kiste-price').textContent = num(CASE.price);
    $('roll-price').textContent = num(CASE.price);
    const enough = have >= CASE.price;
    $('btn-kiste-open').disabled = !enough || !!this.roll;
    $('btn-roll-again').disabled = !enough || !!this.roll;
    $('kiste-need').textContent = enough ? '' : `Noch ${CASE.price - have} Münzen bis zur nächsten Kiste`;
    $('kisten-opened').textContent = num(casesOpened());
    $('kisten-odds').innerHTML = Object.entries(TIERS).map(([id, t]) => (
      `<span class="odd tier-${id}"><b>${esc(t.name)}</b><em data-roh>${num(t.chance * 100)} %</em></span>`)).join('');
    const owned = CASE_ITEMS.filter(ownsCaseItem).length;
    $('kisten-have').textContent = `${owned} / ${CASE_ITEMS.length}`;
    const sorted = [...CASE_ITEMS].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
    $('kisten-items').innerHTML = sorted.map((i) => card(i, `${ownsCaseItem(i) ? 'own' : ''} ${i.id === this.picked ? 'picked' : ''}`)).join('');
    this._preview();
  }

  // Vorschau rechts: Karte unter der Maus, sonst die angeklickte, sonst der Gewinn, sonst der Jackpot
  _preview() {
    const id = this.hover || this.picked;
    const item = (id && CASE_ITEMS.find((i) => i.id === id)) || this.result?.item
      || CASE_ITEMS.find((i) => i.target === 'wolf' && i.tier === 'jackpot');
    this.g.setShowcase({ target: item.target, skin: item.skin });
    $('kisten-label').innerHTML = `${esc(NAME[item.target])} <b>${esc(FINISHES[item.skin].name)}</b>`
      + `<small class="tier-${item.tier}">${esc(TIERS[item.tier].name)}</small>`;
  }

  // ---------- Öffnen ----------

  _open() {
    if (this.roll) return;
    const result = openCase();
    if (!result) {
      this.render();
      return;
    }
    this.audio.init();
    this.audio.play('caseOpen');
    this.result = null;
    this.hover = this.picked = null;
    this.hold = result.refund + result.bonus;
    const el = $('kiste-roll');
    el.hidden = false;
    el.className = 'rolling';
    $('roll-stage').hidden = false;
    $('roll-result').hidden = true;
    $('roll-coins').innerHTML = '';
    const strip = $('roll-strip');
    strip.innerHTML = Array.from({ length: REEL.cards }, (_, i) => card(i === REEL.win ? result.item : rollItem())).join('');
    const first = strip.children[0];
    const step = strip.children[1].offsetLeft - first.offsetLeft || 140;
    const w = first.offsetWidth || 132;
    // der Zeiger bleibt irgendwo auf der Gewinnkarte stehen, nicht immer genau in der Mitte
    const x1 = REEL.win * step + w / 2 + (Math.random() - 0.5) * w * 0.7;
    this.roll = { t0: performance.now(), x0: step * 1.5, x1, step, w, last: -1, tickAt: 0, result };
    // Sicherheit: im Hintergrund kommt kein requestAnimationFrame, das Ergebnis soll trotzdem erscheinen
    this.roll.timer = setTimeout(() => this._skip(), REEL.dur + 600);
    this.render();
    const frame = (now) => {
      if (!this.roll) return;
      this._frame(now);
      if (this.roll) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  _frame(now) {
    const r = this.roll;
    const u = Math.min(1, (now - r.t0) / REEL.dur);
    // schnell los, lange auslaufen
    const x = r.x0 + (r.x1 - r.x0) * (1 - (1 - u) ** 4);
    $('roll-strip').style.transform = `translateX(${-x}px)`;
    // Ticken, wenn die nächste Karte unter den Zeiger kommt
    const idx = Math.floor((x - r.w / 2) / r.step + 0.5);
    if (idx !== r.last) {
      r.last = idx;
      if (now - r.tickAt > 35) {
        r.tickAt = now;
        this.audio.play('caseTick');
      }
    }
    if (u >= 1) this._land();
  }

  _skip() {
    if (!this.roll) return;
    this.roll.t0 = -1e9;
    this._frame(performance.now());
  }

  // Die Rolle steht: Gewinnkarte hervorheben, kurz danach das Ergebnis groß zeigen
  _land() {
    const r = this.roll;
    clearTimeout(r.timer);
    this.roll = null;
    this.result = r.result;
    const { item } = r.result;
    const jackpot = item.tier === 'jackpot';
    $('roll-strip').children[REEL.win].classList.add('win');
    this.audio.play(jackpot ? 'jackpot' : 'caseWin', { tier: item.tier });
    if (jackpot) $('kiste-roll').classList.add('jackpot');
    this.landTimer = setTimeout(() => this._reveal(), jackpot ? 1300 : 800);
  }

  _reveal() {
    const { item, fresh, refund, bonus } = this.result;
    const jackpot = item.tier === 'jackpot';
    this.hold = 0;
    const el = $('kiste-roll');
    el.className = `done tier-${item.tier}${jackpot ? ' jackpot' : ''}`;
    $('roll-stage').hidden = true;
    $('roll-result').hidden = false;
    $('roll-tier').textContent = jackpot ? 'JACKPOT!' : TIERS[item.tier].name;
    $('roll-swatch').className = `swatch sw-${item.skin}`;
    $('roll-target').textContent = NAME[item.target];
    $('roll-name').textContent = FINISHES[item.skin].name;
    const plus = (n) => `<b class="plus" data-roh>+${num(n)}</b> <span>Münzen</span>`;
    let note = fresh ? '<span>Neuer Skin!</span>' : '<span>Schon in deiner Sammlung</span>';
    if (refund) note += ` ${plus(refund)}`;
    if (bonus) note += ` ${plus(bonus)}`;
    $('roll-note').innerHTML = note;
    this._equipState();
    if (jackpot) this._coinRain();
    this.render();
  }

  // Knopf "Ausrüsten": zeigt, ob der Gewinn schon getragen wird
  _equipState() {
    const { item } = this.result;
    const worn = skinOf(cleanLooks(this.getLooks(), true), item.target) === item.skin;
    $('btn-roll-equip').disabled = worn;
    $('btn-roll-equip').textContent = worn ? '✓ Ausgerüstet' : 'Ausrüsten';
  }

  _equip() {
    if (!this.result) return;
    const { item } = this.result;
    const looks = cleanLooks(this.getLooks(), true);
    if (item.target === 'spieler') looks.player = item.skin;
    else looks.weapons[item.target] = item.skin;
    this.putLooks(looks);
    this._equipState();
    this._preview();
  }

  // Jackpot: Münzen regnen über den Bildschirm
  _coinRain() {
    let html = '';
    for (let i = 0; i < 44; i++) {
      html += `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 1.6).toFixed(2)}s;`
        + `animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}"></i>`;
    }
    $('roll-coins').innerHTML = html;
  }

  _closeRoll() {
    clearTimeout(this.landTimer);
    if (this.roll) clearTimeout(this.roll.timer);
    this.roll = null;
    this.hold = 0;
    this.result = null;
    $('kiste-roll').hidden = true;
    $('roll-coins').innerHTML = '';
    this.render();
  }
}
