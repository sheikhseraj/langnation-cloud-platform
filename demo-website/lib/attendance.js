// Who was in class, and who has stopped coming.
//
// Everything here is scoped to the teacher, the same way lib/teaching.js
// is: the ownership check lives in the WHERE clause of the query, not in
// an `if` beside it. A register is a list of real people's names and the
// fact they were missing on Tuesday.
//
// The one thing worth reading before the rest: attendance attaches to a
// LESSON, and until now nothing in the system had ever created one. The
// `lessons` table has existed since migration 03 and stayed empty
// because no screen wrote to it. Saving a register is what finally
// does — the teacher is the person who knows a class happened, so the
// teacher is the right person to be creating the record of it.
//
// Saving, not opening. `openRegister` reads and never writes, so that
// clicking back through last week to find the day you forgot leaves no
// trail of empty lessons behind it, and an empty form invents nothing.

"use strict";

const db = require("./db");
const classLinks=require("./class-links");

/** Reads must never take a page down; an empty panel is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Attendance: ${label} failed:`, e.message);
    return fallback;
  }
}

// ── pure ─────────────────────────────────────────────────────────────

/**
 * The four marks, and what each is for.
 *
 * Not a present/absent flag. The difference between these is the whole
 * value of the record: "absent" is somebody to ring, "excused" is
 * somebody who told you, and "late" is neither — counting late as
 * absent is how a register stops being trusted by the person filling
 * it in.
 */
const STATUSES = [
  { key: "present", label: "Here", tone: "good" },
  { key: "late", label: "Late", tone: "warn" },
  { key: "absent", label: "Missing", tone: "bad" },
  { key: "excused", label: "Excused", tone: "muted" },
];

/**
 * How long after the class starts still counts as on time.
 *
 * Five minutes. Long enough for a link that takes a moment to open and
 * a headset that needs plugging in; short enough that "late" still
 * means something. Only ever applied to a mark the student made
 * themselves by joining — a teacher marking the register is not
 * consulting a clock, and should not be second-guessed by one.
 */
const GRACE_MINUTES = 5;

const STATUS_KEYS = STATUSES.map((s) => s.key);
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

/** Anything unrecognised becomes "present": a register defaults to a full class. */
const cleanStatus = (v) => (STATUS_KEYS.includes(String(v)) ? String(v) : "present");

/**
 * A date the register may be taken for, as YYYY-MM-DD, or null.
 *
 * The future is refused. A register is a record of what happened, and a
 * class that has not happened cannot have been attended — letting
 * somebody mark next Tuesday in advance turns the whole table from
 * evidence into a guess.
 *
 * `today` is injectable so this can be tested without waiting for
 * tomorrow.
 */
function normaliseDate(value, today = new Date()) {
  const raw = String(value || "").trim();
  const iso = raw ? raw.slice(0, 10) : isoDay(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  // Round-tripped through Date so that 2026-02-31 is rejected rather
  // than quietly becoming the 3rd of March.
  const parsed = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || isoDay(parsed) !== iso) return null;
  if (iso > isoDay(today)) return null;
  return iso;
}

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Midday UTC on that date.
 *
 * `lessons.starts_at` is a DATETIME and a register only knows a day, so
 * something has to be chosen for the time. Midday, because it is the
 * one hour that still falls on the intended date in every timezone the
 * school teaches across — midnight UTC is the previous evening in
 * Bengaluru and the same night in Berlin, and a lesson that lands on
 * the wrong day is a register nobody can find again.
 *
 * When a real timetable exists these rows keep their proper times; this
 * only applies to lessons the register itself had to create.
 */
const middayUtc = (iso) => `${iso} 12:00:00`;

/**
 * How well somebody has attended, as a percentage, or null.
 *
 * Late counts as attended — they came. Excused is left out of the sum
 * entirely rather than counted either way: an absence the school agreed
 * to is not a mark against anybody, and counting it as attendance would
 * be a lie in the other direction.
 *
 * Null when there is nothing to judge, which the pages print as a dash
 * rather than as 0% — "no classes yet" and "missed everything" must not
 * look the same.
 */
function rate(counts = {}) {
  const attended = Number(counts.present || 0) + Number(counts.late || 0);
  const missed = Number(counts.absent || 0);
  const total = attended + missed;
  if (!total) return null;
  return Math.round((attended / total) * 100);
}

/**
 * The two lines every attendance figure on the site is read against.
 *
 * 90 and 60, and they are here rather than in each page because the
 * office, the teacher and the student must be looking at the same
 * numbers. A student seeing amber while the office sees red about the
 * same 62% is an argument nobody can settle.
 *
 * Below 60 is the one that means something: it is the point at which
 * the office tells the teacher to ask what is going on.
 */
// Whose batch this is. One rule, one file — see lib/owns.js.
//
// Read ownsOnDate() below beside it: this says who the batch belongs
// to, that says who may take one register on one day, and a stand-in
// only ever satisfies the second.
const { OWNS, BINDS } = require("./owns");

const GOOD = 90;
const POOR = 60;

/**
 * Which band a percentage falls in: "good", "watch", "poor", or null.
 *
 * Null for null, so "no classes registered yet" keeps its own answer
 * all the way to the page instead of being coloured as though it were
 * a bad one.
 */
function band(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= GOOD) return "good";
  if (pct >= POOR) return "watch";
  return "poor";
}

/**
 * Is this somebody to have a word with?
 *
 * Three unexplained absences, or below 60% once there are enough
 * lessons for that to mean anything. Four lessons is the floor: one
 * absence out of two is 50% and says nothing at all.
 *
 * 60 rather than a number of its own, so the teacher's "worth a
 * message" list and the red figure the office sees are the same
 * judgement rather than two that nearly agree.
 */
function concerning(counts = {}) {
  const pct = rate(counts);
  const seen = Number(counts.present || 0) + Number(counts.late || 0) + Number(counts.absent || 0);
  if (Number(counts.absent || 0) >= 3) return true;
  return pct !== null && seen >= 4 && pct < POOR;
}

/**
 * Here or late, for somebody who has just opened the class link.
 *
 * Early counts as here — somebody sitting in the room before it starts
 * is not late, and a negative difference must not fall through to the
 * wrong side of the comparison.
 *
 * With no start time at all the answer is "here". That is the case
 * where the teacher has not pressed Start yet, and the honest reading
 * of a student arriving before their teacher is not that the student
 * is late.
 */
function markForJoin(startedAt, joinedAt = new Date()) {
  if (!startedAt) return "present";
  const late = new Date(joinedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(late)) return "present";
  return late > GRACE_MINUTES * 60 * 1000 ? "late" : "present";
}

/** Whole minutes late, or null when they were not. */
function minutesLate(startedAt, joinedAt = new Date()) {
  if (!startedAt) return null;
  const late = new Date(joinedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(late) || late <= GRACE_MINUTES * 60 * 1000) return null;
  return Math.max(1, Math.round(late / 60000));
}

/**
 * Turn per-day counts into lines a chart can draw.
 *
 * Pure, and the reason the drawing is: an SVG built in a template is
 * untestable, so everything that could be wrong — the scale, the
 * ordering, a batch with one lesson, a day nobody attended — is decided
 * here where it can be asserted.
 *
 * Every batch is plotted against the same set of days, so two batches
 * on the same week line up vertically even when one of them did not
 * meet on the Tuesday. A day a batch did not meet is a gap in its line
 * rather than a drop to zero: a class that did not happen is not a
 * class nobody came to, and drawing it as one would put a cliff in
 * every chart at every half-term.
 */
/* One colour per line, and one place that decides.

   The chart draws the lines and the table beside it draws a dot per
   row, and they have to agree — a legend that says B2 is gold above a
   table that says B2 is blue is worse than no legend. Theme tokens
   rather than hex, so they stay readable in dark.

   Six, because a seventh line on one chart is a chart nobody can read.
   Ordered so the first two are furthest apart: accent and ok are both
   blue-green in dark mode and were near-indistinguishable as the first
   two lines, which is the common case. */
const LINE_INK = [
  "var(--accent)", "var(--gold-ink)", "var(--ok)",
  "var(--danger)", "var(--navy)", "var(--muted)",
];

const lineColour = (i) => LINE_INK[((Number(i) || 0) % LINE_INK.length + LINE_INK.length) % LINE_INK.length];

function toChart(rows = [], { width = 720, height = 220, pad = 32 } = {}) {
  const days = [...new Set(rows.map((r) => String(r.day).slice(0, 10)))].sort();
  const byBatch = new Map();

  for (const r of rows) {
    const id = Number(r.intake_id);
    if (!byBatch.has(id)) {
      byBatch.set(id, { id, label: r.batch_code, title: r.course_title, points: new Map() });
    }
    const counts = {
      present: Number(r.present || 0),
      late: Number(r.late || 0),
      absent: Number(r.absent || 0),
      excused: Number(r.excused || 0),
    };
    byBatch.get(id).points.set(String(r.day).slice(0, 10), { ...counts, rate: rate(counts) });
  }

  // One day is a dot, not a line, so the x scale has to survive a
  // denominator of zero.
  const span = Math.max(1, days.length - 1);
  const x = (i) => pad + (i / span) * (width - pad * 2);
  const y = (pct) => height - pad - (pct / 100) * (height - pad * 2);

  const lines = [...byBatch.values()].map((b) => {
    const points = days
      .map((day, i) => {
        const p = b.points.get(day);
        if (!p || p.rate === null) return null;
        return { day, i, rate: p.rate, x: round(x(i)), y: round(y(p.rate)), ...p };
      })
      .filter(Boolean);

    const counts = points.reduce(
      (acc, p) => ({
        present: acc.present + p.present,
        late: acc.late + p.late,
        absent: acc.absent + p.absent,
        excused: acc.excused + p.excused,
      }),
      { present: 0, late: 0, absent: 0, excused: 0 }
    );

    return {
      ...b,
      points,
      counts,
      lessons: points.length,
      rate: rate(counts),
      band: band(rate(counts)),
      // Drawn as separate runs, so a gap where a batch did not meet is
      // a break in the line rather than a stride across it.
      path: runs(points)
        .map((run) => "M" + run.map((p) => `${p.x} ${p.y}`).join("L"))
        .join(" "),
    };
  });

  return { days, lines, width, height, pad, x: days.map((_, i) => round(x(i))) };
}

/** Consecutive points, split wherever a day is missing. */
function runs(points) {
  const out = [];
  let current = [];
  let last = null;
  for (const p of points) {
    if (last !== null && p.i !== last + 1) {
      if (current.length) out.push(current);
      current = [];
    }
    current.push(p);
    last = p.i;
  }
  if (current.length) out.push(current);
  return out;
}

const round = (n) => Math.round(n * 10) / 10;

// ── database-backed ──────────────────────────────────────────────────

/**
 * The register for one batch on one day: the lesson if there is one,
 * and every student on the batch with whatever mark they already have.
 *
 * Reads only. Opening a register must not write anything — a teacher
 * clicking back through last week to find the day they forgot would
 * otherwise leave a trail of empty lessons behind them, and the batch's
 * history would show classes that never happened.
 *
 * Returns null when the batch is not this teacher's, exactly as a batch
 * that does not exist would.
 */
/**
 * May this teacher act on this batch, on this one date?
 *
 * The batch's own teacher and its standing cover may, on any date, as
 * they always could. A stand-in may on exactly the date they were
 * handed — their permission is the lesson row, not the course.
 *
 * Written once and used by the three operations a stand-in needs:
 * opening the register, saving it, and starting the class. Every other
 * query in this file still tests OWNS() alone, which is what keeps them
 * out of the class list, the materials, the batch page and every other
 * day's register.
 */
function ownsOnDate(intakeAlias = "i") {
  if (!db.hasColumn("lessons.teacher_id")) return OWNS(intakeAlias);
  return `(${OWNS(intakeAlias)} OR EXISTS (
            SELECT 1 FROM lessons hl
             WHERE hl.intake_id = ${intakeAlias}.id AND hl.teacher_id = ?
               AND DATE(hl.starts_at) = ? AND hl.status <> 'cancelled'))`;
}

const ownsOnDateBinds = (teacherId, iso) =>
  db.hasColumn("lessons.teacher_id")
    ? [...BINDS(teacherId), teacherId, iso]
    : BINDS(teacherId);

async function openRegister(teacherId, intakeId, iso) {
  if (!db.isEnabled()) return null;

  const batch = await db.queryOne(
    `SELECT i.id, i.code, i.timezone, c.title AS course_title, c.level
       FROM intakes i
       LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
      WHERE i.id = ? AND ${ownsOnDate()}
      LIMIT 1`,
    [Number(intakeId), ...ownsOnDateBinds(teacherId, iso)]
  );
  if (!batch) return null;

  const lesson = await db.queryOne(
    `SELECT id, title, starts_at, minutes, status, notes
       FROM lessons
      WHERE intake_id = ? AND DATE(starts_at) = ? AND status <> 'cancelled'
      ORDER BY starts_at
      LIMIT 1`,
    [batch.id, iso]
  );

  // Everybody on the batch, with the mark they already have. A LEFT
  // JOIN so a student with no mark yet is a row with an empty one
  // rather than a row that is missing — a register that silently omits
  // people is worse than no register.
  const rows = await db.query(
    `SELECT s.id, s.student_ref, s.name, s.email,
            s.avatar_type, s.avatar_updated_at,
            e.status AS enrolment_status,
            a.status AS mark, a.minutes_late, a.note, a.marked_at,
            -- Who put that mark there. 'self' is the student's own click
            -- on Join, 'teacher' is the register. The page says which,
            -- because a mark the teacher made is a decision and a mark
            -- the student made is evidence, and only one of them should
            -- make a teacher look twice.
            a.source AS mark_source, a.joined_at
       FROM enrolments e
       JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
       LEFT JOIN attendance a ON a.student_id = s.id AND a.lesson_id = ?
      WHERE e.intake_id = ?
      ORDER BY FIELD(e.status, 'active', 'completed', 'failed', 'withdrawn'), s.name`,
    [lesson ? lesson.id : 0, batch.id]
  );

  return { batch, lesson, date: iso, rows, taken: rows.some((r) => r.mark) };
}

/**
 * Save a register for a batch on a day.
 *
 * Takes the date, not a lesson id. The form used to carry one, which
 * meant the server was trusting a number anybody could edit and then
 * had to check it back — this way there is nothing to check, because
 * the only two things that arrive from the browser are a batch this
 * teacher is proved to own and a date.
 *
 * The lesson is found or created here, in the same transaction as the
 * marks. The SELECT takes its gap lock over `idx_intake_day` (migration
 * 20), so a double-submitted form cannot produce two lessons for the
 * same morning, which would split one class's register in half with no
 * sign that it had happened.
 *
 * The marks are one multi-row upsert rather than a statement each, so
 * either all of a class lands or none of it does. A half-saved register
 * is the worst outcome available: it looks taken, and it is wrong.
 */
async function saveRegister(teacherId, intakeId, iso, marks, markedBy = null) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };
  if (!iso) return { ok: false, reason: "That is not a date a register can be taken for." };

  return db.transaction(async (tx) => {
    // The same test as opening it. A register somebody can read and
    // not save is worse than one they cannot open.
    const batch = await tx.queryOne(
      `SELECT id FROM intakes i WHERE i.id = ? AND ${ownsOnDate()} LIMIT 1`,
      [Number(intakeId), ...ownsOnDateBinds(teacherId, iso)]
    );
    if (!batch) return { ok: false, reason: "That is not one of your classes." };

    // Only students actually on the batch. Without this, a renumbered
    // form field could attach a mark to somebody in another class.
    const enrolled = await tx.query(
      "SELECT student_id FROM enrolments WHERE intake_id = ?",
      [batch.id]
    );
    const allowed = new Set(enrolled.map((r) => Number(r.student_id)));

    const rows = [];
    for (const mark of marks || []) {
      const studentId = Number(mark.studentId);
      if (!allowed.has(studentId)) continue;
      const status = cleanStatus(mark.status);
      const late = status === "late" ? Number(mark.minutesLate) : NaN;
      rows.push([
        studentId,
        status,
        Number.isFinite(late) && late > 0 && late < 600 ? late : null,
        String(mark.note || "").trim().slice(0, 300) || null,
        markedBy,
      ]);
    }
    // Nothing to record, so nothing is created. This is what stops an
    // empty form from inventing a class that did not happen.
    if (!rows.length) return { ok: true, saved: 0 };

    let lesson = await tx.queryOne(
      `SELECT id FROM lessons
        WHERE intake_id = ? AND DATE(starts_at) = ? AND status <> 'cancelled'
        ORDER BY starts_at
        LIMIT 1
        FOR UPDATE`,
      [batch.id, iso]
    );

    if (!lesson) {
      const res = await tx.query(
        `INSERT INTO lessons (intake_id, title, starts_at, status)
         VALUES (?, ?, ?, 'held')`,
        [batch.id, `Class on ${iso}`, middayUtc(iso)]
      );
      lesson = { id: res.insertId };
    }

    const placeholders = rows.map(() => "(?, ?, ?, 'teacher', ?, ?, ?)").join(", ");
    const params = rows.flatMap((r) => [lesson.id, ...r]);
    await tx.query(
      `INSERT INTO attendance
         (lesson_id, student_id, status, source, minutes_late, note, marked_by)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         -- Taking the register over an automatic mark promotes it. The
         -- teacher was in the room; the click was only evidence.
         source = 'teacher',
         minutes_late = VALUES(minutes_late),
         note = VALUES(note),
         marked_by = VALUES(marked_by)`,
      params
    );

    // A register having been taken is what makes a lesson history
    // rather than a plan.
    await tx.query(
      "UPDATE lessons SET status = 'held' WHERE id = ? AND status = 'scheduled'",
      [lesson.id]
    );

    return { ok: true, saved: rows.length, lessonId: lesson.id };
  });
}

/**
 * Record that the teacher has opened the room.
 *
 * This is the moment a lesson begins, and it is the only honest answer
 * to the question "five minutes after what". Nothing else in the system
 * knows: the timetable does not exist, and a batch has a start date but
 * no time of day.
 *
 * Idempotent within the day. Pressing Start twice does not restart the
 * clock and make everybody who joined in between late.
 */
async function startClass(teacherId, intakeId, iso) {
  if (!db.isEnabled()) return null;

  return db.transaction(async (tx) => {
    // A stand-in is teaching it, so they open the room.
    const batch = await tx.queryOne(
      `SELECT i.id, i.meeting_url FROM intakes i WHERE i.id = ? AND ${ownsOnDate()} LIMIT 1`,
      [Number(intakeId), ...ownsOnDateBinds(teacherId, iso)]
    );
    if (!batch) return null;

    let lesson = await tx.queryOne(
      `SELECT id, started_at, meeting_url FROM lessons
        WHERE intake_id = ? AND DATE(starts_at) = ? AND status <> 'cancelled'
        ORDER BY starts_at
        LIMIT 1
        FOR UPDATE`,
      [batch.id, iso]
    );

    if (!lesson) {
      if (!classLinks.valid(batch.meeting_url)) return null;
      const res = await tx.query(
        `INSERT INTO lessons (intake_id, title, starts_at, started_at, status)
         VALUES (?, ?, NOW(), NOW(), 'held')`,
        [batch.id, `Class on ${iso}`]
      );
      return { lessonId: res.insertId, meetingUrl: batch.meeting_url, started: true };
    }

    const meetingUrl=lesson.meeting_url||batch.meeting_url;
    if(!classLinks.valid(meetingUrl))return null;
    if (!lesson.started_at) {
      await tx.query(
        "UPDATE lessons SET started_at = NOW(), status = 'held' WHERE id = ?",
        [lesson.id]
      );
    }
    return { lessonId: lesson.id, meetingUrl, started: !lesson.started_at };
  });
}

/**
 * Record that a student has opened the class link.
 *
 * Marks them here, or late if they are more than the grace window past
 * the moment the teacher opened the room.
 *
 * Two things this deliberately is not:
 *
 *   It is not proof of attendance. It says somebody clicked a link. The
 *   register is the record, and this only ever fills in a default for
 *   the teacher to correct — which is why a mark made by a teacher is
 *   never overwritten here, in SQL, rather than by a check that a later
 *   edit could walk past.
 *
 *   It is not a way to reach a class. The enrolment is checked first
 *   and the meeting link comes back from the database, so a student
 *   cannot join a batch they are not on by editing a number.
 */
async function recordJoin(studentId, intakeId, iso) {
  if (!db.isEnabled()) return null;

  return db.transaction(async (tx) => {
    const batch = await tx.queryOne(
      `SELECT i.id, i.code, i.meeting_url
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id
        WHERE e.intake_id = ? AND e.student_id = ? AND e.status = 'active'
        LIMIT 1`,
      [Number(intakeId), studentId]
    );
    if (!batch) return null;

    let lesson = await tx.queryOne(
      `SELECT id, started_at, meeting_url FROM lessons
        WHERE intake_id = ? AND DATE(starts_at) = ? AND status <> 'cancelled'
        ORDER BY starts_at
        LIMIT 1
        FOR UPDATE`,
      [batch.id, iso]
    );

    if (!lesson) {
      if (!classLinks.valid(batch.meeting_url)) return null;
      // First through the door, teacher included. The lesson exists from
      // now, and they are on time by definition.
      const res = await tx.query(
        `INSERT INTO lessons (intake_id, title, starts_at, status)
         VALUES (?, ?, NOW(), 'held')`,
        [batch.id, `Class on ${iso}`]
      );
      lesson = { id: res.insertId, started_at: null };
    }

    const meetingUrl=lesson.meeting_url||batch.meeting_url;
    if(!classLinks.valid(meetingUrl))return null;
    const status = markForJoin(lesson.started_at);
    const late = minutesLate(lesson.started_at);

    await tx.query(
      `INSERT INTO attendance
         (lesson_id, student_id, status, source, minutes_late, joined_at)
       VALUES (?, ?, ?, 'self', ?, NOW())
       ON DUPLICATE KEY UPDATE
         -- A teacher's mark is the record and is left alone. Only an
         -- earlier automatic mark is updated, and only to keep the
         -- first join time rather than the latest.
         status = IF(source = 'self', VALUES(status), status),
         minutes_late = IF(source = 'self', VALUES(minutes_late), minutes_late),
         joined_at = COALESCE(joined_at, VALUES(joined_at))`,
      [lesson.id, studentId, status, late]
    );

    return { meetingUrl, code: batch.code, status, minutesLate: late };
  });
}

/**
 * Every student on a batch with their attendance so far.
 *
 * Counted in SQL because it is a count over rows the page never shows;
 * the percentage is worked out in JavaScript, by the same `rate` the
 * dashboard uses, so two places can never disagree about what 80%
 * means.
 */
function summaryFor(teacherId, intakeId) {
  return safe("summary", async () => {
    const rows = await db.query(
      `SELECT s.id, s.student_ref, s.name,
              SUM(a.status = 'present') AS present,
              SUM(a.status = 'late')    AS late,
              SUM(a.status = 'absent')  AS absent,
              SUM(a.status = 'excused') AS excused,
              MAX(CASE WHEN a.status IN ('present','late') THEN l.starts_at END) AS last_seen
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id AND ${OWNS()}
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         LEFT JOIN lessons l ON l.intake_id = i.id AND l.status = 'held'
         LEFT JOIN attendance a ON a.lesson_id = l.id AND a.student_id = s.id
        WHERE e.intake_id = ?
        GROUP BY s.id, s.student_ref, s.name
        ORDER BY s.name`,
      [...BINDS(teacherId), Number(intakeId)]
    );
    return rows.map(decorate);
  }, []);
}

/**
 * Students across all this teacher's running batches who are slipping.
 *
 * The dashboard's reason for existing: somebody who has missed three
 * classes is still a student, and somebody who is told so in week four
 * usually comes back. Nobody spots that from a list of registers.
 */
function concerns(teacherId) {
  return safe("concerns", async () => {
    const rows = await db.query(
      `SELECT s.id, s.student_ref, s.name, s.email, s.phone,
              i.id AS intake_id, i.code AS batch_code,
              SUM(a.status = 'present') AS present,
              SUM(a.status = 'late')    AS late,
              SUM(a.status = 'absent')  AS absent,
              SUM(a.status = 'excused') AS excused,
              MAX(CASE WHEN a.status IN ('present','late') THEN l.starts_at END) AS last_seen
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id AND ${OWNS()} AND i.status = 'running'
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         JOIN lessons l ON l.intake_id = i.id AND l.status = 'held'
         JOIN attendance a ON a.lesson_id = l.id AND a.student_id = s.id
        WHERE e.status = 'active'
        GROUP BY s.id, s.student_ref, s.name, s.email, s.phone, i.id, i.code
        ORDER BY s.name`,
      BINDS(teacherId)
    );
    return rows.map(decorate).filter((r) => r.concerning);
  }, []);
}

/**
 * The registers already taken on a batch, most recent first.
 *
 * So a teacher can see at a glance which days are done — and, more
 * usefully, which are not.
 */
function recentRegisters(teacherId, intakeId, limit = 20) {
  const n = Math.min(100, Math.max(1, Math.round(Number(limit) || 20)));
  return safe("recent", () =>
    db.query(
      `SELECT l.id, l.title, l.starts_at, DATE(l.starts_at) AS day, l.status,
              COUNT(a.id) AS marked,
              SUM(a.status IN ('present','late')) AS attended,
              SUM(a.status = 'absent') AS absent
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id AND ${OWNS()}
         LEFT JOIN attendance a ON a.lesson_id = l.id
        WHERE l.intake_id = ? AND l.status <> 'cancelled'
        GROUP BY l.id, l.title, l.starts_at, l.status
        ORDER BY l.starts_at DESC
        LIMIT ${n}`,
      [...BINDS(teacherId), Number(intakeId)]
    ), []);
}

/**
 * Every class that has already happened, across all of this teacher's
 * batches, newest first.
 *
 * recentRegisters answers the same question for ONE batch and is what
 * the batch page shows. This is the version for somebody who teaches
 * three courses and wants to know where they stand -- "which dates are
 * done and which are not" is not a per-batch question when the answer
 * is spread over three pages.
 *
 * Every past lesson, not only the ones with marks on them: a date with
 * no register is the whole point of looking. `marked` is how many
 * students have any mark at all and `by_teacher` how many were marked
 * by a person, which is what separates "done" from "four students
 * clicked join and nobody wrote it down".
 */
function registerHistory(teacherId, { limit = 40, days = 0 } = {}) {
  const n = Math.min(200, Math.max(1, Math.round(Number(limit) || 40)));
  const src = db.hasColumn("attendance.source");
  /* A window as well as a count, so the page can say "the last two
     weeks" and mean it. Clamped and interpolated rather than bound:
     INTERVAL takes a unit keyword, not a value, and this is a number
     the page chooses from a fixed set. 0 means no limit but the count. */
  const back = Math.min(365, Math.max(0, Math.round(Number(days) || 0)));

  return safe("registerHistory", () =>
    db.query(
      `SELECT l.id, l.title, l.starts_at, DATE(l.starts_at) AS day, l.status,
              i.id AS intake_id, i.code AS batch_code, i.timezone,
              c.title AS course_title, c.level,
              COUNT(a.id) AS marked,
              SUM(a.status IN ('present','late')) AS attended,
              SUM(a.status = 'absent') AS absent,
              ${src ? "SUM(a.source = 'teacher')" : "COUNT(a.id)"} AS by_teacher,
              (SELECT COUNT(*) FROM enrolments e
                WHERE e.intake_id = i.id AND e.status = 'active') AS students
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id AND ${OWNS()}
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         LEFT JOIN attendance a ON a.lesson_id = l.id
        WHERE l.starts_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)
          ${back ? `AND l.starts_at >= DATE_SUB(NOW(), INTERVAL ${back} DAY)` : ""}
        GROUP BY l.id, l.title, l.starts_at, l.status, i.id, i.code,
                 i.timezone, c.title, c.level
        ORDER BY l.starts_at DESC
        LIMIT ${n}`,
      BINDS(teacherId)
    ), []);
}

/**
 * Every lesson of ONE batch, with the state of its register.
 *
 * ── The question this answers ───────────────────────────────────────
 *
 * "Which dates have I done and which do I still owe." recentRegisters
 * lists the same lessons but leaves that to be worked out from a row
 * of counts, and registerHistory spans every batch and only shows what
 * has already happened — neither is a term to tick off.
 *
 * ── Why `by_teacher` and not `marked` ───────────────────────────────
 *
 * Because a student clicking join writes an attendance row. A lesson
 * four people joined has four marks on it and no register: nobody
 * decided anything, and the three who did not turn up are not recorded
 * as absent. Counting marks would call that done and quietly lose the
 * absences, which is the one thing a register is for.
 *
 * Before migration 25 there is no `source` column to tell the two
 * apart, so marks are all there is. Said in the shape of the answer
 * rather than guessed at: `certain` is false, and the page can then
 * decline to claim a date is done.
 */
function batchRegisters(teacherId, intakeId, limit = 200) {
  const n = Math.min(400, Math.max(1, Math.round(Number(limit) || 200)));
  const src = db.hasColumn("attendance.source");

  return safe("batchRegisters", () =>
    db.query(
      `SELECT l.id, l.title, l.starts_at, DATE(l.starts_at) AS day,
              l.status, i.timezone,
              COUNT(a.id) AS marked,
              SUM(a.status IN ('present','late')) AS attended,
              SUM(a.status = 'absent') AS absent,
              ${src ? "SUM(a.source = 'teacher')" : "COUNT(a.id)"} AS by_teacher,
              ${src ? "1" : "0"} AS certain,
              /* Already happened, on the same three-hour grace the rest
                 of this file uses: a register is not owed the minute a
                 class starts. */
              (l.starts_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)) AS gone,
              (SELECT COUNT(*) FROM enrolments e
                WHERE e.intake_id = i.id AND e.status = 'active') AS students
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id AND ${OWNS()}
         LEFT JOIN attendance a ON a.lesson_id = l.id
        WHERE l.intake_id = ?
        GROUP BY l.id, l.title, l.starts_at, l.status, i.timezone, i.id
        ORDER BY l.starts_at DESC
        LIMIT ${n}`,
      [...BINDS(teacherId), Number(intakeId)]
    ), []);
}

/**
 * What a row of batchRegisters() means, in one word.
 *
 * Kept beside the query rather than in the template, because the
 * teacher's attendance page and anything else that shows this later
 * must not come to different conclusions about whether a date is done
 * — which is exactly what happened to the tick on a homework chapter.
 */
function registerState(row) {
  if (String(row.status) === "cancelled") return "cancelled";
  if (!Number(row.gone)) return "upcoming";
  // Before migration 25 a mark cannot be traced to a person, so
  // "somebody has marks" is the most that can honestly be said.
  const byTeacher = Number(row.by_teacher || 0);
  if (byTeacher > 0) return Number(row.certain) ? "done" : "marked";
  return "pending";
}

/**
 * Every batch the office could chart, newest first.
 *
 * Not teacher-scoped: this is the back office, which sees the school.
 * Batches with no register taken are included and say so — "nobody has
 * taken a register on this one" is the most useful thing an attendance
 * screen can tell you about a batch.
 */
function officeOptions() {
  return safe("officeOptions", () =>
    db.query(
      `SELECT i.id, i.code, i.starts_on, i.status,
              c.title AS course_title, c.level,
              COALESCE(u.name, i.teacher_name) AS teacher_name,
              (SELECT COUNT(*) FROM lessons l
                WHERE l.intake_id = i.id AND l.status = 'held') AS held,
              (SELECT COUNT(*) FROM attendance a
                 JOIN lessons l2 ON l2.id = a.lesson_id
                WHERE l2.intake_id = i.id) AS marks
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         LEFT JOIN admin_users u ON u.id = i.teacher_id
        ORDER BY COALESCE(i.starts_on, '9999-12-31') DESC, i.id DESC
        LIMIT 300`
    ), []);
}

/**
 * Attendance per day for the chosen batches.
 *
 * The ids are cast to numbers and dropped into the SQL rather than
 * bound, because IN (?) with an array is not a thing a prepared
 * statement does — each one is checked with Number.isInteger first, so
 * nothing but a list of integers can reach the query.
 */
function officeSeries(intakeIds = []) {
  const ids = [...new Set(intakeIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return Promise.resolve([]);

  return safe("officeSeries", () =>
    db.query(
      `SELECT i.id AS intake_id, i.code AS batch_code, c.title AS course_title,
              DATE(l.starts_at) AS day,
              SUM(a.status = 'present') AS present,
              SUM(a.status = 'late')    AS late,
              SUM(a.status = 'absent')  AS absent,
              SUM(a.status = 'excused') AS excused
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         JOIN attendance a ON a.lesson_id = l.id
        WHERE l.intake_id IN (${ids.join(",")}) AND l.status = 'held'
        GROUP BY i.id, i.code, c.title, DATE(l.starts_at)
        ORDER BY DATE(l.starts_at)`
    ), []);
}

/**
 * The same series as officeSeries, for one teacher's own batches.
 *
 * Scoped by OWNS rather than by a list of ids: a teacher does not pick
 * which batches to chart, they get theirs — and a picker on a dashboard
 * that usually has two batches on it is furniture, not a feature.
 *
 * Running batches only. A chart is a thing you read to decide what to
 * do this week, and a course that finished in March has nothing left to
 * decide.
 */
function teacherSeries(teacherId) {
  return safe("teacherSeries", () =>
    db.query(
      `SELECT i.id AS intake_id, i.code AS batch_code, c.title AS course_title,
              DATE(l.starts_at) AS day,
              SUM(a.status = 'present') AS present,
              SUM(a.status = 'late')    AS late,
              SUM(a.status = 'absent')  AS absent,
              SUM(a.status = 'excused') AS excused
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id AND ${OWNS()} AND i.status = 'running'
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         JOIN attendance a ON a.lesson_id = l.id
        WHERE l.status = 'held'
        GROUP BY i.id, i.code, c.title, DATE(l.starts_at)
        ORDER BY DATE(l.starts_at)`,
      BINDS(teacherId)
    ), []);
}

/**
 * Every student on the chosen batches, with their attendance.
 *
 * One row per student per batch, not per student: somebody on two
 * courses can be fine on one and missing from the other, and averaging
 * the two hides exactly the batch the office needs to ring about.
 *
 * The teacher comes along with each row, because the answer to "this
 * student is at 40%" is "tell their teacher to ask why", and looking
 * that up separately is the step that does not get taken.
 *
 * Same id handling as officeSeries: checked integers interpolated,
 * because IN (?) with an array is not something a prepared statement
 * does.
 */
function officeStudents(intakeIds = []) {
  const ids = [...new Set(intakeIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return Promise.resolve([]);

  return safe("officeStudents", async () => {
    const rows = await db.query(
      `SELECT s.id, s.student_ref, s.name, s.email, s.phone,
              i.id AS intake_id, i.code AS batch_code,
              c.title AS course_title,
              COALESCE(u.name, i.teacher_name) AS teacher_name,
              e.status AS enrolment_status,
              SUM(a.status = 'present') AS present,
              SUM(a.status = 'late')    AS late,
              SUM(a.status = 'absent')  AS absent,
              SUM(a.status = 'excused') AS excused,
              MAX(CASE WHEN a.status IN ('present','late') THEN l.starts_at END) AS last_seen
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         LEFT JOIN admin_users u ON u.id = i.teacher_id
         LEFT JOIN lessons l ON l.intake_id = i.id AND l.status = 'held'
         LEFT JOIN attendance a ON a.lesson_id = l.id AND a.student_id = s.id
        WHERE e.intake_id IN (${ids.join(",")})
        GROUP BY s.id, s.student_ref, s.name, s.email, s.phone,
                 i.id, i.code, c.title, u.name, i.teacher_name, e.status
        ORDER BY s.name`
    );

    // Worst first. A list somebody has to sort themselves is a list
    // whose whole point has been handed back to them.
    return rows
      .map(decorate)
      .sort((a, b) => {
        // Nobody with nothing recorded is "worst" — they are unknown,
        // and unknown belongs at the bottom, not at the top of a list
        // of people to ring.
        if (a.rate === null && b.rate === null) return a.name.localeCompare(b.name);
        if (a.rate === null) return 1;
        if (b.rate === null) return -1;
        return a.rate - b.rate || a.name.localeCompare(b.name);
      });
  }, []);
}

/** The counts as numbers, plus the two judgements made from them. */
function decorate(row) {
  const counts = {
    present: Number(row.present || 0),
    late: Number(row.late || 0),
    absent: Number(row.absent || 0),
    excused: Number(row.excused || 0),
  };
  const pct = rate(counts);
  return {
    ...row,
    ...counts,
    lessons: counts.present + counts.late + counts.absent + counts.excused,
    rate: pct,
    band: band(pct),
    concerning: concerning(counts),
  };
}

module.exports = {
  LINE_INK, lineColour, teacherSeries, registerHistory,
  STATUSES,
  STATUS_KEYS,
  STATUS_LABEL,
  GRACE_MINUTES,
  GOOD,
  POOR,
  // pure, and unit-tested without a database
  cleanStatus,
  normaliseDate,
  middayUtc,
  markForJoin,
  minutesLate,
  rate,
  band,
  concerning,
  toChart,
  // database-backed
  openRegister,
  saveRegister,
  startClass,
  recordJoin,
  summaryFor,
  concerns,
  recentRegisters,
  batchRegisters,
  registerState,
  officeOptions,
  officeSeries,
  officeStudents,
};
