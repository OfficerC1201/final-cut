// Final Cut – täglicher Abgleich mit Letterboxd
// Läuft als GitHub Action. Holt alle gesehenen Filme vom Letterboxd-Profil
// und trägt neue Titel (mit Genres) in Supabase ein. Bestehende Einträge
// werden nur ergänzt, nie überschrieben oder gelöscht.

import * as cheerio from "cheerio";

const USER = process.env.LETTERBOXD_USER || "OfficerC1201";
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlt (GitHub → Settings → Secrets).");
  process.exit(1);
}

const GENRE_DE = {
  "Romance": "Romantik", "Comedy": "Komödie", "Thriller": "Thriller", "Mystery": "Mystery",
  "Action": "Action", "War": "Krieg", "Drama": "Drama", "Science Fiction": "Science-Fiction",
  "Adventure": "Abenteuer", "Music": "Musik", "History": "Historie", "Crime": "Krimi",
  "Horror": "Horror", "Family": "Familie", "Animation": "Animation", "Fantasy": "Fantasy",
  "Documentary": "Dokumentation", "Western": "Western", "TV Movie": "TV-Film"
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getHtml(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.text();
    if (res.status === 404) return null;
    console.warn(`  ${url} → HTTP ${res.status}, Versuch ${attempt}`);
    await sleep(2000 * attempt);
  }
  throw new Error(`Letterboxd nicht erreichbar: ${url}`);
}

function parseFilms(html) {
  const $ = cheerio.load(html);
  const films = [];
  $("li.poster-container, li.griditem").each((_, li) => {
    const node = $(li).find("[data-item-name],[data-film-name],[data-film-slug],[data-item-slug],[data-target-link],[data-item-link]").first();
    const name = node.attr("data-item-name") || node.attr("data-film-name") || $(li).find("img").attr("alt") || "";
    const slug = node.attr("data-film-slug") || node.attr("data-item-slug") ||
      ((node.attr("data-target-link") || node.attr("data-item-link") || "").match(/\/film\/([^/]+)\//) || [])[1] || "";
    const rated = ($(li).find(".rating").attr("class") || "").match(/rated-(\d+)/);
    if (slug && name) films.push({ slug, name, rating: rated ? Number(rated[1]) / 2 : 0 });
  });
  return films;
}

async function allWatched() {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const url = `https://letterboxd.com/${USER}/films/` + (page > 1 ? `page/${page}/` : "");
    const html = await getHtml(url);
    if (!html) break;
    const films = parseFilms(html);
    if (!films.length) break;
    out.push(...films);
    await sleep(800);
  }
  return out;
}

async function genresOf(slug) {
  const html = await getHtml(`https://letterboxd.com/film/${slug}/genres/`);
  if (!html) return [];
  const $ = cheerio.load(html);
  const g = new Set();
  $('a[href*="/films/genre/"]').each((_, a) => {
    const en = $(a).text().trim();
    if (en) g.add(GENRE_DE[en] || en);
  });
  return [...g];
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const SERIES = new Set(["the-queens-gambit"]);
const key = (t, y) => `${String(t).trim().toLowerCase()}|${y || ""}`;

async function main() {
  console.log(`Lese Letterboxd-Profil ${USER} …`);
  const films = await allWatched();
  console.log(`${films.length} gesehene Filme gefunden.`);

  const rows = await sb("titles?select=id,data&limit=10000");
  const byId = new Map(rows.map(r => [r.id, r]));
  const byKey = new Map(rows.map(r => [key(r.data.title, r.data.year), r]));
  const lbCount = rows.filter(r => r.id.startsWith("lb-")).length;

  if (films.length < Math.min(20, lbCount * 0.5)) {
    console.error(`Abbruch: nur ${films.length} Filme gefunden, im Regal sind ${lbCount} von Letterboxd. Vermutlich wurde die Seite blockiert.`);
    process.exit(1);
  }

  const added = [], updated = [];
  for (const f of films) {
    const m = f.name.match(/^(.*) \((\d{4})\)$/);
    const title = m ? m[1] : f.name;
    const year = m ? Number(m[2]) : "";
    const id = "lb-" + f.slug;
    const lbUri = `https://letterboxd.com/film/${f.slug}/`;
    const existing = byId.get(id) || byKey.get(key(title, year));

    if (!existing) {
      const genres = await genresOf(f.slug); await sleep(500);
      const data = {
        title, year, kind: SERIES.has(f.slug) ? "serie" : "film", status: "seen", favorite: false,
        releaseDate: "", releaseNote: "", lbUri, rating: f.rating || 0, desc: "", genres,
        createdAt: new Date().toISOString()
      };
      await sb("titles", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id, data }) });
      added.push(title);
      continue;
    }

    const d = existing.data || {};
    const patch = {};
    if (d.status !== "seen") patch.status = "seen";
    if (!d.lbUri) patch.lbUri = lbUri;
    if (f.rating > 0 && f.rating !== d.rating) patch.rating = f.rating;
    if (!d.genres || !d.genres.length) { patch.genres = await genresOf(f.slug); await sleep(500); }
    if (Object.keys(patch).length) {
      await sb(`titles?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data: { ...d, ...patch }, updated_at: new Date().toISOString() })
      });
      updated.push(d.title || title);
    }
  }

  console.log(`Neu: ${added.length}${added.length ? " – " + added.join(", ") : ""}`);
  console.log(`Aktualisiert: ${updated.length}${updated.length ? " – " + updated.join(", ") : ""}`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
