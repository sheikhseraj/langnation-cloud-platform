# Replacing the old PHP site on Hostinger

Step by step, in order. Follow it top to bottom.

---

## The one rule

> **Nothing gets deleted until the new site has been live and healthy for a
> week.**

The old site is your safety net. It costs nothing to leave it sitting on
the disk, and it is the only thing that lets you undo a bad switch in
thirty seconds. Delete it last, not first.

Every phase below can be undone. The point at which that stops being true
is Phase 8 — and by then you will have had a week to find problems.

---

## What you are actually changing

| | Now | After |
|---|---|---|
| langnation.com runs | PHP 7.4 + CodeIgniter 2.1 | Node + Express |
| Where the files live | `domains/langnation.com/public_html` | `domains/langnation.com/langnation-web` |
| Database | `u648779252_langnation` (44 tables) | a **new**, separate database (2 tables) |
| Old database | — | **kept, untouched, not deleted** |

The new site does not read the old database at all. Everything it needs
was already copied into `content/*.json` back in the migration. That is
why the two can sit side by side without interfering.

---

# Phase 0 — Back up, today

Your existing backup (`u648779252_langnation.sql`, `public_html.zip`) is
from **3 September**. Anything that happened on the live site since then
is not in it — including any enquiries customers have sent.

## 0.1 Fresh database export

1. hPanel → **Databases → phpMyAdmin** → open `u648779252_langnation`
2. **Export** tab → Method: **Custom**
3. Format: SQL · Compression: **zipped**
4. Scroll down, tick **Add DROP TABLE / DROP VIEW**
5. **Export** → save it as `langnation-backup-BEFORE-SWITCH.sql.zip`

## 0.2 Fresh file backup

1. hPanel → **Files → File Manager**
2. Go to `domains/langnation.com/`
3. Right-click `public_html` → **Compress** → `public_html-BEFORE-SWITCH.zip`
4. Download it

> The old site writes gigabytes of error logs into
> `application/logs/`. Delete that folder's contents *before* compressing
> and the download will be far smaller and far quicker.

## 0.3 Read the enquiries you already have

Open `tbl_enquiry` in phpMyAdmin and check for anything you have not
replied to. Those will not carry over — the new site starts a fresh
enquiries table. Answer them, or copy them somewhere, before you switch.

**Do not continue until both backups are downloaded and on your own disk.**

---

# Phase 1 — Create the new database

1. hPanel → **Databases → MySQL Databases**
2. **Create a new database** — something like `u648779252_lnweb`
   (Hostinger prefixes it with your account number automatically)
3. Create a user for it, generate a strong password
4. **Write down** the database name, user and password — you need them in
   Phase 3
5. Open **phpMyAdmin** for the *new* database
6. **SQL** tab → paste the entire contents of `MySQL/01_create_tables.sql`
   from this project → **Go**

You should now see two tables: `enquiries` and `page_views`.

> Do not touch the old database. It stays exactly as it is.

---

# Phase 2 — Put the new site on a test subdomain

This is the part that makes the whole thing safe: the new site goes live
on an address only you know, while langnation.com carries on serving the
old site to customers.

## 2.1 Create the subdomain

1. hPanel → **Domains → Subdomains**
2. Create `new.langnation.com`
3. Wait for the SSL certificate to be issued — usually a few minutes.
   Check hPanel → **Security → SSL**. Do not skip this: without HTTPS the
   phone-app features cannot be tested.

## 2.2 Push the code to GitHub

On your own computer:

```bash
cd /d/Project_All/LangNation_Web
git remote add origin https://github.com/sheikhseraj/langnation-web.git
git push -u origin main
```

Create the empty `langnation-web` repository on GitHub first, and **make
it private**.

## 2.3 Pull it onto the server

```bash
ssh u648779252@langnation.com
cd domains/langnation.com
git clone https://github.com/sheikhseraj/langnation-web.git langnation-web
cd langnation-web
npm install --omit=dev
```

`--omit=dev` skips the image-processing library, which is only needed
when you rebuild logos or re-run the migration on your own machine.

## 2.4 Create the Node app

hPanel → **Advanced → Node.js** → create an application, exactly as you
did for the dictionary:

| Field | Value |
|---|---|
| Node version | 18 or newer |
| Application root | `domains/langnation.com/langnation-web` |
| Application URL | `new.langnation.com` |
| Startup file | `server.js` |

## 2.5 Set the environment variables

In the same Node.js panel, **Environment variables**. These are the
minimum:

```
SITE_ORIGIN            https://new.langnation.com
NODE_ENV               production
ASSET_VERSION          2026-09-06
DB_HOST                localhost
DB_USER                (from Phase 1)
DB_PASSWORD            (from Phase 1)
DB_NAME                (from Phase 1)
ADMIN_PASSWORD_HASH    (see below)
SESSION_SECRET         (see below)
CONTACT_EMAIL          info@langnation.com
IMPRINT_COMPANY        (your registered company name)
IMPRINT_ADDRESS        (street\nPostcode City\nCountry)
IMPRINT_REPRESENTATIVE (the person legally responsible)
```

`SITE_ORIGIN` points at the **subdomain** for now. It changes in Phase 5.

Because that hostname is not `langnation.com`, the site automatically
serves `robots.txt` with `Disallow: /` and sends a `noindex` header on
every page. That matters: without it Google would index the test copy and
it would compete with your real site for your own rankings. Nothing to
switch on — it follows from `SITE_ORIGIN`, and it turns itself off in
Phase 5 when that becomes the live domain.

Confirm it after starting:

```
https://new.langnation.com/robots.txt   →  must say "Disallow: /"
https://new.langnation.com/api/health   →  must say "staging": true
```

For the admin password, on your own computer:

```bash
npm run admin:password
```

Paste the hash it prints — not the password itself — into
`ADMIN_PASSWORD_HASH`. Then:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste that into `SESSION_SECRET`.

Email is optional. Without it, enquiries are still stored and still shown
at `/admin`; you just do not get a notification. To turn it on:

```
SMTP_HOST   smtp.hostinger.com
SMTP_PORT   465
SMTP_USER   info@langnation.com
SMTP_PASS   (that mailbox's password)
SMTP_FROM   LangNation Website <info@langnation.com>
ENQUIRY_TO  info@langnation.com
```

## 2.6 Start it

Press **Restart** in the Node.js panel, then open the log. You are
looking for:

```
LangNation website
──────────────────────────────────────────
14 courses · 5 posts · 25 pages
95 legacy redirects active
mode: production
```

---

# Phase 3 — Upload the exam papers

The practice exams are **not** in GitHub — 400 MB of MP3 does not belong
in a code repository. They have to go up once, by hand.

1. On your computer, zip `D:\Project_All\LangNation_Web\public\downloads`
2. hPanel → **File Manager** → `domains/langnation.com/langnation-web/public/`
3. Upload the zip, then **Extract** it there
4. Confirm the folder is `.../langnation-web/public/downloads/question-papper/...`

Check one in a browser:

```
https://new.langnation.com/downloads/question-papper/1_Telc/A1/Telc-Deutsch-A1-Junior.pdf
```

**Skip this and 46 download links return 404**, including every telc
listening file.

---

# Phase 4 — Test the subdomain properly

Work through all of it. This is the last cheap moment to find problems.

- [ ] `https://new.langnation.com/` — loads, hero image appears
- [ ] `/courses` — 14 courses; the level and track filters work
- [ ] `/courses/german-regular-b1` — the tabs switch
- [ ] `/exam-papers` — download a PDF **and** play an MP3, and drag the
      audio slider to check seeking
- [ ] `/study-material` — every PDF button opens a file
- [ ] `/faq` — the accordion opens
- [ ] `/tools` — both calculators produce a number
- [ ] `/de` — German homepage; `/de/courses` in German
- [ ] `/contact` — **send yourself a real test enquiry**
- [ ] `/admin` — sign in, the test enquiry is listed, no orange warning
- [ ] Your inbox — the notification arrived (if you set up SMTP)
- [ ] `/api/health` — shows `"database": true`
- [ ] `/imprint` — no red "not yet published" warning
- [ ] **On your phone** — menu opens, nothing runs off the side
- [ ] Light and dark mode both look right

Then, from your computer, against the real server:

```bash
cd /d/Project_All/LangNation_Web
npm run audit -- --url https://new.langnation.com
npm run check
```

`npm run check` with the production database details also writes a test
row and reads it back, which proves the page-view counter works on
Hostinger's MySQL version.

**Do not go to Phase 5 until every box is ticked.**

---

# Phase 5 — Switch langnation.com over

Do this on a **weekday morning**, when you have a few hours free to watch
it. Never on a Friday evening.

## 5.1 Move the old site aside — do not delete it

1. hPanel → **File Manager** → `domains/langnation.com/`
2. Rename `public_html` to `public_html_OLD_php`

The old site is now off the air but completely intact. This is your
rollback: rename it back and it returns.

## 5.2 Point the app at the real domain

1. hPanel → **Advanced → Node.js** → your app
2. Change **Application URL** from `new.langnation.com` to
   `langnation.com`
3. Change the `SITE_ORIGIN` environment variable to
   `https://www.langnation.com`
4. **Restart**

## 5.3 Check straight away

- [ ] `https://www.langnation.com/` loads the new site
- [ ] `https://www.langnation.com/German-Regular-A1` redirects to
      `/courses/german-regular-a1`
- [ ] `/sitemap.xml` shows `www.langnation.com`, not the subdomain
- [ ] `/robots.txt` now says `Allow: /` — the staging block has lifted
- [ ] `/api/health` says `"staging": false`
- [ ] `/contact` — send one more real test enquiry
- [ ] `/admin` — it arrived

## If something is wrong — rollback

1. Node.js panel → **Stop**
2. File Manager → rename `public_html_OLD_php` back to `public_html`

The old site is back within a minute. Nothing has been lost. Work out
what went wrong on the subdomain, then try again.

---

# Phase 6 — Tell Google

1. [Google Search Console](https://search.google.com/search-console) →
   your langnation.com property
2. **Sitemaps** → submit `https://www.langnation.com/sitemap.xml`
3. **URL Inspection** → paste the homepage → **Request indexing**

The 95 redirects mean Google keeps the ranking it already gave your old
pages. It just needs to be told to come and look.

---

# Phase 7 — Watch for a week

Check every day or two:

- **Search Console → Pages** — 404s appearing? If a URL is missing from
  the redirect list, send it to me and I will add it.
- **`/admin`** — enquiries arriving? Compare against how many you used to
  get. Silence for several days when you normally get one a day means the
  form is broken, not that business stopped.
- **Node.js panel → logs** — any repeating errors.

**Leave `public_html_OLD_php` exactly where it is all week.**

---

# Phase 8 — Delete the old site

Only after a clean week.

## 8.1 Last check before deleting

- [ ] Enquiries have been arriving normally
- [ ] No unexpected 404s in Search Console
- [ ] `public_html-BEFORE-SWITCH.zip` and
      `langnation-backup-BEFORE-SWITCH.sql.zip` are on **your own
      computer**, not just on the server

## 8.2 Delete the files

File Manager → delete `public_html_OLD_php`.

That is 10 GB of CodeIgniter, 1.2 GB of error logs and 400 MB of
duplicated zip archives gone.

## 8.3 The old database

**Leave it.** It costs you nothing and it is the only remaining copy of
things the new site never migrated — order history, student records, the
old user accounts. Rename it in your notes as "archive" and forget about
it.

If you genuinely must remove it, export it one final time first.

> **Never delete:** `u648779252_langnation.sql` and `public_html.zip` on
> your own computer. Keep those permanently, wherever you keep important
> business files. They are the only complete record of eight years of the
> old site.

---

# Afterwards: making changes

```bash
# on your computer
cd /d/Project_All/LangNation_Web
git add .
git commit -m "what changed"
git push
```

```bash
# on the server
ssh u648779252@langnation.com
cd domains/langnation.com/langnation-web
git pull
npm install --omit=dev     # only if package.json changed
```

Then **Restart** in the Node.js panel.

Bump `ASSET_VERSION` whenever CSS, JavaScript or the logo changes, or
visitors keep seeing the old cached version.

---

# If it breaks

| What you see | Why | Fix |
|---|---|---|
| 503, or the app will not start | A dependency did not install | Run `npm install` again; read the log |
| Pages load, enquiries vanish | Database details wrong | Check `/api/health`; nothing is lost — they are in `data/enquiries.ndjson` |
| `/admin`: "No ADMIN_PASSWORD_HASH is set" | Variable missing | Add it, restart |
| Old design still showing | Browser cache | Bump `ASSET_VERSION`, restart, hard-refresh |
| Exam links 404 | Phase 3 skipped | Upload `public/downloads/` |
| Enquiries stored but no email | SMTP wrong | Log will show "Enquiry email failed" |
| Red warning on `/imprint` | `IMPRINT_*` not filled in | Required by German law — fill them in |

`https://www.langnation.com/api/health` tells you what the server thinks
is configured. It is almost always the fastest way to find the problem.
