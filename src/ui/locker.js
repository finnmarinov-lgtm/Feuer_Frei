import { LOCKER, TASKS, cleanLooks, isDone, skinOf, stat, taskFor, unlocked } from '../game/cosmetics.js';
import { FINISHES } from '../weapons/finishes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const NAME = Object.fromEntries(LOCKER.map((l) => [l.id, l.name]));

/** Fortschritt einer Aufgabe als Balken mit Zahl */
export function progressHtml(task) {
  const v = Math.min(task.goal, stat(task.stat));
  const pct = Math.round((v / task.goal) * 100);
  return `<div class="prog"><i style="width:${pct}%"></i></div><em>${v} / ${task.goal}</em>`;
}

// Waffenkammer: links die Waffen (und Messer, Spieler), daneben ihre Skins. Freigeschaltete Skins
// legt ein Klick an, gesperrte zeigen ihre Aufgabe mit Fortschritt. Rechts im Bild dreht sich die
// Vorschau (beim Darüberfahren auch gesperrte Skins). Zweiter Reiter: alle Aufgaben auf einen Blick.
export class Locker {
  constructor(game, { show, looks, setLooks }) {
    this.g = game;
    this.show = show;
    this.getLooks = looks;
    this.putLooks = setLooks;
    this.cat = 'natter';
    this.tab = 'skins';
    this.picked = null;
    this.hover = null;
    $('locker-tabs').addEventListener('click', (e) => {
      const v = e.target.dataset?.v;
      if (!v) return;
      this.tab = v;
      this.render();
    });
    $('locker-cats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      this.cat = b.dataset.cat;
      this.picked = this.hover = null;
      this.render();
    });
    const skins = $('locker-skins');
    skins.addEventListener('click', (e) => {
      const b = e.target.closest('[data-skin]');
      if (!b) return;
      this.picked = b.dataset.skin;
      if (unlocked(this.cat, this.picked)) this._equip(this.picked);
      this.render();
    });
    skins.addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-skin]');
      if (!b || b.dataset.skin === this.hover) return;
      this.hover = b.dataset.skin;
      this._preview();
    });
    skins.addEventListener('pointerleave', () => {
      this.hover = null;
      this._preview();
    });
    // eine Aufgabe in der Übersicht anklicken: zu ihrem Skin springen
    $('locker-tasks').addEventListener('click', (e) => {
      const b = e.target.closest('[data-target]');
      if (!b) return;
      this.tab = 'skins';
      this.cat = b.dataset.target;
      this.picked = b.dataset.skin;
      this.render();
    });
  }

  open() {
    this.tab = 'skins';
    this.picked = this.hover = null;
    this.render();
    this.show('locker');
  }

  close() {
    this.g.setShowcase(null);
  }

  _equip(skin) {
    const looks = cleanLooks(this.getLooks(), true);
    if (this.cat === 'spieler') looks.player = skin;
    else if (skin === 'standard') delete looks.weapons[this.cat];
    else looks.weapons[this.cat] = skin;
    this.putLooks(looks);
  }

  render() {
    const looks = cleanLooks(this.getLooks(), true);
    for (const b of $('locker-tabs').children) b.classList.toggle('on', b.dataset.v === this.tab);
    $('locker-body').hidden = this.tab !== 'skins';
    $('locker-tasks').hidden = this.tab !== 'tasks';
    // Kategorien mit Anzahl freigeschalteter Skins
    $('locker-cats').innerHTML = LOCKER.map((l) => {
      const have = l.skins.filter((s) => unlocked(l.id, s)).length;
      return `<button data-cat="${l.id}" class="${l.id === this.cat ? 'on' : ''}">${esc(l.name)}<small>${have} / ${l.skins.length}</small></button>`;
    }).join('');
    // Skins der gewählten Kategorie
    const l = LOCKER.find((x) => x.id === this.cat);
    const worn = skinOf(looks, this.cat);
    $('locker-skins').innerHTML = ['standard', ...l.skins].map((skin) => {
      const open = unlocked(this.cat, skin);
      const task = taskFor(this.cat, skin);
      const cls = ['skin', skin === worn ? 'worn' : '', open ? '' : 'locked', skin === this.picked ? 'picked' : ''].join(' ');
      let body;
      if (skin === worn) body = '<span class="state">✓ Ausgerüstet</span>';
      else if (open) body = '<span class="state">Anklicken zum Ausrüsten</span>';
      else body = `<span class="task">${esc(task.text)}</span>${progressHtml(task)}`;
      const label = skin === 'standard' ? (this.cat === 'spieler' ? 'Standard (Teamfarbe)' : 'Standard') : FINISHES[skin].name;
      return `<button data-skin="${skin}" class="${cls}"><i class="swatch sw-${skin}"></i><b>${esc(label)}</b>${body}</button>`;
    }).join('');
    // alle Aufgaben, offene zuerst
    const rows = [...TASKS].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
    $('locker-tasks').innerHTML = rows.map((t) => {
      const [target, skin] = t.reward;
      const done = isDone(t);
      return `<button class="trow ${done ? 'done' : ''}" data-target="${target}" data-skin="${skin}">`
        + `<span class="what">${esc(t.text)}</span><span class="rew">${esc(NAME[target])} · ${esc(FINISHES[skin].name)}</span>`
        + (done ? '<span class="ok">✓ geschafft</span>' : progressHtml(t)) + '</button>';
    }).join('');
    this._preview();
  }

  // Vorschau rechts: der Skin unter der Maus, sonst der gewählte, sonst der getragene
  _preview() {
    const looks = cleanLooks(this.getLooks(), true);
    const skin = this.hover || this.picked || skinOf(looks, this.cat);
    this.g.setShowcase({ target: this.cat, skin });
    const name = skin === 'standard' ? 'Standard' : FINISHES[skin].name;
    $('locker-label').innerHTML = `${esc(NAME[this.cat])} <b>${esc(name)}</b>${unlocked(this.cat, skin) ? '' : '<small>noch gesperrt</small>'}`;
  }
}
