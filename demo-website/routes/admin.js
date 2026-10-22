// ─────────────────────────────────────────────────────────────────────
//  Private admin screen: read the enquiries, mark them handled.
//
//  Auth is a single shared password from ADMIN_PASSWORD_HASH (a bcrypt
//  hash — the plaintext never lives in the repo or in .env), exchanged
//  for a signed, httpOnly session cookie. Deliberately modest: this
//  guards a lead inbox, not student records.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");

const analytics = require("../lib/analytics");
const students = require("../lib/students");
const db = require("../lib/db");
const billing = require("../lib/billing");
const billingAddress = require("../lib/billing-address");
const invoiceAddressRequests = require("../lib/invoice-address-requests");
const invoiceAddressMail = require("../lib/invoice-address-mail");
const csrf = require("../lib/csrf");
const coursesDb = require("../lib/courses-db");
const enquiries = require("../lib/enquiries");
const richText = require("../lib/rich-text");
const contacts = require("../lib/contacts");
const attachments = require("../lib/attachments");
const sentLog = require("../lib/sent");
const requests = require("../lib/account-requests");
const etReports = require("../lib/et-reports");
const catalogue = require("../lib/einbuergerungstest");
const attempts = require("../lib/placement-attempts");
const people = require("../lib/people");
const teachers = require("../lib/teachers");
const attendance = require("../lib/attendance");
const backlog = require("../lib/backlog");
const placementMail = require("../lib/placement-mail");
const mailer = require("../lib/mailer");
const T = require("../lib/mail-template");
const site = require("../lib/site");
const { env } = require("../lib/env");

const COOKIE = "ln_admin";
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function secret() {
  // Falls back to a per-boot random value, which simply means sessions do
  // not survive a restart — safer than shipping a constant default.
  return env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");
}
const SECRET = secret();

function sign(expiresAt) {
  const mac = crypto.createHmac("sha256", SECRET).update(String(expiresAt)).digest("hex");
  return `${expiresAt}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return false;
  const [expiresAt, mac] = token.split(".");
  if (!expiresAt || !mac) return false;
  if (Number(expiresAt) < Date.now()) return false;

  const expected = crypto.createHmac("sha256", SECRET).update(expiresAt).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isAuthed = (req) => verify(req.cookies ? req.cookies[COOKIE] : null);

function render(res, extra = {}) {
  res.render("pages/admin", {
    site,
    authed: false,
    error: null,
    rows: [],
    total: 0,
    page: 1,
    pages: 1,
    status: "",
    // Defaults like every other local here. The signed-out and error
    // paths render this same view, and a chip reading folderCounts on a
    // page that never fetched them is a crash on the login screen.
    folder: "new",
    folderCounts: { new: 0, replied: 0, closed: 0, spam: 0, sent: 0 },
    contacts: [],
    sentRows: [],
    sentReady: true,
    dbOk: true,
    topPages: [],
    notice: null,
    reply: null,
    compose: false,
    ...extra,
  });
}

function build() {
  const router = express.Router();

  router.get("/", async (req, res, next) => {
    if (!isAuthed(req)) return render(res, { authed: false });

    try {
      /* The page opens on the inbox.
       *
       * It used to open on "all", which meant every enquiry ever
       * answered sat above the ones that had not been — so replying to
       * something changed nothing about what you were looking at, and
       * the list only ever grew. The folders were already here; what
       * was missing was landing in the right one.
       *
       * "all" stays reachable and is now asked for by name, so the URL
       * says which folder it is rather than leaving it to a blank. */
      /* "drafts" is here but there is nothing on the server to fetch
         for it. A draft is saved in the browser, because the two
         things it has to survive — closing the tab, and the internet
         going — are both cases where a server has no say. The page
         provides the folder and app.js fills it. */
      const FOLDERS = ["new", "replied", "closed", "spam", "sent", "drafts", "all"];
      const asked = FOLDERS.includes(req.query.status) ? req.query.status : "new";
      // "sent" is not an enquiry status; it is a different list entirely,
      // so it must not reach enquiries.list() as one.
      const status =
        asked === "all" || asked === "sent" || asked === "drafts" ? "" : asked;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 25;

      // The Sent folder is a different table, so it is a different
      // query. Everything else on the page is the same either way.
      const showingSent = asked === "sent";
      const showingDrafts = asked === "drafts";
      const inbox = showingSent || showingDrafts
        ? { rows: [], total: 0, dbOk: true }
        : await enquiries.list({ status, page, perPage });
      const outbox = showingSent
        ? await sentLog.list({ page, perPage })
        : { rows: [], total: 0, ready: sentLog.ready() };

      const { rows, dbOk } = inbox;
      const total = showingSent ? outbox.total : inbox.total;

      const [topPages, folderCounts, contactList, sentCount] = await Promise.all([
        analytics.topPages({ days: 30, limit: 12 }),
        enquiries.counts(),
        // Everyone the compose box might be addressed to.
        contacts.list().catch(() => []),
        sentLog.count().catch(() => 0),
      ]);

      render(res, {
        authed: true,
        rows: enquiries.withLabels(rows),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / perPage)),
        status,
        // Which chip is lit. `status` is "" for all, which cannot be
        // compared against a folder name.
        folder: asked,
        folderCounts: { ...folderCounts, sent: sentCount },
        contacts: contactList,
        sentRows: outbox.rows,
        sentReady: outbox.ready,
        dbOk,
        topPages,
        notice: req.query.done || null,
        // Which enquiry to open the reply box on, so a failed send
        // comes back with the box already showing rather than closed.
        reply: req.query.reply ? Number(req.query.reply) : null,
        // ...and the same for the box that writes to somebody who never
        // sent an enquiry.
        compose: req.query.compose === "1",
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/login", async (req, res) => {
    const hash = env("ADMIN_PASSWORD_HASH");
    const plain = env("ADMIN_PASSWORD");
    const supplied = String(req.body.password || "");

    if (!hash && !plain) {
      return render(res, {
        authed: false,
        error: "No admin password is set. Set ADMIN_PASSWORD, or ADMIN_PASSWORD_HASH from: npm run admin:password",
      });
    }

    let ok = false;
    try {
      if (hash) {
        ok = await bcrypt.compare(supplied, hash);
      } else {
        // Plain-text fallback, used when only ADMIN_PASSWORD is set.
        // Weaker than the hash: anyone who can read the server's
        // environment reads the password itself, rather than something
        // they would have to crack first. Compared in constant time so
        // the comparison leaks nothing about how much matched.
        const a = Buffer.from(supplied);
        const b = Buffer.from(plain);
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      // A uniform delay makes a wrong password indistinguishable from a
      // missing one by timing.
      await new Promise((r) => setTimeout(r, 400));
      return render(res, { authed: false, error: "Incorrect password." });
    }

    const expiresAt = Date.now() + MAX_AGE_MS;
    res.cookie(COOKIE, sign(expiresAt), {
      httpOnly: true,
      sameSite: "lax",
      secure: site.origin.startsWith("https://"),
      maxAge: MAX_AGE_MS,
      path: "/admin",
    });
    res.redirect("/admin");
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { path: "/admin" });
    res.redirect("/admin");
  });

  // ── Replying to an enquiry ──────────────────────────────────────
  //
  // A mailto: link was the previous answer, which opens whatever mail
  // client the machine happens to have configured, sends from whatever
  // address that is, and leaves no record here. Replying from the
  // admin sends from info@, in the site's own styling, and marks the
  // enquiry replied in the same action.

  /* Documents ride in the body as data: URLs, the way profile photos
   * already do — no multipart parser, and nothing to install on the
   * host after a deploy.
   *
   * The bigger body limit this needs is set in server.js, mounted above
   * the global parser rather than here. A limit set on this route never
   * ran: express's parsers skip a request whose body has already been
   * read, so the global 64kb one reached the form first and threw
   * PayloadTooLargeError — which is what the Internal Server Error on
   * a reply with a PDF attached actually was.
   */
  router.post("/reply", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      /* Two things post here: the box under an enquiry, and the
       * "Write an email" box at the top of the page. They differ in one
       * thing — whether there is an enquiry to mark replied — so they
       * are one route with one branch rather than two routes that would
       * drift apart in their formatting, their footer and their
       * sanitising.
       */
      const id = Number(req.body.id) || 0;
      const to = String(req.body.to || "").trim();
      const name = String(req.body.name || "").trim();
      const body = String(req.body.body || "").trim();
      const back = (msg, keepOpen) =>
        res.redirect(
          "/admin?" + (keepOpen ? (id ? `reply=${id}&` : "compose=1&") : "") +
          "done=" + encodeURIComponent(msg)
        );

      // richText strips markup, so a body of nothing but tags is empty
      // even though the field was not. Checked on what will actually be
      // sent rather than on what was typed.
      if (!to || !richText.toHtml(body)) {
        return back(id ? "Nothing sent — the reply was empty." : "Nothing sent — it was empty.", true);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
        return back(`Nothing sent — "${to}" is not an email address.`, true);
      }

      /* One refused file stops the whole send rather than being dropped
         quietly. An email that goes without the document it was written
         to carry is worse than one that does not go: the sender thinks
         it is done, and finds out a week later when somebody asks. */
      const docs = attachments.parse(req.body.attach);
      if (!docs.ok) return back(`Nothing sent — ${docs.reason}`, true);

      const html = T.wrap({
        title: "LangNation",
        body:
          /* No name, no greeting. "Hello there," on a cold email to
             somebody the office chose to write to reads like a mailshot,
             and the person writing it can open however they like. */
          (name ? T.p(`Hello ${T.escapeHtml(name)},`) : "") +
          /* Rebuilt by lib/rich-text.js from what the editor wrote.
             Every element comes back with an inline style, because
             Outlook renders through Word and has no stylesheet, and
             nothing that was not on the allowlist survives — so a paste
             out of a web page cannot take its markup, or a script, into
             a message going out under the school's name.
             
             This was a pre-wrap block of escaped text: safe, and it made
             every reply one undifferentiated slab with no paragraphs, no
             emphasis and no way to link to a course page. */
          richText.toHtml(body) +
          `<div style="margin-top:20px">${T.button("Browse our courses", site.origin + "/courses")}</div>`,
        footer: "You can reply straight to this email — it reaches the office.",
      });

      const subjectLine =
        String(req.body.subject || "").trim() ||
        (id ? "Re: your enquiry — LangNation" : "LangNation");

      const result = await mailer.send({
        to,
        subject: subjectLine,
        html,
        text: T.text([
          name ? `Hello ${name},` : null,
          name ? "" : null,
          richText.toText(body),
          "",
          site.origin + "/courses",
        ]),
        attachments: docs.files,
      });

      if (result.sent && id) await enquiries.setStatus(id, "replied").catch(() => {});

      /* Filed after the fact, and never allowed to fail the send.
         The email has already gone by the time this runs; reporting a
         failure to write the copy as a failure to send would have the
         office send it twice. */
      if (result.sent) {
        await sentLog.record({
          enquiryId: id || null,
          to,
          name,
          subject: subjectLine,
          body,
          files: docs.files,
        });
      }

      // A failed send comes back with the box still open and the text
      // recoverable from the browser's back button; a successful one
      // closes it, because the thing is done.
      if (!result.sent) return back(`Not sent: ${result.reason}`, true);
      const withDocs = docs.files.length
        ? ` with ${docs.files.length} ${docs.files.length === 1 ? "attachment" : "attachments"}`
        : "";
      return back(
        id
          ? `Replied to ${to}${withDocs} and marked the enquiry replied.`
          : `Sent to ${to}${withDocs}.`,
        false
      );
    } catch (e) {
      next(e);
    }
  });

  // ── Dashboard ───────────────────────────────────────────────────
  //
  // What needs attention, grouped, on one page. The admin opened on a
  // list of enquiries, which said nothing about account requests
  // waiting or placements needing a level confirmed — so those were
  // only ever seen by someone who thought to look.

  router.get("/dashboard", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const [enq, reqCounts, placementsWaiting, recentPlacements, views, everyone,
             folderCounts, enquiryArrivals] =
        await Promise.all([
          enquiries.list({ status: "", page: 1, perPage: 5 }),
          requests.counts().catch(() => ({ pending: 0, approved: 0, denied: 0 })),
          attempts.pendingCount().catch(() => 0),
          attempts.list(5).catch(() => []),
          analytics.topPages({ days: 30, limit: 5 }).catch(() => []),
          people.list().catch(() => []),
          // Where the enquiries went, and how many are still arriving.
          // The page could say what was waiting and what the total was,
          // with nothing in between.
          enquiries.counts().catch(() => ({ new: 0, replied: 0, closed: 0, spam: 0 })),
          enquiries.arrivals().catch(() => ({ week: 0, month: 0 })),
        ]);

      const newEnquiries = await enquiries
        .list({ status: "new", page: 1, perPage: 1 })
        .catch(() => ({ total: 0 }));

      res.render("pages/admin-dashboard", {
        site,
        authed: true,
        enquiries: enq.rows || [],
        enquiryTotal: enq.total || 0,
        newEnquiries: newEnquiries.total || 0,
        folderCounts,
        enquiryArrivals,
        requestCounts: reqCounts,
        peopleCounts: people.counts(everyone),
        placementsWaiting,
        recentPlacements,
        views,
        dbOk: enq.dbOk !== false,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Everybody, and where they have got to ───────────────────────
  //
  // Requests and accounts were in two tables and on two screens, so
  // "has Anna got an account yet?" meant looking in both and knowing
  // which. One list, one column saying which step somebody is on.

  router.get("/students", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const all = await people.list();
      const stage = people.STAGES.some((s) => s.key === req.query.stage)
        ? req.query.stage
        : "";
      const q = String(req.query.q || "").trim().toLowerCase();

      const rows = all.filter((p) => {
        if (stage && p.stage !== stage) return false;
        if (!q) return true;
        return [p.name, p.email, p.ref, p.phone, p.country]
          .some((v) => String(v || "").toLowerCase().includes(q));
      });

      res.render("pages/admin-students", {
        site,
        authed: true,
        rows,
        counts: people.counts(all),
        stages: people.STAGES,
        stage,
        q: req.query.q || "",
        done: req.query.done || null,
        problem: req.query.problem || null,
        dbOk: db.isEnabled(),
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Placement review ────────────────────────────────────────────

  router.get("/placement", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      res.render("pages/admin-placement", {
        site,
        authed: true,
        rows: await attempts.list(200),
        notice: req.query.done || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/placement/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const attempt = await attempts.byId(req.params.id);
      if (!attempt) return res.status(404).send("No such attempt.");
      res.render("pages/admin-placement-one", {
        site,
        authed: true,
        a: attempt,
        levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
        notice: req.query.done || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/placement/:id/confirm", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const attempt = await attempts.byId(req.params.id);
      if (!attempt) return res.status(404).send("No such attempt.");

      const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const level = levels.includes(req.body.level) ? req.body.level : attempt.placement;
      const note = req.body.note || "";

      await attempts.confirm(attempt.id, level, note);

      // Sent whether or not the level moved. Silence after "a teacher
      // will read this" reads as being forgotten, and telling somebody
      // the test had them right is worth an email.
      const sent = await placementMail.sendFinal({
        name: attempt.name || "there",
        email: attempt.email,
        provisional: attempt.placement,
        level,
        note,
        lang: attempt.lang || "en",
      });

      const changed = level !== attempt.placement;
      const done = sent.sent
        ? `${changed ? "Changed to " + level : "Confirmed as " + level} — ${attempt.email} has been emailed.`
        : `Saved, but the email did not send: ${sent.reason}`;

      res.redirect("/admin/placement/" + attempt.id + "?done=" + encodeURIComponent(done));
    } catch (e) {
      next(e);
    }
  });

  // ── Account requests ────────────────────────────────────────────
  //
  // Someone asked for a portal account and a human decides. The links in
  // the notification email land here rather than acting directly: a
  // one-click approve in an email works for anyone who gets hold of that
  // email, and an account is worth more than that.

  router.get("/requests", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const status = ["pending", "approved", "denied"].includes(req.query.status)
        ? req.query.status
        : "pending";
      res.render("pages/admin-requests", {
        site,
        authed: true,
        rows: await requests.list(status),
        counts: await requests.counts(),
        status,
        notice: req.query.done || null,
        dbOk: db.isEnabled(),
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Question reports ────────────────────────────────────────────
  //
  // What learners have told us is wrong with the Einbürgerungstest
  // catalogue. It exists because ten of the picture answers were
  // wrong for weeks and nothing we had would have caught them — a
  // reader did. A report is only worth collecting if somebody reads
  // it, so this is a short queue with the question attached.

  const KIND_LABEL = {
    wrong_answer: "wrong answer",
    typo: "typo",
    image: "picture",
    translation: "translation",
    other: "other",
  };

  /**
   * Where to read the reported question, answer and all.
   *
   * Rebuilt from the question id rather than stored with the report:
   * the reading list is paged thirty to a page, and a link captured
   * months ago would point at the wrong page the moment the paging
   * changes.
   */
  function catalogueHref(row) {
    const id = String(row.question_id || "");
    const no = Number(row.question_no) || 0;
    if (id.startsWith("general-")) {
      const page = Math.max(1, Math.ceil(no / catalogue.PER_PAGE));
      return "/einbuergerungstest/fragen" + (page > 1 ? "?seite=" + page : "") +
             "#frage-" + no;
    }
    const land = id.replace(/-\d+$/, "");
    return "/einbuergerungstest/fragen?land=" + encodeURIComponent(land) +
           "#frage-" + no;
  }

  router.get("/einbuergerungstest", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const status = etReports.STATUSES.includes(req.query.status)
        ? req.query.status
        : "open";
      res.render("pages/admin-et-reports", {
        site,
        authed: true,
        rows: await etReports.list(status),
        counts: await etReports.counts(),
        status,
        KIND_LABEL,
        catalogueHref,
        notice: req.query.done || null,
        dbOk: db.isEnabled(),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/einbuergerungstest/act", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const { id, decision, note } = req.body || {};
      const okDone = await etReports.setStatus(id, decision, note);
      const said = { done: "Marked as fixed.", dismissed: "Marked as not a fault.",
                     open: "Reopened." }[decision] || "";
      res.redirect("/admin/einbuergerungstest?status=" +
        (decision === "open" ? "open" : decision) +
        (okDone && said ? "&done=" + encodeURIComponent(said) : ""));
    } catch (e) {
      next(e);
    }
  });

  // ── Deciding straight from the notification email ───────────────
  //
  // The token in the link is the authority here, so no password is
  // asked for — that is the point of a one-click decision. Following
  // the link only ever shows a page: mail scanners at Outlook, Gmail
  // and most corporate filters fetch every URL in a message, and a GET
  // that approved an account would be triggered by a robot before
  // anyone read the email. The button on that page does the work.

  router.get("/requests/act/:token", async (req, res, next) => {
    try {
      const claim = requests.verifyAction(req.params.token);
      if (!claim) {
        return res.status(400).render("pages/admin-decide", {
          site, request: null, action: null, token: null,
          error: "That link is not valid, or it has expired. Open the admin to decide there.",
        });
      }
      const request = await requests.byId(claim.id);
      if (!request) {
        return res.status(404).render("pages/admin-decide", {
          site, request: null, action: null, token: null,
          error: "That request no longer exists.",
        });
      }
      res.render("pages/admin-decide", {
        site,
        request,
        action: claim.action,
        token: req.params.token,
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/requests/act/:token", async (req, res, next) => {
    try {
      const claim = requests.verifyAction(req.params.token);
      if (!claim) {
        return res.status(400).render("pages/admin-decide", {
          site, request: null, action: null, token: null,
          error: "That link is not valid, or it has expired.",
        });
      }

      const result =
        claim.action === "approve"
          ? await requests.approve(claim.id)
          : await requests.deny(claim.id, req.body.note || "");

      const request = await requests.byId(claim.id);
      res.render("pages/admin-decide", {
        site,
        request,
        action: claim.action,
        token: null,
        error: result.ok ? null : result.reason,
        done: result.ok
          ? result.sent
            ? `${claim.action === "approve" ? "Approved" : "Declined"} — ${result.email} has been emailed.`
            : `${claim.action === "approve" ? "Approved" : "Declined"}, but the email did not send. Check the mail settings.`
          : null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/requests/decide", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const id = Number(req.body.id);
      const decision = req.body.decision === "approve" ? "approve" : "deny";

      const result =
        decision === "approve"
          ? await requests.approve(id)
          : await requests.deny(id, req.body.note || "");

      if (!result.ok) {
        return res.redirect("/admin/requests?done=" + encodeURIComponent(result.reason));
      }

      // Whether the email actually left matters more than the decision
      // being recorded: an approval nobody receives is not an approval.
      const done = result.sent
        ? `${decision === "approve" ? "Approved" : "Refused"} — ${result.email} has been emailed.`
        : `${decision === "approve" ? "Approved" : "Refused"}, but the email did not send. Check the mail settings.`;

      res.redirect("/admin/requests?done=" + encodeURIComponent(done));
    } catch (e) {
      next(e);
    }
  });

  // ── Attendance across the school ────────────────────────────────
  //
  // The teacher's portal answers "who was in my class". This answers
  // the question only the office asks: how is a batch going, and how
  // does it compare with the one before it. A batch whose attendance
  // slides from 90% to 60% over six weeks is a batch with a problem,
  // and that shape is invisible in any single register.

  router.get("/attendance", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const options = await attendance.officeOptions();

      // `batch` arrives as a string for one and an array for several.
      const asked = []
        .concat(req.query.batch || [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);

      // Nothing chosen: the batches that are running, which is what
      // somebody opening this page wants to see. Capped, because six
      // lines on one chart is a chart nobody can read.
      const fallback = options
        .filter((b) => b.status === "running" && Number(b.marks) > 0)
        .slice(0, 4)
        .map((b) => Number(b.id));

      const chosen = asked.length ? asked : fallback;
      const [rows, students, chase] = await Promise.all([
        attendance.officeSeries(chosen),
        attendance.officeStudents(chosen),
        // Teachers whose registers are more than a week past their
        // Sunday. This is the escalation: the teacher has been told on
        // their own dashboard for seven days and it has not worked, so
        // it stops being only their problem.
        //
        // Across EVERY batch, not the ones filtered above. The office
        // choosing to look at two batches' charts is not a statement
        // that the other twenty do not matter.
        backlog.overdueByTeacher(),
      ]);

      // The list is worst-first already. This is the office saying
      // "only show me the ones to act on", which on a school with
      // three hundred enrolments is the difference between a report
      // and a list.
      const only = req.query.only === "poor";
      const poor = students.filter((r) => r.band === "poor");

      res.render("pages/admin-attendance", {
        site,
        authed: true,
        options,
        chosen,
        chart: attendance.toChart(rows),
        // One palette for the chart's lines and the table's dots.
        lineColour: attendance.lineColour,
        students: only ? poor : students,
        poorCount: poor.length,
        only,
        good: attendance.GOOD,
        poor: attendance.POOR,
        dbOk: db.isEnabled(),
        // Said on the page rather than left for somebody to wonder
        // about when the chart is empty.
        untouched: options.filter((b) => Number(b.marks) === 0).length,
        chase,
        escalateAfter: backlog.ESCALATE_AFTER_DAYS,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Teacher accounts ────────────────────────────────────────────
  //
  // The office creates them; the teacher claims them from an emailed
  // link and chooses their own password. Nobody here ever types
  // somebody else's password, because a password a second person knows
  // is not a password.
  //
  // This screen is the only way a teacher account comes into existence.
  // There is no self-registration at /teach, deliberately: "may this
  // person see a class list" is not a question a public form answers.

  /** The link that claims an account, and the email carrying it. */
  async function mailInvite({ name, email, token, expires }) {
    const url = `${site.origin}/teach/invite/${encodeURIComponent(token)}`;

    const html = T.wrap({
      title: "Your LangNation teacher account",
      body:
        T.p(`Hello ${T.escapeHtml(name)},`) +
        T.p(
          "An account has been set up for you on the LangNation teacher portal. " +
            "Use the button below to choose a password — then you can see your " +
            "classes, your class lists and the links your students use."
        ) +
        `<div style="margin:18px 0">${T.button("Choose your password", url)}</div>` +
        T.p(
          `<span style="color:${T.MUTED};font-size:13px">This link is for you alone and stops working on ` +
            `${expires.toISOString().slice(0, 10)}. If the button does not work, copy this address into your browser:<br>` +
            `<span style="word-break:break-all">${T.escapeHtml(url)}</span></span>`
        ),
      footer: "Questions? Just reply to this email and it reaches the office.",
    });

    const sent = await mailer.send({
      to: email,
      subject: "Your LangNation teacher account",
      html,
      text: T.text([
        `Hello ${name},`,
        "",
        "An account has been set up for you on the LangNation teacher portal.",
        "Open this link to choose a password:",
        "",
        url,
        "",
        `The link is for you alone and stops working on ${expires.toISOString().slice(0, 10)}.`,
      ]),
    });

    return { url, sent: sent.sent };
  }

  /**
   * Finish an invitation: tell the office it was emailed, or hand them
   * the link because it was not.
   *
   * The happy path is a redirect with a short message — post, redirect,
   * get, so a refresh does not invite somebody twice.
   *
   * The unhappy path renders the page directly instead, with the link
   * on it. Without that, an office whose SMTP is down creates accounts
   * nobody can ever claim and has no way to find out what the link was:
   * the token is hashed the moment it is stored, so it exists exactly
   * once, in the response to this request.
   *
   * It is NOT put in the redirect's query string, which would be the
   * easy way to do it. A one-time account-claiming token in a URL ends
   * up in browser history, in the referrer of every link clicked from
   * that page, and in any proxy log between here and the browser.
   */
  async function finishInvite(res, result, { url, sent }) {
    if (sent) {
      return res.redirect(
        "/admin/teachers?done=" +
          encodeURIComponent(`${result.name} has been emailed an invitation.`)
      );
    }
    return renderTeachers(res, {
      error: mailer.isConfigured()
        ? `The invitation email to ${result.email} did not send. Check the mail settings.`
        : "Email is not configured on this server, so the invitation could not be sent.",
      handoff: { name: result.name, email: result.email, url, expires: result.expires },
    });
  }

  async function renderTeachers(res, extra = {}) {
    res.render("pages/admin-teachers", {
      site,
      authed: true,
      rows: await teachers.list(),
      roles: teachers.ROLES,
      roleLabel: teachers.ROLE_LABEL,
      dbOk: db.isEnabled(),
      notice: null,
      error: null,
      handoff: null,
      values: {},
      errors: {},
      ...extra,
    });
  }

  router.get("/teachers", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      await renderTeachers(res, {
        notice: req.query.done || null,
        error: req.query.error || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/teachers", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const check = teachers.validateInvite(req.body);
      if (!check.ok) {
        return res.redirect(
          "/admin/teachers?error=" + encodeURIComponent(Object.values(check.errors).join(" "))
        );
      }

      const result = await teachers.invite(check.values);
      if (!result.ok) {
        return res.redirect("/admin/teachers?error=" + encodeURIComponent(result.reason));
      }

      const mailed = await mailInvite(result);
      await finishInvite(res, result, mailed);
    } catch (e) {
      next(e);
    }
  });

  router.post("/teachers/act", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const id = Number(req.body.id);
      const action = String(req.body.action || "");

      if (action === "resend") {
        const result = await teachers.reinvite(id);
        if (!result.ok) {
          return res.redirect("/admin/teachers?error=" + encodeURIComponent(result.reason));
        }
        const mailed = await mailInvite(result);
        return finishInvite(res, result, mailed);
      }

      if (action === "suspend" || action === "restore") {
        const result = await teachers.setStatus(id, action === "suspend" ? "suspended" : "active");
        if (!result.ok) {
          return res.redirect("/admin/teachers?error=" + encodeURIComponent(result.reason));
        }
        // Suspending bumps token_version, so it takes effect on the next
        // click rather than whenever their cookie happens to expire.
        const done = action === "suspend"
          ? `${result.name} is suspended and signed out everywhere.`
          : `${result.name} is ${result.status === "invited" ? "restored — they still need to claim their invitation" : "active again"}.`;
        return res.redirect("/admin/teachers?done=" + encodeURIComponent(done));
      }

      res.redirect("/admin/teachers");
    } catch (e) {
      next(e);
    }
  });

  /* Suspend an account, or let it back in.
   *
   * For fees: somebody who has not settled stops having access until
   * they do, and gets everything back the moment they pay. Nothing is
   * deleted, so "everything" means the same homework, the same scores
   * and the same place in the class — see students.setStatus.
   *
   * Closing an account is a different button in a different place, and
   * deliberately so: one of these is a door and the other is a
   * shredder. */
  router.post("/students/act", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const body = req.body || {};
      const want = body.action === "suspend" ? "suspended" : "active";
      const result = await students.setStatus(body.id, want);

      const say = !result.ok
        ? result.reason
        : result.already
          ? `${result.name} was already ${want === "suspended" ? "suspended" : "active"}.`
          : want === "suspended"
            ? `${result.name} is suspended and signed out everywhere. ` +
              "Nothing has been deleted — letting them back in restores their " +
              "homework, their scores and their place in the class."
            : `${result.name} is active again, with everything they had before.`;

      const back = new URLSearchParams();
      back.set(result.ok ? "done" : "problem", say);
      if (body.q) back.set("q", body.q);
      if (body.stage) back.set("stage", body.stage);
      res.redirect("/admin/students?" + back.toString());
    } catch (e) {
      next(e);
    }
  });

  router.post("/status", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      await enquiries.setStatus(req.body.id, req.body.status);
      // Return to the filtered view the click came from, but only if it is
      // one of ours — never bounce to an attacker-supplied absolute URL.
      const referer = String(req.get("referer") || "");
      const back = referer.startsWith(site.origin) || referer.startsWith("http://localhost")
        ? referer
        : "/admin";
      res.redirect(back);
    } catch (e) {
      next(e);
    }
  });

  /* ── Payments ──────────────────────────────────────────────────────
   *
   * An instalment is an invoice; see MySQL/33_instalments.sql. So a
   * plan is drafted as a set of unissued invoices, looked over, and
   * then issued — and after that it is read-only, because an amount
   * the student has already been sent is not something to quietly
   * edit. A correction is a credit note.
   *
   * The preview is a GET with the numbers in the query string rather
   * than a POST that writes something to look at. Nothing is created
   * until the office presses the button that says so, and a half-made
   * plan cannot be left behind by a closed tab.
   */
  router.get('/payments/address-requests',async(req,res,next)=>{
    if(!isAuthed(req))return res.redirect('/admin');
    try{const status=['pending','approved','rejected'].includes(req.query.status)?req.query.status:'pending';
      res.render('pages/admin-invoice-address-requests',{site,status,rows:await invoiceAddressRequests.list(status),ready:invoiceAddressRequests.ready(),problem:req.query.problem||null,done:req.query.done||null});
    }catch(e){next(e);}
  });
  async function renderAddressRequest(req,res,extra={}){
    const request=await invoiceAddressRequests.get(Number(req.params.id));
    if(!request)return res.sendStatus(404);
    res.render('pages/admin-invoice-address-request',{site,request,addressDetails:await billingAddress.current(request.student_id),notifications:await invoiceAddressMail.status(request.id),csrfToken:csrf.token(req,res),problem:null,done:req.query.done||null,...extra});
  }
  router.get('/payments/address-requests/:id',async(req,res,next)=>{
    if(!isAuthed(req))return res.redirect('/admin');
    try{await renderAddressRequest(req,res);}catch(e){next(e);}
  });
  router.post('/payments/address-requests/:id',async(req,res,next)=>{
    if(!isAuthed(req))return res.redirect('/admin');
    if(!csrf.valid(req))return res.status(403).send('Reload the request and try again.');
    try{
      const out=await invoiceAddressRequests.review(Number(req.params.id),req.body||{});
      await invoiceAddressMail.flush(Number(req.params.id)).catch(e=>console.error('Invoice address mail:',e.message));
      res.redirect(303,'/admin/payments/address-requests/'+Number(req.params.id)+'?done='+encodeURIComponent(out.status==='approved'?'Replacement invoice version '+out.revision+' saved. The student notification is queued.':'Request declined. The student notification is queued.'));
    }catch(e){
      if(e instanceof invoiceAddressRequests.RequestError||e instanceof billingAddress.AddressError){res.status(400);await renderAddressRequest(req,res,{problem:e.message,requestValues:req.body||{}}).catch(next);}else next(e);
    }
  });
  router.get("/payments", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const filter = Object.prototype.hasOwnProperty.call(billing.FILTERS, req.query.show)
        ? req.query.show
        : "all";
      const q = String(req.query.q || "").trim().toLowerCase();
      const { rows, totals } = await billing.overview();

      const shown = rows
        .filter(billing.FILTERS[filter])
        .filter((row) => !q || [row.student, row.ref, row.label, row.batch]
          .some((v) => String(v || "").toLowerCase().includes(q)));

      res.render("pages/admin-payments", {
        site, authed: true, dbOk: db.isEnabled(),
        rows: shown, totals, filter, q: req.query.q || "",
        counts: Object.fromEntries(
          Object.keys(billing.FILTERS).map((k) => [k, rows.filter(billing.FILTERS[k]).length])
        ),
        label: billing.SUMMARY_STATE,
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  /* One page per STUDENT, not per enrolment.
   *
   * Somebody taking two courses is one person with one bank account,
   * and the office's question is usually "where is this student up
   * to", not "where is this enrolment up to". The course picker at
   * the top switches between them, and "All courses" is both the
   * combined view and the place a single plan covering everything is
   * set up. */
  router.get("/payments/s/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const studentId = Number(req.params.id);
      const who = await db.queryOne(
        "SELECT id, name, email, student_ref FROM students WHERE id = ?", [studentId]
      );
      if (!who) return res.redirect("/admin/payments?problem=" + encodeURIComponent("No such student."));

      const [mine, plans, history, trail] = await Promise.all([
        billing.enrolmentsFor(studentId),
        /* drafts: true. Without it the office was handed the
           student's view of their own account, which deliberately
           hides anything unissued -- so a drafted plan was invisible
           on the one page that can issue it. */
        billing.forStudent(studentId, null, { drafts: true }),
        billing.paymentsForStudent(studentId),
        billing.trailFor(studentId),
      ]);

      /* What each course costs today. offer(), not the two columns: a
         course in the shipped data has price 300 and "discount" 400,
         and reading them directly would have the office billing 400
         for something the site sells at 300. */
      const courses = mine.map((e) => {
        const { priceNow } = coursesDb.offer(e.price_eur, e.discount_eur);
        return {
          id: e.id,
          title: e.course_title || "Course",
          batch: e.batch_code || null,
          status: e.status,
          fee: priceNow ? Math.round(Number(priceNow) * 100) : 0,
          plan: plans.find((p) => Number(p.enrolmentId) === Number(e.id)) || null,
        };
      });
      const combined = plans.find((p) => p.combined) || null;
      const anyBilled = plans.some((p) => p.parts.length);

      const pick = String(req.query.course || "all");
      const one = courses.find((c) => String(c.id) === pick) || null;
      const scope = one ? one.plan : combined;

      /* Whether THIS course can still be set up, not whether the
         student has ever been billed for anything.

         It was the second of those, so invoicing one course made the
         setup form disappear from the other two -- which looked like
         the page had decided they were done when nothing had been
         billed for them at all.

         One combined plan rules out billing a course on its own, and
         any course billed on its own rules out a combined plan: both
         together are the same student billed twice, which is the one
         mistake here with no clean way back. */
      const canSetUp = combined ? false : (one ? !(scope && scope.parts.length) : !anyBilled);

      /* The fee to bill: this course's, or everything added up. */
      const suggested = one ? one.fee : courses.reduce((n, c) => n + c.fee, 0);
      const n = Math.min(24, Math.max(1, Number(req.query.n) || 0));
      const total = req.query.total ? billing.cents(req.query.total) : suggested;
      /* Dates run monthly from today. There is no "first due date"
         box any more: every row below has its own, which is the one
         that decides, and two places to set the same thing is one
         place to set it wrongly. */
      const preview = req.query.n
        ? billing.split(total, n).map((a, i) => ({
            amount: a, due_on: billing.monthly(billing.todayStr(), n)[i],
          }))
        : null;

      const everything = plans.reduce((acc, p) => ({
        total: acc.total + p.total, paid: acc.paid + p.paid, owed: acc.owed + p.owed,
      }), { total: 0, paid: 0, owed: 0 });

      res.render("pages/admin-payment", {
        site, authed: true, dbOk: db.isEnabled(),
        who, courses, combined, canSetUp, anyBilled, pick, one, scope, everything,
        history, trail, suggested, preview, total, n,
        methods: billing.METHODS,
        label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL,
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  /* The old per-enrolment address, which is what the table linked to
     before and what is in anybody's history. */
  router.get("/payments/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const row = await db.queryOne(
        "SELECT student_id FROM enrolments WHERE id = ?", [Number(req.params.id)]
      );
      if (!row) return res.redirect("/admin/payments?problem=" + encodeURIComponent("No such enrolment."));
      return res.redirect(`/admin/payments/s/${row.student_id}?course=${Number(req.params.id)}`);
    } catch (e) {
      return next(e);
    }
  });

  /* The invoice itself. There was nowhere to look at one: the
     numbers were on screen and the document they named did not
     exist anywhere in the application. */
  router.get("/payments/invoice/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    try {
      const bill = await billing.invoice(Number(req.params.id));
      if (!bill) return res.redirect("/admin/payments?problem=" + encodeURIComponent("No such invoice."));
      /* The schedule this invoice belongs to, so one instalment is
         never read as the whole course fee. */
      const plans = await billing.forStudent(bill.student_id, null, { drafts: true });
      const mine = plans.find((p) => String(p.enrolmentId) === String(bill.enrolment_id));
      res.render("pages/admin-invoice", {
        site, authed: true, bill, plan: mine ? mine.parts : [],
        methods: billing.METHODS,
        stateLabel: billing.STATE_LABEL,
      });
    } catch (e) {
      next(e);
    }
  });

  /** Where a payment action goes back to, with something to read. */
  const backTo = (res, studentId, key, say, course) =>
    res.redirect(`/admin/payments/s/${studentId}?${course ? `course=${course}&` : ""}` +
                 `${key}=${encodeURIComponent(say)}`);

  router.post("/payments/plan", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      const amounts = [].concat(body.amount || []);
      const dates = [].concat(body.due_on || []);
      const parts = amounts.map((a, i) => ({
        amount: billing.cents(a),
        due_on: String(dates[i] || ""),
      }));

      /* Checked against the fee that was typed, not against itself. A
         plan where every row is individually plausible can still be
         200 short, and nobody notices until the last instalment is
         paid and the account does not close. The browser checks this
         too; this is the one that counts. */
      const want = billing.cents(body.total);
      const got = parts.reduce((n, p) => n + p.amount, 0);
      if (want > 0 && got !== want) {
        return backTo(res, studentId, "problem",
          `The instalments come to ${billing.amount(got)} but the fee is ${billing.amount(want)}.`,
          course);
      }

      if (course) {
        await billing.draftPlan(course, { parts, createdBy: null });
      } else {
        const mine = await billing.enrolmentsFor(studentId);
        const courses = mine.map((e) => {
          const { priceNow } = coursesDb.offer(e.price_eur, e.discount_eur);
          return {
            title: `${e.course_title || "Course"}${e.batch_code ? ` (${e.batch_code})` : ""}`,
            fee: priceNow ? Math.round(Number(priceNow) * 100) : 0,
          };
        });
        await billing.draftCombined(studentId, { parts, courses, createdBy: null });
      }
      return backTo(res, studentId, "done", "Plan drafted. Look it over, then issue it.", course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      return next(e);
    }
  });

  /* "They have already paid." One action, because the four-step
     path exists for money arriving over three months and is four
     steps too many for writing down a fee somebody handed over in
     cash. It takes the same route through the ledger as everything
     else: an invoice, issued, and a payment row that settles it. */
  /* Putting a payment back.
   *
   * Never an edit and never a delete. Both leave the books saying
   * something different from what happened, and both look exactly
   * like somebody removing a payment that never arrived after
   * pocketing the cash — which is as bad for an honest member of
   * staff accused of it as for a dishonest one doing it. */
  router.post("/payments/reverse", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      const out = await billing.reversePayment({
        paymentId: Number(body.payment_id),
        reason: String(body.reason || ""),
        recordedBy: null,
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null,
      });
      return backTo(res, studentId, "done",
        `${billing.amount(out.reversed)} put back. The original stays on the record, marked reversed.`,
        course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      return next(e);
    }
  });

  router.post("/payments/settle", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      let courses = null;
      if (!course) {
        const mine = await billing.enrolmentsFor(studentId);
        courses = mine.map((e) => {
          const { priceNow } = coursesDb.offer(e.price_eur, e.discount_eur);
          return {
            title: `${e.course_title || "Course"}${e.batch_code ? ` (${e.batch_code})` : ""}`,
            fee: priceNow ? Math.round(Number(priceNow) * 100) : 0,
          };
        });
      }
      const out = await billing.settle(studentId, {
        enrolmentId: course,
        courses,
        totalCents: billing.cents(body.total),
        method: String(body.method || ""),
        receivedOn: String(body.received_on || ""),
        reference: String(body.reference || "").trim() || null,
        note: String(body.note || "").trim() || null,
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null,
      });
      return backTo(res, studentId, "done",
        `Invoice ${out.number} issued and settled in full.`, course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      if (e && e.code === "ER_DUP_ENTRY") {
        return backTo(res, studentId, "problem",
          "That reference has already been banked.", course);
      }
      return next(e);
    }
  });

  router.post("/payments/discard", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      const out = await billing.discardDrafts(studentId, {
        enrolmentId: course,
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null,
      });
      return backTo(res, studentId, "done",
        `${out.discarded} draft${out.discarded === 1 ? "" : "s"} thrown away. Nothing was issued, so nothing was sent.`,
        course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      return next(e);
    }
  });

  router.post("/payments/issue", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      /* Everything drafted for this student goes out together, even
         when one course is being looked at: a drafted invoice nobody
         ever issued is a bill the student never saw and the books
         never had. */
      const out = await billing.issueForStudent(studentId);
      return backTo(res, studentId, "done",
        `${out.issued} invoice${out.issued === 1 ? "" : "s"} issued. The student can see them now.`,
        course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      return next(e);
    }
  });

  router.post("/payments/record", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/admin");
    const body = req.body || {};
    const studentId = Number(body.student_id);
    const course = body.course && body.course !== "all" ? Number(body.course) : null;
    try {
      /* recorded_by is null, and it has to be: the office signs in
         with one shared password, so the application genuinely does
         not know which member of staff typed this. Recording a guess
         would be worse than recording nothing. The timestamp and the
         reference are what traceability there is until admin accounts
         exist. */
      const out = await billing.recordPayment({
        invoiceId: Number(body.invoice_id),
        amountCents: billing.cents(body.amount),
        method: String(body.method || ""),
        receivedOn: String(body.received_on || ""),
        reference: String(body.reference || "").trim() || null,
        note: String(body.note || "").trim() || null,
        recordedBy: null,
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null,
      });
      return backTo(res, studentId, "done",
        out.settled
          ? "Payment recorded. That invoice is settled."
          : `Payment recorded. ${billing.amount(out.owed)} still owed on it.`,
        course);
    } catch (e) {
      if (e && e.name === "BillingError") return backTo(res, studentId, "problem", e.message, course);
      if (e && e.code === "ER_DUP_ENTRY") {
        return backTo(res, studentId, "problem",
          "That reference has already been banked. Check the payment history before recording it again.",
          course);
      }
      return next(e);
    }
  });

  return router;
}

module.exports = { build, isAuthed };
