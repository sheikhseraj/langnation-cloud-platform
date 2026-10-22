// The four codes the school runs on.
//
//   LNS0001       a student, for life
//   LNT0001       a teacher, likewise
//   LNIKB01       a batch: LangNation, Intensivkurs, batch 1
//   20260001      an invoice, restarting each year
//
// Unbroken, with no separators. They are quoted on bank transfers and
// typed into search boxes, where a stray hyphen or space is the
// difference between a payment that matches an account and one the
// office has to chase — so there is nothing in them to get wrong.
//
// Each is allocated from invoice_counters, which is a two-column
// counter table keyed on (series, year) and already used for invoice
// numbers. Reusing it rather than adding tables means one place where
// "the next number" lives, and one place where the race is handled.
//
// The race matters. Two people creating a batch in the same second
// must not both read "3" and both write LNIKB04. The counter is
// bumped with an INSERT ... ON DUPLICATE KEY UPDATE, which is atomic,
// and the number is read back inside the same transaction — so the
// worst case is a gap in the sequence, never a duplicate. A gap is
// invisible; a duplicate would put two students on one invoice.

"use strict";

const db = require("./db");

/**
 * Track abbreviations, in the school's own shorthand.
 *
 * German, because the school teaches German and the office already
 * says Intensivkurs — the customer's own example was "IK Intensive
 * Kurs". Anything not listed falls back to the first two letters of
 * the track, so a track invented later still produces a code rather
 * than an error.
 */
const TRACK_CODE = {
  Regular: "RK",     // Regelkurs
  Intensive: "IK",   // Intensivkurs
  Individual: "EK",  // Einzelkurs
  Speaking: "SK",    // Sprechkurs
  Weekend: "WK",     // Wochenendkurs
  Other: "AK",       // Allgemeiner Kurs
};

const PREFIX = "LN";

/** Two letters for a track, whatever the track is. */
function trackCode(track) {
  const t = String(track || "").trim();
  if (TRACK_CODE[t]) return TRACK_CODE[t];
  const letters = t.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 2) || "AK";
}

/** LNS0001. Padded to four so the list sorts as a person expects. */
const formatStudentRef = (seq) => `${PREFIX}S${String(seq).padStart(4, "0")}`;

/**
 * LNT0001. The same shape as a student's, with T for teacher.
 *
 * One letter apart on purpose: they are read side by side on a batch
 * and in the office's own notes, and a reference that has to be
 * explained is a reference that gets written down wrong. The letter is
 * what distinguishes them, and their own counters mean LNT0001 and
 * LNS0001 both exist without either being a mistake.
 */
const formatTeacherRef = (seq) => `${PREFIX}T${String(seq).padStart(4, "0")}`;

/** LNIKB01. Two digits, growing to three on its own past 99. */
const formatBatchCode = (track, seq) =>
  `${PREFIX}${trackCode(track)}B${String(seq).padStart(2, "0")}`;

/**
 * 20260114 — the year, then the number within it.
 *
 * Restarts each January, unlike the other two: an invoice belongs to
 * a tax year and German bookkeeping expects the sequence to say so.
 * Nothing generates these yet — invoicing is not built — but the
 * format lives here so that when it is, it comes from the same place
 * as the others rather than being invented again.
 */
const formatInvoiceNumber = (year, seq) => `${year}${String(seq).padStart(4, "0")}`;

/**
 * Bump a counter and return its new value.
 *
 * `tx` is a transaction handle where the caller has one, so the number
 * and the row that uses it commit together. Without that a failed
 * insert would burn the number and leave a gap for no reason.
 */
async function nextNumber(series, year, tx = db) {
  await tx.query(
    `INSERT INTO invoice_counters (series, year, last_number)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
    [series, year]
  );
  const row = await tx.queryOne(
    "SELECT last_number FROM invoice_counters WHERE series = ? AND year = ?",
    [series, year]
  );
  return Number(row.last_number);
}

/**
 * The next student reference.
 *
 * One series for all time, not one per year: a student reference goes
 * on certificates and follows a person for as long as they study here,
 * so restarting it every January would mean two people sharing one.
 * Year 0 is the row that says "this series has no year".
 */
async function nextStudentRef(tx = db) {
  return formatStudentRef(await nextNumber("student", 0, tx));
}

/**
 * The next teacher reference.
 *
 * Its own series, for the same reason as the student one: it follows a
 * person for as long as they teach here, and it will eventually appear
 * on a timetable, a payslip and whatever the school issues next. One
 * sequence for all time, so no two people ever share one.
 */
async function nextTeacherRef(tx = db) {
  return formatTeacherRef(await nextNumber("teacher", 0, tx));
}

/**
 * The next batch code for a track.
 *
 * Counted per track, so Regular and Intensive number independently and
 * LNIKB01 is genuinely the first intensive batch rather than the
 * first batch that happened to be intensive.
 *
 * ── Why this asks the intakes table as well ─────────────────────────
 *
 * The counter alone was not enough and the failure was not theoretical.
 * It can fall behind what exists — a batch created while the course row
 * it points at is missing never advances it, a restore from an older
 * dump takes the counter back without taking the batches back, and
 * before migration 14 ran there were codes in the table the counter had
 * never heard of. Any of those, and the next generated code is one
 * somebody already has.
 *
 * So the number is the greater of the counter and the highest code
 * actually in use for that track. The counter keeps the sequence
 * moving when nothing is in the table yet, and the table stops the
 * counter ever handing out a code twice. The one that is behind is
 * caught up rather than trusted.
 */
async function nextBatchCode(track, tx = db) {
  const abbrev = trackCode(track);
  const fromCounter = await nextNumber(`batch:${abbrev}`, 0, tx);

  // The highest number already spent, read from the codes themselves.
  // LN, two letters, B, then digits — so LNRKB02 gives 2, and a code
  // somebody typed in another shape is not counted because it cannot
  // collide with a generated one.
  let inUse = 0;
  try {
    const row = await tx.queryOne(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(code, 6) AS UNSIGNED)), 0) AS n
         FROM intakes
        WHERE code REGEXP ?`,
      [`^LN${abbrev}B[0-9]+$`]
    );
    inUse = Number(row ? row.n : 0);
  } catch (e) {
    // A read that fails leaves the counter's answer, which is the old
    // behaviour — worse, but not worse than refusing to make a batch.
    console.error("Batch codes in use could not be read:", e.message);
  }

  const seq = Math.max(fromCounter, inUse + 1);

  // Catch the counter up, so the next call does not have to do this
  // arithmetic again and a second process asking at the same moment
  // gets a different number.
  if (seq > fromCounter) {
    await tx.query(
      `INSERT INTO invoice_counters (series, year, last_number)
       VALUES (?, 0, ?)
       ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number))`,
      [`batch:${abbrev}`, seq]
    );
  }

  return formatBatchCode(track, seq);
}

/* reserveBatchCode used to live here.

   It pushed the counter past a code somebody had typed into the form,
   so a hand-written LNIKB07 could not later be handed out again. There
   is no such field any more — the code is allocated by
   lib/intakes.create() and cannot be posted — and nextBatchCode above
   reads the table directly, which covers the same ground and more: it
   is past every code in use, not only the ones that came through a
   form.
*/

module.exports = {
  PREFIX,
  TRACK_CODE,
  trackCode,
  formatStudentRef,
  formatTeacherRef,
  formatBatchCode,
  formatInvoiceNumber,
  nextNumber,
  nextStudentRef,
  nextTeacherRef,
  nextBatchCode,
};
