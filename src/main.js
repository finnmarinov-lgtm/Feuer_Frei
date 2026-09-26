import { Renderer } from './engine/renderer.js';
import { Physics } from './engine/physics.js';
import { loadAssets } from './engine/assets.js';
import { ACTIONS, Input, keyLabel } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { Game } from './game/game.js';
import { Lobby } from './ui/lobby.js';
import { TouchControls, wantsTouch } from './ui/touch.js';
import { BotNet } from './ai/botnet.js';
import { parseCode } from './net/net.js';
import { session, setUrlLobby } from './net/session.js';
import { loadSettings, saveSettings } from './settings.js';
import { LOCKER, cleanLooks, onProgress, skinOf } from './game/cosmetics.js';
import { FINISHES } from './weapons/finishes.js';
import { Locker } from './ui/locker.js';
import { ARMS } from './config.js';
import { MAP, MAPS, setMap } from './world/map.js';
import { TEAM_NAMES, otherTeam } from './game/sides.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'lobby', 'bots', 'locker', 'pause', 'settings', 'controls', 'results', 'click-resume'];
const BOT_KEY = 'feuer-frei-ki';
const MAP_KEY = 'feuer-frei-karte';
const BOT_INFO = {
  anfaenger: 'Reagiert sehr langsam, trifft kaum, kauft keine Gewehre und fordert keine Luftschläge an. Zum Üben.',
  leicht: 'Reagiert langsam, trifft selten und läuft beim Schießen herum. Gut zum Reinkommen.',
  mittel: 'Solider Gegner: bleibt zum Schießen stehen, hört deine Schritte, fordert Luftschläge an.',
  schwer: 'Reagiert blitzschnell, trifft oft den Kopf und spielt die Bombe klug. Wer sie besiegt, bekommt eine Überraschung.',
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} $`;
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
}

const settings = loadSettings();
// zuletzt gewählte Karte (für Hauptmenü und Training)
try {
  setMap(localStorage.getItem(MAP_KEY) || 'hof');
} catch {
  // ohne Speicher gilt der Hof
}
// früher gab es nur das Regenbogen-Messer (knifeFinish): in die Skins übernehmen
if (settings.knifeFinish && settings.knifeFinish !== 'standard' && !settings.looks) {
  settings.looks = { weapons: { messer: settings.knifeFinish } };
}
delete settings.knifeFinish;
// nur freigeschaltete Skins tragen
settings.looks = cleanLooks(settings.looks, true);

async function boot() {
  const renderer = new Renderer($('game'));
  const bar = $('load-bar');
  const text = $('load-text');
  const physics = await Physics.create();
  const assets = await loadAssets(renderer.renderer, (f) => { bar.style.width = `${Math.round(f * 100)}%`; });
  text.textContent = 'Baue Arena …';
  await nextFrame();
  const input = new Input(renderer.canvas);
  input.setKeys(settings.keys);
  const audio = new Audio();
  audio.setVolume(settings.volume);
  const game = new Game({ renderer, physics, assets, input, audio, settings });
  text.textContent = 'Bereite Grafik vor …';
  await nextFrame();
  await game.warmup();
  window.addEventListener('resize', () => game.onResize());

  const { lobby, touch } = setupMenus(game, input, audio);

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    touch.update();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  show('menu');
  // Einladungslink (…?lobby=CODE): gleich der Lobby beitreten
  const params = new URLSearchParams(location.search);
  const code = parseCode(params.get('lobby'));
  if (code) lobby.open(code);
  if (import.meta.env.DEV) {
    window.__game = game;
    window.__lobby = lobby;
    window.__touch = touch;
  }
}

function setupMenus(game, input, audio) {
  let pendingResume = false;
  // in dieser Partie freigeschaltete Skins (für die Auswertung)
  let freshSkins = [];
  let settingsBack = 'menu';
  let controlsBack = 'menu';
  let duelOpts = null;
  let duelNet = null;
  let teamOpts = null;
  let teamNet = null;

  const leaveGuard = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };

  function enterFullscreen() {
    if (!settings.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      // Im Vollbild fängt Chrome damit auch Strg+W ab (Ducken + Vorwärts); auf dem Handy quer
      .then(() => (input.touch ? screen.orientation?.lock?.('landscape') : navigator.keyboard?.lock?.()))
      .catch(() => {});
  }

  async function lockOrAsk() {
    // Touchscreen: kein Mauszeiger zum Fangen, es geht einfach weiter
    if (input.touch) {
      if (pendingResume) {
        pendingResume = false;
        game.state = 'playing';
      }
      if (game.state === 'playing') show(null);
      return;
    }
    await input.lock();
    if (document.pointerLockElement !== input.canvas) {
      $('click-title').textContent = 'Klicken zum Weiterspielen';
      $('click-hint').textContent = '';
      show('click-resume');
    }
  }

  function syncPauseTexts() {
    const duel = game.mode === 'duel';
    const online = duel && game.match.online;
    $('pause-note').hidden = !online;
    $('btn-quit').textContent = game.match.teamMode ? 'Spiel verlassen' : online ? 'Duell verlassen' : duel ? 'Spiel beenden' : 'Training beenden';
  }

  async function start() {
    freshSkins = [];
    audio.init();
    enterFullscreen();
    show(null);
    game.startMatch();
    input.enabled = true;
    window.addEventListener('beforeunload', leaveGuard);
    await lockOrAsk();
  }

  // Duell startet von selbst (Countdown), die Maus lässt sich aber erst nach einem Klick fangen
  function startDuel(net, opts) {
    if (!opts.resume) freshSkins = [];
    duelNet = net;
    duelOpts = opts;
    audio.init();
    game.startDuel(net, opts);
    // Wiedereinstieg in eine schon beendete Partie: die Auswertung ist bereits zu sehen
    if (game.state !== 'playing') return;
    input.enabled = true;
    window.addEventListener('beforeunload', leaveGuard);
    const m = game.match;
    const tap = input.touch ? 'Tippen' : 'Klicken';
    $('click-title').textContent = opts.resume ? `Zurück im Duell – ${tap} zum Weiterspielen` : `${tap} zum Spielen`;
    const who = net.bot ? `${opts.theirName} · ${net.levelName}` : opts.theirName;
    const place = `${MAPS[m.cfg.map].name}${m.arms.allow ? ` · ${m.arms.name}` : ''}`;
    let hint = `1 gegen 1 gegen ${who} · ${place} · Kaufzeit läuft, ${game.hint('buy')}`;
    if (m.bombMode) hint = `Bombenmodus gegen ${who} · ${place} · Runde 1: ${m.attacking ? 'Du greifst an und legst die Bombe' : 'Du verteidigst deinen Bombenplatz'}`;
    if (opts.resume) hint = `Runde ${m.round} gegen ${opts.theirName}`;
    $('click-hint').textContent = hint;
    show('click-resume');
  }
  game.onRematch = (cfg) => startDuel(duelNet, {
    ...duelOpts, lives: cfg.lives, wins: cfg.wins, mode: cfg.mode, map: cfg.map, arms: cfg.arms, resume: null, saved: null,
  });

  // Team-Spiel (ab drei Spielern oder mit KI): startet wie das Duell, die Maus nach einem Klick
  function startTeam(net, opts) {
    if (!opts.resume) freshSkins = [];
    teamNet = net;
    teamOpts = opts;
    audio.init();
    game.startTeam(net, opts);
    if (game.state !== 'playing') return;
    input.enabled = true;
    window.addEventListener('beforeunload', leaveGuard);
    const m = game.match;
    const tap = input.touch ? 'Tippen' : 'Klicken';
    $('click-title').textContent = opts.resume ? `Zurück im Spiel – ${tap} zum Weiterspielen` : `${tap} zum Spielen`;
    const place = `${MAPS[m.cfg.map].name}${m.arms.allow ? ` · ${m.arms.name}` : ''}`;
    const size = `${m.members(m.team).length} gegen ${m.members(otherTeam(m.team)).length}`;
    let hint = `${size} · Du bist in ${TEAM_NAMES[m.team]} · ${place} · Kaufzeit läuft, ${game.hint('buy')}`;
    if (m.bombMode) hint = `${size} im Bombenmodus · Du bist in ${TEAM_NAMES[m.team]} · ${place} · Runde 1: ${m.attacking ? 'Ihr greift an' : 'Ihr verteidigt'}`;
    if (opts.resume) hint = `Runde ${m.round} · ${TEAM_NAMES[m.team]}`;
    $('click-hint').textContent = hint;
    show('click-resume');
  }
  game.onTeamRematch = (msg) => startTeam(teamNet, {
    ...teamOpts, cfg: msg.cfg, roster: msg.roster, hostPeer: game.match.hostPeer,
    startMsg: teamOpts.isHost ? msg : null, resume: null, saved: null,
  });

  const lobby = new Lobby({
    show,
    // zwei Menschen: das 1 gegen 1, sonst das Team-Spiel
    onStart: (net, opts) => (opts.kind === 'team' ? startTeam(net, opts) : startDuel(net, opts)),
    netMode: new URLSearchParams(location.search).get('netz'),
    keyName: (action) => input.label(action),
    // eigener Messer-Skin: der Gegner soll ihn auch sehen
    looks: () => game.looks,
  });

  // ---------- Skins und Aufgaben ----------
  const locker = new Locker(game, {
    show,
    looks: () => settings.looks,
    setLooks: (looks) => {
      settings.looks = looks;
      saveSettings(settings);
      game.setLooks(looks);
    },
  });
  $('btn-locker').addEventListener('click', () => locker.open());
  $('btn-locker-back').addEventListener('click', () => {
    locker.close();
    show('menu');
  });

  // neue Skins aus Aufgaben: sofort anlegen, wo noch der Standard getragen wird, und in der
  // Auswertung zeigen
  onProgress(({ task, done }) => {
    if (!done) return;
    freshSkins.push(task);
    const looks = cleanLooks(settings.looks, true);
    const [target, skin] = task.reward;
    if (skinOf(looks, target) !== 'standard') return;
    if (target === 'spieler') looks.player = skin;
    else looks.weapons[target] = skin;
    settings.looks = looks;
    saveSettings(settings);
    game.setLooks(looks);
  });
  const skinLabel = (t) => `${LOCKER.find((l) => l.id === t.reward[0]).name} · ${FINISHES[t.reward[1]].name}`;
  function showNewSkins() {
    const list = freshSkins;
    freshSkins = [];
    $('res-gift').hidden = !list.length;
    if (!list.length) return;
    $('res-gift-title').textContent = list.length === 1 ? 'Neuer Skin freigeschaltet!' : `${list.length} neue Skins freigeschaltet!`;
    $('res-gift-text').textContent = `${list.map(skinLabel).join(', ')}. Auswählen kannst du alle Skins unter „Skins & Aufgaben“.`;
    audio.play('specialReady');
  }

  // ---------- Karte im Hauptmenü: Hintergrund und Training ----------
  function syncMenuMap() {
    for (const b of $('menu-map').children) b.classList.toggle('on', b.dataset.v === MAP.id);
    $('menu-map-info').textContent = MAP.desc;
  }
  $('menu-map').addEventListener('click', (e) => {
    const id = e.target.dataset?.v;
    if (!id || !MAPS[id]) return;
    game.loadMap(id);
    try {
      localStorage.setItem(MAP_KEY, id);
    } catch {
      // dann nur für diese Sitzung
    }
    syncMenuMap();
  });
  syncMenuMap();

  // ---------- Gegen KI: Einstellungen merken, dann wie ein Duell starten (die KI ist der Gast) ----------
  let botOpts = { level: null, mode: 'kampf', lives: 3, wins: 2, map: 'hof', arms: 'alle' };
  try {
    botOpts = { ...botOpts, ...JSON.parse(localStorage.getItem(BOT_KEY) || '{}') };
  } catch {
    // ohne Speicher gelten die Standardwerte
  }
  function renderBotOpts() {
    for (const seg of document.querySelectorAll('#bot-opts .seg')) {
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(botOpts[seg.dataset.opt]));
    }
    $('bot-arms-info').textContent = (ARMS[botOpts.arms] || ARMS.alle).info;
    $('bot-level-info').textContent = (BOT_INFO[botOpts.level] || '')
      + (input.touch ? ' Auf dem Handy spielt die KI in jeder Stufe schwächer als am PC.' : '');
  }
  for (const seg of document.querySelectorAll('#bot-opts .seg')) {
    seg.addEventListener('click', (e) => {
      const raw = e.target.dataset?.v;
      if (!raw) return;
      const key = seg.dataset.opt;
      botOpts = { ...botOpts, [key]: key === 'lives' || key === 'wins' ? Number(raw) : raw };
      try {
        localStorage.setItem(BOT_KEY, JSON.stringify(botOpts));
      } catch {
        // egal
      }
      renderBotOpts();
    });
  }
  $('btn-bots').addEventListener('click', () => {
    // noch nichts gewählt: auf dem Handy bei den Anfängern beginnen (Zielen mit dem Finger ist schwerer)
    botOpts.level ||= input.touch ? 'anfaenger' : 'mittel';
    renderBotOpts();
    show('bots');
  });
  $('btn-bot-back').addEventListener('click', () => show('menu'));
  $('btn-bot-start').addEventListener('click', () => {
    // erst die Karte, dann die KI (sie berechnet ihr Wegenetz auf der geladenen Karte)
    if (!MAPS[botOpts.map]) botOpts.map = 'hof';
    game.loadMap(botOpts.map);
    const net = new BotNet(game, botOpts.level);
    enterFullscreen();
    startDuel(net, {
      role: 'host', lives: botOpts.lives, wins: botOpts.wins, mode: botOpts.mode, map: botOpts.map, arms: botOpts.arms,
      myName: lobby.name, theirName: net.name, resume: null, saved: null,
    });
  });

  // Handy: Stick und Knöpfe; Pause über den Knopf oder wenn die App in den Hintergrund geht
  const touch = new TouchControls(game, { onPause: () => pause() });
  touch.setEnabled(wantsTouch(settings));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && input.touch) pause();
  });

  function pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    game.buyMenu.hide();
    input.unlock();
    syncPauseTexts();
    show('pause');
  }

  function resume() {
    pendingResume = true;
    show(null);
    lockOrAsk();
  }

  function toMenu() {
    const wasDuel = game.mode === 'duel';
    game.quitToMenu();
    input.enabled = false;
    input.unlock();
    window.removeEventListener('beforeunload', leaveGuard);
    if (wasDuel) {
      duelNet = null;
      teamNet = null;
      session.clear();
      setUrlLobby(null);
    }
    // eine Partie kann auf einer anderen Karte gewesen sein
    syncMenuMap();
    show('menu');
  }

  input.onLockChange = (locked) => {
    if (locked) {
      if (pendingResume) {
        pendingResume = false;
        game.state = 'playing';
      }
      if (game.state === 'playing') show(null);
    } else if (game.state === 'playing' && !game.buyMenu.open) {
      pause();
    }
  };
  // Esc: im Spiel erst Kaufmenü bzw. Schnellnachrichten zu, sonst Pause; in den Menüs wie der
  // Knopf, der dort zurückführt (Pause: Weiter, Auswertung: Hauptmenü)
  const ESC_BACK = {
    pause: 'btn-resume', settings: 'btn-settings-back', controls: 'btn-controls-back', lobby: 'btn-lobby-back',
    bots: 'btn-bot-back', locker: 'btn-locker-back', results: 'btn-menu',
  };
  input.onEscape = () => {
    if (notesOpen) return;
    if (game.state === 'playing') {
      if (game.buyMenu.open) game.closeBuyMenu();
      else if (game.hud.chatOpen) game.hud.toggleChat(false);
      else pause();
      return;
    }
    const back = ESC_BACK[SCREENS.find((s) => !$(s).hidden)];
    if (back) $(back).click();
  };
  input.canvas.addEventListener('click', () => {
    if (game.state === 'playing' && !input.locked && !game.buyMenu.open) lockOrAsk();
  });
  $('click-resume').addEventListener('click', () => {
    if (game.state === 'paused') pendingResume = true;
    audio.init();
    enterFullscreen();
    show(null);
    lockOrAsk();
  });

  $('btn-start').addEventListener('click', start);
  $('btn-duel').addEventListener('click', () => lobby.open());
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', toMenu);
  $('btn-again').addEventListener('click', () => {
    if (game.mode !== 'duel') {
      start();
      return;
    }
    game.match.requestAgain();
    updateRematch();
  });
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-settings').addEventListener('click', () => { settingsBack = 'menu'; openSettings(); });
  $('btn-settings2').addEventListener('click', () => { settingsBack = 'pause'; openSettings(); });
  $('btn-settings-back').addEventListener('click', () => {
    input.capture = null;
    syncBossKey();
    show(settingsBack);
  });
  $('btn-controls').addEventListener('click', () => { controlsBack = 'menu'; renderKeys(); show('controls'); });
  $('btn-controls2').addEventListener('click', () => { controlsBack = 'pause'; renderKeys(); show('controls'); });
  $('btn-controls-back').addEventListener('click', () => {
    stopBinding();
    show(controlsBack);
  });

  // ---------- Tastenbelegung (Steuerung) ----------
  // feste Zeilen oben und unten, dazwischen alle Aktionen mit bis zu zwei Tasten zum Anklicken
  const FIXED_TOP = [
    ['Maus', 'Umsehen'],
    ['Linksklick', 'Schießen / Messerhieb / Granate weit werfen'],
    ['Rechtsklick', 'Zielen (Kimme und Korn, Zielfernrohr) / Messerstich / Granate kurz werfen'],
    ['Mausrad', 'Waffe wechseln'],
  ];
  let binding = null;

  function renderKeys(note = '') {
    const rows = FIXED_TOP.map(([k, t]) => `<tr class="fixed"><td><kbd>${k}</kbd></td><td>${t}</td></tr>`);
    for (const a of ACTIONS) {
      const codes = input.keys[a.id];
      const btn = (slot) => {
        const code = codes[slot];
        const waiting = binding?.action === a.id && binding.slot === slot;
        const text = waiting ? 'Taste drücken …' : code ? escapeHtml(keyLabel(code)) : slot === 0 ? '–' : '+';
        const cls = ['bind', waiting ? 'waiting' : '', code ? '' : 'empty'].join(' ');
        const title = code ? 'Klicken zum Ändern' : slot === 0 ? 'Klicken zum Belegen' : 'Zweite Taste hinzufügen';
        return `<button class="${cls}" data-action="${a.id}" data-slot="${slot}" title="${title}">${text}</button>`;
      };
      rows.push(`<tr><td>${btn(0)}${codes[0] ? btn(1) : ''}</td><td>${a.label}</td></tr>`);
    }
    rows.push('<tr class="fixed"><td><kbd>Esc</kbd></td><td>Pause</td></tr>');
    rows.push(`<tr class="fixed"><td><kbd id="help-bosskey">${escapeHtml(keyLabel(settings.bossKey))}</kbd></td>`
      + '<td>Notizblock: sofort weißes Blatt, Spiel pausiert, Ton aus (Taste in den Einstellungen)</td></tr>');
    $('keys-table').innerHTML = rows.join('');
    $('keys-note').textContent = note;
  }

  function stopBinding() {
    if (binding) input.capture = null;
    binding = null;
  }

  /** Hinweise im Spiel (Kaufmenü, Luftschlag, Schnellnachrichten …) an die Belegung anpassen */
  function refreshKeyHints() {
    game.hud.refreshKeys();
    document.querySelector('.buy-foot kbd').textContent = input.label('buy');
    $('buy-close').title = `Schließen (${input.label('buy')})`;
  }

  $('keys-table').addEventListener('click', (e) => {
    const b = e.target.closest('.bind');
    if (!b) return;
    binding = { action: b.dataset.action, slot: Number(b.dataset.slot) };
    renderKeys();
    input.capture = (code) => assignKey(code);
  });

  function assignKey(code) {
    const { action, slot } = binding;
    binding = null;
    const name = (id) => ACTIONS.find((a) => a.id === id).label;
    if (code === 'Escape') {
      renderKeys();
      return;
    }
    if (code === settings.bossKey) {
      renderKeys(`${keyLabel(code)} ist die Notizblock-Taste. Bitte eine andere wählen.`);
      return;
    }
    const keys = Object.fromEntries(Object.entries(input.keys).map(([k, v]) => [k, [...v]]));
    let note = '';
    if (code === 'Delete') {
      keys[action].splice(slot, 1);
      if (!keys[action].length) note = `„${name(action)}“ hat jetzt keine Taste.`;
    } else {
      // schon woanders belegt: dort freigeben (in derselben Aktion einfach tauschen)
      for (const [other, codes] of Object.entries(keys)) {
        const i = codes.indexOf(code);
        if (i < 0 || (other === action && i === slot)) continue;
        codes.splice(i, 1);
        if (other !== action) note = `${keyLabel(code)} war vorher bei „${name(other)}“ – dort ist sie jetzt frei.`;
      }
      if (slot < keys[action].length) keys[action][slot] = code;
      else keys[action].push(code);
    }
    input.setKeys(keys);
    settings.keys = input.keys;
    saveSettings(settings);
    refreshKeyHints();
    renderKeys(note);
  }

  $('btn-keys-reset').addEventListener('click', () => {
    stopBinding();
    input.setKeys(null);
    settings.keys = null;
    saveSettings(settings);
    refreshKeyHints();
    renderKeys('Alle Tasten sind wieder wie am Anfang.');
  });
  refreshKeyHints();

  // Einstellungen
  const bind = (id, key, fmt, parse = Number) => {
    const el = $(id);
    const out = $(id.replace('set-', 'out-'));
    const isCheck = el.type === 'checkbox';
    const sync = () => {
      if (isCheck) el.checked = !!settings[key];
      else el.value = settings[key];
      if (out) out.textContent = fmt(settings[key]);
    };
    el.addEventListener('input', () => {
      settings[key] = isCheck ? el.checked : parse(el.value);
      if (out) out.textContent = fmt(settings[key]);
      saveSettings(settings);
      game.applySettings();
    });
    return sync;
  };
  const syncs = [
    bind('set-sens', 'sensitivity', (v) => v.toFixed(2)),
    bind('set-fov', 'fov', (v) => `${v}°`),
    bind('set-vol', 'volume', (v) => `${Math.round(v * 100)} %`),
    bind('set-quality', 'quality', (v) => v, String),
    bind('set-scale', 'renderScale', (v) => `${Math.round(v * 100)} %`),
    bind('set-cross', 'crosshairColor', (v) => v, String),
    bind('set-adstoggle', 'adsToggle', () => ''),
    bind('set-fullscreen', 'fullscreen', () => ''),
    bind('set-fps', 'showFps', () => ''),
    bind('set-touch', 'touch', (v) => v, String),
    bind('set-touchsens', 'touchSens', (v) => v.toFixed(2)),
  ];
  $('set-touch').addEventListener('input', () => touch.setEnabled(wantsTouch(settings)));
  function openSettings() {
    for (const s of syncs) s();
    syncBossKey();
    show('settings');
  }

  // ---------- Notizblock-Taste ----------
  let notesOpen = false;
  let screenBeforeNotes = null;
  const NOTES_KEY = 'feuer-frei-notizen';
  const bossBtn = $('set-bosskey');

  function syncBossKey() {
    bossBtn.textContent = keyLabel(settings.bossKey);
    bossBtn.classList.remove('waiting');
    const help = $('help-bosskey');
    if (help) help.textContent = keyLabel(settings.bossKey);
    $('bosskey-hint').textContent = '';
  }

  bossBtn.addEventListener('click', () => {
    bossBtn.textContent = 'Taste drücken …';
    bossBtn.classList.add('waiting');
    $('bosskey-hint').textContent = '';
    input.capture = (code) => {
      syncBossKey();
      if (code === 'Escape') return;
      if (input.isReserved(code)) {
        $('bosskey-hint').textContent = `${keyLabel(code)} braucht das Spiel selbst, bitte eine andere Taste wählen.`;
        return;
      }
      settings.bossKey = code;
      input.bossKey = code;
      saveSettings(settings);
      syncBossKey();
    };
  });

  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_KEY) || 'null');
    if (saved) {
      $('notes-title').value = saved.title || 'Notizen';
      $('notes-text').value = saved.text || '';
    }
  } catch {
    // ohne Speicher bleibt das Blatt leer
  }
  const saveNotes = () => {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify({ title: $('notes-title').value, text: $('notes-text').value }));
    } catch {
      // Notizen gelten dann nur für diese Sitzung
    }
  };
  $('notes-text').addEventListener('input', saveNotes);
  $('notes-title').addEventListener('input', saveNotes);

  // Sofort umschalten: Spiel pausieren, Maus freigeben, Vollbild verlassen, Ton aus
  function toggleNotes() {
    if (!notesOpen) {
      notesOpen = true;
      screenBeforeNotes = SCREENS.find((s) => !$(s).hidden) || null;
      if (game.state === 'playing') {
        game.state = 'paused';
        screenBeforeNotes = 'pause';
        syncPauseTexts();
      }
      game.buyMenu.hide();
      game.renderPaused = true;
      input.releaseAll();
      input.unlock();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      audio.mute(true);
      $('notes-date').textContent = new Date().toLocaleDateString('de-DE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      $('notes').hidden = false;
      document.title = $('notes-title').value || 'Notizen';
      $('notes-text').focus();
    } else {
      notesOpen = false;
      $('notes').hidden = true;
      document.title = 'Feuer Frei';
      game.renderPaused = false;
      audio.mute(false);
      document.activeElement?.blur?.();
      show(screenBeforeNotes || 'menu');
    }
  }
  input.bossKey = settings.bossKey;
  input.onBossKey = toggleNotes;
  syncBossKey();

  // Nochmal im Duell: beide müssen zustimmen, dann startet der Host die neue Partie.
  // Im Team-Spiel startet der Host, die anderen können ihm zeigen, dass sie nochmal wollen.
  function updateRematch() {
    const m = game.match;
    if (!m.duel) return;
    if (m.teamMode) {
      const host = m.name(m.hostKey);
      let text;
      if (m.hostLeft) text = 'Der Host hat das Spiel verlassen.';
      else if (m.isHost) {
        const want = [...m.again].map((k) => m.name(k));
        if (!m.canRematch) text = 'Es sind zu wenige Spieler für eine neue Partie übrig.';
        else if (want.length) text = `${want.join(', ')} ${want.length === 1 ? 'möchte' : 'möchten'} nochmal spielen!`;
        else text = 'Mit „Nochmal“ startest du die nächste Partie für alle.';
      } else text = m.again.has(m.me) ? `Warte auf ${host} (Host) …` : `${host} (Host) startet die nächste Partie.`;
      $('res-status').textContent = text;
      $('btn-again').disabled = m.left || (m.isHost ? !m.canRematch : m.again.has(m.me));
      return;
    }
    const them = m.names[m.them];
    let text = '';
    if (m.left) text = `${them} hat das Spiel verlassen.`;
    else if (m.again[m.me] && m.again[m.them]) text = 'Neue Partie startet …';
    else if (m.again[m.me]) text = `Warte auf ${them} …`;
    else if (m.again[m.them]) text = `${them} möchte nochmal spielen!`;
    $('res-status').textContent = text;
    $('btn-again').disabled = m.left || m.again[m.me];
  }

  function duelResults(r) {
    const m = game.match;
    m.onAgainChange = updateRematch;
    const acc = Math.round(r.accuracy * 100);
    const hs = Math.round(r.headshots * 100);
    const them = escapeHtml(r.opponent);
    $('res-title').innerHTML = r.forfeit
      ? `${them} ist nicht mehr da – du gewinnst`
      : r.won ? `Sieg gegen ${them}!` : `Niederlage gegen ${them}`;
    $('res-score').hidden = false;
    $('res-score').textContent = `${r.score[0]} : ${r.score[1]}`;
    const tiles = [
      [String(r.kills), 'Ausgeschaltet'],
      [String(r.deaths), 'Tode'],
      [`${acc} %`, 'Treffergenauigkeit'],
      [`${hs} %`, 'Kopfschüsse'],
      [String(r.damage), 'Schaden'],
      [fmtMoney(r.earned), 'Geld verdient'],
      r.bomb ? [String(r.planted), 'Bomben gelegt'] : [fmtMoney(r.spent), 'Geld ausgegeben'],
      r.bomb ? [String(r.defused), 'Entschärft'] : [String(r.grenades), 'Granaten'],
    ];
    $('res-grid').innerHTML = tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const why = {
      elim: 'Keine Leben mehr', 'time-lives': 'Zeit · mehr Leben', 'time-hp': 'Zeit · mehr Lebenspunkte', 'time-draw': 'Zeit · Gleichstand',
      bomb: 'Bombe explodiert', defuse: 'Bombe entschärft', 'time-bomb': 'Zeit · keine Bombe',
    };
    $('res-rounds').innerHTML = '<tr><th>Runde</th><th>Ergebnis</th><th>Wie</th><th>Ausgeschaltet</th><th>Tode</th></tr>' +
      r.rounds.map((x, i) => `<tr><td>${i + 1}</td><td class="${x.won ? 'win' : x.draw ? '' : 'loss'}">${x.won ? 'Gewonnen' : x.draw ? 'Unentschieden' : 'Verloren'}</td>` +
        `<td>${why[x.why] || ''}</td><td>${x.kills}</td><td>${x.deaths}</td></tr>`).join('');
    $('btn-again').textContent = 'Nochmal';
    updateRematch();
    showNewSkins();
    show('results');
  }

  // Team-Spiel: Ergebnis der Teams, eigene Werte und die Tabelle mit allen Spielern
  function teamResults(r) {
    const m = game.match;
    m.onAgainChange = updateRematch;
    const acc = Math.round(r.accuracy * 100);
    const hs = Math.round(r.headshots * 100);
    const mine = TEAM_NAMES[r.myTeam];
    $('res-title').textContent = r.reason === 'host' ? 'Der Host ist weg – Spiel vorbei'
      : r.forfeit ? (r.won ? 'Die Gegner sind weg – dein Team gewinnt' : 'Dein Team ist nicht mehr da')
      : r.won ? `Sieg für ${mine}!` : `Niederlage für ${mine}`;
    $('res-score').hidden = false;
    $('res-score').textContent = `${r.score[0]} : ${r.score[1]}`;
    const tiles = [
      [String(r.kills), 'Ausgeschaltet'],
      [String(r.deaths), 'Tode'],
      [`${acc} %`, 'Treffergenauigkeit'],
      [`${hs} %`, 'Kopfschüsse'],
      [String(r.damage), 'Schaden'],
      [fmtMoney(r.earned), 'Geld verdient'],
      r.bomb ? [String(r.planted), 'Bomben gelegt'] : [fmtMoney(r.spent), 'Geld ausgegeben'],
      r.bomb ? [String(r.defused), 'Entschärft'] : [String(r.grenades), 'Granaten'],
    ];
    $('res-grid').innerHTML = tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const table = (team) => {
      const rows = r.board.filter((x) => x.team === team).map((x) => `<tr class="${x.me ? 'me' : ''}"><td>${escapeHtml(x.me ? `${x.name} (Du)` : x.name)}`
        + `${x.left ? '<small>weg</small>' : ''}</td><td class="n">${x.kills}</td><td class="n">${x.deaths}</td></tr>`).join('');
      return `<table class="board"><tbody class="t-${team}"><tr><th class="tname">${TEAM_NAMES[team]}</th><th class="n">Abschüsse</th><th class="n">Tode</th></tr>${rows}</tbody></table>`;
    };
    $('res-board').innerHTML = table(r.myTeam) + table(otherTeam(r.myTeam));
    $('res-board').hidden = false;
    const why = {
      elim: 'Team ausgeschaltet', 'time-lives': 'Zeit · mehr Leben', 'time-hp': 'Zeit · mehr Lebenspunkte', 'time-draw': 'Zeit · Gleichstand',
      bomb: 'Bombe explodiert', defuse: 'Bombe entschärft', 'time-bomb': 'Zeit · keine Bombe',
    };
    $('res-rounds').innerHTML = '<tr><th>Runde</th><th>Ergebnis</th><th>Wie</th><th>Ausgeschaltet</th><th>Tode</th></tr>' +
      r.rounds.map((x, i) => `<tr><td>${i + 1}</td><td class="${x.won ? 'win' : x.draw ? '' : 'loss'}">${x.won ? 'Gewonnen' : x.draw ? 'Unentschieden' : 'Verloren'}</td>` +
        `<td>${why[x.why] || ''}</td><td>${x.kills}</td><td>${x.deaths}</td></tr>`).join('');
    $('btn-again').textContent = 'Nochmal';
    updateRematch();
    showNewSkins();
    show('results');
  }

  // Auswertung
  game.onMatchOverCb = (r) => {
    input.unlock();
    input.enabled = false;
    window.removeEventListener('beforeunload', leaveGuard);
    $('btn-again').disabled = false;
    $('res-status').textContent = '';
    $('res-gift').hidden = true;
    $('res-board').hidden = true;
    if (r.team) {
      teamResults(r);
      return;
    }
    duelResults(r);
  };
  return { lobby, touch };
}

boot().catch((err) => {
  console.error(err);
  $('load-text').textContent = 'Fehler beim Laden: ' + err.message;
});
