import { SUPABASE_KEY } from '../net/net.js';
import { sprache } from '../i18n.js';
import { cleanName } from '../names.js';

// "Spiel bewerten" im Hauptmenü (Wunsch aus den Kommentaren, 06.11.2026): 1 bis 5 Sterne, ein
// freiwilliger Kommentar und Name. Geht ohne Konto an Supabase (supabase/bewertungen.sql); lesen kann
// nur Finn, auf fmcode.de/online/. Nach dem Absenden kommt ein Dankeschön.
const RPC = 'https://yzzipjtounvktdhhvrnt.supabase.co/rest/v1/rpc/ff_bewertung_senden';
const KEY = 'feuer-frei-bewertet';
const $ = (id) => document.getElementById(id);

export function initBewertung({ show }) {
  let sterne = 0;
  const knoepfe = [...document.querySelectorAll('#bew-sterne button')];
  const zeige = () => knoepfe.forEach((b, i) => {
    b.classList.toggle('on', i < sterne);
    b.setAttribute('aria-pressed', String(i + 1 === sterne));
  });
  knoepfe.forEach((b, i) => b.addEventListener('click', () => {
    sterne = i + 1;
    zeige();
    $('bew-fehler').textContent = '';
  }));

  $('btn-bewerten').addEventListener('click', () => {
    $('bew-form').hidden = false;
    $('bew-danke').hidden = true;
    $('bew-fehler').textContent = '';
    if (!$('bew-name').value) {
      try { $('bew-name').value = localStorage.getItem('feuer-frei-name') || ''; } catch {}
    }
    show('bewerten');
  });
  $('btn-bew-zurueck').addEventListener('click', () => show('menu'));
  $('btn-bew-fertig').addEventListener('click', () => show('menu'));

  $('btn-bew-senden').addEventListener('click', async () => {
    if (!sterne) {
      $('bew-fehler').textContent = 'Bitte wähle erst 1 bis 5 Sterne.';
      return;
    }
    const btn = $('btn-bew-senden');
    btn.disabled = true;
    let ok = false;
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_sterne: sterne,
          p_text: $('bew-text').value.trim().slice(0, 1000),
          p_name: cleanName($('bew-name').value) || '',
          p_sprache: sprache(),
        }),
      });
      ok = res.ok && (await res.json()) === true;
    } catch {
      ok = false;
    }
    btn.disabled = false;
    if (!ok) {
      $('bew-fehler').textContent = 'Das hat gerade nicht geklappt. Versuch es später noch einmal.';
      return;
    }
    try { localStorage.setItem(KEY, String(sterne)); } catch {}
    $('bew-text').value = '';
    sterne = 0;
    zeige();
    $('bew-form').hidden = true;
    $('bew-danke').hidden = false;
  });
}
