-- Final Cut – täglicher Letterboxd-Abgleich direkt in Supabase (pg_cron + pg_net)
-- Ist bereits in deinem Projekt eingerichtet. Diese Datei dient nur zur Dokumentation.
--
-- Ablauf (Uhrzeiten in UTC, also 7:10–7:25 Uhr im Winter, 8:10–8:25 Uhr im Sommer):
--   06:10  private.lb_fetch()    fragt alle Seiten von letterboxd.com/OfficerC1201/films/ an
--                                und für bis zu 20 Titel ohne Genre deren Filmseite
--   06:15  private.lb_process()  trägt neue Filme ein (Status „Gesehen“, Link, Bewertung),
--                                ergänzt fehlende Genres – überschreibt nie etwas, löscht nie
--   06:20 / 06:25                zweiter Durchgang, damit neue Filme ihre Genres sofort bekommen
--
-- Manuell auslösen (im SQL Editor):
--   select private.lb_fetch();     -- ca. 15 Sekunden warten, dann:
--   select private.lb_process();   -- zeigt {added, updated, genres}
--
-- Zeitplan ansehen:   select jobname, schedule from cron.job;
-- Abgleich pausieren: select cron.unschedule(jobname) from cron.job where jobname like 'final-cut-lb-%';

-- Gelöschte Titel merken, damit der Abgleich sie nicht wieder anlegt
create table if not exists private.lb_removed (slug text primary key, removed_at timestamptz default now());
create or replace function private.remember_removed() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare s text;
begin
  s := coalesce(substring(old.data->>'lbUri' from 'letterboxd\.com/film/([^/]+)'),
                case when old.id like 'lb-%' then substring(old.id from 4) end);
  if s is not null and s <> '' then insert into private.lb_removed(slug) values (s) on conflict do nothing; end if;
  return old;
end $f$;
create trigger titles_remember_removed after delete on public.titles for each row execute function private.remember_removed();
-- In private.lb_process() steht am Anfang der Schleife:
--   continue when exists (select 1 from private.lb_removed r where r.slug = f.slug);
