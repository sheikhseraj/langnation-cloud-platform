/* ═══════════════════════════════════════════════════════════════════
   Einbürgerungstest — the rules, with no user interface attached.

   Pure functions only: no DOM, no fetch, no localStorage. That is what
   makes them testable, and the exam rules are the part where a mistake
   is invisible on screen and wrong in a way that matters — a paper
   with 29 general questions, or a pass mark off by one.

   Loaded by <script> in the browser and by require() in the test
   suite, so there is one definition of "33 questions, 17 to pass"
   rather than two that can drift apart.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ETCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* The official rules. Everything else derives from these. */
  var RULES = {
    questions: 33,
    generalQuestions: 30,
    stateQuestions: 3,
    minutes: 60,
    passMark: 17,
  };

  /**
   * Fisher-Yates, against a supplied random source.
   *
   * The source is a parameter so a test can make the shuffle
   * deterministic; production passes Math.random and gets a real one.
   */
  function shuffle(list, rnd) {
    var random = rnd || Math.random;
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sample(list, n, rnd) {
    return shuffle(list, rnd).slice(0, Math.max(0, Math.min(n, list.length)));
  }

  /**
   * One exam paper: 30 general questions and 3 from the Bundesland.
   *
   * Throws rather than quietly returning a short paper. A practice app
   * that hands somebody 31 questions and calls it the real thing is
   * worse than one that refuses — and the caller can show a proper
   * message.
   */
  function buildExam(general, stateQuestions, rnd) {
    if (!Array.isArray(general) || !Array.isArray(stateQuestions)) {
      throw new Error("buildExam: expected two arrays");
    }
    if (general.length < RULES.generalQuestions) {
      throw new Error("buildExam: only " + general.length + " general questions available");
    }
    if (stateQuestions.length < RULES.stateQuestions) {
      throw new Error("buildExam: only " + stateQuestions.length + " state questions available");
    }
    return sample(general, RULES.generalQuestions, rnd)
      .concat(sample(stateQuestions, RULES.stateQuestions, rnd));
  }

  /**
   * Score a paper.
   *
   * `answers` maps question id to the chosen option index. Anything
   * missing counts as unanswered, which is not the same as wrong: the
   * result screen reports the two separately, because "I ran out of
   * time" and "I got it wrong" are different problems to fix.
   */
  function score(questions, answers) {
    var correct = 0, wrong = 0, unanswered = 0;
    var detail = [];
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var given = answers ? answers[q.id] : undefined;
      var state;
      if (given === undefined || given === null) { unanswered++; state = "unanswered"; }
      else if (given === q.correctAnswer) { correct++; state = "correct"; }
      else { wrong++; state = "wrong"; }
      detail.push({ id: q.id, given: given === undefined ? null : given,
                    correct: q.correctAnswer, state: state });
    }
    return {
      total: questions.length,
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      passed: correct >= RULES.passMark,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      detail: detail,
    };
  }

  /**
   * Seconds left on a deadline.
   *
   * Derived from two timestamps rather than counted down by a ticking
   * variable: an interval that decrements drifts, stops in a
   * backgrounded tab and loses whole minutes on a sleeping phone, so
   * the exam would quietly run long. Reading the clock cannot drift.
   */
  function secondsLeft(endsAt, now) {
    if (!endsAt) return 0;
    return Math.max(0, Math.round((endsAt - (now || Date.now())) / 1000));
  }

  /** Whether the exam is over on time alone. */
  function isExpired(endsAt, now) {
    return secondsLeft(endsAt, now) <= 0;
  }

  /**
   * How loudly the clock should speak.
   *
   * Calm for fifty minutes, a quiet warning at ten, insistent at five.
   * Naming the states here keeps the thresholds testable and stops the
   * stylesheet from being the only place that knows them.
   */
  function timerTone(left) {
    if (left <= 300) return "urgent";
    if (left <= 600) return "warn";
    return "calm";
  }

  /** mm:ss, never negative, never NaN on a corrupted timestamp. */
  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  /**
   * Questions the learner has got wrong and not since got right.
   *
   * A question answered wrongly in March and correctly twice since is
   * not a weak spot any more, so the most recent outcome is what
   * counts rather than the fact that it was ever missed.
   */
  function weakQuestions(questions, history) {
    var h = history || {};
    return questions.filter(function (q) {
      var rec = h[q.id];
      return !!rec && rec.lastWrong === true;
    });
  }

  /**
   * Practice order with the shakiest first.
   *
   * Never-seen questions come after known-weak ones but before known-
   * good ones: the point is to spend time where it pays, and a
   * question already answered right three times is the worst use of
   * the next minute.
   */
  function smartOrder(questions, history, rnd) {
    var h = history || {};
    function rank(q) {
      var rec = h[q.id];
      if (!rec) return 1;                         // unseen
      if (rec.lastWrong) return 0;                // weak
      return 2 + Math.min(rec.right || 0, 5);     // known, and how well
    }
    return shuffle(questions, rnd).sort(function (a, b) { return rank(a) - rank(b); });
  }

  /**
   * How ready somebody is, from their practice history.
   *
   * Three numbers, because one hides the two ways of not being ready.
   * Somebody who has answered thirty questions perfectly is not ready
   * — they have seen a tenth of the catalogue. Somebody who has seen
   * all 310 at 55% is not ready either. Readiness is the lower of
   * coverage and accuracy, so both have to be true.
   *
   *   coverage  how much of the pool has been attempted
   *   accuracy  how often the last attempt at a question was right
   *   ready     the binding constraint of the two
   */
  var READY_AT = 80;       // per cent, the point at which we say "book it"

  function readiness(questions, history) {
    var h = history || {};
    var total = questions.length;
    var seen = 0, right = 0;

    for (var i = 0; i < total; i++) {
      var rec = h[questions[i].id];
      if (!rec || !rec.seen) continue;
      seen++;
      /* The LAST outcome, not the tally: a question missed in March
         and right three times since is known, and one answered right
         once then wrong twice is not. */
      if (!rec.lastWrong) right++;
    }

    var coverage = total ? (seen / total) * 100 : 0;
    var accuracy = seen ? (right / seen) * 100 : 0;
    var ready = Math.min(coverage, accuracy);

    return {
      total: total,
      seen: seen,
      known: right,
      shaky: seen - right,
      untouched: total - seen,
      coverage: Math.round(coverage * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      ready: Math.round(ready * 10) / 10,
      readyAt: READY_AT,
      isReady: ready >= READY_AT,
      /* What is actually holding them back, so the advice can be
         specific rather than "keep practising". */
      limiter: coverage <= accuracy ? "coverage" : "accuracy",
    };
  }

  /** Readiness per category, for the bars. */
  function byCategory(questions, history) {
    var groups = {};
    questions.forEach(function (q) {
      var key = q.type === "state" ? "Bundesland" : q.category;
      (groups[key] = groups[key] || []).push(q);
    });
    return Object.keys(groups).map(function (name) {
      var r = readiness(groups[name], history);
      return { name: name, count: groups[name].length, stats: r };
    });
  }

  /**
   * Days until the exam, counted in whole calendar days.
   *
   * Both dates are flattened to midnight first: an exam at 09:00
   * tomorrow is "1 day away" however late tonight the question is
   * asked, and 23 hours is not "0 days".
   */
  function daysUntil(examDate, today) {
    if (!examDate) return null;
    var a = new Date(examDate);
    var b = today ? new Date(today) : new Date();
    if (isNaN(a.getTime())) return null;
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }

  /**
   * What to say to somebody, given where they are and when the exam is.
   *
   * Deliberately never discouraging and never falsely reassuring. The
   * one thing it will not do is tell somebody below the threshold that
   * they are ready, whatever the date says.
   */
  function advice(stats, days) {
    if (stats.seen === 0) {
      return { tone: "start", key: "noPractice",
               left: Math.ceil((stats.readyAt / 100) * stats.total) };
    }
    if (stats.isReady) {
      return { tone: "ready", key: days !== null && days >= 0 ? "readyWithDate" : "ready" };
    }
    /* How many more questions must be answered, and got right, to
       cross the line — the honest version of "keep going". */
    var targetSeen = Math.ceil((stats.readyAt / 100) * stats.total);
    var need = stats.limiter === "coverage"
      ? Math.max(0, targetSeen - stats.seen)
      : Math.max(0, Math.ceil((stats.readyAt * stats.seen) / 100) - stats.known);

    var perDay = days !== null && days > 0 ? Math.ceil(need / days) : null;
    return { tone: "working", key: stats.limiter, need: need, perDay: perDay };
  }

  /**
   * Which band a finished block falls into.
   *
   * Graded, because "Well done!" for 9 out of 30 is not encouragement,
   * it is not paying attention — and a learner notices being flattered.
   * Every band is warm, none is a lie, and the lowest still points
   * forwards rather than back.
   *
   * Returns the band and its emoji, not the words. The words are copy
   * and live in the translation file with everything else, so the
   * English page praises in English; the boundaries are logic and live
   * here, where they can be tested without a browser.
   */
  function praise(pct) {
    if (pct >= 95) return { band: "excellent", emoji: "🏆" };
    if (pct >= 80) return { band: "strong", emoji: "🎉" };
    if (pct >= 60) return { band: "good", emoji: "👍" };
    if (pct >= 40) return { band: "start", emoji: "💪" };
    return { band: "seed", emoji: "🌱" };
  }

  /** Every band praise() can return, in order. */
  var PRAISE_BANDS = ["seed", "start", "good", "strong", "excellent"];

  return {
    RULES: RULES,
    praise: praise,
    PRAISE_BANDS: PRAISE_BANDS,
    READY_AT: READY_AT,
    readiness: readiness,
    byCategory: byCategory,
    daysUntil: daysUntil,
    advice: advice,
    shuffle: shuffle,
    sample: sample,
    buildExam: buildExam,
    score: score,
    formatTime: formatTime,
    secondsLeft: secondsLeft,
    isExpired: isExpired,
    timerTone: timerTone,
    weakQuestions: weakQuestions,
    smartOrder: smartOrder,
  };
});
