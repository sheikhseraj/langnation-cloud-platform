// ─────────────────────────────────────────────────────────────────────
//  Student accounts: registration, verification, login, sessions.
//
//  The security-critical parts of this file are deliberately pure
//  functions with no database in them — token hashing, cookie signing,
//  input validation, throttling arithmetic. That is what makes them
//  testable (tools/check-students.js runs them with no MySQL at all), and
//  auth code that cannot be tested is auth code nobody trusts.
//
//  Sessions are signed cookies rather than rows in a table, the same
//  approach as /admin. The one thing that normally costs you — being
//  unable to cancel a session before it expires — is solved by carrying
//  the student's `token_version` inside the cookie and comparing it on
//  every request. Bump the column and every device is signed out.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { env } = require("./env");
const db = require("./db");
const codes = require("./codes");

const COOKIE = "ln_student";

// Sessions last a fortnight. Long enough that a student checking their
// timetable weekly is not made to log in every time, short enough that an
// abandoned laptop stops being a way in.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// Invite and verification links are short-lived; a password reset shorter
// still, because it is the more dangerous of the two if it leaks.
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// Login throttling. Five wrong guesses buys a fifteen-minute lockout,
// which makes online guessing useless without locking out a real person
// who mistyped twice.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// bcrypt cost.
//
// Measured on this project's bcryptjs — which is pure JavaScript, so far
// slower than the native module — one comparison costs roughly:
//     cost 10  288 ms      cost 11  514 ms      cost 12  1327 ms
//
// Every one of those milliseconds blocks the event loop, because bcryptjs
// is synchronous work however it is awaited. At cost 12 a handful of
// simultaneous logins would stall the whole site, which makes the login
// form a denial-of-service lever rather than a hardened one. 10 is the
// usual default, keeps a guess expensive, and stays under the throttle
// (5 attempts) that is doing the real work of stopping guessing.
//
// Raise this if the native `bcrypt` module is ever installed: it is
// roughly an order of magnitude faster, and 12 becomes affordable.
const BCRYPT_ROUNDS = 10;

const SECRET = env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");

// ── pure: tokens ─────────────────────────────────────────────────────

/**
 * A one-time link token, and the hash to store for it.
 *
 * Only the hash goes in the database. A leaked table then cannot be used
 * to claim accounts, which is the whole point — the plaintext exists only
 * in the email that was sent.
 *
 * SHA-256 rather than bcrypt here on purpose: the token is 32 random bytes,
 * so there is nothing to brute-force, and these are verified on a page load
 * where a deliberately slow hash would just be a slow page.
 */
function makeToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

/** Constant-time comparison, so a token cannot be recovered by timing. */
function tokenMatches(supplied, storedHash) {
  if (!supplied || !storedHash) return false;
  const a = Buffer.from(hashToken(supplied));
  const b = Buffer.from(String(storedHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── pure: session cookie ─────────────────────────────────────────────

/**
 * Sign a session as `id.version.expiry.mac`.
 *
 * The version is inside the signed payload rather than looked up as a
 * side-channel, so a tampered cookie fails the signature instead of
 * silently granting a stale session.
 */
function signSession(studentId, tokenVersion, expiresAt) {
  const payload = `${studentId}.${tokenVersion}.${expiresAt}`;
  return `${payload}.${mac(payload)}`;
}

const mac = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 43);

/**
 * Verify a cookie and return `{ id, version }`, or null.
 *
 * Returns null rather than throwing for every failure mode, so a malformed
 * cookie logs somebody out instead of 500ing the page.
 */
function readSession(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const [rawId, rawVersion, rawExpiry, suppliedMac] = parts;
  const payload = `${rawId}.${rawVersion}.${rawExpiry}`;

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

// Deliberately permissive. The only claim this makes is "there is one @
// with something either side and no spaces" — anything stricter rejects
// addresses that genuinely work, and the verification email is what
// actually proves the address exists.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normaliseEmail = (raw) => String(raw || "").trim().toLowerCase();

/**
 * Check a registration form.
 *
 * Returns `{ ok, values, errors }` with errors keyed by field, so a
 * template can put each message next to its own input rather than
 * dumping one message at the top.
 */
function validateRegistration(body) {
  const values = {
    name: String(body.name || "").trim().slice(0, 120),
    email: normaliseEmail(body.email).slice(0, 180),
    phone: String(body.phone || "").trim().slice(0, 40),
    country: String(body.country || "").trim().slice(0, 80),
  };
  const password = String(body.password || "");
  const errors = {};

  if (values.name.length < 2) errors.name = "Please enter your name.";
  if (!EMAIL_RE.test(values.email)) errors.email = "Please enter a valid email address.";

  // Length over composition rules. "At least one capital and one symbol"
  // pushes people to Password1! — a long passphrase is stronger and easier
  // to remember.
  if (password.length < 10) errors.password = "Use at least 10 characters.";
  else if (password.length > 200) errors.password = "That is too long.";
  else if (isTooObvious(password, values)) {
    errors.password = "Too easy to guess — please choose something else.";
  }

  if (!body.accept) errors.accept = "Please accept the terms to continue.";

  return { ok: Object.keys(errors).length === 0, values, errors, password };
}

// A short deny-list, plus a check that the password is not simply the
// person's own name or email. Both are what people actually pick.
const OBVIOUS = new Set([
  "password", "password1", "passwort", "langnation", "12345678", "123456789",
  "1234567890", "qwertyuiop", "letmein123", "iloveyou1", "welcome123",
  "deutschland", "germany123", "abcd123456",
]);

function isTooObvious(password, { name, email }) {
  const p = password.toLowerCase();
  if (OBVIOUS.has(p)) return true;
  const local = String(email || "").split("@")[0];
  if (local && local.length >= 4 && p.includes(local.toLowerCase())) return true;
  const first = String(name || "").trim().split(/\s+/)[0];
  if (first && first.length >= 4 && p.includes(first.toLowerCase())) return true;
  return false;
}

/** Is this account locked out right now, and for how much longer? */
function lockoutState(row, now = Date.now()) {
  const until = row && row.locked_until ? new Date(row.locked_until).getTime() : 0;
  if (!until || until <= now) return { locked: false, secondsLeft: 0 };
  return { locked: true, secondsLeft: Math.ceil((until - now) / 1000) };
}

/** What the failure counter and lock should become after a wrong password. */
function nextLockout(failedSoFar, now = Date.now()) {
  const failed = Number(failedSoFar || 0) + 1;
  return {
    failed,
    lockedUntil: failed >= MAX_ATTEMPTS ? new Date(now + LOCKOUT_MS) : null,
  };
}

/**
 * A student reference like LN-2026-0007.
 *
 * Issued on verification rather than at sign-up, so abandoned
 * registrations do not consume numbers and leave gaps that look like
 * deleted students.
 */
// Kept as a re-export so callers and tests have one name for it. The
// format itself lives in lib/codes.js, alongside the batch code, so
// the two cannot drift apart.
const formatStudentRef = codes.formatStudentRef;

// ── database-backed ──────────────────────────────────────────────────

/**
 * Register a self-service account.
 *
 * Always reports success to the caller, even when the email is already
 * taken. Saying "that address is already registered" turns the public form
 * into a way to ask whether a given person studies here, and the school is
 * in Germany where that is personal data. The existing account is sent a
 * "someone tried to register" note instead, which is what tells a real
 * owner something happened.
 */
async function register({ name, email, password, phone, country, lang = "en" }) {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { token, hash: tokenHash } = makeToken();
  const expires = new Date(Date.now() + VERIFY_TTL_MS);

  const existing = await db.queryOne(
    "SELECT id, status FROM students WHERE email = ? LIMIT 1",
    [email]
  );

  if (existing) {
    // Never overwrite a live account. A pending one may legitimately be
    // retrying, so it gets a fresh token and password.
    if (existing.status === "pending") {
      await db.query(
        `UPDATE students
            SET name = ?, password_hash = ?, phone = ?, country = ?,
                preferred_lang = ?, invite_token_hash = ?, invite_expires_at = ?
          WHERE id = ?`,
        [name, hash, phone || null, country || null, lang, tokenHash, expires, existing.id]
      );
      return { created: false, resent: true, studentId: existing.id, token };
    }
    return { created: false, resent: false, studentId: existing.id, token: null };
  }

  const result = await db.query(
    `INSERT INTO students
       (name, email, password_hash, phone, country, preferred_lang,
        status, origin, invite_token_hash, invite_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'self', ?, ?)`,
    [name, email, hash, phone || null, country || null, lang, tokenHash, expires]
  );
  return { created: true, resent: false, studentId: result.insertId, token };
}

/**
 * Complete a registration or claim a staff invite.
 *
 * Both arrive as the same kind of link, so both land here. Issuing the
 * student reference and clearing the token happen in one transaction: the
 * reference comes from a counter, and a half-applied verification would
 * either burn a number or leave a reusable link.
 */
async function verify(token, { newPassword = null } = {}) {
  const tokenHash = hashToken(token);

  return db.transaction(async (tx) => {
    const row = await tx.queryOne(
      `SELECT id, status, student_ref, invite_token_hash, invite_expires_at
         FROM students
        WHERE invite_token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    if (!row) return { ok: false, reason: "unknown" };
    if (!tokenMatches(token, row.invite_token_hash)) return { ok: false, reason: "unknown" };
    if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (row.status === "suspended") return { ok: false, reason: "suspended" };

    // A staff invite has no password yet, so one must be supplied here.
    let passwordSql = "";
    const params = [];
    if (newPassword) {
      passwordSql = ", password_hash = ?";
      params.push(await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
    }

    // One sequence for all time, not one per year: the reference
    // follows a person for as long as they study here, so restarting
    // it every January would eventually give two people the same one.
    let ref = row.student_ref;
    if (!ref) ref = await codes.nextStudentRef(tx);

    await tx.query(
      `UPDATE students
          SET status = 'active', email_verified_at = NOW(), student_ref = ?,
              invite_token_hash = NULL, invite_expires_at = NULL,
              failed_logins = 0, locked_until = NULL${passwordSql}
        WHERE id = ?`,
      [ref, ...params, row.id]
    );

    return { ok: true, studentId: row.id, studentRef: ref };
  });
}

/**
 * Check an email and password.
 *
 * The same "no" is returned for an unknown address, a wrong password and
 * an unverified account, so the form cannot be used to enumerate who has
 * an account. The specific reason is returned separately for the log, not
 * for the page.
 */
async function authenticate(email, password) {
  const row = await db.queryOne(
    `SELECT id, password_hash, status, token_version, failed_logins, locked_until
       FROM students
      WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
    [email]
  );

  if (!row) {
    // Hash anyway, so a missing account does not answer faster than a
    // wrong password and reveal which addresses exist.
    await bcrypt.compare(password, "$2a$12$" + "x".repeat(53));
    return { ok: false, reason: "no-account" };
  }

  const lock = lockoutState(row);
  if (lock.locked) return { ok: false, reason: "locked", secondsLeft: lock.secondsLeft };

  if (!row.password_hash) return { ok: false, reason: "not-set" };

  const good = await bcrypt.compare(password, row.password_hash);
  if (!good) {
    const next = nextLockout(row.failed_logins);
    await db.query("UPDATE students SET failed_logins = ?, locked_until = ? WHERE id = ?", [
      next.failed,
      next.lockedUntil,
      row.id,
    ]);
    return { ok: false, reason: "bad-password" };
  }

  if (row.status === "pending") return { ok: false, reason: "unverified" };
  if (row.status === "suspended") return { ok: false, reason: "suspended" };

  await db.query(
    "UPDATE students SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?",
    [row.id]
  );
  return { ok: true, studentId: row.id, tokenVersion: row.token_version };
}

/** The signed-in student, or null. Called on every portal request. */
async function current(req) {
  const session = readSession(req.cookies ? req.cookies[COOKIE] : null);
  if (!session) return null;

  const row = await db.queryOne(
    `SELECT id, student_ref, name, email, status, token_version, preferred_lang
       FROM students
      WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [session.id]
  );
  if (!row) return null;
  // The cookie was signed for an older version: staff have suspended the
  // account or forced a sign-out since.
  if (Number(row.token_version) !== session.version) return null;
  if (row.status !== "active") return null;
  return row;
}


/**
 * Create a student from an approved invitation.
 *
 * Active from the start, with no verification step: the address was
 * already proved when they opened the emailed link, and a human approved
 * them before that. A second confirmation would add nothing.
 *
 * The name and email come from the approved request rather than the
 * form, so an intercepted link cannot be used to create an account for
 * someone else.
 */
async function createFromInvite({ name, email, phone, country, password }) {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const clean = normaliseEmail(email);

  const existing = await db.queryOne("SELECT id FROM students WHERE email = ? LIMIT 1", [clean]);
  if (existing) return { ok: false, reason: "An account with this address already exists." };

  // The reference is allocated here, in the same transaction as the
  // row. This path had none at all: it was written only into the
  // email-verification flow, and once approval-by-invite became the
  // only way to get an account, every new student was created without
  // one — and the reference goes on their invoices and certificates.
  return db.transaction(async (tx) => {
    const ref = await codes.nextStudentRef(tx);

    const res = await tx.query(
      `INSERT INTO students
         (name, email, password_hash, phone, country, preferred_lang,
          status, origin, email_verified_at, student_ref)
       VALUES (?, ?, ?, ?, ?, 'en', 'active', 'invited', NOW(), ?)`,
      [name, clean, hash, phone || null, country || null, ref]
    );

    const row = await tx.queryOne("SELECT token_version FROM students WHERE id = ?", [res.insertId]);
    return {
      ok: true,
      studentId: res.insertId,
      studentRef: ref,
      tokenVersion: Number(row ? row.token_version : 0),
    };
  });
}

// ── What a student may change about themselves ──────────────────────
//
// A short list on purpose. Name, email and student_ref are not on it:
// they appear on certificates and invoices, so changing one is a thing
// the office does, not a thing a form does at midnight.

const PROFILE_FIELDS = ["phone", "city", "country", "address", "date_of_birth", "gender", "timezone"];

/** Trim, empty becomes NULL, and a bad date is dropped rather than stored. */
function profileFromBody(body = {}) {
  const row = {};
  for (const f of PROFILE_FIELDS) {
    if (!(f in body)) continue;
    const v = String(body[f] == null ? "" : body[f]).trim();
    row[f] = v === "" ? null : v;
  }
  if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) {
    row.date_of_birth = null;
  }
  return row;
}

async function updateProfile(studentId, row) {
  const cols = Object.keys(row).filter((c) => PROFILE_FIELDS.includes(c));
  if (!cols.length) return false;
  await db.query(
    `UPDATE students SET ${cols.map((c) => "`" + c + "` = ?").join(", ")} WHERE id = ?`,
    [...cols.map((c) => row[c]), Number(studentId)]
  );
  return true;
}

async function setAvatar(studentId, buffer, type) {
  await db.query(
    "UPDATE students SET avatar = ?, avatar_type = ?, avatar_updated_at = NOW() WHERE id = ?",
    [buffer, type, Number(studentId)]
  );
}

async function clearAvatar(studentId) {
  await db.query(
    "UPDATE students SET avatar = NULL, avatar_type = NULL, avatar_updated_at = NULL WHERE id = ?",
    [Number(studentId)]
  );
}

/** The photo bytes, or null. Only ever called with the signed-in id. */
async function avatarFor(studentId) {
  const row = await db.queryOne(
    "SELECT avatar, avatar_type, avatar_updated_at FROM students WHERE id = ? AND deleted_at IS NULL",
    [Number(studentId)]
  );
  if (!row || !row.avatar || !row.avatar_type) return null;
  return { buffer: row.avatar, type: row.avatar_type, updatedAt: row.avatar_updated_at };
}

/**
 * Change a password, current one required.
 *
 * token_version is bumped, which invalidates every session signed
 * before now — including this one, so the caller signs them back in.
 * Somebody changing their password after a scare expects exactly that:
 * whoever else was in is now out.
 */
async function changePassword(studentId, currentPassword, newPassword) {
  const row = await db.queryOne(
    "SELECT id, name, email, password_hash FROM students WHERE id = ? AND deleted_at IS NULL",
    [Number(studentId)]
  );
  if (!row || !row.password_hash) return { ok: false, reason: "This account cannot change its password here." };

  const matches = await bcrypt.compare(String(currentPassword || ""), row.password_hash);
  if (!matches) return { ok: false, reason: "That is not your current password." };

  const problems = [];
  const next = String(newPassword || "");
  if (next.length < 10) problems.push("Use at least 10 characters.");
  if (isTooObvious(next, { name: row.name, email: row.email })) {
    problems.push("That password is too easy to guess — avoid your own name or address.");
  }
  if (await bcrypt.compare(next, row.password_hash)) {
    problems.push("That is the password you already have.");
  }
  if (problems.length) return { ok: false, reason: problems.join(" ") };

  const hash = await bcrypt.hash(next, BCRYPT_ROUNDS);
  await db.query(
    "UPDATE students SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
    [hash, Number(studentId)]
  );

  const fresh = await db.queryOne("SELECT token_version FROM students WHERE id = ?", [Number(studentId)]);
  return { ok: true, tokenVersion: Number(fresh ? fresh.token_version : 0) };
}


/**
 * Suspend an account, or let it back in.
 *
 * ── What this is for ────────────────────────────────────────────────
 *
 * Somebody whose fees are not settled should stop having access until
 * they are, and should get everything back the moment they pay. Not
 * "everything except", and not "everything if we remember what it
 * was" — the same homework, the same scores, the same place in the
 * class.
 *
 * ── So it deletes nothing ───────────────────────────────────────────
 *
 * Two fields change: the status, and the token version. Nothing else
 * is touched. Attempts, answers, unlock lists, enrolments and
 * certificates all stay exactly as they are, which is what makes
 * coming back free: `active` restores the account and everything that
 * was already true about it is still true.
 *
 * That is the whole difference from remove(), which anonymises the
 * person and cannot be undone. Suspending is a door; removing is a
 * shredder, and the two should never be one button with a dropdown.
 *
 * The token version is bumped so they are signed out everywhere at
 * once. Without it somebody suspended on Monday keeps a valid cookie
 * until it expires and carries on as though nothing happened.
 */
async function setStatus(id, next) {
  if (!db.isEnabled()) return { ok: false, reason: "The database is not configured." };
  if (!["active", "suspended"].includes(next)) {
    return { ok: false, reason: "Unknown status." };
  }

  const row = await db.queryOne(
    "SELECT id, name, status, deleted_at FROM students WHERE id = ? LIMIT 1",
    [Number(id) || 0]
  );
  if (!row) return { ok: false, reason: "No such account." };

  /* A closed account is not a suspended one and must not be reopened
     by this. remove() has already thrown the address and the password
     away; letting it back in would produce an account nobody can sign
     in to and whose owner cannot be contacted. */
  if (row.deleted_at) {
    return { ok: false, reason: `${row.name}'s account was closed, and closing cannot be undone.` };
  }
  if (row.status === next) {
    return { ok: true, name: row.name, status: next, already: true };
  }

  await db.query(
    `UPDATE students
        SET status = ?, token_version = token_version + 1
      WHERE id = ?`,
    [next, row.id]
  );

  return { ok: true, name: row.name, status: next, already: false };
}

/**
 * Close an account at the student's own request.
 *
 * Soft-deleted and scrubbed, not dropped. Two things are true at once
 * and both have to be honoured:
 *
 *   - The GDPR gives a person the right to have their data erased.
 *   - German bookkeeping law requires invoices to be kept for ten
 *     years, and a certificate has to stay verifiable for whoever
 *     the student showed it to.
 *
 * The resolution is that invoices and certificates already carry
 * their own copies of the name they were issued under, so scrubbing
 * this row does not damage them. What goes is everything only the
 * portal used: the password, the photo, the phone number, the
 * address, the date of birth. The email is replaced with a tombstone
 * so it cannot be signed in with and cannot block a future sign-up,
 * and token_version is bumped so every device is signed out at once.
 *
 * The student reference stays. It is the thread between the person
 * and the invoices the school is obliged to keep, and severing it
 * would leave records nobody could ever account for.
 */
// ── Forgotten passwords ──────────────────────────────────────────────
//
// The columns for this have existed since migration 03 and nothing has
// ever written to them, which meant a student who forgot their password
// had to email the office and wait.

/**
 * Start a reset, and return the link token for the caller to email.
 *
 * Tells the caller whether an account was found, and the caller tells
 * the person nothing either way. "No account with that address" turns
 * this form into a way to ask whether a given person studies here, and
 * the school is in Germany where that is personal data.
 *
 * A suspended or closed account gets no link. Resetting a password is
 * not a way back in through a door somebody shut on purpose.
 *
 * Any previous reset token is overwritten, so asking twice leaves one
 * live link rather than two.
 */
async function requestReset(email) {
  if (!db.isEnabled()) return { found: false };

  const clean = normaliseEmail(email);
  const row = await db.queryOne(
    `SELECT id, name, email, status
       FROM students
      WHERE email = ? AND deleted_at IS NULL AND status = 'active'
      LIMIT 1`,
    [clean]
  );
  if (!row) return { found: false };

  const { token, hash } = makeToken();
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await db.query(
    "UPDATE students SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?",
    [hash, expires, row.id]
  );

  return { found: true, token, expires, name: row.name, email: row.email };
}

/**
 * The account behind a reset link, or null.
 *
 * Expiry is compared in SQL so the check happens on one clock — the
 * database's — rather than racing the server's idea of now against the
 * column.
 */
async function findReset(token) {
  if (!db.isEnabled() || !token) return null;
  return db.queryOne(
    `SELECT id, name, email
       FROM students
      WHERE reset_token_hash = ?
        AND reset_expires_at > NOW()
        AND deleted_at IS NULL
        AND status = 'active'
      LIMIT 1`,
    [hashToken(token)]
  );
}

/**
 * Spend a reset link and set the new password.
 *
 * `token_version` is bumped, which signs the account out of every other
 * device. That is the point rather than a side effect: somebody
 * resetting a password they think another person knows is doing it
 * precisely to end whoever else's session, and a reset that left the
 * intruder logged in would be theatre.
 *
 * The token is cleared in the same statement that still requires it, so
 * two browsers racing on the same link cannot both succeed.
 */
async function resetPassword(token, newPassword) {
  if (!db.isEnabled()) return { ok: false, reason: "The portal is unavailable right now." };

  const row = await findReset(token);
  if (!row) return { ok: false, reason: "expired" };

  const problems = [];
  const next = String(newPassword || "");
  if (next.length < 10) problems.push("Use at least 10 characters.");
  else if (next.length > 200) problems.push("That is too long.");
  else if (isTooObvious(next, { name: row.name, email: row.email })) {
    problems.push("That password is too easy to guess — avoid your own name or address.");
  }
  if (problems.length) return { ok: false, reason: problems.join(" ") };

  const hash = await bcrypt.hash(next, BCRYPT_ROUNDS);
  const res = await db.query(
    `UPDATE students
        SET password_hash = ?,
            reset_token_hash = NULL, reset_expires_at = NULL,
            failed_logins = 0, locked_until = NULL,
            token_version = token_version + 1
      WHERE id = ? AND reset_token_hash = ?`,
    [hash, row.id, hashToken(token)]
  );
  if (!res.affectedRows) return { ok: false, reason: "expired" };

  const fresh = await db.queryOne("SELECT token_version FROM students WHERE id = ?", [row.id]);
  return {
    ok: true,
    studentId: row.id,
    name: row.name,
    email: row.email,
    tokenVersion: Number(fresh ? fresh.token_version : 1),
  };
}

async function closeAccount(studentId, { ip = null } = {}) {
  if (!db.isEnabled()) return { ok: false, reason: "The portal is unavailable right now." };

  const id = Number(studentId);
  const row = await db.queryOne(
    "SELECT id, student_ref, email FROM students WHERE id = ? AND deleted_at IS NULL",
    [id]
  );
  if (!row) return { ok: false, reason: "That account is already closed." };

  const kept = await db.queryOne(
    `SELECT
       (SELECT COUNT(*) FROM invoices WHERE student_id = ? AND status <> 'draft') AS invoices,
       (SELECT COUNT(*) FROM certificates WHERE student_id = ?) AS certificates`,
    [id, id]
  );

  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE students
          SET deleted_at = NOW(),
              status = 'suspended',
              token_version = token_version + 1,
              password_hash = NULL,
              avatar = NULL, avatar_type = NULL, avatar_updated_at = NULL,
              phone = NULL, address = NULL, city = NULL,
              ${['invoice_recipient','invoice_company','invoice_address'].every(c=>db.hasColumn('students.'+c))?"invoice_recipient = 'student', invoice_company = NULL, invoice_address = NULL,":''}
              ${['invoice_personal_address','invoice_company_address'].every(c=>db.hasColumn('students.'+c))?"invoice_personal_address = NULL, invoice_company_address = NULL,":''}
              date_of_birth = NULL, gender = NULL, timezone = NULL,
              notes = NULL,
              invite_token_hash = NULL, invite_expires_at = NULL,
              reset_token_hash = NULL, reset_expires_at = NULL,
              email = CONCAT('deleted-', id, '@removed.invalid')
        WHERE id = ?`,
      [id]
    );

    // Recorded because a deletion is exactly the kind of thing the
    // school may later have to show it honoured. The log holds what
    // was done, not what was erased.
    await tx.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, detail, ip)
       VALUES ('student', ?, 'account.close', 'student', ?, ?, ?)`,
      [id, id, JSON.stringify({
        student_ref: row.student_ref,
        invoices_retained: Number(kept ? kept.invoices : 0),
        certificates_retained: Number(kept ? kept.certificates : 0),
      }), ip]
    );
  });

  return {
    ok: true,
    retained: {
      invoices: Number(kept ? kept.invoices : 0),
      certificates: Number(kept ? kept.certificates : 0),
    },
  };
}

module.exports = {
  setStatus,
  COOKIE,
  MAX_AGE_MS,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
  PROFILE_FIELDS,
  // pure, and unit-tested without a database
  makeToken,
  hashToken,
  tokenMatches,
  signSession,
  readSession,
  validateRegistration,
  normaliseEmail,
  isTooObvious,
  lockoutState,
  nextLockout,
  formatStudentRef,
  profileFromBody,
  // database-backed
  register,
  createFromInvite,
  verify,
  authenticate,
  current,
  updateProfile,
  changePassword,
  requestReset,
  findReset,
  resetPassword,
  setAvatar,
  clearAvatar,
  avatarFor,
  closeAccount,
};
