/* ═══════════════════════════════════════════════════════════════════
   Import photographs from a folder and wire them into the site.

     node tools/import-images.js                 (reads D:/Project_All/Image)
     node tools/import-images.js path/to/folder
     node tools/import-images.js --dry-run

   Match by FILE NAME. "Regular A1.png" finds the course titled "German
   Regular A1"; "Fast Track.png" finds "Fast Track"; "Home.png" is the
   picture beside the headline on the home page; "Tax ID.webp" finds the
   guide page of that name. Nothing is guessed: a file that matches no
   course, or more than one thing, is reported and left alone rather
   than being attached to whichever came first.

   Each picture is written at three widths as WebP and never enlarged
   past its source, so a small original stays sharp instead of being
   stretched. The originals stay where they are — this reads them.

   Two things are then updated: content/courses.json, which is what the
   site serves when there is no database, and MySQL/course-images.sql,
   which is how a database that already holds courses learns the new
   paths. Run the SQL on the live site; without it the editor's own
   image field still points at whatever was there before.
   ═══════════════════════════════════════════════════════════════════ */
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const DEFAULT_SOURCE = "D:/Project_All/Image";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const SOURCE = args.find((a) => !a.startsWith("--")) || DEFAULT_SOURCE;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

/* Where each kind of picture goes, and at which widths. The course
   widths match what the card asks for in its `sizes` attribute; the
   site widths match the hero's. */
const COURSE = { dir: "public/img/courses", url: "/img/courses", widths: [400, 800, 1400] };
const SITE = { dir: "public/img/site", url: "/img/site", widths: [560, 900, 1400] };
/* A blog card is a card too. Same widths as a course card, and the
   same three-file naming the existing posts already use. */
const POST = { dir: "public/img/blog", url: "/img/blog", widths: [400, 800, 1400] };

/* The Living-and-studying-in-Germany pages, and the rest of the CMS.
   A page picture sits above the text at the article's own width, so it
   takes the card widths rather than the hero's — 1400 is already more
   than the 720px column ever asks for, and it is there for the retina
   screens that ask for twice what they show. */
const PAGE = { dir: "public/img/pages", url: "/img/pages", widths: [400, 800, 1400] };

/* A track card is a card, so it wants the card's widths rather than
   the hero's. */
const TRACK = { dir: "public/img/site", url: "/img/site", widths: [400, 800, 1400] };

/* Pictures that are not a course. The key is the file name; the value
   is the name the templates ask for through content.image(). */
const SITE_IMAGES = {
  home: "hero",
  hero: "hero",
  germany: "germany",
  classroom: "classroom",
  // A screenshot of the dictionary, for the band on the home page.
  // Without one that band shows the sixteen languages instead, which
  // is the part worth showing anyway.
  dictionary: "dictionary",
  // The Einbürgerungstest band on the home page.
  //
  // Three keys for one picture. norm() strips anything that is not
  // a-z0-9, which takes the umlaut out rather than folding it — so
  // "Einbürgerungstest.png" arrives here as einbrgerungstest, with no
  // u at all. That is the key a file named the German way actually
  // produces; the other two are for a file named around the umlaut,
  // either by spelling it out or by dropping it.
  einbrgerungstest: "einbuergerungstest",
  einbuergerungstest: "einbuergerungstest",
  einburgerungstest: "einbuergerungstest",
};

/* The card for a whole kind of course on the home page, named
   "<track> HomePage". It needs its own picture because every course
   photo has that course's level painted into the corner, and a large
   "A1" on a card labelled "A1 – C2" is wrong.

   Either name works: the track as the catalogue stores it, or the
   label the site shows. Nobody should have to know that One-to-one is
   "Individual" underneath. */
const TRACK_ALIASES = {
  regular: "regular",
  individual: "individual",
  onetoone: "individual",
  "1to1": "individual",
  intensive: "intensive",
  weekend: "weekend",
  speaking: "speaking",
};

/** "Regular HomePage" → "track-regular", or null. */
function trackImageName(base) {
  const cleaned = norm(base);
  for (const suffix of ["homepage", "home", "card", "track"]) {
    if (!cleaned.endsWith(suffix) || cleaned === suffix) continue;
    const prefix = cleaned.slice(0, -suffix.length);
    if (TRACK_ALIASES[prefix]) return "track-" + TRACK_ALIASES[prefix];
  }
  return null;
}

const courses = JSON.parse(fs.readFileSync(path.join(ROOT, "content/courses.json"), "utf8"));
const siteImages = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site-images.json"), "utf8"));
// Read straight off disk rather than through lib/content, which stamps
// picture URLs with ?v= as it loads them. That version belongs on the
// page, not in the file — writing one back would bake it into the
// content and the next import would stamp the stamp.
const posts = JSON.parse(fs.readFileSync(path.join(ROOT, "content/posts.json"), "utf8"));
/* Only the English pages. content/de/pages.json holds a translated
   title and body per slug and nothing else: the picture is the same
   picture whichever language you read it in, and the German page
   inherits it. Writing it into both files would be two places to keep
   in step for no gain. */
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, "content/pages.json"), "utf8"));
/* The German overlay. A picture is normally the same picture in both
   languages and belongs on the English record alone — but a DIAGRAM is
   not a photograph: its labels are words, and words are translated.
   "german-school-system-de.png" therefore sets the German image only,
   leaving the English page to its own. */
const dePages = JSON.parse(fs.readFileSync(path.join(ROOT, "content/de/pages.json"), "utf8"));
/* Nine pages were saved with a misspelt slug by the old admin.
   lib/content.js corrects them as it loads and then looks the German up
   by the CORRECTED slug, so an overlay entry written under the raw one
   is never read — and it fails silently, because the page still renders
   and merely looks untranslated. The German for "gymnasiam" landed in
   exactly that hole once already. */
const SLUG_FIXES = require("../lib/slug-fixes");
const fixedSlug = (s) => SLUG_FIXES[s] || s;

/**
 * A trailing "-de" or "-en" on a file name, taken off.
 *
 * Only pages have a language overlay to write into, so this is asked
 * only of them. A separator is required before the tag so that a title
 * ending in those two letters is not mistaken for one.
 */
function languageOf(base) {
  const m = /^(.*?)[-_. ]+(de|en)$/i.exec(String(base).trim());
  if (!m) return { base, lang: "en" };
  return { base: m[1], lang: m[2].toLowerCase() };
}

/**
 * The course a file name refers to, or a reason it could not be told.
 *
 * A file is allowed to leave off the leading "German ": the folder is
 * full of German courses and repeating it in every file name is noise.
 * Everything else has to match, and it has to match exactly one course
 * — "Individual Session" must not quietly become "Individual Session
 * School" because it happens to be a prefix of it.
 */
/**
 * The post a file is named after.
 *
 * Matched on the title or the slug, both normalised, because a file
 * exported from a design tool is named after the headline — "Language
 * Learning and Brain Development Two Relatable Factors" — while the
 * site knows it by its slug, and the colon in the real title is not
 * something anybody types into a filename.
 */
function findPost(base) {
  const want = norm(base);
  const hits = posts.filter((p) => norm(p.title) === want || norm(p.slug) === want);
  if (hits.length === 1) return { post: hits[0] };
  if (hits.length === 0) return { error: "no course or post has this title" };
  return { error: "matches " + hits.length + " posts: " + hits.map((p) => p.slug).join(", ") };
}

/**
 * The guide page a file is named after.
 *
 * These pages are named after what they are — "Tax ID", "Finding
 * somewhere to live" — so a picture exported under the page's own
 * heading finds its page. The slug works too: "other-jobs" is what the
 * site calls the page titled "Other kinds of work", and either is a
 * reasonable thing to type on a file.
 */
function findPage(rawBase) {
  const want = norm(languageOf(rawBase).base);
  const hits = pages.filter((p) => norm(p.title) === want || norm(p.slug) === want);
  if (hits.length === 1) return { page: hits[0] };
  if (hits.length === 0) return { error: "no page has this title" };
  return { error: "matches " + hits.length + " pages: " + hits.map((p) => p.slug).join(", ") };
}

function findCourse(base) {
  const want = norm(base);
  const hits = courses.filter((c) => {
    const title = norm(c.title);
    return title === want || (title.startsWith("german") && title.slice(6) === want);
  });
  if (hits.length === 1) return { course: hits[0] };
  if (hits.length === 0) return { error: "no course has this title" };
  return { error: "matches " + hits.length + " courses: " + hits.map((c) => c.slug).join(", ") };
}

async function write(source, outDir, urlDir, stem, widths) {
  const meta = await sharp(source).metadata();
  const made = [];
  for (const w of widths) {
    const out = path.join(ROOT, outDir, `${stem}-${w}.webp`);
    if (!dryRun) {
      await sharp(source)
        // Never upscale: a 400px original blown up to 1400 is worse
        // than the 400 it already was.
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(out);
    }
    made.push({ w, url: `${urlDir}/${stem}-${w}.webp` });
  }
  return {
    meta,
    src: made[made.length - 1].url,
    srcset: made.map((m) => `${m.url} ${m.w}w`).join(", "),
  };
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`\n  Cannot read ${SOURCE}\n`);
    process.exitCode = 1;
    return;
  }

  const files = fs
    .readdirSync(SOURCE)
    .filter((f) => /\.(png|jpe?g|webp|avif|tiff?)$/i.test(f))
    .sort();

  console.log(`\n  Reading ${SOURCE} — ${files.length} picture(s)${dryRun ? "  [dry run]" : ""}\n`);

  const done = [];
  const skipped = [];
  const sqlRows = [];

  for (const file of files) {
    const base = path.parse(file).name;
    const source = path.join(SOURCE, file);

    const trackKey = trackImageName(base);
    if (trackKey) {
      const out = await write(source, TRACK.dir, TRACK.url, trackKey, TRACK.widths);
      if (!dryRun) siteImages[trackKey] = { src: out.src, srcset: out.srcset };
      done.push([file, `home-page card for "${trackKey.slice(6)}"`, `${out.meta.width}×${out.meta.height}`]);
      continue;
    }

    const siteKey = SITE_IMAGES[norm(base)];
    if (siteKey) {
      const out = await write(source, SITE.dir, SITE.url, siteKey, SITE.widths);
      if (!dryRun) siteImages[siteKey] = { src: out.src, srcset: out.srcset };
      done.push([file, `site image "${siteKey}"`, `${out.meta.width}×${out.meta.height}`]);
      continue;
    }

    // A course, a blog post or a guide page. All three are asked at
    // once rather than in turn, because a name that means two of them
    // is not a tie to be broken by the order this file happens to try
    // them in — it is a name that is ambiguous, and saying so is the
    // only answer that cannot silently put a picture on the wrong page.
    const { course, error: courseError } = findCourse(base);
    const { post, error: postError } = findPost(base);
    const { page, error: pageError } = findPage(base);

    const hits = [];
    if (course) {
      hits.push({
        kind: "course", row: course, target: COURSE, stem: course.slug,
        label: `${course.title}  (${course.slug})`,
      });
    }
    if (post) {
      hits.push({
        kind: "blog post", row: post, target: POST, stem: post.slug,
        label: `${post.title}  (blog)`,
      });
    }
    if (page) {
      const lang = languageOf(base).lang;
      hits.push({
        kind: "page", row: page, target: PAGE, lang,
        // A German file writes a German-only stem, so importing both
        // languages of one diagram does not have the second overwrite
        // the first on disk.
        stem: lang === "de" ? page.slug + "-de" : page.slug,
        label: `${page.title}  (${page.group || "page"})${lang === "de" ? "  [German]" : ""}`,
      });
    }

    if (hits.length !== 1) {
      // An ambiguity inside one kind — two courses with a title — is
      // more useful to read than "nothing matched", so it is kept.
      const detail = [courseError, postError, pageError].filter((e) => e && e.startsWith("matches"));
      skipped.push([
        file,
        hits.length > 1
          ? "matches a " + hits.map((h) => h.kind).join(" and a ") + " — rename it to say which"
          : detail.join("; ") || "no course, blog post or page has this title",
      ]);
      continue;
    }

    const hit = hits[0];
    const out = await write(source, hit.target.dir, hit.target.url, hit.stem, hit.target.widths);
    if (!dryRun) {
      if (hit.lang === "de") {
        // Into the overlay, beside the translated title and body. The
        // overlay is spread over the English record at read time, so an
        // image here replaces the English one on /de and nowhere else.
        const key = fixedSlug(hit.row.slug);
        const entry = (dePages[key] = dePages[key] || {});
        entry.image = { src: out.src, srcset: out.srcset };
      } else {
        hit.row.image = { src: out.src, srcset: out.srcset };
      }
    }
    // Only courses come from the database; pages and posts are served
    // from the JSON files this writes.
    if (hit.kind === "course") sqlRows.push({ slug: hit.stem, src: out.src, srcset: out.srcset });
    done.push([file, hit.label, `${out.meta.width}×${out.meta.height}`]);
  }

  if (!dryRun) {
    fs.writeFileSync(
      path.join(ROOT, "content/courses.json"),
      JSON.stringify(courses, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "content/site-images.json"),
      JSON.stringify(siteImages, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "content/posts.json"),
      JSON.stringify(posts, null, 2) + String.fromCharCode(10),
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "content/pages.json"),
      JSON.stringify(pages, null, 2) + String.fromCharCode(10),
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "content/de/pages.json"),
      JSON.stringify(dePages, null, 2) + String.fromCharCode(10),
      "utf8"
    );
    // Only when this run actually had a course in it.
    //
    // Rewriting the file every time emptied it the moment an import
    // touched no course — and an empty file looks exactly like one that
    // has already been run. The blog pictures came in, the course paths
    // the live database was still waiting for went out, and nothing
    // said so.
    if (sqlRows.length) writeSql(sqlRows);
  }

  const pad = Math.max(...done.map((d) => d[0].length), 4);
  for (const [file, where, size] of done) {
    console.log(`  ${file.padEnd(pad)}  →  ${where}   ${size}`);
  }
  if (skipped.length) {
    console.log("\n  NOT IMPORTED — nothing was changed for these:");
    for (const [file, why] of skipped) console.log(`    ${file}: ${why}`);
  }

  console.log(`\n  ${done.length} imported, ${skipped.length} skipped`);
  if (!dryRun && sqlRows.length) {
    console.log("  Course images also written to MySQL/course-images.sql —");
    console.log("  run that on the live database, or the editor keeps the old paths.\n");
  }
})();

/**
 * The same paths, as SQL.
 *
 * Courses come from the database wherever one is configured, and a row
 * there with an empty image_src shows no picture at all no matter what
 * the shipped JSON says. Re-runnable, and it touches nothing but the
 * two image columns of the slugs it names.
 */
function writeSql(rows) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const body = rows
    .map(
      (r) =>
        `UPDATE \`courses\` SET \`image_src\` = '${esc(r.src)}',\n` +
        `       \`image_srcset\` = '${esc(r.srcset)}'\n` +
        ` WHERE \`slug\` = '${esc(r.slug)}';`
    )
    .join("\n\n");

  const header = `-- Course photographs, as paths.
--
-- Written by tools/import-images.js on ${new Date().toISOString().slice(0, 10)}.
-- Not a migration: it changes no schema, it is safe to run twice, and
-- it is rewritten every time pictures are imported. That is why it has
-- no number in its name.
--
-- Needed because courses come from the database wherever one is
-- configured. content/courses.json is only what the site falls back to
-- when there is none, so updating the files alone leaves the live site
-- pointing at whatever the editor last saved.
--
-- Every row is set for BOTH languages: the picture is the same one
-- whichever language the page is in.

`;

  fs.writeFileSync(path.join(ROOT, "MySQL/course-images.sql"), header + body + "\n", "utf8");
}
