// Courses, read from MySQL instead of content/courses.json.
//
// The public API here is deliberately SYNCHRONOUS. Every page render asks
// for the course list — the footer alone does it on every request — and
// the existing routes, middleware and templates are all synchronous. An
// async read would have meant touching all of them for no gain.
//
// So the rows are held in a plain object and read synchronously. It is
// refreshed in exactly two places:
//
//   · at startup, before the server accepts a request
//   · after a save in /rootadmin, awaited before the response is sent
//
// That second point is what makes an edit appear immediately: by the time
// the editor sees "saved", the cache already holds the new value. There is
// no polling interval to wait out and no redeploy.
//
// If MySQL is unreachable the cache stays empty and lib/content.js serves
// the JSON files still shipped in the repository. The site then shows the
// last released content rather than nothing. Stale beats blank.

const db = require("./db");

/** null until the first successful refresh; see the note above. */
let cache = null;

/** True when a refresh failed and the site is running on shipped JSON. */
let degraded = false;

/** Rebuilt in the shape lib/content.js already hands to the templates. */
/**
 * What a course costs, and what it cost before.
 *
 * `discount_eur` is the reduced price — the number somebody actually
 * pays — and `price_eur` is what it costs without the offer. So the
 * page shows the price struck through with the discount beside it.
 *
 * A discount that is not LOWER than the price is not an offer, and is
 * ignored. Several rows in the live database have one: German Regular
 * B1 was priced at 300 with a "discount" of 400. Printing that would
 * either overcharge somebody or advertise a saving that does not
 * exist, and both are worse than showing the plain price. The office
 * is told about those rows on the Prices page instead, which is where
 * they can be fixed.
 *
 * Returns { priceNow } alone, or { priceNow, priceWas } when there is
 * a genuine offer. Never both undefined when a price exists, so a
 * template can print priceNow without asking.
 */
/**
 * Why this price and discount cannot be saved together, or null.
 *
 * The same comparison offer() makes, said the other way round: offer()
 * decides what to PRINT and quietly drops a discount it cannot use,
 * which is right for a page a visitor is reading. This decides what to
 * ACCEPT, and refuses, which is right for the form where the mistake is
 * being made.
 *
 * Both call the same test so they cannot drift into a state where the
 * editor accepts a number the site then ignores — which is the whole
 * failure this is here for: a discount was set, the save said it had
 * worked, and nothing on the site changed.
 */
function priceProblem(price, discount) {
  const now = price == null || price === "" ? null : Number(price);
  const cut = discount == null || discount === "" ? null : Number(discount);
  if (cut == null) return null;
  if (!Number.isFinite(cut) || cut < 0) return "The discount is not a number.";
  if (now == null || !Number.isFinite(now)) {
    return "There is a discount but no price for it to be a discount from.";
  }
  if (cut >= now) {
    return `The discount (€${cut}) has to be lower than the price (€${now}).`;
  }
  return null;
}

function offer(price, discount) {
  const now = price == null ? null : Number(price);
  const cut = discount == null ? null : Number(discount);
  if (now == null || !Number.isFinite(now)) return {};
  if (cut == null || !Number.isFinite(cut) || cut <= 0 || cut >= now) {
    return { priceNow: now };
  }
  return { priceNow: cut, priceWas: now };
}

function toCourse(r) {
  return {
    id: r.id,
    slug: r.slug,
    lang: r.lang,
    legacyUrl: r.legacy_url || undefined,
    code: r.code || undefined,
    title: r.title,
    track: r.track,
    level: r.level || undefined,
    levelLabel: r.level_label || undefined,
    category: r.category || undefined,
    duration: r.duration || undefined,
    lectures: r.lectures || undefined,
    quizzes: r.quizzes ?? undefined,
    seats: r.seats ?? undefined,
    priceEur: r.price_eur == null ? undefined : Number(r.price_eur),
    discountEur: r.discount_eur == null ? undefined : Number(r.discount_eur),
    // What it actually costs, and what it cost before, worked out once
    // here rather than in each of the three places that show a price.
    ...offer(r.price_eur, r.discount_eur),
    sticker: r.sticker || undefined,
    upcoming: !!r.upcoming,
    summary: r.summary || undefined,
    // The templates expect { src, srcset } or nothing at all.
    image: r.image_src ? { src: r.image_src, srcset: r.image_srcset || undefined } : undefined,
    status: r.status,
    // Drives the "shown in English" notice. English is always true; a
    // German row is only true once its text has actually been translated.
    translated: r.lang === "en" || !!r.translated,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
    body: {
      description: r.body_description || "",
      curriculum: r.body_curriculum || "",
      requirements: r.body_requirements || "",
      examPattern: r.body_exam || "",
    },
    seo: {
      title: r.seo_title || undefined,
      description: r.seo_description || undefined,
      keywords: r.seo_keywords || undefined,
    },
  };
}

/**
 * Reload the cache from MySQL. Awaited at startup and after every save.
 *
 * Never throws: a failure leaves the previous cache in place — or leaves
 * it null, so lib/content.js keeps using the JSON — and flips `degraded`.
 * A broken database must not take the site down.
 */
async function refresh() {
  if (!db.isEnabled()) return false;
  try {
    const rows = await db.query(
      `SELECT * FROM courses WHERE status = 'published' ORDER BY sort_order, id`
    );
    const next = { en: [], de: [] };
    for (const r of rows) (next[r.lang] || (next[r.lang] = [])).push(toCourse(r));
    // An empty table means the migration has not run. Keep the JSON
    // rather than blanking the courses pages.
    if (!next.en.length) {
      degraded = true;
      return false;
    }
    cache = next;
    degraded = false;
    return true;
  } catch (e) {
    degraded = true;
    console.error("Courses refresh failed — keeping the shipped JSON:", e.message);
    return false;
  }
}

/**
 * The published list for one language, or null when the cache is not
 * populated — lib/content.js reads that as "use the JSON".
 *
 * A language with no rows of its own falls back to English rather than
 * rendering an empty page.
 */
function get(lang = "en") {
  if (!cache) return null;
  return cache[lang]?.length ? cache[lang] : cache.en;
}

const isReady = () => cache !== null;
const isDegraded = () => degraded;

// ── Editor reads: straight to the database, drafts included ───────────

/** Every course in one language, drafts and archived too. */
async function allForEditing(lang = "en") {
  const rows = await db.query(
    `SELECT * FROM courses WHERE lang = ? ORDER BY sort_order, id`,
    [lang]
  );
  return rows.map(toCourse);
}

/** Both language rows for one slug, for the side-by-side editor. */
async function pair(slug) {
  const rows = await db.query(`SELECT * FROM courses WHERE slug = ?`, [slug]);
  const out = { en: null, de: null };
  for (const r of rows) out[r.lang] = toCourse(r);
  return out;
}

async function byId(id) {
  const rows = await db.query(`SELECT * FROM courses WHERE id = ?`, [id]);
  return rows[0] ? toCourse(rows[0]) : null;
}

module.exports = { offer, priceProblem, refresh, get, isReady, isDegraded, allForEditing, pair, byId, toCourse };
