// ─────────────────────────────────────────────────────────────────────
//  Teacher accounts: invitation, sign-in, sessions.
//
//  Teachers are staff, so they live in `admin_users` alongside the
//  owner and the editors rather than in a second parallel table. The
//  role column says which they are; migration 18 gave the table the
//  columns needed to sign into.
//
//  There is no self-registration here, deliberately. A teacher account
//  is created by the office and claimed from an emailed link — the
//  question "may this person see a class list" is not one a public form
//  gets to answer.
//
//  The pure parts — hashing a link token, validating input, throttling
//  arithmetic — are borrowed from lib/students.js rather than written
//  again. Two copies of auth code is two places for a fix to be applied
//  to only one of them.
//
//  What is NOT borrowed is the session cookie, and that is the one
//  thing in this file worth reading twice. See signSession below.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { env } = require("./env");
const db = require("./db");
const students = require("./students");
const codes = require("./codes");

const COOKIE = "ln_teacher";

// A teaching day is a working day, and a teacher signs in from the same
// laptop every morning. A fortnight matches the student portal.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// Longer than a student's verification link: an invitation goes to
// somebody who has just been hired and may not read that mailbox until
// Monday.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// A reset is the more dangerous of the two if it leaks, and it is asked
// for by somebody sitting at their keyboard right now. An hour, the
// same as the student portal.
const RESET_TTL_MS = 60 * 60 * 1000;

// Matches lib/students.js. See the note there on why 10 and not 12.
const BCRYPT_ROUNDS = 10;

// The dated version of the teacher terms, recorded against an account
// when it is set up.
//
// Stored rather than inferred from the acceptance date: terms get
// amended, and "she accepted the terms" is not an answer unless you can
// say which terms. Bump this when the wording at
// /teacher-terms-and-conditions changes materially — the clauses about
// who owns the materials are the whole reason the record exists.
const TERMS_VERSION = "2026-09-13";
const TERMS_PATH = "/teacher-terms-and-conditions";

const SECRET = env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");

// ── pure: the session cookie ─────────────────────────────────────────

/**
 * Sign a staff session as `staff.id.version.expiry.mac`.
 *
 * The realm word is inside the signed payload, and it is the whole
 * point of this function existing at all.
 *
 * A student session is `id.version.expiry.mac` over the same secret.
 * Without the prefix, a student holding a valid cookie for student 7
 * could paste its value into `ln_teacher` and be admitted as teacher 7
 * — the signature would verify, because it is a genuine signature over
 * a genuine payload. It is just a signature over a payload that meant
 * something else. Naming the realm in the signed bytes is what makes
 * one cookie unusable as the other.
 */
function signSession(teacherId, tokenVersion, expiresAt) {
  const payload = `staff.${teacherId}.${tokenVersion}.${expiresAt}`;
  return `${payload}.${mac(payload)}`;
}

const mac = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 43);

/**
 * Verify a cookie and return `{ id, version }`, or null.
 *
 * Null for every failure, never an exception: a mangled cookie should
 * sign somebody out, not 500 the page they were reading.
 */
function readSession(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 5) return null;
  if (parts[0] !== "staff") return null;

  const [, rawId, rawVersion, rawExpiry, suppliedMac] = parts;
  const payload = `staff.${rawId}.${rawVersion}.${rawExpiry}`;

  const expected = Buffer.from(mac(payload));
  const got = Buffer.from(suppliedMac);
  if (expected.length !== got.length) return null;
  if (!crypto.timingSafeEqual(expected, got)) return null;

  const id = Number(rawId);
  const version = Number(rawVersion);
  const expiresAt = Number(rawExpiry);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(version) || version <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  return { id, version };
}

// ── pure: validation ─────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Roles the office may hand out from the teachers screen. */
const ROLES = ["teacher", "editor", "owner"];

const ROLE_LABEL = {
  teacher: "Teacher",
  editor: "Editor",
  owner: "Owner",
};

/**
 * Check the office's "add a teacher" form.
 *
 * No password field: the office does not choose somebody else's
 * password, because a password a second person knows is not a password.
 */
function validateInvite(body = {}) {
  const values = {
    name: String(body.name || "").trim().slice(0, 120),
    email: students.normaliseEmail(body.email).slice(0, 180),
    phone: String(body.phone || "").trim().slice(0, 40),
    role: ROLES.includes(body.role) ? body.role : "teacher",
  };
  const errors = {};

  if (values.name.length < 2) errors.name = "Please enter their name.";
  if (!EMAIL_RE.test(values.email)) errors.email = "Please enter a valid email address.";

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Honorifics, so a name can be read past them.
 *
 * The office types what it would write on a timetable, and in a German
 * language school that is "Frau Weber" — not a first name and a
 * surname. Splitting that the way the student portal splits a name
 * gives "Hello, Frau", and initials of FW.
 */
const TITLES = new Set(["frau", "herr", "dr", "prof", "mr", "mrs", "ms", "miss", "mx"]);

const bareWord = (w) => String(w || "").toLowerCase().replace(/\.$/, "");

/**
 * The name with any honorific taken off the front.
 *
 * Used for the monogram, so "Frau Weber" initials as W rather than as
 * FW — which is the initials of a courtesy title and a surname, and
 * belongs to nobody.
 */
function bareName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && TITLES.has(bareWord(words[0]))) words.shift();
  return words.join(" ");
}

/**
 * What to put after "Hello,".
 *
 * A first name when there is one. When the name begins with an
 * honorific, the whole thing: "Frau Weber" greeted as "Frau" is
 * nonsense and greeted as "Weber" is rude, and the office cannot be
 * expected to enter a separate first name it never uses.
 */
function greeting(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "there";
  if (TITLES.has(bareWord(words[0]))) return words.join(" ");
  return words[0];
}

/**
 * Check a password somebody is choosing for themselves.
 *
 * The same rule as the student portal: length rather than composition.
 * "One capital and one symbol" produces Password1! on every account in
 * the building.
 */
function validatePassword(password, { name = "", email = "" } = {}) {
  const p = String(password || "");
  if (p.length < 10) return "Use at least 10 characters.";
  if (p.length > 200) return "That is too long.";
  if (students.isTooObvious(p, { name, email })) {
    return "Too easy to guess — please choose something else.";
  }
  return null;
}

// ── database-backed ──────────────────────────────────────────────────

/** The columns every page wants, minus the photo's bytes. */
const PUBLIC_COLUMNS = `
  id, teacher_ref, name, email, phone, role, status, token_version, timezone, bio,
  avatar_type, avatar_updated_at, last_login_at, created_at,
  invite_expires_at, (invite_token_hash IS NOT NULL) AS invite_pending`;

/**
 * Create an account and the one-time link that claims it.
 *
 * The plaintext token is returned to the caller and never stored; only
 * its hash goes in the row, so a leaked table cannot be used to claim
 * anybody's account.
 *
 * An address that already has an account is refused outright, and here
 * that is the right answer rather than the leak it would be on a public
 * form: the only person reading this message is the office, who is
 * entitled to know that they already added Frau Weber last month.
 */
async function invite({ name, email, phone = null, role = "teacher", createdBy = null }) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };

  const clean = students.normaliseEmail(email);
  const existing = await db.queryOne("SELECT id, name FROM admin_users WHERE email = ? LIMIT 1", [clean]);
  if (existing) {
    return { ok: false, reason: `${existing.name} already has an account with that address.` };
  }

  const { token, hash } = students.makeToken();
  const expires = new Date(Date.now() + INVITE_TTL_MS);

  const res = await db.query(
    `INSERT INTO admin_users
       (name, email, phone, role, status, password_hash,
        invite_token_hash, invite_expires_at, active, created_at)
     VALUES (?, ?, ?, ?, 'invited', NULL, ?, ?, 1, NOW())`,
    [String(name).trim(), clean, phone || null, ROLES.includes(role) ? role : "teacher", hash, expires]
  );

  return { ok: true, id: res.insertId, token, expires, email: clean, name };
}

/**
 * Issue a fresh invitation for somebody who never claimed the first.
 *
 * The old token stops working the moment this one is written, because
 * there is one column and it has just been overwritten. That is the
 * behaviour you want: "resend" should not leave two live links to the
 * same account lying in two mailboxes.
 */
async function reinvite(id) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };

  const row = await db.queryOne("SELECT id, name, email, status FROM admin_users WHERE id = ?", [Number(id)]);
  if (!row) return { ok: false, reason: "No such account." };
  if (row.status === "active") return { ok: false, reason: `${row.name} has already set a password.` };

  const { token, hash } = students.makeToken();
  const expires = new Date(Date.now() + INVITE_TTL_MS);
  await db.query(
    `UPDATE admin_users
        SET invite_token_hash = ?, invite_expires_at = ?, status = 'invited'
      WHERE id = ?`,
    [hash, expires, row.id]
  );
  return { ok: true, id: row.id, token, expires, email: row.email, name: row.name };
}

/**
 * The account behind an invitation link, or null.
 *
 * Expiry is checked in SQL rather than in JavaScript so the comparison
 * happens in one clock — the database's — instead of being a race
 * between the server's idea of now and the column's.
 */
async function findInvite(token) {
  if (!db.isEnabled() || !token) return null;
  const hash = students.hashToken(token);
  const row = await db.queryOne(
    `SELECT id, name, email, role
       FROM admin_users
      WHERE invite_token_hash = ?
        AND invite_expires_at > NOW()
        AND status = 'invited'
      LIMIT 1`,
    [hash]
  );
  if (!row) return null;
  return row;
}

/**
 * Claim an invitation by choosing a password.
 *
 * The link is spent in the same statement that sets the password — the
 * WHERE clause still requires the hash — so two browsers racing on the
 * same link cannot both succeed.
 */
async function claimInvite(token, password, { accept = false } = {}) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };

  const invited = await findInvite(token);
  if (!invited) return { ok: false, reason: "expired" };

  // Checked before the password, so somebody who missed the tick box is
  // told about the tick box rather than about their password.
  if (!accept) {
    return {
      ok: false,
      field: "accept",
      reason: "Please accept the teacher terms to set up your account.",
    };
  }

  const problem = validatePassword(password, { name: invited.name, email: invited.email });
  if (problem) return { ok: false, field: "password", reason: problem };

  const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  return db.transaction(async (tx) => {
    // Issued here rather than when the invitation is sent, for the same
    // reason a student's is issued on verification: an invitation
    // nobody claims would otherwise burn a reference and leave a gap in
    // the sequence that looks like a teacher who was deleted.
    const existing = await tx.queryOne(
      "SELECT teacher_ref FROM admin_users WHERE id = ?",
      [invited.id]
    );
    const ref = (existing && existing.teacher_ref) || (await codes.nextTeacherRef(tx));

    const res = await tx.query(
      `UPDATE admin_users
          SET password_hash = ?, status = 'active', active = 1,
              teacher_ref = ?,
              invite_token_hash = NULL, invite_expires_at = NULL,
              failed_logins = 0, locked_until = NULL,
              -- Written in the same statement that creates the account,
              -- so there is no path to an active teacher account with no
              -- record of the terms behind it.
              terms_accepted_at = NOW(), terms_version = ?
        WHERE id = ? AND invite_token_hash = ?`,
      [hash, ref, TERMS_VERSION, invited.id, students.hashToken(token)]
    );
    if (!res.affectedRows) return { ok: false, reason: "expired" };

    const fresh = await tx.queryOne("SELECT token_version FROM admin_users WHERE id = ?", [invited.id]);
    return {
      ok: true,
      teacherId: invited.id,
      teacherRef: ref,
      tokenVersion: Number(fresh ? fresh.token_version : 1),
      name: invited.name,
    };
  });
}

/**
 * Check an email and password.
 *
 * One caller-facing outcome, several reasons. The reason is for the log
 * and for the lockout arithmetic, not for the page: telling somebody
 * "that address has no account" turns the form into a way to ask who
 * works here.
 */
async function authenticate(email, password) {
  const row = await db.queryOne(
    `SELECT id, password_hash, status, token_version, failed_logins, locked_until
       FROM admin_users
      WHERE email = ? LIMIT 1`,
    [students.normaliseEmail(email)]
  );

  if (!row) {
    // Hash anyway, so a missing account does not answer faster than a
    // wrong password and reveal which addresses exist.
    await bcrypt.compare(String(password), "$2a$12$" + "x".repeat(53));
    return { ok: false, reason: "no-account" };
  }

  const lock = students.lockoutState(row);
  if (lock.locked) return { ok: false, reason: "locked", secondsLeft: lock.secondsLeft };

  // An invitation that was never claimed. There is no password to be
  // wrong about yet.
  if (!row.password_hash) return { ok: false, reason: "not-claimed" };

  const good = await bcrypt.compare(String(password), row.password_hash);
  if (!good) {
    const next = students.nextLockout(row.failed_logins);
    await db.query("UPDATE admin_users SET failed_logins = ?, locked_until = ? WHERE id = ?", [
      next.failed,
      next.lockedUntil,
      row.id,
    ]);
    return { ok: false, reason: "bad-password" };
  }

  if (row.status !== "active") return { ok: false, reason: "suspended" };

  await db.query(
    "UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?",
    [row.id]
  );
  return { ok: true, teacherId: row.id, tokenVersion: row.token_version };
}

/** The signed-in member of staff, or null. Runs on every /teach request. */
async function current(req) {
  const session = readSession(req.cookies ? req.cookies[COOKIE] : null);
  if (!session) return null;

  const row = await db.queryOne(
    `SELECT ${PUBLIC_COLUMNS} FROM admin_users WHERE id = ? LIMIT 1`,
    [session.id]
  );
  if (!row) return null;
  // The cookie was signed against an older version: the account has been
  // suspended, or the password changed, since it was issued.
  if (Number(row.token_version) !== session.version) return null;
  if (row.status !== "active") return null;
  return row;
}

/** Every staff account, for the office's list. */
async function list() {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT ${PUBLIC_COLUMNS},
              -- Only the office's list asks for these. Every request
              -- reads PUBLIC_COLUMNS, and there is no reason to carry
              -- a legal record through a session check.
              terms_accepted_at, terms_version,
              (SELECT COUNT(*) FROM intakes i WHERE i.teacher_id = admin_users.id) AS batches
         FROM admin_users
        ORDER BY FIELD(status, 'invited', 'active', 'suspended'), name
        LIMIT 500`
    );
  } catch (e) {
    console.error("Staff accounts could not be listed:", e.message);
    return [];
  }
}

/**
 * Teachers a batch can be assigned to, for the dropdown on the batch form.
 *
 * Invited-but-not-yet-signed-in accounts are included on purpose: a
 * batch is often planned before the new teacher has opened their email,
 * and leaving them out of the list means the batch goes out unassigned
 * and nobody comes back to fix it. Suspended accounts are not — that is
 * the whole point of suspending one.
 */
async function options() {
  if (!db.isEnabled()) return [];
  try {
    return await db.query(
      `SELECT id, name, email, status
         FROM admin_users
        WHERE status IN ('active', 'invited')
        ORDER BY name`
    );
  } catch (e) {
    console.error("Teacher options could not be listed:", e.message);
    return [];
  }
}

/**
 * Suspend or restore an account.
 *
 * Suspending bumps token_version, which is what makes it take effect
 * now rather than whenever the cookie happens to expire. Without that,
 * "suspended" would mean "suspended in a fortnight".
 *
 * `active` is written in step with `status` so the older column never
 * disagrees with the one the code reads.
 */
async function setStatus(id, status) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };
  if (!["active", "suspended"].includes(status)) return { ok: false, reason: "Unknown status." };

  const row = await db.queryOne("SELECT id, name, password_hash FROM admin_users WHERE id = ?", [Number(id)]);
  if (!row) return { ok: false, reason: "No such account." };

  // Restoring somebody who never chose a password puts them back where
  // they were — invited — rather than into an active account with no
  // way to sign into it.
  const next = status === "active" && !row.password_hash ? "invited" : status;

  await db.query(
    `UPDATE admin_users
        SET status = ?, active = ?, token_version = token_version + 1
      WHERE id = ?`,
    [next, next === "suspended" ? 0 : 1, row.id]
  );
  return { ok: true, name: row.name, status: next };
}

/**
 * What a teacher may change about themselves.
 *
 * Name, email and role are not on the list. A teacher's name is printed
 * on the batches they run and, before long, on certificates; the role
 * decides what they can reach. Both are things the office changes, not
 * things a form changes at midnight.
 *
 * The limits match the columns, so an over-long value is trimmed here
 * rather than truncated by MySQL or rejected in strict mode.
 */
const PROFILE_FIELDS = ["phone", "timezone", "bio"];
const PROFILE_LIMITS = { phone: 40, timezone: 64, bio: 400 };

function profileFromBody(body = {}) {
  const row = {};
  for (const key of PROFILE_FIELDS) {
    if (body[key] === undefined) continue;
    const v = String(body[key]).trim();
    row[key] = v === "" ? null : v.slice(0, PROFILE_LIMITS[key]);
  }
  return row;
}

async function updateProfile(id, row) {
  const fields = Object.keys(row).filter((k) => PROFILE_FIELDS.includes(k));
  if (!fields.length) return { ok: true };
  await db.query(
    `UPDATE admin_users SET ${fields.map((f) => `\`${f}\` = ?`).join(", ")} WHERE id = ?`,
    [...fields.map((f) => row[f]), Number(id)]
  );
  return { ok: true };
}

/**
 * Change a password, knowing the current one.
 *
 * Bumps token_version, so changing it signs out every other device.
 * Somebody changing their password because they think it is known is
 * doing it precisely to end whoever else's session.
 */
async function changePassword(id, currentPassword, newPassword) {
  const row = await db.queryOne(
    "SELECT id, name, email, password_hash FROM admin_users WHERE id = ?",
    [Number(id)]
  );
  if (!row || !row.password_hash) {
    return { ok: false, reason: "This account cannot change its password here." };
  }

  const matches = await bcrypt.compare(String(currentPassword || ""), row.password_hash);
  if (!matches) return { ok: false, reason: "That is not your current password." };

  const problem = validatePassword(newPassword, { name: row.name, email: row.email });
  if (problem) return { ok: false, reason: problem };
  if (await bcrypt.compare(String(newPassword), row.password_hash)) {
    return { ok: false, reason: "That is the password you already have." };
  }

  const hash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  await db.query(
    "UPDATE admin_users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
    [hash, row.id]
  );
  const fresh = await db.queryOne("SELECT token_version FROM admin_users WHERE id = ?", [row.id]);
  return { ok: true, tokenVersion: Number(fresh ? fresh.token_version : 0) };
}

// ── Forgotten passwords ──────────────────────────────────────────────
//
// The same three steps as the student side, against the other table.
// Deliberately parallel rather than shared: the two read different
// columns for "may this account be signed into" — a student has
// `deleted_at` and a status of its own, a staff account has an
// invitation that may never have been claimed — and a single function
// taking a table name would hide exactly the check that matters.

/**
 * Start a reset, and return the link token for the caller to email.
 *
 * Says whether an account was found; the caller says nothing either
 * way. On a staff portal that matters more, not less: the answer to
 * "does this address have an account" is the answer to "does this
 * person work here".
 *
 * An account that has never been claimed gets no reset link — there is
 * no password to reset, and the invitation is the way in. A suspended
 * one gets nothing either.
 */
async function requestReset(email) {
  if (!db.isEnabled()) return { found: false };

  const row = await db.queryOne(
    `SELECT id, name, email
       FROM admin_users
      WHERE email = ? AND status = 'active' AND password_hash IS NOT NULL
      LIMIT 1`,
    [students.normaliseEmail(email)]
  );
  if (!row) return { found: false };

  const { token, hash } = students.makeToken();
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await db.query(
    "UPDATE admin_users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?",
    [hash, expires, row.id]
  );

  return { found: true, token, expires, name: row.name, email: row.email };
}

/** The account behind a reset link, or null. Expiry is checked in SQL. */
async function findReset(token) {
  if (!db.isEnabled() || !token) return null;
  return db.queryOne(
    `SELECT id, name, email
       FROM admin_users
      WHERE reset_token_hash = ?
        AND reset_expires_at > NOW()
        AND status = 'active'
      LIMIT 1`,
    [students.hashToken(token)]
  );
}

/**
 * Spend a reset link and set the new password.
 *
 * Bumps token_version, which ends every other session on the account.
 * A teacher resetting a password they think somebody else has is doing
 * it to end that person's access to their class lists; a reset that
 * left them signed in would be theatre.
 */
async function resetPassword(token, newPassword) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };

  const row = await findReset(token);
  if (!row) return { ok: false, reason: "expired" };

  const problem = validatePassword(newPassword, { name: row.name, email: row.email });
  if (problem) return { ok: false, reason: problem };

  const hash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  const res = await db.query(
    `UPDATE admin_users
        SET password_hash = ?,
            reset_token_hash = NULL, reset_expires_at = NULL,
            failed_logins = 0, locked_until = NULL,
            token_version = token_version + 1
      WHERE id = ? AND reset_token_hash = ?`,
    [hash, row.id, students.hashToken(token)]
  );
  if (!res.affectedRows) return { ok: false, reason: "expired" };

  const fresh = await db.queryOne("SELECT token_version FROM admin_users WHERE id = ?", [row.id]);
  return {
    ok: true,
    teacherId: row.id,
    name: row.name,
    email: row.email,
    tokenVersion: Number(fresh ? fresh.token_version : 1),
  };
}

async function setAvatar(id, buffer, type) {
  await db.query(
    "UPDATE admin_users SET avatar = ?, avatar_type = ?, avatar_updated_at = NOW() WHERE id = ?",
    [buffer, type, Number(id)]
  );
  return { ok: true };
}

async function clearAvatar(id) {
  await db.query(
    "UPDATE admin_users SET avatar = NULL, avatar_type = NULL, avatar_updated_at = NULL WHERE id = ?",
    [Number(id)]
  );
  return { ok: true };
}

async function avatarFor(id) {
  const row = await db.queryOne(
    "SELECT avatar, avatar_type, avatar_updated_at FROM admin_users WHERE id = ?",
    [Number(id)]
  );
  if (!row || !row.avatar || !row.avatar_type) return null;
  return { buffer: row.avatar, type: row.avatar_type, updatedAt: row.avatar_updated_at };
}

module.exports = {
  COOKIE,
  MAX_AGE_MS,
  INVITE_TTL_MS,
  RESET_TTL_MS,
  TERMS_VERSION,
  TERMS_PATH,
  ROLES,
  ROLE_LABEL,
  PROFILE_FIELDS,
  // pure, and unit-tested without a database
  signSession,
  readSession,
  validateInvite,
  validatePassword,
  bareName,
  greeting,
  profileFromBody,
  // database-backed
  invite,
  reinvite,
  findInvite,
  claimInvite,
  authenticate,
  current,
  list,
  options,
  setStatus,
  updateProfile,
  changePassword,
  requestReset,
  findReset,
  resetPassword,
  setAvatar,
  clearAvatar,
  avatarFor,
};
