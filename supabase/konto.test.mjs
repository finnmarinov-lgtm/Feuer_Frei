// Test der Konto-Funktionen (supabase/konto.sql) in PGlite: Postgres im Speicher, nichts geht nach außen.
// Aufruf: npm i --no-save @electric-sql/pglite && node supabase/konto.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon nologin; create role authenticated nologin; create schema extensions;`);
const sql = readFileSync(fileURLToPath(new URL('./konto.sql', import.meta.url)), 'utf8');
await db.exec(sql);
await db.exec(sql); // nochmal ausführen schadet nicht
const call = async (q, params = []) => (await db.query(q, params)).rows[0];
let ok = 0, fail = 0;
const check = (name, cond, info) => { if (cond) ok++; else { fail++; console.log('FEHLER', name, JSON.stringify(info)); } };
const fails = async (name, q, params, re) => {
  try { await call(q, params); check(name, false, 'kein Fehler'); } catch (e) { check(name, re.test(e.message), e.message); }
};

let r = (await call(`select ff_registrieren($1, $2, $3::jsonb) as r`, ['Finn', 'geheim1', JSON.stringify({ fortschritt: { stats: { 'kill:wolf': 3 }, done: ['natter-wueste'] }, notizen: { title: 'Mathe', text: 'Hallo' }, zeit: { notizen: 1000 } })])).r;
check('registrieren', r.token && r.name === 'Finn' && r.daten.fortschritt.stats['kill:wolf'] === 3 && r.daten.notizen.text === 'Hallo', r);
const token = r.token;
r = (await call(`select ff_registrieren('finn', 'egal123') as r`)).r;
check('name vergeben (klein)', r.fehler === 'name_vergeben', r);
for (const [n, p, f] of [['ab', 'geheim1', 'name_ungueltig'], ['a b c', 'geheim1', 'name_ungueltig'], ['x'.repeat(21), 'geheim1', 'name_ungueltig'], ['Jörg_1', '123', 'passwort_ungueltig'], ['Jörg_1', 'x'.repeat(73), 'passwort_ungueltig']]) {
  r = (await call(`select ff_registrieren($1, $2) as r`, [n, p])).r;
  check('ungueltig ' + n.slice(0, 8), r.fehler === f, r);
}
r = (await call(`select ff_registrieren('Jörg_1', 'geheim1') as r`)).r;
check('umlaut im namen', !!r.token, r);
r = (await call(`select ff_anmelden('FINN', 'falsch1') as r`)).r;
check('falsches passwort', r.fehler === 'falsch', r);
r = (await call(`select ff_anmelden('niemand', 'geheim1') as r`)).r;
check('unbekannter name', r.fehler === 'falsch', r);
r = (await call(`select ff_anmelden(' FINN ', 'geheim1') as r`)).r;
check('anmelden', r.token && r.name === 'Finn' && r.daten.notizen.text === 'Hallo', r);
const token2 = r.token;
r = (await call(`select ff_laden($1) as r`, [token])).r;
check('laden', r.name === 'Finn' && r.daten.fortschritt.done[0] === 'natter-wueste', r);
r = (await call(`select ff_speichern($1, $2::jsonb) as r`, [token2, JSON.stringify({ fortschritt: { stats: { 'kill:wolf': 1, 'head:wolf': 2 }, done: ['wolf-arktis'] }, notizen: { title: 'Alt', text: 'alt' }, zeit: { notizen: 500 } })])).r;
check('zähler: der größere', r.daten.fortschritt.stats['kill:wolf'] === 3 && r.daten.fortschritt.stats['head:wolf'] === 2, r);
check('aufgaben: alle', r.daten.fortschritt.done.includes('natter-wueste') && r.daten.fortschritt.done.includes('wolf-arktis'), r);
check('ältere notiz verliert', r.daten.notizen.text === 'Hallo' && r.daten.zeit.notizen === 1000, r);
r = (await call(`select ff_speichern($1, $2::jsonb) as r`, [token, JSON.stringify({ notizen: { title: 'Neu', text: 'neu' }, looks: { weapons: { wolf: 'arktis' }, player: 'standard' }, zeit: { notizen: 2000, looks: 2000 } })])).r;
check('neuere notiz gewinnt', r.daten.notizen.text === 'neu' && r.daten.zeit.notizen === 2000 && r.daten.looks.weapons.wolf === 'arktis', r);
check('fortschritt bleibt', r.daten.fortschritt.stats['kill:wolf'] === 3 && r.daten.fortschritt.done.length === 2, r);
r = (await call(`select ff_speichern($1, $2::jsonb) as r`, [token, JSON.stringify({ looks: { weapons: {}, player: 'wald' }, zeit: { looks: 1500 } })])).r;
check('ältere skins verlieren', r.daten.looks.weapons.wolf === 'arktis', r);
for (const bad of [[1, 2], { fortschritt: { stats: { a: 'x' } } }, { fortschritt: { done: [1] } }, { notizen: { text: 5 } }, { looks: 'x' }, { zeit: { notizen: 'x' } }]) {
  await fails('ungültig ' + JSON.stringify(bad), `select ff_speichern($1, $2::jsonb) as r`, [token, JSON.stringify(bad)], /ungueltig/);
}
await fails('zu groß', `select ff_speichern($1, $2::jsonb) as r`, [token, JSON.stringify({ notizen: { title: '', text: 'x'.repeat(200001) } })], /zu_gross/);
await fails('falscher schlüssel', `select ff_laden($1) as r`, ['abc'], /abgemeldet/);
for (let i = 0; i < 9; i++) await call(`select ff_anmelden('finn', 'nein') as r`);
r = (await call(`select ff_anmelden('finn', 'geheim1') as r`)).r;
check('9 fehlversuche: noch offen', !!r.token, r);
for (let i = 0; i < 10; i++) await call(`select ff_anmelden('finn', 'nein') as r`);
r = (await call(`select ff_anmelden('finn', 'geheim1') as r`)).r;
check('10 fehlversuche: gesperrt', r.fehler === 'gesperrt' && r.sekunden > 500, r);
await db.exec(`update ff_konto set gesperrt_bis = now() - interval '1 second' where lower(name) = 'finn'`);
r = (await call(`select ff_anmelden('finn', 'geheim1') as r`)).r;
check('nach der sperre', !!r.token, r);
const token3 = r.token;
r = await call(`select fehlversuche from ff_konto where lower(name) = 'finn'`);
check('fehlversuche zurück auf 0', r.fehlversuche === 0, r);
await call(`select ff_abmelden($1)`, [token2]);
await fails('abgemeldet', `select ff_laden($1) as r`, [token2], /abgemeldet/);
r = (await call(`select ff_passwort_aendern($1, 'xx', 'neues123') as r`, [token])).r;
check('passwort: altes falsch', r.fehler === 'falsch', r);
r = (await call(`select ff_passwort_aendern($1, 'geheim1', '123') as r`, [token])).r;
check('passwort: neues zu kurz', r.fehler === 'passwort_ungueltig', r);
r = (await call(`select ff_passwort_aendern($1, 'geheim1', 'neues123') as r`, [token])).r;
check('passwort geändert', !r.fehler, r);
await fails('andere geräte abgemeldet', `select ff_laden($1) as r`, [token3], /abgemeldet/);
r = (await call(`select ff_laden($1) as r`, [token])).r;
check('eigenes gerät bleibt', r.name === 'Finn', r);
r = (await call(`select ff_anmelden('finn', 'neues123') as r`)).r;
check('neues passwort geht', !!r.token, r);
r = await call(`select pass_hash from ff_konto where lower(name) = 'finn'`);
check('bcrypt-hash', r.pass_hash.startsWith('$2a$10$'), r);
r = await call(`select count(*)::int as n from ff_sitzung where token_hash = $1`, [token]);
check('schlüssel nur als hash', r.n === 0, r);
r = (await call(`select ff_konto_loeschen($1, 'falsch') as r`, [token])).r;
check('löschen: falsches passwort', r.fehler === 'falsch', r);
r = (await call(`select ff_konto_loeschen($1, 'neues123') as r`, [token])).r;
check('gelöscht', !r.fehler, r);
r = await call(`select count(*)::int as n from ff_konto where lower(name) = 'finn'`);
check('konto weg', r.n === 0, r);
r = await call(`select count(*)::int as n from ff_sitzung`);
check('nur jörgs sitzung bleibt', r.n === 1, r);
for (let i = 0; i < 25; i++) await call(`select ff_anmelden('Jörg_1', 'geheim1') as r`);
r = await call(`select count(*)::int as n from ff_sitzung`);
check('höchstens 20 sitzungen', r.n === 20, r);
await db.exec(`set role anon`);
for (const q of [`select * from ff_konto`, `select * from ff_sitzung`, `select ff_zusammen('{}', '{}')`, `select ff_konto_von('x')`, `select ff_neue_sitzung(gen_random_uuid())`]) {
  try { await db.query(q); check('gesperrt für anon: ' + q, false, 'erlaubt'); } catch (e) { check('gesperrt für anon: ' + q, /permission denied/.test(e.message), e.message); }
}
r = (await call(`select ff_bereit() as r`)).r;
check('ff_bereit als anon', r === true, r);
r = (await call(`select ff_anmelden('Jörg_1', 'geheim1') as r`)).r;
check('anmelden als anon', !!r.token, r);
r = (await call(`select ff_laden($1) as r`, [r.token])).r;
check('laden als anon', r.name === 'Jörg_1', r);
await db.exec(`reset role`);
console.log(`${ok} ok, ${fail} Fehler`);
process.exitCode = fail ? 1 : 0;
