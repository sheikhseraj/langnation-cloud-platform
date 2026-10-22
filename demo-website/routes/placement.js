// The adaptive placement test.
//
// Five steps, each its own URL so the back button behaves and a
// half-finished test can be picked up from an email link:
//
//   /placement-test           what it is, and start
//   /placement-test/rules     how to take it, accept
//   /placement-test/details   who you are
//   /placement-test/exam      the questions
//   /placement-test/writing   the written task
//   /placement-test/result    the level
//
// The questions themselves are driven from the page: each answer is
// posted to /answer and the next question comes back. That is one round
// trip per question, which is the price of never putting the answer key
// in the HTML — with instant feedback on screen, anything else would
// hand the whole paper to anyone who opens the developer tools.
//
// The old linear test at /placement-test/:track is gone. It let the
// candidate choose the difficulty band before starting, which decided
// the thing the test exists to find out.

"use strict";

const express = require("express");

const adaptive = require("../lib/placement-adaptive");
const attempts = require("../lib/placement-attempts");
const enquiries = require("../lib/enquiries");
const content = require("../lib/content");
const mailer = require("../lib/mailer");
const spam = require("../lib/spam");
const students = require("../lib/students");
const portal = require("../lib/portal");
const db = require("../lib/db");
const placementMail = require("../lib/placement-mail");
const site = require("../lib/site");
const countries = require("../content/countries.json");
const { localePath } = require("../lib/i18n");

function build(lang) {
  const router = express.Router();

  const lp = (p) => localePath(lang, p);

  const view = (res, page, extra = {}) =>
    res.render("pages/placement/" + page, Object.assign({ countries }, extra));

  const ipOf = (req) =>
    (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
      .toString()
      .split(",")[0]
      .trim();

  // ── 1. What it is ───────────────────────────────────────────────
  router.get("/", (req, res) => {
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: t("placement.title") + " | LangNation",
      description: t("placement.lead"),
    };
    view(res, "start", {});
  });

  // ── 2. How to take it ───────────────────────────────────────────
  router.get("/rules", (req, res) => {
    res.locals.seo = { ...res.locals.seo, noindex: true };
    view(res, "rules", {
      terms: content.page("placement-test-rules", lang),
      error: req.query.accept === "0",
    });
  });

  router.post("/rules", (req, res) => {
    if (!req.body.accept) return res.redirect(lp("/placement-test/rules?accept=0"));
    // Signed, so the questions cannot be reached without having passed
    // through the rules and ticked the box.
    res.redirect(lp("/placement-test/details?c=" + encodeURIComponent(adaptive.signData({ ok: 1 }))));
  });

  // ── 3. Who you are ──────────────────────────────────────────────
  /**
   * The phone as two fields, from the one string we store.
   *
   * The form asks for a dialling code and a number separately, so a
   * stored "+49 176 1234567" has to come apart again. Anything that
   * does not start with a "+" goes in the number box whole rather than
   * being guessed at.
   */
  function splitPhone(stored) {
    const value = String(stored || "").trim();
    if (!value) return { cc: "", number: "" };
    const m = /^\+\s*(\d{1,4})[\s-]+(.+)$/.exec(value);
    if (!m) return { cc: "", number: value.replace(/[^0-9]/g, "") };
    return { cc: m[1], number: m[2].replace(/[^0-9]/g, "") };
  }

  /**
   * What we already know about whoever is filling this in.
   *
   * A signed-in student has given us their name, email, phone, country
   * and address once already — asking for all five again is asking
   * somebody to prove they are themselves to a site they are logged
   * into. Prefilled rather than skipped: an address can be out of date,
   * and the form is where they would correct it.
   *
   * Returns an empty object for a visitor, which is every visitor when
   * there is no database. Never throws: the placement test must work
   * when the portal does not.
   */
  async function known(req) {
    try {
      if (!db.isEnabled()) return {};
      const me = await students.current(req);
      if (!me) return {};
      const full = (await portal.profile(me.id)) || me;
      const phone = splitPhone(full.phone);
      return {
        prefilled: true,
        name: full.name || "",
        email: full.email || "",
        country: full.country || "",
        address: full.address || "",
        phone_cc: phone.cc,
        phone_number: phone.number,
      };
    } catch {
      return {};
    }
  }

  router.get("/details", async (req, res, next) => {
    try {
      if (!adaptive.readData(req.query.c)) return res.redirect(lp("/placement-test/rules"));
      res.locals.seo = { ...res.locals.seo, noindex: true };
      view(res, "details", {
        consentToken: req.query.c,
        values: await known(req),
        errors: {},
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/details", async (req, res, next) => {
    try {
      if (!adaptive.readData(req.body.consent)) {
        return res.redirect(lp("/placement-test/rules"));
      }

      const check = await spam.assess(req.body, { ip: ipOf(req) });
      if (check.verdict === "block") return res.redirect(lp("/placement-test"));

      const values = {
        name: String(req.body.name || "").trim().slice(0, 120),
        email: String(req.body.email || "").trim().toLowerCase().slice(0, 180),
        country: String(req.body.country || "").trim().slice(0, 80),
        // The form has always asked for this and the route has never
        // read it, so every address anybody typed was discarded on
        // submit — including the ones on the certificates we post.
        address: String(req.body.address || "").trim().slice(0, 300),
      };
      const cc = String(req.body.phone_cc || "").replace(/[^0-9]/g, "");
      const num = String(req.body.phone_number || "").replace(/[^0-9]/g, "");
      values.phone = num ? (cc ? `+${cc} ${num}` : num) : "";
      // The two boxes the form actually renders. Without these a
      // rejected form came back with the phone blank and the code
      // reset to Germany, so it had to be typed again.
      values.phone_cc = cc;
      values.phone_number = num;

      const errors = {};
      if (values.name.length < 2) errors.name = "required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = "invalid";

      if (Object.keys(errors).length) {
        res.locals.seo = { ...res.locals.seo, noindex: true };
        return res.status(400).render("pages/placement/details", {
          countries,
          consentToken: req.body.consent,
          values,
          errors,
        });
      }

      // One attempt per address per day, checked before a paper exists.
      const recent = await attempts.recentFor(values.email);
      if (recent) {
        res.locals.seo = { ...res.locals.seo, noindex: true };
        return res.status(429).render("pages/placement-taken", {
          track: { from: "A1", to: "C2" },
          attempt: recent,
          hours: attempts.WINDOW_HOURS,
        });
      }

      attempts
        .start({ email: values.email, name: values.name, track: "adaptive", ip: ipOf(req) })
        .catch(() => {});

      // The lead is captured before a single question is shown: someone
      // who starts and gives up is still worth calling.
      const started = enquiries.validate(
        {
          ...values,
          lang,
          consent: 1,
          course: "placement-started",
          sourcePage: lp("/placement-test"),
          message: "Started the adaptive placement test.",
        },
        { messageMax: 20000 }
      );
      if (started.ok) enquiries.save(started.value, { ip: ipOf(req) }).catch(() => {});

      const state = adaptive.drawBlock(adaptive.begin());
      res.redirect(
        lp("/placement-test/exam") +
          "?s=" + encodeURIComponent(adaptive.encode(state)) +
          "&c=" + encodeURIComponent(adaptive.signData(values))
      );
    } catch (e) {
      next(e);
    }
  });

  // ── 4. The questions ────────────────────────────────────────────
  router.get("/exam", (req, res) => {
    const candidate = adaptive.readData(req.query.c);
    const state = adaptive.decode(req.query.s);
    if (!candidate || !state) return res.redirect(lp("/placement-test"));

    res.locals.seo = { ...res.locals.seo, noindex: true };
    res.locals.pageScript = null;
    view(res, "exam", {
      stateToken: req.query.s,
      candidateToken: req.query.c,
      question: adaptive.currentQuestion(state),
      asked: state.seen.length - state.current.length + state.given.length,
    });
  });

  /**
   * One answer in, the next question out.
   *
   * Answering is a POST because it changes the paper, and the state
   * token that comes back replaces the one that went in — so a
   * resubmitted request cannot answer the same question twice.
   */
  router.post("/answer", express.json({ limit: "8kb" }), (req, res) => {
    const state = adaptive.decode(req.body && req.body.state);
    if (!state) return res.status(400).json({ error: "expired" });

    const feedback = adaptive.answer(state, Number(req.body.choice));
    if (!feedback) return res.status(400).json({ error: "no-question" });

    let done = false;
    if (adaptive.blockComplete(state)) {
      const closed = adaptive.closeBlock(state);
      if (closed.done) done = true;
      else adaptive.drawBlock(state);
    }

    res.json({
      feedback,
      state: adaptive.encode(state),
      question: done ? null : adaptive.currentQuestion(state),
      asked: state.seen.length - state.current.length + state.given.length,
      done,
    });
  });

  // ── 5. The written task ─────────────────────────────────────────
  router.get("/writing", (req, res) => {
    const candidate = adaptive.readData(req.query.c);
    const state = adaptive.decode(req.query.s);
    if (!candidate || !state) return res.redirect(lp("/placement-test"));

    const result = adaptive.conclude(state);
    res.locals.seo = { ...res.locals.seo, noindex: true };
    view(res, "writing", {
      stateToken: req.query.s,
      candidateToken: req.query.c,
      level: result.placement,
      prompt: adaptive.writingPrompt(result.placement, lang),
      minWords: adaptive.WRITING_MIN_WORDS,
      error: req.query.short === "1",
      text: "",
    });
  });

  router.post("/writing", async (req, res, next) => {
    try {
      const candidate = adaptive.readData(req.body.c);
      const state = adaptive.decode(req.body.s);
      if (!candidate || !state) return res.redirect(lp("/placement-test"));

      const text = String(req.body.text || "").trim().slice(0, 6000);
      const words = adaptive.wordCount(text);
      const result = adaptive.conclude(state);

      // Short answers are refused rather than accepted quietly: a
      // teacher cannot judge anything from one line, and the rules said
      // eight to fourteen sentences.
      if (words < adaptive.WRITING_MIN_WORDS) {
        res.locals.seo = { ...res.locals.seo, noindex: true };
        return res.status(400).render("pages/placement/writing", {
          countries,
          stateToken: req.body.s,
          candidateToken: req.body.c,
          level: result.placement,
          prompt: adaptive.writingPrompt(result.placement, lang),
          minWords: adaptive.WRITING_MIN_WORDS,
          error: true,
          text,
        });
      }

      await finish(req, res, candidate, state, result, text, words);
    } catch (e) {
      next(e);
    }
  });

  /** Someone who will not write anything still gets a level, flagged. */
  router.post("/skip-writing", async (req, res, next) => {
    try {
      const candidate = adaptive.readData(req.body.c);
      const state = adaptive.decode(req.body.s);
      if (!candidate || !state) return res.redirect(lp("/placement-test"));
      await finish(req, res, candidate, state, adaptive.conclude(state), "", 0);
    } catch (e) {
      next(e);
    }
  });

  async function finish(req, res, candidate, state, result, text, words) {
    // Awaited, because the id is what links the office to the review
    // page for this exact attempt.
    const attemptId = await attempts
      .finish(candidate.email, result, { writing: text, words, lang })
      .catch(() => null);

    // The candidate hears immediately. Twenty minutes of work deserves
    // an answer before they close the tab, and the provisional level is
    // real information even though it is not the last word.
    placementMail
      .sendProvisional({
        name: candidate.name,
        email: candidate.email,
        level: result.placement,
        percent: result.percent,
        minutes: result.minutes,
        wroteWords: words,
        lang,
      })
      .then((r) => {
        if (r && r.sent === false) {
          console.error("Placement result not emailed to the candidate:", r.reason);
        }
      })
      .catch(() => {});

    const reviewUrl = attemptId ? `${site.origin}/admin/placement/${attemptId}` : `${site.origin}/admin/placement`;
    const path = result.blocks.map((b) => `${b.level} ${b.correct}/${b.total}`).join(" → ");
    const message = [
      `Adaptive placement test — provisional level ${result.placement}`,
      `Overall: ${result.correct}/${result.total} (${result.percent}%) in about ${result.minutes} min`,
      `Path: ${path}`,
      "",
      words
        ? `Written task (${words} words) — please read before confirming the level:`
        : "The candidate did not complete the written task, so this level rests on multiple choice alone.",
      text || "",
      "",
      `Review and confirm the level: ${reviewUrl}`,
    ].join("\n");

    const built = enquiries.validate(
      {
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        country: candidate.country,
        lang,
        consent: 1,
        course: `placement-${result.placement}`,
        sourcePage: lp("/placement-test"),
        message,
      },
      { messageMax: 20000 }
    );

    if (built.ok) {
      await enquiries.save(built.value, { ip: ipOf(req) }).catch(() => {});
      mailer
        .sendEnquiry({ ...built.value, subjectPrefix: `Placement result — ${result.placement}` })
        .catch(() => {});
    }

    const recommended = content
      .courses(lang)
      .filter((c) => c.level === result.placement)
      .slice(0, 3);

    res.locals.seo = { ...res.locals.seo, noindex: true };
    view(res, "result", {
      result,
      level: result.placement,
      recommended,
      wroteWords: words,
    });
  }

  return router;
}

module.exports = { build };
