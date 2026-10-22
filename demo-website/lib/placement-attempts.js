// One placement attempt per address per day.
//
// Taking the test twice in a row measures memory of the questions
// rather than German, so the second result is worse than the first
// however it looks. And somebody retaking until they get the answer
// they wanted lands in a class they cannot follow.
//
// The row is written when the paper is issued, not when it is
// submitted — otherwise the limit is escaped by simply never pressing
// submit. That does mean a genuine mishap, a dropped connection
// halfway through, burns the day's attempt; the office can clear it,
// which is why resets exist.
//
// Everything degrades open. With no database the test still runs
// unlimited: refusing a prospective student because a table is
// unreachable is much worse than letting somebody sit it twice.

const db = require("./db");

/** How long an attempt blocks the next one. */
const WINDOW_HOURS = 24;

const normalise = (email) => String(email || "").trim().toLowerCase();

/**
 * The most recent attempt still inside the window, or null.
 *
 * Attempts the office has reset are ignored, which is what makes a
 * reset take effect immediately rather than at the end of the day.
 */
async function recentFor(email) {
  if (!db.isEnabled()) return null;
  const clean = normalise(email);
  if (!clean) return null;

  try {
    const rows = await db.query(
      `SELECT id, email, name, track, placement, score, created_at
         FROM placement_attempts
        WHERE email = ?
          AND reset_at IS NULL
          AND created_at > (NOW() - INTERVAL ? HOUR)
        ORDER BY created_at DESC
        LIMIT 1`,
      [clean, WINDOW_HOURS]
    );
    return rows[0] || null;
  } catch (e) {
    // A failed lookup must not block the test.
    console.error("Placement attempt lookup failed:", e.message);
    return null;
  }
}

/** Record that a paper was issued. Returns the row id, or null. */
async function start({ email, name, track, ip }) {
  if (!db.isEnabled()) return null;
  const clean = normalise(email);
  if (!clean) return null;

  try {
    const res = await db.query(
      `INSERT INTO placement_attempts (email, name, track, ip) VALUES (?, ?, ?, ?)`,
      [clean, name || null, track || "", ip || null]
    );
    return res.insertId;
  } catch (e) {
    console.error("Placement attempt not recorded:", e.message);
    return null;
  }
}

/**
 * Fill in the outcome once the paper has been graded.
 *
 * Returns the row id, so the caller can link the student straight to
 * their own result and the office to the review page.
 */
async function finish(email, result, { writing = "", words = 0, lang = "en" } = {}) {
  if (!db.isEnabled()) return null;
  const clean = normalise(email);
  if (!clean) return null;

  try {
    // Only the blocks and the misses. The whole state token would carry
    // the option orderings too, which nobody reads.
    const detail = JSON.stringify({ blocks: result.blocks, wrong: result.wrong || [] });

    await db.query(
      `UPDATE placement_attempts
          SET placement = ?, score = ?, writing = ?, writing_words = ?, detail = ?, lang = ?
        WHERE email = ? AND placement IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [
        result.placement,
        Math.max(0, Math.min(255, Math.round(result.percent || 0))),
        writing || null,
        Math.max(0, Math.min(65535, words)),
        detail.slice(0, 60000),
        lang,
        clean,
      ]
    );

    const row = await db.queryOne(
      "SELECT id FROM placement_attempts WHERE email = ? ORDER BY created_at DESC LIMIT 1",
      [clean]
    );
    return row ? row.id : null;
  } catch (e) {
    console.error("Placement result not recorded:", e.message);
    return null;
  }
}

/** One attempt, with its detail already parsed. */
async function byId(id) {
  if (!db.isEnabled()) return null;
  const row = await db.queryOne("SELECT * FROM placement_attempts WHERE id = ?", [Number(id)]);
  if (!row) return null;
  try {
    row.detailParsed = row.detail ? JSON.parse(row.detail) : { blocks: [], wrong: [] };
  } catch {
    row.detailParsed = { blocks: [], wrong: [] };
  }
  return row;
}

/** Record a teacher's decision. Does not send anything. */
async function confirm(id, finalLevel, note) {
  if (!db.isEnabled()) return false;
  await db.query(
    `UPDATE placement_attempts
        SET final_level = ?, teacher_note = ?, confirmed_at = NOW()
      WHERE id = ?`,
    [finalLevel, note ? String(note).slice(0, 1000) : null, Number(id)]
  );
  return true;
}

/** How many are waiting to be looked at. */
async function pendingCount() {
  if (!db.isEnabled()) return 0;
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM placement_attempts WHERE placement IS NOT NULL AND confirmed_at IS NULL"
  );
  return row ? Number(row.n) : 0;
}

/** Let one address sit the test again before the day is out. */
async function reset(email) {
  if (!db.isEnabled()) return 0;
  const clean = normalise(email);
  if (!clean) return 0;
  const res = await db.query(
    `UPDATE placement_attempts SET reset_at = NOW()
      WHERE email = ? AND reset_at IS NULL`,
    [clean]
  );
  return res.affectedRows || 0;
}

/**
 * Recent attempts, for the admin.
 *
 * Empty rather than an exception on a query error. The review columns
 * below arrive with 09_placement_review.sql, so between a deploy and
 * that migration this select fails — and a back-office page that 500s
 * reads as a broken admin rather than as a migration still to run.
 *
 * Awaited inside the try on purpose: returning the promise would hand
 * the rejection straight past this catch.
 */
async function list(limit = 100) {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT id, email, name, track, placement, score, writing_words,
              final_level, teacher_note, confirmed_at, lang, reset_at, created_at
         FROM placement_attempts
        ORDER BY created_at DESC
        LIMIT ${Number(limit) || 100}`
    );
  } catch (e) {
    console.error("Placement attempts could not be listed:", e.message);
    return [];
  }
}

module.exports = { recentFor, start, finish, byId, confirm, pendingCount, reset, list, WINDOW_HOURS };
