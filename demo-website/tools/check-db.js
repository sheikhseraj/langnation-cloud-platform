/* ═══════════════════════════════════════════════════════════════════
   What does the running site think its database looks like?

     node tools/check-db.js

   Run it ON THE SERVER, from the application root. It loads the same
   .env, opens the same pool and calls the same probeColumns() the site
   calls at boot — so its answer is the site's answer, not a second
   opinion from a different connection.

   That distinction is the whole point. "The column is there" and "the
   site can see the column" are different claims, and a migration run
   against one database while the site reads another looks exactly like
   a migration that did not work. This prints which database it is
   actually connected to, as the site connects to it.
   ═══════════════════════════════════════════════════════════════════ */
"use strict";

const path = require("path");

const { loadEnv, env } = require(path.join(__dirname, "..", "lib", "env"));
loadEnv();

const db = require(path.join(__dirname, "..", "lib", "db"));

/* Every optional column the site asks about at boot. Kept in step with
   server.js by hand -- if they drift, this tool is the one that is
   wrong, and it says so by reporting a column the site never checks. */
const WANTED = [
  "intakes.status_auto",
  "intakes.meets_days",
  "lessons.generated",
];

/* The tables and columns that are not optional -- the ones a migration
   adds and the code then relies on. Printed with their real state so a
   half-applied migration is visible rather than inferred. */
const MIGRATIONS = [
  /* 23_second_teacher is still listed. Its columns are no longer read
     by anything -- a batch's second teacher gave them access to it for
     the whole term, and cover is one handed lesson now -- but they are
     still in the database holding what they held, and a tool that
     reports the schema should report the schema. */
  ["23_second_teacher", ["intakes.teacher2_id", "intakes.teacher2_name"]],
  ["24_batch_status_auto", ["intakes.status_auto"]],
  ["25_timetable", [
    "intakes.meets_days", "intakes.meets_from", "intakes.meets_minutes",
    "lessons.moved_from", "lessons.change_note", "lessons.generated",
  ]],
];

(async () => {
  console.log("");
  console.log("  Host    ", env("DB_HOST") || "(not set)");
  console.log("  Database", env("DB_NAME") || "(not set)");
  console.log("  User    ", env("DB_USER") || "(not set)");
  console.log("");

  if (!db.init()) {
    console.log("  The site is running WITHOUT a database, so no column exists as far");
    console.log("  as it is concerned. Check DB_HOST, DB_USER and DB_NAME.");
    process.exit(1);
  }

  const alive = await db.healthy();
  if (!alive) {
    console.log("  Could not reach the database:", db.getLastError() || "unknown error");
    process.exit(1);
  }

  // Which database the connection actually landed in, which is not
  // always the one in .env if a name was mistyped.
  const where = await db.queryOne("SELECT DATABASE() AS db, VERSION() AS version");
  console.log("  Connected to", where.db, "-- MySQL", where.version);
  console.log("");

  // ── What the site's own probe finds ────────────────────────────────
  await db.probeColumns(WANTED);
  console.log("  What the site sees (probeColumns):");
  for (const key of WANTED) {
    console.log(`    ${db.hasColumn(key) ? "yes" : "NO "}  ${key}`);
  }
  console.log("");

  // ── What is actually in the schema ────────────────────────────────
  //
  // Asked separately and plainly. If this disagrees with the block
  // above, the fault is in the probe rather than the migration, which
  // is worth being able to tell apart.
  console.log("  What information_schema says:");
  let incomplete = [];
  for (const [name, columns] of MIGRATIONS) {
    const rows = await db.query(
      `SELECT CONCAT(table_name, '.', column_name) AS k
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND CONCAT(table_name, '.', column_name) IN (${columns.map(() => "?").join(", ")})`,
      columns
    );
    const found = new Set((rows || []).map((r) => String(r.k)));
    const missing = columns.filter((c) => !found.has(c));
    const state = missing.length === 0
      ? "applied"
      : missing.length === columns.length
        ? "NOT RUN"
        : "PART APPLIED";
    console.log(`    ${state.padEnd(13)} ${name}`);
    for (const m of missing) console.log(`                  missing: ${m}`);
    if (missing.length) incomplete.push(name);
  }

  console.log("");
  if (incomplete.length) {
    console.log("  Run these, lowest number first, then restart the site:");
    for (const n of incomplete) console.log(`    MySQL/${n}.sql`);
  } else {
    console.log("  Every migration this tool knows about is applied.");
    console.log("  If a feature still says it is missing, the site has not been");
    console.log("  restarted since the migration ran -- probeColumns asks once, at boot.");
  }
  console.log("");

  await db.close();
})().catch((e) => {
  console.error("  check-db failed:", e.message);
  process.exit(1);
});
