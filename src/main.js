import { Renderer } from './engine/renderer.js';
import { Physics } from './engine/physics.js';
import { loadAssets } from './engine/assets.js';
import { Input, RESERVED_KEYS, keyLabel } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { Game } from './game/game.js';
import { Lobby } from './ui/lobby.js';
import { TouchControls, wantsTouch } from './ui/touch.js';
import { BotNet } from './ai/botnet.js';
import { parseCode } from './net/net.js';
import { session, setUrlLobby } from './net/session.js';
import { loadSettings, saveSettings } from './settings.js';
import { TRAINING } from './config.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'lobby', 'bots', 'pause', 'settings', 'controls', 'results', 'click-resume'];
const BOT_KEY = 'feuer-frei-ki';
const BOT_INFO = {
  anfaenger: 'Reagiert sehr langsam, trifft kaum, kauft keine Gewehre und fordert keine Luftschläge an. Zum Üben.',
  leicht: 'Reagiert langsam, trifft selten und läuft beim Schießen herum. Gut zum Reinkommen.',
  mittel: 'Solider Gegner: bleibt zum Schießen stehen, hört deine Schritte, fordert Luftschläge an.',
  schwer: 'Reagiert blitzschnell, trifft oft den Kopf und spielt die Bombe klug.',
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} $`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
}

const settings = loadSettings();

async function boot() {
  const renderer = new Renderer($('game'));
  const bar = $('load-bar');
  const text = $('load-text');
  const physics = await Physics.create();
  const assets = await loadAssets(renderer.renderer, (f) => { bar.style.width = `${Math.round(f * 100)}%`; });
  text.textContent = 'Baue Arena …';
  await nextFrame();
  const input = new Input(renderer.canvas);
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
  let settingsBack = 'menu';
  let controlsBack = 'menu';
  let duelOpts = null;
  let duelNet = null;

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
    $('btn-quit').textContent = online ? 'Duell verlassen' : duel ? 'Spiel beenden' : 'Training beenden';
  }

  async function start() {
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
    let hint = `1 gegen 1 gegen ${who} · Kaufzeit läuft, ${game.hint('buy')}`;
    if (m.bombMode) hint = `Bombenmodus gegen ${who} · Runde 1: ${m.attacking ? 'Du greifst an und legst die Bombe' : 'Du verteidigst deinen Bombenplatz'}`;
    if (opts.resume) hint = `Runde ${m.round} gegen ${opts.theirName}`;
    $('click-hint').textContent = hint;
    show('click-resume');
  }
  game.onRematch = (cfg) => startDuel(duelNet, { ...duelOpts, lives: cfg.lives, wins: cfg.wins, mode: cfg.mode, resume: null, saved: null });

  const lobby = new Lobby({
    show,
    onStart: startDuel,
    netMode: new URLSearchParams(location.search).get('netz'),
  });

  // ---------- Gegen KI: Einstellungen merken, dann wie ein Duell starten (die KI ist der Gast) ----------
  let botOpts = { level: null, mode: 'kampf', lives: 3, wins: 2 };
  try {
    botOpts = { ...botOpts, ...JSON.parse(localStorage.getItem(BOT_KEY) || '{}') };
  } catch {
    // ohne Speicher gelten die Standardwerte
  }
  function renderBotOpts() {
    for (const seg of document.querySelectorAll('#bot-opts .seg')) {
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(botOpts[seg.dataset.opt]));
    }
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
    const net = new BotNet(game, botOpts.level);
    enterFullscreen();
    startDuel(net, {
      role: 'host', lives: botOpts.lives, wins: botOpts.wins, mode: botOpts.mode,
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
      session.clear();
      setUrlLobby(null);
    }
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
  input.onEscape = () => {
    if (notesOpen) return;
    if (game.state === 'playing') {
      if (game.buyMenu.open) game.closeBuyMenu();
      else pause();
    } else if (game.state === 'paused' && $('pause').hidden === false) {
      resume();
    }
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
  $('btn-controls').addEventListener('click', () => { controlsBack = 'menu'; show('controls'); });
  $('btn-controls2').addEventListener('click', () => { controlsBack = 'pause'; show('controls'); });
  $('btn-controls-back').addEventListener('click', () => show(controlsBack));

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
    $('help-bosskey').textContent = keyLabel(settings.bossKey);
    $('bosskey-hint').textContent = '';
  }

  bossBtn.addEventListener('click', () => {
    bossBtn.textContent = 'Taste drücken …';
    bossBtn.classList.add('waiting');
    $('bosskey-hint').textContent = '';
    input.capture = (code) => {
      syncBossKey();
      if (code === 'Escape') return;
      if (RESERVED_KEYS.has(code)) {
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

  // Nochmal im Duell: beide müssen zustimmen, dann startet der Host die neue Partie
  function updateRematch() {
    const m = game.match;
    if (!m.duel) return;
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
    show('results');
  }

  // Auswertung
  game.onMatchOverCb = (r) => {
    input.unlock();
    input.enabled = false;
    window.removeEventListener('beforeunload', leaveGuard);
    $('btn-again').disabled = false;
    $('res-status').textContent = '';
    if (r.duel) {
      duelResults(r);
      return;
    }
    $('res-score').hidden = true;
    const acc = Math.round(r.accuracy * 100);
    const hs = Math.round(r.headshots * 100);
    $('res-title').textContent = r.won === TRAINING.rounds ? 'Alle Runden gewonnen!' : `Training beendet · ${r.won} von ${TRAINING.rounds} Runden gewonnen`;
    const tiles = [
      [`${r.kills} / ${r.targets}`, 'Ziele umgelegt'],
      [`${acc} %`, 'Treffergenauigkeit'],
      [`${hs} %`, 'Kopfschüsse'],
      [fmtTime(r.time), 'Gesamtzeit'],
      [fmtMoney(r.earned), 'Geld verdient'],
      [fmtMoney(r.spent), 'Geld ausgegeben'],
      [String(r.grenades), 'Granaten'],
      [`${r.won} / ${TRAINING.rounds}`, 'Runden gewonnen'],
    ];
    $('res-grid').innerHTML = tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('res-rounds').innerHTML = '<tr><th>Runde</th><th>Ergebnis</th><th>Ziele</th><th>Kopfschüsse</th><th>Zeit</th><th>Geld</th></tr>' +
      r.rounds.map((x, i) => `<tr><td>${i + 1}</td><td class="${x.won ? 'win' : 'loss'}">${x.won ? 'Gewonnen' : 'Verloren'}</td>` +
        `<td>${x.kills} / ${x.targets}</td><td>${x.heads}</td><td>${fmtTime(x.time)}</td><td>+${fmtMoney(x.bonus + x.reward)}</td></tr>`).join('');
    show('results');
  };
  return { lobby, touch };
}

boot().catch((err) => {
  console.error(err);
  $('load-text').textContent = 'Fehler beim Laden: ' + err.message;
});
