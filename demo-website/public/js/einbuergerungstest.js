/* ═══════════════════════════════════════════════════════════════════
   Einbürgerungstest — the learning app.

   The rules live in et-core.js, which knows nothing about the DOM and
   is what the test suite exercises. This file is the other half: it
   owns the screen, the storage and the clock, and asks ETCore whenever
   a question of "what counts as a pass" arises.

   Three shapes of session:
     practice  — answer, see at once whether it was right, move on
     exam      — 33 questions, 60 minutes, nothing revealed until the end
     review    — read back a finished exam

   Progress lives in localStorage behind a small Store object, so a
   server-backed version later is a change in one place rather than
   forty. Nothing leaves the device.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.querySelector("[data-et]");
  if (!root || !window.ETCore) return;

  var Core = window.ETCore;
  var RULES = Core.RULES;

  /* ── Words ───────────────────────────────────────────────────────
     Every visible string comes from the server in the reader's
     language, as one blob on the root element. Not fetched: the quiz
     renders on the first tap, and a round trip for the word "Weiter"
     would show as a flicker.

     The questions are NOT in here. They stay German whichever language
     the page is in, because the exam is in German — the English
     reading of a question sits behind a button beside it. */
  var LANG = root.getAttribute("data-lang") === "de" ? "de" : "en";

  /* A hash of the question data, stamped into every URL below.
     Without it a corrected answer never reaches anybody whose service
     worker has already cached the old file — the catalogue is served
     cache-first, and the URL would not have changed. */
  var DATA_V = root.getAttribute("data-version") || "0";
  var STR = {};
  try {
    STR = JSON.parse(root.getAttribute("data-i18n") || "{}");
  } catch (e) {
    STR = {};
  }

  /**
   * One string, with {placeholders} filled in.
   *
   * Falls back to the key itself rather than to empty. A button
   * labelled "et.submit" is obviously broken and gets reported; a
   * button labelled nothing at all looks like a rendering bug and
   * gets lived with.
   */
  function T(key, vars) {
    var out = STR[key];
    if (out === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return out;
  }

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) {
    return Array.prototype.slice.call((el || document).querySelectorAll(sel));
  };

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Storage ─────────────────────────────────────────────────────
     One namespace, one shape, and every read defended.

     localStorage throws in a private window on some browsers and
     returns nonsense when a previous version wrote a different shape.
     Either would otherwise take the whole page down on load, which is
     a poor trade for remembering a Bundesland. */
  var KEY = "ln-et-v1";

  var Store = {
    blank: function () {
      return {
        state: null,
        history: {},     /* id -> { right, wrong, lastWrong, seen } */
        saved: [],       /* bookmarked ids */
        exams: [],       /* { date, correct, total, passed } */
        /* How many times the explanation has been opened on this
           device. Only used to stop nudging somebody towards a button
           they have already found. */
        explained: 0,
        updated: null,
      };
    },

    read: function () {
      var data = this.blank();
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return data;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return data;
        /* Field by field, so one bad key cannot discard the rest. */
        if (typeof parsed.state === "string") data.state = parsed.state;
        if (parsed.history && typeof parsed.history === "object") data.history = parsed.history;
        if (Array.isArray(parsed.saved)) data.saved = parsed.saved.filter(function (x) {
          return typeof x === "string";
        });
        if (Array.isArray(parsed.exams)) data.exams = parsed.exams.filter(function (e) {
          return e && typeof e.correct === "number";
        });
        if (typeof parsed.explained === "number") data.explained = parsed.explained;
      } catch (e) {
        /* Corrupt or unavailable: start clean rather than fail. */
      }
      return data;
    },

    write: function (data) {
      try {
        data.updated = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        /* Full or blocked. The session still works; it just will not
           be remembered, which is better than an error mid-exam. */
      }
      return data;
    },

    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
    },
  };

  var store = Store.read();

  /* ── Syncing to an account ───────────────────────────────────────
     Optional in both directions. The page works signed-out and keeps
     everything locally; if there is an account, the same record is
     merged into it so a new phone does not start from zero.

     Merged server-side rather than overwritten: somebody practising
     on a phone and a laptop must not lose a morning's work to
     whichever tab saved last. The merged result comes back and is
     adopted here, so both sides end up agreeing. */
  var account = { signedIn: false, pending: false, timer: null };

  function pushSoon() {
    if (!account.signedIn) return;
    /* Coalesced: answering ten questions in a minute is one save, not
       ten. Practice stays instant either way — the local write has
       already happened by the time this is scheduled. */
    if (account.timer) window.clearTimeout(account.timer);
    account.timer = window.setTimeout(push, 4000);
  }

  function push() {
    if (!account.signedIn || account.pending) return;
    account.pending = true;
    fetch("/portal/einbuergerungstest/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundesland: store.state,
        history: store.history,
        saved: store.saved,
        exams: store.exams,
      }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok || !data.progress) return;
        adopt(data.progress);
        paintCounts();
        paintProgress();
      })
      .catch(function () {
        /* Offline or signed out mid-session. The local copy is intact
           and the next save will carry everything. */
      })
      .finally(function () { account.pending = false; });
  }

  function adopt(progress) {
    store.history = progress.history || store.history;
    store.saved = progress.saved || store.saved;
    store.exams = progress.exams || store.exams;
    if (progress.bundesland && !store.state) store.state = progress.bundesland;
    Store.write(store);
  }

  /* Ask once on load. A signed-out visitor pays one cheap request and
     never hears about accounts again. */
  fetch("/portal/einbuergerungstest/status", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.signedIn) {
        /* No account: make the case for one, once, where it is
           relevant — and point it back at this page so signing in
           does not lose their place. */
        var prompt = $("[data-et-signin]");
        if (prompt) {
          var link = $("[data-et-signin-link]", prompt);
          if (link) link.href = "/portal?next=" + encodeURIComponent(location.pathname);
          prompt.hidden = false;
        }
        return;
      }
      account.signedIn = true;
      if (data.progress) adopt(data.progress);
      showAccountBadge(data.name);
      paintCounts();
      paintProgress();
      /* Push straight away so anything practised while signed out on
         this device is carried up rather than stranded. */
      push();
    })
    .catch(function () {});

  function showAccountBadge(name) {
    var host = $("[data-et-account]");
    if (!host) return;
    host.hidden = false;
    host.textContent = "";
    host.appendChild(el("span", { text: T("accountBadge", { name: name }) }));
    host.appendChild(el("a", {
      href: "/portal/einbuergerungstest",
      text: T("myProgress"),
    }));
  }

  /* ── State ───────────────────────────────────────────────────── */

  var catalogue = null;      /* { general, stateQuestions, state } */
  var session = null;        /* the run in progress */
  var timer = null;

  var views = {
    landing: $("[data-et-view='landing']"),
    blocks: $("[data-et-view='blocks']"),
    quiz: $("[data-et-view='quiz']"),
    result: $("[data-et-view='result']"),
  };
  var quizHost = $("[data-et-quiz]");
  var resultHost = $("[data-et-result]");

  function show(name) {
    Object.keys(views).forEach(function (k) {
      if (views[k]) views[k].hidden = k !== name;
    });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  /* ── Small helpers ───────────────────────────────────────────── */

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      /* A function under an on* key is bound as a listener. Without
         this it went through setAttribute and landed in the DOM as
         the source text of the function — an attribute that looks
         plausible in the markup and does nothing at all. */
      else if (typeof attrs[k] === "function" && k.indexOf("on") === 0) {
        node.addEventListener(k.slice(2), attrs[k]);
      }
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  /* Announced to a screen reader without moving focus, so answering
     does not yank the reader away from where the person is. */
  var live = el("p", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true" });
  document.body.appendChild(live);
  function say(msg) { live.textContent = msg; }

  var LETTERS = ["A", "B", "C", "D"];

  /* ── Loading the catalogue ───────────────────────────────────── */

  function loadCatalogue(slug) {
    if (catalogue && catalogue.state.slug === slug) return Promise.resolve(catalogue);
    return fetch("/einbuergerungstest/fragen/" + encodeURIComponent(slug) +
                 ".json?v=" + encodeURIComponent(DATA_V), {
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("catalogue " + r.status);
        return r.json();
      })
      .then(function (data) {
        catalogue = data;
        return data;
      });
  }

  /* ── Landing ─────────────────────────────────────────────────── */

  var modesBlock = $("[data-et-modes]");
  var progressBlock = $("[data-et-progress]");
  var chosenLabel = $("[data-et-chosen]");

  function poolFor(mode) {
    if (!catalogue) return [];
    var all = catalogue.general.concat(catalogue.stateQuestions);
    if (mode === "all") return all;
    if (mode === "state") return catalogue.stateQuestions.slice();
    if (mode === "saved") {
      return all.filter(function (q) { return store.saved.indexOf(q.id) !== -1; });
    }
    if (mode === "mistakes") return Core.weakQuestions(all, store.history);
    if (mode === "smart") return Core.smartOrder(all, store.history);
    return all;
  }

  function paintCounts() {
    $$("[data-et-count]").forEach(function (btn) {
      var kind = btn.getAttribute("data-et-count");
      var n = kind === "saved" ? store.saved.length : poolFor("mistakes").length;
      var empty = n === 0;
      btn.disabled = empty && !!catalogue;
      var base = kind === "saved" ? T("modeSavedBtn") : T("modeMistakesBtn");
      btn.textContent = empty ? (kind === "saved" ? T("noneSaved") : T("noneWrong"))
                              : base + " (" + n + ")";
    });
  }

  function paintProgress() {
    if (!progressBlock) return;
    var total = catalogue
      ? catalogue.general.length + catalogue.stateQuestions.length
      : 310;
    var seen = 0, right = 0, wrong = 0;
    Object.keys(store.history).forEach(function (id) {
      var h = store.history[id];
      seen++;
      right += h.right || 0;
      wrong += h.wrong || 0;
    });
    var attempts = right + wrong;
    var best = store.exams.reduce(function (m, e) {
      return e.correct > m ? e.correct : m;
    }, -1);

    var set = function (key, value) {
      var node = $("[data-et-stat='" + key + "']");
      if (node) node.textContent = value;
    };
    set("practised", seen + " / " + total);
    set("accuracy", attempts ? Math.round((right / attempts) * 100) + " %" : "—");
    set("exams", String(store.exams.length));
    set("best", best >= 0 ? best + " / " + RULES.questions : "—");
    set("learned", T("statLearned", { n: seen, total: total }));

    var bar = $("[data-et-stat-bar]");
    if (bar) bar.style.width = total ? Math.round((seen / total) * 100) + "%" : "0%";
    progressBlock.hidden = seen === 0 && store.exams.length === 0;
  }

  function selectState(slug, name, options) {
    $$("[data-et-state]").forEach(function (b) {
      var on = b.getAttribute("data-et-state") === slug;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-on", on);
    });
    store.state = slug;
    Store.write(store);
    pushSoon();

    if (chosenLabel) {
      chosenLabel.textContent = T("chosen", { name: name });
    }
    if (modesBlock) modesBlock.hidden = false;

    loadCatalogue(slug)
      .then(function () {
        paintCounts();
        paintProgress();
        if (!options || !options.silent) {
          say(T("sayChosen", { name: name }));
        }
      })
      .catch(function () {
        if (chosenLabel) {
          chosenLabel.textContent = T("loadFailed", { name: name });
        }
      });
  }

  $$("[data-et-state]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectState(btn.getAttribute("data-et-state"), btn.getAttribute("data-name"));
      var modes = $("[data-et-modes]");
      if (modes) modes.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  /* Restore the previous choice, but only if it is still a real one:
     a Bundesland removed or renamed since must not leave the page
     pointing at a catalogue that no longer exists. */
  (function restore() {
    if (!store.state) return;
    var btn = $("[data-et-state='" + store.state + "']");
    if (!btn) { store.state = null; Store.write(store); return; }
    selectState(store.state, btn.getAttribute("data-name"), { silent: true });
  })();

  paintProgress();

  var resetBtn = $("[data-et-reset]");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!window.confirm(T("resetConfirm"))) return;
      Store.clear();
      store = Store.read();
      paintCounts();
      paintProgress();
      say(T("sayReset"));
    });
  }

  /* ── Starting a session ──────────────────────────────────────── */

  $$("[data-et-start]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-et-start");
      if (!catalogue) return;

      if (mode === "exam") {
        var paper;
        try {
          paper = Core.buildExam(catalogue.general, catalogue.stateQuestions);
        } catch (e) {
          window.alert(T("examFailed", { error: e.message }));
          return;
        }
        startSession({ mode: "exam", questions: paper, endsAt: Date.now() + RULES.minutes * 60000 });
        return;
      }

      if (mode === "all") { renderBlocks(); return; }

      var pool = poolFor(mode);
      if (!pool.length) return;
      startSession({
        mode: "practice",
        label: ({ all: T("labelAll"), state: catalogue.state.name,
                  saved: T("modeSaved"), mistakes: T("modeMistakes"),
                  smart: T("modeSmart") })[mode] || T("labelPractice"),
        questions: mode === "smart" ? pool : Core.shuffle(pool),
      });
    });
  });

  /* ── Practising in blocks ────────────────────────────────────────
     Thirty questions is a sitting. 300 in a row is a chore, and an
     unfinished chore teaches nothing — so the whole catalogue is
     offered in blocks, each showing how much of it already sits.

     The blocks follow the catalogue's own numbering rather than being
     cut from a shuffled pool, so "Fragen 31–60" means the same thing
     here as on the reading list and as in any other book the learner
     might be using. */

  var BLOCK = 30;
  var blocksHost = $("[data-et-blocks]");

  /** Every block on offer: the 300 in tens of thirty, then the state's ten. */
  function blockList() {
    var out = [];
    var general = catalogue.general;
    for (var i = 0; i < general.length; i += BLOCK) {
      var slice = general.slice(i, i + BLOCK);
      out.push({
        key: "general-" + i,
        area: "Deutschland",
        label: (i + 1) + " – " + (i + slice.length),
        questions: slice,
      });
    }
    if (catalogue.stateQuestions.length) {
      out.push({
        key: "state",
        area: catalogue.state.name,
        label: catalogue.state.name,
        questions: catalogue.stateQuestions.slice(),
      });
    }
    return out;
  }

  /** How much of a block already sits, from the browser's own record. */
  function blockProgress(questions) {
    var known = 0, seen = 0;
    questions.forEach(function (q) {
      var rec = store.history[q.id];
      if (!rec || !rec.seen) return;
      seen++;
      if (!rec.lastWrong) known++;
    });
    return { known: known, seen: seen, total: questions.length,
             done: known === questions.length };
  }

  function renderBlocks() {
    if (!blocksHost || !catalogue) return;
    blocksHost.textContent = "";

    var all = blockList();

    blocksHost.appendChild(el("button", {
      class: "linklike et-back", text: T("back"),
      onclick: function () { show("landing"); },
    }));

    blocksHost.appendChild(el("h2", { class: "et-chunks-title", text: T("blocksTitle") }));
    blocksHost.appendChild(el("p", { class: "lead", text: T("blocksLead") }));

    /* Deutschland first, then the learner's own Bundesland — the same
       order as the reading list, so a block means the same thing in
       both places. */
    var areas = [];
    all.forEach(function (b) {
      if (areas.indexOf(b.area) === -1) areas.push(b.area);
    });

    areas.forEach(function (area) {
      var mine = all.filter(function (b) { return b.area === area; });
      var grid = el("div", { class: "et-chunks" });

      mine.forEach(function (b) {
        var p = blockProgress(b.questions);
        var pct = p.total ? Math.round((p.known / p.total) * 100) : 0;

        var card = el("button", {
          class: "et-chunk" + (p.done ? " is-done" : (p.seen ? " is-started" : "")),
          type: "button",
          "aria-label": T("blockAria", { label: b.label, known: p.known, total: p.total }),
          onclick: function () { startBlock(b); },
        }, [
          el("span", { class: "et-chunk-label", text: b.label }),
          el("span", { class: "et-chunk-bar" }, [
            el("i", { style: "width:" + pct + "%" }),
          ]),
          el("span", { class: "et-chunk-n", text: p.known + " / " + p.total }),
        ]);

        if (p.done) card.appendChild(el("span", { class: "et-chunk-tick", text: "✓", "aria-hidden": "true" }));
        grid.appendChild(card);
      });

      blocksHost.appendChild(el("p", { class: "et-chunks-area", text: area }));
      blocksHost.appendChild(grid);
    });

    show("blocks");
  }

  /** One block, in the catalogue's order so it can be followed in a book. */
  function startBlock(block) {
    startSession({
      mode: "practice",
      label: T("blockLabel", { label: block.label }),
      block: block,
      questions: block.questions.slice(),
    });
  }

  function startSession(cfg) {
    session = {
      mode: cfg.mode,
      label: cfg.label || null,
      block: cfg.block || null,
      questions: cfg.questions,
      basePool: cfg.questions.slice(),
      filter: "alle",
      index: 0,
      answers: {},
      marked: {},
      revealed: {},
      endsAt: cfg.endsAt || null,
    };
    show("quiz");
    renderQuestion();
    if (session.endsAt) startTimer();
  }

  /* ── The clock ───────────────────────────────────────────────── */

  function remaining() {
    return session ? Core.secondsLeft(session.endsAt) : 0;
  }

  /**
   * Driven by wall-clock time, not by counting ticks.
   *
   * A setInterval that decrements a number drifts, stops in a
   * backgrounded tab and loses whole minutes on a sleeping phone. The
   * deadline is a timestamp and every tick simply reads the clock, so
   * the exam is the length it says it is whatever the browser does.
   */
  function startTimer() {
    stopTimer();
    timer = window.setInterval(function () {
      var left = remaining();
      paintTimer(left);
      if (left <= 0) {
        stopTimer();
        finishExam({ automatic: true });
      }
    }, 1000);
    paintTimer(remaining());
  }

  function stopTimer() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  function paintTimer(left) {
    var node = $("[data-et-timer]");
    if (!node) return;
    var tone = Core.timerTone(left);
    node.textContent = Core.formatTime(left);
    node.classList.toggle("is-warn", tone === "warn");
    node.classList.toggle("is-urgent", tone === "urgent");
    if (left === 600) say("Noch zehn Minuten.");
    if (left === 300) say("Noch fünf Minuten.");
  }

  /* ── Rendering a question ────────────────────────────────────── */

  function current() { return session.questions[session.index]; }

  function imageBlock(q) {
    if (!q.image) return null;
    if (q.image.kind === "single") {
      var f = q.image.files[0];
      var fig = el("figure", { class: "et-figure" }, [
        el("img", {
          src: f.src, width: f.w, height: f.h, loading: "lazy", decoding: "async",
          alt: "Abbildung zur Frage: " + q.question,
        }),
      ]);
      /* The photo credit belongs with the photo. It is attribution,
         not part of the question being asked. */
      if (q.image.credit) fig.appendChild(el("figcaption", { text: q.image.credit }));
      return fig;
    }
    /* Four pictures, one per option: they are the options, so they are
       labelled with the same letters as the buttons below. */
    return el("div", { class: "et-figure-grid" },
      q.image.files.map(function (f, i) {
        return el("figure", { class: "et-figure-cell" }, [
          el("img", {
            src: f.src, width: f.w, height: f.h, loading: "lazy", decoding: "async",
            alt: "Auswahlbild " + (i + 1),
          }),
          el("figcaption", { text: "Bild " + (i + 1) }),
        ]);
      }));
  }

  /* The keys stay German. They are stored in the session and compared
     against, never shown — a filter that changed its own identity with
     the page language would be a different filter in each locale. */
  var FILTERS = [
    { key: "alle", label: "filterAll" },
    { key: "offen", label: "filterOpen" },
    { key: "richtig", label: "filterRight" },
    { key: "falsch", label: "filterWrong" },
    { key: "gespeichert", label: "filterSaved" },
  ];

  function matchesFilter(q, key) {
    var h = store.history[q.id];
    if (key === "offen") return !h;
    if (key === "richtig") return !!h && !h.lastWrong;
    if (key === "falsch") return !!h && h.lastWrong;
    if (key === "gespeichert") return store.saved.indexOf(q.id) !== -1;
    return true;
  }

  /**
   * The filter bar for practice.
   *
   * Changing a filter restarts the run over the narrower pool rather
   * than hiding questions inside it: "Frage 7 von 12" has to mean
   * seven of the twelve actually being practised, or the progress bar
   * is lying.
   */
  function filterBar() {
    var wrap = el("div", { class: "et-filters", role: "group",
                           "aria-label": T("filterAria") });
    FILTERS.forEach(function (f) {
      var pool = session.basePool.filter(function (q) { return matchesFilter(q, f.key); });
      var btn = el("button", {
        class: "chip", type: "button",
        "aria-pressed": session.filter === f.key ? "true" : "false",
        text: T(f.label) + " (" + pool.length + ")",
      });
      btn.disabled = pool.length === 0 && session.filter !== f.key;
      btn.addEventListener("click", function () {
        if (!pool.length) return;
        session.filter = f.key;
        session.questions = pool;
        session.index = 0;
        renderQuestion();
        say(T("filterSay", { label: T(f.label), n: pool.length }));
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  /* ── Help on a single question ───────────────────────────────────

     Three things a learner may want while looking at a question, and
     none of them is the answer:

       English      — a reading of the question, beside the German
                      rather than instead of it. The exam is in German
                      and so the practice stays in German; what this
                      removes is the vocabulary barrier in front of a
                      civics question, which is not what is being
                      tested.

       Explanation  — why the right answer is right. Offered only once
                      the answer is on screen. Before that it would be
                      a hint button, and a hint button turns practice
                      into a lookup exercise; in the exam simulation
                      there is no such button at all until the paper
                      is handed in.

       Report       — a way to tell us the question is wrong. Ten of
                      the picture answers were wrong for weeks and a
                      reader found them, not a test.

     The English wording and the notes are fetched once per Bundesland,
     the first time anybody presses either button. Most people never
     do, and they are roughly as many bytes again as the questions. */

  /* How many times somebody may open an explanation before the
     button stops nudging them towards it. */
  var HINT_UNTIL = 3;

  var extras = { en: {}, notes: {} };
  var extrasState = "idle";     /* idle | loading | ready | failed */
  var extrasWaiting = [];

  function loadExtras() {
    if (extrasState === "ready" || extrasState === "failed") return Promise.resolve();
    if (extrasState === "loading") {
      return new Promise(function (done) { extrasWaiting.push(done); });
    }
    if (!catalogue) return Promise.resolve();
    extrasState = "loading";
    return fetch("/einbuergerungstest/hilfe/" +
                 encodeURIComponent(catalogue.state.slug) +
                 ".json?v=" + encodeURIComponent(DATA_V),
                 { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data) extras = { en: data.en || {}, notes: data.notes || {} };
        extrasState = data ? "ready" : "failed";
      })
      .catch(function () { extrasState = "failed"; })
      .finally(function () {
        extrasWaiting.splice(0).forEach(function (done) { done(); });
      });
  }

  /** Where this question sits in the reading list, so "look it up" works. */
  function catalogueHref(q) {
    if (q.type === "state") {
      return "/einbuergerungstest/fragen?land=" +
        encodeURIComponent(catalogue ? catalogue.state.slug : "") +
        "#frage-" + q.number;
    }
    var page = Math.max(1, Math.ceil(q.number / 30));
    return "/einbuergerungstest/fragen" + (page > 1 ? "?seite=" + page : "") +
      "#frage-" + q.number;
  }

  var BAMF = "https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/" +
             "Einbuergerung/gesamtfragenkatalog-lebenindeutschland.html";

  /* ── Icons ───────────────────────────────────────────────────────
     Drawn rather than set in type. The row used to mix an emoji
     globe, a literal "?" and a flag character: three different
     typefaces at three different weights, which is why it never
     looked like one control. These are one stroke width and one grid,
     like the icons in the back office.

     Markup constants, never anything a person typed — they go in
     through innerHTML, which is the only way to build SVG without
     createElementNS for every node. */
  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

  var ICONS = {
    /* 文 and A side by side — the shape every translate button uses. */
    translate: SVG_OPEN +
      '<path d="M2 5h11"/><path d="M7.5 3v2"/>' +
      '<path d="M10.5 5c0 4-2.8 7.2-7 8.6"/>' +
      '<path d="M5 9.5c1.3 2.2 3.3 4 5.8 5"/>' +
      '<path d="m13 21 4.2-9.5L21.5 21"/><path d="M14.6 17.4h5.3"/></svg>',
    /* A bulb: the idea, not a question mark. A "?" next to an answer
       that is already on screen reads as "still unsure?", which is the
       opposite of what this button does. */
    explain: SVG_OPEN +
      '<path d="M9.2 17.5a5.6 5.6 0 0 1-1.6-2.6C7.2 13.6 6 12.6 6 10a6 6 0 1 1 12 0c0 2.6-1.2 3.6-1.6 4.9a5.6 5.6 0 0 1-1.6 2.6"/>' +
      '<path d="M9.5 21h5"/><path d="M10 18.5h4"/></svg>',
    /* A warning triangle. A flag reads as "bookmark" next to a star. */
    report: SVG_OPEN +
      '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>' +
      '<path d="M12 9.5v4"/><path d="M12 17h.01"/></svg>',
    save: SVG_OPEN +
      '<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.4 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9Z"/></svg>',
  };

  /**
   * One icon button.
   *
   * Icon only, with the words in a tooltip. `aria-label` carries the
   * same words for a screen reader, and the tooltip also appears on
   * keyboard focus — a hover-only label is invisible to anyone not
   * using a mouse. On a phone there is no hover at all, which is why
   * every panel these open starts with its own heading: the meaning
   * arrives on the tap rather than before it.
   */
  function toolButton(opts) {
    var btn = el("button", {
      class: "et-tool" + (opts.extraClass ? " " + opts.extraClass : ""),
      type: "button",
      "aria-expanded": "false",
      "aria-label": opts.label,
      "data-tip": opts.label,
      html: ICONS[opts.icon],
    });
    btn.addEventListener("click", function () {
      var open = opts.panel.hidden;
      opts.panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-on", open);
      if (open && opts.onOpen) opts.onOpen(btn);
    });
    return btn;
  }

  /** Says what the button will do next, not what it did. */
  function setTip(btn, label) {
    btn.setAttribute("aria-label", label);
    btn.setAttribute("data-tip", label);
  }


  /** The English reading of one question, filled in once it arrives. */
  function translationPanel(q) {
    var body = el("div", { class: "et-panel-body" }, [
      el("p", { class: "muted", text: T("translateLoading") }),
    ]);
    var panel = el("div", { class: "et-panel et-panel-en", hidden: "" }, [
      el("p", { class: "et-panel-head", text: T("translateHead") }),
      body,
    ]);

    panel.fill = function () {
      var en = extras.en[q.id];
      body.textContent = "";
      if (!en) {
        body.appendChild(el("p", { class: "muted", text: T("translateNone") }));
        return;
      }
      body.appendChild(el("p", { class: "et-en-q", text: en.question }));
      var list = el("ol", { class: "et-en-answers" });
      (en.answers || []).forEach(function (a, i) {
        list.appendChild(el("li", {}, [
          el("span", { class: "et-en-key", text: LETTERS[i] }),
          el("span", { text: a }),
        ]));
      });
      body.appendChild(list);
      /* Said every time it is opened, not once in the small print at
         the bottom of the page. Somebody who learns an answer from the
         English and then meets the German wording in the exam needs to
         have been told which one counts. */
      body.appendChild(el("p", { class: "et-panel-note", text: T("translateNote") }));
    };
    return panel;
  }

  /** Why the right answer is right — plus where to check for yourself. */
  function notePanel(q) {
    var body = el("div", { class: "et-panel-body" }, [
      el("p", { class: "muted", text: T("translateLoading") }),
    ]);
    var panel = el("div", { class: "et-panel et-panel-why", hidden: "" }, [
      el("p", { class: "et-panel-head", text: T("explainHead") }),
      body,
    ]);

    panel.fill = function () {
      var note = extras.notes[q.id];
      var text = note ? (LANG === "de" ? note.de : note.en) || note.de || note.en : null;
      body.textContent = "";
      body.appendChild(text
        ? el("p", { class: "et-why-text", text: text })
        : el("p", { class: "muted", text: T("explainNone") }));

      var meta = el("ul", { class: "et-panel-meta" });
      if (note && note.ref) {
        meta.appendChild(el("li", {}, [
          el("span", { class: "muted", text: T("explainSource") + ": " }),
          el("span", { text: note.ref }),
        ]));
      }
      if (q.category) {
        meta.appendChild(el("li", {}, [
          el("span", { class: "muted", text: T("explainTopic") + ": " }),
          el("span", { text: q.type === "state" ? q.state : q.category }),
        ]));
      }
      if (meta.childNodes.length) body.appendChild(meta);

      /* Two ways to check us rather than take our word for it: the
         same question in our own reading list, and the official PDF
         it came from. A page that explains without being checkable
         is asking to be trusted, which is not the same thing. */
      body.appendChild(el("p", { class: "et-panel-links" }, [
        el("a", { href: catalogueHref(q), target: "_blank",
                  rel: "noopener", text: T("explainRead") }),
        el("a", { href: BAMF, target: "_blank",
                  rel: "noopener noreferrer", text: T("explainOfficial") }),
      ]));
    };
    return panel;
  }

  var REPORT_KINDS = [
    { value: "wrong_answer", label: "reportKindWrong" },
    { value: "typo", label: "reportKindTypo" },
    { value: "image", label: "reportKindImage" },
    { value: "translation", label: "reportKindTranslation" },
    { value: "other", label: "reportKindOther" },
  ];

  function reportPanel(q) {
    var kind = el("select", { class: "et-report-kind", id: "et-rk-" + q.id });
    REPORT_KINDS.forEach(function (k) {
      kind.appendChild(el("option", { value: k.value, text: T(k.label) }));
    });

    var message = el("textarea", {
      class: "et-report-msg", id: "et-rm-" + q.id, rows: "3",
      placeholder: T("reportMessagePlaceholder"), maxlength: "2000",
    });
    var email = el("input", {
      class: "et-report-mail", id: "et-re-" + q.id, type: "email",
      autocomplete: "email", maxlength: "190",
    });
    /* Off-screen rather than display:none — a field that is not
       rendered at all is one some bots know to skip. */
    var honey = el("input", {
      class: "et-hp", type: "text", name: "website", tabindex: "-1",
      autocomplete: "off", "aria-hidden": "true",
    });

    var status = el("p", { class: "et-report-status", role: "status" });
    var send = el("button", { class: "btn et-report-send", type: "submit",
                              text: T("reportSend") });

    var form = el("form", { class: "et-report-form", novalidate: "" }, [
      el("p", { class: "muted et-report-about",
                text: T("reportAbout", { n: q.number }) }),
      el("p", { class: "et-field" }, [
        el("label", { for: "et-rk-" + q.id, text: T("reportKind") }), kind,
      ]),
      el("p", { class: "et-field" }, [
        el("label", { for: "et-rm-" + q.id, text: T("reportMessage") }), message,
      ]),
      el("p", { class: "et-field" }, [
        el("label", { for: "et-re-" + q.id, text: T("reportEmail") }), email,
        el("span", { class: "muted et-field-note", text: T("reportEmailNote") }),
      ]),
      honey,
      el("p", { class: "et-report-actions" }, [send]),
      status,
    ]);

    var panel = el("div", { class: "et-panel et-panel-report", hidden: "" }, [
      el("p", { class: "et-panel-head", text: T("reportTitle") }),
      el("p", { class: "muted", text: T("reportLead") }),
      form,
    ]);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!message.value.trim()) {
        status.className = "et-report-status is-bad";
        status.textContent = T("reportInvalid");
        message.focus();
        return;
      }
      send.disabled = true;
      status.className = "et-report-status";
      status.textContent = T("reportSending");

      fetch("/einbuergerungstest/melden", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          questionNo: q.number,
          question: q.question,
          kind: kind.value,
          message: message.value,
          email: email.value,
          lang: LANG,
          website: honey.value,
        }),
      })
        .then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); })
        .then(function (out) {
          if (out.r.ok && out.d && out.d.ok) {
            /* The form is replaced by the thank-you rather than left
               sitting there filled in: the commonest next action on a
               form that still looks armed is to press it again. */
            form.textContent = "";
            form.appendChild(el("p", { class: "et-report-status is-good",
                                       text: T("reportThanks") }));
            say(T("reportThanks"));
            return;
          }
          send.disabled = false;
          status.className = "et-report-status is-bad";
          status.textContent = out.r.status === 429 ? T("reportTooMany")
            : (out.d && out.d.error) || T("reportInvalid");
        })
        .catch(function () {
          send.disabled = false;
          status.className = "et-report-status is-bad";
          status.textContent = T("reportFailed");
        });
    });

    return panel;
  }

  /**
   * The row of tools under a question, with their panels.
   *
   * `revealed` decides whether the explanation is on offer at all. In
   * practice it appears once the answer is showing; in the exam it
   * never does, which is the whole point of an exam.
   */
  function toolsFor(q, revealed) {
    var wrap = el("div", { class: "et-tools-wrap" });
    var row = el("div", { class: "et-tools", role: "group",
                          "aria-label": T("toolsAria") });

    var enPanel = translationPanel(q);
    var enBtn = toolButton({
      icon: "translate", label: T("translate"),
      panel: enPanel, extraClass: "et-tool-en",
      onOpen: function (btn) {
        setTip(btn, T("translateOff"));
        loadExtras().then(function () { enPanel.fill(); });
      },
    });
    /* Closing puts the label back. Without this the tooltip still
       offers the German while the German is the only thing showing. */
    enBtn.addEventListener("click", function () {
      if (enPanel.hidden) setTip(enBtn, T("translate"));
    });
    row.appendChild(enBtn);
    wrap.appendChild(enPanel);

    if (revealed) {
      var why = notePanel(q);
      /* This button is not there before the answer is, so it arrives
         mid-session on a card the learner has already looked at — the
         one place on the page where something new can appear and be
         missed entirely.

         Two separate signals, because they say different things.
         is-ready is permanent: gold outline, meaning "there is an
         explanation behind this". is-hint is the nudge, and it stops
         after the explanation has been opened a few times — something
         that pulses on all 300 questions is not a hint, it is a
         flicker, and a learner stops seeing it by the third card. */
      var learned = store.explained >= HINT_UNTIL;
      var whyBtn = toolButton({
        icon: "explain", label: T("explain"),
        panel: why, extraClass: "et-tool-why is-ready" + (learned ? "" : " is-hint"),
        onOpen: function (btn) {
          btn.classList.remove("is-hint");
          store.explained = (store.explained || 0) + 1;
          Store.write(store);
          loadExtras().then(function () { why.fill(); });
        },
      });
      row.appendChild(whyBtn);
      wrap.appendChild(why);
    }

    /* Saving is not a panel, so it is not a toolButton — but it sits
       in the same row and looks the same, because from the learner's
       side it is the same kind of thing: something you do TO this
       question. It used to be a lone pill in the opposite corner. */
    var on = store.saved.indexOf(q.id) !== -1;
    var saveBtn = el("button", {
      class: "et-tool et-tool-save" + (on ? " is-on" : ""),
      type: "button",
      "aria-pressed": on ? "true" : "false",
      "aria-label": on ? T("saved") : T("save"),
      "data-tip": on ? T("saved") : T("save"),
      html: ICONS.save,
    });
    saveBtn.addEventListener("click", function () { toggleSave(q, this); });
    row.appendChild(saveBtn);

    var report = reportPanel(q);
    row.appendChild(toolButton({
      icon: "report", label: T("report"),
      panel: report, extraClass: "et-tool-report",
    }));
    wrap.appendChild(report);

    wrap.insertBefore(row, wrap.firstChild);
    return wrap;
  }

  function renderQuestion() {
    var q = current();
    var exam = session.mode === "exam";
    var total = session.questions.length;
    var answered = session.answers[q.id];
    var revealed = !exam && session.revealed[q.id];

    quizHost.textContent = "";

    /* Header: back, position, progress, timer. */
    var head = el("div", { class: "et-head" }, [
      el("button", { class: "linklike et-back", type: "button", text: T("back") }),
      el("p", { class: "et-count",
                text: T("qOf", { n: session.index + 1, total: total }) }),
    ]);
    if (exam) {
      head.appendChild(el("p", { class: "et-timer", "data-et-timer": "",
                                 "aria-label": T("timeLeft"), text: "60:00" }));
    }
    $(".et-back", head).addEventListener("click", leaveSession);

    var bar = el("div", { class: "et-bar et-bar-lg" }, [
      el("span", { class: "et-bar-fill",
                   style: "width:" + Math.round(((session.index + 1) / total) * 100) + "%" }),
    ]);

    var meta = el("div", { class: "et-qmeta" }, [
      el("span", { class: "pill", text: q.type === "state" ? q.state : q.category }),
    ]);

    var card = el("section", { class: "et-card" }, [
      meta,
      el("h2", { class: "et-question", text: q.question }),
      imageBlock(q),
      /* Between the question and the answers: close enough to the
         German to be found when the German is the problem, and above
         the options so opening one does not push the answers off a
         phone screen. */
      toolsFor(q, revealed),
    ]);

    var list = el("div", { class: "et-answers", role: "group",
                           "aria-label": T("answersAria") });
    q.answers.forEach(function (text, i) {
      var btn = el("button", { class: "et-answer", type: "button", "data-i": String(i) }, [
        el("span", { class: "et-answer-key", text: LETTERS[i] }),
        el("span", { class: "et-answer-text", text: text }),
      ]);
      if (answered === i) btn.classList.add("is-chosen");
      if (revealed) {
        if (i === q.correctAnswer) {
          btn.classList.add("is-correct");
          btn.appendChild(el("span", { class: "et-answer-mark", text: "✓", "aria-hidden": "true" }));
        } else if (answered === i) {
          btn.classList.add("is-wrong");
          btn.appendChild(el("span", { class: "et-answer-mark", text: "✕", "aria-hidden": "true" }));
        }
        btn.disabled = true;
      }
      btn.addEventListener("click", function () { choose(i); });
      list.appendChild(btn);
    });
    card.appendChild(list);

    if (revealed) card.appendChild(feedbackBlock(q, answered));

    quizHost.appendChild(head);
    quizHost.appendChild(bar);
    if (!exam && session.basePool && session.basePool.length > 12) {
      quizHost.appendChild(filterBar());
    }
    quizHost.appendChild(card);
    quizHost.appendChild(exam ? examFooter() : practiceFooter(revealed));
    if (exam) {
      quizHost.appendChild(navigator());
      paintTimer(remaining());
    }
  }

  function feedbackBlock(q, answered) {
    var right = answered === q.correctAnswer;
    /* Never colour alone: an icon and a word carry the same message,
       for colour-blind readers and for anyone reading it aloud. */
    var box = el("div", { class: "et-feedback " + (right ? "is-right" : "is-wrong"),
                          role: "status" }, [
      el("p", { class: "et-feedback-head",
                text: right ? T("feedbackRight") : T("feedbackWrong") }),
    ]);
    if (!right) {
      box.appendChild(el("p", { class: "et-feedback-answer" }, [
        el("span", { class: "muted", text: T("correctAnswer") }),
        el("strong", { text: q.answers[q.correctAnswer] }),
      ]));
    }
    return box;
  }

  function practiceFooter(revealed) {
    var wrap = el("div", { class: "et-actions" });
    if (session.index > 0) {
      var prev = el("button", { class: "btn btn-ghost", type: "button", text: T("prevQuestion") });
      prev.addEventListener("click", function () { go(-1); });
      wrap.appendChild(prev);
    }
    if (revealed) {
      var last = session.index === session.questions.length - 1;
      var next = el("button", { class: "btn", type: "button",
                                text: last ? T("endPractice") : T("continue") });
      next.addEventListener("click", function () { last ? finishPractice() : go(1); });
      wrap.appendChild(next);
    } else {
      wrap.appendChild(el("p", { class: "muted et-hint", text: T("hint") }));
    }
    return wrap;
  }

  function examFooter() {
    var wrap = el("div", { class: "et-actions" });
    var prev = el("button", { class: "btn btn-ghost", type: "button", text: T("prev") });
    prev.disabled = session.index === 0;
    prev.addEventListener("click", function () { go(-1); });

    var mark = el("button", {
      class: "btn btn-ghost" + (session.marked[current().id] ? " is-on" : ""),
      type: "button",
      "aria-pressed": session.marked[current().id] ? "true" : "false",
      text: session.marked[current().id] ? T("unmark") : T("mark"),
    });
    mark.addEventListener("click", function () {
      var id = current().id;
      session.marked[id] = !session.marked[id];
      renderQuestion();
    });

    var next = el("button", { class: "btn", type: "button", text: T("next") });
    next.disabled = session.index === session.questions.length - 1;
    next.addEventListener("click", function () { go(1); });

    var submit = el("button", { class: "btn et-submit", type: "button", text: T("submit") });
    submit.addEventListener("click", confirmSubmit);

    wrap.appendChild(prev);
    wrap.appendChild(mark);
    wrap.appendChild(next);
    wrap.appendChild(submit);
    return wrap;
  }

  function navigator() {
    var wrap = el("div", { class: "et-nav" }, [
      el("p", { class: "et-nav-title", text: T("navTitle") }),
    ]);
    var grid = el("div", { class: "et-nav-grid", role: "group", "aria-label": T("navAria") });
    session.questions.forEach(function (q, i) {
      var cls = "et-nav-cell";
      if (i === session.index) cls += " is-current";
      if (session.answers[q.id] !== undefined) cls += " is-answered";
      if (session.marked[q.id]) cls += " is-marked";
      var b = el("button", {
        class: cls, type: "button", text: String(i + 1),
        "aria-label": T("navCellAria", {
          n: i + 1,
          answered: session.answers[q.id] !== undefined ? T("navAnswered") : T("navOpen"),
          marked: session.marked[q.id] ? ", " + T("navMarked") : "",
        }),
        "aria-current": i === session.index ? "true" : null,
      });
      b.addEventListener("click", function () { session.index = i; renderQuestion(); });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    wrap.appendChild(el("p", { class: "et-legend" }, [
      el("span", { class: "et-legend-item is-answered", text: T("navAnswered") }),
      el("span", { class: "et-legend-item", text: T("navOpen") }),
      el("span", { class: "et-legend-item is-marked", text: T("navMarked") }),
    ]));
    return wrap;
  }

  /* ── Answering ───────────────────────────────────────────────── */

  function choose(i) {
    var q = current();
    if (session.mode !== "exam" && session.revealed[q.id]) return;
    session.answers[q.id] = i;

    if (session.mode === "exam") {
      renderQuestion();
      return;
    }

    session.revealed[q.id] = true;
    record(q, i === q.correctAnswer);
    renderQuestion();
    say(i === q.correctAnswer
      ? T("sayRight")
      : T("sayWrong", { answer: q.answers[q.correctAnswer] }));
  }

  function record(q, right) {
    var h = store.history[q.id] || { right: 0, wrong: 0, seen: 0, lastWrong: false };
    h.seen = (h.seen || 0) + 1;
    if (right) h.right = (h.right || 0) + 1;
    else h.wrong = (h.wrong || 0) + 1;
    h.lastWrong = !right;
    store.history[q.id] = h;
    Store.write(store);
    pushSoon();
  }

  function toggleSave(q, btn) {
    var at = store.saved.indexOf(q.id);
    if (at === -1) store.saved.push(q.id);
    else store.saved.splice(at, 1);
    Store.write(store);
    pushSoon();
    var on = at === -1;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    /* The icon is the same star either way — filled or not — so only
       the label changes. Rewriting textContent here used to wipe the
       SVG out of the button entirely. */
    setTip(btn, on ? T("saved") : T("save"));
    say(on ? T("saySaved") : T("sayUnsaved"));
  }

  function go(step) {
    var next = session.index + step;
    if (next < 0 || next >= session.questions.length) return;
    session.index = next;
    renderQuestion();
  }

  /* ── Keyboard ────────────────────────────────────────────────── */

  document.addEventListener("keydown", function (e) {
    if (!session || views.quiz.hidden) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var key = e.key.toLowerCase();
    var pick = "abcd".indexOf(key);
    if (pick === -1 && key >= "1" && key <= "4") pick = Number(key) - 1;
    if (pick >= 0 && pick < current().answers.length) {
      e.preventDefault();
      choose(pick);
      return;
    }
    if (key === "arrowright") { e.preventDefault(); go(1); }
    if (key === "arrowleft") { e.preventDefault(); go(-1); }
  });

  /* ── Leaving and finishing ───────────────────────────────────── */

  function leaveSession() {
    if (session && session.mode === "exam") {
      if (!window.confirm(T("leaveExam"))) return;
    }
    stopTimer();
    session = null;
    paintCounts();
    paintProgress();
    show("landing");
  }

  function confirmSubmit() {
    var answered = Object.keys(session.answers).length;
    var open = session.questions.length - answered;
    var msg = T("confirmSubmit", { n: answered, total: session.questions.length });
    if (open > 0) {
      msg += "\n" + (open === 1 ? T("confirmOpenOne") : T("confirmOpenMany", { n: open }));
    }
    if (window.confirm(msg)) finishExam({ automatic: false });
  }

  function finishExam(opts) {
    stopTimer();
    var result = Core.score(session.questions, session.answers);
    session.questions.forEach(function (q) {
      var given = session.answers[q.id];
      if (given !== undefined) record(q, given === q.correctAnswer);
    });
    store.exams.push({
      date: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      passed: result.passed,
    });
    Store.write(store);
    push();                 /* a finished exam is worth saving at once */
    renderResult(result, { automatic: !!(opts && opts.automatic) });
  }

  function finishPractice() {
    var answered = session.questions.filter(function (q) {
      return session.answers[q.id] !== undefined;
    });
    var result = Core.score(answered, session.answers);
    /* A block is a milestone; a filtered dip into the pool is not. The
       block is carried so the result can say which one was finished
       and offer the next. */
    renderResult(result, { practice: true, block: session.block || null });
  }

  /** The block after this one, if there is one still worth doing. */
  function nextBlockAfter(block) {
    if (!block) return null;
    var all = blockList();
    for (var i = 0; i < all.length; i++) {
      if (all[i].key === block.key) return all[i + 1] || null;
    }
    return null;
  }

  /* ── Result ──────────────────────────────────────────────────── */

  function renderResult(result, opts) {
    var practice = !!(opts && opts.practice);
    resultHost.textContent = "";

    var passed = result.passed;
    /* Finishing a block is a milestone and gets marked as one: a big
       mark, a line that responds to how it actually went, and the
       next block offered while the momentum is there. */
    var block = opts && opts.block;
    /* praise() decides the band; the words for it are copy and live
       with the rest of the translated strings, so an English page is
       congratulated in English. */
    var band = block ? Core.praise(result.percent) : null;
    var cheer = band ? {
      emoji: band.emoji,
      head: T("praise" + band.band.charAt(0).toUpperCase() + band.band.slice(1) + "Head"),
      body: T("praise" + band.band.charAt(0).toUpperCase() + band.band.slice(1) + "Body"),
    } : null;

    var head = el("div", {
      class: "et-result-head " + (practice ? (block ? "is-block" : "") : (passed ? "is-pass" : "is-fail")),
    });

    if (cheer) {
      head.appendChild(el("p", { class: "et-cheer", text: cheer.emoji, "aria-hidden": "true" }));
    }
    head.appendChild(el("p", { class: "et-result-score", text: result.correct + " / " + result.total }));
    head.appendChild(el("h2", {
      text: cheer ? cheer.head
                  : (practice ? T("resPractice")
                              : (passed ? T("resPass") : T("resFail"))),
    }));
    head.appendChild(el("p", { class: "lead", text:
      cheer ? cheer.body
            : (practice
                ? T("resPracticeLead")
                : (passed ? T("resPassLead") : T("resFailLead"))) }));

    if (block) {
      head.appendChild(el("p", { class: "et-cheer-block",
                                 text: T("resBlock", { label: block.label }) }));
    }
    if (opts && opts.automatic) {
      head.appendChild(el("p", { class: "notice", style: "margin-top:1rem",
                                 text: T("resTimeUp") }));
    }

    var nums = el("div", { class: "et-result-nums" }, [
      resultNum(T("numRight"), result.correct),
      resultNum(T("numWrong"), result.wrong),
      resultNum(T("numUnanswered"), result.unanswered),
      resultNum(T("numRate"), result.percent + " %"),
    ]);

    var actions = el("div", { class: "et-actions et-result-actions" });
    var wrongOnes = session.questions.filter(function (q) {
      var g = session.answers[q.id];
      return g === undefined || g !== q.correctAnswer;
    });

    if (wrongOnes.length) {
      var practiseWrong = el("button", { class: "btn", type: "button", text: T("practiseWrong") });
      practiseWrong.addEventListener("click", function () {
        startSession({ mode: "practice", label: T("wrongFromExam"),
                       questions: Core.shuffle(wrongOnes) });
      });
      actions.appendChild(practiseWrong);
    }
    if (!practice) {
      var again = el("button", { class: "btn btn-ghost", type: "button", text: T("newExam") });
      again.addEventListener("click", function () {
        startSession({ mode: "exam",
                       questions: Core.buildExam(catalogue.general, catalogue.stateQuestions),
                       endsAt: Date.now() + RULES.minutes * 60000 });
      });
      actions.appendChild(again);
    }
    /* The next block, offered where the momentum is. Placed before
       "Zur Übersicht" because carrying on is the likelier choice
       right after finishing one. */
    if (block) {
      var following = nextBlockAfter(block);
      if (following) {
        var onward = el("button", { class: "btn", type: "button",
                                    text: T("nextBlock", { label: following.label }) });
        onward.addEventListener("click", function () { startBlock(following); });
        actions.insertBefore(onward, actions.firstChild);
      }
      var pick = el("button", { class: "btn btn-ghost", type: "button", text: T("pickBlock") });
      pick.addEventListener("click", function () { session = null; renderBlocks(); });
      actions.appendChild(pick);
    }

    var back = el("button", { class: "btn btn-ghost", type: "button", text: T("toOverview") });
    back.addEventListener("click", function () {
      session = null; paintCounts(); paintProgress(); show("landing");
    });
    actions.appendChild(back);

    resultHost.appendChild(head);
    resultHost.appendChild(nums);
    resultHost.appendChild(actions);
    resultHost.appendChild(reviewList(result));

    show("result");
    paintCounts();
    paintProgress();
    say((cheer ? cheer.head + " " : (passed ? T("resPass") + ". " : "")) +
        T("sayResult", { n: result.correct, total: result.total }));

    /* Confetti for a passed exam, and for a block done really well.
       Not for every block: something that happens every time stops
       meaning anything. */
    var worthConfetti = (!practice && passed) || (block && result.percent >= 80);
    if (worthConfetti && !reduceMotion) celebrate();
  }

  function resultNum(label, value) {
    return el("div", { class: "et-result-num" }, [
      el("span", { class: "et-result-num-n", text: String(value) }),
      el("span", { class: "et-result-num-l", text: label }),
    ]);
  }

  /**
   * The review, as an accordion.
   *
   * Thirty-three expanded questions is a wall nobody reads. Closed by
   * default, wrong ones first, because those are the reason to be here.
   */
  function reviewList(result) {
    var wrap = el("section", { class: "et-review" }, [
      el("h3", { text: T("reviewTitle") }),
    ]);
    var byState = { wrong: [], unanswered: [], correct: [] };
    result.detail.forEach(function (d, i) {
      byState[d.state].push({ d: d, q: session.questions[i] });
    });

    [].concat(byState.wrong, byState.unanswered, byState.correct).forEach(function (row) {
      var q = row.q, d = row.d;
      var tag = d.state === "correct" ? T("revRight")
              : d.state === "wrong" ? T("revWrong") : T("revUnanswered");
      var det = el("details", { class: "et-review-item is-" + d.state }, [
        el("summary", {}, [
          el("span", { class: "et-review-tag", text: tag }),
          el("span", { class: "et-review-q", text: q.question }),
        ]),
        el("div", { class: "et-review-body" }, [
          d.given === null ? null : el("p", {}, [
            el("span", { class: "muted", text: T("yourAnswer") }),
            el("span", { text: q.answers[d.given] }),
          ]),
          el("p", {}, [
            el("span", { class: "muted", text: T("correctAnswer") }),
            el("strong", { text: q.answers[d.correct] }),
          ]),
        ]),
      ]);
      wrap.appendChild(det);
    });
    return wrap;
  }

  /** A short, quiet celebration. Nothing that blocks or bounces. */
  function celebrate() {
    var layer = el("div", { class: "et-confetti", "aria-hidden": "true" });
    for (var i = 0; i < 28; i++) {
      var p = el("i", {});
      p.style.left = Math.random() * 100 + "%";
      p.style.animationDelay = (Math.random() * 0.4).toFixed(2) + "s";
      p.style.background = i % 3 === 0 ? "var(--gold)" : (i % 3 === 1 ? "var(--accent)" : "var(--ok)");
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    window.setTimeout(function () { layer.remove(); }, 2600);
  }

  /* A half-finished exam should not vanish to a stray swipe. */
  window.addEventListener("beforeunload", function (e) {
    if (session && session.mode === "exam" && Object.keys(session.answers).length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
})();
