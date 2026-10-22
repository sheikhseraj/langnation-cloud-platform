// Asking for a student account.
//
// The flow, end to end:
//
//   1. A person fills in the request form: name, email, why.
//   2. The office is emailed and the request sits as 'pending'.
//   3. Someone signed in to /admin approves or refuses it.
//   4. Approved  → the person gets a one-time link to set a password,
//                  and only then does a student account exist.
//      Refused   → the person gets a plain, courteous note and a way to
//                  reach a human.
//
// Nothing here creates an account on its own. That is the whole point:
// a working email address is free and endless, so email verification
// alone never stopped anyone filling the students table.

const crypto = require("crypto");
const { env } = require("./env");

const db = require("./db");
const mailer = require("./mailer");
const site = require("./site");
const T = require("./mail-template");

/** Invitations expire, so an approval left unused does not stay live. */
const INVITE_DAYS = 14;

// Deliberately loose. Anything stricter starts rejecting addresses that
// are perfectly valid — plus-tags, newer top-level domains, non-Latin
// domains — and a bounced email is a cheaper mistake than a student who
// cannot apply at all.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Domains that do not exist and are nearly always a slip.
 *
 * The form offers a correction as you type; this catches the same
 * mistakes when the script did not run or the suggestion was waved
 * away. Only exact matches on domains that genuinely do not resolve —
 * never a guess at what somebody meant.
 */
const DEAD_DOMAINS = new Set([
  "gmial.com", "gmai.com", "gmail.co", "gmail.con", "gmail.cm", "gnail.com",
  "gmaill.com", "gamil.com", "gmail.comm", "gmail.om",
  "yahoo.co", "yaho.com", "yahoo.con", "yahooo.com",
  "hotmial.com", "hotmai.com", "hotmail.co", "hotmail.con", "hotnail.com",
  "outlok.com", "outloo.com", "outlook.co", "outlook.con",
  "iclod.com", "icloud.co", "iclould.com",
  "web.d", "gmx.d", "t-online.d",
]);

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");


/**
 * Signed links for the Approve and Decline buttons in the notification
 * email, so a decision does not require signing in first.
 *
 * The token is an HMAC over the request id, the action and an expiry —
 * nothing is stored, and it cannot be edited to point at another
 * request or flipped from deny to approve.
 *
 * It is not single-use by itself; the request's own status makes it so.
 * Once decided, the request is no longer pending and the link does
 * nothing. That also means an old email cannot re-approve something
 * later refused.
 *
 * Following the link never acts. Mail scanners at Outlook, Gmail and
 * most corporate filters fetch every URL in a message, so a GET that
 * approved an account would be triggered by a robot before anyone read
 * the email. The link opens a page; a POST from that page decides.
 */
const ACTION_TTL_MS = 14 * 86400000;

function actionSecret() {
  return env("SESSION_SECRET") || env("ADMIN_PASSWORD") || "";
}

function signAction(id, action, expiresAt) {
  const payload = `${id}.${action}.${expiresAt}`;
  const mac = crypto.createHmac("sha256", actionSecret()).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${mac}`;
}

/** Returns { id, action } for a good token, or null. */
function verifyAction(token) {
  if (!token || !actionSecret()) return null;
  const parts = String(token).split(".");
  if (parts.length !== 4) return null;
  const [id, action, expiresAt, mac] = parts;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(expiresAt)) return null;
  if (!["approve", "deny"].includes(action)) return null;
  if (Number(expiresAt) < Date.now()) return null;

  const expected = signAction(id, action, expiresAt).split(".")[3];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return { id: Number(id), action };
}

/** The two decision links for one request. */
function actionLinks(id) {
  const exp = Date.now() + ACTION_TTL_MS;
  return {
    approve: `${site.origin}/admin/requests/act/${signAction(id, "approve", exp)}`,
    deny: `${site.origin}/admin/requests/act/${signAction(id, "deny", exp)}`,
  };
}

/** Combine the dialling-code select and the number field into one string. */
function joinPhone(body) {
  const cc = String(body.phone_cc || "").replace(/[^0-9]/g, "");
  const num = String(body.phone_number || body.phone || "").replace(/[^0-9]/g, "");
  if (!num) return "";
  return cc ? `+${cc} ${num}` : num;
}

/** Check a request form. Returns cleaned values and any errors. */
function validate(body = {}) {
  const values = {
    name: String(body.name || "").trim().slice(0, 120),
    email: String(body.email || "").trim().toLowerCase().slice(0, 180),
    // The form sends the dialling code and the number separately, so
    // the number field can refuse anything but digits. Joined here.
    phone: joinPhone(body).slice(0, 40),
    country: String(body.country || "").trim().slice(0, 80),
    purpose: String(body.purpose || "").trim().slice(0, 2000),
  };
  const errors = {};

  if (values.name.length < 2) errors.name = "Please enter your name.";
  if (!EMAIL_RE.test(values.email)) {
    errors.email = "Please enter a valid email address.";
  } else if (DEAD_DOMAINS.has(values.email.split("@")[1] || "")) {
    errors.email = "That email domain does not exist — please check it for a typo.";
  }
  // The reason is the only thing the person deciding really has to go on,
  // so a one-word answer is not enough to decide from.
  if (values.purpose.length < 20) {
    errors.purpose = "Please tell us a little more — a sentence or two is enough.";
  }
  if (!body.accept) errors.accept = "Please accept the terms to continue.";

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/** Has this address already asked, or already got in? */
async function existingFor(email) {
  const rows = await db.query(
    `SELECT id, status FROM account_requests
      WHERE email = ? AND status IN ('pending','approved')
      ORDER BY id DESC LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/** Store a request and tell the office about it. */
async function create(values, meta = {}) {
  const res = await db.query(
    `INSERT INTO account_requests
       (name, email, phone, country, purpose, lang, ip, user_agent, spam_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.name,
      values.email,
      values.phone || null,
      values.country || null,
      values.purpose,
      values.lang || "en",
      meta.ip || null,
      (meta.userAgent || "").slice(0, 255) || null,
      meta.spamScore || 0,
    ]
  );
  const id = res.insertId;

  // The result is checked, not discarded. A request nobody is told about
  // sits in the table until somebody happens to look — which is the same
  // mistake that hid the enquiry notifications for weeks.
  const sent = await notifyOffice({ ...values, id });
  if (!sent || sent.sent === false) {
    console.error(`!  Account request ${id} stored, but the office was not emailed: ${sent && sent.reason}`);
  }
  return id;
}

/** Email the office that someone is asking for an account. */
async function notifyOffice(req) {
  const url = `${site.origin}/admin/requests`;
  const links = actionLinks(req.id);
  const html = T.wrap({
    title: "Account request",
    body:
      T.p("Someone has asked for a student portal account.") +
      T.details({
        Name: req.name,
        Email: req.email,
        Phone: req.phone,
        Country: req.country,
        Language: req.lang,
      }) +
      T.quoted("Why they want an account", req.purpose) +
      // Three ways to act: decide straight from the inbox, or open the
      // admin to see everything waiting. The two decision links open a
      // confirmation page rather than deciding on their own, because
      // mail scanners fetch every URL in a message.
      `<div style="margin-top:20px">${T.button("Approve", links.approve, "approve")}${T.button("Decline", links.deny, "deny")}${T.button("Review in the admin", url)}</div>`,
    footer:
      "Approve and Decline open a page that asks you to confirm — one more click, " +
      "so a mail scanner following the link cannot decide for you. The links work for 14 days.",
  });

  return mailer.send({
    to: site.contact.email,
    replyTo: req.email,
    subject: `Account request — ${req.name}`,
    html,
    text: T.text([
      "Someone has asked for a student portal account.",
      "",
      `Name:    ${req.name}`,
      `Email:   ${req.email}`,
      req.phone ? `Phone:   ${req.phone}` : null,
      req.country ? `Country: ${req.country}` : null,
      "",
      "Why they want an account:",
      req.purpose,
      "",
      `Approve: ${links.approve}`,
      `Decline: ${links.deny}`,
      `All requests: ${url}`,
    ]),
  });
}

/**
 * Requests for the admin list.
 *
 * Empty rather than an exception when the database is unreachable. The
 * rest of the back office degrades to a notice in that situation; this
 * one used to take the whole page down with a 500, which reads as a
 * broken admin rather than as a missing database.
 */
async function list(status = "pending") {
  if (!db.isEnabled()) return [];
  const where = status ? "WHERE status = ?" : "";
  const args = status ? [status] : [];
  return db.query(
    `SELECT id, name, email, phone, country, purpose, lang, status,
            decision_note, decided_at, used_at, invite_expires_at, spam_score, created_at
       FROM account_requests ${where}
      ORDER BY created_at DESC
      LIMIT 200`,
    args
  );
}

async function byId(id) {
  if (!db.isEnabled()) return null;
  const rows = await db.query(`SELECT * FROM account_requests WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function counts() {
  if (!db.isEnabled()) return { pending: 0, approved: 0, denied: 0 };
  const rows = await db.query(
    `SELECT status, COUNT(*) AS n FROM account_requests GROUP BY status`
  );
  const out = { pending: 0, approved: 0, denied: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

/**
 * Approve a request: mint a one-time invitation and send it.
 *
 * The token is returned to the caller only inside the link; the database
 * keeps a hash, so a copy of the table cannot be turned into accounts.
 */
async function approve(id) {
  const req = await byId(id);
  if (!req) return { ok: false, reason: "no such request" };
  if (req.status === "approved") return { ok: false, reason: "already approved" };

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + INVITE_DAYS * 86400000);

  await db.query(
    `UPDATE account_requests
        SET status = 'approved', invite_hash = ?, invite_expires_at = ?,
            decided_at = NOW(), decision_note = NULL
      WHERE id = ?`,
    [sha256(token), expires, id]
  );

  const url = `${site.origin}/portal/invite/${token}`;
  const html = T.wrap({
    title: "Your account is approved",
    body:
      T.p(`Hello ${T.escapeHtml(req.name)},`) +
      T.p(
        "Good news — your request for a LangNation student portal account has been approved. " +
          "Use the button below to choose a password and finish setting it up."
      ) +
      `<div style="margin:18px 0">${T.button("Create your account", url)}</div>` +
      T.p(
        `<span style="color:${T.MUTED};font-size:13px">This link is for you alone and stops working on ` +
          `${expires.toISOString().slice(0, 10)}. If the button does not work, copy this address into your browser:<br>` +
          `<span style="word-break:break-all">${T.escapeHtml(url)}</span></span>`
      ),
    footer: `Questions? Just reply to this email and it reaches the office.`,
  });

  const sent = await mailer.send({
    to: req.email,
    subject: "Your LangNation account is approved",
    html,
    text: T.text([
      `Hello ${req.name},`,
      "",
      "Your request for a LangNation student portal account has been approved.",
      "Open this link to choose a password and finish setting it up:",
      "",
      url,
      "",
      `The link is for you alone and stops working on ${expires.toISOString().slice(0, 10)}.`,
    ]),
  });

  return { ok: true, sent: sent.sent, email: req.email };
}

/** Refuse a request and tell the person, courteously. */
async function deny(id, note = "") {
  const req = await byId(id);
  if (!req) return { ok: false, reason: "no such request" };

  await db.query(
    `UPDATE account_requests
        SET status = 'denied', decision_note = ?, decided_at = NOW(),
            invite_hash = NULL, invite_expires_at = NULL
      WHERE id = ?`,
    [note ? String(note).slice(0, 500) : null, id]
  );

  const contact = `${site.origin}/contact`;
  const html = T.wrap({
    title: "About your account request",
    body:
      T.p(`Hello ${T.escapeHtml(req.name)},`) +
      T.p(
        "Thank you for your interest in LangNation. We are not able to open a student " +
          "portal account for you at the moment."
      ) +
      (note ? T.quoted("Note from the office", note) : "") +
      T.p(
        "The portal is for students enrolled on a course with us. If you would like to join " +
          "one, or if you think this decision is a mistake, please get in touch — we read every message."
      ) +
      `<div style="margin:18px 0">${T.button("Contact the office", contact)}</div>`,
    footer: `You can also reply to this email, or write to ${T.escapeHtml(site.contact.email)}.`,
  });

  const sent = await mailer.send({
    to: req.email,
    subject: "About your LangNation account request",
    html,
    text: T.text([
      `Hello ${req.name},`,
      "",
      "Thank you for your interest in LangNation. We are not able to open a student",
      "portal account for you at the moment.",
      note ? "" : null,
      note ? `Note from the office: ${note}` : null,
      "",
      "The portal is for students enrolled on a course with us. If you would like to",
      "join one, or if you think this is a mistake, please get in touch:",
      "",
      contact,
    ]),
  });

  return { ok: true, sent: sent.sent, email: req.email };
}

/** Find a live invitation by the token from the link. */
async function findInvite(token) {
  if (!token) return null;
  const rows = await db.query(
    `SELECT * FROM account_requests
      WHERE invite_hash = ? AND status = 'approved'
        AND used_at IS NULL AND invite_expires_at > NOW()
      LIMIT 1`,
    [sha256(token)]
  );
  return rows[0] || null;
}

/** Mark an invitation spent, so the link cannot be used twice. */
async function markUsed(id) {
  await db.query(`UPDATE account_requests SET used_at = NOW() WHERE id = ?`, [id]);
}

module.exports = {
  validate,
  signAction,
  verifyAction,
  actionLinks,
  notifyOffice,
  existingFor,
  create,
  list,
  byId,
  counts,
  approve,
  deny,
  findInvite,
  markUsed,
  INVITE_DAYS,
};
