# Deploying to GitHub and Hostinger

Work through it in order. Nothing is irreversible until step 9.

**Do not delete the old PHP site until step 9 says so.**

---

## 0. Two things to settle before you start

### 0a. Does your Hostinger plan run Node.js?

This is the one that can stop everything, so check it first.

The old site was PHP, which every Hostinger plan runs. This site is
Node.js, which **only some plans run**. In hPanel look for:

**Advanced → Node.js**

- **If that menu exists** — good, carry on.
- **If it does not** — the app cannot run on this plan. You need either a
  plan that includes Node.js (Business or Cloud), or a VPS. Find this out
  now rather than after you have taken the old site down.

There is no way around it: Node.js is not something that can be uploaded
into a PHP-only account.

### 0b. Free up disk space on your own machine

At the time of writing, drive **C: has 0 bytes free**. Git, `npm install`
and the image build all need temporary space on C:, and they fail in
confusing ways when there is none — a `git push` can abort half way.

The largest single item found was **`C:\Users\sheik\AppData\Local\Google`
at 14.5 GB**, which is Chrome's cache and profile. Clearing Chrome's
*cache* (Settings → Privacy → Clear browsing data → Cached images and
files) is safe and usually recovers most of it. Do not delete the whole
Google folder — that also holds your bookmarks and saved logins.

Aim for at least 5 GB free before continuing.

---

## 1. Put the code on GitHub

The repository already exists locally with 12 commits on `main`, so
**do not run `git init`** — it is already done. What is missing is a
remote.

First, create an empty repository on GitHub called `langnation-web`:
no README, no .gitignore, no licence — this project has its own.

**Make it private.** It is your business content.

Then:

```bash
cd /d/Project_All/LangNation_Web
git add .
git commit -m "Student portal, seal branding, cream palette"
git remote add origin https://github.com/YOUR-USERNAME/langnation-web.git
git push -u origin main
```

Replace `YOUR-USERNAME`. If GitHub asks for a password, it wants a
**personal access token**, not your account password:
GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → generate one with `Contents: read and write` for
this repository.

### What goes up, and what does not

About **30 MB** across 320-odd files. Deliberately excluded by
`.gitignore`:

| Excluded | Why |
|---|---|
| `.env` | Passwords. Never in a repository. |
| `node_modules/` | Hostinger installs these itself. |
| `public/downloads/` | 402 MB of exam MP3s and PDFs — see step 4. |
| `data/` | Runtime output, including the enquiry fallback log. |

Confirm `.env` really is excluded before you push:

```bash
git check-ignore -v .env
```

That must print a line mentioning `.gitignore`. If it prints nothing,
**stop** — your passwords are about to go to GitHub.

---

## 2. Create the database

hPanel → **Databases → MySQL Databases**

1. Create a database, e.g. `u648779252_langnation_web`
2. Create a user, give it access, and use a long generated password
3. Write down **host, database name, user, password** — you need all four
   in step 5

Then open **phpMyAdmin** for that database → **SQL** tab, and run the
three schema files **in this order**:

| Order | File | Adds |
|---|---|---|
| 1 | `MySQL/01_create_tables.sql` | `enquiries`, `page_views` |
| 2 | `MySQL/02_content_tables.sql` | the CMS tables: courses, posts, pages, media, admin users … |
| 3 | `MySQL/03_student_portal.sql` | the portal: students, intakes, enrolments, invoices, certificates … |

Order matters. File 3 has foreign keys pointing at `courses` and
`admin_users`, which file 2 creates — running it first fails with
`errno: 150`.

Paste one file at a time, press **Go**, and check it says success before
moving on. When all three are in you should have **27 tables**.

To sanity-check the files before you paste them:

```bash
npm run check:sql
```

---

## 3. Create the Node application

hPanel → **Advanced → Node.js** → create application

| Field | Value |
|---|---|
| Node version | 20 or newer |
| Application root | the folder for your domain, e.g. `domains/langnation.com/public_html` |
| Application URL | `new.langnation.com` for testing, `langnation.com` at cutover |
| Startup file | `server.js` |

The exact wording of these fields varies between hPanel versions — match
them by meaning, not by exact label.

Then connect the GitHub repository from step 1, or upload the project
folder **without** `node_modules`.

**Deploy to `new.langnation.com` first.** The site detects that it is not
on a production host and tells search engines not to index it, so you can
test in the open without harming your rankings. `SWITCHOVER.md` covers
creating that subdomain.

---

## 4. Upload the exam papers — once

The practice exams are **not** in Git: 402 MB of MP3 has no business in
version control. They live in `public/downloads/` and must be put on the
server by hand, one time.

They are already on your computer. Zip `public/downloads/`, upload via
hPanel **File Manager**, and extract it into the same path on the server.
Zip first — 43 large files uploaded individually will drop halfway.

**Do not skip this.** Without it, 46 download links on `/exam-papers` and
`/study-material` return 404, including every telc listening file.

Confirm afterwards by opening:
`/downloads/question-papper/1_Telc/A1/Telc-Deutsch-A1-Junior.pdf`

---

## 5. Set the environment variables

The Node.js panel has an **Environment variables** section. Variables set
there override the `.env` file, so you can leave `.env` off the server
entirely — which is the safer arrangement.

### Required

```
SITE_ORIGIN            https://new.langnation.com     (then the real domain at cutover)
PRODUCTION_HOSTS       langnation.com,www.langnation.com
NODE_ENV               production
ASSET_VERSION          2026-09-08
DB_HOST                localhost
DB_USER                (step 2)
DB_PASSWORD            (step 2)
DB_NAME                (step 2)
ADMIN_PASSWORD_HASH    (step 6)
SESSION_SECRET         (step 6)
CONTACT_EMAIL          info@langnation.com
```

`SITE_ORIGIN` is what decides staging versus production. Leave it as the
subdomain until cutover; the site blocks indexing on anything not listed
in `PRODUCTION_HOSTS`.

### Required before you take enrolments

German law requires a complete Impressum. The page prints a red warning
until these are filled in.

```
IMPRINT_COMPANY        …
IMPRINT_ADDRESS        …            (use \n for line breaks)
IMPRINT_REPRESENTATIVE …
IMPRINT_VAT_ID         …            (if you have one)
```

### Email — now required, not optional

The student portal *is* email: registration sends a verification link,
and without SMTP nobody can finish signing up.

```
SMTP_HOST   smtp.hostinger.com
SMTP_PORT   465
SMTP_USER   info@langnation.com
SMTP_PASS   (that mailbox's password)
SMTP_FROM   LangNation <info@langnation.com>
ENQUIRY_TO  info@langnation.com
```

### Appearance and page switches

```
PAGE_GROUND    cream          (or `cool` for the original blue)
HIDDEN_PAGES   team           (comma-separated slugs to hide)
```

Anything unrecognised in `PAGE_GROUND` falls back to `cool` rather than
breaking the site.

---

## 6. Create the admin password and session secret

On your own computer:

```bash
npm run admin:password
```

Type a passphrase — four unrelated words is ideal. It prints a hash. Put
**the hash** in `ADMIN_PASSWORD_HASH` and keep the passphrase in your
password manager: it cannot be recovered from the hash.

> The local `.env` currently holds a throwaway password meant only for
> testing on your own machine. Do not reuse it on the server.

Then a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put that in `SESSION_SECRET`. It signs both admin and student sessions —
**changing it later signs everybody out**, so set it once and keep it.

---

## 7. Install and start

In the Node.js panel: **Run NPM Install**, then **Start**.

Watch the log. You are looking for the startup banner and, importantly,
for the absence of the two "not configured" warnings:

```
LangNation website
──────────────────────────────────────────
14 courses · 5 posts · 25 pages
95 legacy redirects active
mode: production
```

If you see `MySQL not configured` or `SMTP not configured`, the variables
in step 5 have not taken effect — restart the app after adding them.

---

## 8. Check it before switching over

Public site:

- [ ] `/` loads, hero image appears, logo is the seal
- [ ] `/courses` — 14 courses, level and track filters work
- [ ] `/courses/german-regular-b1` — tabs switch
- [ ] `/de` and `/de/courses` in German
- [ ] `/contact` — **send a real test enquiry**
- [ ] `/placement-test` — accept terms, enter details, finish a paper, get a level
- [ ] `/exam-papers` — download a PDF **and** play an MP3 (audio must seek)
- [ ] `/study-material` — every PDF button opens a file
- [ ] `/faq`, `/tools` — accordion opens, calculators produce numbers
- [ ] `/German-Regular-A1` redirects to `/courses/german-regular-a1`
- [ ] On a phone: menu opens, nothing overflows sideways

Portal and admin:

- [ ] `/portal/register` — register a real address of your own
- [ ] the verification email **arrives**, and its link signs you in
- [ ] `/portal/me` shows your name and an empty portal
- [ ] `/portal/login` — sign out, sign back in
- [ ] a deliberately wrong password five times gives a lockout message
- [ ] `/admin` — sign in; the test enquiry is listed
- [ ] `/api/health` — `database: true`
- [ ] `/robots.txt` — on the subdomain it must say `Disallow: /`

Then, from your own machine:

```bash
npm run check
npm run audit -- --url https://new.langnation.com
```

`audit` re-checks every page and internal link against the real server.

---

## 9. Switch over — and only now touch the old site

1. **Take a fresh backup of the old site and its database.** The
   `public_html.zip` you already have is **truncated and cannot be
   extracted** — it is not a backup. Download a new one from hPanel.
2. Change `SITE_ORIGIN` to `https://www.langnation.com` and restart.
3. Point the domain at the Node app.
4. Watch Google Search Console for a week. The 95 redirects in
   `content/redirects.json` preserve your rankings — if you see 404s for
   URLs not in that list, tell me and I will add them.
5. Only after a clean week, remove the old PHP files.

---

## Which database migrations have been run

There is no migration table, so the answer is not written down
anywhere — it has to be asked of the database itself.

**Click your database in the left-hand list first**, then the SQL tab.
Three of the checks read real tables, so from the server page or from
inside `information_schema` MySQL answers
`#1109 - Unknown table 'courses' in information_schema` — which is
about the selected database, not about migrations.

Paste **`MySQL/check_migrations.sql`** into phpMyAdmin → **SQL**. It
changes nothing and can be run as often as you like. The first result
confirms which database it ran against; the second gives a row per
migration saying `yes` or `NO`:

| migration | adds | applied |
|---|---|---|
| 09_placement_review | placement_attempts.detail + final_level | yes |
| 10_intake_teacher_name | intakes.teacher_name | NO |

Run the files marked `NO`, lowest number first. Every migration checks
before it changes anything, so running one twice is harmless — when in
doubt, run it.

---

## Updating the site later

```bash
git add .
git commit -m "what changed"
git push
```

Then in hPanel: pull, and **Restart**.

Bump `ASSET_VERSION` whenever CSS or JS changes, so browsers fetch the new
file instead of a cached copy.

If you change the logo or the brand mark, run `npm run brand` before
committing — it rebuilds the icons **and** bumps the service worker's
cache name, without which returning visitors keep the old logo.

---

## If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| No **Node.js** menu in hPanel | Plan does not support Node | Step 0a — upgrade or VPS |
| 503 / app will not start | Missing dependency | Run NPM Install again, read the log |
| `errno: 150` in phpMyAdmin | SQL files run out of order | Run 01, then 02, then 03 |
| Pages load, enquiries vanish | Database credentials wrong | Check `/api/health`; nothing is lost — enquiries fall back to `data/enquiries.ndjson` |
| Portal says "Not available yet" | `DB_*` not set | Step 5, then restart |
| Registration works, no email | SMTP wrong | Read the log for "failed"; without SMTP nobody can verify |
| `/admin` says "No ADMIN_PASSWORD_HASH is set" | Step 6 not done | Add it, restart |
| Old CSS or old logo still showing | Cached | Bump `ASSET_VERSION`; for the logo run `npm run brand` |
| Impressum shows a red warning | `IMPRINT_*` empty | Required by German law |
| Subdomain appearing in Google | `SITE_ORIGIN` matches a production host | It should be the subdomain until cutover |

`/api/health` reports what the server thinks is configured, which is
usually the fastest way to find the problem.
