// ─────────────────────────────────────────────────────────────────────
//  Outbound email.
//
//  For enquiries, email is a NOTIFICATION and never the record: the
//  enquiry is written to MySQL first and mailed second, so a mail outage
//  can never lose one. If SMTP is not configured the site skips the step.
//
//  Student account email is the exception, and `send` is deliberately
//  honest about it. A verification or reset link that is not delivered
//  leaves an account nobody can reach, so those callers have to look at
//  the return value rather than fire and forget — see routes/student.js,
//  which shows the link on screen when SMTP is switched off, so the flow
//  can be walked through locally before SMTP exists.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const nodemailer = require("nodemailer");
const { env } = require("./env");
const site = require("./site");
const T = require("./mail-template");

let transport = null;
let configured = false;

function init() {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (!host || !user || !pass) {
    console.log("i  SMTP not configured — enquiry emails are disabled (enquiries are still stored).");
    return false;
  }

  const port = Number(env("SMTP_PORT", 587));
  transport = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: { user, pass },
  });
  configured = true;
  return true;
}

/** Notify the office about one new enquiry. Never throws. */
async function sendEnquiry(enquiry) {
  if (!configured) return { sent: false, reason: "not configured" };

  // lib/site.js defaults CONTACT_EMAIL to info@langnation.com; this did
  // not, so with neither ENQUIRY_TO nor CONTACT_EMAIL set the recipient
  // was the empty string and every enquiry notification was dropped
  // before it was sent. The site said "email: configured" throughout.
  const to = env("ENQUIRY_TO", "") || site.contact.email;
  if (!to) return { sent: false, reason: "no recipient" };

  const subject = `${enquiry.subjectPrefix || "New enquiry"} — ${enquiry.name}${enquiry.course && !enquiry.subjectPrefix ? ` (${enquiry.course})` : ""}`;

  // The same shell as every other message, so the seal and the styling
  // are in one place rather than two that drift apart.
  const html = T.wrap({
    title: enquiry.subjectPrefix || "New enquiry",
    body:
      T.details({
        Name: enquiry.name,
        Email: enquiry.email,
        Phone: enquiry.phone,
        Country: enquiry.country,
        Course: enquiry.course,
        Language: enquiry.lang,
        Page: enquiry.sourcePage,
      }) +
      T.quoted("Message", enquiry.message) +
      `<div style="margin-top:20px">${T.button(
        `Reply to ${enquiry.name}`,
        `mailto:${enquiry.email}`
      )}</div>`,
  });

  const text = [
    `New enquiry from langnation.com`,
    ``,
    `Name:    ${enquiry.name}`,
    `Email:   ${enquiry.email}`,
    enquiry.phone ? `Phone:   ${enquiry.phone}` : "",
    enquiry.country ? `Country: ${enquiry.country}` : "",
    enquiry.course ? `Course:  ${enquiry.course}` : "",
    `Page:    ${enquiry.sourcePage || "-"}`,
    ``,
    enquiry.message,
  ].filter(Boolean).join("\n");

  try {
    await transport.sendMail({
      from: env("SMTP_FROM", `LangNation Website <${env("SMTP_USER")}>`),
      to,
      replyTo: enquiry.email,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    // Logged, not thrown: the enquiry itself is already safely stored.
    console.error("Enquiry email failed:", e.message);
    return { sent: false, reason: e.message };
  }
}

/**
 * Send one plain message.
 *
 * Returns `{ sent, reason }` and never throws: the caller decides what a
 * failure means. For account email that decision matters — a student who
 * never gets the link is stuck — so callers surface it rather than
 * swallowing it the way the enquiry path can afford to.
 */
async function send({ to, subject, text, html = null, replyTo = null, attachments = null }) {
  if (!configured) return { sent: false, reason: "SMTP is not configured" };
  if (!to) return { sent: false, reason: "no recipient" };

  try {
    await transport.sendMail({
      from: env("SMTP_FROM", `LangNation <${env("SMTP_USER")}>`),
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text,
      ...(html ? { html } : {}),
      // Validated by lib/attachments.js before they reach here: the
      // name is stripped of anything that means something in a MIME
      // header, and the bytes have to begin the way the type says.
      ...(attachments && attachments.length ? { attachments } : {}),
    });
    return { sent: true };
  } catch (e) {
    console.error(`Email to ${to} failed:`, e.message);
    return { sent: false, reason: e.message };
  }
}

/**
 * Whether the credentials actually work, as opposed to merely being
 * present.
 *
 * "Configured" only ever meant "the variables are filled in", which is
 * how a rejected SMTP password went unnoticed: the health check said
 * email was fine while every message was silently failing to send. This
 * asks the server.
 *
 * The result is cached because verify() opens a connection and logs in,
 * which is far too slow to do per request.
 */
let verified = null;
let verifiedAt = 0;

async function verify({ maxAgeMs = 300000 } = {}) {
  if (!configured) return { ok: false, reason: "not configured" };
  if (verified && Date.now() - verifiedAt < maxAgeMs) return verified;
  try {
    await transport.verify();
    verified = { ok: true };
  } catch (e) {
    verified = { ok: false, reason: e.message.slice(0, 120) };
  }
  verifiedAt = Date.now();
  return verified;
}

/** The last verify() result, without triggering a new one. */
const lastVerification = () => verified;

const isConfigured = () => configured;

module.exports = { init, sendEnquiry, send, isConfigured, verify, lastVerification };
