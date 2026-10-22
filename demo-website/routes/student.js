// ─────────────────────────────────────────────────────────────────────
//  The student portal: register, verify, sign in, and the portal home.
//
//  Mounted at /portal. Everything under /portal/me requires a session;
//  everything above it is public because that is where you get one.
//
//  Two decisions worth knowing before reading:
//
//  1. Registering gets you an account, not access. A new account shows
//     its own empty portal until staff attach an enrolment to it, so a
//     stranger signing up learns nothing about anybody else.
//
//  2. When SMTP is not configured the verification link is shown on
//     screen instead of emailed, and only on a staging host. That is what
//     makes the flow walkable locally before SMTP exists; on a production
//     host the link is never displayed, because that would hand account
//     access to whoever typed the address.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");
const students = require("../lib/students");
const mailer = require("../lib/mailer");
const T = require("../lib/mail-template");
const db = require("../lib/db");
const site = require("../lib/site");
const spam = require("../lib/spam");
const requests = require("../lib/account-requests");
const content = require("../lib/content");
const portal = require("../lib/portal");
const exercises = require("../lib/exercises");
const homeworkProgress = require('../lib/homework-progress');
const homeworkEngine = require('../lib/homework-engine');
const sched = require("../lib/schedule");
const attendance = require("../lib/attendance");
const avatar = require("../lib/avatar");
const billing = require("../lib/billing");
const billingAddress = require("../lib/billing-address");
const invoiceAddressRequests = require("../lib/invoice-address-requests");
const invoiceAddressMail = require("../lib/invoice-address-mail");
const csrf = require("../lib/csrf");
const etProgress = require("../lib/et-progress");
const catalogue = require("../lib/einbuergerungstest");
const etCore = require("../public/js/et-core");
const countries = require("../content/countries.json");

// Registration is a public write, so it is rate limited per IP. In memory
// rather than in the database: it only has to survive long enough to stop
// a burst, and a restart clearing it is not a problem worth a table.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const attempts = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (attempts.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  attempts.set(ip, hits);

  // Opportunistic sweep, so the map cannot grow without bound.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) attempts.delete(k);
    }
  }
  return hits.length > RATE_MAX;
}

/** Only ever true on a host that is not production. */
const canShowLinks = () => site.isStaging && !mailer.isConfigured();

/* Is this fetch asking, or a form?
 *
 * Accept rather than a header of our own: the page's own fetch sets it,
 * a plain form post does not, and nothing else has to be agreed
 * between the two sides.
 */
function wantsJson(req) {
  return String(req.get("accept") || "").includes("application/json");
}

const classLinks = require("../lib/class-links");

function view(res, page, extra = {}) {
  res.render(`pages/portal/${page}`, {
    site,
    classLinks,
    student: null,
    error: null,
    notice: null,
    errors: {},
    values: {},
    devLink: null,
    ...extra,
  });
}

function setSession(res, studentId, tokenVersion) {
  const expiresAt = Date.now() + students.MAX_AGE_MS;
  res.cookie(students.COOKIE, students.signSession(studentId, tokenVersion, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: site.origin.startsWith("https://"),
    maxAge: students.MAX_AGE_MS,
    path: "/",
  });
}

/** Gate for everything under /portal/me. */
async function requireStudent(req, res, next) {
  try {
    // Checked before the session, because a student holding a valid cookie
    // during a database outage would otherwise reach a query that throws
    // and get a 500 instead of being told the portal is unavailable.
    if (!db.isEnabled()) {
      return view(res, "unavailable", {
        error: "The portal needs the database, which is not configured on this server yet.",
      });
    }
    const me = await students.current(req);
    if (!me) {
      // Remember where they were going, so signing in does not dump them
      // on a generic page. Only a path, never a full URL — accepting one
      // of those makes this an open redirect.
      const to = req.originalUrl.startsWith("/portal/") ? req.originalUrl : "";
      return res.redirect(`/portal/login${to ? `?next=${encodeURIComponent(to)}` : ""}`);
    }
    req.student = me;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * The caller's address, behind Hostinger's proxy.
 *
 * x-forwarded-for is a list when there are several proxies; the first
 * entry is the client. Only used for the audit log and the spam
 * scoring, never for authorisation — a header is trivially forged.
 */
const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();

/**
 * A safe internal redirect target, or the portal home.
 *
 * Any path on this site, not just /portal/ — somebody who signs in
 * from the Einbürgerungstest page wants to land back on it, and
 * sending them to the dashboard instead loses their place and makes
 * them navigate back.
 *
 * What is refused is anything that could leave the site. A naive
 * startsWith("/") lets through "//evil.com", which a browser reads as
 * protocol-relative and follows off-site; some parsers treat a
 * backslash the same way. The login page itself is refused too, or a
 * bounced sign-in loops back on itself forever.
 */
function safeNext(raw) {
  const s = String(raw || "").trim();
  if (!s.startsWith("/")) return "/portal/me";
  if (s.startsWith("//") || s.includes("\\")) return "/portal/me";
  if (s.startsWith("/portal/login")) return "/portal/me";
  return s;
}

function build() {
  const router = express.Router();

  // Every page here is private to one person, and none of it should be
  // indexed or cached by a shared proxy.
  router.use((req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store, private");
    res.locals.classJoinCsrf=csrf.token(req,res);
    next();
  });

  /**
   * /portal on its own.
   *
   * It had no route, so the address anyone would actually type — and the
   * one printed on anything pointing students here — returned a 404.
   * Signed in, it goes to their portal home; signed out, to the sign-in
   * page, which then sends them on to where they were headed.
   */
  router.get("/", async (req, res) => {
    // Where they came from, carried through the sign-in and back out
    // the other side. Somebody who clicks the account icon while
    // revising should land back on the page they were revising.
    const to = safeNext(req.query.next);
    if (!db.isEnabled()) {
      return res.redirect("/portal/login?next=" + encodeURIComponent(to));
    }
    let me = null;
    try {
      me = await students.current(req);
    } catch {
      /* a database wobble should send them to sign-in, not to a 500 */
    }
    if (me) return res.redirect(to === "/portal/me" ? "/portal/me" : to);
    res.redirect("/portal/login?next=" + encodeURIComponent(to));
  });

  const dbDown = (res) =>
    view(res, "unavailable", {
      error: "The portal needs the database, which is not configured on this server yet.",
    });

  // ── Asking for an account ───────────────────────────────────────
  //
  // Registration used to create an account outright, with an emailed
  // link as the only gate. A working email address is free and endless,
  // so that stopped nobody. Now a person says who they are and why, the
  // office decides, and an account exists only after someone approves.

  router.get("/register", (req, res) => res.redirect("/portal/request"));

  /**
   * The student terms, for the dialog on every page that asks somebody
   * to accept them — the account request and the invitation.
   *
   * Read here as well as served at their own URL, so agreeing to them
   * means having had them put in front of you rather than merely
   * linked. The path travels with them: it is what the link points at
   * when there is no JavaScript, and where it opens in a new tab.
   */
  const TERMS_PATH = "/student-terms-and-conditions";

  function termsFor(req) {
    const lang = /^de\b/i.test(req.get("accept-language") || "") ? "de" : "en";
    const terms = content.page("student-terms-and-conditions", lang);
    return {
      termsHtml: terms ? terms.body : null,
      termsTitle: terms ? terms.title : "Terms and Conditions",
      termsPath: TERMS_PATH,
    };
  }

  router.get("/request", (req, res) => {
    view(res, "request", { values: {}, countries, ...termsFor(req) });
  });

  router.post("/request", async (req, res, next) => {
    // The form posts through fetch and shows a dialog, so the useful
    // answer is JSON. A browser without JavaScript posts normally and
    // gets the pages instead — same handler, same rules.
    const wantsJson = (req.get("accept") || "").includes("application/json");
    const reply = (status, payload, page, extra) =>
      wantsJson ? res.status(status).json(payload) : view(res, page, extra);

    try {
      if (!db.isEnabled()) {
        return wantsJson
          ? res.status(503).json({ ok: false, outcome: "unavailable" })
          : dbDown(res);
      }

      const ip = ipOf(req);

      // The same scoring the enquiry form uses. A clear bot is answered
      // exactly like a success, so it cannot tell it was caught.
      const check = await spam.assess(req.body, { ip });
      if (check.verdict === "block") {
        console.warn(`Account request blocked (${check.score}): ${check.reasons.join(" · ")}`);
        return reply(200, { ok: true, outcome: "received" }, "requested", { values: {} });
      }

      const { ok, values, errors } = requests.validate(req.body);
      if (!ok) return reply(400, { ok: false, outcome: "invalid", errors }, "request", { errors, values });

      // Someone who has already asked is told so. This does leak whether
      // an address has applied, which is why the enquiry form stays
      // silent — but here the alternative is worse: a second attempt
      // that looks identical to the first reads as the form being
      // broken, which is exactly how this was reported.
      const existing = await requests.existingFor(values.email);
      if (existing) {
        return reply(
          200,
          { ok: true, outcome: "duplicate", status: existing.status },
          "requested",
          { values, duplicate: existing.status }
        );
      }

      // The portal is mounted once, not per language like the public
      // pages, so there is no `lang` in scope here. Take it from the
      // browser: it only decides what the office sees noted on the
      // request, so a wrong guess is cosmetic.
      const lang = /^de\b/i.test(req.get("accept-language") || "") ? "de" : "en";

      await requests.create(
        { ...values, lang },
        { ip, userAgent: req.get("user-agent"), spamScore: check.score }
      );

      reply(200, { ok: true, outcome: "received" }, "requested", { values });
    } catch (e) {
      if (wantsJson) {
        console.error("Account request failed:", e.message);
        return res.status(500).json({ ok: false, outcome: "error" });
      }
      next(e);
    }
  });

  // ── Finishing an approved account ───────────────────────────────
  //
  // The link from the approval email. Only here does a student row get
  // created, and only against an invitation that was issued by hand.

  router.get("/invite/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);
      const invite = await requests.findInvite(req.params.token);
      if (!invite) {
        return view(res, "login", {
          error:
            "That invitation is not valid — it may have expired or already been used. " +
            "Please contact the office if you need a new one.",
        });
      }
      view(res, "invite", {
        invite, token: req.params.token, errors: {}, ...termsFor(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/invite/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);
      const invite = await requests.findInvite(req.params.token);
      if (!invite) {
        return view(res, "login", { error: "That invitation is no longer valid." });
      }

      // The name and email come from the approved request, not the form,
      // so an invitation cannot be redirected to a different person.
      const check = students.validateRegistration({
        name: invite.name,
        email: invite.email,
        password: req.body.password,
        accept: req.body.accept,
      });
      if (!check.ok) {
        return view(res, "invite", {
          invite, token: req.params.token, errors: check.errors, ...termsFor(req),
        });
      }

      const result = await students.createFromInvite({
        name: invite.name,
        email: invite.email,
        phone: invite.phone,
        country: invite.country,
        password: req.body.password,
      });
      if (!result.ok) {
        return view(res, "invite", {
          invite,
          token: req.params.token,
          errors: { password: result.reason || "That did not work. Please try again." },
          ...termsFor(req),
        });
      }

      await requests.markUsed(invite.id);

      // Straight in. They followed a link only they received and have
      // just chosen the password; asking for it again is friction with
      // no security gained.
      setSession(res, result.studentId, result.tokenVersion);
      res.redirect("/portal/me");
    } catch (e) {
      next(e);
    }
  });

  router.get("/verify/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const result = await students.verify(req.params.token);
      if (!result.ok) {
        const message =
          result.reason === "expired"
            ? "That link has expired. Please register again to get a new one."
            : result.reason === "suspended"
              ? "That account is not active. Please contact the school."
              : "That link is not valid. It may already have been used.";
        return view(res, "login", { error: message });
      }

      // Straight in: they have just proved they control the mailbox, and
      // making them type the password they set two minutes ago is friction
      // with no security benefit.
      const row = await db.queryOne("SELECT token_version FROM students WHERE id = ?", [
        result.studentId,
      ]);
      setSession(res, result.studentId, row ? row.token_version : 1);
      return res.redirect("/portal/me?welcome=1");
    } catch (e) {
      next(e);
    }
  });

  // ── Forgotten passwords ─────────────────────────────────────────
  //
  // Three steps: ask, follow the emailed link, choose a new one. The
  // columns for this have existed since migration 03 and nothing had
  // ever written to them, so a student who forgot their password had to
  // email the office and wait for somebody to be at a desk.
  //
  // The form says the same thing whether or not the address has an
  // account. Anything else turns it into a way of asking whether a
  // given person studies here.

  // No database check on the way in. The sign-in page renders without
  // one and this is the same kind of page — a public form. Submitting
  // it is what needs the database, and that is where it is checked.
  router.get("/forgot", (req, res) => {
    view(res, "forgot", { values: {} });
  });

  router.post("/forgot", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const email = students.normaliseEmail(req.body.email);

      // Rate limited per address as well as per IP: without the first,
      // this is a way to fill somebody's inbox from a hundred machines.
      if (rateLimited(ipOf(req)) || rateLimited("reset:" + email)) {
        return view(res, "forgot", {
          error: "Too many attempts from this connection. Please try again shortly.",
          values: { email },
        });
      }

      const result = await students.requestReset(email);

      if (result.found) {
        const url = `${site.origin}/portal/reset/${encodeURIComponent(result.token)}`;
        await mailer.send({
          to: result.email,
          subject: "Reset your LangNation password",
          html: T.wrap({
            title: "Reset your password",
            body:
              T.p(`Hello ${T.escapeHtml(result.name)},`) +
              T.p(
                "Somebody asked to reset the password on your LangNation student " +
                  "portal account. If that was you, use the button below."
              ) +
              `<div style="margin:18px 0">${T.button("Choose a new password", url)}</div>` +
              T.p(
                `<span style="color:${T.MUTED};font-size:13px">The link works once and stops working in an hour. ` +
                  "If you did not ask for this you can ignore this email — nothing has changed, " +
                  "and your password still works.<br>" +
                  `<span style="word-break:break-all">${T.escapeHtml(url)}</span></span>`
              ),
            footer: "Questions? Just reply to this email and it reaches the office.",
          }),
          text: T.text([
            `Hello ${result.name},`,
            "",
            "Somebody asked to reset the password on your LangNation student portal account.",
            "If that was you, open this link to choose a new one:",
            "",
            url,
            "",
            "It works once and stops working in an hour.",
            "If you did not ask for this, ignore this email — nothing has changed.",
          ]),
        });
      }

      // The same page either way, and it does not say which.
      view(res, "forgot", { notice: "sent", values: { email } });
    } catch (e) {
      next(e);
    }
  });

  router.get("/reset/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);
      const row = await students.findReset(req.params.token);
      if (!row) {
        return view(res, "forgot", {
          error:
            "That link is no longer valid — it may have been used already, or it may have " +
            "expired. Ask for a new one below.",
          values: {},
        });
      }
      view(res, "reset", { token: req.params.token, email: row.email, errors: {} });
    } catch (e) {
      next(e);
    }
  });

  router.post("/reset/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const result = await students.resetPassword(req.params.token, req.body.password);
      if (!result.ok) {
        if (result.reason === "expired") {
          return view(res, "forgot", {
            error: "That link is no longer valid. Ask for a new one below.",
            values: {},
          });
        }
        const row = await students.findReset(req.params.token);
        return view(res, "reset", {
          token: req.params.token,
          email: row ? row.email : "",
          errors: { password: result.reason },
        });
      }

      // Straight in. They proved control of the mailbox and have just
      // chosen the password; asking for it again is friction with
      // nothing gained. Every other device was signed out by the reset.
      setSession(res, result.studentId, result.tokenVersion);
      res.redirect("/portal/me");
    } catch (e) {
      next(e);
    }
  });

  // ── sign in ───────────────────────────────────────────────────────
  router.get("/login", async (req, res, next) => {
    try {
      if (db.isEnabled()) {
        const me = await students.current(req);
        if (me) return res.redirect("/portal/me");
      }
      view(res, "login", { values: { next: safeNext(req.query.next) } });
    } catch (e) {
      next(e);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const email = students.normaliseEmail(req.body.email);
      const password = String(req.body.password || "");
      const nextPath = safeNext(req.body.next);

      const result = await students.authenticate(email, password);

      if (!result.ok) {
        /* One message for a wrong password, an unknown address and an
           unverified account. Distinguishing them tells an attacker
           which addresses are worth attacking.

           "suspended" is the exception, and safely so: authenticate()
           only reaches that answer AFTER the password has been
           checked, so nobody sees it without already knowing the
           password. Somebody whose account is on hold was being told
           "those details do not match" — so they reset a password
           that was never wrong, then wrote to ask why it had not
           helped. Telling them plainly costs nothing and saves them
           the afternoon. */
        const message =
          result.reason === "locked"
            ? `Too many attempts. Please try again in ${Math.ceil(result.secondsLeft / 60)} minutes.`
            : result.reason === "suspended"
              ? "Your account is on hold, so the portal is closed to you just now. " +
                "Please contact the school — nothing has been deleted, and everything " +
                "comes back exactly as it was once the hold is lifted."
              : "Those details do not match. If you have just registered, check your email for the confirmation link.";
        return view(res, "login", { error: message, values: { email, next: nextPath } });
      }

      setSession(res, result.studentId, result.tokenVersion);
      return res.redirect(nextPath);
    } catch (e) {
      next(e);
    }
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(students.COOKIE, { path: "/" });
    res.redirect("/portal/login");
  });

  // ── The portal proper ─────────────────────────────────────────────
  //
  // One page per thing, behind a sidebar, rather than the single
  // scroll it used to be. Every read below goes through lib/portal.js,
  // which takes the signed-in student's id and has no function that
  // returns rows without one.

  /** Everything the shell needs on every page. */
  const shell = (me, current) => ({
    student: me,
    nav: current,
    avatarUrl: me.avatar_updated_at
      ? `/portal/avatar?v=${new Date(me.avatar_updated_at).getTime()}`
      : null,
    initials: avatar.initials(me.name),
    hue: avatar.hue(me.student_ref || me.email),
  });

  /**
   * The signed-in student, with the profile columns the shell needs.
   *
   * students.current() deliberately reads a narrow row for the session
   * check on every request; the portal pages want the photo and the
   * rest, so they ask once more here.
   */
  async function fullStudent(req) {
    const full = await portal.profile(req.student.id);
    return full ? { ...req.student, ...full } : req.student;
  }

  router.get("/me", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const [enrolments, certs, bills, results, events, money] = await Promise.all([
        portal.courses(me.id),
        portal.certificates(me.id),
        portal.invoices(me.id),
        portal.placements(me.id, me.email),
        portal.events(me.id),
        /* Only when there is something to say. A student who has paid
           sees nothing, and one whose next instalment is months away
           sees nothing either -- a reminder that is always on the page
           is furniture, and furniture is what people stop reading. */
        billing.alertFor(me.id),
      ]);

      view(res, "dashboard", {
        ...shell(me, "dashboard"),
        money,
        stats: portal.summarise({ enrolments, certs, bills }),
        next: portal.nextUp(enrolments),
        enrolments,
        results,
        events,
        pendingFees: await billing.pendingEnrolments(me.id, await billing.forStudent(me.id)),
        notice: req.query.welcome ? "Your account is confirmed. Welcome." : null,
        error: req.query.error || null,
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Join the class, and be marked as here.
   *
   * The student presses one button and two things happen: they are
   * recorded as present — or late, if they are more than a few minutes
   * past the moment the teacher opened the room — and they are sent to
   * the meeting.
   *
   * A POST, because it writes. As a link it would be followed by every
   * prefetcher that saw it, and somebody would be marked present for a
   * class they never opened.
   *
   * The meeting URL is looked up from the enrolment rather than taken
   * from the form, so this cannot be used to reach a batch the student
   * is not on, and a made-up id is a 404 rather than a redirect to
   * wherever the id pointed.
   */
  router.post("/join/:intakeId", requireStudent, async (req, res, next) => {
    if(!csrf.valid(req))return res.status(403).send('Reload your courses and try joining again.');
    try {
      const joined = await attendance.recordJoin(
        req.student.id,
        Number(req.params.intakeId),
        attendance.normaliseDate(null)
      );
      if (!joined || !joined.meetingUrl) {
        if (wantsJson(req)) return res.status(404).json({ok:false,error:"Attendance could not be recorded for this class. Please contact the office."});
        return res.redirect("/portal/me?error=" + encodeURIComponent(
          "That class has no link yet. Ask the office and they will add one."
        ));
      }
      if (String(req.get("accept") || "").includes("application/json")) return res.json({ok:true});
      res.redirect(303,joined.meetingUrl);
    } catch (e) {
      next(e);
    }
  });

  router.get("/courses", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const [enrolments, materials] = await Promise.all([
        portal.courses(me.id),
        portal.materials(me.id),
      ]);
      view(res, "courses", { ...shell(me, "courses"), sched, enrolments, materials });
    } catch (e) {
      next(e);
    }
  });

  /**
   * My attendance.
   *
   * Grouped per batch here rather than in SQL, using the same `rate`
   * the teacher's pages use, so a student and their teacher can never
   * be shown two different percentages for the same register.
   */
  router.get("/attendance", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const rows = await portal.attendance(me.id);

      const batches = new Map();
      for (const row of rows) {
        const key = Number(row.intake_id);
        if (!batches.has(key)) {
          batches.set(key, {
            intakeId: key,
            code: row.batch_code,
            title: row.course_title,
            level: row.level,
            timezone: row.timezone,
            lessons: [],
            counts: { present: 0, late: 0, absent: 0, excused: 0 },
            unmarked: 0,
          });
        }
        const group = batches.get(key);
        group.lessons.push(row);
        // A lesson held with no mark against this student is not an
        // absence. It is a register that was never taken, and counting
        // it either way would be inventing a fact about somebody.
        if (row.status) group.counts[row.status] += 1;
        else group.unmarked += 1;
      }

      const grouped = [...batches.values()].map((b) => ({
        ...b,
        rate: attendance.rate(b.counts),
        marked: b.counts.present + b.counts.late + b.counts.absent + b.counts.excused,
      }));

      view(res, "attendance", {
        ...shell(me, "attendance"),
        batches: grouped,
        statusLabel: attendance.STATUS_LABEL,
        graceMinutes: attendance.GRACE_MINUTES,
        // The bands, from the one place that defines them.
        band: attendance.band,
        good: attendance.GOOD,
        poor: attendance.POOR,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── The student's own timetable ─────────────────────────────────
  //
  // Grouped by the day it falls on rather than listed flat, because
  // "what is happening on Thursday" is the question, and a run of
  // twenty rows each repeating its own date is not an answer to it.
  //
  // The day is worked out in the BATCH's timezone. Grouping by the
  // server's would put an evening class under the wrong heading for
  // half the world.
  /* ── Homework ─────────────────────────────────────────────────────
   *
   * Four endpoints and they divide plainly: two GETs that show, two
   * POSTs that record. The POSTs answer JSON to fetch and a redirect to
   * a plain form post, because the page works either way and the server
   * should not care which one is asking.
   */

  require('./vocabulary-learning').register(router,{requireStudent,fullStudent,shell,view});
  require('./reading').register(router,{requireStudent,fullStudent,shell,view});

  router.get("/homework", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const items = await exercises.forStudentList(me.id, me.email);
      view(res, "homework", {
        ...shell(me, "homework"),
        // Said by the exercise page when it sends somebody back — a
        // piece of homework with no questions in it, which is the
        // school's problem and not theirs.
        notice: req.query.notice || null,
        items,
        // Where they stand in their class. Motivation, and nothing
        // else: it never names another student — see lib/exercises.
        standings: await exercises.standings(me.id),
      });
    } catch (e) {
      next(e);
    }
  });

  /* Sitting one.
   *
   * The attempt is opened HERE rather than on the first answer, so that
   * a student who opens the page and gets no further still shows up as
   * having looked — which is a different thing from not having
   * started, and the only one of the two a teacher can do anything
   * about.
   */
  router.get("/homework/:id", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const ex = await exercises.forStudent(req.params.id, me.id, me.email);
      // Not theirs, or not published, or does not exist — one answer to
      // all three, so ids typed into the address bar tell nobody
      // anything.
      if (!ex) return next();

      /* Theirs, but with nothing in it.
       *
       * That is not a missing page and 404 was the wrong answer: the
       * student had followed a link from their own homework list and
       * been told the page did not exist. It is a piece of homework
       * that failed to save its questions, which is the school's
       * problem and not theirs, so it says so and sends them back. */
      if (!ex.questions.length) {
        return res.redirect("/portal/homework?notice=" + encodeURIComponent(
          `“${ex.title}” has no questions in it yet — your teacher has been told. ` +
          "Nothing you did caused this."
        ));
      }

      /* Which attempt to show.
       *
       * ?fresh=1 puts the current one away and opens another. Otherwise
       * the most recent attempt is shown whether or not it is finished
       * — and that is the fix for work disappearing. Finishing closed
       * the attempt, returning found nothing open and made a new one,
       * and a chapter somebody had completed the day before read
       * "0 of 6 answered". The answers were in the database all along;
       * no page would show them.
       *
       * Only when there is no attempt at all is one started, which is
       * the first time somebody opens it.
       */
      let attempt;
      if (ex.learning) {
        attempt = await homeworkProgress.ensureAttempt(ex, me.id);
      } else if (req.query.fresh) {
        attempt = await exercises.restart(ex.id, me.id, me.email);
      } else {
        attempt = await exercises.latest(ex.id, me.id);
        if (!attempt) attempt = await exercises.start(ex.id, me.id, me.email);
      }
      if (!attempt) return next();

      const everything = await exercises.forStudentList(me.id, me.email);

      /* The list down the left shows what the contents page was
       * showing, which is what the dropdowns there were set to.
       *
       * It has been wrong in both directions. First it was always
       * everything, so filtering to A1 and pressing Start opened a
       * page whose list began at B1 Kapitel 43. Then it was always the
       * current chapter's level, so choosing "All levels" still only
       * ever showed one.
       *
       * Neither was a choice the student had made. The filters travel
       * in the URL now — the links on the contents page carry them and
       * this page carries them on — so the list says what was asked
       * for, and no filter means no filtering. In the URL rather than
       * remembered in the browser so it survives a shared link and
       * works with the script blocked. */
      const want = exercises.scope(req.query);

      /* ...and failing that, the book this chapter is in.
       *
       * The list beside an open worksheet is for moving around the
       * book you are working through. Without this it was every
       * chapter the student holds: somebody sitting Kapitel 9 of Fast
       * Track had ten chapters of German Regular B1 above it, which
       * is not a contents page for anything.
       *
       * Only as a default. A book chosen on the contents page travels
       * in the URL and wins, and so does "all books" — asking for
       * everything has to be able to mean everything. */
      const here = everything.find((r) => Number(r.id) === Number(ex.id));
      if (!want.book && !req.query.book && here && here.book) want.book = here.book;

      const siblings = exercises.within(everything, want);
      const learningState = ex.learning ? await homeworkProgress.read(attempt.id, me.id, ex.id) : null;
      const learningChapter = ex.learning ? homeworkEngine.publicChapter(ex.learning, learningState) : null;
      // Only the sanitized configuration is ever handed to a student template.
      if (ex.learning) ex.learning = true;

      res.render("pages/portal/exercise", {
        site,
        ex,
        learningState,
        learningChapter,
        // The header carries the logo, the light/dark switch, the face
        // and the way out. shell() already knows how to build those —
        // `nav` is the one thing it adds that this page has no use for.
        ...shell(me, "homework"),
        // Everything else that was on show, for the list down the
        // left. It is why somebody can move between chapters without
        // going back to the index first.
        //
        // Falling back to the lot rather than to nothing: a filter
        // that excludes the chapter you are actually sitting is a
        // filter that has gone wrong, and an empty list beside an open
        // worksheet is a dead end.
        siblings: siblings.length ? siblings : everything,
        // The filters, so every link on this page carries them on.
        keep: exercises.query(want),
        keepFresh: exercises.query(want, { fresh: "1" }),
        // Where "Weiter" goes when this one is done, so finishing a
        // chapter carries on through the book instead of dropping
        // somebody back into a list of forty-one to find their place
        // in again.
        next: await exercises.nextFor(ex.id, me.id, me.email),
        attemptId: attempt.id,
        // Which questions this attempt has already answered, and how
        // they went. Somebody who did three of five yesterday comes
        // back to the fourth.
        done: await exercises.progress(attempt.id),
        // A finished attempt is read back, not written to. The page
        // shows what was done and offers to go again rather than
        // quietly letting somebody answer into a closed record.
        finished: !!attempt.finished_at,
        // A page reached through the unlock list says so. Otherwise a
        // teacher testing a draft has no way to tell it apart from one
        // the class can already see.
        unlocked: Number(ex.unlocked) === 1,
        published: Number(ex.published) === 1,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/homework/:id/check", requireStudent, express.json({limit:'32kb'}), async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const body = req.body || {};
      const accessible = await exercises.forStudent(req.params.id, me.id, me.email);
      if (!accessible) return res.status(404).json({error:'Homework unavailable'});
      if (accessible.learning) {
        if (req.get('sec-fetch-site') === 'cross-site') return res.sendStatus(403);
        const result = await homeworkProgress.update(accessible, me.id, body);
        return res.status(result.code || 200).json(result);
      }
      const owned = await db.queryOne('SELECT id FROM exercise_attempts WHERE id = ? AND exercise_id = ? AND student_id = ?', [Number(body.attempt),accessible.id,me.id]);
      if (!owned) return res.sendStatus(404);
      // One gap sends a string, two send an array. Normalised here so
      // the marking never has to ask which it was given.
      const given = Array.isArray(body.given) ? body.given : [body.given];

      const verdict = await exercises.check(body.attempt, body.question, given, me.id);
      if (!verdict) return next();

      if (wantsJson(req)) return res.json(verdict);
      // Without JavaScript there is nowhere to put one verdict, so the
      // page reloads and the student carries on. Duller, not broken.
      return res.redirect("/portal/homework/" + encodeURIComponent(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  router.post("/homework/:id/finish", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const accessible = await exercises.forStudent(req.params.id, me.id, me.email);
      if (!accessible) return res.sendStatus(404);
      if (accessible.learning) return res.status(400).json({error:'Learning chapters finish automatically when all tasks are completed.'});
      const owned = await db.queryOne('SELECT id FROM exercise_attempts WHERE id = ? AND exercise_id = ? AND student_id = ?', [Number((req.body||{}).attempt),accessible.id,me.id]);
      if (!owned) return res.sendStatus(404);
      const done = await exercises.finish(owned.id, me.id);

      /* Pressing Fertig carries on through the book.
       *
       * It used to land back on the contents page — which is where
       * somebody had just come from, and where they would now have to
       * find their place among forty-one chapters again. The next
       * chapter at the same level is what they were going to open
       * anyway. */
      const after = await exercises.nextFor(req.params.id, me.id, me.email);
      if (wantsJson(req)) {
        return res.json({ ...(done || { ok: false }), next: after || null });
      }
      return res.redirect(after ? "/portal/homework/" + after.id : "/portal/homework");
    } catch (e) {
      next(e);
    }
  });

  router.get("/schedule", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const [rows, enrolments] = await Promise.all([
        portal.schedule(me.id, { days: 42 }),
        portal.courses(me.id),
      ]);

      const dayIn = (instant, tz) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: tz || "Europe/Berlin",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(instant));

      const days = [];
      const byDay = new Map();
      for (const row of rows) {
        const key = dayIn(row.starts_at, row.timezone);
        if (!byDay.has(key)) {
          const entry = { date: key, lessons: [] };
          byDay.set(key, entry);
          days.push(entry);
        }
        byDay.get(key).lessons.push(row);
      }

      // Which batches could be showing lessons and are not, so the page
      // can say why it is empty instead of implying there are no
      // classes. A batch with no weekly pattern has no timetable to
      // show, and that is the office's to fix, not the student's.
      const active = enrolments.filter((e) => e.status === "active");
      const withoutPattern = active.filter(
        (e) => !e.meets_days && e.batch_status !== "finished"
      );

      view(res, "schedule", {
        ...shell(me, "schedule"),
        // The view names the pattern in words and the module owns what
        // "1,2,3,4,5" means. A template that reimplemented that would
        // disagree with the generator eventually, and the two would be
        // describing the same batch differently on the same page.
        sched,
        days,
        lessonCount: rows.length,
        active,
        withoutPattern,
        weeks: 6,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/certificates", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      // The enrolments are what decide the message when there is no
      // certificate: still studying, finished and owed one, or never
      // enrolled and so not owed anything.
      const [certificates, enrolments] = await Promise.all([
        portal.certificates(me.id),
        portal.courses(me.id),
      ]);
      view(res, "certificates", { ...shell(me, "certificates"), certificates, enrolments });
    } catch (e) {
      next(e);
    }
  });

  /* The page this used to be. Kept because it is in people's history
     and in at least one email, and a 404 is a worse answer than the
     page they were looking for under its new name. */
  router.get("/purchases", (req, res) => res.redirect(301, "/portal/payments"));

  async function renderPayments(req,res,extra={}){
    const me=await fullStudent(req),plans=await billing.forStudent(me.id);
    for(const p of plans){if(!p.enrolmentId)continue;const paid=await billing.paymentsFor(p.enrolmentId);p.history=paid.map(h=>({...h,amount_cents:billing.cents(h.amount)}));}
    view(res,'payments',{...shell(me,'payments'),plans,stateLabel:billing.STATE_LABEL,summaryLabel:billing.SUMMARY_STATE,pendingFees:await billing.pendingEnrolments(me.id,plans),...extra});
  }
  router.get("/payments",requireStudent,async(req,res,next)=>{try{await renderPayments(req,res);}catch(e){next(e);}});
  router.post(['/settings/billing-address','/payments/billing-address'],requireStudent,async(req,res,next)=>{
    if(!csrf.valid(req))return res.status(403).send('Please reload Settings and try again.');
    try{await billingAddress.save(req.student.id,req.body||{});res.redirect(303,'/portal/settings?billing=saved#invoice-address');}
    catch(e){if(e instanceof billingAddress.AddressError){res.status(400);await renderSettings(req,res,{billingError:e.message,billingValues:req.body||{}}).catch(next);}else next(e);}
  });

  /*
   * One invoice, as the document the school issued.
   *
   * The same partial the office reads, so a student and the office are
   * never looking at two different renderings of the same number.
   *
   * The authorisation is the point of this route and it is done here,
   * on the server. Everywhere else in the portal the student id comes
   * from the session and there is nothing to tamper with; here there
   * is an id in the address bar, and it is the one thing a student can
   * change. Not theirs, does not exist, or is still a draft -- one
   * answer to all three, because refusing somebody else's invoice
   * confirms that it exists and who it belongs to.
   */
  router.post('/payments/invoice/:id/address-request',requireStudent,async(req,res,next)=>{
    if(!csrf.valid(req))return res.status(403).send('Reload the invoice and try again.');
    try{
      const out=await invoiceAddressRequests.submit(req.student.id,Number(req.params.id),req.body||{});
      await invoiceAddressMail.flush(out.id).catch(e=>console.error('Invoice address mail:',e.message));
      res.redirect(303,'/portal/payments/invoice/'+Number(req.params.id)+'?request=submitted#invoice-address-request');
    }catch(e){
      if(e instanceof invoiceAddressRequests.RequestError||e instanceof billingAddress.AddressError){
        res.status(400);await renderInvoice(req,res,{requestError:e.message,requestValues:req.body||{}}).catch(next);
      }else next(e);
    }
  });
  async function renderInvoice(req,res,extra={}) {

    try {
      const me = await fullStudent(req);
      const bill = await billing.invoice(Number(req.params.id),{studentId:me.id});
      if (!bill || String(bill.student_id) !== String(me.id)) return res.sendStatus(404);
      /* A draft is the office still deciding: no number, possibly
         discarded tomorrow. Telling a student about it is telling them
         about a bill that does not exist yet. */
      if (bill.status === "draft") return res.sendStatus(404);

      /* The schedule it belongs to, so one instalment is never read as
         the whole course fee. Read for this student, so a wrong id
         cannot drag somebody else's plan onto the page either. */
      const plans = await billing.forStudent(me.id);
      const mine = plans.find((p) => String(p.enrolmentId) === String(bill.enrolment_id));

      const addressDetails=await billingAddress.current(me.id);
      view(res, "invoice", {
        ...shell(me, "payments"),
        bill,
        plan: mine ? mine.parts : [],
        addressDetails,
        addressRequests:await invoiceAddressRequests.history(bill.id,me.id),
        requestReady:invoiceAddressRequests.ready(),requestCsrf:csrf.token(req,res),
        requestNotice:req.query.request==='submitted'?'Your request is saved for office review. A confirmation email is queued for delivery.':null,...extra,
      });
    } catch (e) { throw e; }
  }
  router.get("/payments/invoice/:id",requireStudent,async(req,res,next)=>{try{await renderInvoice(req,res);}catch(e){next(e);}});

  router.get("/profile", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      view(res, "profile", {
        ...shell(me, "profile"),
        countries,
        notice: req.query.done || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/profile", requireStudent, async (req, res, next) => {
    try {
      await students.updateProfile(req.student.id, students.profileFromBody(req.body || {}));
      res.redirect("/portal/profile?done=" + encodeURIComponent("Your details are saved."));
    } catch (e) {
      next(e);
    }
  });

  async function renderSettings(req,res,extra={}) {
    const me=await fullStudent(req);
    view(res,"settings",{
      ...shell(me,"settings"),notice:req.query.done||null,error:req.query.error||null,
      billingDetails:await billingAddress.current(me.id),billingCsrf:csrf.token(req,res),
      billingNotice:req.query.billing==='saved'?'Your address is saved for future invoices. Issued invoices keep their recorded details; request any correction from the invoice page.':null,...extra,
    });
  }
  router.get("/settings",requireStudent,async(req,res,next)=>{try{await renderSettings(req,res);}catch(e){next(e);}});

  router.post("/settings/password", requireStudent, async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = await students.changePassword(
        req.student.id,
        body.current_password,
        body.new_password
      );
      if (!result.ok) {
        return res.redirect("/portal/settings?error=" + encodeURIComponent(result.reason));
      }
      // Every older session is now invalid, this one included, so it is
      // reissued at the new version rather than signing them out.
      setSession(res, req.student.id, result.tokenVersion);
      res.redirect(
        "/portal/settings?done=" +
          encodeURIComponent("Your password is changed. Anyone else signed in has been signed out.")
      );
    } catch (e) {
      next(e);
    }
  });

  // The app-wide body limit is 64kb, which is right for every other
  // form here and too small for a photo. Raised on this one route only,
  // to a little over what lib/avatar.js will accept, so the parser
  // rejects the truly absurd and the validator handles the rest.
  const avatarBody = express.urlencoded({
    extended: false,
    limit: "600kb",
    parameterLimit: 8,
  });

  router.post("/settings/avatar", requireStudent, avatarBody, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (body.remove) {
        await students.clearAvatar(req.student.id);
        return res.redirect("/portal/settings?done=" + encodeURIComponent("Your photo is removed."));
      }

      const parsed = avatar.fromDataUrl(body.image);
      if (!parsed.ok) {
        return res.redirect("/portal/settings?error=" + encodeURIComponent(parsed.reason));
      }
      await students.setAvatar(req.student.id, parsed.buffer, parsed.type);
      res.redirect("/portal/settings?done=" + encodeURIComponent("Your photo is updated."));
    } catch (e) {
      next(e);
    }
  });

  // ── Einbürgerungstest ───────────────────────────────────────────
  //
  // The practice itself lives on the public page and needs no account.
  // This is the record of it: the same progress, kept against the
  // student so it survives a new phone, with the readiness figures and
  // an optional exam date to aim at.

  router.get("/einbuergerungstest", requireStudent, async (req, res, next) => {
    try {
      const me = await fullStudent(req);
      const progress = await etProgress.read(me.id);

      const states = catalogue.stateList();
      const chosen = states.find((s) => s.slug === progress.bundesland) || null;
      const pool = chosen
        ? catalogue.load().general.concat(catalogue.stateBySlug(chosen.slug).questions)
        : catalogue.load().general;

      const stats = etCore.readiness(pool, progress.history);
      const days = etCore.daysUntil(progress.examDate);

      view(res, "einbuergerungstest", {
        ...shell(me, "einbuergerungstest"),
        ready: catalogue.isReady(),
        states,
        chosen,
        progress,
        stats,
        categories: etCore.byCategory(pool, progress.history),
        days,
        advice: etCore.advice(stats, days),
        rules: catalogue.RULES,
        notice: req.query.done || null,
        error: req.query.error || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/einbuergerungstest/termin", requireStudent, async (req, res, next) => {
    try {
      // `clear` wins over whatever the date box happens to hold: the
      // reader pressed remove, and the box still carrying the old date is
      // the state they are asking to be rid of.
      const body = req.body || {};
      const wanted = body.clear ? "" : body.exam_date;
      const result = await etProgress.setExamDate(req.student.id, wanted);
      const key = result.ok ? "done" : "error";
      const text = result.ok
        ? (result.examDate ? "Prüfungstermin gespeichert." : "Prüfungstermin entfernt.")
        : result.reason;
      res.redirect("/portal/einbuergerungstest?" + key + "=" + encodeURIComponent(text));
    } catch (e) {
      next(e);
    }
  });

  /**
   * Sync from the browser.
   *
   * Called by the practice page when somebody is signed in. The two
   * sides are merged rather than overwritten, so practising on a
   * phone and a laptop does not cost a morning's work, and the merged
   * result comes back for the browser to adopt.
   */
  router.post("/einbuergerungstest/sync", requireStudent, express.json({ limit: "512kb" }),
    async (req, res, next) => {
      try {
        const result = await etProgress.sync(req.student.id, req.body);
        if (!result.ok) return res.status(503).json({ ok: false, error: result.reason });
        res.json({ ok: true, progress: result.progress });
      } catch (e) {
        next(e);
      }
    });

  /** Lets the public page discover whether there is an account to sync to. */
  /**
   * Who is signed in, for the account button in the site header.
   *
   * The header is on every public page, and public pages are cached —
   * by the service worker, and by anything in front of the server — so
   * the signed-in state cannot be rendered into them. It is asked for
   * afterwards instead, from here.
   *
   * Deliberately thin: a name, a photo URL and the initials to fall
   * back to. No email, no reference, no course list. This is the one
   * endpoint on the site that answers a question about a person
   * without being asked to prove anything first, so what it will say
   * has to be the least that makes a menu.
   *
   * Never stored. It sits under /portal, which the service worker
   * leaves alone entirely, and it says so in its own headers too — a
   * cached "signed in as …" on a shared machine is somebody else's
   * name on your screen.
   */
  router.get("/session.json", async (req, res) => {
    res.set("Cache-Control", "no-store, private");
    res.set("Vary", "Cookie");
    try {
      const me = db.isEnabled() ? await students.current(req) : null;
      if (!me) return res.json({ signedIn: false });
      const full = await portal.profile(me.id);
      const updated = full && full.avatar_updated_at;
      res.json({
        signedIn: true,
        name: me.name,
        // Cache-busted by the time the photo was last changed, so a
        // new photo appears immediately rather than after the browser
        // gives up on the old one.
        avatarUrl: updated ? "/portal/avatar?v=" + new Date(updated).getTime() : null,
        initials: avatar.initials(me.name),
        hue: avatar.hue(me.student_ref || me.email),
      });
    } catch {
      // A database that is down must not take the header with it. The
      // button falls back to what it is without JavaScript: a link to
      // the sign-in page.
      res.json({ signedIn: false });
    }
  });

  router.get("/einbuergerungstest/status", async (req, res) => {
    try {
      const me = db.isEnabled() ? await students.current(req) : null;
      if (!me) return res.json({ signedIn: false });
      res.json({ signedIn: true, name: me.name, progress: await etProgress.read(me.id) });
    } catch {
      res.json({ signedIn: false });
    }
  });

  /**
   * Close the account, at the student's own request.
   *
   * The password is asked for again even though they are signed in:
   * this is the one action on the site that cannot be undone, and a
   * borrowed laptop should not be enough to do it.
   */
  router.post("/settings/close", requireStudent, async (req, res, next) => {
    try {
      const body = req.body || {};
      const check = await students.authenticate(req.student.email, body.password || "");
      if (!check || !check.ok) {
        return res.redirect(
          "/portal/settings?error=" +
            encodeURIComponent("That password is not right, so nothing was deleted.")
        );
      }

      const result = await students.closeAccount(req.student.id, { ip: ipOf(req) });
      if (!result.ok) {
        return res.redirect("/portal/settings?error=" + encodeURIComponent(result.reason));
      }

      res.clearCookie(students.COOKIE, { path: "/" });
      view(res, "closed", { retained: result.retained });
    } catch (e) {
      next(e);
    }
  });

  /**
   * The photo itself.
   *
   * No id in the URL: it always serves the signed-in student's own
   * photo, so there is nothing to enumerate and no way to ask for
   * someone else's. Private in the cache headers for the same reason —
   * this is a person's face on a shared computer.
   */
  router.get("/avatar", requireStudent, async (req, res, next) => {
    try {
      const found = await students.avatarFor(req.student.id);
      if (!found) return res.status(404).end();

      res.set("Content-Type", found.type);
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
      res.set("X-Content-Type-Options", "nosniff");
      // The URL carries the timestamp, so a cached copy is only ever the
      // current photo. Private: never a shared proxy.
      res.set("Cache-Control", "private, max-age=86400");
      res.send(found.buffer);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { build, requireStudent, safeNext };
