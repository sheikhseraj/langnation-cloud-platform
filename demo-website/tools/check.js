/* The tests run in UTC, because the server does.
 *
 * This is not tidiness. A template that formats a time without naming a
 * zone falls back to the machine's own, and a developer in Germany
 * cannot see that: a 19:00 Europe/Berlin class formats as "19:00" on a
 * Berlin laptop and "17:00" on the UTC host that actually serves it.
 *
 * That bug shipped. Students were told their evening class was two
 * hours earlier than it is, on a card whose own footnote says the times
 * are Europe/Berlin. The regression test written for it passed on the
 * machine that wrote it and would have passed forever.
 *
 * Set before anything else, so no module captures a date first.
 */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Pre-flight check.  npm run check
//
//  Answers "is this deployment actually going to work?" without starting
//  a browser: config present, content loadable, every referenced image on
//  disk, no duplicate slugs, database and SMTP reachable if configured.
//
//  Exit code 1 if anything is broken, 0 if only warnings.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const { loadEnv, env } = require("../lib/env");
loadEnv();

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

let errors = 0;
let warnings = 0;

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => { warnings++; console.log(`  ! ${m}`); };
const fail = (m) => { errors++; console.log(`  ✗ ${m}`); };

function section(title) {
  console.log(`\n${title}`);
}

// ── Content ──────────────────────────────────────────────────────────
section("Content");

let content;
try {
  content = require("../lib/content");
  const s = content.stats();
  ok(`${s.courses} courses, ${s.posts} posts, ${s.pages} pages, ${s.testimonials} testimonials, ${s.faqs} FAQs`);
  ok(`${s.team} team members, ${s.events} events, ${s.gallery} gallery photos`);
  if (!s.courses) fail("No courses loaded — run: npm run migrate:extract");
} catch (e) {
  fail(`Content failed to load: ${e.message}`);
  process.exit(1);
}

// Duplicate slugs would make one page permanently unreachable.
for (const [label, list] of [
  ["course", content.courses("en")],
  ["post", content.posts("en")],
  ["page", content.pages("en")],
]) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of list) {
    if (seen.has(item.slug)) dupes.add(item.slug);
    seen.add(item.slug);
  }
  if (dupes.size) fail(`Duplicate ${label} slugs: ${[...dupes].join(", ")}`);
  else ok(`No duplicate ${label} slugs`);
}

// ── Images ───────────────────────────────────────────────────────────
section("Images");

const missing = [];
const seenImages = new Set();

function checkImage(img, where) {
  if (!img) return;
  const files = [img.src, ...(img.srcset || "").split(",").map((s) => s.trim().split(" ")[0])];
  for (const raw of files.filter(Boolean)) {
    // Picture URLs carry ?v=<hash> so a replaced photograph reaches
    // people who already have the old one. The file on disk has no such
    // suffix, so the version comes off before looking for it — without
    // this every image reads as missing, which is exactly how this line
    // announced itself.
    const f = raw.split("?")[0];
    if (seenImages.has(f)) continue;
    seenImages.add(f);
    if (!fs.existsSync(path.join(PUBLIC, f))) missing.push(`${f}  (${where})`);
  }
}

for (const c of content.courses("en")) checkImage(c.image, `course ${c.slug}`);
for (const p of content.posts("en")) checkImage(p.image, `post ${p.slug}`);
for (const p of content.pages("en")) checkImage(p.image, `page ${p.slug}`);
for (const t of content.testimonials()) checkImage(t.image, `testimonial ${t.name}`);
for (const key of ["hero", "germany", "classroom"]) checkImage(content.image(key), `site ${key}`);
for (const p of content.team()) checkImage(p.image, `team ${p.name}`);
for (const g of content.gallery()) checkImage(g.image, `gallery ${g.caption}`);
for (const e of content.events("en").all) checkImage(e.image, `event ${e.slug}`);

if (missing.length) {
  fail(`${missing.length} referenced image file(s) missing:`);
  missing.slice(0, 8).forEach((m) => console.log(`      ${m}`));
} else {
  ok(`All ${seenImages.size} referenced image files exist`);
}

// Images embedded in migrated body HTML.
const bodyRefs = new Set();
const scan = (html) => {
  for (const m of String(html || "").matchAll(/src="(\/img\/[^"]+)"/g)) bodyRefs.add(m[1]);
};
for (const c of content.courses("en")) Object.values(c.body).forEach(scan);
for (const p of content.pages("en")) { scan(p.body); scan(p.body2); }
for (const p of content.posts("en")) scan(p.body);

const bodyMissing = [...bodyRefs].filter((f) => !fs.existsSync(path.join(PUBLIC, f)));
if (bodyMissing.length) fail(`${bodyMissing.length} image(s) referenced inside page content are missing`);
else ok(`All ${bodyRefs.size} in-content images exist`);

// ── Templates ────────────────────────────────────────────────────────
//  A syntax error in a template only shows up when that page is requested,
//  which means a broken page can sit unnoticed until a visitor finds it.
//  Compiling every one here turns that into a build-time failure.
section("Templates");

try {
  const ejs = require("ejs");
  const viewsDir = path.join(ROOT, "views");

  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.name.endsWith(".ejs") ? [full] : [];
    });

  const templates = walk(viewsDir);
  const broken = [];

  for (const file of templates) {
    try {
      ejs.compile(fs.readFileSync(file, "utf8"), { filename: file });
    } catch (e) {
      broken.push(`${path.relative(ROOT, file)} — ${String(e.message).split("\n")[0]}`);
    }
  }

  if (broken.length) {
    fail(`${broken.length} template(s) will not compile:`);
    broken.forEach((b) => console.log(`      ${b}`));
  } else {
    ok(`All ${templates.length} templates compile`);
  }
} catch (e) {
  warn(`Could not compile templates: ${e.message}`);
}

// ── Placement test ───────────────────────────────────────────────────
section("Placement test");
try {
  const placement = require("../lib/placement");
  const pools = placement.poolSizes();
  const per = placement.perPaper();
  const thin = Object.entries(pools).filter(([, n]) => n.items < per);

  ok(
    `Pool: ${Object.entries(pools).map(([l, n]) => `${l}=${n.items}+${n.reading}r`).join("  ")}` +
      `  ·  ${per} items + all reading served per level`
  );
  ok(`One paper: ${placement.paperSize("a1-b1")} questions (A1–B1), ${placement.paperSize("b2-c2")} (B2–C2)`);

  const noReading = Object.entries(pools).filter(([, n]) => !n.reading);
  if (noReading.length) warn(`No reading comprehension at ${noReading.map(([l]) => l).join(", ")}`);

  if (thin.length) {
    fail(`Too few single items at ${thin.map(([l]) => l).join(", ")} — each level needs at least ${per}`);
  } else if (Object.values(pools).some((n) => n.items < per * 1.5)) {
    warn("Item pool is barely larger than the paper — two attempts will look very similar");
  } else {
    ok("Item pool is comfortably larger than the paper, so attempts vary");
  }

  // A reading question pointing at a missing passage would render bare.
  const passages = new Set((require("../content/placement-questions.json").passages || []).map((x) => x.id));
  const orphans = require("../content/placement-questions.json").questions.filter(
    (q) => q.passage && !passages.has(q.passage)
  );
  if (orphans.length) fail(`Reading question(s) reference a missing passage: ${orphans.map((q) => q.id).join(", ")}`);
  else ok(`All ${passages.size} reading passages resolve`);

  // A bad answer index would silently mark a correct answer wrong.
  const bank = require("../content/placement-questions.json").questions;
  const broken = bank.filter(
    (q) =>
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      typeof q.answer !== "number" ||
      q.answer < 0 ||
      q.answer >= q.options.length
  );
  if (broken.length) fail(`${broken.length} question(s) have an invalid answer index: ${broken.map((q) => q.id).join(", ")}`);
  else ok(`All ${bank.length} questions have a valid answer key`);

  // Duplicate options within a question make it unanswerable.
  const dupOptions = bank.filter((q) => new Set(q.options).size !== q.options.length);
  if (dupOptions.length) fail(`Repeated options in: ${dupOptions.map((q) => q.id).join(", ")}`);
  else ok("No question repeats an option");

  const dupIds = bank.map((q) => q.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupIds.length) fail(`Duplicate question ids: ${[...new Set(dupIds)].join(", ")}`);
  else ok("No duplicate question ids");
} catch (e) {
  fail(`Placement test failed to load: ${e.message}`);
}

// ── Downloadable files ───────────────────────────────────────────────
section("Downloads");

const downloadRefs = new Set();
const scanDownloads = (html) => {
  for (const m of String(html || "").matchAll(/(?:href|src)="(\/downloads\/[^"]+)"/g)) {
    downloadRefs.add(m[1]);
  }
};
for (const c of content.courses("en")) Object.values(c.body).forEach(scanDownloads);
for (const p of content.pages("en")) { scanDownloads(p.body); scanDownloads(p.body2); }
for (const p of content.posts("en")) scanDownloads(p.body);
for (const f of content.faqs()) scanDownloads(f.answer);

if (!downloadRefs.size) {
  ok("No download links in content");
} else {
  const missingDownloads = [...downloadRefs].filter((url) => {
    // Links are written as HTML, so "&" arrives as "&amp;"; and the path is
    // percent-encoded. Undo both before looking on disk.
    let p = url.replace(/&amp;/g, "&");
    try { p = decodeURI(p); } catch { /* leave as-is */ }
    return !fs.existsSync(path.join(PUBLIC, p));
  });

  if (!missingDownloads.length) {
    ok(`All ${downloadRefs.size} download links resolve to a real file`);
  } else if (!fs.existsSync(path.join(PUBLIC, "downloads"))) {
    warn(
      `public/downloads/ is missing — ${missingDownloads.length} exam paper / study links will 404. Run: npm run downloads`
    );
  } else {
    fail(`${missingDownloads.length} download link(s) point at files that are not there:`);
    missingDownloads.slice(0, 6).forEach((m) => console.log(`      ${m}`));
  }
}

// ── Required files ───────────────────────────────────────────────────
section("Required files");

for (const f of [
  "public/manifest.webmanifest",
  "public/sw.js",
  "public/offline.html",
  "public/css/site.css",
  "public/js/app.js",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/icon-maskable-512.png",
  "public/icons/apple-touch-icon.png",
  "public/icons/favicon-32.png",
  "public/icons/favicon-16.png",
  "public/icons/favicon-48.png",
  "public/icons/favicon-96.png",
  "public/icons/favicon-128.png",
  "public/favicon.ico",
  "public/img/og-default.png",
  "MySQL/01_create_tables.sql",
  "MySQL/02_content_tables.sql",
  "MySQL/03_student_portal.sql",
]) {
  if (fs.existsSync(path.join(ROOT, f))) ok(f);
  else fail(`${f} is missing`);
}

// ── Configuration ────────────────────────────────────────────────────
section("Configuration");

if (!fs.existsSync(path.join(ROOT, ".env"))) {
  warn("No .env file — copy .env.example to .env and fill it in");
} else {
  ok(".env present");
}

const origin = env("SITE_ORIGIN", "");
const siteCfg = require("../lib/site");
if (!origin) warn("SITE_ORIGIN not set — canonical URLs and sitemap will be wrong");
else if (siteCfg.isStaging) {
  warn(`SITE_ORIGIN is ${origin} — treated as STAGING: search engines are blocked. Correct for a test copy, wrong for the live site.`);
} else ok(`SITE_ORIGIN = ${origin} (live — search engines allowed)`);

if (!env("ADMIN_PASSWORD_HASH") && !env("ADMIN_PASSWORD"))
  warn("No admin password set — /admin cannot be opened. Set ADMIN_PASSWORD, or ADMIN_PASSWORD_HASH from: npm run admin:password");
else if (env("ADMIN_PASSWORD") && !env("ADMIN_PASSWORD_HASH"))
  warn("ADMIN_PASSWORD is stored in plain text — anyone who can read the server environment can read it. ADMIN_PASSWORD_HASH is safer.");
else ok("Admin password configured");

if (!env("SESSION_SECRET")) warn("SESSION_SECRET not set — admin sessions will drop on every restart");
else ok("Session secret configured");

const imprintReady = env("IMPRINT_COMPANY") && env("IMPRINT_ADDRESS") && env("IMPRINT_REPRESENTATIVE");
if (!imprintReady) warn("Impressum incomplete — required by German law before launch (IMPRINT_* in .env)");
else ok("Impressum details configured");

if (!env("SMTP_HOST")) warn("SMTP not configured — enquiry emails disabled (enquiries are still stored)");
else ok(`SMTP host = ${env("SMTP_HOST")}`);

// ── Live services ────────────────────────────────────────────────────
(async () => {
  section("Services");

  const db = require("../lib/db");
  if (!db.init()) {
    warn("MySQL not configured — enquiries fall back to data/enquiries.ndjson");
  } else if (await db.healthy()) {
    try {
      await db.query("SELECT 1 FROM enquiries LIMIT 1");
      ok("MySQL reachable and the enquiries table exists");
    } catch {
      fail("MySQL reachable but the `enquiries` table is missing — run MySQL/01_create_tables.sql");
    }

    // Exercise the page-view path for real: write a row, read it back through
    // the same query the admin page uses, then remove it. This is the only
    // way to be sure the counter works on *this* MySQL version, since the
    // upsert and the date arithmetic are the parts that vary between hosts.
    try {
      const analytics = require("../lib/analytics");
      const probe = `/__selftest__/${Date.now()}`;

      await db.query(
        `INSERT INTO page_views (path, lang, day, views)
         VALUES (?, 'en', CURDATE(), 1)
         ON DUPLICATE KEY UPDATE views = views + VALUES(views)`,
        [probe]
      );
      await db.query(
        `INSERT INTO page_views (path, lang, day, views)
         VALUES (?, 'en', CURDATE(), 1)
         ON DUPLICATE KEY UPDATE views = views + VALUES(views)`,
        [probe]
      );

      const rows = await analytics.topPages({ days: 1, limit: 200 });
      const mine = rows.find((r) => r.path === probe);
      await db.query("DELETE FROM page_views WHERE path = ?", [probe]);

      if (mine && Number(mine.views) === 2) {
        ok("Page-view counter works (write, upsert and read verified)");
      } else {
        fail("Page-view counter did not read back correctly — /admin statistics will be empty");
      }
    } catch (e) {
      fail(`Page-view counter failed: ${e.message}`);
      console.log("      Run MySQL/01_create_tables.sql to create the page_views table.");
    }
  } else {
    fail(`MySQL unreachable: ${db.getLastError()}`);
  }
  await db.close().catch(() => {});

  console.log(`\n${"─".repeat(60)}`);
  if (errors) console.log(`  ${errors} error(s), ${warnings} warning(s) — fix the errors before deploying.`);
  else if (warnings) console.log(`  No errors, ${warnings} warning(s) — safe to deploy, but read the warnings.`);
  else console.log("  All checks passed.");
  console.log("");

  process.exit(errors ? 1 : 0);
})();
