// What the teacher portal shows, and nothing else.
//
// The student portal filters every read by the signed-in student's id.
// This does the same with the teacher's, and it matters more here, not
// less: a student who slips past the filter sees somebody else's
// invoice, where a teacher who slips past it sees a whole class's
// names, addresses and phone numbers.
//
// So every function takes a teacherId, and the ones that take a batch
// id take the teacher's id as well and join on it — the ownership check
// is in the WHERE clause, never a separate `if` that a later edit can
// walk past. A batch that is not theirs comes back as null, which is
// the same answer as a batch that does not exist, and deliberately so.
//
// Empty is a normal answer. A teacher hired in March has no batch until
// April, and the pages are written to look deliberate in that state.

"use strict";

const db = require("./db");
const classLinks = require("./class-links");

// Whose batches these are. One rule, one file — see lib/owns.js.
const { OWNS, BINDS } = require("./owns");

/** Reads must never take a page down; an empty panel is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Teaching: ${label} failed:`, e.message);
    return fallback;
  }
}

/**
 * Every batch this teacher runs, newest first.
 *
 * The head count is a subquery rather than a GROUP BY so a batch with
 * nobody on it still appears. An empty batch is exactly the one a
 * teacher needs to see — it is the week before term starts.
 */
function batches(teacherId) {
  const pat = HAS_PATTERN();
  const ho = HAS_HANDOVER();

  return safe("batches", () =>
    db.query(
      `SELECT i.id, i.code, i.title AS batch_title, i.starts_on, i.ends_on,
              i.timezone, i.seats, i.status AS batch_status,
              i.meeting_url, i.drive_url, i.whatsapp_url,
              ${classLinks.todayRoomSql()},
              ${pat ? "i.meets_days, i.meets_from, i.meets_minutes" : "NULL AS meets_days, NULL AS meets_from, NULL AS meets_minutes"},
              c.title AS course_title, c.level, c.track, c.slug AS course_slug,
              (SELECT COUNT(*) FROM enrolments e
                WHERE e.intake_id = i.id AND e.status = 'active') AS active_students,
              (SELECT COUNT(*) FROM enrolments e WHERE e.intake_id = i.id) AS enrolled,
              -- When this batch next meets, as an instant. The same
              -- question the student portal answers, and until lessons
              -- were rows there was no way to ask it: a teacher could
              -- see which batches were running and not which class was
              -- next.
              --
              -- Three hours of grace, so a class that began at seven is
              -- still "next" at eight. You can join a lesson in
              -- progress, and dropping it off the page the moment it
              -- starts is precisely backwards.
              --
              -- A lesson handed to somebody else is not your next one.
              -- COALESCE(l.teacher_id, i.teacher_id) is "whose class is
              -- this actually", and matching it against the reader
              -- means a handed-away Thursday is skipped and the
              -- Saturday after it is what the card names. Without this
              -- the dashboard told a teacher to start a class they had
              -- already arranged not to take.
              (SELECT MIN(l.starts_at)
                 FROM lessons l
                WHERE l.intake_id = i.id
                  AND l.status = 'scheduled'
                  AND l.starts_at >= DATE_SUB(NOW(), INTERVAL 3 HOUR)
                  ${ho ? "AND COALESCE(l.teacher_id, i.teacher_id) = ?" : ""}) AS next_lesson_at
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE ${OWNS()}
        ORDER BY COALESCE(i.starts_on, '9999-12-31') DESC, i.id DESC
        LIMIT 200`,
      // The subquery sits in the SELECT, so its parameter is bound
      // before the WHERE's.
      [...(ho ? [teacherId] : []), ...BINDS(teacherId)]
    ), []);
}

/**
 * One batch, but only if it belongs to this teacher.
 *
 * teacher_id is in the WHERE clause, so "not mine" and "does not exist"
 * are the same query and produce the same null. Somebody typing batch
 * ids into the address bar learns nothing from the difference, because
 * there is no difference.
 */
function batch(teacherId, intakeId) {
  return safe("batch", () =>
    db.queryOne(
      `SELECT i.id, i.code, i.title AS batch_title, i.starts_on, i.ends_on,
              i.timezone, i.seats, i.status AS batch_status,
              i.meeting_url, i.drive_url, i.whatsapp_url,
              ${classLinks.todayRoomSql()},
              c.title AS course_title, c.level, c.track
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE i.id = ? AND ${OWNS()}
        LIMIT 1`,
      [intakeId, ...BINDS(teacherId)]
    ), null);
}

/**
 * The class list for one batch.
 *
 * Joined through intakes with the teacher's id attached, so the roster
 * cannot be reached by anyone but the person teaching it. The contact
 * columns are here because the first thing a teacher does about an
 * empty seat is send a message about it.
 */
function roster(teacherId, intakeId) {
  return safe("roster", () =>
    db.query(
      `SELECT s.id, s.student_ref, s.name, s.email, s.phone, s.country,
              s.avatar_type, s.avatar_updated_at,
              e.status, e.enrolled_on, e.completed_on, e.final_grade
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id AND ${OWNS()}
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
        WHERE e.intake_id = ?
        ORDER BY FIELD(e.status, 'active', 'completed', 'failed', 'withdrawn'), s.name`,
      [...BINDS(teacherId), intakeId]
    ), []);
}

/**
 * Materials on this teacher's batches.
 *
 * Read-only for now: there is no upload route yet, so this shows what
 * the office has attached and says so. Hidden ones are included, marked
 * — a teacher needs to know a worksheet exists but is not visible to
 * the class, which is exactly the state that otherwise gets discovered
 * mid-lesson.
 */
function materials(teacherId, intakeId = null) {
  // The batch filter is added to the SQL rather than written as
  // "(? IS NULL OR m.intake_id = ?)". These go through prepared
  // statements, where a bare placeholder on the left of IS NULL has no
  // type and MySQL is entitled to refuse it — and a query that works on
  // one server and errors on another is the worst kind.
  const one = intakeId != null;
  const params = one
    ? [...BINDS(teacherId), Number(intakeId)]
    : BINDS(teacherId);

  return safe("materials", () =>
    db.query(
      `SELECT m.id, m.title, m.description, m.kind, m.original_name,
              m.mime, m.bytes, m.visible, m.created_at,
              i.id AS intake_id, i.code AS batch_code
         FROM materials m
         JOIN intakes i ON i.id = m.intake_id AND ${OWNS()}
        ${one ? "WHERE m.intake_id = ?" : ""}
        ORDER BY m.sort_order, m.id
        LIMIT 200`,
      params
    ), []);
}

/**
 * The timetable for this teacher's batches.
 *
 * `starts_at` is UTC in the column and stays UTC here; the batch's own
 * timezone is what the page prints it in. Converting in SQL would bake
 * the server's zone into the answer, and the server is not where the
 * class is.
 *
 * Only lessons still to come: `status = 'scheduled'`. A held lesson is
 * a record, not a plan, and taking a register creates one (see
 * lib/attendance.js) — without this filter every register taken would
 * reappear under "next six weeks" at the placeholder time the register
 * had to invent for it.
 */
/* The batch page and the schedule page both need to know whether a
   batch has a pattern at all, because "no lessons" and "no timetable
   set" are different things to tell a teacher. NULL rather than absent
   before the migration, so every caller reads the same shape. */
const HAS_PATTERN = () => db.hasColumn("intakes.meets_days");

/* A lesson handed to somebody who teaches none of this batch.

   Their whole permission is that row. Exactly three queries in this
   file read lessons.teacher_id and each has a reason:

     batches()    — to leave a lesson you handed away out of "when does
                    this next meet", so your own card does not name it.
     lessons()    — the schedule, which lists a lesson handed to you.
     standingIn() — the dashboard card for that lesson.

   Nothing else does, which is what keeps a stand-in out of the batch
   page, the class list, the materials and every other date. The suite
   checks that by name rather than trusting this comment. */
const HAS_HANDOVER = () => db.hasColumn("lessons.teacher_id");

function lessons(teacherId, { days = 28 } = {}) {
  // Clamped and interpolated rather than bound. INTERVAL takes a unit
  // keyword, not a value, and the window is a number this code chooses
  // — never anything a request supplies — so there is nothing here for
  // a parameter to protect against.
  const window = Math.min(365, Math.max(1, Math.round(Number(days) || 28)));
  const ho = HAS_HANDOVER();

  return safe("lessons", () =>
    db.query(
      `SELECT l.id, l.seq, l.title, l.starts_at, l.minutes, l.status,
              l.meeting_url, l.notes,
              ${ho ? "l.teacher_id AS stand_in_id, l.handover_note, t.name AS stand_in_name" :
                     "NULL AS stand_in_id, NULL AS handover_note, NULL AS stand_in_name"},
              ${ho ? "(l.teacher_id = ?) AS standing_in" : "0 AS standing_in"},
              i.id AS intake_id, i.code AS batch_code, i.timezone,
              i.meeting_url AS batch_meeting_url,
              c.title AS course_title, c.level
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         ${ho ? "LEFT JOIN admin_users t ON t.id = l.teacher_id" : ""}
        WHERE l.status = 'scheduled'
          AND (${OWNS()}${ho ? " OR l.teacher_id = ?" : ""})
          AND l.starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          AND l.starts_at <= DATE_ADD(NOW(), INTERVAL ${window} DAY)
        ORDER BY l.starts_at
        LIMIT 200`,
      [...(ho ? [teacherId] : []), ...BINDS(teacherId), ...(ho ? [teacherId] : [])]
    ), []);
}

/**
 * The next class handed to this teacher by somebody else, or null.
 *
 * Shaped like a batch row rather than like a lesson, because it goes to
 * the same "Happening now" card and a card that has to ask which of two
 * shapes it was given is a card that will one day be given the wrong
 * one. `standing_in` is what tells it apart, and the view uses that to
 * drop the things that belong to the batch rather than to the lesson —
 * the class list, the materials, the head count. None of those are the
 * stand-in's, and the queries behind them would return nothing anyway.
 *
 * The three hours of grace are the same as the batch card's: a class
 * that began at seven is still the one you are teaching at eight.
 */
function standingIn(teacherId) {
  if (!HAS_HANDOVER()) return Promise.resolve(null);

  return safe("standing in", () =>
    db.queryOne(
      `SELECT i.id, i.code, i.timezone, i.status AS batch_status,
              i.meeting_url AS batch_meeting_url,
              i.title AS batch_title, i.starts_on,
              l.id AS lesson_id, l.title AS lesson_title, l.minutes,
              l.starts_at AS next_lesson_at, l.handover_note,
              l.meeting_url,
              c.title AS course_title, c.level,
              t.name AS for_name,
              1 AS standing_in
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         LEFT JOIN admin_users t ON t.id = i.teacher_id
        WHERE l.teacher_id = ?
          AND l.status = 'scheduled'
          AND l.starts_at >= DATE_SUB(NOW(), INTERVAL 3 HOUR)
        ORDER BY l.starts_at
        LIMIT 1`,
      [teacherId]
    ), null);
}

/**
 * The dashboard's figures, counted from the same rows the pages list.
 *
 * Derived here rather than in SQL for the reason the student portal
 * gives: a tile that counts separately from its own list eventually
 * disagrees with it, and the tile is the one people believe.
 */
function summarise(rows = []) {
  const running = rows.filter((b) => b.batch_status === "running");
  const planned = rows.filter((b) => b.batch_status === "planned");

  return {
    batches: rows.length,
    running: running.length,
    planned: planned.length,
    // Heads on running batches, not every head ever taught. "How many
    // students have I got" means this term.
    students: running.reduce((n, b) => n + Number(b.active_students || 0), 0),
    // Empty seats across the running batches, or null when no batch has
    // a seat limit set — in which case there is nothing to be short of.
    seatsLeft: running.some((b) => b.seats != null)
      ? running.reduce((n, b) => n + Math.max(0, Number(b.seats || 0) - Number(b.active_students || 0)), 0)
      : null,
  };
}

/**
 * The batch to put at the top of the dashboard, or null.
 *
 * A running batch beats one that has not started; among those that have
 * not started, the soonest wins. It is the same rule the student
 * dashboard uses, because both are answering the same question on
 * opening the page: what am I meant to be doing.
 */
function nextUp(rows = [], standIn = null) {
  const now = Date.now();

  /* A class handed to you is a class you are teaching.

     It wins on the clock and nothing else: whichever of your own next
     lesson and the one somebody gave you comes first is the one the
     card names. A stand-in with no batch of their own would otherwise
     open the portal to a blank dashboard on the evening they are meant
     to be teaching, and the teacher who handed it away would be told to
     start a class they had already arranged not to take. */
  const standInAt = standIn && standIn.next_lesson_at
    ? new Date(standIn.next_lesson_at).getTime()
    : null;
  const pickStandIn = () => (standIn ? { when: "now", batch: standIn } : null);

  /* Every row here is now one of this teacher's own.

     There used to be a sort step in front of this: batches() returned
     the standing cover batches too, and "Happening now" — the card that
     carries Start the class and Take the register — had to be kept off
     somebody else's class. Cover is a single lesson now, it never
     reaches batches(), and so there is nothing left to filter. */
  const live = rows.filter((b) => b.batch_status === "running");
  if (live.length) {
    // The batch that meets SOONEST, not the one that started most
    // recently. Sorting by start date was the best available answer
    // when no lesson had a time on it — and it is plainly wrong now
    // that they do: a card headed "Happening now" was naming a class
    // that meets tomorrow while another one met that evening.
    const withLesson = live
      .filter((b) => b.next_lesson_at)
      .sort((a, b) => new Date(a.next_lesson_at) - new Date(b.next_lesson_at));
    if (withLesson.length) {
      if (standInAt !== null && standInAt < new Date(withLesson[0].next_lesson_at).getTime()) {
        return pickStandIn();
      }
      return { when: "now", batch: withLesson[0] };
    }

    // No timetable anywhere, so fall back to what there is. A handed
    // lesson beats that fallback: one of them can say when it meets.
    if (standInAt !== null) return pickStandIn();
    const sorted = [...live].sort(
      (a, b) => new Date(b.starts_on || 0) - new Date(a.starts_on || 0)
    );
    return { when: "now", batch: sorted[0] };
  }

  // Nothing of your own is running, so a class you were handed is the
  // only thing happening — including for a teacher who has no batch at
  // all and was asked to cover one evening.
  if (standInAt !== null) return pickStandIn();

  const upcoming = rows
    .filter(
      (b) => b.batch_status === "planned" && b.starts_on && new Date(b.starts_on).getTime() > now
    )
    .sort((a, b) => new Date(a.starts_on) - new Date(b.starts_on));

  return upcoming.length ? { when: "soon", batch: upcoming[0] } : null;
}

module.exports = {
  batches, batch, roster, materials, lessons, standingIn, summarise, nextUp,
};
