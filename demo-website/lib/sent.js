// ─────────────────────────────────────────────────────────────────────
//  The Sent folder.
//
//  The office could reply to an enquiry and write to a student, and
//  neither left anything behind. The enquiry was marked "replied",
//  which says that A reply happened and nothing about what it said; an
//  email from the compose box left no trace at all. "Did we send Ravi
//  the terms, and when?" had no answer but somebody's memory.
//
//  This is the only copy. The mailbox the mail goes out through is a
//  relay, not an archive.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");

/** Reads must never take a page down; an empty folder is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Sent: ${label} failed:`, e.message);
    return fallback;
  }
}

/** Whether migration 31 has run. Everything below is off until it has. */
const ready = () => db.hasColumn("sent_emails.sent_at");

/* Names are joined with a tab. A filename may contain a comma; it
   cannot contain a tab, because lib/attachments.js strips every control
   character out of a name before the file is attached. */
const SEP = "\t";

/**
 * Write down that a message went out.
 *
 * Never throws and never blocks the send. The email has already left by
 * the time this runs, and failing to file a copy of something that has
 * happened must not be reported to the office as the send having
 * failed — that would have them send it twice.
 */
async function record({ enquiryId = null, to, name = "", subject, body = "", files = [], by = "" } = {}) {
  if (!db.isEnabled() || !ready() || !to) return { ok: false };
  try {
    await db.query(
      `INSERT INTO sent_emails
         (enquiry_id, to_email, to_name, subject, body, attachments, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        enquiryId || null,
        String(to).slice(0, 190),
        String(name || "").slice(0, 190) || null,
        String(subject || "").slice(0, 255),
        String(body || ""),
        files.length ? files.map((f) => f.filename).join(SEP).slice(0, 600) : null,
        String(by || "").slice(0, 190) || null,
      ]
    );
    return { ok: true };
  } catch (e) {
    console.error("Sent: record failed:", e.message);
    return { ok: false };
  }
}

/** One page of what has gone out, newest first. */
async function list({ page = 1, perPage = 25 } = {}) {
  if (!ready()) return { rows: [], total: 0, ready: false };
  const per = Math.min(100, Math.max(1, Math.round(Number(perPage) || 25)));
  const offset = (Math.max(1, Math.round(Number(page) || 1)) - 1) * per;

  const total = await safe("count", async () => {
    const row = await db.queryOne("SELECT COUNT(*) AS n FROM sent_emails");
    return Number(row && row.n) || 0;
  }, 0);

  const rows = await safe("list", () => db.query(
    `SELECT id, enquiry_id, to_email, to_name, subject, body, attachments,
            sent_by, sent_at
       FROM sent_emails
      ORDER BY sent_at DESC, id DESC
      LIMIT ${per} OFFSET ${offset}`), []);

  return {
    rows: (rows || []).map((r) => ({
      ...r,
      // Back to a list, so the page does not have to know how they were
      // stored.
      files: r.attachments ? String(r.attachments).split(SEP).filter(Boolean) : [],
    })),
    total,
    ready: true,
  };
}

/** How many, for the chip. */
async function count() {
  if (!ready()) return 0;
  return safe("count", async () => {
    const row = await db.queryOne("SELECT COUNT(*) AS n FROM sent_emails");
    return Number(row && row.n) || 0;
  }, 0);
}

module.exports = { record, list, count, ready, SEP };
