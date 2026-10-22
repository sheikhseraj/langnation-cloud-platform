// Putting a student on a batch, and taking them off again.
//
// This is the join that makes the portal show anything: a student sees
// a course because there is a row here linking them to a batch of it.
// Everything else — materials, certificates, the invoice's batch code —
// hangs off the same row.
//
// Enrolling is therefore a real act with consequences a student sees
// immediately, which is why removing is only offered while nothing has
// been built on top of it.

"use strict";

const db = require("./db");

/** Statuses an enrolment can hold, in the order they happen. */
const STATUSES = ["active", "completed", "withdrawn", "failed"];

/** Everyone on one batch. */
async function forBatch(intakeId) {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT e.id, e.status, e.enrolled_on, e.completed_on, e.final_grade,
              s.id AS student_id, s.student_ref, s.name, s.email, s.status AS student_status
         FROM enrolments e
         JOIN students s ON s.id = e.student_id
        WHERE e.intake_id = ? AND s.deleted_at IS NULL
        ORDER BY s.name`,
      [Number(intakeId)]
    );
  } catch (e) {
    console.error("Enrolments could not be listed:", e.message);
    return [];
  }
}

/** How many the picker will hold before it stops being a picker. */
const CANDIDATE_LIMIT = 500;

/**
 * Everyone who could be added to this batch.
 *
 * Anyone already on it is excluded rather than shown greyed out: the
 * only thing the list is for is picking somebody to add, and an entry
 * that cannot be picked is a question, not information.
 *
 * Newest first, because the common case is a student who signed up
 * this morning. created_at comes back with each row so the picker can
 * be re-sorted in the browser without asking again.
 *
 * The whole eligible list is returned, up to a cap, because the
 * dropdown filters it on the client — a server round trip per
 * keystroke would be slower and no more correct at this size.
 */
async function findCandidates(intakeId, limit = CANDIDATE_LIMIT) {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT s.id, s.student_ref, s.name, s.email, s.status, s.created_at
         FROM students s
        WHERE s.deleted_at IS NULL
          AND s.id NOT IN (SELECT student_id FROM enrolments WHERE intake_id = ?)
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ${Number(limit) || CANDIDATE_LIMIT}`,
      [Number(intakeId)]
    );
  } catch (e) {
    console.error("Student list failed:", e.message);
    return [];
  }
}

/**
 * Enrol one student, found by reference or email address.
 *
 * Takes the identifier a person would actually have to hand rather
 * than a numeric id, so the office can type what is on the student's
 * email and not go hunting for a database key.
 */
async function add(intakeId, identifier) {
  // Guarded like the reads above. Without this the back office answers
  // a 500 when the database is down, which reads as a broken admin
  // rather than as a database to go and restart.
  if (!db.isEnabled()) return { ok: false, reason: "The database is unavailable, so nobody can be enrolled right now." };

  const q = String(identifier || "").trim();
  if (!q) return { ok: false, reason: "Enter a student reference or email address." };

  const student = await db.queryOne(
    `SELECT id, name, student_ref, email, status FROM students
      WHERE deleted_at IS NULL AND (student_ref = ? OR email = ?) LIMIT 1`,
    [q.toUpperCase(), q.toLowerCase()]
  );
  if (!student) {
    return { ok: false, reason: `No student found for "${q}". Check the reference or the address.` };
  }
  if (student.status === "suspended") {
    return { ok: false, reason: `${student.name}'s account is suspended, so they cannot be enrolled.` };
  }

  let bill;
  try {
    bill = await db.transaction(async tx => {
      let inserted;
      try { inserted=await tx.query("INSERT INTO enrolments (student_id, intake_id, status) VALUES (?, ?, 'active')",[student.id,Number(intakeId)]); }
      catch(e){if(e.code==='ER_DUP_ENTRY')e.enrolmentDuplicate=true;throw e;}
      return require('./billing').issueAtEnrolment(tx,inserted.insertId);
    });
  } catch (e) {
    // The unique key on (student_id, intake_id) is the one somebody
    // actually trips, by adding the same person twice.
    if (e.enrolmentDuplicate) {
      return { ok: false, reason: `${student.name} is already on this batch.` };
    }
    throw e;
  }

  return { ok: true, student, message: `${student.name} (${student.student_ref || student.email}) is enrolled.` + (bill.status==='issued' ? ` Invoice ${bill.number} is available in Payments.` : bill.status==='fee_unset' ? ' Set the course fee before billing this enrolment.' : ''), billing:bill };
}

async function setStatus(enrolmentId, status) {
  if (!db.isEnabled()) return false;
  if (!STATUSES.includes(status)) return false;
  // completed_on is the date the school can put on a certificate, so it
  // is set here rather than left for somebody to remember.
  const completed = status === "completed" ? "CURRENT_DATE" : "NULL";
  await db.query(
    `UPDATE enrolments SET status = ?, completed_on = ${completed} WHERE id = ?`,
    [status, Number(enrolmentId)]
  );
  return true;
}

/**
 * Remove an enrolment, but not once a certificate rests on it.
 *
 * Deleting would take the certificate's link to the course with it and
 * leave a document nobody can trace. Withdrawing is what that
 * situation wants, and it is one of the statuses.
 */
async function remove(enrolmentId) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is unavailable." };

  const cert = await db.queryOne(
    "SELECT COUNT(*) AS n FROM certificates WHERE enrolment_id = ?",
    [Number(enrolmentId)]
  );
  if (cert && Number(cert.n) > 0) {
    return { ok: false, reason: "A certificate was issued against this enrolment — set it to withdrawn instead." };
  }

  const inv = await db.queryOne(
    "SELECT COUNT(*) AS n FROM invoices WHERE enrolment_id = ? AND status <> 'draft'",
    [Number(enrolmentId)]
  );
  if (inv && Number(inv.n) > 0) {
    return { ok: false, reason: "An invoice was issued against this enrolment — set it to withdrawn instead." };
  }

  await db.query("DELETE FROM enrolments WHERE id = ?", [Number(enrolmentId)]);
  return { ok: true };
}

module.exports = { STATUSES, CANDIDATE_LIMIT, forBatch, findCandidates, add, setStatus, remove };
