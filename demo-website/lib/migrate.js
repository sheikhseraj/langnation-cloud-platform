// ─────────────────────────────────────────────────────────────────────
//  Apply pending migrations at boot.
//
//  Until now a schema change was a separate manual ritual: push the
//  code, then remember to open phpMyAdmin, pick the right database and
//  import the right file. Miss it and nothing says so — the feature
//  switches itself off politely and the page looks like it is broken.
//  That is not a hypothetical; it cost a long afternoon and several
//  wrong guesses, and the fix is to stop relying on somebody
//  remembering.
//
//  ── What this will and will not run ─────────────────────────────────
//
//  It runs the SCHEMA migrations, which are every file that adds a
//  table, a column or an index. All of them are written to check
//  information_schema before they change anything, so running one twice
//  is a no-op that prints "already exists". That property is what makes
//  this safe, and it was already true before this file existed.
//
//  It does NOT run the DATA migrations, and that exemption is the most
//  important thing here. 13 and 14 contain:
//
//      SET @n := 0;
//      UPDATE students SET student_ref = CONCAT('LNS', LPAD((@n := @n + 1), 4, '0'))
//       WHERE deleted_at IS NULL ORDER BY created_at, id;
//
//  which renumbers every student reference in the school. Those numbers
//  are printed on invoices and certificates. Re-running that
//  unattended, on a database where it has already been applied, would
//  silently reissue identities to people — and 13 and 14 disagree about
//  the format, so the two would fight. Anything that rewrites rows stays
//  a decision a person makes while looking at it.
//
//  A failure never stops the site. The migration is not recorded, the
//  error is logged, and the feature that needed it stays switched off —
//  which is exactly what happened before, except now it says so.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const { env } = require("./env");

const DIR = path.join(__dirname, "..", "MySQL");

/* Numbered files only. check_migrations.sql, course-images.sql and
   check_timetable.sql have no number precisely because they are not
   migrations and must never be run as part of the sequence. */
const IS_MIGRATION = /^(\d+)_.+\.sql$/i;

/**
 * Migrations that rewrite existing rows. Never run automatically.
 *
 * Listed by hand rather than detected, because "does this statement
 * change data somebody depends on" is not a question a regular
 * expression should be answering. A new file is automatic unless it is
 * added here, so the failure mode of forgetting is a migration that
 * runs — which for a guarded schema change is harmless, and for a data
 * change would not be. Hence the check in `classify` below, which
 * refuses to run anything that looks like a data migration whether or
 * not it is on this list.
 */
const DATA_MIGRATIONS = new Set([
  "11_course_tracks.sql",
  "13_codes_and_fast_track.sql",
  "14_codes_unbroken.sql",
]);

/**
 * Evidence that a data migration has already been applied.
 *
 * A database that has been running for a year has been through all of
 * these, by hand, long ago — but nothing recorded it, so every boot
 * offered them again and the admin sidebar carried a list of six jobs
 * that were already done. A warning nobody can clear is a warning
 * nobody reads, and the next real one arrives in the same list.
 *
 * So each one is asked a question about the database instead: not "did
 * somebody run this" — nothing knows — but "is the result of it already
 * here". Answering yes records it as done WITHOUT running it.
 *
 * The safety of this rests on one property: every check asks for the
 * migration's OWN outcome. A backfill that gave every student a
 * reference is adopted only when every student has a reference, so
 * adopting it wrongly is not possible — if the rows were not filled
 * in, the check says no and the job stays on the list. That is the
 * whole argument, and any check added here has to be able to make it.
 *
 * `null` means the question could not be asked at all (a column the
 * migration itself adds is missing, so it plainly has not run) and is
 * treated as "no".
 */
const ADOPT = {
  // Adds three columns to courses and marks the English rows as
  // translated. Done when the column is there and no English course is
  // still sitting at 0.
  "05_course_images.sql": {
    says: "every English course is already marked as translated",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'courses'
                   AND column_name = 'translated'`)) > 0 &&
      (await q(`SELECT COUNT(*) AS n FROM courses WHERE lang = 'en' AND translated = 0`)) === 0,
  },

  // Sorts every course into a track. Done when none is left without
  // one — including 'Other', which the migration assigns deliberately
  // rather than leaving blank.
  "11_course_tracks.sql": {
    says: "every course already has a track",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'courses'
                   AND column_name = 'track'`)) > 0 &&
      (await q(`SELECT COUNT(*) AS n FROM courses
                 WHERE track IS NULL OR track = ''`)) === 0,
  },

  // Renames one course and gives every student a reference. 13 and 14
  // disagree about the format of that reference, which is why 14
  // exists; either one having run means no student is without one, and
  // that is the part that matters. A student with no reference cannot
  // be invoiced.
  "13_codes_and_fast_track.sql": {
    says: "every student already has a reference",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM students
                 WHERE deleted_at IS NULL
                   AND (student_ref IS NULL OR student_ref = '')`)) === 0,
  },

  // The same backfill in the format actually in use, plus the batch
  // codes. Adopted on the same evidence with the shape checked too: if
  // references exist but in 13's hyphenated form, 14 has not run and
  // must not be written off.
  "14_codes_unbroken.sql": {
    says: "every student has a reference, and none is in the old hyphenated form",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM students
                 WHERE deleted_at IS NULL
                   AND (student_ref IS NULL OR student_ref = '')`)) === 0 &&
      (await q(`SELECT COUNT(*) AS n FROM students
                 WHERE deleted_at IS NULL AND student_ref LIKE 'LN-%'`)) === 0,
  },

  // Adds the account columns and gives everyone who already had a
  // password a real status. Done when nobody with a password is still
  // sitting at the 'invited' default.
  "18_teacher_accounts.sql": {
    says: "every staff account that has a password has been given a status",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
                   AND column_name = 'status'`)) > 0 &&
      (await q(`SELECT COUNT(*) AS n FROM admin_users
                 WHERE password_hash IS NOT NULL AND status = 'invited'`)) === 0,
  },

  // Numbers the teachers. Same shape as the students: done when every
  // account the migration would have numbered already has a number.
  "22_teacher_ref.sql": {
    says: "every signed-in staff account already has a teacher reference",
    check: async (q) =>
      (await q(`SELECT COUNT(*) AS n FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
                   AND column_name = 'teacher_ref'`)) > 0 &&
      (await q(`SELECT COUNT(*) AS n FROM admin_users
                 WHERE teacher_ref IS NULL AND status = 'active'
                   AND password_hash IS NOT NULL`)) === 0,
  },
};

/**
 * Does this file only add things?
 *
 * A second line of defence behind DATA_MIGRATIONS, for the file nobody
 * remembered to list. An UPDATE, INSERT or DELETE against a real table
 * means rows change, and rows changing is not something to do to a live
 * database while nobody is watching.
 *
 * information_schema is exempt: every guarded migration reads it, and
 * the `SET @sql :=` that carries an ALTER as a string is how they all
 * work.
 */
function classify(sql) {
  const code = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  const writes = /\b(INSERT\s+INTO|UPDATE\s+`?[a-z_]+`?\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/i;
  if (writes.test(code)) return "data";
  return "schema";
}

/** Every migration on disk, in the order the numbers say. */
function files() {
  let names;
  try {
    names = fs.readdirSync(DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => IS_MIGRATION.test(n))
    .sort((a, b) => {
      const na = Number(IS_MIGRATION.exec(a)[1]);
      const nb = Number(IS_MIGRATION.exec(b)[1]);
      return na - nb || a.localeCompare(b);
    });
}

/**
 * Run them.
 *
 * Its own connection, not the application pool, for one reason: these
 * files contain several statements each and need `multipleStatements`,
 * which is a setting no query serving a web request should ever have
 * switched on. It is opened, used and closed.
 *
 * Returns a summary. Never throws — a database that cannot be migrated
 * is a site that runs with fewer features, not a site that will not
 * start.
 */
async function run({ log = console } = {}) {
  const out = { applied: [], adopted: [], skipped: [], failed: [], already: 0 };

  const host = env("DB_HOST");
  const user = env("DB_USER");
  const database = env("DB_NAME");
  if (!host || !user || !database) return { ...out, reason: "no database configured" };

  if (String(env("AUTO_MIGRATE", "on")).toLowerCase() === "off") {
    return { ...out, reason: "AUTO_MIGRATE is off" };
  }

  const list = files();
  if (!list.length) return { ...out, reason: "no migrations on disk" };

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port: Number(env("DB_PORT", 3306)),
      user,
      password: env("DB_PASSWORD", ""),
      database,
      multipleStatements: true,
      timezone: "Z",
    });
  } catch (e) {
    log.warn("  ! migrations: could not connect —", e.message);
    return { ...out, reason: e.message };
  }

  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
         \`name\`       VARCHAR(190) NOT NULL,
         \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (\`name\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    /* Why a row is there, not only that it is.

       An adopted migration and an applied one are both "done", and a
       year from now the difference is the only thing that explains a
       database whose rows do not look like the file that supposedly
       wrote them. Added guardedly, because this table predates the
       column. */
    let hasNote = false;
    try {
      const [[col]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
            AND column_name = 'note'`
      );
      hasNote = Number(col.n) > 0;
      if (!hasNote) {
        await conn.query("ALTER TABLE `schema_migrations` ADD COLUMN `note` VARCHAR(190) DEFAULT NULL");
        hasNote = true;
      }
    } catch (e) {
      /* A shared host that will not grant ALTER, most likely. The note
         is an explanation, not the record: without it a migration is
         still recorded and still not offered again, which is the part
         that matters. Losing the whole run over a comment column would
         be the wrong trade. */
      log.warn("  ! migrations: could not add the note column —", e.message);
    }

    const [rows] = await conn.query("SELECT `name` FROM `schema_migrations`");
    const done = new Set((rows || []).map((r) => String(r.name)));

    /* One number out of the database, for the evidence checks.

       Every check counts rows that should not exist any more, so they
       all ask the same shape of question and all read the same way:
       zero means the job is finished. */
    const count = async (sql) => {
      const [r] = await conn.query(sql);
      return Number((r && r[0] && (r[0].n ?? Object.values(r[0])[0])) || 0);
    };

    for (const name of list) {
      if (done.has(name)) {
        out.already++;
        continue;
      }

      const sql = fs.readFileSync(path.join(DIR, name), "utf8");
      if (DATA_MIGRATIONS.has(name) || classify(sql) === "data") {
        /* Already done by hand, on a database that has been running
           since before any of this existed? Then say so once and stop
           asking. The check is for the migration's own outcome, so a
           yes cannot be wrong in the direction that matters — see
           ADOPT above. */
        const adopt = ADOPT[name];
        if (adopt) {
          let seen = false;
          try {
            seen = await adopt.check(count);
          } catch (e) {
            // A column the migration itself adds is missing, or the
            // table is not there at all. Either way it has not run.
            seen = false;
          }
          if (seen) {
            try {
              if (hasNote) {
                await conn.query(
                  "INSERT IGNORE INTO `schema_migrations` (`name`, `note`) VALUES (?, ?)",
                  [name, `adopted: ${adopt.says}`]
                );
              } else {
                await conn.query(
                  "INSERT IGNORE INTO `schema_migrations` (`name`) VALUES (?)",
                  [name]
                );
              }
              out.adopted.push({ name, says: adopt.says });
              continue;
            } catch (e) {
              // Could not record it, so it is still outstanding as far
              // as anything here knows. Falls through to skipped, which
              // offers it again — the safe direction.
              log.warn(`  ! could not record ${name} as already done — ${e.message}`);
            }
          }
        }
        // Recorded as skipped rather than applied, so it is offered
        // again — and so nothing can later mistake it for done.
        out.skipped.push(name);
        continue;
      }

      try {
        await conn.query(sql);
        await conn.query("INSERT IGNORE INTO `schema_migrations` (`name`) VALUES (?)", [name]);
        out.applied.push(name);
      } catch (e) {
        out.failed.push({ name, error: e.message });
        log.warn(`  ! migration ${name} failed — ${e.message}`);
      }
    }
  } catch (e) {
    log.warn("  ! migrations: ", e.message);
    out.reason = e.message;
  } finally {
    try {
      await conn.end();
    } catch {
      /* closing a connection that already died is not an error */
    }
  }

  return out;
}

/* The last run, so the admin sidebar can say what still needs doing by
   hand. A migration this refuses to run is one somebody has to run
   deliberately, and leaving that in a log line nobody opens is how the
   original problem happened. */
let last = { applied: [], adopted: [], skipped: [], failed: [], already: 0 };
const lastRun = () => ({
  ...last,
  adopted: [...(last.adopted || [])],
  skipped: [...last.skipped],
  failed: [...last.failed],
});

async function runAndRemember(opts) {
  last = await run(opts);
  return last;
}

module.exports = { run: runAndRemember, lastRun, files, classify, DATA_MIGRATIONS, ADOPT };
