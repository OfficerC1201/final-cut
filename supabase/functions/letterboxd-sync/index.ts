// Final Cut – täglicher Abgleich mit Letterboxd (Supabase Edge Function)
// Holt alle gesehenen Filme von Letterboxd und trägt neue Titel mit Genres ein.
// Bestehende Einträge werden nur ergänzt, nie überschrieben oder gelöscht.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const USER = "OfficerC1201";
const GENRE_DE: Record<string, string> = {
  "Romance": "Romantik", "Comedy": "Komödie", "Thriller": "Thriller", "Mystery": "Mystery",
  "Action": "Action", "War": "Krieg", "Drama": "Drama", "Science Fiction": "Science-Fiction",
  "Adventure": "Abenteuer", "Music": "Musik", "History": "Historie", "Crime": "Krimi",
  "Horror": "Horror", "Family": "Familie", "Animation": "Animation", "Fantasy": "Fantasy",
  "Documentary": "Dokumentation", "Western": "Western", "TV Movie": "TV-Film",
};
const SERIES = new Set(["the-queens-gambit"]);
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decode = (s: string) => s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function getHtml(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return await res.text();
    if (res.status === 404) return null;
    await sleep(1500 * attempt);
  }
  throw new Error(`Letterboxd nicht erreichbar: ${url}`);
}

type Film = { slug: string; name: string; rating: number };
function parseFilms(html: string): Film[] {
  const out: Film[] = [];
  const chunks = html.split(/<li\b[^>]*class="[^"]*(?:griditem|poster-container)[^"]*"/).slice(1);
  for (const c of chunks) {
    const block = c.split(/<\/li>/)[0];
    const attr = (n: string) => (block.match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || "";
    const name = decode(attr("data-item-name") || attr("data-film-name") || attr("alt"));
    const link = attr("data-target-link") || attr("data-item-link");
    const slug = attr("data-film-slug") || attr("data-item-slug") || (link.match(/\/film\/([^/]+)\//) || [])[1] || "";
    const r = block.match(/rated-(\d+)/);
    if (slug && name) out.push({ slug, name, rating: r ? Number(r[1]) / 2 : 0 });
  }
  return out;
}

async function genresOf(slug: string): Promise<string[]> {
  const html = await getHtml(`https://letterboxd.com/film/${slug}/genres/`);
  if (!html) return [];
  const g = new Set<string>();
  for (const m of html.matchAll(/href="\/films\/genre\/[^"]+"[^>]*>([^<]+)</g)) {
    const en = decode(m[1].trim());
    if (en) g.add(GENRE_DE[en] || en);
  }
  return [...g];
}

const key = (t: string, y: unknown) => `${String(t).trim().toLowerCase()}|${y ?? ""}`;

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const films: Film[] = [];
    for (let page = 1; page <= 60; page++) {
      const html = await getHtml(`https://letterboxd.com/${USER}/films/` + (page > 1 ? `page/${page}/` : ""));
      if (!html) break;
      const f = parseFilms(html);
      if (!f.length) break;
      films.push(...f);
      await sleep(400);
    }

    const { data: rows, error } = await sb.from("titles").select("id,data").limit(10000);
    if (error) throw error;
    const byId = new Map(rows!.map((r) => [r.id, r]));
    const byKey = new Map(rows!.map((r) => [key(r.data?.title, r.data?.year), r]));
    const lbCount = rows!.filter((r) => r.id.startsWith("lb-")).length;
    if (films.length < Math.min(20, lbCount * 0.5)) {
      return Response.json({ ok: false, reason: `Nur ${films.length} Filme gefunden – vermutlich blockiert. Nichts geändert.` }, { status: 502 });
    }

    const added: string[] = [], updated: string[] = [];
    let genreFetches = 0;
    for (const f of films) {
      const m = f.name.match(/^(.*) \((\d{4})\)$/);
      const title = m ? m[1] : f.name;
      const year = m ? Number(m[2]) : "";
      const id = "lb-" + f.slug;
      const lbUri = `https://letterboxd.com/film/${f.slug}/`;
      const existing = byId.get(id) || byKey.get(key(title, year));

      if (!existing) {
        const genres = genreFetches++ < 40 ? await genresOf(f.slug) : [];
        await sb.from("titles").upsert({ id, data: {
          title, year, kind: SERIES.has(f.slug) ? "serie" : "film", status: "seen", favorite: false,
          releaseDate: "", releaseNote: "", lbUri, rating: f.rating || 0, desc: "", genres,
          createdAt: new Date().toISOString(),
        } }, { onConflict: "id", ignoreDuplicates: true });
        added.push(title);
        continue;
      }
      const d = existing.data || {};
      const patch: Record<string, unknown> = {};
      if (d.status !== "seen") patch.status = "seen";
      if (!d.lbUri) patch.lbUri = lbUri;
      if (f.rating > 0 && f.rating !== d.rating) patch.rating = f.rating;
      if ((!d.genres || !d.genres.length) && genreFetches++ < 40) patch.genres = await genresOf(f.slug);
      if (Object.keys(patch).length) {
        await sb.from("titles").update({ data: { ...d, ...patch }, updated_at: new Date().toISOString() }).eq("id", existing.id);
        updated.push(d.title || title);
      }
    }
    return Response.json({ ok: true, found: films.length, added, updated });
  } catch (e) {
    return Response.json({ ok: false, reason: String((e as Error).message || e) }, { status: 500 });
  }
});
