// ─────────────────────────────────────────────────────────────────────
//  Lessons, made from a batch's weekly pattern.
//
//  A batch says "Monday to Friday, 09:00, two hours" once, and every
//  lesson between its start and end dates follows. Sixty rows from one
//  sentence, which is the whole point: a timetable nobody typed is a
//  timetable that cannot disagree with the dates above it.
//
//  Until now `lessons` rows appeared one at a time, created by
//  saveRegister on the day a teacher happened to take the register.
//  That records attendance and is no use at all as a timetable — nobody
//  could see next Tuesday until next Tuesday, and the student portal had
//  nothing to show.
//
//  ── What makes this safe to run again ──────────────────────────────
//
//  It runs on every batch save and every ten minutes, so it will run
//  thousands of times against the same rows. Three rules keep that from
//  being frightening:
//
//    1. It only ever CREATES a lesson for a date that has none.
//    2. It only ever DELETES a row it made itself — generated = 1,
//       still scheduled, no attendance against it, not moved by hand,
//       and in the future. Anything failing one of those is somebody's
//       work or somebody's history, and it is left alone.
//    3. A date is "covered" by a lesson that sits on it OR by one that
//       was MOVED from it. Otherwise rescheduling Thursday to Friday
//       would leave Thursday looking empty, and the next sweep would
//       helpfully put the class back.
//
//  The effect is that a teacher can cancel, move and annotate freely,
//  and the generator will not argue with any of it.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");
const sched = require("./schedule");

/* A batch with a typo for an end date — 2206 rather than 2026 — should
   cost a short timetable and a puzzled look, not two hundred thousand
   rows. lib/schedule.js caps the dates; this caps what we will insert
   in one pass on top of that. */
const MAX_PER_RUN = 400;

/** A DATE column as YYYY-MM-DD, whether the driver gave us a Date or a string. */
function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    // The pool runs in UTC and a DATE has no time in it, so the UTC
    // calendar day IS the stored day. Formatting it locally would move
    // it for anybody west of London.
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

/** What calendar day an instant falls on, on a clock in that zone. */
function localDay(instant, tz) {
  if (!instant) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** The pattern a batch row carries, or null if it has not been given one. */
function patternOf(batch) {
  if (!batch) return null;
  const days = sched.formatDays(batch.meets_days);
  const time = sched.parseTime(batch.meets_from);
  const startsOn = isoDate(batch.starts_on);
  if (!days || !time || !startsOn) return null;

  const minutes = Number(batch.meets_minutes) > 0 ? Number(batch.meets_minutes) : 120;
  return {
    startsOn,
    // A batch with no end date is open-ended, which a generator cannot
    // be. A year is the longest course anybody here runs and the cap in
    // lib/schedule.js will stop it well before that anyway.
    endsOn: isoDate(batch.ends_on) || addYear(startsOn),
    days,
    time,
    minutes,
    timezone: batch.timezone || "Europe/Berlin",
  };
}

function addYear(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

/**
 * Bring one batch's lessons in line with its pattern.
 *
 * Returns { created, removed, covered, reason }. `reason` is set only
 * when nothing was attempted, and is a sentence rather than a code
 * because the only thing that reads it is a log line and a person.
 */
async function generate(intakeId, { now = new Date() } = {}) {
  const nothing = (reason) => ({ created: 0, removed: 0, covered: 0, reason });

  if (!db.isEnabled()) return nothing("no database");
  // Shipped ahead of its migration: the feature is off, not broken.
  if (!db.hasColumn("lessons.generated")) return nothing("migration 25 pending");

  const batch = await db.queryOne(
    `SELECT id, code, starts_on, ends_on, timezone,
            meets_days, meets_from, meets_minutes
       FROM intakes
      WHERE id = ?`,
    [intakeId]
  );
  if (!batch) return nothing("no such batch");

  const pattern = patternOf(batch);
  if (!pattern) return nothing("no pattern set");

  const plan = sched.plan(pattern);
  if (!plan.length) return nothing("the pattern produces no dates");

  const tz = pattern.timezone;

  // Everything already on the books for this batch, with the day each
  // one lands on locally — and the day it was moved FROM, which counts
  // as covering that day too.
  const existing = await db.query(
    `SELECT id, starts_at, moved_from, status, generated
       FROM lessons
      WHERE intake_id = ?`,
    [batch.id]
  );

  const covered = new Set();
  for (const row of existing || []) {
    const on = localDay(row.starts_at, tz);
    if (on) covered.add(on);
    const from = localDay(row.moved_from, tz);
    if (from) covered.add(from);
  }

  // ── Create what is missing ───────────────────────────────────────
  const missing = plan.filter((l) => !covered.has(l.date)).slice(0, MAX_PER_RUN);
  let created = 0;

  if (missing.length) {
    // The lesson's number within the whole timetable, so "Lesson 12" is
    // the twelfth class of the course rather than the twelfth we
    // happened to insert.
    const seqOf = new Map(plan.map((l, i) => [l.date, i + 1]));
    const values = missing.map(() => "(?, ?, ?, ?, ?, 'scheduled', 1)").join(", ");
    const params = missing.flatMap((l) => [
      batch.id,
      seqOf.get(l.date),
      `Lesson ${seqOf.get(l.date)}`,
      l.startsAt,
      l.minutes,
    ]);
    const res = await db.query(
      `INSERT INTO lessons (intake_id, seq, title, starts_at, minutes, status, generated)
       VALUES ${values}`,
      params
    );
    created = res ? res.affectedRows || missing.length : missing.length;
  }

  // ── Withdraw what the pattern no longer asks for ─────────────────
  //
  // Only rows this generator made, only while they are still merely
  // scheduled, only in the future, and only with nothing recorded
  // against them. A lesson somebody moved keeps `moved_from`, and that
  // alone exempts it: the pattern did not put it where it is, so the
  // pattern does not get to take it away.
  const wanted = new Set(plan.map((l) => l.date));
  const stale = (existing || []).filter((row) => {
    if (!Number(row.generated)) return false;
    if (row.status !== "scheduled") return false;
    if (row.moved_from) return false;
    const on = localDay(row.starts_at, tz);
    if (!on || wanted.has(on)) return false;
    return new Date(row.starts_at) > now;
  });

  let removed = 0;
  if (stale.length) {
    // Every guard is repeated in the statement itself. The rows were
    // read a moment ago and a register taken in between would be gone
    // — and attendance is not a thing to lose to a race.
    const ids = stale.map((r) => r.id);
    const res = await db.query(
      `DELETE l FROM lessons l
        WHERE l.id IN (${ids.map(() => "?").join(", ")})
          AND l.generated = 1
          AND l.status = 'scheduled'
          AND l.moved_from IS NULL
          AND l.starts_at > ?
          AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.lesson_id = l.id)`,
      [...ids, now]
    );
    removed = res ? res.affectedRows || 0 : 0;
  }

  return { created, removed, covered: covered.size, reason: null };
}

/**
 * Every batch that has a pattern, brought in line.
 *
 * Called from the sweep, so a batch whose end date moved, or one whose
 * pattern was set months ago, gets its lessons without anybody pressing
 * anything. Failures are per-batch: one bad row must not stop the rest.
 */
async function generateAll({ now = new Date() } = {}) {
  if (!db.isEnabled()) return { batches: 0, created: 0, removed: 0 };
  if (!db.hasColumn("lessons.generated")) return { batches: 0, created: 0, removed: 0 };

  let rows;
  try {
    rows = await db.query(
      `SELECT id FROM intakes
        WHERE meets_days IS NOT NULL AND meets_days <> ''
          AND meets_from IS NOT NULL
          AND starts_on IS NOT NULL
          AND status IN ('planned', 'running')`
    );
  } catch (e) {
    console.warn("  ! lesson generator could not list batches:", e.message);
    return { batches: 0, created: 0, removed: 0 };
  }

  let created = 0;
  let removed = 0;
  let batches = 0;
  for (const row of rows || []) {
    try {
      const out = await generate(row.id, { now });
      created += out.created;
      removed += out.removed;
      if (out.created || out.removed) batches++;
    } catch (e) {
      console.warn(`  ! lesson generator failed on batch ${row.id}:`, e.message);
    }
  }
  return { batches, created, removed };
}

/* ═══════════════════════════════════════════════════════════════════
   Moving and cancelling a lesson.

   The generator above writes the ordinary timetable. This is what
   happens when the ordinary timetable is wrong: the teacher is ill, it
   is a public holiday, the room is double-booked.

   Two rules run through all of it.

   A lesson that has been HELD cannot be changed. It is not a plan any
   more, it is a record — attendance hangs off it — and moving it would
   move somebody's register to a day they were not in class.

   A change always carries a reason. "Cancelled" with nothing beside it
   reads as a mistake; "Cancelled — public holiday" reads as a school
   that knows what it is doing. The note is required for that reason and
   not because the column is NOT NULL, which it is not.
   ═══════════════════════════════════════════════════════════════════ */

/* A batch belongs to its teacher. One rule, one file — see lib/owns.js.
   Moving and calling off a class are the teacher's; a stand-in reaches
   the one lesson they were handed through MAY_TOUCH() below. */
const { OWNS, BINDS } = require("./owns");

const NOTE_MAX = 300;

/* Whether this database can hand a single lesson to somebody. */
const HAS_HANDOVER = () => db.hasColumn("lessons.teacher_id");

/**
 * Who may act on one lesson.
 *
 * The batch's teacher, as everywhere else — and whoever that single
 * lesson was handed to. That second one is the narrowest permission in
 * the system and deliberately so: it is the ROW, not the course. A
 * stand-in can see that lesson and take that register; they cannot open
 * the batch, its other registers, its class list or its materials,
 * because none of those queries mention lessons.teacher_id.
 */
const MAY_TOUCH = () =>
  HAS_HANDOVER() ? `(${OWNS()} OR l.teacher_id = ?)` : OWNS();

const TOUCH_BINDS = (teacherId) =>
  HAS_HANDOVER() ? [...BINDS(teacherId), teacherId] : BINDS(teacherId);

/**
 * One lesson, but only if it belongs to this teacher.
 *
 * Ownership is in the WHERE clause, so "not yours" and "does not exist"
 * are the same answer. A teacher probing ids learns nothing from the
 * difference.
 */
async function forTeacher(lessonId, teacherId) {
  if (!db.isEnabled()) return null;
  const ho = HAS_HANDOVER();
  return db.queryOne(
    `SELECT l.id, l.seq, l.title, l.starts_at, l.minutes, l.status,
            l.meeting_url, l.notes,
            ${db.hasColumn("lessons.generated")
              ? "l.moved_from, l.change_note, l.generated"
              : "NULL AS moved_from, NULL AS change_note, 0 AS generated"},
            ${ho ? "l.teacher_id AS stand_in_id, l.handover_note, t.name AS stand_in_name"
                 : "NULL AS stand_in_id, NULL AS handover_note, NULL AS stand_in_name"},
            i.id AS intake_id, i.code AS batch_code, i.timezone,
            i.teacher_id AS batch_teacher_id,
            i.meeting_url AS batch_meeting_url,
            c.title AS course_title, c.level
       FROM lessons l
       JOIN intakes i ON i.id = l.intake_id
       LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
       ${ho ? "LEFT JOIN admin_users t ON t.id = l.teacher_id" : ""}
      WHERE l.id = ? AND ${MAY_TOUCH()}
      LIMIT 1`,
    [lessonId, ...TOUCH_BINDS(teacherId)]
  );
}

/** Everyone actively on the batch who has an address to write to. */
async function recipients(intakeId) {
  if (!db.isEnabled()) return [];
  return (
    (await db.query(
      `SELECT s.id, s.name, s.email, s.student_ref
         FROM enrolments e
         JOIN students s ON s.id = e.student_id
        WHERE e.intake_id = ? AND e.status = 'active'
          AND s.deleted_at IS NULL
          AND s.email IS NOT NULL AND s.email <> ''
        ORDER BY s.name`,
      [intakeId]
    )) || []
  );
}

const cleanNote = (note) => String(note == null ? "" : note).trim().slice(0, NOTE_MAX);

/* Why a class was called off, as a short list rather than free text.
 *
 * The note was always required and always empty-ish in practice: "ill",
 * "holiday", "cancelled". What nobody could answer afterwards was whose
 * side it came from — whether the school dropped the class or the
 * students asked for it — and that is the question that matters when a
 * batch has had three of them.
 *
 * So the first two entries are the two sides, said plainly, and the
 * rest are the causes that are neither. "Nobody turned up" is here
 * because it is the common case for a class that is already in the
 * past: it was on, the teacher was there, and the register is empty.
 *
 * The free text stays. A list of six cannot cover a term, and the
 * reason a student reads should be allowed to say "storm, trains
 * cancelled" rather than being forced into "Other".
 */
const CANCEL_REASONS = [
  { key: "teacher",  label: "Teacher unavailable" },
  { key: "students", label: "At the students' request" },
  { key: "noshow",   label: "Nobody turned up" },
  { key: "holiday",  label: "Public holiday" },
  { key: "tech",     label: "Technical problem" },
  { key: "other",    label: "Other" },
];

/* "Other" deliberately has no label of its own: it means "what follows
   is the reason", and prefixing it with the word Other would put a
   label in front of the only sentence that was actually written. */
const reasonLabel = (key) => {
  const hit = CANCEL_REASONS.find((r) => r.key === String(key == null ? "" : key).trim());
  return hit && hit.key !== "other" ? hit.label : "";
};

/**
 * The line the students read: the cause, then whatever was added to it.
 *
 * Composed into change_note rather than stored in a column of its own.
 * A column would count better — "how many did this batch lose to the
 * students asking" is a GROUP BY — but it needs a migration, and this
 * needs to work on the next deploy. The keys above are kept as data so
 * that a column can be added later and backfilled from these prefixes.
 */
function cancelNote({ reason, note } = {}) {
  const said = cleanNote(note);
  const head = reasonLabel(reason);
  if (!head) return said;
  return cleanNote(said ? `${head} \u2014 ${said}` : head);
}

/**
 * Call off a lesson. The row stays.
 *
 * Deleting it would be the obvious thing and it is wrong: a class that
 * vanishes is indistinguishable from one that was never scheduled, the
 * student portal shows nothing unusual, and somebody turns up. It is
 * kept, marked, and shown struck through with the reason.
 */
async function cancel(lessonId, teacherId, { reason, note } = {}) {
  if (!db.hasColumn("lessons.generated")) {
    return { ok: false, reason: "This needs migration 25. Ask the office to run it." };
  }
  const lesson = await forTeacher(lessonId, teacherId);
  if (!lesson) return { ok: false, reason: "No such lesson on one of your batches." };
  if (lesson.status === "held") {
    return { ok: false, reason: "That class has already been held — its register is against it." };
  }
  if (lesson.status === "cancelled") {
    return { ok: false, reason: "That class is already cancelled." };
  }

  const why = cancelNote({ reason, note });
  if (!why) {
    return {
      ok: false,
      reason: "Say why it is cancelled — pick a reason or write one. The students see this.",
    };
  }

  await db.query(
    `UPDATE lessons SET status = 'cancelled', change_note = ?
      WHERE id = ? AND status <> 'held'`,
    [why, lessonId]
  );
  return { ok: true, lesson: { ...lesson, status: "cancelled", change_note: why }, note: why };
}

/** Put a cancelled lesson back, at the same time. */
async function restore(lessonId, teacherId, { note } = {}) {
  if (!db.hasColumn("lessons.generated")) {
    return { ok: false, reason: "This needs migration 25. Ask the office to run it." };
  }
  const lesson = await forTeacher(lessonId, teacherId);
  if (!lesson) return { ok: false, reason: "No such lesson on one of your batches." };
  if (lesson.status !== "cancelled") {
    return { ok: false, reason: "That class is not cancelled." };
  }

  const why = cleanNote(note);
  await db.query(
    `UPDATE lessons SET status = 'scheduled', change_note = ?
      WHERE id = ? AND status = 'cancelled'`,
    [why || null, lessonId]
  );
  return { ok: true, lesson: { ...lesson, status: "scheduled", change_note: why || null }, note: why };
}

/**
 * Move a lesson to another day or time.
 *
 * `date` and `time` are read as a WALL CLOCK in the batch's own zone,
 * because that is what the teacher typed and where the class is. The
 * conversion to the stored instant is lib/schedule.js's, which is the
 * one place in the codebase that knows how to do it across a
 * daylight-saving change.
 *
 * `moved_from` records the slot it is leaving, not the slot it
 * originally had. A class moved twice should tell students where it was
 * when they last heard about it — that is the time they wrote down.
 *
 * A cancelled lesson that is moved comes back: rescheduling something
 * is a statement that it is happening.
 */
async function reschedule(lessonId, teacherId, { date, time, minutes, note } = {}) {
  if (!db.hasColumn("lessons.generated")) {
    return { ok: false, reason: "This needs migration 25. Ask the office to run it." };
  }
  const lesson = await forTeacher(lessonId, teacherId);
  if (!lesson) return { ok: false, reason: "No such lesson on one of your batches." };
  if (lesson.status === "held") {
    return { ok: false, reason: "That class has already been held — its register is against it." };
  }

  const tz = lesson.timezone || "Europe/Berlin";
  const iso = isoDate(date);
  const hhmm = sched.parseTime(time);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { ok: false, reason: "Pick a date for the new class." };
  }
  if (!hhmm) return { ok: false, reason: "Pick a time for the new class." };

  const startsAt = sched.utcFor(iso, hhmm, tz);
  if (!startsAt) {
    return { ok: false, reason: "That date and time could not be read." };
  }

  const length = Number(minutes) > 0 ? Math.min(600, Math.round(Number(minutes))) : lesson.minutes;
  const why = cleanNote(note);
  if (!why) {
    return { ok: false, reason: "Say why it has moved — the students see this." };
  }

  // Moving it to where it already is is not a move, and announcing one
  // to a class that would then find nothing changed is worse than
  // refusing.
  if (new Date(lesson.starts_at).getTime() === startsAt.getTime() && length === lesson.minutes) {
    return { ok: false, reason: "That is the time it is already at." };
  }

  await db.query(
    `UPDATE lessons
        SET starts_at = ?, minutes = ?, moved_from = ?, change_note = ?,
            status = 'scheduled'
      WHERE id = ? AND status <> 'held'`,
    [startsAt, length, lesson.starts_at, why, lessonId]
  );

  return {
    ok: true,
    lesson: {
      ...lesson,
      starts_at: startsAt,
      minutes: length,
      moved_from: lesson.starts_at,
      change_note: why,
      status: "scheduled",
    },
    note: why,
  };
}

/**
 * Give one lesson to another teacher.
 *
 * Not the batch — the lesson. The stand-in gets that date and nothing
 * else: their schedule shows it, they can take its register, and every
 * other query in the system still asks about the batch's own teachers
 * and will not find them.
 *
 * `by` is recorded because this is the one place a teacher can grant
 * another teacher sight of a class list. The office is emailed at the
 * time; this is the copy that is still here in March.
 *
 * A held lesson cannot be handed over: its register is taken, and
 * changing who taught it after the fact rewrites a record rather than
 * arranging a class.
 */
async function handOver(lessonId, teacherId, { toTeacherId, note } = {}) {
  if (!HAS_HANDOVER()) {
    return { ok: false, reason: "This needs migration 27. It runs itself on the next restart." };
  }

  const lesson = await forTeacher(lessonId, teacherId);
  if (!lesson) return { ok: false, reason: "No such lesson on one of your batches." };
  if (lesson.status === "held") {
    return { ok: false, reason: "That class has already been held — its register is against it." };
  }
  if (lesson.status === "cancelled") {
    return { ok: false, reason: "That class is cancelled. Put it back on first, then hand it over." };
  }

  const to = Number(toTeacherId);
  if (!Number.isInteger(to) || to <= 0) {
    return { ok: false, reason: "Choose the teacher who will take it." };
  }
  if (to === Number(teacherId)) {
    return { ok: false, reason: "That is you — choose somebody else." };
  }

  const stand = await db.queryOne(
    `SELECT id, name, email FROM admin_users
      WHERE id = ? AND status IN ('active', 'invited') LIMIT 1`,
    [to]
  );
  if (!stand) return { ok: false, reason: "That teacher account is not available." };

  const why = cleanNote(note);
  if (!why) {
    return { ok: false, reason: "Say why it is changing — the students see this." };
  }

  await db.query(
    `UPDATE lessons
        SET teacher_id = ?, handover_by = ?, handover_note = ?
      WHERE id = ? AND status <> 'held'`,
    [to, Number(teacherId) || null, why, lessonId]
  );

  return {
    ok: true,
    lesson: {
      ...lesson,
      stand_in_id: to,
      stand_in_name: stand.name,
      handover_note: why,
    },
    standIn: stand,
    note: why,
  };
}

/** Take it back: the batch's own teacher has it again. */
async function takeBack(lessonId, teacherId) {
  if (!HAS_HANDOVER()) {
    return { ok: false, reason: "This needs migration 27. It runs itself on the next restart." };
  }
  const lesson = await forTeacher(lessonId, teacherId);
  if (!lesson) return { ok: false, reason: "No such lesson on one of your batches." };
  if (!lesson.stand_in_id) return { ok: false, reason: "That class is not handed over." };
  if (lesson.status === "held") {
    return { ok: false, reason: "That class has already been held." };
  }

  // The stand-in must not be able to hand the class back to somebody
  // who never had it. Only the batch's own teachers can undo this.
  const owners = await db.queryOne(
    `SELECT 1 AS ok FROM intakes i WHERE i.id = ? AND ${OWNS()} LIMIT 1`,
    [lesson.intake_id, ...BINDS(teacherId)]
  );
  if (!owners) {
    return { ok: false, reason: "Only the batch's own teacher can take this class back." };
  }

  await db.query(
    `UPDATE lessons SET teacher_id = NULL, handover_note = NULL
      WHERE id = ? AND status <> 'held'`,
    [lessonId]
  );
  return { ok: true, lesson: { ...lesson, stand_in_id: null, stand_in_name: null } };
}

module.exports = {
  generate, generateAll, patternOf, isoDate, localDay,
  forTeacher, recipients, cancel, restore, reschedule,
  handOver, takeBack, HAS_HANDOVER,
  NOTE_MAX,
  CANCEL_REASONS,
  cancelNote,
};
