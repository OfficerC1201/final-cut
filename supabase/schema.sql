-- Final Cut – Datenbank-Schema für Supabase
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und auf "Run" klicken.

-- 1) Tabellen ---------------------------------------------------------------

-- Alle Filme und Serien. Die Felder eines Titels liegen als JSON in "data".
create table if not exists public.titles (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Einstellungen wie die "Empfehlung der Woche" (key = 'weekly').
create table if not exists public.meta (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Bewertungen deiner Freunde: eine Bewertung pro Titel und Gerät.
create table if not exists public.ratings (
  title_id    text not null references public.titles(id) on delete cascade,
  device_id   text not null check (char_length(device_id) between 8 and 64),
  name        text not null check (char_length(name) between 1 and 40),
  stars       int  not null check (stars between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (title_id, device_id)
);

-- 2) Zugriffsregeln ---------------------------------------------------------
-- Jeder darf lesen. Titel und Einstellungen ändern darf nur, wer angemeldet ist.
-- Da du in Supabase neue Registrierungen abschaltest (siehe Anleitung),
-- bist das nur du. Bewerten darf jeder.

alter table public.titles  enable row level security;
alter table public.meta    enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "titles lesen"      on public.titles;
drop policy if exists "titles bearbeiten" on public.titles;
create policy "titles lesen"      on public.titles for select using (true);
create policy "titles bearbeiten" on public.titles for all to authenticated using (true) with check (true);

drop policy if exists "meta lesen"      on public.meta;
drop policy if exists "meta bearbeiten" on public.meta;
create policy "meta lesen"      on public.meta for select using (true);
create policy "meta bearbeiten" on public.meta for all to authenticated using (true) with check (true);

drop policy if exists "ratings lesen"     on public.ratings;
drop policy if exists "ratings anlegen"   on public.ratings;
drop policy if exists "ratings aendern"   on public.ratings;
drop policy if exists "ratings loeschen"  on public.ratings;
create policy "ratings lesen"    on public.ratings for select using (true);
create policy "ratings anlegen"  on public.ratings for insert to anon, authenticated with check (true);
create policy "ratings aendern"  on public.ratings for update to anon, authenticated using (true) with check (true);
create policy "ratings loeschen" on public.ratings for delete to anon, authenticated using (true);

-- 3) Speicher für Banner-Bilder ---------------------------------------------

insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

drop policy if exists "banner hochladen" on storage.objects;
drop policy if exists "banner aendern"   on storage.objects;
drop policy if exists "banner loeschen"  on storage.objects;
create policy "banner hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'banners');
create policy "banner aendern"   on storage.objects for update to authenticated using (bucket_id = 'banners');
create policy "banner loeschen"  on storage.objects for delete to authenticated using (bucket_id = 'banners');

-- 4) Live-Aktualisierung ----------------------------------------------------
-- Änderungen erscheinen sofort auf allen geöffneten Geräten.

do $$
begin
  begin alter publication supabase_realtime add table public.titles;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.meta;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ratings; exception when duplicate_object then null; end;
end $$;
