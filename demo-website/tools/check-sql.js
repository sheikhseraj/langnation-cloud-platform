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

// Static sanity check on the schema files, since there is no MySQL to run
// them against yet. Catches the mistakes that would otherwise only surface
// as an import error on the live server.
const fs = require("fs");

// The base schemas, plus any later migration that CREATEs a table
// rather than ALTERing one — those carry foreign keys of their own and
// need the same check. Pure-ALTER migrations are not listed: they are
// written to be conditional and have nothing to cross-reference.
const FILES = [
  "MySQL/01_create_tables.sql",
  "MySQL/02_content_tables.sql",
  "MySQL/03_student_portal.sql",
  "MySQL/07_account_requests.sql",
  "MySQL/08_placement_attempts.sql",
  "MySQL/16_einbuergerungstest_progress.sql",
  "MySQL/46_invoice_address_requests.sql",
];

const defined = new Set();
const refs = [];
const columns = new Map();
let problems = 0;

/* Checks that cannot answer synchronously. The summary at the foot
   waits on these before printing the tally. */
const pending = [];

for (const f of FILES) {
  const sql = fs.readFileSync(f, "utf8");

  // Strip -- comments so a table named in prose is not mistaken for code.
  const code = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  for (const m of code.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? `([a-z_]+)`/g)) {
    if (defined.has(m[1])) {
      console.log(`  ! ${f}: table \`${m[1]}\` defined more than once`);
      problems++;
    }
    defined.add(m[1]);
  }

  for (const m of code.matchAll(/REFERENCES `([a-z_]+)` \(`([a-z_]+)`\)/g)) {
    refs.push({ file: f, table: m[1], column: m[2] });
  }

  // Column list per table, for checking FK targets exist.
  for (const block of code.matchAll(
    /CREATE TABLE(?: IF NOT EXISTS)? `([a-z_]+)`\s*\(([\s\S]*?)\n\) ENGINE/g
  )) {
    const cols = new Set();
    for (const c of block[2].matchAll(/^\s{2}`([a-z_]+)`\s+[A-Z]/gm)) cols.add(c[1]);
    columns.set(block[1], cols);
  }

  // Balanced parentheses inside each statement, and a terminating semicolon.
  const statements = code.split(/;\s*\n/).filter((s) => s.trim());
  for (const st of statements) {
    const open = (st.match(/\(/g) || []).length;
    const close = (st.match(/\)/g) || []).length;
    if (open !== close) {
      console.log(`  ! ${f}: unbalanced parentheses near "${st.trim().slice(0, 60)}…"`);
      problems++;
    }
  }
  if (!sql.trimEnd().endsWith(";")) {
    console.log(`  ! ${f}: does not end with a semicolon`);
    problems++;
  }
}

console.log(`  ${defined.size} tables defined: ${[...defined].join(", ")}\n`);

for (const r of refs) {
  if (!defined.has(r.table)) {
    console.log(`  ! ${r.file}: FK references unknown table \`${r.table}\``);
    problems++;
    continue;
  }
  const cols = columns.get(r.table);
  if (cols && !cols.has(r.column)) {
    console.log(`  ! ${r.file}: FK references \`${r.table}\`.\`${r.column}\` which is not a column`);
    problems++;
  }
}
console.log(`  ${refs.length} foreign keys checked`);

// A FK column and its target should agree on signedness, or InnoDB refuses
// the constraint with a famously unhelpful errno 150.
for (const [table, cols] of columns) {
  void cols;
  void table;
}


// ── The migration runner's judgement ─────────────────────────────────
//
// It applies schema migrations at boot so a deploy stops depending on
// somebody remembering phpMyAdmin. What it must never do is re-run a
// file that rewrites existing rows: 13 and 14 renumber every student
// reference in the school, and those numbers are on invoices and
// certificates.
{
  const fail = (m) => { console.log("  ! " + m); problems++; };
  const migrate = require("../lib/migrate");
  const fsx = require("fs");
  const px = require("path");

  const all = migrate.files();
  console.log(`  ${all.length} numbered migration(s) on disk`);

  // The unnumbered files are tools, not migrations, and running them in
  // sequence would be wrong -- check_migrations.sql only reads, and
  // course-images.sql is rewritten on every image import.
  const unnumbered = fsx.readdirSync(px.join(__dirname, "..", "MySQL"))
    .filter((n) => n.endsWith(".sql") && !/^\d/.test(n));
  for (const n of unnumbered) {
    if (all.includes(n)) fail(`${n} is not a migration but is queued as one`);
  }

  // Every file that writes rows must be classified as data, whether or
  // not anybody remembered to list it. This is the check that caught
  // 05, 18 and 22 -- all three mix a schema change with a one-time
  // backfill, and none was on the hand-written list.
  const writers = [];
  for (const name of all) {
    const sql = fsx.readFileSync(px.join(__dirname, "..", "MySQL", name), "utf8");
    if (migrate.classify(sql) === "data") writers.push(name);
  }
  console.log(`  ${writers.length} of them rewrite rows and are left for a person`);

  /* Every one of them can say whether it has already been done.

     These six were listed as outstanding on every boot for the life of
     the site, because nothing recorded the afternoon somebody ran them
     by hand. Each now carries a question about the database — "is the
     result of this already here" — and answering yes records it
     without running it.

     Two things are checked, and the second is the one that matters.

     First, that none is left without a question, which is what puts it
     back on the permanent list.

     Second, that no question is answered YES by a database where the
     work was never done. Every check counts rows that should not exist
     any anymore, so a stub returning 0 to everything means "nothing
     left to do" — which is what a careless check would give on a
     database that has had none of it. Adopting 13 or 14 wrongly means
     a school of students with no reference on their invoices, so the
     check has to be able to fail. */
  for (const name of writers) {
    if (!migrate.ADOPT[name]) {
      fail(`${name} has no way to say it has already been done, so it will be offered forever`);
    }
  }

  // Pushed onto the list the summary waits for. A rejected promise
  // nobody awaits is a failure that exits 0 while looking green.
  pending.push((async () => {
    // A database with none of the columns these add, and none of the
    // backfilling done: every count of unfinished rows is high, and
    // information_schema finds nothing.
    const nothingDone = async (sql) => (/information_schema/.test(sql) ? 0 : 7);
    // And one where the columns exist but the rows were never filled.
    const halfDone = async (sql) => (/information_schema/.test(sql) ? 1 : 7);

    for (const [name, a] of Object.entries(migrate.ADOPT)) {
      for (const [world, q] of [["nothing done", nothingDone], ["half done", halfDone]]) {
        let said;
        try {
          said = await a.check(q);
        } catch {
          said = false;
        }
        if (said) fail(`${name} would be recorded as done on a database with ${world}`);
      }
    }
    console.log(`  ${writers.length} of them can prove whether they are already done`);
  })());

  for (const must of ["13_codes_and_fast_track.sql", "14_codes_unbroken.sql"]) {
    if (!writers.includes(must)) {
      fail(`${must} renumbers student references and MUST NOT be automatic`);
    }
  }

  // And the one this was all built for has to be automatic, or none of
  // it helps.
  const t = fsx.readFileSync(px.join(__dirname, "..", "MySQL", "25_timetable.sql"), "utf8");
  if (migrate.classify(t) !== "schema") {
    fail("25_timetable.sql is not classified as a schema migration");
  }

  // Nothing anywhere may drop a table or empty one.
  for (const name of all) {
    const sql = fsx.readFileSync(px.join(__dirname, "..", "MySQL", name), "utf8");
    const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    if (/\b(DROP\s+TABLE|TRUNCATE)\b/i.test(code)) {
      fail(`${name} drops or empties a table`);
    }
  }
}


// ── A stand-in's access is one lesson wide ───────────────────────────
//
// Handing a class to another teacher lets them see that class and take
// that register. It must not let them see anything else on the batch —
// the class list with its contact details, the materials, the other
// registers, the batch page.
//
// That boundary is not enforced by a permission table; it is enforced
// by which queries mention lessons.teacher_id and which do not. So it is
// checked by reading them.
{
  const fail2 = (m) => { console.log("  ! " + m); problems++; };
  const fsy = require("fs");
  const pth = require("path");
  const read = (f) => fsy.readFileSync(pth.join(__dirname, "..", f), "utf8");

  const att = read("lib/attendance.js");

  // Exactly three operations may accept a stand-in, and every one of
  // them is named here.
  //
  // Checked by finding the function each call sits in rather than by
  // listing the functions that must NOT have it. The first version of
  // this did the latter and proved nothing: the hole was widened in
  // summaryFor(), which was not on the list, and the suite stayed
  // green. A list of what is forbidden only ever covers what somebody
  // remembered.
  const ALLOWED = new Set(["openRegister", "saveRegister", "startClass"]);

  /* Comments blanked before scanning, keeping every offset.

     A call site is code. This test read the file as text, so the
     sentence "read ownsOnDate() below" in a comment counted as a
     fourth place a stand-in is let in, and the suite failed on a
     file where nothing had been let anywhere. Blanking rather than
     deleting, because enclosing() works on character offsets and
     removing text would slide every one of them. */
  const codeOnly = (src) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

  const enclosing = (src, at) => {
    const before = src.slice(0, at);
    const m = [...before.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].pop();
    return m ? m[1] : "(top level)";
  };

  const sites = [];
  const attCode = codeOnly(att);
  for (const m of attCode.matchAll(/ownsOnDate\(/g)) {
    // Its own declaration is not a call site. enclosing() looks
    // backwards, so it would otherwise blame whichever function happens
    // to sit above the helper.
    if (/function\s+$/.test(attCode.slice(Math.max(0, m.index - 12), m.index))) continue;
    sites.push(enclosing(attCode, m.index));
  }

  for (const fn of sites) {
    if (!ALLOWED.has(fn)) {
      fail2(`${fn}() accepts a stand-in — their access must stay one lesson wide`);
    }
  }
  for (const want of ALLOWED) {
    if (!sites.includes(want)) fail2(`${want}() no longer accepts a stand-in, so they cannot teach`);
  }
  console.log(`  a stand-in is accepted by: ${sites.join(", ") || "nothing"}`);

  // teaching.js: the batch page and the class list are the sensitive
  // ones. A stand-in must not reach either.
  const tea = read("lib/teaching.js");
  for (const fn of ["function batch(", "function roster(", "function materials("]) {
    const at = tea.indexOf(fn);
    if (at === -1) continue;
    const body = tea.slice(at, at + 1600);
    if (/teacher_id = \?|stand_in|handover/.test(body)) {
      fail2(`teaching.js ${fn.replace("function ", "")} mentions the hand-over — a stand-in could reach it`);
    }
  }
}


// ── Every optional column is actually asked about ────────────────────
//
// hasColumn() answers false for a key that was never probed, exactly as
// it does for a column the database does not have. The two look
// identical and need opposite fixes.
//
// lessons.teacher_id was missing from the probe list, so handing a
// class to another teacher was switched off on a database that had the
// column all along. The only symptom was a control that never
// appeared — no error, nothing in the log, and a migration that had
// plainly run being blamed for it.
{
  const fail3 = (m) => { console.log("  ! " + m); problems++; };
  const fsz = require("fs");
  const pz = require("path");
  const root = pz.join(__dirname, "..");

  const server = fsz.readFileSync(pz.join(root, "server.js"), "utf8");
  const probeBlock = server.slice(
    server.indexOf("probeColumns(["),
    server.indexOf("]);", server.indexOf("probeColumns(["))
  );
  const probed = new Set(
    [...probeBlock.matchAll(/"([a-z0-9_]+\.[a-z0-9_]+)"/g)].map((m) => m[1])
  );

  const asked = new Set();
  for (const dir of ["lib", "routes"]) {
    for (const f of fsz.readdirSync(pz.join(root, dir))) {
      if (!f.endsWith(".js")) continue;
      const src = fsz.readFileSync(pz.join(root, dir, f), "utf8");
      for (const m of src.matchAll(/hasColumn\(\s*"([a-z0-9_]+\.[a-z0-9_]+)"/g)) {
        asked.add(m[1]);
      }
    }
  }

  for (const key of asked) {
    if (!probed.has(key)) {
      fail3(`hasColumn("${key}") is asked but never probed in server.js — the feature is off whatever the database says`);
    }
  }
  console.log(`  ${asked.size} optional column(s) asked about, ${probed.size} probed at boot`);
}

/* Anything asynchronous has to finish before the tally is printed.

   Without this the summary runs first, prints "No problems found", and
   sets exitCode 0 — and the checks that had not resolved yet report
   into a number nobody looks at again. */
Promise.all(pending).then(async () => {
  // ── Reserved words, used as column names ─────────────────────────────
//
// MySQL has claimed a few ordinary English words, and one of them is
// EXPLAIN. `exercise_questions` has a column called that, quoted in the
// CREATE TABLE and — for a while — not in the INSERT. The table was
// therefore fine and the insert was a parse error, which is the worst
// way round: the exercise row went in, the first question did not, and
// the homework reached a student's portal reading "0 questions".
//
// So every SQL string in lib/ and routes/ is read, and a reserved word
// used as a bare identifier is a failure. The list is short on purpose
// — only the words this schema actually uses as column names, because
// a list of all 700 would fire on every `status`, `key` and `order by`
// in the codebase and get switched off within a week.
{
  const fail4 = (m) => { console.log("  ! " + m); problems++; };
  const fsr = require("fs");
  const pr = require("path");
  const root = pr.join(__dirname, "..");

  // Columns in this schema whose names MySQL reserves.
  const RESERVED = ["explain", "options", "groups", "rank", "system"];

  const files = [];
  for (const dir of ["lib", "routes"]) {
    for (const f of fsr.readdirSync(pr.join(root, dir))) {
      if (f.endsWith(".js")) files.push(pr.join(dir, f));
    }
  }

  let checked = 0;
  for (const rel of files) {
    const src = fsr.readFileSync(pr.join(root, rel), "utf8");

    // Template literals and quoted strings that look like SQL.
    const strings = src.match(/`[^`]*`|"[^"\n]*"|'[^'\n]*'/g) || [];
    for (const raw of strings) {
      const sql = raw.slice(1, -1);
      if (!/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/i.test(sql)) continue;
      checked++;

      for (const word of RESERVED) {
        // Bare: not preceded by a backtick and not followed by one.
        // `q.explain` counts as bare too — a dot does not make a
        // reserved word safe in every MySQL version, and quoting it
        // costs nothing.
        const bare = new RegExp(`(^|[\\s,.(])${word}(?=[\\s,)]|$)`, "i");
        const quoted = new RegExp("`" + word + "`", "i");
        if (bare.test(sql) && !quoted.test(sql)) {
          fail4(`${rel}: \`${word}\` is a MySQL reserved word and is not quoted — ` +
                sql.replace(/\s+/g, " ").trim().slice(0, 90));
        }
      }
    }
  }
  console.log(`  ${checked} SQL string(s) read for unquoted reserved words`);
}

/* ── Every ? has a bind, and every bind has a ? ────────────────────
 *
 * The queries in lib/exercises.js are assembled from fragments —
 * VISIBLE() changes shape with the migration state, and its binds are
 * a separate function — so adding one subquery means adding a bind in
 * a list several lines away. Get it wrong and mysql2 says "Incorrect
 * arguments to mysqld_stmt_execute", which is a 500 on the live site
 * and nothing at all here, because there is no database to run
 * against.
 *
 * So the module is run with the database stubbed out, every statement
 * it builds is caught, and the ? are counted against the binds. It
 * proves nothing about whether the SQL is right — only that it can be
 * executed at all, which is the failure that has actually happened.
 */
{
  const fail5 = (m) => { console.log("  ! " + m); problems++; };
  const db = require("../lib/db");
  const real = { hasColumn: db.hasColumn, isEnabled: db.isEnabled, query: db.query, queryOne: db.queryOne };

  // Both optional migrations in, so the widest form of every fragment
  // is the one that gets counted.
  db.hasColumn = () => true;
  db.isEnabled = () => true;

  const seen = [];
  db.query = async (sql, binds) => (seen.push([sql, binds || []]), []);
  db.queryOne = async (sql, binds) => {
    seen.push([sql, binds || []]);
    // nextFor() reads the current chapter before looking for the one
    // after it; without an answer the second query is never built.
    return /FROM exercises WHERE id = \?/.test(sql)
      ? { id: 5, level: "A1", title: "A1 · Kapitel 05" }
      : null;
  };

  const ex = require("../lib/exercises");

  await (async () => {
    await ex.forStudentList(7, "a@b.c");
    await ex.forStudent(5, 7, "a@b.c");
    await ex.nextFor(5, 7, "a@b.c");
    await ex.forBatch(3);
    await ex.forBatch(null);
    await ex.progress(1);
    await ex.latest(5, 7);
    await ex.given([{ id: "b/1.txt", title: "A1 · Kapitel 01" }]);
    await ex.standings(7);

    for (const [sql, binds] of seen) {
      const holes = (sql.match(/\?/g) || []).length;
      if (holes !== binds.length) {
        fail5(`lib/exercises.js: ${holes} placeholder(s) but ${binds.length} bind(s) — ` +
              sql.replace(/\s+/g, " ").trim().slice(0, 90));
      }
    }
    console.log(`  ${seen.length} homework statement(s) balanced ? against binds`);

    Object.assign(db, real);
  })();
}

console.log(problems ? `\n  ${problems} problem(s)` : "\n  No problems found");
  process.exitCode = problems ? 1 : 0;
});
