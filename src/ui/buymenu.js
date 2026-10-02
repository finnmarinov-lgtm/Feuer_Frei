import { SHOP, WEAPONS, ARMOR } from '../config.js';
import { geld } from '../i18n.js';

const $ = (id) => document.getElementById(id);
const fmtMoney = geld;

const INFO = {
  natter: 'Standardpistole, genau im Stand',
  kobra: 'Kopftreffer sind tödlich',
  falke: 'Genau auch im Laufen',
  keiler: 'Nah ein Treffer, weit schwach',
  wolf: 'Stark, aber mit Rückstoß',
  luchs: 'Rotpunktvisier, ruhiger Rückstoß',
  adler: 'Ein Kopftreffer reicht',
  vest: 'Weniger Schaden am Körper',
  helmet: 'Schützt auch den Kopf',
  he: 'Schaden im Umkreis',
  flash: 'Blendet, wer hinsieht',
  smoke: '16 Sekunden Sichtschutz',
};

export class BuyMenu {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.root = $('buymenu');
    this.grid = $('buy-grid');
    this.money = $('buy-money');
    this.time = $('buy-time');
    this.items = {};
    this._build();
    $('buy-close').addEventListener('click', () => this.g.closeBuyMenu());
  }

  _build() {
    this.grid.innerHTML = '';
    for (const cat of SHOP) {
      const col = document.createElement('div');
      col.className = 'buy-col';
      col.innerHTML = `<h3>${cat.title}</h3>`;
      for (const id of cat.items) {
        const b = document.createElement('button');
        b.className = 'buy-item';
        const def = WEAPONS[id];
        const name = def ? def.name : ARMOR[id].name;
        const type = def ? def.type : 'Ausrüstung';
        const dmg = def?.pellets ? `${def.damage}×${def.pellets}` : def?.damage;
        const stat = def?.damage ? `${dmg} Schaden · ${def.rpm}/min · ${def.mag} Schuss` : INFO[id];
        b.innerHTML = `<span class="n">${name}</span><span class="t">${type}${def?.damage ? ' · ' + INFO[id] : ''}</span>
          <span class="p"></span><span class="stat">${stat}</span><span class="why"></span>`;
        b.addEventListener('click', () => {
          this.g.match.buy(id);
          this.refresh();
        });
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this.g.match.refund(id)) this.refresh();
        });
        col.appendChild(b);
        this.items[id] = b;
      }
      this.grid.appendChild(col);
    }
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.refresh();
  }

  hide() {
    this.open = false;
    this.root.hidden = true;
  }

  refresh() {
    if (!this.open) return;
    const m = this.g.match;
    const inv = this.g.weapons.inv;
    const p = this.g.player;
    this.money.textContent = fmtMoney(m.money);
    this.time._v = this._timeText();
    this.time.textContent = this.time._v;
    for (const [id, b] of Object.entries(this.items)) {
      const why = m.blockReason(id);
      const owned = WEAPONS[id] && WEAPONS[id].slot !== 'utility'
        ? inv.has(id)
        : id === 'vest' ? p.armor >= ARMOR.points : id === 'helmet' ? p.helmet && p.armor >= ARMOR.points : false;
      b.classList.toggle('owned', owned);
      b.classList.toggle('blocked', !!why && !owned);
      const price = m.priceOf(id);
      b.querySelector('.p').textContent = price ? fmtMoney(price) : 'gratis';
      b.querySelector('.why').textContent = why && !owned ? why : '';
    }
  }

  _timeText() {
    const m = this.g.match;
    if (!m.canBuy) return 'Kaufen gerade nicht möglich';
    // freies Training: keine Kaufzeit
    if (!Number.isFinite(m.buyTimeLeft)) return 'Kaufen jederzeit';
    return `Kaufzeit noch ${Math.ceil(m.buyTimeLeft)} s`;
  }

  // pro Bild: die Kaufzeit nur neu schreiben, wenn sich die Sekunde ändert (jedes Schreiben lässt den
  // Browser neu rechnen und die Übersetzung erneut laufen)
  tick() {
    if (!this.open) return;
    const text = this._timeText();
    if (this.time._v !== text) {
      this.time._v = text;
      this.time.textContent = text;
    }
  }
}
