import { SHOP, WEAPONS, ARMOR } from '../config.js';

const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} $`;

const INFO = {
  natter: 'Standardpistole, genau im Stand',
  kobra: 'Kopftreffer sind tödlich',
  falke: 'Genau auch im Laufen',
  wolf: 'Stark, aber mit Rückstoß',
  adler: 'Ein Körpertreffer reicht',
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
        const stat = def?.damage ? `${def.damage} Schaden · ${def.rpm}/min · ${def.mag} Schuss` : INFO[id];
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
    this.time.textContent = m.canBuy ? `Kaufzeit noch ${Math.ceil(m.buyTimeLeft)} s` : 'Kaufen gerade nicht möglich';
    for (const [id, b] of Object.entries(this.items)) {
      const why = m.blockReason(id);
      const owned = WEAPONS[id] && WEAPONS[id].slot !== 'utility'
        ? inv.has(id)
        : id === 'vest' ? p.armor >= 100 : id === 'helmet' ? p.helmet && p.armor >= 100 : false;
      b.classList.toggle('owned', owned);
      b.classList.toggle('blocked', !!why && !owned);
      b.querySelector('.p').textContent = fmtMoney(m.priceOf(id));
      b.querySelector('.why').textContent = why && !owned ? why : '';
    }
  }

  tick() {
    if (!this.open) return;
    this.time.textContent = this.g.match.canBuy ? `Kaufzeit noch ${Math.ceil(this.g.match.buyTimeLeft)} s` : 'Kaufen gerade nicht möglich';
  }
}
