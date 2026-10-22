// ─────────────────────────────────────────────────────────────────────
//  Registers that have not been taken.
//
//  A teacher who is out of time at the end of a class should be able to
//  take the register later — that is the point of this — but "later" has
//  to mean something, or it means never. Attendance that arrives three
//  weeks after the class is not attendance, it is somebody's memory.
//
//  Because lessons are now rows, none of this needs a table of its own.
//  A pending register is a lesson that has happened with nothing recorded
//  against it, which is a LEFT JOIN, not a feature:
//
//      a past lesson, not cancelled, with no TEACHER mark on it
//
//  "No teacher mark" rather than "no attendance at all" on purpose.
//  Students can mark themselves present by joining through the portal,
//  so a class where four of nine joined by link has attendance rows and
//  is still missing its register — and the five who never clicked are
//  sitting there unrecorded, which is exactly the case that started all
//  of this.
//
//  ── Sunday ──────────────────────────────────────────────────────────
//
//  Every register is due by the end of the week it belongs to: the
//  Sunday of that week, in the batch's own timezone. A deadline a
//  teacher can say out loud — "this week's registers by Sunday" — is one
//  they keep; "within seven days" is a different date for every class.
//
//  Past Sunday it is overdue and the teacher is told. A week past that
//  it stops being the teacher's problem alone and the office is told,
//  because at that point the reminder has plainly not worked and
//  somebody needs to ask whether the teacher is all right.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");

/* Whose registers these are. One rule, one file — see lib/owns.js.

   A register is chased from the teacher who owns the batch, which is
   right even for a lesson somebody stood in on: the stand-in took that
   one class and has gone, and an overdue register is the batch
   teacher's to account for. */
const { OWNS, BINDS } = require("./owns");

/* Once migration 21 has run a mark knows where it came from, and only a
   teacher's counts as the register being taken. Before it, every mark
   looks the same and the best available answer is "any attendance at
   all" — which is wrong in the student-joined case but not wrong in a
   way that invents work. */
const TEACHER_MARK = () =>
  db.hasColumn("attendance.source")
    ? "a.lesson_id = l.id AND a.source = 'teacher'"
    : "a.lesson_id = l.id";

/** How long after Sunday before the office hears about it. */
const ESCALATE_AFTER_DAYS = 7;

/** The calendar day an instant falls on, on a clock in that zone. */
function localDay(instant, tz) {
  if (!instant) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "Europe/Berlin",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * The Sunday that closes the week a date belongs to.
 *
 * A lesson on Sunday is due that same day rather than a week later: the
 * week it belongs to is the one it happened in, and giving Sunday's
 * class eight days while Monday's gets six would be hard to explain.
 */
function dueBy(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const js = at.getUTCDay(); // 0 = Sunday
  const untilSunday = js === 0 ? 0 : 7 - js;
  at.setUTCDate(at.getUTCDate() + untilSunday);
  return at.toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another. Negative means not yet. */
function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** Today, on a clock in that zone. */
const todayIn = (tz) => localDay(new Date(), tz);

/**
 * Work out the state of one pending row: when it was due, and whether
 * that has passed, and by how far.
 */
function decorate(row) {
  const tz = row.timezone || "Europe/Berlin";
  const on = localDay(row.starts_at, tz);
  const due = dueBy(on);
  const today = todayIn(tz);
  const late = daysBetween(due, today);
  return {
    ...row,
    on,
    due,
    // Due today still counts as in hand. A teacher taking Sunday's
    // register on Sunday has not missed anything.
    overdue: late > 0,
    daysLate: late > 0 ? late : 0,
    escalated: late > ESCALATE_AFTER_DAYS,
  };
}

/* One shape for every caller, so a row decorated here reads the same
   on the teacher's banner and on the office's list. `withTeacher` adds
   the account behind the batch, which only the office needs — a teacher
   looking at their own backlog already knows who they are. */
const SELECT = ({ withTeacher = false } = {}) => `
  SELECT l.id AS lesson_id, l.title, l.starts_at, l.minutes,
         i.id AS intake_id, i.code AS batch_code, i.timezone,
         i.teacher_id, i.teacher_name,
         c.title AS course_title, c.level,
         ${withTeacher ? "t.name AS teacher_account_name, t.email AS teacher_email," : ""}
         (SELECT COUNT(*) FROM enrolments e
           WHERE e.intake_id = i.id AND e.status = 'active') AS students
    FROM lessons l
    JOIN intakes i ON i.id = l.intake_id
    LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
    ${withTeacher ? "LEFT JOIN admin_users t ON t.id = i.teacher_id" : ""}`;

/* A class that finished ten minutes ago is not a register anybody has
   failed to take. Three hours of grace, which is longer than any lesson
   here and short enough that the same evening still counts. */
const IS_PENDING = `
     l.status <> 'cancelled'
     AND l.starts_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)
     AND NOT EXISTS (SELECT 1 FROM attendance a WHERE ${"__MARK__"})`;

const pendingWhere = () => IS_PENDING.replace("__MARK__", TEACHER_MARK());

async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Backlog: ${label} failed:`, e.message);
    return fallback;
  }
}

/**
 * Every register this teacher still owes, oldest first.
 *
 * Oldest first because that is the one that will be escalated, and a
 * list that buries it under this morning's is a list that gets skimmed.
 */
async function forTeacher(teacherId, { limit = 50 } = {}) {
  const rows = await safe("forTeacher", () =>
    db.query(
      `${SELECT()}
        WHERE ${OWNS()} AND ${pendingWhere()}
        ORDER BY l.starts_at
        LIMIT ${Math.min(200, Math.max(1, Number(limit) || 50))}`,
      BINDS(teacherId)
    ), []);
  return (rows || []).map(decorate);
}

/** The same, for one batch — used on the batch page. */
async function forBatch(intakeId) {
  const rows = await safe("forBatch", () =>
    db.query(
      `${SELECT()}
        WHERE i.id = ? AND ${pendingWhere()}
        ORDER BY l.starts_at
        LIMIT 100`,
      [intakeId]
    ), []);
  return (rows || []).map(decorate);
}

/**
 * What the teacher is told, in one sentence.
 *
 * Returns null when there is nothing owed, so a caller can simply not
 * draw the banner rather than drawing an empty one.
 */
function summarise(pending) {
  const list = pending || [];
  if (!list.length) return null;

  const overdue = list.filter((p) => p.overdue);
  const oldest = list[0];
  const classes = `${list.length} ${list.length === 1 ? "class" : "classes"}`;

  if (!overdue.length) {
    return {
      tone: "due",
      count: list.length,
      due: oldest.due,
      text: `Attendance is pending for ${classes}. It is due by Sunday.`,
    };
  }

  const worst = overdue[0];
  return {
    tone: worst.escalated ? "escalated" : "overdue",
    count: list.length,
    due: worst.due,
    daysLate: worst.daysLate,
    text: worst.escalated
      ? `Attendance for ${classes} is more than a week overdue. The office has been told.`
      : `Attendance for ${classes} is overdue — the oldest was due on Sunday ${worst.due}.`,
  };
}

/**
 * For the office: every teacher with a register a week past its Sunday.
 *
 * Grouped by teacher rather than listed by lesson, because the question
 * the office is asking is "who needs chasing", not "which Tuesday".
 */
async function overdueByTeacher({ days = ESCALATE_AFTER_DAYS } = {}) {
  const rows = await safe("overdueByTeacher", () =>
    db.query(
      `${SELECT({ withTeacher: true })}
        WHERE ${pendingWhere()}
        ORDER BY l.starts_at
        LIMIT 500`
    ), []);

  const cutoff = Math.max(0, Number(days) || 0);
  const late = (rows || []).map(decorate).filter((r) => r.daysLate > cutoff);

  const byTeacher = new Map();
  for (const row of late) {
    // A batch with no account behind it still has a name typed on it,
    // and "nobody" is a worse answer than the name the office wrote.
    const key = row.teacher_id || `name:${row.teacher_account_name || row.teacher_name || "?"}`;
    if (!byTeacher.has(key)) {
      byTeacher.set(key, {
        teacherId: row.teacher_id || null,
        name: row.teacher_account_name || row.teacher_name || "Not assigned",
        email: row.teacher_email || null,
        lessons: [],
        worstDaysLate: 0,
      });
    }
    const entry = byTeacher.get(key);
    entry.lessons.push(row);
    entry.worstDaysLate = Math.max(entry.worstDaysLate, row.daysLate);
  }

  return [...byTeacher.values()].sort((a, b) => b.worstDaysLate - a.worstDaysLate);
}

module.exports = {
  forTeacher, forBatch, summarise, overdueByTeacher,
  dueBy, daysBetween, decorate, localDay,
  ESCALATE_AFTER_DAYS,
};
