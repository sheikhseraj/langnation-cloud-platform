// "Fehler melden" — a learner telling us a catalogue question is wrong.
//
// Ten of the picture answers were wrong for weeks, and what found them
// was a person reading the catalogue rather than any test we had. The
// people most likely to spot the next one are the ones working through
// the questions every evening, so this is the shortest path from
// noticing to us hearing about it: a button on the question, a
// sentence, done.
//
// Deliberately small. No account, no name, and the email is optional —
// asking for identification before accepting a bug report is how you
// stop getting bug reports.
//
// The question text is copied into the row rather than looked up when
// the report is read. If we fix the question, the report must still
// say what was wrong, or it reads as nonsense the moment it is acted
// on.

"use strict";

const db = require("./db");

/** What kind of problem. Anything else is filed as "other". */
const KINDS = ["wrong_answer", "typo", "image", "translation", "other"];

const STATUSES = ["open", "done", "dismissed"];

/** How many reports one address may file per hour. */
const PER_HOUR = 12;

const clean = (v, max) =>
  String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Is this a report we can store?
 *
 * Returns an array of problems, empty when it is fine. The message is
 * the only required field: a report with a question id and no sentence
 * tells us a question is wrong but not what is wrong with it, which is
 * a puzzle rather than a report.
 */
function problems(body = {}) {
  const out = [];
  if (!clean(body.questionId, 64)) out.push("questionId");
  const msg = clean(body.message, 2000);
  if (msg.length < 4) out.push("message");
  const email = clean(body.email, 190);
  // Optional — but if it is there it has to be usable, or the reply
  // bounces and the learner thinks they were ignored.
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) out.push("email");
  return out;
}

/**
 * How many reports this address has filed in the last hour.
 *
 * The practice page is public and the form is two fields, which is
 * exactly the shape a bored script likes. This is not a defence
 * against a determined flood — it is a ceiling on an accident.
 */
async function recentCount(ip) {
  if (!db.isEnabled() || !ip) return 0;
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM et_reports " +
    " WHERE ip = ? AND created_at > (NOW() - INTERVAL 1 HOUR)",
    [clean(ip, 64)]
  );
  return row ? Number(row.n) || 0 : 0;
}

/** Store one report. Returns its id. */
async function create(body = {}, ctx = {}) {
  const kind = KINDS.includes(body.kind) ? body.kind : "other";
  const res = await db.query(
    "INSERT INTO et_reports " +
    " (question_id, question_no, question, kind, message, email, lang, ip) " +
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      clean(body.questionId, 64),
      Number.isFinite(Number(body.questionNo)) ? Number(body.questionNo) : null,
      clean(body.question, 1000) || null,
      kind,
      clean(body.message, 2000),
      clean(body.email, 190) || null,
      body.lang === "en" ? "en" : "de",
      clean(ctx.ip, 64) || null,
    ]
  );
  return res && res.insertId ? res.insertId : null;
}

/**
 * The queue, newest first.
 *
 * `sameQuestion` is the number of OTHER reports about the same
 * question, in any state. Three people reporting one question is a
 * far stronger signal than three people reporting three, and without
 * it the two look identical in a list.
 */
async function list(status = "open", limit = 200) {
  if (!db.isEnabled()) return [];
  const want = STATUSES.includes(status) ? status : "open";
  return db.query(
    "SELECT r.*, " +
    "       (SELECT COUNT(*) FROM et_reports o " +
    "         WHERE o.question_id = r.question_id AND o.id <> r.id) AS same_question " +
    "  FROM et_reports r " +
    " WHERE r.status = ? " +
    " ORDER BY r.created_at DESC " +
    " LIMIT " + Math.max(1, Math.min(500, Number(limit) || 200)),
    [want]
  );
}

async function counts() {
  if (!db.isEnabled()) return { open: 0, done: 0, dismissed: 0 };
  const rows = await db.query(
    "SELECT status, COUNT(*) AS n FROM et_reports GROUP BY status"
  );
  const out = { open: 0, done: 0, dismissed: 0 };
  for (const r of rows) if (r.status in out) out[r.status] = Number(r.n) || 0;
  return out;
}

/** How many are waiting — for the dashboard badge. */
async function openCount() {
  return (await counts()).open;
}

async function setStatus(id, status, note) {
  if (!db.isEnabled()) return false;
  if (!STATUSES.includes(status)) return false;
  await db.query(
    "UPDATE et_reports SET status = ?, admin_note = ? WHERE id = ?",
    [status, clean(note, 1000) || null, Number(id)]
  );
  return true;
}

async function byId(id) {
  if (!db.isEnabled()) return null;
  return db.queryOne("SELECT * FROM et_reports WHERE id = ?", [Number(id)]);
}

module.exports = {
  KINDS, STATUSES, PER_HOUR,
  problems, recentCount, create, list, counts, openCount, setStatus, byId,
};
