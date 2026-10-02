-- Feuer Frei: Konten mit Benutzername und Passwort (ohne E-Mail). Gespeichert werden der Aufgaben-
-- Fortschritt (damit die freigeschalteten Skins), die getragenen Skins und die Notizen vom Notizblock.
--
-- Einmal im Supabase-SQL-Editor ausführen (gleiches Projekt wie Mitbringliste und Petri Heil).
-- Nochmal ausführen schadet nicht. Die Tabellen sind für die Webseite gesperrt, alles läuft über die
-- Funktionen unten. Passwörter liegen nur als bcrypt-Hash vor, Anmelde-Schlüssel nur als SHA-256.

create extension if not exists pgcrypto with schema extensions;

create table if not exists ff_konto (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pass_hash text not null,
  daten jsonb not null default '{}'::jsonb,
  erstellt timestamptz not null default now(),
  geaendert timestamptz not null default now(),
  fehlversuche int not null default 0,
  gesperrt_bis timestamptz
);
-- Namen ohne Rücksicht auf Groß- und Kleinschreibung nur einmal
create unique index if not exists ff_konto_name on ff_konto (lower(name));

-- angemeldete Geräte: Hash des Schlüssels, den der Browser bekommt
create table if not exists ff_sitzung (
  token_hash text primary key,
  konto uuid not null references ff_konto (id) on delete cascade,
  benutzt timestamptz not null default now()
);
create index if not exists ff_sitzung_konto on ff_sitzung (konto);

alter table ff_konto enable row level security;
alter table ff_sitzung enable row level security;
revoke all on ff_konto, ff_sitzung from anon, authenticated;

-- ---------- interne Helfer ----------

create or replace function ff_hash(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- 3 bis 20 Zeichen: Buchstaben (auch Umlaute), Ziffern, Punkt, Strich, Unterstrich
create or replace function ff_name_ok(p_name text) returns boolean
language sql immutable as $$
  select coalesce(p_name ~ '^[A-Za-z0-9ÄÖÜäöüß_.-]{3,20}$', false)
$$;

-- neuer Anmelde-Schlüssel für ein Gerät; räumt alte auf (180 Tage unbenutzt, mehr als 20 je Konto)
create or replace function ff_neue_sitzung(p_konto uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(32), 'hex');
begin
  delete from ff_sitzung where benutzt < now() - interval '180 days';
  delete from ff_sitzung where token_hash in (
    select token_hash from ff_sitzung where konto = p_konto order by benutzt desc offset 19);
  insert into ff_sitzung (token_hash, konto) values (ff_hash(v_token), p_konto);
  return v_token;
end $$;

-- Konto zu einem Schlüssel (und merken, dass er benutzt wurde)
create or replace function ff_konto_von(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_konto uuid;
begin
  update ff_sitzung set benutzt = now()
   where token_hash = ff_hash(p_token) and benutzt > now() - interval '180 days'
  returning konto into v_konto;
  if v_konto is null then raise exception 'abgemeldet'; end if;
  return v_konto;
end $$;

-- Daten vom Spiel prüfen: nur die erwarteten Teile in der erwarteten Form, höchstens 200.000 Zeichen
create or replace function ff_pruefen(p jsonb) returns jsonb
language plpgsql immutable as $$
declare v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'ungueltig'; end if;
  if length(p::text) > 200000 then raise exception 'zu_gross'; end if;
  if p ? 'fortschritt' then
    if jsonb_typeof(p->'fortschritt') <> 'object'
       or jsonb_typeof(coalesce(p->'fortschritt'->'stats', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(p->'fortschritt'->'done', '[]'::jsonb)) <> 'array' then
      raise exception 'ungueltig';
    end if;
    for v in select value from jsonb_each(coalesce(p->'fortschritt'->'stats', '{}'::jsonb)) loop
      if jsonb_typeof(v) <> 'number' then raise exception 'ungueltig'; end if;
    end loop;
    for v in select value from jsonb_array_elements(coalesce(p->'fortschritt'->'done', '[]'::jsonb)) loop
      if jsonb_typeof(v) <> 'string' then raise exception 'ungueltig'; end if;
    end loop;
  end if;
  if p ? 'looks' and jsonb_typeof(p->'looks') <> 'object' then raise exception 'ungueltig'; end if;
  if p ? 'notizen' and (jsonb_typeof(p->'notizen') <> 'object'
     or jsonb_typeof(coalesce(p->'notizen'->'title', '""'::jsonb)) <> 'string'
     or jsonb_typeof(coalesce(p->'notizen'->'text', '""'::jsonb)) <> 'string') then
    raise exception 'ungueltig';
  end if;
  if p ? 'zeit' then
    if jsonb_typeof(p->'zeit') <> 'object' then raise exception 'ungueltig'; end if;
    for v in select value from jsonb_each(p->'zeit') loop
      if jsonb_typeof(v) <> 'number' then raise exception 'ungueltig'; end if;
    end loop;
  end if;
  return p;
end $$;

-- Stand von zwei Geräten zusammenführen: Zähler jeweils der größere Wert, geschaffte Aufgaben alle,
-- getragene Skins und Notizen die neuere Fassung (zeit: Millisekunden der letzten Änderung)
create or replace function ff_zusammen(alt jsonb, neu jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_stats jsonb;
  v_done jsonb;
  v_out jsonb;
  k text;
  za jsonb := coalesce(alt->'zeit', '{}'::jsonb);
  zn jsonb := coalesce(neu->'zeit', '{}'::jsonb);
begin
  select coalesce(jsonb_object_agg(s.key, greatest(
           coalesce((alt->'fortschritt'->'stats'->>s.key)::numeric, 0),
           coalesce((neu->'fortschritt'->'stats'->>s.key)::numeric, 0))), '{}'::jsonb)
    into v_stats
    from (select jsonb_object_keys(coalesce(alt->'fortschritt'->'stats', '{}'::jsonb)) as key
          union
          select jsonb_object_keys(coalesce(neu->'fortschritt'->'stats', '{}'::jsonb))) s;
  select coalesce(jsonb_agg(distinct d.v), '[]'::jsonb)
    into v_done
    from (select jsonb_array_elements_text(coalesce(alt->'fortschritt'->'done', '[]'::jsonb)) as v
          union
          select jsonb_array_elements_text(coalesce(neu->'fortschritt'->'done', '[]'::jsonb))) d;
  v_out := jsonb_build_object('fortschritt', jsonb_build_object('stats', v_stats, 'done', v_done));
  foreach k in array array['looks', 'notizen'] loop
    if neu ? k and (not alt ? k or coalesce((zn->>k)::numeric, 0) > coalesce((za->>k)::numeric, 0)) then
      v_out := v_out || jsonb_build_object(k, neu->k);
      za := za || jsonb_build_object(k, coalesce(zn->k, '0'::jsonb));
    elsif alt ? k then
      v_out := v_out || jsonb_build_object(k, alt->k);
    end if;
  end loop;
  return v_out || jsonb_build_object('zeit', za);
end $$;

-- ---------- für das Spiel ----------

-- gibt es die Konten schon? (das Spiel zeigt den Knopf erst dann)
create or replace function ff_bereit() returns boolean
language sql as $$ select true $$;

-- neues Konto; p_daten: was schon auf dem Gerät ist (Fortschritt, Skins, Notizen)
create or replace function ff_registrieren(p_name text, p_passwort text, p_daten jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_daten jsonb;
begin
  p_name := trim(coalesce(p_name, ''));
  if not ff_name_ok(p_name) then return jsonb_build_object('fehler', 'name_ungueltig'); end if;
  if length(coalesce(p_passwort, '')) < 6 or length(p_passwort) > 72 then
    return jsonb_build_object('fehler', 'passwort_ungueltig');
  end if;
  if exists (select 1 from ff_konto where lower(name) = lower(p_name)) then
    return jsonb_build_object('fehler', 'name_vergeben');
  end if;
  v_daten := ff_zusammen('{}'::jsonb, ff_pruefen(coalesce(p_daten, '{}'::jsonb)));
  insert into ff_konto (name, pass_hash, daten)
  values (p_name, crypt(p_passwort, gen_salt('bf', 10)), v_daten)
  returning id into v_id;
  return jsonb_build_object('name', p_name, 'token', ff_neue_sitzung(v_id), 'daten', v_daten);
exception when unique_violation then
  return jsonb_build_object('fehler', 'name_vergeben');
end $$;

-- anmelden; nach 10 falschen Passwörtern ist das Konto 10 Minuten gesperrt
create or replace function ff_anmelden(p_name text, p_passwort text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k ff_konto;
begin
  select * into k from ff_konto where lower(name) = lower(trim(coalesce(p_name, '')));
  if not found then return jsonb_build_object('fehler', 'falsch'); end if;
  if k.gesperrt_bis is not null and k.gesperrt_bis > now() then
    return jsonb_build_object('fehler', 'gesperrt', 'sekunden', ceil(extract(epoch from k.gesperrt_bis - now())));
  end if;
  if k.pass_hash <> crypt(coalesce(p_passwort, ''), k.pass_hash) then
    if k.fehlversuche + 1 >= 10 then
      update ff_konto set fehlversuche = 0, gesperrt_bis = now() + interval '10 minutes' where id = k.id;
    else
      update ff_konto set fehlversuche = k.fehlversuche + 1 where id = k.id;
    end if;
    return jsonb_build_object('fehler', 'falsch');
  end if;
  update ff_konto set fehlversuche = 0, gesperrt_bis = null where id = k.id;
  return jsonb_build_object('name', k.name, 'token', ff_neue_sitzung(k.id), 'daten', k.daten);
end $$;

-- gespeicherten Stand holen
create or replace function ff_laden(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k ff_konto;
begin
  select * into k from ff_konto where id = ff_konto_von(p_token);
  return jsonb_build_object('name', k.name, 'daten', k.daten);
end $$;

-- Stand des Geräts dazulegen; zurück kommt der zusammengeführte Stand
create or replace function ff_speichern(p_token text, p_daten jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := ff_konto_von(p_token);
  v_daten jsonb;
begin
  select ff_zusammen(daten, ff_pruefen(p_daten)) into v_daten from ff_konto where id = v_id for update;
  update ff_konto set daten = v_daten, geaendert = now() where id = v_id;
  return jsonb_build_object('daten', v_daten);
end $$;

-- dieses Gerät abmelden
create or replace function ff_abmelden(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from ff_sitzung where token_hash = ff_hash(p_token);
  return '{}'::jsonb;
end $$;

-- Passwort ändern (meldet alle anderen Geräte ab)
create or replace function ff_passwort_aendern(p_token text, p_alt text, p_neu text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k ff_konto;
begin
  select * into k from ff_konto where id = ff_konto_von(p_token);
  if k.pass_hash <> crypt(coalesce(p_alt, ''), k.pass_hash) then return jsonb_build_object('fehler', 'falsch'); end if;
  if length(coalesce(p_neu, '')) < 6 or length(p_neu) > 72 then
    return jsonb_build_object('fehler', 'passwort_ungueltig');
  end if;
  update ff_konto set pass_hash = crypt(p_neu, gen_salt('bf', 10)) where id = k.id;
  delete from ff_sitzung where konto = k.id and token_hash <> ff_hash(p_token);
  return '{}'::jsonb;
end $$;

-- Konto mit allen Daten löschen (Passwort zur Bestätigung)
create or replace function ff_konto_loeschen(p_token text, p_passwort text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k ff_konto;
begin
  select * into k from ff_konto where id = ff_konto_von(p_token);
  if k.pass_hash <> crypt(coalesce(p_passwort, ''), k.pass_hash) then return jsonb_build_object('fehler', 'falsch'); end if;
  delete from ff_konto where id = k.id;
  return '{}'::jsonb;
end $$;

-- ---------- Rechte: nur die Funktionen für das Spiel sind von außen aufrufbar ----------

revoke execute on function ff_hash(text), ff_name_ok(text), ff_neue_sitzung(uuid), ff_konto_von(text),
  ff_pruefen(jsonb), ff_zusammen(jsonb, jsonb) from public, anon, authenticated;
grant execute on function ff_bereit(), ff_registrieren(text, text, jsonb), ff_anmelden(text, text),
  ff_laden(text), ff_speichern(text, jsonb), ff_abmelden(text), ff_passwort_aendern(text, text, text),
  ff_konto_loeschen(text, text) to anon, authenticated;
