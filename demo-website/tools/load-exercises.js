/* The tools run in UTC, because the server does. */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Load exercise sources into the database.
//
//      node tools/load-exercises.js <dir> --batch <id> [options]
//
//        --unlock a@b.com   only that address sees them (see below)
//        --publish          visible to the whole batch
//        --dry              parse and report, write nothing
//        --only A2-16       just the files whose name contains this
//
//  Reads the .txt files tools/import-workbook.js writes and makes one
//  exercise out of each. Run it twice and it updates rather than
//  duplicates: a file is matched to an existing exercise on the batch
//  by title, because the title is what a student sees and two pieces
//  of homework with the same name on one batch is already a mistake.
//
//  ── Unlocked, for trying it out ─────────────────────────────────────
//
//  With --unlock nobody sees the exercise except the addresses given.
//  Not the class, not somebody enrolled on the batch — nobody. For
//  those addresses the enrolment check and the published flag are both
//  bypassed, which is the point: a teacher wants to sit their own
//  homework the way a student will, before anybody else has it.
//
//  So --unlock makes an exercise MORE private than a draft, and the
//  two are independent: --unlock without --publish is the safest
//  combination and the one to test with.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const { loadEnv } = require("../lib/env");
loadEnv();

const db = require("../lib/db");
const exercises = require("../lib/exercises");
const fmt = require("../lib/exercise-format");

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf("--" + name);
  return at === -1 ? null : argv[at + 1];
};
const has = (name) => argv.includes("--" + name);

const dir = argv.find((a) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));
const batch = Number(flag("batch"));
const unlock = flag("unlock");
const only = flag("only");
const publish = has("publish");
const dry = has("dry");

if (!dir || (!batch && !dry)) {
  console.error("usage: node tools/load-exercises.js <dir> --batch <id> [--unlock a@b.com] [--publish] [--dry] [--only A2-16]");
  process.exit(2);
}

(async () => {
  let files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  if (only) files = files.filter((f) => f.includes(only));

  if (!files.length) {
    console.log("  nothing to load" + (only ? ` matching "${only}"` : ""));
    return;
  }

  // Parsed first, all of them, before a single row is written. A run
  // that loads nineteen chapters and then stops on a bad twentieth
  // leaves somebody working out which nineteen.
  const ready = [];
  let bad = 0;
  for (const f of files) {
    const source = fs.readFileSync(path.join(dir, f), "utf8");
    const parsed = fmt.parse(source);
    if (parsed.problems.length) {
      bad++;
      console.log(`  ! ${f}`);
      for (const p of parsed.problems) console.log(`      line ${p.line}: ${p.why}`);
      continue;
    }
    ready.push({ f, source, parsed });
  }

  console.log(`\n  ${ready.length} of ${files.length} file(s) parse cleanly` +
              (bad ? `, ${bad} will not be loaded` : ""));
  console.log(`  ${ready.reduce((n, r) => n + r.parsed.questions.length, 0)} questions in total`);

  if (dry) {
    console.log("\n  --dry, so nothing was written.");
    return;
  }

  if (!db.isEnabled()) {
    console.error("\n  ! No database configured (DB_HOST / DB_USER / DB_NAME). Nothing written.");
    process.exitCode = 1;
    return;
  }

  await db.probeColumns([
    "exercises.published", "exercises.unlock_emails",
    "intakes.meets_days", "lessons.generated",
  ]);
  if (!exercises.READY()) {
    console.error("\n  ! The exercises tables are not there yet — migration 28 has not run.");
    process.exitCode = 1;
    return;
  }
  if (unlock && !exercises.HAS_UNLOCK()) {
    console.error("\n  ! --unlock needs migration 29, which has not run.");
    process.exitCode = 1;
    return;
  }

  const intake = await db.queryOne("SELECT id, code FROM intakes WHERE id = ?", [batch]);
  if (!intake) {
    console.error(`\n  ! No batch with id ${batch}.`);
    process.exitCode = 1;
    return;
  }

  // What is already there, so a second run updates rather than
  // duplicates.
  const existing = new Map(
    (await db.query("SELECT id, title FROM exercises WHERE intake_id = ?", [batch]) || [])
      .map((r) => [String(r.title).trim(), r.id])
  );

  let made = 0;
  let updated = 0;
  for (const r of ready) {
    const title = r.parsed.title || r.f.replace(/\.txt$/, "");
    const id = existing.get(title.trim()) || 0;

    const res = await exercises.save(id, {
      intake_id: batch,
      source: r.source,
      title,
      skill: "grammar",
      level: (title.match(/\b(A1|A2|B1|B2|C1|C2)\b/) || [])[1] || null,
      published: publish ? 1 : 0,
      unlock_emails: unlock || "",
    }, null);

    if (!res.ok) {
      console.log(`  ! ${r.f}: ${res.reason}`);
      continue;
    }
    if (id) updated++;
    else made++;
  }

  console.log(`\n  ${made} created, ${updated} updated, on batch ${intake.code} (id ${batch})`);
  console.log(`  published: ${publish ? "yes — the whole batch can see them" : "no, still drafts"}`);
  console.log(unlock
    ? `  unlocked for: ${unlock} — and nobody else, enrolled or not`
    : "  unlocked for: nobody in particular, so the ordinary rule applies");

  await db.end?.();
})().catch((e) => {
  console.error("\n  ! " + e.message);
  process.exitCode = 1;
});
