// ─────────────────────────────────────────────────────────────────────
//  Enquiries: validate, store, list.
//
//  Storage order matters. The enquiry is written FIRST (to MySQL, or to
//  a newline-delimited JSON file if MySQL is unreachable) and only then
//  emailed. An enquiry is a sales lead — losing one to a mail server
//  hiccup, the way the old site could, is the failure mode to design out.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const db = require("./db");
const { formatDate } = require("./text");

const FALLBACK_FILE = path.join(__dirname, "..", "data", "enquiries.ndjson");

const LIMITS = { name: 120, email: 180, phone: 40, country: 80, course: 120, message: 4000 };

/**
 * Check a submitted enquiry.
 * Returns { ok, value, errors } — `value` is trimmed and length-capped.
 */
function validate(input = {}, opts = {}) {
  const errors = {};
  const caps = { ...LIMITS };
  // The placement test submits a full transcript through this same path.
  if (opts.messageMax) caps.message = opts.messageMax;
  const str = (key) => String(input[key] == null ? "" : input[key]).trim().slice(0, caps[key] || 200);

  const value = {
    name: str("name"),
    email: str("email"),
    phone: str("phone"),
    country: str("country"),
    course: str("course"),
    message: str("message"),
    lang: input.lang === "de" ? "de" : "en",
    sourcePage: String(input.sourcePage || "").slice(0, 255),
  };

  if (!value.name) errors.name = "required";
  if (!value.email) errors.email = "required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) errors.email = "invalid";
  if (!value.message) errors.message = "required";
  if (!input.consent) errors.consent = "required";

  return { ok: Object.keys(errors).length === 0, value, errors };
}

/**
 * Superseded by lib/spam.js, which scores several signals rather than
 * this one. Kept because it is cheap and catches the laziest bots before
 * anything else runs.
 */
const looksLikeSpam = (input = {}) => Boolean(String(input.website || "").trim());

async function saveToDisk(enquiry) {
  fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
  const line = JSON.stringify({ ...enquiry, created_at: new Date().toISOString() }) + "\n";
  await fs.promises.appendFile(FALLBACK_FILE, line, "utf8");
}

function readFromDisk() {
  try {
    return fs
      .readFileSync(FALLBACK_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        const r = JSON.parse(line);
        return {
          id: `file-${i}`,
          name: r.name,
          email: r.email,
          phone: r.phone,
          country: r.country,
          course_slug: r.course,
          message: r.message,
          lang: r.lang,
          source_page: r.sourcePage,
          status: "new",
          created_at: r.created_at,
        };
      })
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Persist one enquiry. Returns { stored: "db" | "disk" }.
 * Never throws — a failure to store is downgraded to a disk write.
 */
async function save(enquiry, meta = {}) {
  if (db.isEnabled()) {
    try {
      await db.query(
        `INSERT INTO enquiries
           (name, email, phone, country, course_slug, message, lang, source_page, ip, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        [
          enquiry.name,
          enquiry.email,
          enquiry.phone || null,
          enquiry.country || null,
          enquiry.course || null,
          enquiry.message,
          enquiry.lang,
          enquiry.sourcePage || null,
          meta.ip || null,
          (meta.userAgent || "").slice(0, 255) || null,
        ]
      );
      return { stored: "db" };
    } catch (e) {
      console.error("Enquiry DB write failed, falling back to disk:", e.message);
    }
  }

  await saveToDisk(enquiry);
  return { stored: "disk" };
}

/** One page of enquiries for the admin screen. */
async function list({ status = "", page = 1, perPage = 25 } = {}) {
  const offset = (Math.max(1, page) - 1) * perPage;

  if (db.isEnabled()) {
    try {
      // "All" means all the real ones. Flagged spam is stored so a wrong
      // call can be undone, but it must not sit in the inbox — that would
      // leave the problem exactly where it started. Ask for it by name.
      const where = status ? "WHERE status = ?" : "WHERE status <> 'spam'";
      const args = status ? [status] : [];

      const countRow = await db.queryOne(`SELECT COUNT(*) AS n FROM enquiries ${where}`, args);
      const rows = await db.query(
        `SELECT id, name, email, phone, country, course_slug, message, lang,
                source_page, status, spam_score, spam_reasons, created_at
           FROM enquiries ${where}
          ORDER BY created_at DESC
          LIMIT ${perPage} OFFSET ${offset}`,
        args
      );

      return { rows, total: Number(countRow.n), dbOk: true };
    } catch (e) {
      console.error("Enquiry list failed:", e.message);
    }
  }

  const all = readFromDisk().filter((r) => !status || r.status === status);
  return { rows: all.slice(offset, offset + perPage), total: all.length, dbOk: false };
}

/**
 * How many are sitting in each folder.
 *
 * One grouped query rather than five counts: the admin shows all of them
 * at once, and five round trips to render one row of chips is five
 * chances for the page to be slower than the thing it is describing.
 *
 * Missing keys are filled in as 0. A folder that reads nothing at all is
 * indistinguishable from a folder that is broken, and "Spam" with no
 * number beside it is the one somebody would click to check.
 */
async function counts() {
  const empty = { new: 0, replied: 0, closed: 0, spam: 0 };
  if (!db.isEnabled()) return empty;
  try {
    const rows = await db.query(
      "SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status"
    );
    const out = { ...empty };
    for (const r of rows || []) {
      if (r.status in out) out[r.status] = Number(r.n) || 0;
    }
    return out;
  } catch (e) {
    console.error("Enquiry counts failed:", e.message);
    return empty;
  }
}

/**
 * How many arrived recently.
 *
 * The dashboard could say how many enquiries were waiting and how many
 * there were altogether, and nothing in between — so "are we getting
 * more or fewer than last month" was a question the office could only
 * answer by scrolling. Two windows, because one number is not a trend.
 *
 * Spam is excluded. It arrived, but counting it makes the figure a
 * measure of how much rubbish got through rather than of how many
 * people wrote, and a spam wave would read as a good week.
 */
async function arrivals() {
  const empty = { week: 0, month: 0 };
  if (!db.isEnabled()) return empty;
  try {
    const row = await db.queryOne(
      `SELECT
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))  AS week,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS month
       FROM enquiries
       WHERE status <> 'spam'`
    );
    return { week: Number(row && row.week) || 0, month: Number(row && row.month) || 0 };
  } catch (e) {
    console.error("Enquiry arrivals failed:", e.message);
    return empty;
  }
}

/**
 * Has this address been marked spam before?
 *
 * The block list IS the spam folder. There is no second table and no
 * migration: an address is blocked because somebody looked at something
 * it sent and pressed the button, and it stops being blocked the moment
 * that enquiry is moved back out. One place to look, one place to undo,
 * and nothing to keep in step.
 *
 * Compared case-insensitively and trimmed, because a spammer who
 * capitalises a letter is not a different person.
 *
 * Returns false when the database is unreachable. That is the deliberate
 * direction to fail in — the alternative is a site that starts refusing
 * real enquiries because a query timed out, and a missed spam is an
 * annoyance where a lost student is lost business.
 */
async function isBlocked(email) {
  const addr = String(email == null ? "" : email).trim().toLowerCase();
  if (!addr || !db.isEnabled()) return false;
  try {
    const row = await db.queryOne(
      "SELECT 1 AS hit FROM enquiries WHERE LOWER(TRIM(email)) = ? AND status = 'spam' LIMIT 1",
      [addr]
    );
    return Boolean(row);
  } catch (e) {
    console.error("Enquiry block check failed:", e.message);
    return false;
  }
}

async function setStatus(id, status) {
  if (!["new", "replied", "closed", "spam"].includes(status)) return false;
  if (!db.isEnabled()) return false;
  await db.query("UPDATE enquiries SET status = ? WHERE id = ?", [status, id]);
  return true;
}

/** Decorate rows for display. */
const withLabels = (rows, lang = "en") =>
  rows.map((r) => ({ ...r, createdLabel: formatDate(r.created_at, lang) }));

module.exports = {
  validate, looksLikeSpam, save, list, counts, arrivals, isBlocked, setStatus, withLabels, LIMITS,
};
