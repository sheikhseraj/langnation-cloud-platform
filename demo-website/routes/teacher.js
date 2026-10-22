// ─────────────────────────────────────────────────────────────────────
//  The teacher portal: claim an invitation, sign in, teach.
//
//  Mounted at /teach. Everything under /teach/me needs a session;
//  /teach/login and /teach/invite/:token are where you get one, and
//  there is nothing else public here.
//
//  Three decisions worth knowing before reading:
//
//  1. There is no sign-up. A teacher account is created by the office
//     and claimed from an emailed link. "May this person see a class
//     list" is not a question a public form gets to answer.
//
//  2. This is not /admin with a different sidebar. A teacher sees the
//     batches they teach and the students on them, and nothing else —
//     no enquiries, no invoices, no other teacher's class. The filter
//     is in lib/teaching.js, in the WHERE clause of every query.
//
//  3. When SMTP is not configured the invitation link is shown to the
//     office on screen instead of emailed, and only on a staging host.
//     That is what makes the flow walkable before SMTP exists; on a
//     production host it is never displayed.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");
const csrf=require("../lib/csrf");
const teachers = require("../lib/teachers");
const teaching = require("../lib/teaching");
const exercises = require("../lib/exercises");
const attendance = require("../lib/attendance");
const lessons = require("../lib/lessons");
const backlog = require("../lib/backlog");
const lessonMail = require("../lib/lesson-mail");
const sched = require("../lib/schedule");
const db = require("../lib/db");
const site = require("../lib/site");
const avatar = require("../lib/avatar");
const mailer = require("../lib/mailer");
const T = require("../lib/mail-template");
const content = require("../lib/content");

const classLinks = require("../lib/class-links");

function view(res, page, extra = {}) {
  res.render(`pages/teach/${page}`, {
    site,
    classLinks,
    teacher: null,
    error: null,
    notice: null,
    errors: {},
    values: {},
    ...extra,
  });
}

function setSession(res, teacherId, tokenVersion) {
  const expiresAt = Date.now() + teachers.MAX_AGE_MS;
  res.cookie(teachers.COOKIE, teachers.signSession(teacherId, tokenVersion, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: site.origin.startsWith("https://"),
    maxAge: teachers.MAX_AGE_MS,
    path: "/",
  });
}

const dbDown = (res) =>
  view(res, "unavailable", {
    error: "The teacher portal needs the database, which is not configured on this server yet.",
  });

/**
 * The caller's address, behind Hostinger's proxy.
 *
 * x-forwarded-for is a list when there are several proxies; the first
 * entry is the client. Used for rate limiting only, never for
 * authorisation — a header is trivially forged.
 */
const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();

/**
 * Throttling for the "forgot my password" form.
 *
 * Keyed twice by the caller: once on the address and once on the email
 * being asked about. Without the second, a hundred machines can fill
 * one teacher's inbox with reset links and the only thing stopping them
 * is that none of the links is theirs.
 *
 * In memory rather than in the database: it only has to survive long
 * enough to stop a burst, and a restart clearing it is not a problem
 * worth a table.
 */
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const attempts = new Map();

function resetLimited(key) {
  const now = Date.now();
  const hits = (attempts.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  attempts.set(key, hits);

  // Opportunistic sweep, so the map cannot grow without bound.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) attempts.delete(k);
    }
  }
  return hits.length > RATE_MAX;
}

/** Gate for everything under /teach/me. */
async function requireTeacher(req, res, next) {
  try {
    // Checked before the session, so a teacher holding a valid cookie
    // during a database outage is told the portal is unavailable rather
    // than hitting a query that throws and getting a 500.
    if (!db.isEnabled()) return dbDown(res);

    const me = await teachers.current(req);
    if (!me) {
      const to = req.originalUrl.startsWith("/teach/") ? req.originalUrl : "";
      return res.redirect(`/teach/login${to ? `?next=${encodeURIComponent(to)}` : ""}`);
    }
    req.teacher = me;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * A safe internal redirect target under /teach, or the dashboard.
 *
 * Anything that could leave the site is refused. A naive startsWith("/")
 * lets through "//evil.com", which a browser reads as protocol-relative
 * and follows off-site; some parsers treat a backslash the same way.
 * The login page itself is refused too, or a bounced sign-in loops back
 * on itself forever.
 */
function safeNext(raw) {
  const s = String(raw || "").trim();
  if (!s.startsWith("/teach/")) return "/teach/me";
  if (s.startsWith("//") || s.includes("\\")) return "/teach/me";
  if (s.startsWith("/teach/login")) return "/teach/me";
  return s;
}

/**
 * The teacher terms, for the dialog on the invitation page.
 *
 * The same arrangement as the student side: the text travels with the
 * page so that accepting means having read it, and the path travels
 * with it as the no-JavaScript fallback.
 */
function termsFor() {
  const terms = content.page("teacher-terms-and-conditions", "en");
  return {
    termsHtml: terms ? terms.body : null,
    termsTitle: terms ? terms.title : "Teacher Terms and Conditions",
    termsPath: teachers.TERMS_PATH,
  };
}

function build() {
  const router = express.Router();
  router.use((req,res,next)=>{res.locals.classJoinCsrf=csrf.token(req,res);next();});

  // Private to one member of staff, and none of it indexable or
  // cacheable by a shared proxy.
  router.use((req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store, private");
    next();
  });

  /** /teach on its own — the address somebody actually types. */
  router.get("/", async (req, res) => {
    if (!db.isEnabled()) return dbDown(res);
    try {
      const me = await teachers.current(req);
      return res.redirect(me ? "/teach/me" : "/teach/login");
    } catch {
      return res.redirect("/teach/login");
    }
  });

  // ── Claiming an invitation ────────────────────────────────────────

  router.get("/invite/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);
      const invited = await teachers.findInvite(req.params.token);
      if (!invited) {
        return view(res, "login", {
          error:
            "That invitation is not valid — it may have expired or already been used. " +
            "Ask the office to send a new one.",
        });
      }
      view(res, "invite", { invited, token: req.params.token, errors: {}, ...termsFor() });
    } catch (e) {
      next(e);
    }
  });

  router.post("/invite/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const invited = await teachers.findInvite(req.params.token);
      if (!invited) {
        return view(res, "login", { error: "That invitation is no longer valid." });
      }

      const result = await teachers.claimInvite(req.params.token, req.body.password, {
        accept: Boolean(req.body.accept),
      });
      if (!result.ok) {
        if (result.reason === "expired") {
          return view(res, "login", { error: "That invitation is no longer valid." });
        }
        return view(res, "invite", {
          invited,
          token: req.params.token,
          ...termsFor(),
          // Keyed by field, so the message lands next to the control it
          // is about — a missed tick box reported under the password is
          // how somebody retypes a perfectly good password three times.
          errors: { [result.field || "password"]: result.reason },
        });
      }

      // Straight in. They followed a link only they received and have
      // just chosen the password; asking for it again is friction with
      // nothing gained.
      setSession(res, result.teacherId, result.tokenVersion);
      res.redirect("/teach/me?welcome=1");
    } catch (e) {
      next(e);
    }
  });

  // ── Forgotten passwords ───────────────────────────────────────────
  //
  // The same three steps as the student portal. The form says the same
  // thing whether or not the address has an account — on a staff portal
  // that matters more, not less: "does this address have an account" is
  // the answer to "does this person work here".

  // No database check on the way in. The sign-in page renders without
  // one and this is the same kind of page — a public form. Submitting
  // it is what needs the database, and that is where it is checked.
  router.get("/forgot", (req, res) => {
    view(res, "forgot", { values: {} });
  });

  router.post("/forgot", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const email = String(req.body.email || "");
      if (resetLimited(ipOf(req)) || resetLimited("who:" + email.toLowerCase().trim())) {
        return view(res, "forgot", {
          error: "Too many attempts. Please try again shortly.",
          values: { email },
        });
      }

      const result = await teachers.requestReset(email);

      if (result.found) {
        const url = `${site.origin}/teach/reset/${encodeURIComponent(result.token)}`;
        await mailer.send({
          to: result.email,
          subject: "Reset your LangNation teacher password",
          html: T.wrap({
            title: "Reset your password",
            body:
              T.p(`Hello ${T.escapeHtml(result.name)},`) +
              T.p(
                "Somebody asked to reset the password on your LangNation teacher " +
                  "portal account. If that was you, use the button below."
              ) +
              `<div style="margin:18px 0">${T.button("Choose a new password", url)}</div>` +
              T.p(
                `<span style="color:${T.MUTED};font-size:13px">The link works once and stops working in an hour. ` +
                  "If you did not ask for this, ignore this email — nothing has changed. " +
                  "Tell the office if it keeps happening.<br>" +
                  `<span style="word-break:break-all">${T.escapeHtml(url)}</span></span>`
              ),
            footer: "Questions? Just reply to this email and it reaches the office.",
          }),
          text: T.text([
            `Hello ${result.name},`,
            "",
            "Somebody asked to reset the password on your LangNation teacher portal account.",
            "If that was you, open this link to choose a new one:",
            "",
            url,
            "",
            "It works once and stops working in an hour.",
            "If you did not ask for this, ignore this email — nothing has changed.",
          ]),
        });
      }

      view(res, "forgot", { notice: "sent", values: { email } });
    } catch (e) {
      next(e);
    }
  });

  router.get("/reset/:token", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);
      const row = await teachers.findReset(req.params.token);
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

      const result = await teachers.resetPassword(req.params.token, req.body.password);
      if (!result.ok) {
        if (result.reason === "expired") {
          return view(res, "forgot", {
            error: "That link is no longer valid. Ask for a new one below.",
            values: {},
          });
        }
        const row = await teachers.findReset(req.params.token);
        return view(res, "reset", {
          token: req.params.token,
          email: row ? row.email : "",
          errors: { password: result.reason },
        });
      }

      setSession(res, result.teacherId, result.tokenVersion);
      res.redirect("/teach/me");
    } catch (e) {
      next(e);
    }
  });

  // ── Sign in ───────────────────────────────────────────────────────

  router.get("/login", async (req, res, next) => {
    try {
      if (db.isEnabled()) {
        const me = await teachers.current(req);
        if (me) return res.redirect("/teach/me");
      }
      view(res, "login", { values: { next: safeNext(req.query.next) } });
    } catch (e) {
      next(e);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      if (!db.isEnabled()) return dbDown(res);

      const email = String(req.body.email || "");
      const nextPath = safeNext(req.body.next);
      const result = await teachers.authenticate(email, String(req.body.password || ""));

      if (!result.ok) {
        // One message for a wrong password, an unknown address and a
        // suspended account. Telling them apart turns the form into a
        // way to ask who works here and who has just been let go.
        //
        // The unclaimed invitation is the one exception, and it is safe:
        // it is only ever reached by somebody who already knows the
        // address, and without it a new teacher is stuck at a login
        // form being told their correct details are wrong.
        const message =
          result.reason === "locked"
            ? `Too many attempts. Please try again in ${Math.ceil(result.secondsLeft / 60)} minutes.`
            : result.reason === "not-claimed"
              ? "This account has not been set up yet. Open the link in your invitation email to choose a password."
              : "Those details do not match. If you have just been added, check your email for the invitation link.";
        return view(res, "login", { error: message, values: { email, next: nextPath } });
      }

      setSession(res, result.teacherId, result.tokenVersion);
      return res.redirect(nextPath);
    } catch (e) {
      next(e);
    }
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(teachers.COOKIE, { path: "/" });
    res.redirect("/teach/login");
  });

  // ── The portal proper ─────────────────────────────────────────────

  /**
   * A class list, with each student's face worked out once.
   *
   * Done here rather than in the template because a monogram is three
   * decisions — photo or not, which two letters, which colour — and a
   * template that makes them inline makes them differently on each of
   * the three pages that show a roster.
   */
  const withFaces = (rows) =>
    rows.map((s) => ({
      ...s,
      photo: s.avatar_updated_at
        ? `/teach/student/${s.id}/photo?v=${new Date(s.avatar_updated_at).getTime()}`
        : null,
      initials: avatar.initials(s.name),
      hue: avatar.hue(s.student_ref || s.email),
    }));

  /** Everything the shell needs on every page. */
  const shell = (me, current) => ({
    teacher: me,
    nav: current,
    avatarUrl: me.avatar_updated_at
      ? `/teach/avatar?v=${new Date(me.avatar_updated_at).getTime()}`
      : null,
    // Past the honorific first: the office enters "Frau Weber", and a
    // monogram of FW is the initials of a courtesy title.
    initials: avatar.initials(teachers.bareName(me.name)),
    hue: avatar.hue(me.email),
    greeting: teachers.greeting(me.name),
  });

  router.get("/me", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const [rows, standIn] = await Promise.all([
        teaching.batches(me.id),
        // A class somebody handed to this teacher. It is not in
        // batches() and must not be — that would give them the batch —
        // so it is fetched beside it and the two are weighed against
        // each other on the clock.
        teaching.standingIn(me.id),
      ]);
      // Not named `next`: that is the Express callback this handler was
      // given, and shadowing it is a syntax error rather than a subtle
      // bug — which is the one mercy in it.
      const upNext = teaching.nextUp(rows, standIn);

      // Only the roster of the batch actually on screen. Loading all of
      // them to show one is the kind of thing that is invisible with
      // three batches and a problem with thirty.
      const [roster, slipping, owed, series] = await Promise.all([
        // Not for a class you are only standing in for: the roster is
        // the batch's and the batch is not yours. The register on the
        // day is, and that is a different page with a different query.
        upNext && !Number(upNext.batch.standing_in)
          ? teaching.roster(me.id, upNext.batch.id).then(withFaces)
          : [],
        // Across every running batch, not just the one on screen. The
        // whole reason for keeping a register is that nobody spots a
        // student drifting away by reading back through registers.
        attendance.concerns(me.id),
        // Registers not yet taken. On the dashboard rather than only on
        // the register page, because the whole failure this addresses is
        // a teacher who did not go to the register page.
        backlog.forTeacher(me.id),
        // The shape of the term, so a teacher can see a batch sliding
        // before any one student has slipped far enough to be named
        // below it.
        attendance.teacherSeries(me.id),
      ]);

      view(res, "dashboard", {
        ...shell(me, "dashboard"),
        pending: owed,
        pendingSummary: backlog.summarise(owed),
        chart: attendance.toChart(series),
        lineColour: attendance.lineColour,
        stats: teaching.summarise(rows),
        next: upNext,
        roster,
        slipping,
        today: attendance.normaliseDate(null),
        batches: rows,
        notice: req.query.welcome
          ? "Your account is set up. This is your portal."
          : req.query.done || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/batches", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const rows = await teaching.batches(me.id);
      view(res, "batches", { ...shell(me, "batches"), batches: rows, stats: teaching.summarise(rows) });
    } catch (e) {
      next(e);
    }
  });

  router.get("/batch/:id", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const id = Number(req.params.id);
      const found = await teaching.batch(me.id, id);
      // Not theirs and does not exist are the same answer, because
      // telling them apart is how somebody maps the batch table by
      // typing numbers into the address bar.
      if (!found) {
        res.status(404);
        return view(res, "missing", shell(me, "batches"));
      }

      const [roster, materials, attended, registers] = await Promise.all([
        teaching.roster(me.id, id),
        teaching.materials(me.id, id),
        attendance.summaryFor(me.id, id),
        attendance.recentRegisters(me.id, id, 8),
      ]);

      // Attendance is keyed onto the roster rather than listed
      // separately: a teacher looking at a class list wants the two
      // facts about a student in one row, not in two tables that have
      // to be read against each other.
      const byStudent = new Map(attended.map((a) => [Number(a.id), a]));

      view(res, "batch", {
        ...shell(me, "batches"),
        batch: found,
        roster: withFaces(roster).map((r) => ({ ...r, attendance: byStudent.get(Number(r.id)) || null })),
        materials,
        registers,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── The register ──────────────────────────────────────────────────
  //
  // A batch and a day. Everything else — which lesson row it belongs
  // to, whether that row had to be created — is lib/attendance.js's
  // problem, because the teacher's version of this is "I taught them
  // this morning" and the page should not ask them anything else.

  /**
   * Open the room, and record that it opened.
   *
   * A POST rather than a link, because it writes. A link that changes
   * something is followed by every prefetcher and link-preview bot that
   * sees it, and here that would start a class nobody is in.
   *
   * The meeting URL comes back from the database rather than from the
   * form, so the button cannot be pointed anywhere else.
   */
  router.post("/batch/:id/start", requireTeacher, async (req, res, next) => {
    if(!csrf.valid(req))return res.status(403).send('Reload your class and try opening it again.');
    try {
      const me = req.teacher;
      const id = Number(req.params.id);
      const open = await attendance.startClass(me.id, id, attendance.normaliseDate(null));

      if (!open || !open.meetingUrl) {
        if (String(req.get("accept") || "").includes("application/json")) return res.status(404).json({ok:false,error:"The class start could not be recorded. Please contact the office."});
        res.status(open ? 400 : 404);
        return view(res, "missing", shell(me, "batches"));
      }
      if (String(req.get("accept") || "").includes("application/json")) return res.json({ok:true});
      res.redirect(303,open.meetingUrl);
    } catch (e) {
      next(e);
    }
  });

  router.get("/batch/:id/register", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const day = attendance.normaliseDate(req.query.date);
      if (!day) {
        // A future date, or something that is not a date at all. Back
        // to today rather than an error: the only way to get here is by
        // editing the address bar or following a stale link.
        return res.redirect(`/teach/batch/${Number(req.params.id)}/register`);
      }

      const open = await attendance.openRegister(me.id, Number(req.params.id), day);
      if (!open) {
        res.status(404);
        return view(res, "missing", shell(me, "batches"));
      }

      view(res, "register", {
        ...shell(me, "batches"),
        ...open,
        rows: withFaces(open.rows),
        statuses: attendance.STATUSES,
        today: attendance.normaliseDate(null),
        // Calling the class off, or moving it, from the page a teacher
        // is already on. The backlog banner sends them here to "take it
        // now", and until this existed the only way to clear a class
        // that never happened was to mark everybody absent — which is
        // not a correction, it is a lie about five people.
        canChange: db.hasColumn("lessons.generated"),
        canEmail: mailer.isConfigured(),
        noteMax: lessons.NOTE_MAX,
        cancelReasons: lessons.CANCEL_REASONS,
        // Handing this one class to another teacher. Everybody with an
        // account, minus yourself — the office is emailed whoever is
        // chosen, which is what makes an open list acceptable.
        canHandOver: lessons.HAS_HANDOVER(),
        teacherOptions: (await teachers.options()).filter(
          (t) => Number(t.id) !== Number(me.id)
        ),
        notice: req.query.done || null,
        error: req.query.error || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/batch/:id/register", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const id = Number(req.params.id);
      const body = req.body || {};

      // status[s91]=late, note[s91]=... — one group per student, keyed
      // by their id with an "s" in front of it.
      //
      // The prefix is the whole point and it is not decoration. With a
      // bare number, qs — which is what express's extended parser uses —
      // sees status[2], status[3], status[6] as an ARRAY, and an array
      // has no holes: the keys come back 0,1,2 and the student ids are
      // gone. Marks then land on whoever happens to hold those ids.
      //
      // That is not a miscount, it is the wrong attendance against the
      // wrong person, and it is silent while everybody is present. A
      // register of five saved two, which is how it was noticed. A
      // non-numeric key cannot become an index.
      const statuses = body.status && typeof body.status === "object" ? body.status : {};
      const notes = body.note && typeof body.note === "object" ? body.note : {};
      const lates = body.late && typeof body.late === "object" ? body.late : {};

      const marks = Object.keys(statuses)
        // Anything not of that shape did not come from this form.
        .filter((key) => /^s\d+$/.test(key))
        .map((key) => ({
          studentId: key.slice(1),
          status: statuses[key],
          minutesLate: lates[key],
          note: notes[key],
        }));

      const day = attendance.normaliseDate(body.date) || attendance.normaliseDate(null);
      const result = await attendance.saveRegister(me.id, id, day, marks, me.id);
      const back = `/teach/batch/${id}/register?date=${encodeURIComponent(day)}`;

      if (!result.ok) {
        return res.redirect(back + "&error=" + encodeURIComponent(result.reason));
      }
      res.redirect(
        back + "&done=" + encodeURIComponent(
          `Register saved — ${result.saved} ${result.saved === 1 ? "student" : "students"}.`
        )
      );
    } catch (e) {
      next(e);
    }
  });

  router.get("/schedule", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      /* How far to look, in weeks, forward and back.

         Six weeks of three batches is fifty-four lessons, which is a
         page nobody reads to the end. Two is the ordinary question —
         what am I teaching, and what have I not written down yet — and
         the rest is a link away. A fixed set rather than any number:
         this decides an INTERVAL, and it is not somewhere to accept
         arbitrary input. */
      /* One half of the page, or both.

         Two columns is right when you are planning and wrong when you
         are concentrating: what is coming and what you still owe are
         separate jobs, and having both on screen means reading past one
         to work on the other.

         A query string rather than a fold, so the view has an address —
         a teacher who works from the backlog can keep /teach/schedule
         ?show=past open and it stays that way. */
      const SHOWS = ["both", "next", "past"];
      const show = SHOWS.includes(req.query.show) ? req.query.show : "both";

      const WEEK_CHOICES = [2, 4, 6];
      const askedWeeks = Number(req.query.weeks);
      const weeks = WEEK_CHOICES.includes(askedWeeks) ? askedWeeks : 2;

      const [rows, upcoming, owed, history] = await Promise.all([
        teaching.batches(me.id),
        teaching.lessons(me.id, { days: weeks * 7 }),
        backlog.forTeacher(me.id),
        // What is BEHIND the teacher. The list above is what is coming;
        // "which dates have I done" is the other half of the same
        // question and had no page answering it.
        attendance.registerHistory(me.id, { days: weeks * 7 }),
      ]);
      // One batch, or all of them.
      //
      // A teacher with three classes was reading fifty-four lessons in
      // one list, three batches deep, in date order. Every row was
      // correct and the page was unusable: "when is my next A2 class"
      // meant scanning for the code among two other batches' rows.
      //
      // Validated against their OWN batches rather than trusted: this
      // comes from a query string, and an id from a query string is not
      // a permission to see a batch.
      const asked = Number(req.query.batch);
      const only = rows.some((b) => Number(b.id) === asked) ? asked : null;
      const mine = (list) => (only ? list.filter((x) => Number(x.intake_id) === only) : list);

      view(res, "schedule", {
        ...shell(me, "schedule"),
        batches: rows,
        lessons: mine(upcoming),
        pending: mine(owed),
        pendingSummary: backlog.summarise(mine(owed)),
        history: mine(history),
        only,
        show,
        weeks,
        weekChoices: WEEK_CHOICES,
        // Handing a class over from the schedule, which is where a
        // teacher goes when they already know which date is a problem.
        // It was only on the register page, one hop further in, and
        // folded away under a heading about classes that did not
        // happen — which is not where anybody looked for it.
        canHandOver: lessons.HAS_HANDOVER(),
        teacherOptions: (await teachers.options()).filter(
          (t) => Number(t.id) !== Number(me.id)
        ),
        sched,
        // Whether the Change controls can do anything at all. Shipped
        // ahead of its migration the buttons would be there and every
        // one of them would fail, which is worse than not offering
        // them.
        canChange: db.hasColumn("lessons.generated"),
        canEmail: mailer.isConfigured(),
        noteMax: lessons.NOTE_MAX,
        cancelReasons: lessons.CANCEL_REASONS,
        notice: req.query.done || null,
        error: req.query.error || null,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Moving and calling off a class ────────────────────────────────
  //
  // Both go through lib/lessons.js, which owns the rules: a held lesson
  // cannot be changed, a change carries a reason, and ownership covers
  // the cover teacher as well as the teacher.
  //
  // The email is sent AFTER the change is saved, and a failure to send
  // never undoes it. Students being told late is a problem; a class
  // that silently did not move because the mail server was down is a
  // worse one. The count comes back either way so the page can say what
  // actually happened rather than implying that silence meant success.
  const announce = async (result, kind) => {
    if (!result.ok) return "";
    let people = [];
    try {
      people = await lessons.recipients(result.lesson.intake_id);
    } catch (e) {
      console.error("Lesson recipients failed:", e.message);
      return " Students could not be looked up, so nobody was emailed.";
    }
    if (!people.length) return " Nobody is enrolled yet, so no email was sent.";

    const out = await lessonMail.announce(people, result.lesson, kind);
    if (!out.configured) {
      return ` ${out.total} ${out.total === 1 ? "student" : "students"} not emailed — no mail server is set up.`;
    }
    if (out.sent === out.total) {
      return ` ${out.sent} ${out.sent === 1 ? "student" : "students"} emailed.`;
    }
    return ` Emailed ${out.sent} of ${out.total} — ${out.failed.join(", ")} could not be reached.`;
  };

  /* Back where the teacher was, not always to the schedule.

     The same two actions are now reachable from the register page, and
     sending somebody to a different screen after they act is how a
     person loses their place. Only our own paths are accepted: a
     redirect target from a form body is somewhere an open redirect
     comes from. */
  const safeBack = (value) => {
    const to = String(value || "");
    // No "..", or /teach/../admin walks out of the portal it is scoped
    // to. It cannot leave the site, but a redirect target taken from a
    // form body should not be able to choose the destination either.
    if (to.includes("..")) return "/teach/schedule";
    return /^\/teach\/[A-Za-z0-9/_?=&.-]*$/.test(to) ? to : "/teach/schedule";
  };

  const backTo = (res, done, error, to) => {
    const base = safeBack(to);
    const join = base.includes("?") ? "&" : "?";
    return res.redirect(
      base + join +
        (error ? "error=" + encodeURIComponent(error) : "done=" + encodeURIComponent(done))
    );
  };

  router.post("/lesson/:id/cancel", requireTeacher, async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = await lessons.cancel(req.params.id, req.teacher.id, {
        reason: body.reason,
        note: body.note,
      });
      if (!result.ok) return backTo(res, null, result.reason, body.back);

      const sent = body.notify ? await announce(result, "cancelled") : "";
      backTo(res, "Class cancelled." + sent, null, body.back);
    } catch (e) {
      next(e);
    }
  });

  router.post("/lesson/:id/move", requireTeacher, async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = await lessons.reschedule(req.params.id, req.teacher.id, {
        date: body.date,
        time: body.time,
        minutes: body.minutes,
        note: body.note,
      });
      if (!result.ok) return backTo(res, null, result.reason, body.back);

      const sent = body.notify ? await announce(result, "moved") : "";
      backTo(res, "Class moved." + sent, null, body.back);
    } catch (e) {
      next(e);
    }
  });

  router.post("/lesson/:id/restore", requireTeacher, async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = await lessons.restore(req.params.id, req.teacher.id, { note: body.note });
      if (!result.ok) return backTo(res, null, result.reason, body.back);

      const sent = body.notify ? await announce(result, "moved") : "";
      backTo(res, "Class put back on." + sent, null, body.back);
    } catch (e) {
      next(e);
    }
  });

  // ── Settings ──────────────────────────────────────────────────────

  /* ── Attendance: the term, as a list of dates to tick off ─────────
   *
   * Taking a register already existed, one date at a time, reached
   * from a batch page or the schedule. What did not exist was the
   * question a teacher actually asks: which dates have I done and
   * which do I still owe.
   *
   * So this is a view over what is already there rather than a second
   * way of recording anything — the dates link to the same register
   * screen, which remains the only thing that writes a mark.
   */
  router.get("/attendance", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const mine = await teaching.batches(me.id);
      const chosen = Number(req.query.batch) || (mine[0] ? mine[0].id : 0);
      // Their own class or nothing: the dropdown offers only theirs,
      // but a dropdown is a suggestion and this reads the address bar.
      const found = chosen ? await teaching.batch(me.id, chosen) : null;

      const rows = found ? await attendance.batchRegisters(me.id, found.id) : [];
      const lessons = rows.map((r) => ({ ...r, state: attendance.registerState(r) }));

      /* How far to look, in weeks, forward and back — the same control
         the schedule uses, because it is the same question. A term is
         sixty-four dates and a page of sixty-four is a page nobody
         reads to the end.

         The window narrows the TABLE and never the list of what is
         owed: a register missed two months ago is exactly the one that
         must not scroll off. */
      const CHOICES = [2, 4, 6];
      const asked = Number(req.query.weeks);
      const weeks = CHOICES.includes(asked) ? asked : 2;

      /* Which of the three lists is open.
       *
       * Both halves at once wanted two tables side by side, and the
       * page is capped at --wrap: each half got about 370px however
       * wide the screen was. One at a time, chosen from a segmented
       * control, and today gets a place of its own instead of being a
       * row to find in a column of thirty.
       *
       * The default follows the day: a teacher opening this on a
       * teaching morning wants today, and on any other day wants what
       * is coming. Which is why every link on the page carries show
       * rather than leaving it off — a link without it would land
       * somewhere that depends on the date it is followed.
       */
      const SHOWS = ["next", "today", "past"];
      const today = attendance.normaliseDate(null);
      const onToday = lessons.some(
        (l) => String(l.day).slice(0, 10) === today && l.state !== "cancelled"
      );
      const show = SHOWS.includes(req.query.show)
        ? req.query.show
        : onToday ? "today" : "next";

      view(res, "attendance", {
        ...shell(me, "attendance"),
        batches: mine,
        chosen: found || null,
        lessons,
        // What is owed, which is the number the page exists to show.
        owed: lessons.filter((l) => l.state === "pending").length,
        weeks,
        weekChoices: CHOICES,
        show,
        // The "it did not happen" form on the owed list.
        noteMax: lessons.NOTE_MAX,
        cancelReasons: lessons.CANCEL_REASONS,
        summary: found ? await attendance.summaryFor(me.id, found.id) : [],
      });
    } catch (e) {
      next(e);
    }
  });

  /* ── Homework, for the teacher who teaches the class ──────────────
   *
   * The same three things the office's screen does — give it out, take
   * it back, see who has what — with one difference that runs through
   * every line of it: a teacher can only ever reach their own class.
   *
   * ── How that is enforced ────────────────────────────────────────
   *
   * Not by hiding the other batches from the dropdown. A dropdown is a
   * suggestion; the form behind it can be posted with any number in
   * it. Three things are checked on every write:
   *
   *   1. the batch is one of theirs        (teaching.batch, which
   *                                         joins on OWNS())
   *   2. the course saved on the homework IS that batch, taken from
   *      the verified row and never from the form
   *   3. every address is on that batch's roster, and anything else is
   *      dropped rather than refused — a teacher who ticks somebody,
   *      changes class and presses Unlock should give homework to the
   *      class in front of them, not to whoever was ticked before
   *
   * The office's screen can give to anybody on any course. This one
   * cannot, and that is the whole point of it existing: the office
   * should not have to be in the room for a teacher to set homework.
   */
  const teacherClass = async (me, id) => {
    const batch = await teaching.batch(me.id, Number(id) || 0);
    if (!batch) return null;
    const roster = await teaching.roster(me.id, batch.id);
    return { batch, roster: roster.filter((r) => r.status === "active") };
  };

  router.get("/homework", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const mine = await teaching.batches(me.id);
      const chosen = Number(req.query.batch) || (mine[0] ? mine[0].id : 0);
      const found = chosen ? await teacherClass(me, chosen) : null;

      const chapters = exercises.library();
      const has = found ? await exercises.given(chapters) : new Map();
      const ix = new Map(chapters.map((c, i) => [c.id, i]));
      const key = found ? String(found.batch.id) : "0";

      /* Only this batch's slice of the access map. A teacher has no
         business seeing what another class has been given, and the
         office screen's "every course" answer is deliberately not
         offered here for the same reason. */
      const people = (found ? found.roster : []).map((r) => {
        const email = String(r.email || "").toLowerCase();
        const holds = [];
        for (const [id, byBatch] of has) {
          const who = byBatch.get(key);
          if (who && who.has(email)) holds.push(ix.get(id));
        }
        return { ...r, has: holds.length ? key + ":" + holds.join(",") : "", hasAny: holds.length };
      });

      view(res, "homework", {
        ...shell(me, "homework"),
        batches: mine,
        chosen: found ? found.batch : null,
        people,
        chapters: chapters.map((c) => {
          const who = (has.get(c.id) || new Map()).get(key);
          return { ...c, outs: who && who.size ? key + ":" + who.size : "", out: 0 };
        }),
        levels: [...new Set(chapters.map((c) => c.level).filter(Boolean))].sort(),
        due: req.query.due_on || "",
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/homework", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const body = req.body || {};
      const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

      const found = await teacherClass(me, body.batch);
      if (!found) {
        // Not theirs and does not exist are the same answer, so nobody
        // can map the batch table by typing numbers into a form.
        res.status(404);
        return view(res, "missing", shell(me, "homework"));
      }

      /* Only the people actually on this class. Dropped rather than
         refused: the lists are hidden and shown by a script, and a
         teacher who ticks somebody, changes class and presses Unlock
         means the class in front of them. */
      const roster = new Set(found.roster.map((r) => String(r.email || "").toLowerCase()));
      const who = list(body.who)
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => roster.has(e));

      let result;
      try {
        result = body.lock
          ? await exercises.withdraw({
              chapters: list(body.what),
              emails: who,
              // Their own class, from the row that was verified above
              // and never from the form.
              intakeId: found.batch.id,
            })
          : await exercises.giveOut({
              chapters: list(body.what),
              emails: who,
              dueOn: body.due_on || null,
              intakeId: found.batch.id,
            });
      } catch (e) {
        console.error("Teacher homework threw:", e.stack || e.message);
        result = { ok: false, reason: `It did not go through: ${e.message}` };
      }

      if (result.ok && !who.length && list(body.who).length) {
        result = { ok: false, reason: "Nobody ticked is on this class." };
      }

      const back = new URLSearchParams({ batch: String(found.batch.id) });
      back.set(result.ok ? "done" : "problem", result.ok ? result.message : result.reason);
      res.redirect("/teach/homework?" + back.toString());
    } catch (e) {
      next(e);
    }
  });

  /* How the class is getting on.
   *
   * Names on it, unlike the student's own card, because the question
   * is different: a student is shown their position and nobody else's
   * score, and a teacher is shown names because the point is to find
   * the person who has stopped. That is the job, and it cannot be done
   * from anonymous rows.
   */
  router.get("/progress", requireTeacher, async (req, res, next) => {
    try {
      const me = req.teacher;
      const mine = await teaching.batches(me.id);
      const chosen = Number(req.query.batch) || (mine[0] ? mine[0].id : 0);
      const found = chosen ? await teaching.batch(me.id, chosen) : null;

      const board = found ? await exercises.classBoard(found.id) : [];
      const set = found ? await exercises.forBatch(found.id) : [];

      view(res, "progress", {
        ...shell(me, "progress"),
        batches: mine,
        chosen: found || null,
        board: withFaces(board),
        // How many chapters this class has been given, so "3 passed"
        // has something to be three out of.
        setCount: set.length,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/settings", requireTeacher, (req, res) => {
    view(res, "settings", {
      ...shell(req.teacher, "settings"),
      notice: req.query.done || null,
      error: req.query.error || null,
    });
  });

  router.post("/settings/profile", requireTeacher, async (req, res, next) => {
    try {
      await teachers.updateProfile(req.teacher.id, teachers.profileFromBody(req.body));
      res.redirect("/teach/settings?done=" + encodeURIComponent("Your details are saved."));
    } catch (e) {
      next(e);
    }
  });

  router.post("/settings/password", requireTeacher, async (req, res, next) => {
    try {
      const result = await teachers.changePassword(
        req.teacher.id,
        req.body.current_password,
        req.body.new_password
      );
      if (!result.ok) {
        return res.redirect("/teach/settings?error=" + encodeURIComponent(result.reason));
      }
      // Changing a password signs out every other device, this one
      // included — so the cookie is re-signed at the new version rather
      // than leaving somebody logged out of the page they are on.
      setSession(res, req.teacher.id, result.tokenVersion);
      res.redirect("/teach/settings?done=" + encodeURIComponent("Your password is changed."));
    } catch (e) {
      next(e);
    }
  });

  // The app-wide body limit is 64kb, right for every other form here
  // and too small for a photo. Raised on this one route, to a little
  // over what lib/avatar.js accepts, so the parser rejects the absurd
  // and the validator handles the rest.
  const avatarBody = express.urlencoded({ extended: false, limit: "600kb", parameterLimit: 8 });

  router.post("/settings/avatar", requireTeacher, avatarBody, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (body.remove) {
        await teachers.clearAvatar(req.teacher.id);
        return res.redirect("/teach/settings?done=" + encodeURIComponent("Your photo is removed."));
      }
      const parsed = avatar.fromDataUrl(body.image);
      if (!parsed.ok) return res.redirect("/teach/settings?error=" + encodeURIComponent(parsed.reason));

      await teachers.setAvatar(req.teacher.id, parsed.buffer, parsed.type);
      res.redirect("/teach/settings?done=" + encodeURIComponent("Your photo is updated."));
    } catch (e) {
      next(e);
    }
  });

  router.get("/avatar", requireTeacher, async (req, res, next) => {
    try {
      const found = await teachers.avatarFor(req.teacher.id);
      if (!found) return res.status(404).end();
      sendPhoto(res, found);
    } catch (e) {
      next(e);
    }
  });

  /**
   * A student's photo, to the teacher who teaches them.
   *
   * The ownership check is the join: the row only comes back if that
   * student is enrolled on a batch whose teacher_id is this teacher.
   * Without it this would be an endpoint that hands out any student's
   * photograph to anybody with a staff login and a for-loop.
   */
  router.get("/student/:id/photo", requireTeacher, async (req, res, next) => {
    try {
      const row = await db.queryOne(
        `SELECT s.avatar, s.avatar_type
           FROM students s
           JOIN enrolments e ON e.student_id = s.id
           JOIN intakes i ON i.id = e.intake_id AND i.teacher_id = ?
          WHERE s.id = ? AND s.deleted_at IS NULL
          LIMIT 1`,
        [req.teacher.id, Number(req.params.id)]
      );
      if (!row || !row.avatar || !row.avatar_type) return res.status(404).end();
      sendPhoto(res, { buffer: row.avatar, type: row.avatar_type });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

/**
 * Serve an avatar's bytes.
 *
 * Sandboxed and nosniff because these are user-supplied files: a
 * browser that decides a PNG is really HTML would be running somebody
 * else's markup on our origin.
 */
function sendPhoto(res, found) {
  res.set("Content-Type", found.type);
  res.set("Content-Security-Policy", "default-src 'none'; sandbox");
  res.set("X-Content-Type-Options", "nosniff");
  // The URL carries a timestamp, so a cached copy is only ever the
  // current photo. Private: never a shared proxy.
  res.set("Cache-Control", "private, max-age=86400");
  res.send(found.buffer);
}

module.exports = { build, requireTeacher, safeNext };
