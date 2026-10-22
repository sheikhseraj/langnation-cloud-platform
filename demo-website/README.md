# LangNation Language Institute — website

The main LangNation website (langnation.com), rebuilt. Server-rendered
HTML, English and German, installable as a phone app.

Built on the same stack as the LangNation Dictionary (langnation.de) —
Node + Express + MySQL — so there is only one thing to learn and one way
to deploy.

---

## Run it on your own computer

```bash
npm install
cp .env.example .env      # then open .env and fill it in
npm start
```

Open <http://localhost:3000>.

The site runs fine with an empty `.env`. MySQL and email are optional:
without them every page still works, and enquiries are written to
`data/enquiries.ndjson` instead of the database.

| Command | What it does |
|---|---|
| `npm start` | Run the site |
| `npm run dev` | Run it and restart on every file change |
| `npm run check` | Pre-flight check — config, content, images, database |
| `npm run audit` | Crawl the running site: accessibility, SEO, broken links |
| `npm run admin:password` | Create the password for the `/admin` page |
| `npm run brand` | Rebuild logos and app icons from `brand/` |
| `npm run migrate:extract` | Re-import content from the old site's SQL dump |
| `npm run downloads` | Copy the exam papers and study PDFs from the old site |

---

## What is where

```
server.js            Wires everything together. Thin on purpose.
lib/
  analytics.js       Privacy-preserving page-view counts for /admin
  content.js         Loads content/*.json once at boot. No query per page view.
  db.js              THE ONLY FILE THAT TALKS TO MYSQL. Always parameterised.
  enquiries.js       Validate, store, list contact-form submissions
  i18n.js            Every English and German interface string
  mailer.js          Enquiry notification emails
  site.js            Contact details, social links, Impressum — all from .env
  text.js            Small shared text helpers
routes/
  pages.js           Every public page. Mounted twice: "/" and "/de".
  admin.js           The private /admin enquiries screen
views/               EJS templates. No SQL, no business logic.
public/
  css/site.css       The entire stylesheet — one file
  js/app.js          All the client-side behaviour — one file
  img/, icons/       Optimised WebP images, the logos and the PWA icon set
  downloads/         Exam papers and study PDFs (400 MB, NOT in git)
  manifest.webmanifest, sw.js    PWA files
brand/               Logo originals — the only files to replace for a rebrand
content/*.json       Courses, pages, blog posts, testimonials, FAQs
MySQL/               Database schema — run once in phpMyAdmin
tools/               One-off scripts: migration, icons, checks
```

### Three rules that keep it fast

The old site was slow for reasons that were structural, not accidental.
These three rules are what stop the same thing happening again:

1. **SQL only in `lib/db.js` and `lib/enquiries.js`, always with `?`
   placeholders.** The old site ran 432 queries from inside its HTML
   templates and built 167 of them by pasting strings together. That is
   what made it both slow and unsafe.
2. **One CSS file and one JS file.** The old site loaded 21 stylesheets
   and scripts, including two copies of jQuery. There is no framework
   here — modern CSS covers the entire layout.
3. **Every image is WebP with a `srcset`.** The old homepage shipped
   4.75 MB of PNGs. The same pictures here are about 40 KB.

---

## Editing the site

### Course text, prices, blog posts

Content lives in `content/*.json`, which is version-controlled — so every
change has a history and can be undone.

| File | Holds |
|---|---|
| `content/courses.json` | Course titles, prices, duration, full descriptions |
| `content/course-summaries.json` | The one-line summary on each course card (English + German) |
| `content/posts.json` | Blog articles |
| `content/pages.json` | About, privacy, terms, the Germany guide pages |
| `content/testimonials.json` | Student quotes |
| `content/faqs.json` | The FAQ page, the practice exams and the study material |
| `content/de/` | German translations, keyed by slug (see below) |

To change a price: open `content/courses.json`, find the course by its
`slug`, edit `priceEur` / `priceInr`, save, commit, redeploy.

Restart the site after editing — content is read once at start-up.

### German translations

Anything in `content/de/courses.json`, `de/pages.json` or `de/posts.json`
overrides the English version on `/de/…` pages, matched by `slug`. For
example:

```json
{
  "german-regular-a1": {
    "title": "Deutsch Regulär A1",
    "body": { "description": "<p>…</p>" }
  }
}
```

Anything without a German version falls back to English and shows a small
"not translated yet" note, rather than displaying machine-translated text
as if it were real.

Interface text (buttons, labels, headings) is not here — it is in
`lib/i18n.js`.

### Placement test

`/placement-test` marks itself and returns a CEFR level immediately.

| | |
|---|---|
| Question bank | `content/placement-questions.json` — 14 per level, A1 to C2 |
| Served per paper | 7 per level (`PLACEMENT_PER_LEVEL` in `.env`) |
| Tracks | A1–B1 and B2–C2, so a beginner never sits C1 grammar |
| Marking | `lib/placement.js`, server-side only |

Three things about it are deliberate:

- **The answer key never reaches the browser.** Questions are served
  without `answer` or `explain`, and marking happens on the server.
  Otherwise the key would be readable from the page source.
- **Every attempt is a different paper.** Questions are drawn at random
  from the pool and the four options shuffled, so sitting it twice does
  not give the same test. In the source file the correct answer is always
  written first — that makes review easy, and is exactly why the options
  must not be served in that order.
- **The paper is signed.** Because the selection is random, the server has
  to know which paper this person saw. Rather than hold session state, the
  question ids and their option order are HMAC-signed into a hidden field.
  Editing it invalidates the signature, and it contains no answers.

A level counts as reached at 70% correct, and the result is the first
level *not* reached — that is the one still to learn. Someone who manages
A1 and A2 but not B1 is placed in B1, not sent back to A2. Mastery has to
be consecutive, so one lucky guess higher up cannot skip a level.

**Have a teacher review the questions before this goes live.** They were
written to the CEFR descriptors, but they are your pedagogical product and
a wrong level costs the student money. To edit: open the JSON, change the
text, and put the correct option first — `answer` is its index, so keeping
the right answer at position 0 makes the file easy to read. `npm run
check` verifies every answer index is in range, that no question repeats
an option, and that no ids clash.

### The logo

There are two complete brand marks, and one is active at a time:

| | |
|---|---|
| **seal** | The circular seal — a medallion beside the LangNation wordmark |
| **crest** | The original eagle crest lockup |

Switch between them, and check which is on:

```
npm run brand:seal      # use the seal
npm run brand:crest     # go back to the crest
node tools/brand.js     # which one is active?
```

Switching is instant and lossless — both sets are kept built under
`brand/dist/`, so going back and forth restores byte-identical files. The
site itself needs no edits: each set is written under the same filenames
the pages, the manifest and the service worker already ask for.

Two things the switch does that are easy to forget by hand. It bumps the
service worker's cache name, because the icon *URLs* do not change — only
their contents — so without that bump every returning visitor and every
installed copy of the app would keep showing the old mark. And it writes
`content/brand.json` with the logo's rendered width, because the crest
lockup is about 2.5:1 and the seal nearer 4:1; the templates read those
numbers so the header does not jump while the logo loads.

#### How the seal lockup is built

The header mark is two pieces sitting side by side, composed at build time
into one image per size:

- **The emblem** is `brand/seal/mark.png` — the simplified crest with a
  laurel, a globe and `LN`, and no ring text. Neither full seal works at
  header size: their two rings of lettering collapse into grey mush, and on
  the cream page the light seal's own cream field disappears into the
  background. The full seals are kept for large uses such as a certificate.
- **The lettering** is cropped straight out of `brand/LNS_Logo.png` — the
  old crest lockup, which already carries `LangNation®` and `Language
  Institute` in the geometric sans the school has always used. Cropping it
  means the name is set in exactly the right face with no webfont to load
  for two words. The bands were found by scanning that file's alpha
  channel; the small `Where Language Signify Nation` tagline below them is
  deliberately excluded, being too fine to survive a header.

The lettering is retinted per theme — navy on light, brand gold on dark.
It arrives navy, so the dark version *must* be tinted or it vanishes into
the navy footer.

Sizes live in `tools/brand.js` as `DISPLAY_H` (54px, the header) and
`FOOTER_H` (62px), and are written into `content/brand.json` for the img
attributes. The built files stay at 48/96/144 pixels tall, because those
sizes appear in the service worker's precache list — but the header srcset
starts at 96, since a browser at DPR 1 would otherwise pick the 48px file
and stretch it to 54px, which showed as a visibly soft mark.

#### The originals

Everything is generated from `brand/`, which is never written to:

| File | Becomes |
|---|---|
| `LNS_Logo.png` | Crest header logo (light) — and the seal lockup's lettering |
| `LNS_Logo_White.png` | Crest header logo, dark mode and the footer |
| `LNS_Crest.png` | Crest favicon, app icons, sharing card |
| `LNS_Seal.png` | The designer's brand sheet — all of the seal set |

`LNS_Seal.png` is a single 1536×1024 sheet with the seals, app icons,
favicons, wordmark and palette laid out on it. `npm run brand:crop` cuts
it into `brand/seal/`, finding each panel by scanning the sheet's alpha
channel rather than by fixed coordinates, so a redrawn sheet with the same
layout still works. Re-run it if your designer sends a new sheet.

After replacing any original, run `npm run brand` — it regenerates both
sets and leaves the active one active.

Note the seal set is limited by the sheet: the largest seal on it is only
~500px, so `icon-512.png` is very slightly upscaled. Ask the designer for
native exports of the seal and the app tile before printing anything
large, such as a certificate.

The white crest original arrived with the editor's transparency
checkerboard flattened into it as real dark pixels; the build keys that
out by using the artwork's own brightness as its transparency. If you
export a new white logo, it does not matter whether the background is
transparent or dark — either works.

### Colours

The palette comes off the same brand sheet as the seal, so the page and the
logo are literally the same two colours:

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--navy` | `#0B2D52` | `#5b84c4` | Buttons, headings, the seal's own navy |
| `--gold` | `#D4AF37` | `#D4AF37` | The brand gold: gold **surfaces**, and gold ink on dark |
| `--on-gold` | `#0B2D52` | `#16110a` | Whatever is written on top of `--gold` |
| `--gold-ink` | `#816b22` | `#D4AF37` | Gold **text**, borders and thin fills |
| `--gold-soft` | `#F8F1E3` | `#22305a` | Cream panels behind gold ink |
| `--footer-bg` | `#0B2D52` | `#08203C` | The footer band, dark in both themes |

#### The page ground

The page itself can be either of two colours, set in `.env`:

```
PAGE_GROUND=cream    # warm parchment, from the brand sheet (current)
PAGE_GROUND=cool     # the cool blue the site launched with
```

Anything other than those two falls back to `cool`, so a typo softens the
look rather than taking the site down. Dark mode is unaffected by this
setting — it has its own surfaces either way.

Cream is not just `--paper`. Six surfaces stack on each other — page,
section, card, panel, gold panel, gradient — and contrast runs out at the
bottom of that stack, not at the top. So on cream:

- `--muted` is `#546484`, chosen to clear 4.5:1 against `--gold-soft`, the
  darkest surface it can land on. The obvious value failed there at 4.07:1.
- `--gold-soft` is `#F0E4CC`, deeper than the page. At the sheet's own
  `#F8F1E3` the gold panels were invisible against a cream page.
- `--gold-ink` darkens to `#796520` so it still clears 4.5:1 on that
  deeper panel.
- Cards are `#FFFCF5`, not white — pure white looks like a hole in cream.
- The shadows are warm (`rgba(74, 58, 26, …)`). Navy-tinted shadows go
  grey and dead over cream.

Why bother: the seal's own field is a warm cream — `#F0E8D0` sampled off
the artwork — so on a cool blue page it read faintly like a sticker stuck
onto it. The footer stays navy in both grounds, and the contrast between
navy and cream is the strongest thing on the page.

The one thing to understand before editing these: **the brand gold cannot be
used as text on the light page.** `#D4AF37` on the page ground is 1.94:1,
which is invisible to a lot of people and fails WCAG badly. That is why
there are two gold tokens rather than one:

- gold as a **background** → `background: var(--gold); color: var(--on-gold)`
- gold as **text, a border or a thin fill** → `var(--gold-ink)`

`--gold-ink` is the same hue darkened until it clears 4.5:1 on the light
page, and it flips to the full brand gold in dark mode, where bright is the
readable one. So a rule can name one of the two and be correct in both
themes without needing a dark-mode override.

Adopting the sheet's colours also fixed two contrast failures that were
already there: gold buttons were white-on-gold at 3.02:1 and are now
navy-on-gold at 6.61:1 — which is the pairing the seal itself uses — and
the eyebrow text went from 2.79:1 to 4.78:1.

To check the palette after editing it, open the site and run the contrast
audit in the browser console; every text token should clear 4.5:1 (3:1 for
display-size headings) in both themes.

### Contact details, social links, Impressum

All in `.env`. Nothing to edit in the code.

---

## Reading enquiries

Every contact-form submission is stored **before** any email is sent, so
an email problem can never lose a lead.

- **`/admin`** — password-protected list, filter by new / replied / closed.
  Set the password with `npm run admin:password`.
- **Email** — a notification goes to `ENQUIRY_TO` if SMTP is configured.
- If MySQL is unreachable, enquiries append to `data/enquiries.ndjson` and
  `/admin` reads them from there, with a visible warning.

## Which pages people read

`/admin` also shows the most-viewed pages of the last 30 days. It is
counted on your own server: a total per page per day, and nothing else.
No cookie, no visitor id, no IP, no third-party script — so it needs no
cookie banner, and it costs nothing in page weight. Visitors sending
"Do Not Track" or Global Privacy Control are not counted, and neither are
bots, downloads or 404s.

Counts are buffered in memory and written every 30 seconds, so a busy
page is one database write per flush rather than one per visitor. It
needs MySQL; without it the panel simply does not appear.

---

## Deploying

**[SWITCHOVER.md](SWITCHOVER.md)** is the one to follow the first time:
replacing the live PHP site on Hostinger, step by step, with a rollback at
every stage.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the shorter reference version,
and **[docs/PWA.md](docs/PWA.md)** for publishing the phone app with
PWABuilder.

Run `npm run check` before every deploy.

---

## Where the content came from

Everything was migrated out of the old CodeIgniter site's database dump by
`tools/extract-old-content.js`. That script also:

- pulled 23 images out of base64 blobs that had been pasted into the
  database (one page row was 4.4 MB of embedded JPEG)
- stripped the Microsoft Word markup the old editor left behind
- converted 112 MB of PNG and JPEG source images into 2.7 MB of WebP

It is safe to re-run — it only reads the old files and overwrites its own
output.
