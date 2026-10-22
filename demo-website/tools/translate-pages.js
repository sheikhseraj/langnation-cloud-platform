// Translate the guide pages into German via DeepL.
//
//   node tools/translate-pages.js --dry-run     what it would cost
//   node tools/translate-pages.js               write content/de/pages.json
//   node tools/translate-pages.js --only=housing,tax-id
//
// Pages are still file-based — they are not in the editor yet — so the
// German goes into content/de/pages.json, the overlay lib/content.js
// already reads. Each entry holds only the fields that were translated;
// anything absent falls back to the English, which is what the overlay
// was built to do.
//
// Existing entries are kept unless --force is given, so an interrupted
// run can be resumed and hand-corrected German is not overwritten by a
// later run.
//
// Quota: the whole set is around 155k characters against a 500k or 1M
// monthly allowance, and the script prints the cost before spending it.

const fs = require("fs");
const path = require("path");

const translate = require("../lib/translate");

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const ONLY = only ? new Set(only.split(",").map((s) => s.trim())) : null;

const PAGES = path.join(__dirname, "..", "content", "pages.json");
// Nine pages were saved with a misspelled slug by the old admin.
// lib/content.js corrects them on load and looks the German up by the
// corrected slug, so writing the file keyed by the raw one left those
// nine silently showing English.
const SLUG_FIXES = require("../lib/slug-fixes");
const fixedSlug = (s) => SLUG_FIXES[s] || s;
const OUT = path.join(__dirname, "..", "content", "de", "pages.json");

/** Fields worth translating. `slug`, `group` and `image` must not change. */
const FIELDS = ["title", "body", "body2"];
const SEO = ["title", "description"];

function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  if (!translate.isEnabled()) {
    console.error("No DEEPL_API_KEY is set.");
    process.exit(1);
  }

  const pages = load(PAGES, []);
  const existing = load(OUT, {});

  const todo = pages.filter((p) => {
    if (ONLY && !(ONLY.has(p.slug) || ONLY.has(fixedSlug(p.slug)))) return false;
    if (!FORCE && existing[fixedSlug(p.slug)]) return false;
    return true;
  });

  // Count first. Spending someone's quota without telling them what it
  // will cost is not acceptable, and a mistake here is expensive.
  let chars = 0;
  for (const p of todo) {
    for (const f of FIELDS) chars += (p[f] || "").length;
    for (const f of SEO) chars += ((p.seo || {})[f] || "").length;
  }

  const usage = await translate.usage();
  console.log(`  ${todo.length} of ${pages.length} pages to translate`);
  console.log(`  ~${chars.toLocaleString()} characters`);
  if (usage) {
    console.log(`  quota: ${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} used`);
    if (usage.used + chars > usage.limit) {
      console.error("  this would exceed the monthly quota — stopping");
      process.exit(1);
    }
  }
  if (!todo.length) {
    console.log("  nothing to do (use --force to redo pages already translated)");
    return;
  }
  if (DRY) {
    todo.forEach((p) => console.log(`    would translate ${p.slug}`));
    return;
  }

  const out = Object.assign({}, existing);
  let done = 0;

  // One page per request rather than one batch: a failure then costs one
  // page instead of everything, and the file is written after each so an
  // interrupted run keeps what it finished.
  for (const p of todo) {
    const names = [];
    const texts = [];
    for (const f of FIELDS) {
      if (p[f]) { names.push(f); texts.push(p[f]); }
    }
    for (const f of SEO) {
      if ((p.seo || {})[f]) { names.push("seo." + f); texts.push(p.seo[f]); }
    }

    try {
      const res = await translate.toGerman(texts);
      const entry = {};
      names.forEach((n, i) => {
        if (n.startsWith("seo.")) {
          entry.seo = entry.seo || {};
          entry.seo[n.slice(4)] = res[i];
        } else {
          entry[n] = res[i];
        }
      });
      out[fixedSlug(p.slug)] = entry;
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
      done++;
      console.log(`    ${done}/${todo.length}  ${p.slug}`);
    } catch (e) {
      console.error(`    FAILED  ${p.slug}: ${e.message}`);
      // Keep going: one bad page should not stop the other thirty-two.
    }
  }

  const after = await translate.usage();
  console.log(`  ${done} pages written to content/de/pages.json`);
  if (after) console.log(`  quota now: ${after.used.toLocaleString()} of ${after.limit.toLocaleString()}`);
}

main().catch((e) => {
  console.error("  failed:", e.message);
  process.exit(1);
});
