// ─────────────────────────────────────────────────────────────────────
//  Content store.
//
//  Courses, pages, blog posts, testimonials and FAQs are migrated from the
//  old database into content/*.json by tools/extract-old-content.js. They
//  change rarely, so they are read once at boot and kept in memory — no
//  query per page view, which is what made the old site slow.
//
//  German copy: content/de/*.json holds hand-written German overrides,
//  keyed by slug. Anything without an override falls back to English and
//  is flagged `translated: false`, so a page can say so honestly rather
//  than showing machine-translated text.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const { toText, formatDate } = require("./text");

const CONTENT_DIR = path.join(__dirname, "..", "content");

// The old admin saved a few slugs with typos. Fix them for the new site;
// the originals still resolve via the legacy redirect table.
const SLUG_FIXES = require("./slug-fixes");
const coursesDb = require("./courses-db");

function readJson(file, fallback) {
  try {
    // Stamped on the way in, so every consumer gets a versioned URL
    // without each of them having to remember to ask for one.
    return stampImages(JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8")));
  } catch {
    return fallback;
  }
}

/**
 * A version for the photographs, and a stamp that puts it on their URLs.
 *
 * The stylesheet and the icons already carry ?v= and are safe to cache
 * hard. The photographs were not, and they are served with a 30-day
 * max-age from paths that never change — hero-1400.webp is hero-1400.webp
 * whatever picture is inside it. So replacing every course photograph
 * changed nothing for anybody who had already loaded the old ones, and
 * the site went on showing last month's pictures for a month. The portals
 * looked fine throughout, because their pages are never cached, which is
 * what made it look like a home-page problem rather than a caching one.
 *
 * Its own version rather than the asset hash, so editing a stylesheet
 * does not invalidate 12MB of photographs.
 *
 * Built from the files' CONTENTS. Stat was tried first, being 17ms
 * against 386ms for hashing 11MB, and it is wrong in a way that matters:
 * the modified time changes when a file is rewritten with identical
 * bytes, so restoring a picture produced a third version rather than the
 * original one. Measured, not assumed — before, after and restored gave
 * c9fe0d03, eb22d94f, de196506.
 *
 * On a deploy that means every pull rewriting an unchanged image would
 * invalidate all 12MB of photographs for every visitor. 386ms once at
 * boot is the cheaper end of that trade by a wide margin, and it makes
 * the version exact: identical pictures, identical hash, always.
 */
function imageVersion() {
  const crypto = require("crypto");
  const dir = path.join(__dirname, "..", "public", "img");
  const h = crypto.createHash("sha1");
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return; // no images in this checkout
    }
    // Sorted: readdir order is not promised to be stable across
    // filesystems, and an unstable version would bust every cache on
    // every boot — the opposite failure, and a far more expensive one.
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      try {
        h.update(e.name);
        h.update(fs.readFileSync(p));
      } catch {
        /* vanished between readdir and read — nothing to add */
      }
    }
  };
  walk(dir);
  return h.digest("hex").slice(0, 8);
}

const IMG_V = imageVersion();

/**
 * Put the version on every picture URL in a loaded file.
 *
 * Only values under a key called src or srcset, and only those pointing
 * at /img/. Deliberately not "any string containing /img/": course
 * descriptions are HTML written in the editor and may mention an image
 * path inside markup, and rewriting that would corrupt the page rather
 * than cache-bust it.
 */
function stampImages(node) {
  if (Array.isArray(node)) {
    for (const v of node) stampImages(v);
    return node;
  }
  if (!node || typeof node !== "object") return node;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && (key === "src" || key === "srcset")) {
      node[key] = stampUrls(value);
    } else if (value && typeof value === "object") {
      stampImages(value);
    }
  }
  return node;
}

/** One URL, or a srcset's list of "url descriptor" pairs. */
function stampUrls(value) {
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const [url, ...rest] = trimmed.split(/\s+/);
      if (!url.startsWith("/img/") || url.includes("?")) return part;
      return [url + "?v=" + IMG_V, ...rest].join(" ");
    })
    .join(", ");
}

// ── Load ─────────────────────────────────────────────────────────────
const store = {
  courses: readJson("courses.json", []),
  posts: readJson("posts.json", []),
  testimonials: readJson("testimonials.json", []),
  faqs: readJson("faqs.json", []),
  pages: readJson("pages.json", []),
  redirects: readJson("redirects.json", []),
  images: readJson("site-images.json", {}),
  team: readJson("team.json", []),
  events: readJson("events.json", []),
  gallery: readJson("gallery.json", []),
  placementTest: readJson("placement-test.json", []),
  summaries: readJson("course-summaries.json", {}),
  de: {
    courses: readJson("de/courses.json", {}),
    pages: readJson("de/pages.json", {}),
    posts: readJson("de/posts.json", {}),
  },
};

// ── Normalise ────────────────────────────────────────────────────────
for (const p of store.pages) {
  p.legacySlug = p.slug;
  p.slug = SLUG_FIXES[p.slug] || p.slug;
}

// Courses in a sensible teaching order rather than database id order.
const LEVEL_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const TRACK_ORDER = { Regular: 1, Weekend: 2, Speaking: 3, Individual: 4, Intensive: 5 };

function trackOf(course) {
  const t = course.title || "";
  if (/intensive/i.test(course.slug)) return "Intensive";
  if (/individual/i.test(t)) return "Individual";
  if (/speaking/i.test(t)) return "Speaking";
  if (/weekend/i.test(t)) return "Weekend";
  return "Regular";
}

for (const c of store.courses) {
  c.track = trackOf(c);
  c.hasContent = Boolean((c.body.description || "").trim());
  // Fallback only. The real card copy comes from content/course-summaries.json,
  // because the old database held the same SEO sentence for every course.
  c.summaryFallback = toText(c.seo.description || c.body.description, 155);
}

/** Card summary: hand-written if we have one for this language, else derived. */
function summaryFor(course, lang) {
  const written = store.summaries[course.slug];
  if (written && written[lang]) return written[lang];
  if (written && written.en) return written.en;
  return course.summaryFallback || "";
}
store.courses.sort((a, b) => {
  const t = (TRACK_ORDER[a.track] || 9) - (TRACK_ORDER[b.track] || 9);
  if (t) return t;
  return (LEVEL_ORDER[a.level] || 9) - (LEVEL_ORDER[b.level] || 9);
});

// ── Merge a German override over an English record ───────────────────

/**
 * Merge one body over another, whatever shape the body is.
 *
 * A course body is an object of named sections, and merging those
 * field by field is the point: a course translated only as far as its
 * intro should show a German intro above English sections rather than
 * losing the sections entirely.
 *
 * A page or post body is a single HTML string, and spreading a string
 * into an object gives `{0:"<", 1:"p", ...}`. Every German CMS page on
 * the site was doing exactly that and rendering "[object Object]"
 * where its text should be — all thirty-four of them, the Germany
 * guide and the terms included.
 */
function mergeBody(base, override) {
  if (override === undefined || override === null) return base;
  const bothObjects =
    base && typeof base === "object" && override && typeof override === "object";
  return bothObjects ? { ...base, ...override } : override;
}

function localise(record, override) {
  if (!record) return record;
  if (!override) return { ...record, translated: false };
  return {
    ...record,
    ...override,
    body: mergeBody(record.body, override.body),
    // seo is an object on every record type, so this one is safe as it is.
    seo: { ...(record.seo || {}), ...(override.seo || {}) },
    translated: true,
  };
}

const pick = (lang, list, overrides, slug) => {
  const base = list.find((x) => x.slug === slug) || null;
  if (!base) return null;
  return lang === "de" ? localise(base, overrides[slug]) : { ...base, translated: true };
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Courses come from MySQL once lib/courses-db.js has been refreshed, and
 * from the JSON below until then.
 *
 * The JSON is no longer the source of truth — it is the seed for a new
 * environment and the fallback when the database cannot be read. Editing
 * content/courses.json therefore has no effect on a running site with a
 * populated database; edit them in /rootadmin instead.
 */
const coursesFromJson = (lang = "en") =>
  store.courses
    // Retired courses stay in the file but leave the site, mirroring the
    // status column in MySQL so the fallback shows the same catalogue.
    .filter((c) => (c.status || "published") === "published")
    .map((c) => {
      const r = lang === "de" ? localise(c, store.de.courses[c.slug]) : { ...c, translated: true };
      return { ...r, summary: summaryFor(c, lang) };
    });

const courses = (lang = "en") => coursesDb.get(lang) || coursesFromJson(lang);

const course = (slug, lang = "en") => {
  const fromDb = coursesDb.get(lang);
  if (fromDb) return fromDb.find((c) => c.slug === slug) || null;
  const r = pick(lang, store.courses, store.de.courses, slug);
  return r ? { ...r, summary: summaryFor(r, lang) } : null;
};

const posts = (lang = "en") =>
  store.posts.map((p) => {
    const r = lang === "de" ? localise(p, store.de.posts[p.slug]) : { ...p, translated: true };
    return { ...r, dateLabel: formatDate(r.date, lang) };
  });

const post = (slug, lang = "en") => {
  const r = pick(lang, store.posts, store.de.posts, slug);
  return r ? { ...r, dateLabel: formatDate(r.date, lang) } : null;
};

const pages = (lang = "en") =>
  store.pages.map((p) => (lang === "de" ? localise(p, store.de.pages[p.slug]) : { ...p, translated: true }));

const page = (slug, lang = "en") => pick(lang, store.pages, store.de.pages, slug);

const pagesInGroup = (group, lang = "en") => pages(lang).filter((p) => p.group === group);

const testimonials = () => store.testimonials;

/** A named piece of site furniture (hero photo etc.), or null. */
const image = (key) => store.images[key] || null;

// Card excerpt only: the migrated bios run to several hundred words with
// qualification lists and embedded images, which made the cards wildly
// unequal in height and unreadable.
const team = () => store.team.map((p) => ({ ...p, excerpt: toText(p.bio, 210) }));
const gallery = () => store.gallery;
const placementTest = () => store.placementTest;

/**
 * Events, split into what is still to come and what has already happened.
 * Compared on date only, so an event today still counts as upcoming.
 */
function events(lang = "en") {
  const today = new Date().toISOString().slice(0, 10);
  const all = store.events.map((e) => ({ ...e, dateLabel: formatDate(e.date, lang) }));
  return {
    upcoming: all.filter((e) => e.date && e.date >= today).reverse(),
    past: all.filter((e) => !e.date || e.date < today),
    all,
  };
}

const event = (slug, lang = "en") => {
  const found = store.events.find((e) => e.slug === slug);
  return found ? { ...found, dateLabel: formatDate(found.date, lang) } : null;
};

const faqs = (group = null) =>
  group ? store.faqs.filter((f) => f.group === group) : store.faqs;

/** Courses grouped by track, for the catalogue page. */
function coursesByTrack(lang = "en") {
  const groups = new Map();
  for (const c of courses(lang)) {
    if (!groups.has(c.track)) groups.set(c.track, []);
    groups.get(c.track).push(c);
  }
  return [...groups.entries()].map(([track, items]) => ({ track, items }));
}

/** Old URL → new URL, for the 301 middleware. */
/**
 * Old URL → new URL, for the 301s in server.js.
 *
 * Three sources, in increasing order of precedence:
 *
 *   1. legacyUrl on a course and legacySlug on a page — the automatic
 *      cases, where the content simply moved.
 *   2. The same again under /site/cms/… and /site/course_details/…,
 *      because the old CodeIgniter site served everything twice.
 *   3. content/redirects.json — the hand-written map, which wins, and is
 *      where anything the first two cannot express belongs.
 *
 * Keys are lower-cased. A key may carry a query string ("/x?id=2"); the
 * middleware tries the full path+query first and the bare path second, so
 * the old /site/cms/study?id=88 routes can each land somewhere different.
 *
 * This used to ignore redirects.json entirely, which meant 45 old URLs —
 * /about-us and /contact-us among them — returned 404 on the new site.
 */
function redirectMap() {
  const map = new Map();
  for (const c of store.courses) {
    if (c.legacyUrl) map.set(`/${c.legacyUrl}`.toLowerCase(), `/courses/${c.slug}`);
  }
  for (const p of store.pages) {
    if (p.legacySlug && p.legacySlug !== p.slug) {
      map.set(`/${p.legacySlug}`.toLowerCase(), `/${p.slug}`);
    }
  }
  // The old site served everything under /site/cms/... too.
  for (const [from, to] of [...map]) {
    map.set(`/site/cms${from}`, to);
    map.set(`/site/course_details${from}`, to);
  }
  // Hand-written entries last, so they can correct anything above.
  for (const r of store.redirects) {
    if (r && r.from && r.to) map.set(String(r.from).toLowerCase(), r.to);
  }
  return map;
}

const stats = () => ({
  courses: store.courses.length,
  team: store.team.length,
  events: store.events.length,
  gallery: store.gallery.length,
  posts: store.posts.length,
  pages: store.pages.length,
  testimonials: store.testimonials.length,
  faqs: store.faqs.length,
});

module.exports = {
  courses, course, coursesByTrack, coursesFromJson,
  posts, post,
  pages, page, pagesInGroup,
  testimonials, faqs, image,
  // For picture URLs written into templates rather than read from JSON.
  imageVersion: IMG_V,
  team, events, event, gallery, placementTest,
  redirectMap, stats,
};
