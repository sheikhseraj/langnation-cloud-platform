// Everybody the school knows about, and where they have got to.
//
// A person arrives in three steps and the two halves were in two
// different tables and two different screens:
//
//   1. They ask for an account          account_requests, pending
//   2. The office approves              account_requests, approved
//   3. They actually create it          a row in students
//
// So "has Anna got an account yet?" meant looking in two places and
// knowing which. This joins the halves into one list with one column
// saying which step somebody is on.
//
// Built in JavaScript rather than as a SQL UNION. The two tables have
// genuinely different shapes — a request has a purpose and a decision,
// a student has a reference and a last sign-in — and forcing them into
// matching column lists would mean a dozen NULLs and a query nobody
// can read.

"use strict";

const db = require("./db");

/** The steps, in the order a person goes through them. */
const STAGES = [
  { key: "requested", label: "Asked for an account", tone: "wait" },
  { key: "approved", label: "Approved — not signed up yet", tone: "wait" },
  { key: "active", label: "Account created", tone: "good" },
  { key: "suspended", label: "Suspended", tone: "bad" },
  { key: "refused", label: "Refused", tone: "bad" },
  { key: "closed", label: "Account closed", tone: "bad" },
];

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const STAGE_TONE = Object.fromEntries(STAGES.map((s) => [s.key, s.tone]));

/** Where the ordering puts each stage: things needing a decision first. */
const STAGE_RANK = { requested: 0, approved: 1, active: 2, suspended: 3, refused: 4, closed: 5 };

const lower = (v) => String(v || "").toLowerCase();

/**
 * Which step a student row is on.
 *
 * A deleted row is a closed account rather than an absent one: the
 * person did exist, and a list that simply omits them cannot answer
 * "what happened to Anna?".
 */
function stageOfStudent(row) {
  if (row.deleted_at) return "closed";
  if (row.status === "suspended") return "suspended";
  if (row.status === "active") return "active";
  // pending or invited: the account exists but has never been used.
  return "approved";
}

function stageOfRequest(row) {
  if (row.status === "denied") return "refused";
  if (row.status === "approved") return "approved";
  return "requested";
}

/**
 * Everybody, newest activity first, one row per person.
 *
 * Where somebody appears in both tables the student row wins: it is
 * the later and truer state, and the request that led to it is
 * carried alongside rather than listed again.
 */
async function list({ limit = 500 } = {}) {
  if (!db.isEnabled()) return [];

  try {
    const [students, requests] = await Promise.all([
      db.query(
        `SELECT id, student_ref, name, email, phone, country, status,
                origin, created_at, last_login_at, deleted_at
           FROM students
          ORDER BY created_at DESC
          LIMIT ${Number(limit) || 500}`
      ),
      db.query(
        `SELECT id, name, email, phone, country, purpose, status,
                decision_note, decided_at, used_at, invite_expires_at, created_at
           FROM account_requests
          ORDER BY created_at DESC
          LIMIT ${Number(limit) || 500}`
      ),
    ]);

    const byEmail = new Map();

    for (const s of students) {
      byEmail.set(lower(s.email), {
        kind: "student",
        stage: stageOfStudent(s),
        studentId: s.id,
        requestId: null,
        ref: s.student_ref,
        name: s.name,
        email: s.email,
        phone: s.phone,
        country: s.country,
        purpose: null,
        origin: s.origin,
        requestedAt: null,
        decidedAt: null,
        createdAt: s.created_at,
        lastLoginAt: s.last_login_at,
        // A closed account's email is a tombstone, so the row is
        // labelled rather than pretending to be reachable.
        reachable: !s.deleted_at,
      });
    }

    for (const r of requests) {
      const key = lower(r.email);
      const existing = byEmail.get(key);

      if (existing) {
        // The request that led to this account. Kept for its purpose
        // and its dates, which the students table does not hold.
        existing.requestId = r.id;
        existing.purpose = existing.purpose || r.purpose;
        existing.requestedAt = r.created_at;
        existing.decidedAt = r.decided_at;
        continue;
      }

      byEmail.set(key, {
        kind: "request",
        stage: stageOfRequest(r),
        studentId: null,
        requestId: r.id,
        ref: null,
        name: r.name,
        email: r.email,
        phone: r.phone,
        country: r.country,
        purpose: r.purpose,
        origin: "self",
        requestedAt: r.created_at,
        decidedAt: r.decided_at,
        createdAt: r.created_at,
        lastLoginAt: null,
        reachable: true,
        note: r.decision_note,
        inviteExpiresAt: r.invite_expires_at,
      });
    }

    return [...byEmail.values()].sort((a, b) => {
      const byStage = (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9);
      if (byStage) return byStage;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  } catch (e) {
    console.error("People could not be listed:", e.message);
    return [];
  }
}

/** How many at each step, for the tiles and the filter chips. */
function counts(people = []) {
  const out = { total: people.length };
  for (const s of STAGES) out[s.key] = 0;
  for (const p of people) out[p.stage] = (out[p.stage] || 0) + 1;
  // "Students" means people who can actually sign in — the number the
  // dashboard should show, not the row count of the table.
  out.students = out.active;
  return out;
}

module.exports = { STAGES, STAGE_LABEL, STAGE_TONE, list, counts, stageOfStudent, stageOfRequest };
