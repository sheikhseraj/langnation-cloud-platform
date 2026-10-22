// Move courses out of content/courses.json and into MySQL, so they can be
// edited in the browser instead of in the repository.
//
// Run once per environment:  npm run migrate:courses
//
// Safe to run again. Rows are matched on (slug, lang) and updated in
// place, so re-running refreshes from the JSON rather than duplicating.
// That also makes it a way to reset a course back to its shipped state.
//
// German lives in content/de/courses.json as an overlay keyed by slug —
// only the fields that differ. Those become lang='de' rows, with anything
// the overlay does not mention inherited from the English record, because
// a half-empty German page is worse than an English one.

const db = require("../lib/db");
const content = require("../lib/content");

const DRY = process.argv.includes("--dry-run");

/** The four body sections, stored in their own columns. */
const SECTIONS = ["description", "curriculum", "requirements", "examPattern"];

function rowFrom(course, lang) {
  const body = course.body || {};
  const seo = course.seo || {};
  return {
    slug: course.slug,
    lang,
    title: course.title || course.slug,
    track: course.track || trackOf(course),
    level: course.level || null,
    level_label: course.levelLabel || null,
    category: course.category || null,
    code: course.code || null,
    duration: course.duration || null,
    lectures: course.lectures == null ? null : String(course.lectures),
    quizzes: num(course.quizzes),
    seats: num(course.seats),
    price_eur: num(course.priceEur),
    discount_eur: num(course.discountEur),
    sticker: course.sticker || null,
    upcoming: course.upcoming ? 1 : 0,
    summary: course.summary || null,
    image_src: (course.image && course.image.src) || null,
    image_srcset: (course.image && course.image.srcset) || null,
    body_description: body.description || null,
    body_curriculum: body.curriculum || null,
    body_requirements: body.requirements || null,
    body_exam: body.examPattern || body.exam || null,
    seo_title: seo.title || null,
    seo_description: seo.description || null,
    seo_keywords: seo.keywords || null,
    legacy_url: course.legacyUrl || null,
    status: "published",
    // A German row is seeded from the English text, so it is not a
    // translation until something translates it.
    translated: lang === "en" ? 1 : 0,
    sort_order: 0,
  };
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Mirrors the ordering rule in lib/content.js so the CMS opens in teaching order. */
function trackOf(course) {
  const s = `${course.category || ""} ${course.title || ""}`.toLowerCase();
  if (s.includes("weekend")) return "Weekend";
  if (s.includes("speaking")) return "Speaking";
  if (s.includes("individual")) return "Individual";
  if (s.includes("intensive")) return "Intensive";
  return "Regular";
}

async function upsert(row) {
  const cols = Object.keys(row);
  const marks = cols.map(() => "?").join(", ");
  const updates = cols
    .filter((c) => c !== "slug" && c !== "lang")
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(", ");
  await db.query(
    `INSERT INTO courses (${cols.map((c) => `\`${c}\``).join(", ")})
     VALUES (${marks})
     ON DUPLICATE KEY UPDATE ${updates}`,
    cols.map((c) => row[c])
  );
}

async function main() {
  // isEnabled() only reports what init() decided, so the pool has to be
  // built before asking. Without this the script reports "not configured"
  // on a perfectly good database.
  db.init();

  if (!db.isEnabled()) {
    console.error("MySQL is not configured — set DB_HOST, DB_USER, DB_NAME.");
    process.exit(1);
  }

  const en = content.courses("en");
  const de = content.courses("de");
  console.log(`  ${en.length} English courses, ${de.length} German`);

  let n = 0;
  for (const [lang, list] of [["en", en], ["de", de]]) {
    for (let i = 0; i < list.length; i++) {
      const row = rowFrom(list[i], lang);
      row.sort_order = i; // preserve the order the site already shows
      if (DRY) {
        console.log(`  would write ${lang}/${row.slug}  €${row.price_eur ?? "-"}`);
      } else {
        await upsert(row);
      }
      n++;
    }
  }

  const [{ c } = {}] = DRY ? [{ c: 0 }] : await db.query("SELECT COUNT(*) AS c FROM courses");
  console.log(DRY ? `  dry run: ${n} rows would be written` : `  ${n} rows written, ${c} in the table`);
  await db.close();
}

main().catch((e) => {
  console.error("  migration failed:", e.message);
  process.exit(1);
});
