// Batches — one running instance of a course.
//
// A course is what we teach; a batch is when. "B2 Regular" is a course
// and it never changes; "B2-2026-04, Mondays and Wednesdays, starts 6
// April, Frau Weber, 12 seats" is a batch and there is a new one every
// couple of months. The database has had the table since the portal
// schema went in; nothing has ever written to it.
//
// The code is the identifier people actually use. It goes on invoices
// and certificates, so it is unique and cannot be quietly changed into
// one that already exists — the database enforces that, and this turns
// the resulting error into a sentence somebody can act on.

"use strict";

const db = require("./db");
const codes = require("./codes");

const STATUSES = ["planned", "running", "finished", "cancelled"];

/**
 * What each status is called where a person reads it.
 *
 * "planned" and "finished" are the database's words. A batch that has
 * not started and a batch that is over is what the office means, and
 * what a student needs to see.
 */
const STATUS_LABEL = {
  planned: "Not started",
  running: "Running",
  finished: "Completed",
  cancelled: "Cancelled",
};

/** Fields a form may set. Anything else in the body is ignored. */
const EDITABLE = [
  // teacher_id is the account that teaches it; teacher_name is the name
  // printed when there is no account behind it. Both, because a batch is
  // often planned before the teacher is hired, and a name typed in a box
  // is better than an empty field — it just cannot sign in.
  // `code` is deliberately absent. It is allocated by create() and
  // never changes afterwards: it is printed on invoices and
  // certificates, so a batch whose code can be edited is an invoice
  // that stops matching the batch it was raised for.
  "course_id", "title", "teacher_id", "teacher_name",
  "status_auto",
  "starts_on", "ends_on", "timezone", "seats",
  "meeting_url", "drive_url", "whatsapp_url", "exercise_url", "status",
];

/** The three links a batch runs on, as the portal shows them. */
const LINKS = [
  { field: "meeting_url", label: "Class link", hint: "Where the lesson happens" },
  { field: "drive_url", label: "Materials folder", hint: "Drive, Dropbox, OneDrive" },
  { field: "whatsapp_url", label: "Group chat", hint: "WhatsApp group invite" },
  // Practice work. The one thing still being sent round by hand, which
  // means somebody joining in week three never gets it.
  { field: "exercise_url", label: "Exercises", hint: "Worksheets, quizzes, practice" },
];

const NUMERIC = new Set(["course_id", "seats", "teacher_id"]);
// Checkboxes arrive as "on" or not at all, so status_auto is read
// separately in fromBody rather than through the generic loop.

const sched = require("./schedule");

const trim = (v) => String(v == null ? "" : v).trim();

/**
 * Read a form body into a row.
 *
 * Empty strings become NULL rather than "": a date column will not take
 * "" at all, and an empty meeting link should read as absent, not as a
 * link to nowhere.
 */
function fromBody(body = {}) {
  const row = {};
  // Columns that arrive in a migration are only written once they
  // exist. Without this the editor builds an UPDATE naming a column
  // the database has not got, MySQL refuses the whole statement, and
  // saving a batch fails with "Unknown column" over a form that is
  // showing the field.
  const skip = new Set();
  if (!db.hasColumn("intakes.status_auto")) skip.add("status_auto");
  if (!db.hasColumn("intakes.exercise_url")) skip.add("exercise_url");
  if (!db.hasColumn("intakes.meets_days")) {
    skip.add("meets_days").add("meets_from").add("meets_minutes");
  }

  for (const key of EDITABLE) {
    if (skip.has(key)) continue;
    let v = body[key];
    if (v === undefined) continue;
    v = trim(v);
    if (NUMERIC.has(key)) {
      row[key] = v === "" ? null : Number(v);
    } else {
      row[key] = v === "" ? null : v;
    }
  }
  if (!STATUSES.includes(row.status)) row.status = "planned";
  if (!row.timezone) row.timezone = "Europe/Berlin";

  // An unticked checkbox sends nothing at all, so its absence is the
  // answer rather than a missing value to leave alone. Read from the
  // body directly for that reason: the generic loop above skips
  // undefined, which would make unticking the box impossible.
  //
  // But "unticked" and "this form did not have the box" arrive
  // identically, and treating the second as the first is how a batch
  // silently stopped following its dates: one save from a page rendered
  // before the box existed set it to 0, the sweep then left the batch
  // alone forever, and the course started without its Join button. So
  // the form also posts a hidden marker, and without that marker the
  // value is left exactly as it was.
  if (!skip.has("status_auto") && body.status_auto_shown) {
    row.status_auto = body.status_auto ? 1 : 0;
  }

  // The weekly pattern. Days arrive as a set of checkboxes, which is an
  // array, one value, or nothing at all — parseDays takes all three.
  // The office types an end time and the column stores a length.
  if (!skip.has("meets_days") && body.meets_shown) {
    row.meets_days = sched.formatDays(body.meets_days) || null;
    row.meets_from = sched.parseTime(body.meets_from);
    row.meets_minutes = sched.minutesBetween(row.meets_from, body.meets_until) || 120;
    // Half a pattern is kept, not quietly dropped. Clearing it here
    // would mean somebody who ticked Monday to Friday and forgot the
    // time got their days back empty with nothing said, and validate()
    // below would never see the state it exists to complain about.
    // Permissive here, strict in validate, and lib/lessons.js refuses
    // to generate from half a pattern whatever reaches the column.
  }

  return row;
}

/** What is wrong with it, in words the person filling the form can use. */
function validate(row) {
  const errors = [];
  if (!row.course_id) errors.push("Choose which course this batch is for.");
  // Nothing about the code. It is not a field any more — create()
  // allocates it and an edit cannot touch it — so there is nothing here
  // for a person to get wrong, and a rule about it would only ever fire
  // on a form that has no such box.
  if (row.seats != null && (!Number.isFinite(row.seats) || row.seats < 0)) {
    errors.push("Seats must be a whole number, or empty for no limit.");
  }
  // Only when both are set: a batch with a start and no end is normal.
  if (row.starts_on && row.ends_on && row.ends_on < row.starts_on) {
    errors.push("The end date is before the start date.");
  }
  // A pattern that is half-written is the one failure worth catching
  // here: the rest degrade quietly and correctly, but "Monday to Friday"
  // with no time produces no lessons at all while looking set.
  if (db.hasColumn("intakes.meets_days")) {
    const days = sched.formatDays(row.meets_days);
    const time = sched.parseTime(row.meets_from);
    if (days && !time) {
      errors.push("The batch has days but no time. Add a start and end time, or clear the days.");
    }
    if (!days && time) {
      errors.push("The batch has a time but no days. Tick the days it meets, or clear the time.");
    }
    if (days && time && !row.starts_on) {
      errors.push("A weekly pattern needs a start date to count from.");
    }
  }

  // Following the dates with no start date means following nothing.
  if (row.status_auto && !row.starts_on && db.hasColumn("intakes.status_auto")) {
    errors.push("A batch can only follow its dates if it has a start date. Add one, or untick \u201cFollow the dates\u201d and set the status by hand.");
  }
  return errors;
}

/** Every batch, newest start first, with the course it belongs to. */
async function list() {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT i.*, c.title AS course_title, c.slug AS course_slug,
              (SELECT COUNT(*) FROM enrolments e WHERE e.intake_id = i.id) AS enrolled
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        ORDER BY COALESCE(i.starts_on, '9999-12-31') DESC, i.id DESC
        LIMIT 500`
    );
  } catch (e) {
    console.error("Batches could not be listed:", e.message);
    return [];
  }
}

async function byId(id) {
  if (!db.isEnabled()) return null;
  return db.queryOne("SELECT * FROM intakes WHERE id = ?", [Number(id)]);
}

/** Courses to choose from, for the picker. */
async function courseOptions() {
  if (!db.isEnabled()) return [];
  return db.query(
    `SELECT id, title, level, track FROM courses
      WHERE lang = 'en' AND status = 'published'
      ORDER BY COALESCE(level, ''), title`
  );
}

/**
 * Create a batch. The code is allocated here and nowhere else.
 *
 * It used to be suggested when the form opened and submitted with it,
 * which is where "that code already exists" came from: asking for a
 * suggestion reserved nothing, so opening the form twice — two tabs, a
 * page left sitting, or changing the course and the field refilling —
 * handed the same code out twice, and the second save hit the unique
 * key. The office saw a collision on a code it had never typed.
 *
 * So the code is now allocated at the moment the row is written, from
 * the greater of the counter and what is actually in the table (see
 * lib/codes.js), and whatever arrived in the form is ignored.
 *
 * The retry is the last guard. Two people pressing Save in the same
 * second can still both read the same number — the counter makes that
 * unlikely and not impossible — so a duplicate key is caught and the
 * next code tried, rather than shown to somebody as an error about
 * something they did not type.
 */
async function create(row) {
  const course = row.course_id
    ? await db.queryOne("SELECT track FROM courses WHERE id = ?", [Number(row.course_id)])
    : null;

  // Never taken from the form. A code that can be posted is a code that
  // can be posted twice.
  const fields = { ...row };
  delete fields.code;

  const ATTEMPTS = 5;
  for (let go = 1; go <= ATTEMPTS; go++) {
    fields.code = course
      ? await codes.nextBatchCode(course.track)
      // No course means validate() will have refused already; this is
      // only here so a bad call cannot write a row with no code.
      : null;
    if (!fields.code) throw new Error("A batch code could not be allocated.");

    const cols = Object.keys(fields);
    try {
      const res = await db.query(
        `INSERT INTO intakes (${cols.map((c) => "`" + c + "`").join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => fields[c])
      );
      return res.insertId;
    } catch (e) {
      const clash = e && (e.code === "ER_DUP_ENTRY" || /duplicate/i.test(e.message || ""));
      if (!clash || go === ATTEMPTS) throw e;
      // Round again: nextBatchCode reads the table, so the code it
      // returns next will be past the one that just clashed.
    }
  }
  throw new Error("A batch code could not be allocated.");
}

async function update(id, row) {
  const cols = Object.keys(row);
  if (!cols.length) return;
  await db.query(
    `UPDATE intakes SET ${cols.map((c) => "`" + c + "` = ?").join(", ")} WHERE id = ?`,
    [...cols.map((c) => row[c]), Number(id)]
  );
}

/**
 * Refuse to delete a batch somebody is enrolled on.
 *
 * The foreign key would take the enrolments with it, and an enrolment is
 * what a student paid for. Cancelling is the answer there, which is why
 * "cancelled" is one of the statuses.
 */
async function remove(id) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM enrolments WHERE intake_id = ?",
    [Number(id)]
  );
  if (row && Number(row.n) > 0) {
    return { ok: false, reason: `${row.n} student(s) are enrolled — set the batch to cancelled instead.` };
  }
  await db.query("DELETE FROM intakes WHERE id = ?", [Number(id)]);
  return { ok: true };
}

/**
 * Move batches through planned -> running -> finished by their dates.
 *
 * Only rows that still have status_auto set: choosing a status by hand in
 * the editor clears that flag, and this then leaves the row alone for
 * good. Manual always wins, permanently, without needing to win again
 * every hour.
 *
 * It reads the dates each time rather than only moving forward, so a
 * batch whose end date is pushed back — a course extended by a fortnight,
 * which happens — goes from finished to running again instead of staying
 * closed with students unable to join. That is safe precisely because the
 * flag is off for anything set by hand: the only rows this can move are
 * ones nobody has claimed.
 *
 * 'planned' is the one state it will not return a row to. A start date
 * edited into the future on a class already running is far more likely to
 * be a typo than an instruction to un-start it, and acting on it would
 * take "Join the class" away mid-course.
 *
 * 'cancelled' is untouched in both directions. A cancelled batch whose
 * start date arrives is still cancelled.
 *
 * Returns what it changed so the caller can log it. Never throws: a
 * sweep that fails is a status that stays where it was, which is the
 * state everything already handles.
 */
/**
 * Today's date in a named timezone, as YYYY-MM-DD.
 *
 * en-CA because its short date format IS YYYY-MM-DD, which is the shape
 * a DATE column compares against without any parsing in between.
 *
 * An unknown timezone falls back to Berlin rather than throwing: the
 * school is in Germany, and a batch with a typo in its timezone should
 * start on the right day rather than never.
 */
function todayIn(tz) {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "Europe/Berlin" }).format(new Date());
  }
}

async function sweepStatuses() {
  if (!db.isEnabled()) return { started: 0, finished: 0 };
  // Nothing to sweep until the flag exists; every batch is manual.
  if (!db.hasColumn("intakes.status_auto")) return { started: 0, finished: 0 };

  try {
    // The date is worked out HERE, per timezone, rather than left to
    // MySQL's CURDATE().
    //
    // CURDATE() is the database server's date, and the pool runs in UTC.
    // At ten past midnight in Berlin it is still twenty past ten the
    // previous evening in UTC, so a batch starting on the 16th stayed
    // "not started" until 02:00 local — reported as exactly that, at
    // 00:12 on the day a course began.
    //
    // Each batch already carries the timezone its lessons are in, so
    // that is the clock it should start by. Grouped, because in practice
    // they are all Europe/Berlin and that is one query rather than one
    // per batch.
    const zones = await db.query(
      `SELECT DISTINCT COALESCE(NULLIF(timezone, ''), 'Europe/Berlin') AS tz
         FROM intakes
        WHERE status_auto = 1`
    );

    let started = 0;
    let finished = 0;

    for (const row of zones || []) {
      const tz = row.tz;
      const today = todayIn(tz);
      const zoneIs = `COALESCE(NULLIF(timezone, ''), 'Europe/Berlin') = ?`;

      const up = await db.query(
        `UPDATE intakes
            SET status = 'running'
          WHERE status_auto = 1
            AND ${zoneIs}
            AND status IN ('planned', 'finished')
            AND starts_on IS NOT NULL
            AND starts_on <= ?
            AND (ends_on IS NULL OR ends_on >= ?)`,
        [tz, today, today]
      );
      started += up ? up.affectedRows || 0 : 0;

      // Finishing does not require having been seen running: a batch
      // whose whole window passed while the server was off should end up
      // finished, not stuck on planned forever.
      const down = await db.query(
        `UPDATE intakes
            SET status = 'finished'
          WHERE status_auto = 1
            AND ${zoneIs}
            AND status IN ('planned', 'running')
            AND ends_on IS NOT NULL
            AND ends_on < ?`,
        [tz, today]
      );
      finished += down ? down.affectedRows || 0 : 0;
    }

    return { started, finished };
  } catch (e) {
    console.warn("  ! batch status sweep failed:", e.message);
    return { started: 0, finished: 0 };
  }
}

module.exports = {
  STATUSES, STATUS_LABEL, LINKS, fromBody, validate,
  list, byId, courseOptions, create, update, remove, sweepStatuses, todayIn,
};
