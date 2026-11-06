-- Feuer Frei: Bewertungen aus dem Spiel (Sterne und Kommentar), 06.11.2026.
--
-- Einmal im Supabase-SQL-Editor ausführen (gleiches Projekt wie Konto, Petri Heil und fmcode.de).
-- Nochmal ausführen schadet nicht. Spieler schicken ohne Konto über ff_bewertung_senden; lesen darf
-- nur, wer auf fmcode.de freigegeben ist (fm_freigabe, wie bei fm_seiten). Die Seite
-- fmcode.de/online/ zeigt sie nach der Anmeldung.

create table if not exists public.ff_bewertungen (
  id bigint generated always as identity primary key,
  erstellt timestamptz not null default now(),
  spiel text not null default 'feuer-frei',
  sterne smallint not null check (sterne between 1 and 5),
  text text not null default '' check (char_length(text) <= 1000),
  name text not null default '' check (char_length(name) <= 20),
  sprache text not null default '' check (char_length(sprache) <= 5)
);
create index if not exists ff_bewertungen_erstellt on public.ff_bewertungen (erstellt desc);

alter table public.ff_bewertungen enable row level security;
revoke all on public.ff_bewertungen from anon, authenticated;
grant select on public.ff_bewertungen to authenticated;
drop policy if exists ff_bewertungen_lesen on public.ff_bewertungen;
create policy ff_bewertungen_lesen on public.ff_bewertungen
  for select to authenticated using (exists (select 1 from public.fm_freigabe f where f.uid = (select auth.uid())));

-- Absenden (ohne Konto): prüft die Werte, kürzt zu lange Texte und bremst Fluten
create or replace function public.ff_bewertung_senden(p_sterne int, p_text text, p_name text, p_sprache text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sterne is null or p_sterne < 1 or p_sterne > 5 then
    return false;
  end if;
  -- höchstens 60 Bewertungen in 10 Minuten (alle zusammen), damit niemand die Tabelle zuschüttet
  if (select count(*) from public.ff_bewertungen where erstellt > now() - interval '10 minutes') >= 60 then
    return false;
  end if;
  insert into public.ff_bewertungen (sterne, text, name, sprache)
  values (p_sterne, left(coalesce(trim(p_text), ''), 1000), left(coalesce(trim(p_name), ''), 20), left(coalesce(p_sprache, ''), 5));
  return true;
end
$$;
revoke all on function public.ff_bewertung_senden(int, text, text, text) from public;
grant execute on function public.ff_bewertung_senden(int, text, text, text) to anon, authenticated;

-- Probe: sollte 0 Zeilen zeigen und keinen Fehler
select count(*) as bewertungen from public.ff_bewertungen;
