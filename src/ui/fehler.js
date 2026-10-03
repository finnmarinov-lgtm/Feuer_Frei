// Fehleranzeige: Was sonst nur in der Konsole stünde (am Handy unsichtbar), oben kurz einblenden.
// Ein Bildschirmfoto zeigt dann, was los war. Dazu der Ausfall der Grafik (WebGL-Kontext weg).

const $ = (id) => document.getElementById(id);

let count = 0;
let lastText = '';
let lostTimer = null;

function box(title, text, note) {
  $('fehler-titel').textContent = title;
  $('fehler-text').textContent = text;
  $('fehler-text').hidden = !text;
  $('fehler-hinweis').textContent = note;
  $('fehler').hidden = false;
}

/** Fehlertext mit Datei und Zeile (aus dem ersten Eintrag des Stapels, der eine Datei nennt) */
function describe(err) {
  if (!(err instanceof Error)) return String(err);
  const at = String(err.stack || '').split('\n').map((l) => l.match(/([\w.-]+\.js)(?:\?[^:)]*)?:(\d+):(\d+)/)).find(Boolean);
  return `${err.name}: ${err.message}${at ? ` · ${at[1]}:${at[2]}:${at[3]}` : ''}`;
}

/** Programmfehler zeigen (gleicher Fehler mehrmals: nur mitzählen) */
export function zeigeFehler(err) {
  console.error(err);
  const text = describe(err);
  count = text === lastText ? count + 1 : 1;
  lastText = text;
  box('Da ist etwas schiefgelaufen', count > 1 ? `${text} (${count}-mal)` : text, 'Ein Bildschirmfoto hiervon hilft beim Beheben.');
}

/** Grafik ausgefallen (true) oder wieder da (false) */
export function zeigeGrafikAusfall(aus) {
  clearTimeout(lostTimer);
  if (!aus) {
    if ($('fehler-titel').dataset.grafik) $('fehler').hidden = true;
    delete $('fehler-titel').dataset.grafik;
    return;
  }
  box('Die Grafik ist ausgefallen', '', 'Das Gerät hat den Grafikchip zurückgesetzt. Gleich geht es weiter …');
  $('fehler-titel').dataset.grafik = '1';
  // kommt sie nicht wieder, bleibt nur Neuladen
  lostTimer = setTimeout(() => {
    $('fehler-hinweis').textContent = 'Sie kommt nicht von selbst zurück. Bitte die Seite neu laden.';
  }, 6000);
}

export function starteFehleranzeige() {
  $('fehler-neu').addEventListener('click', () => location.reload());
  $('fehler-zu').addEventListener('click', () => {
    $('fehler').hidden = true;
  });
  // Fehler aus den eigenen Dateien, die sonst niemand sieht (nicht die von Browser-Erweiterungen)
  window.addEventListener('error', (e) => {
    if (e.error && String(e.filename || '').startsWith(location.origin)) zeigeFehler(e.error);
  });
}
