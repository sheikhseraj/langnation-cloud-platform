// ─────────────────────────────────────────────────────────────────────
//  One-off migration: lift the real content out of the old CodeIgniter
//  database dump and turn it into clean JSON + optimised images.
//
//    node tools/extract-old-content.js
//
//  Reads   D:/Project_All/u648779252_langnation.sql   (override with --dump)
//          D:/Project_All/langnation-22-01-2025/assets/admin/*  (images)
//  Writes  content/*.json
//          public/img/{courses,blog,people,pages,content}/*.webp
//
//  Safe to re-run: it is read-only against the old site and overwrites
//  its own output.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const { readDump } = require("./sql-dump-parser");
const { cleanHtml, extractDataImages, rewriteLegacyLinks, toText } = require("./html-clean");
const SLUG_FIXES = require("../lib/slug-fixes");
const { indexFiles, repairLinks } = require("./fix-download-links");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  console.warn("!  sharp not installed — images will be copied, not optimised.");
}

// ── Paths ────────────────────────────────────────────────────────────
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const ROOT = path.join(__dirname, "..");
const DUMP = arg("--dump", "D:/Project_All/u648779252_langnation.sql");
const OLD_ASSETS = arg("--assets", "D:/Project_All/langnation-22-01-2025/assets/admin");
const CONTENT_DIR = path.join(ROOT, "content");
const IMG_DIR = path.join(ROOT, "public", "img");

const stats = { images: 0, imagesMissing: 0, dataUris: 0, links: 0, bytesIn: 0, bytesOut: 0, unresolved: new Set() };

// old numeric id → new slug. Filled in by buildLinkMaps() before any rich
// text is processed, because the body copy links to other pages by id.
const LINK_MAPS = { courseById: {}, pageById: {} };

// ── Helpers ──────────────────────────────────────────────────────────
const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\u00e4]/g, "ae").replace(/[\u00f6]/g, "oe").replace(/[\u00fc]/g, "ue").replace(/[\u00df]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const clean = (s) => (s === null || s === undefined ? "" : String(s).trim());
const num = (s) => {
  const n = parseFloat(String(s || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Pull the CEFR level (A1…C2) out of a course name, if there is one. */
function cefr(name) {
  const m = /\b(A1|A2|B1|B2|C1|C2)\b/i.exec(String(name || ""));
  return m ? m[1].toUpperCase() : null;
}

/**
 * Copy one image out of the old assets tree, resized and re-encoded to WebP.
 * Returns the public path (without /public), or null if the source is missing.
 */
async function importImage(filename, { subdir, outName, widths = [400, 800, 1400], quality = 74 }) {
  const name = clean(filename);
  if (!name) return null;

  // The old admin wrote into a handful of folders; search them all.
  const candidates = [
    "course_image", "image_blog", "image_testimonials", "cms_image",
    "course_cat_image", "slider_image", "brochere_data", "media_image",
    "image_speaker", "image_team", "image_service", "image_offer",
  ].map((d) => path.join(OLD_ASSETS, d, name));

  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) {
    stats.imagesMissing++;
    return null;
  }

  const destDir = path.join(IMG_DIR, subdir);
  fs.mkdirSync(destDir, { recursive: true });

  const base = outName || slugify(path.parse(name).name);
  const written = [];

  stats.bytesIn += fs.statSync(src).size;

  for (const w of widths) {
    const suffix = widths.length > 1 ? `-${w}` : "";
    const dest = path.join(destDir, `${base}${suffix}.webp`);
    if (sharp) {
      try {
        await sharp(src)
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality })
          .toFile(dest);
      } catch (e) {
        stats.imagesMissing++;
        return null;
      }
    } else {
      fs.copyFileSync(src, dest.replace(/\.webp$/, path.extname(name)));
    }
    if (fs.existsSync(dest)) {
      stats.bytesOut += fs.statSync(dest).size;
      written.push(`/img/${subdir}/${base}${suffix}.webp`);
    }
  }

  if (!written.length) return null;
  stats.images++;

  return {
    src: written[written.length - 1],
    srcset: widths.length > 1
      ? widths.map((w, i) => `${written[i]} ${w}w`).join(", ")
      : null,
  };
}

/** Clean a rich-text field: pull out base64 images, then tidy the markup. */
async function richText(html, label) {
  const raw = clean(html);
  if (!raw) return "";

  const { html: withFiles, extracted } = await extractDataImages(raw, {
    outDir: path.join(IMG_DIR, "content"),
    publicPrefix: "/img/content/",
  });
  stats.dataUris += extracted;
  if (extracted) {
    console.log(`   · ${label}: extracted ${extracted} embedded image(s)`);
  }

  // Links must point at this site, not at the one we are replacing.
  const { html: withLocalLinks, rewritten, unresolved } = rewriteLegacyLinks(withFiles, LINK_MAPS);
  stats.links += rewritten;
  for (const u of unresolved) stats.unresolved.add(u);

  return cleanHtml(withLocalLinks);
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(DUMP)) {
    console.error(`Dump not found: ${DUMP}`);
    process.exit(1);
  }
  console.log(`Reading dump: ${DUMP}`);
  const dump = readDump(DUMP);
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  // Index old ids → new slugs first: the migrated body copy contains links
  // to other courses and pages by their old numeric id.
  for (const row of dump.table("tbl_course")) {
    const slug = slugify(clean(row.page_url) || clean(row.course_name));
    if (slug) LINK_MAPS.courseById[clean(row.id)] = slug;
  }
  for (const row of dump.table("tbl_cms")) {
    const slug = slugify(clean(row.seo_url) || clean(row.page_name));
    if (slug) LINK_MAPS.pageById[clean(row.id)] = SLUG_FIXES[slug] || slug;
  }
  console.log(`Indexed ${Object.keys(LINK_MAPS.courseById).length} course ids and ${Object.keys(LINK_MAPS.pageById).length} page ids`);

  // ── Categories (id → name) ─────────────────────────────────────────
  const categories = {};
  for (const c of dump.table("tbl_category")) {
    categories[clean(c.id)] = clean(c.category_name);
  }

  // ── Courses ────────────────────────────────────────────────────────
  console.log("\nCourses…");
  const courses = [];
  for (const row of dump.table("tbl_course")) {
    if (clean(row.status) !== "A") continue;

    const title = clean(row.course_name);
    if (!title) continue;
    const slug = slugify(clean(row.page_url) || title);
    console.log(` - ${title}`);

    const image = await importImage(row.image, { subdir: "courses", outName: slug });

    courses.push({
      slug,
      legacyUrl: clean(row.page_url),
      code: clean(row.course_code),
      title,
      level: cefr(title) || null,
      levelLabel: clean(row.level),
      category: categories[clean(row.category_id)] || "German Courses",
      duration: clean(row.duaration),
      lectures: clean(row.leactures),
      quizzes: num(row.quizzes),
      seats: num(row.students),
      priceEur: num(row.euro_price),
      priceInr: num(row.price),
      discountEur: num(row.discount_euro_price),
      discountInr: num(row.discount_price),
      sticker: clean(row.sticker),
      upcoming: clean(row.upcoming_course) === "1",
      image,
      body: {
        description: await richText(row.description, `${title} · description`),
        curriculum: await richText(row.curriculum, `${title} · curriculum`),
        requirements: await richText(row.reuirement, `${title} · requirements`),
        examPattern: await richText(row.exam_pattarn, `${title} · exam pattern`),
      },
      seo: {
        title: clean(row.seo_title) || `${title} | LangNation`,
        description: clean(row.seo_description),
        keywords: clean(row.seo_keywords),
      },
    });
  }

  // ── Blog ───────────────────────────────────────────────────────────
  console.log("\nBlog…");
  const blogCats = {};
  for (const c of dump.table("tbl_blog_cat")) blogCats[clean(c.id)] = clean(c.category_name);

  const posts = [];
  for (const row of dump.table("tbl_blog")) {
    if (clean(row.status) !== "A") continue;
    const title = clean(row.title);
    if (!title) continue;
    const slug = slugify(clean(row.seo_url) || title);
    console.log(` - ${title}`);

    const image = await importImage(row.image, { subdir: "blog", outName: slug });
    const body = await richText(row.des, `blog · ${title}`);

    posts.push({
      slug,
      title,
      category: blogCats[clean(row.category)] || "",
      date: clean(row.date),
      youtube: clean(row.youtube_url),
      image,
      body,
      excerpt: toText(body, 180),
      seo: {
        title: clean(row.seo_title) || title,
        description: clean(row.seo_description) || toText(body, 155),
        keywords: clean(row.seo_keywords),
      },
    });
  }
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // ── Testimonials ───────────────────────────────────────────────────
  console.log("\nTestimonials…");
  const testimonials = [];
  for (const row of dump.table("tbl_testimonials")) {
    if (clean(row.status) !== "A") continue;
    const name = clean(row.name);
    if (!name) continue;
    const image = await importImage(row.image, {
      subdir: "people",
      outName: slugify(name),
      widths: [160],
    });
    testimonials.push({
      name,
      role: clean(row.title),
      image,
      quote: toText(await richText(row.des, `testimonial · ${name}`), 420),
    });
  }

  // ── FAQs ───────────────────────────────────────────────────────────
  console.log("\nFAQs…");
  const faqs = [];
  for (const row of dump.table("tbl_faq")) {
    const q = clean(row.title);
    if (!q) continue;
    faqs.push({
      group: clean(row.type) || "FAQ",
      question: q,
      answer: await richText(row.description, `faq · ${q.slice(0, 40)}`),
    });
  }

  // ── CMS pages ──────────────────────────────────────────────────────
  console.log("\nPages…");
  const pages = [];
  for (const row of dump.table("tbl_cms")) {
    if (clean(row.status) !== "A") continue;
    const title = clean(row.page_name);
    if (!title) continue;

    const bodyRaw = clean(row.description);
    // Several rows are literal placeholders ("<p><br></p>") — skip them.
    if (toText(bodyRaw).length < 40) {
      console.log(` - ${title}  (empty, skipped)`);
      continue;
    }
    console.log(` - ${title}`);

    const group = clean(row.type);
    const slug = slugify(clean(row.seo_url) || title);
    const image = await importImage(row.image, { subdir: "pages", outName: slug });

    pages.push({
      slug,
      group,
      title,
      image,
      body: await richText(bodyRaw, `page · ${title}`),
      body2: await richText(row.description2, `page · ${title} (2)`),
      seo: {
        title: clean(row.seo_title) || title,
        description: clean(row.seo_description),
        keywords: clean(row.seo_keywords),
      },
    });
  }

  // ── Team ───────────────────────────────────────────────────────────
  console.log("\nTeam…");
  const team = [];
  for (const row of dump.table("tbl_speaker")) {
    if (clean(row.status) !== "A") continue;
    const name = clean(row.name);
    if (!name) continue;
    console.log(` - ${name} — ${clean(row.title)}`);

    team.push({
      slug: slugify(name),
      name,
      role: clean(row.title),
      image: await importImage(row.image, {
        subdir: "team",
        outName: slugify(name),
        widths: [240, 480],
      }),
      email: clean(row.email_id),
      phone: clean(row.phone_no),
      linkedin: clean(row.linkedin),
      twitter: clean(row.twitter),
      facebook: clean(row.facebook),
      bio: await richText(row.teacher_des || row.des, `team · ${name}`),
    });
  }

  // ── Events ─────────────────────────────────────────────────────────
  console.log("\nEvents…");
  const events = [];
  for (const row of dump.table("tbl_events")) {
    if (clean(row.status) !== "A") continue;
    const title = clean(row.title);
    if (!title) continue;

    const date = clean(row.date);
    events.push({
      slug: slugify(`${title}-${date}`),
      title,
      date,
      time: clean(row.time),
      duration: clean(row.duration),
      location: clean(row.location) || "Online",
      speaker: clean(row.speaker_name) || clean(row.speaker),
      image: await importImage(row.image, { subdir: "events", outName: slugify(`${title}-${date}`) }),
      body: await richText(row.description, `event · ${title}`),
      agenda: await richText(row.agenda, `event agenda · ${title}`),
    });
  }
  // Newest first; the page splits upcoming from past by today's date.
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  console.log(` - ${events.length} events, newest ${events[0] ? events[0].date : "n/a"}`);

  // ── Gallery ────────────────────────────────────────────────────────
  console.log("\nGallery…");
  const gallery = [];
  for (const row of dump.table("tbl_media")) {
    if (clean(row.status) !== "A") continue;
    const caption = clean(row.slider_name);
    const file = clean(row.image) || clean(row.slider_image);
    if (!file) {
      // One row is a stray test entry with no image at all.
      if (caption) console.log(` - ${caption}  (no image, skipped)`);
      continue;
    }
    const image = await importImage(file, {
      subdir: "gallery",
      outName: slugify(`${caption || "photo"}-${gallery.length + 1}`),
      widths: [400, 900, 1400],
    });
    if (!image) {
      console.log(` - ${caption}  (source missing, skipped)`);
      continue;
    }
    console.log(` - ${caption}`);
    gallery.push({
      caption,
      description: toText(clean(row.slider_des), 200),
      image,
    });
  }

  // ── Placement test (Einstufungstest) ───────────────────────────────
  //  14 sections of fill-in-the-blank German. There is no answer key in the
  //  old system — a teacher reads the submission and replies with a level —
  //  so this migrates the questions only.
  console.log("\nPlacement test…");
  const placementTest = [];
  for (const row of dump.table("tbl_question_papper")) {
    const title = clean(row.title);
    if (!title) continue;

    // The questions are spread across `question` and `question1..question9`.
    const parts = [];
    for (const key of ["question", "question1", "question2", "question3", "question4",
                       "question5", "question6", "question7", "question8", "question9"]) {
      const html = clean(row[key]);
      if (html && toText(html).length > 2) parts.push(await richText(html, `test · ${title}`));
    }
    if (!parts.length) continue;

    console.log(` - ${title}  (${parts.length} block${parts.length === 1 ? "" : "s"})`);
    placementTest.push({
      ref: clean(row.type) || slugify(title),
      title,
      section: title.split("-")[0].trim(),
      blocks: parts,
    });
  }

  // ── Site imagery (hero and section art) ────────────────────────────
  //  Hand-picked from the old slider/CMS folders: photographs of people
  //  actually learning beat stock landmarks for a language school.
  console.log("\nSite images…");
  const siteImages = {};
  for (const [key, file, widths] of [
    ["hero", "Home.png", [560, 900, 1400]],
    ["germany", "1.png", [560, 900, 1400]],
    ["classroom", "3.png", [560, 900, 1400]],
  ]) {
    const img = await importImage(file, { subdir: "site", outName: key, widths });
    if (img) {
      siteImages[key] = img;
      console.log(` - ${key} ← ${file}`);
    } else {
      console.log(` - ${key} ← ${file}  (source missing, skipped)`);
    }
  }

  // ── Legacy URL map, for the 301 redirects ──────────────────────────
  const redirects = [];
  for (const c of courses) {
    if (c.legacyUrl) redirects.push({ from: `/${c.legacyUrl}`, to: `/courses/${c.slug}` });
  }
  for (const row of dump.table("tbl_site_log")) {
    const url = clean(row.page_url);
    if (url && url !== "NULL") redirects.push({ from: `/${url}`, legacyType: clean(row.log_type), title: clean(row.log_title) });
  }

  // ── Repair download links against the files that actually exist ────
  //  Around half the exam-paper links in the old database were already
  //  broken (Übungstest vs Uebungstest, doubled extensions). Match them
  //  to real files rather than shipping 404s.
  console.log("\nRepairing download links…");
  const fileIndex = indexFiles(path.join(ROOT, "public", "downloads"), "/downloads");
  console.log(`   indexed ${fileIndex.count} downloadable file(s)`);

  const stillBroken = new Set();
  let repaired = 0;

  const repairField = (obj, key) => {
    if (!obj || typeof obj[key] !== "string") return;
    const r = repairLinks(obj[key], fileIndex);
    obj[key] = r.html;
    repaired += r.fixed;
    for (const b of r.broken) stillBroken.add(b);
  };

  for (const c of courses) for (const k of Object.keys(c.body)) repairField(c.body, k);
  for (const p of pages) { repairField(p, "body"); repairField(p, "body2"); }
  for (const p of posts) repairField(p, "body");
  for (const f of faqs) repairField(f, "answer");

  console.log(`   repaired ${repaired} link(s)`);
  if (stillBroken.size) {
    console.log(`   ${stillBroken.size} link(s) have no matching file:`);
    [...stillBroken].slice(0, 10).forEach((b) => console.log(`      ${b}`));
  }

  // ── Write ──────────────────────────────────────────────────────────
  const write = (name, data) => {
    const p = path.join(CONTENT_DIR, name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`   wrote ${name}  (${(fs.statSync(p).size / 1024).toFixed(0)} KB)`);
  };

  console.log("\nWriting content…");
  write("courses.json", courses);
  write("posts.json", posts);
  write("testimonials.json", testimonials);
  write("faqs.json", faqs);
  write("pages.json", pages);
  write("redirects.json", redirects);
  write("site-images.json", siteImages);
  write("team.json", team);
  write("events.json", events);
  write("gallery.json", gallery);
  write("placement-test.json", placementTest);

  const mb = (b) => (b / 1024 / 1024).toFixed(1);
  console.log(`
─────────────────────────────────────────────
  Courses       ${courses.length}
  Team          ${team.length}
  Events        ${events.length}
  Gallery       ${gallery.length}
  Test sections ${placementTest.length}
  Blog posts    ${posts.length}
  Testimonials  ${testimonials.length}
  FAQs          ${faqs.length}
  Pages         ${pages.length}
  Redirects     ${redirects.length}

  Images imported      ${stats.images}   (${mb(stats.bytesIn)} MB → ${mb(stats.bytesOut)} MB)
  Missing sources      ${stats.imagesMissing}
  Base64 images freed  ${stats.dataUris}
  Legacy links fixed   ${stats.links}
  Download links bound ${repaired}
  Download links dead  ${stillBroken.size}
─────────────────────────────────────────────`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
