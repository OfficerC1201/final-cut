# Final Cut – eigene Website einrichten

Final Cut läuft danach komplett ohne Claude: als eigene Website mit eigener Adresse, auf Handy und Rechner, und deine Freunde können ohne Konto bewerten.

Du brauchst zwei kostenlose Konten:

- **GitHub**: dort liegt die Website (GitHub Pages), und dort läuft der tägliche Letterboxd-Abgleich.
- **Supabase**: die Datenbank für deine Titel, die Bewertungen und die Banner-Bilder.

Plane etwa 30 Minuten ein.

---

## Was in diesem Paket steckt

| Datei / Ordner | Wofür |
|---|---|
| `index.html` | Die Website selbst |
| `config.js` | Hier trägst du deine Supabase-Zugangsdaten ein |
| `icon.svg`, `icon-180.png`, `icon-512.png`, `manifest.webmanifest` | App-Symbol für den Home-Bildschirm |
| `supabase/schema.sql` | Legt die Datenbank an |
| `supabase/seed.sql` | Spielt deine 183 Titel ein |
| `supabase/letterboxd-sync.sql` | Beschreibung des täglichen Letterboxd-Abgleichs |
| `data/titles-backup.json` | Sicherungskopie aller Titel |

---

## Schritt 1: Konten anlegen

1. Auf **github.com** ein Konto erstellen.
2. Auf **supabase.com** auf „Start your project“ und mit dem GitHub-Konto anmelden.

## Schritt 2: Datenbank in Supabase anlegen

1. In Supabase **New project** anlegen:
   - Name: `final-cut`
   - Passwort: irgendein sicheres Passwort (gut aufbewahren, brauchst du später kaum)
   - Region: **Central EU (Frankfurt)**
2. Warten, bis das Projekt bereit ist (1–2 Minuten).
3. Links auf **SQL Editor** → **New query**.
4. Den kompletten Inhalt von `supabase/schema.sql` einfügen → **Run**. Es sollte „Success“ erscheinen.
5. Wieder **New query**, den kompletten Inhalt von `supabase/seed.sql` einfügen → **Run**.
6. Kontrolle: Links auf **Table Editor** → Tabelle `titles` → dort sollten 183 Zeilen stehen.

## Schritt 3: Dich als einzige Person zum Bearbeiten freischalten

1. Links auf **Authentication** → **Users** → **Add user** → **Create new user**.
2. Deine E-Mail-Adresse eintragen, ein Passwort vergeben und **Auto Confirm User** anhaken → **Create user**.
3. Dann **Authentication** → **Sign In / Providers** (bzw. „Settings“) → **Allow new users to sign up** **ausschalten** und speichern.

> Wichtig: Durch Schritt 3 kann sich niemand außer dir anmelden. Alle anderen können nur ansehen und bewerten.

## Schritt 4: Zugangsdaten in `config.js` eintragen

1. In Supabase links unten auf **Project Settings** → **API** (bzw. „Data API“ und „API Keys“).
2. Kopiere:
   - die **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
   - den Schlüssel **anon public**
3. Öffne `config.js` mit einem Texteditor und ersetze die beiden Platzhalter:

```js
window.FINAL_CUT_CONFIG = {
  supabaseUrl: "https://abcdefgh.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."
};
```

> Der **anon**-Schlüssel darf öffentlich sein. Den Schlüssel **service_role** trägst du **niemals** in `config.js` ein – den brauchst du nur in Schritt 7.

## Schritt 5: Website auf GitHub hochladen

1. Auf GitHub oben rechts **+** → **New repository**.
   - Name: `final-cut`
   - **Public** auswählen (GitHub Pages ist für öffentliche Repositorys kostenlos)
   - **Create repository**
2. Auf der neuen Seite auf **uploading an existing file** klicken.
3. Alle Dateien und Ordner aus diesem Paket hineinziehen (auch `config.js` mit deinen Daten) → **Commit changes**.
4. **Prüfen, ob der Ordner `.github` mit hochgeladen wurde.** Auf dem Mac ist er im Finder oft unsichtbar und wird dann nicht mitgezogen. Falls er fehlt:
   - **Add file** → **Create new file**
   - Als Namen genau `.github/workflows/letterboxd-sync.yml` eintippen
   - Den Inhalt der gleichnamigen Datei aus dem Paket einfügen → **Commit changes**

## Schritt 6: Website einschalten

1. Im Repository auf **Settings** → links **Pages**.
2. Bei **Source**: „Deploy from a branch“, Branch **main**, Ordner **/ (root)** → **Save**.
3. Nach 1–2 Minuten erscheint oben die Adresse, z. B. `https://dein-name.github.io/final-cut/`.
4. Zurück in Supabase: **Authentication** → **URL Configuration**:
   - **Site URL**: deine neue Adresse eintragen
   - bei **Redirect URLs** dieselbe Adresse hinzufügen
   - speichern

Jetzt kannst du die Seite öffnen. Zum Bearbeiten unten im Kopfbereich auf **„Anmelden zum Bearbeiten“** tippen, deine E-Mail eingeben und den Link aus der E-Mail öffnen.

## Schritt 7: Täglicher Letterboxd-Abgleich

Ist bereits erledigt: Der Abgleich läuft direkt in Supabase, jeden Morgen gegen 7–8 Uhr. Neue Filme kommen mit Titel, Jahr, Genres, Status „Gesehen“ und Link dazu. Was du selbst gepflegt hast, wird nie überschrieben. Details stehen in `supabase/letterboxd-sync.sql`.

---

## Auf dem Handy wie eine App

- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.
- **Android (Chrome):** Menü ⋮ → **Zum Startbildschirm hinzufügen**.

## Freunden schicken

Einfach die Adresse schicken. Ohne Anmeldung können sie alles ansehen, Karten öffnen und mit ihrem Namen Sterne vergeben. Bearbeiten kannst nur du.

## Gut zu wissen

- **Neue Filme haben noch keine Kurzbeschreibung.** Die schreibe ich dir gern, wenn du mich fragst.
- **Kosten:** GitHub Pages und der kostenlose Supabase-Tarif reichen für Final Cut völlig aus. Ein kostenloses Supabase-Projekt pausiert nach 7 Tagen ganz ohne Besuche; dann im Supabase-Dashboard auf „Restore“ klicken. Der tägliche Abgleich verhindert das in der Regel.
- **Eigene Adresse** wie `finalcut.de`: geht später über Settings → Pages → Custom domain.
