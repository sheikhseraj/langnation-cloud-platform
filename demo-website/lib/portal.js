// What the student portal shows, and nothing else.
//
// Every read here is filtered by the signed-in student's id. That is
// not a convention to be careful about — it is the only thing standing
// between one student and another's invoices, so each query takes the
// id as a parameter and there is no function that returns rows without
// one.
//
// Empty is a normal answer. A brand-new account has no enrolment, no
// certificate and no invoice, and the pages are written to look
// deliberate in that state rather than broken.

"use strict";

const db = require("./db");
const classLinks = require("./class-links");

/** Reads must never take a page down; an empty panel is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Portal: ${label} failed:`, e.message);
    return fallback;
  }
}

// Columns that arrive in a migration. Until it has been run the
// queries below are built without them, because the alternative was
// found the hard way: the query failed, safe() returned [], and a
// student on two courses was shown an empty account that looked
// deliberate.
const HAS_PATTERN = () => db.hasColumn("intakes.meets_days");
const HAS_EXERCISE = () => db.hasColumn("intakes.exercise_url");

/** The full row behind the profile page. */
function profile(studentId) {
  return safe("profile", () =>
    db.queryOne(
      `SELECT id, student_ref, name, email, phone, country, city, address,
              date_of_birth, gender, timezone, preferred_lang, status,
              created_at, last_login_at,
              avatar_type, avatar_updated_at
         FROM students
        WHERE id = ? AND deleted_at IS NULL`,
      [studentId]
    ), null);
}

/** Every enrolment, with the batch and course behind it. */
function courses(studentId) {
  const pat = HAS_PATTERN();
  const ex = HAS_EXERCISE();
  return safe("courses", () =>
    db.query(
      `SELECT e.id, e.status, e.enrolled_on, e.completed_on, e.final_grade,
              -- The batch's own id, so "Join the class" can post to it.
              -- The enrolment id is not the same thing and pointing the
              -- button at it would join whichever batch shared a number.
              i.id AS intake_id,
              i.code, i.title AS batch_title, i.starts_on, i.ends_on,
              i.timezone, i.meeting_url, i.drive_url, i.whatsapp_url,
              ${classLinks.todayRoomSql()},
              ${ex ? "i.exercise_url" : "NULL AS exercise_url"},
              i.status AS batch_status,
              -- The teacher's account name when the batch has one, and
              -- the typed-in name when it does not. Two columns, one
              -- answer: a student should never see a batch taught by
              -- "Frau Weber" in the portal and by somebody else in
              -- class because the text box was never updated.
              COALESCE(t.name, i.teacher_name) AS teacher_name,
              -- When this batch next meets, which is the only thing that
              -- can put a day class above an evening one. A batch's
              -- start DATE cannot: two courses running the same term
              -- share it, and sorting by it puts them in an order that
              -- has nothing to do with the day ahead.
              --
              -- Three hours of grace so a class that began at six is
              -- still "next" at seven — you can join a lesson in
              -- progress, and dropping it to the bottom of the page the
              -- moment it starts is precisely backwards.
              (SELECT MIN(l.starts_at)
                 FROM lessons l
                WHERE l.intake_id = i.id
                  AND l.status = 'scheduled'
                  AND l.starts_at >= DATE_SUB(NOW(), INTERVAL 3 HOUR)) AS next_lesson_at,
              -- When it meets, in words, so the card can say "Monday to
              -- Friday, 09:00" instead of only a start and end date. The
              -- lessons below are the truth; this is the shape of the
              -- week, which is what somebody deciding whether they can
              -- take the course actually needs.
              ${pat ? "i.meets_days, i.meets_from, i.meets_minutes" : "NULL AS meets_days, NULL AS meets_from, NULL AS meets_minutes"},
              c.title AS course_title, c.level, c.slug AS course_slug, c.track
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id
         LEFT JOIN admin_users t ON t.id = i.teacher_id
         JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE e.student_id = ?
        ORDER BY COALESCE(i.starts_on, '1970-01-01') DESC, e.id DESC`,
      [studentId]
    ), []);
}

/**
 * The student's own timetable: every lesson coming up on every batch
 * they are actively on.
 *
 * `starts_at` is UTC in the column and stays UTC here. The batch's own
 * timezone comes back beside it and the page prints in that, because
 * the server is not where the class is — and a student in Bengaluru
 * reading a Frankfurt class in server time is exactly the mistake the
 * column was made UTC to avoid.
 *
 * Cancelled lessons are INCLUDED. A cancelled class that simply
 * vanishes from the list is indistinguishable from one that was never
 * scheduled, and the student turns up. The row carries why it was
 * cancelled and, if it moved, where it moved from — which is the whole
 * reason those columns exist.
 *
 * Held lessons are not: a lesson that has happened is a record, and it
 * belongs on the attendance page rather than in a plan.
 */
function schedule(studentId, { days = 28 } = {}) {
  // Clamped and interpolated rather than bound: INTERVAL takes a unit
  // keyword, not a value, and the window is a number this code chooses
  // and never anything a request supplies.
  const window = Math.min(365, Math.max(1, Math.round(Number(days) || 28)));
  const moved = db.hasColumn("lessons.generated");
  const ho = db.hasColumn("lessons.teacher_id");

  return safe("schedule", () =>
    db.query(
      `SELECT l.id, l.seq, l.title, l.starts_at, l.minutes, l.status,
              l.meeting_url, l.notes,
              ${moved ? "l.moved_from, l.change_note" : "NULL AS moved_from, NULL AS change_note"},
              ${ho ? "l.handover_note, t.name AS stand_in_name" : "NULL AS handover_note, NULL AS stand_in_name"},
              i.id AS intake_id, i.code AS batch_code, i.timezone,
              i.meeting_url AS batch_meeting_url,
              i.status AS batch_status,
              c.title AS course_title, c.level
         FROM lessons l
         JOIN intakes i ON i.id = l.intake_id
         JOIN enrolments e ON e.intake_id = i.id
          AND e.student_id = ? AND e.status = 'active'
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         ${ho ? "LEFT JOIN admin_users t ON t.id = l.teacher_id" : ""}
        WHERE l.status <> 'held'
          -- Three hours of grace, so a class that began at six is still
          -- on the page at seven. You can join a lesson in progress.
          AND l.starts_at >= DATE_SUB(NOW(), INTERVAL 3 HOUR)
          AND l.starts_at <= DATE_ADD(NOW(), INTERVAL ${window} DAY)
        ORDER BY l.starts_at
        LIMIT 200`,
      [studentId]
    ), []);
}

/**
 * Certificates, revoked ones included.
 *
 * A revoked certificate is still shown, marked as revoked. Hiding it
 * would leave somebody holding a printout they believe is valid with
 * nothing in the portal to contradict it.
 */
function certificates(studentId) {
  return safe("certificates", () =>
    db.query(
      `SELECT id, code, course_title, level, grade, hours,
              issued_on, revoked_at, revoked_reason
         FROM certificates
        WHERE student_id = ?
        ORDER BY issued_on DESC, id DESC`,
      [studentId]
    ), []);
}

/**
 * Issued invoices. Drafts are deliberately absent: a draft is the
 * office still deciding, and showing one invites a question about a
 * number that may yet change.
 */
function invoices(studentId) {
  return safe("invoices", () =>
    db.query(
      // The three identifiers that make an invoice traceable: its own
      // number, the batch it is for, and the student it belongs to.
      // The batch is reached through the enrolment, and the joins are
      // LEFT because an invoice need not be tied to a course at all —
      // an exam fee is not a batch.
      `SELECT i.id, i.number, i.kind, i.currency, i.subtotal, i.tax_amount, i.total,
              i.paid_amount, i.status, i.issued_on, i.due_on, i.paid_on, i.pdf_name,
              k.code AS batch_code, c.title AS course_title,
              s.student_ref
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         LEFT JOIN enrolments e ON e.id = i.enrolment_id
         LEFT JOIN intakes k ON k.id = e.intake_id
         LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
        WHERE i.student_id = ? AND i.status <> 'draft'
        ORDER BY COALESCE(i.issued_on, i.created_at) DESC, i.id DESC`,
      [studentId]
    ), []);
}

function events(studentId) {
  return safe("events", () =>
    db.query(
      `SELECT event_slug, event_title, event_date, status
         FROM event_registrations
        WHERE student_id = ?
        ORDER BY event_date DESC`,
      [studentId]
    ), []);
}

/** Placement results, matched on the account or the address behind it. */
function placements(studentId, email) {
  return safe("placements", () =>
    db.query(
      `SELECT placed_level, track, score_percent, taken_at
         FROM placement_results
        WHERE student_id = ? OR email = ?
        ORDER BY taken_at DESC
        LIMIT 5`,
      [studentId, email]
    ), []);
}

/**
 * Learning materials for the batches this student is on.
 *
 * Joined through enrolments rather than filtered afterwards, so a
 * material can only be reached by somebody actually on that batch.
 */
function materials(studentId) {
  return safe("materials", () =>
    db.query(
      `SELECT m.id, m.title, m.description, m.kind, m.original_name,
              m.mime, m.bytes, i.code AS batch_code
         FROM materials m
         JOIN intakes i ON i.id = m.intake_id
         JOIN enrolments e ON e.intake_id = i.id
        WHERE e.student_id = ? AND m.visible = 1
        ORDER BY m.sort_order, m.id
        LIMIT 200`,
      [studentId]
    ), []);
}

/**
 * This student's own attendance, per batch and lesson by lesson.
 *
 * Filtered by student_id like everything else here, so nobody sees
 * anybody else's. Shown to the student on purpose: the person being
 * marked is the one most likely to spot that Tuesday is wrong, and a
 * register they cannot see is one they cannot correct.
 *
 * Only lessons that were actually held. A lesson on the timetable that
 * nobody took a register for is not an absence, and counting it as one
 * would put a student's percentage down for their teacher's paperwork.
 */
function attendance(studentId) {
  return safe("attendance", () =>
    db.query(
      `SELECT l.id AS lesson_id, DATE(l.starts_at) AS day, l.starts_at, l.title,
              i.id AS intake_id, i.code AS batch_code, i.timezone,
              c.title AS course_title, c.level,
              a.status, a.source, a.minutes_late, a.note, a.joined_at
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id
         JOIN lessons l ON l.intake_id = i.id AND l.status = 'held'
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
         LEFT JOIN attendance a ON a.lesson_id = l.id AND a.student_id = e.student_id
        WHERE e.student_id = ?
        ORDER BY l.starts_at DESC
        LIMIT 400`,
      [studentId]
    ), []);
}

/**
 * The dashboard's figures, derived from the same rows the pages show.
 *
 * Counted here rather than in SQL so a number on the dashboard can
 * never disagree with the list it links to — the old portal managed
 * "9 enrolled, 0 active, 3 completed" against a list of three.
 */
function summarise({ enrolments = [], certs = [], bills = [] }) {
  const active = enrolments.filter((e) => e.status === "active").length;
  const completed = enrolments.filter((e) => e.status === "completed").length;

  // The tile says "running now", so it has to count batches that are
  // running. It was counting active ENROLMENTS, which is a different
  // question — a student signed up for a course that starts next month
  // is actively enrolled on a batch that is not running. That is how the
  // dashboard came to say "2 running now" above a card showing one
  // class: both enrolments were active, only one batch had started.
  const running = enrolments.filter(
    (e) => e.status === "active" && e.batch_status === "running"
  ).length;

  // Unpaid means issued and not settled. A void invoice is not a debt,
  // and a storno cancels one rather than adding to it.
  const outstanding = bills
    .filter((b) => b.kind !== "storno" && ["issued", "part_paid"].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.total) - Number(b.paid_amount)), 0);

  return {
    enrolled: enrolments.length,
    active,
    running,
    completed,
    certificates: certs.filter((c) => !c.revoked_at).length,
    invoices: bills.length,
    outstanding: Math.round(outstanding * 100) / 100,
  };
}

/**
 * What is on this student's calendar now, or null.
 *
 * Returns EVERY running batch, not the first one. This used to return
 * live[0] and a student on two courses saw one of them: the tiles said
 * "2 running now" and the card underneath showed a single class, with no
 * way to reach the other one's join link from the dashboard at all. Which
 * of the two got shown was decided by the ORDER BY in the query — start
 * date, descending — so it was the one starting latest, for no reason
 * anybody could have explained.
 *
 * A running batch beats one that has not started; among those that have
 * not started, the soonest wins and only that one is shown, because
 * "starting soon" is an announcement and three of them is a list.
 */
function nextUp(enrolments = []) {
  const now = Date.now();
  const live = enrolments.filter((e) => e.status === "active" && e.batch_status === "running");
  if (live.length) {
    // Every running batch, in the order the student joined them: first
    // enrolled at the top, most recent at the bottom.
    //
    // Sorting by the next lesson time was tried and dropped. It put a
    // morning class above an evening one, which is right on the morning
    // and wrong for the rest of the day: at six in the evening the card
    // you want is the one you are about to be in, and at ten past six
    // the list would silently reorder itself under you. A dashboard
    // whose cards move about is one you have to re-read every time.
    //
    // Enrolment order does not move. The list is the same at nine in the
    // morning and nine at night, so the card in the second slot is in
    // the second slot tomorrow too, and the only thing a student has to
    // do is look at the one they recognise.
    //
    // enrolled_on is a date, so a day with two enrolments on it needs a
    // tiebreak; the enrolment id is the order they were actually
    // created in.
    const ordered = live.slice().sort((a, b) => {
      const d = new Date(a.enrolled_on || 0) - new Date(b.enrolled_on || 0);
      return d || Number(a.id || 0) - Number(b.id || 0);
    });
    return { when: "now", enrolments: ordered, enrolment: ordered[0] };
  }

  const upcoming = enrolments
    .filter((e) => e.starts_on && new Date(e.starts_on).getTime() > now && e.status === "active")
    .sort((a, b) => new Date(a.starts_on) - new Date(b.starts_on));

  return upcoming.length
    ? { when: "soon", enrolments: [upcoming[0]], enrolment: upcoming[0] }
    : null;
}

module.exports = {
  profile, courses, certificates, invoices, events, placements, materials,
  attendance, schedule,
  summarise, nextUp,
};
