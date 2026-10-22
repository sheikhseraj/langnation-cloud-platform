// Write German course text into the lang='de' rows.
//
//   node tools/apply-de-courses.js [--dry-run]
//
// The German rows were created by the migration as copies of the English
// text, because there was nothing else to seed them with. This replaces
// that placeholder text with real German and sets translated = 1, which
// is what removes the "shown in English" notice from the German pages.
//
// Reads content/de/courses.js. Anything absent from that file is left
// alone, so this can be run repeatedly as translations are finished —
// it never blanks a field it has no translation for.
//
// Safe to re-run: it is an UPDATE keyed on (slug, 'de'), so running it
// twice writes the same values twice.

const path = require("path");
const db = require("../lib/db");

const DRY = process.argv.includes("--dry-run");

/** Form field → column. Only these may be written. */
const FIELDS = {
  title: "title",
  summary: "summary",
  levelLabel: "level_label",
  category: "category",
  duration: "duration",
  lectures: "lectures",
  sticker: "sticker",
  description: "body_description",
  curriculum: "body_curriculum",
  requirements: "body_requirements",
  examPattern: "body_exam",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
  seoKeywords: "seo_keywords",
};

async function main() {
  db.init();
  if (!db.isEnabled()) {
    console.error("MySQL is not configured.");
    process.exit(1);
  }

  let translations;
  try {
    translations = require(path.join(__dirname, "..", "content", "de", "courses.js"));
  } catch (e) {
    console.error("No content/de/courses.js to apply:", e.message);
    process.exit(1);
  }

  const slugs = Object.keys(translations);
  console.log(`  ${slugs.length} courses to write`);

  let written = 0;
  let skipped = 0;

  for (const slug of slugs) {
    const t = translations[slug];
    const sets = [];
    const values = [];

    for (const [key, column] of Object.entries(FIELDS)) {
      if (t[key] === undefined) continue; // no translation for this field
      sets.push("`" + column + "` = ?");
      values.push(t[key]);
    }

    if (!sets.length) {
      skipped++;
      continue;
    }

    // Mark it as genuinely German so the "shown in English" notice goes.
    sets.push("`translated` = 1");

    if (DRY) {
      console.log(`    would update de/${slug} — ${sets.length - 1} fields`);
      written++;
      continue;
    }

    const res = await db.query(
      "UPDATE courses SET " + sets.join(", ") + " WHERE slug = ? AND lang = 'de'",
      values.concat([slug])
    );
    const hit = res.affectedRows > 0;
    console.log(`    ${hit ? "updated" : "NO SUCH ROW"}  de/${slug}  (${sets.length - 1} fields)`);
    if (hit) written++;
  }

  if (!DRY) {
    const [row] = await db.query(
      "SELECT COUNT(*) AS n FROM courses WHERE lang = 'de' AND translated = 1"
    );
    console.log(`  ${written} written, ${skipped} had nothing to write`);
    console.log(`  German rows now marked translated: ${row.n}`);
  } else {
    console.log(`  dry run: ${written} would be written`);
  }

  await db.close();
}

main().catch((e) => {
  console.error("  failed:", e.message);
  process.exit(1);
});
