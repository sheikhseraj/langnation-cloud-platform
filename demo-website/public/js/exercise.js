/* ═══════════════════════════════════════════════════════════════════
   Homework, as a worksheet that marks itself.

   The page arrives with every row on it and every row its own form
   with a real submit button, so it works with this file blocked —
   duller, not broken. What this adds is that a row checks itself the
   moment it is finished, so the whole exercise stays in view AND the
   correction arrives at the moment of the mistake.

   That last part is the one thing none of the German exercise sites
   do. mein-deutschbuch, lingua and german.net all put the whole
   exercise on the page and then make you press Check at the end, which
   means somebody can make the same mistake sixteen times before
   finding out.

   ── The answer is not here ──────────────────────────────────────────

   Checking is a fetch to the server, which knows the answer; this file
   never does. An answer key in a page is readable by anybody who
   presses Ctrl+U, and once it has been read the exercise is worthless
   to the person who read it.

   ── What is recorded ────────────────────────────────────────────────

   The FIRST answer to each question, enforced on the server. Practice
   is unlimited on purpose, so trying every option is allowed and costs
   the attempt its mark. The score is what you knew, not what you found.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var rows = [].slice.call(document.querySelectorAll("[data-hw-q]"));
  if (!rows.length) return;

  // Tells the stylesheet the per-row buttons are now redundant.
  document.documentElement.classList.add("hw-js");

  var sheet = document.querySelector(".hw-sheet");
  var doneBox = document.querySelector("[data-hw-done]");
  var sum = document.querySelector("[data-hw-sum]");
  var allBtn = document.querySelector("[data-hw-all]");
  var fill = document.querySelector("[data-hw-fill]");
  var bar = document.querySelector("[data-hw-bar]");
  var atEl = document.querySelector("[data-hw-at]");
  var jumps = [].slice.call(document.querySelectorAll("[data-hw-jump]"));

  /* Marked rows only.
   *
   * An open task cannot be right or wrong, so it is never marked —
   * and the summary opens when every question has been. Counting the
   * open ones meant a chapter containing any of them could never
   * finish: the student answered all 23 that could be answered and
   * the page sat there waiting for 37. */
  var marking = rows.filter(function (r) {
    return r.getAttribute("data-hw-kind") !== "open";
  });
  var total = marking.length;

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) document.body.classList.add("hw-still");

  var WELL = ["Richtig!", "Genau!", "Sehr gut!", "Stimmt!"];

  /* ── When to mark ────────────────────────────────────────────────

     "each" marks a row the moment it is finished, which is the better
     way to learn and the thing none of the German exercise sites do.
     "end" leaves everything alone until Alles prüfen, which is how the
     paper worksheet works and what somebody filling in twenty gaps in
     a row actually wants.

     Remembered per browser, because it is a working habit and not a
     setting anybody wants to find twice. localStorage can throw in a
     private window, so every touch of it is wrapped and the default
     survives. */
  var MODE_KEY = "ln-hw-check";
  var mode = "each";
  try {
    var kept = localStorage.getItem(MODE_KEY);
    if (kept === "end" || kept === "each") mode = kept;
  } catch (e) {}

  var modeBox = document.querySelector("[data-hw-mode]");
  if (modeBox) {
    modeBox.hidden = false;
    var modeBtns = [].slice.call(modeBox.querySelectorAll("[data-hw-mode-set]"));
    modeBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        mode = b.getAttribute("data-hw-mode-set");
        try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
        paintMode();
      });
    });
    paintMode();
  }

  function paintMode() {
    if (!modeBox) return;
    [].slice.call(modeBox.querySelectorAll("[data-hw-mode-set]")).forEach(function (b) {
      var on = b.getAttribute("data-hw-mode-set") === mode;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-on", on);
    });
  }

  /* Only the rows that can be marked. An open task has no form to
     submit and nothing to submit it to — the server refuses it — so
     wiring one up would give it an Enter key that posts and a
     "Alles prüfen" that reaches it. */
  marking.forEach(setUp);
  if (allBtn) {
    allBtn.hidden = false;
    allBtn.addEventListener("click", function () {
      rows.forEach(function (row) { if (row.__check) row.__check(); });
    });
  }

  /* Following a jump link marks where you are.

     The browser does the scrolling — these are real anchors, so they
     work with this file blocked and they put the question in the
     address bar, which means a link to one can be shared or
     bookmarked. */
  jumps.forEach(function (a) {
    a.addEventListener("click", function () { here(a.getAttribute("data-hw-jump")); });
  });
  window.addEventListener("hashchange", function () {
    here((location.hash.match(/frage-(\d+)/) || [])[1]);
  });
  here((location.hash.match(/frage-(\d+)/) || [])[1]);

  tally();

  function here(seq) {
    jumps.forEach(function (a) {
      a.classList.toggle("is-here", String(a.getAttribute("data-hw-jump")) === String(seq));
    });
  }

  function setUp(row) {
    var form = row.querySelector("form");
    var verdict = row.querySelector("[data-hw-verdict]");
    var markBox = row.querySelector("[data-hw-mark]");
    var answered = row.hasAttribute("data-hw-answered");

    if (answered) lock(row);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      check();
    });

    /* A row checks itself when it is finished and you leave it.

       On blur rather than on every keystroke: marking "komm" wrong on
       the way to "kommt" would be marking somebody for typing. And
       Enter checks, because a gap-fill exercise is typing and reaching
       for a button between every line is what makes six of them feel
       like twelve. */
    row.addEventListener("focusout", function () {
      if (mode !== "each") return;
      // A moment, so moving between the two gaps of one sentence does
      // not check the half-finished row on the way past.
      setTimeout(function () {
        if (mode !== "each") return;
        if (row.contains(document.activeElement)) return;
        if (filled(row)) check();
      }, 120);
    });

    row.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      // In "end", Enter is just the way down the page — marking is
      // what the button at the bottom is for.
      if (mode === "each") check();
      focusNext(row);
    });

    // Picking an option is a decision, so it is acted on at once.
    row.addEventListener("change", function (e) {
      if (mode !== "each") return;
      if (e.target && e.target.type === "radio") check();
    });

    row.__check = function () { if (!answered && filled(row)) check(); };

    function check() {
      if (answered || !filled(row)) return;
      answered = true;
      lock(row);

      var body = new URLSearchParams();
      body.set("attempt", form.elements.attempt.value);
      body.set("question", form.elements.question.value);
      values(row).forEach(function (v) { body.append("given", v); });

      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
        credentials: "same-origin",
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
        .then(show)
        .catch(function () {
          /* The network, not the answer. Give the row back rather than
             telling somebody their German was wrong when the wifi
             dropped. */
          answered = false;
          unlock(row);
          row.classList.add("is-offline");
        });
    }

    function show(res) {
      row.classList.remove("is-offline");
      row.classList.add(res.correct ? "is-right" : "is-wrong");

      if (markBox) {
        markBox.innerHTML = "";
        markBox.appendChild(tick(res.correct));
      }

      verdict.innerHTML = "";
      var head = document.createElement("p");
      head.className = "hw-verdict-head";
      head.textContent = res.correct ? WELL[Math.floor(Math.random() * WELL.length)] : "Nicht ganz";
      verdict.appendChild(head);

      if (!res.correct && res.answer) {
        var right = document.createElement("p");
        right.className = "hw-verdict-answer";
        right.innerHTML = "Richtig: <strong></strong>";
        right.querySelector("strong").textContent = res.answer;
        verdict.appendChild(right);
      }
      if (res.explain) {
        var why = document.createElement("p");
        why.className = "hw-verdict-why";
        why.textContent = res.explain;
        verdict.appendChild(why);
      }

      // A right answer needs no explanation taking up the page; a
      // wrong one does. Both get the word, only one gets the box.
      verdict.hidden = false;

      var jump = jumps.filter(function (a) {
        return String(a.getAttribute("data-hw-jump")) === String(row.getAttribute("data-hw-seq"));
      })[0];
      if (jump) jump.classList.add(res.correct ? "is-right" : "is-wrong");

      tally();
    }
  }

  /* ── the page's own bookkeeping ─────────────────────────────────── */

  function tally() {
    var marked = rows.filter(function (r) {
      return r.classList.contains("is-right") || r.classList.contains("is-wrong");
    });
    var right = rows.filter(function (r) { return r.classList.contains("is-right"); }).length;

    if (fill) fill.style.width = (total ? (marked.length / total) * 100 : 0) + "%";
    if (bar) bar.setAttribute("aria-valuenow", String(marked.length));
    if (atEl) atEl.textContent = String(marked.length);

    if (sum) {
      sum.textContent = marked.length
        ? marked.length + " von " + total + " beantwortet · " + right + " richtig"
        : "";
    }
    if (allBtn) allBtn.hidden = marked.length >= total;

    if (marked.length >= total && doneBox && doneBox.hidden) finish(right);
  }

  function finish(right) {
    doneBox.hidden = false;
    /* The summary lives at the bottom of the last page, so on a
       paged chapter it can open behind whichever page is on screen.
       The pager listens and moves there. */
    window.dispatchEvent(new CustomEvent("hw:done"));
    doneBox.querySelector("[data-hw-score]").textContent = String(right);

    var pct = total ? Math.round((right / total) * 100) : 0;
    var tone =
      pct === 100 ? { m: "🎉", h: "Alles richtig!", n: "Nicht eine falsch. Sehr gut." } :
      pct >= 70   ? { m: "👍", h: "Gut gemacht!", n: "Schau dir die falschen noch einmal an." } :
      pct >= 40   ? { m: "💪", h: "Fast!", n: "Noch einmal — beim zweiten Mal sitzt es meistens." } :
                    { m: "📚", h: "Weiter üben", n: "Lies die Erklärungen und probier es noch einmal." };

    doneBox.querySelector("[data-hw-emoji]").textContent = tone.m;
    doneBox.querySelector("[data-hw-headline]").textContent = tone.h;
    doneBox.querySelector("[data-hw-note]").textContent = tone.n;

    // Close the attempt, so it is scored even if they walk away from
    // this screen. The visible Fertig button is the fallback.
    var form = doneBox.querySelector("form");
    if (form) {
      var body = new URLSearchParams();
      body.set("attempt", form.elements.attempt.value);
      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
        credentials: "same-origin",
      }).catch(function () {});
    }

    doneBox.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  }

  /* ── odds and ends ──────────────────────────────────────────────── */

  function fields(row) {
    return [].slice.call(row.querySelectorAll('[name="given"]'));
  }

  function values(row) {
    var all = fields(row);
    var radios = all.filter(function (el) { return el.type === "radio"; });
    if (radios.length) {
      return radios.filter(function (r) { return r.checked; }).map(function (r) { return r.value; });
    }
    return all.map(function (el) { return el.value; });
  }

  function filled(row) {
    var v = values(row);
    return v.length > 0 && v.every(function (x) { return String(x).trim() !== ""; });
  }

  function lock(row) { fields(row).forEach(function (el) { el.disabled = true; }); }
  function unlock(row) { fields(row).forEach(function (el) { el.disabled = false; }); }

  function focusNext(row) {
    var at = rows.indexOf(row);
    for (var i = at + 1; i < rows.length; i++) {
      var el = rows[i].querySelector('[name="given"]:not([disabled])');
      if (el) { el.focus(); return; }
    }
  }

  /* ── One Uebung at a time ────────────────────────────────────────

     The chapter arrives with every page on it, because that is what
     it is without this file: a long worksheet, which is a perfectly
     good way to do homework and the only way somebody with no
     JavaScript is going to get. What this adds is the shape of the
     paper original -- one Uebung, then Weiter.

     Nothing is hidden that the server did not send, and nothing is
     fetched. Paging is show and hide. */
  (function paging() {
    var pages = [].slice.call(document.querySelectorAll("[data-hw-page]"));
    var pager = document.querySelector("[data-hw-pager]");
    if (pages.length < 2 || !pager) return;

    var prevBtn = pager.querySelector("[data-hw-prev]");
    var nextBtn = pager.querySelector("[data-hw-next]");
    var atBox = pager.querySelector("[data-hw-page-at]");
    var at = 0;

    pager.hidden = false;

    function show(n, focus) {
      at = Math.max(0, Math.min(pages.length - 1, n));
      pages.forEach(function (p, i) { p.hidden = i !== at; });
      if (prevBtn) prevBtn.disabled = at === 0;
      if (nextBtn) nextBtn.hidden = at === pages.length - 1;
      if (atBox) atBox.textContent = "Seite " + (at + 1) + " von " + pages.length;
      /* Here too, not only on a click: Zurück and Weiter move the
         page as well, and the list down the side has to follow them
         or it points at whichever Übung was last clicked. */
      mark(pages[at].getAttribute("data-hw-page"));

      /* Only on a real move, never on the first draw: scrolling the
         window on load fights the browser restoring where somebody
         was, and moves the page under a reader who has not asked for
         anything yet. */
      if (focus) {
        var top = pages[at].getBoundingClientRect().top + window.pageYOffset - 16;
        window.scrollTo({ top: top < 0 ? 0 : top, behavior: still ? "auto" : "smooth" });
        var first = pages[at].querySelector("h2, .hw-page-of");
        if (first) {
          first.setAttribute("tabindex", "-1");
          first.focus({ preventScroll: true });
        }
      }
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { show(at - 1, true); });
    if (nextBtn) nextBtn.addEventListener("click", function () { show(at + 1, true); });

    /* The list down the side jumps to a question, and that question
       is now usually on a page nobody is looking at. Without this the
       link moved the scroll to a hidden element, which is a click
       that appears to do nothing at all. */
    function pageOf(el) {
      var sec = el && el.closest ? el.closest("[data-hw-page]") : null;
      return sec ? pages.indexOf(sec) : -1;
    }
    jumps.forEach(function (a) {
      a.addEventListener("click", function () {
        var id = (a.getAttribute("href") || "").slice(1);
        var target = id && document.getElementById(id);
        var n = pageOf(target);
        if (n > -1 && n !== at) show(n, false);
      });
    });

    /* The list down the side is the Übungen on a paged chapter, so
       its links turn the page rather than scrolling to a question.
       Handled here and not by the anchor alone: the target page is
       hidden, and an anchor to a hidden element does nothing at all
       — a click that visibly fails. */
    [].slice.call(document.querySelectorAll("[data-hw-page-jump]")).forEach(function (a) {
      a.addEventListener("click", function (e) {
        var no = Number(a.getAttribute("data-hw-page-jump"));
        var n = pages.findIndex(function (p) {
          return Number(p.getAttribute("data-hw-page")) === no;
        });
        if (n < 0) return;
        e.preventDefault();
        show(n, true);
      });
    });

    /* Which one is open, down the side. */
    function mark(no) {
      [].slice.call(document.querySelectorAll("[data-hw-page-jump]")).forEach(function (a) {
        a.classList.toggle("is-here",
          Number(a.getAttribute("data-hw-page-jump")) === Number(no));
      });
    }

    /* Finished: the whole worksheet opens and the pager goes away.
       Paging is for working through; reviewing what you answered is
       the opposite job, and clicking Weiter seven times to re-read
       your own chapter is not reviewing it. The summary already sits
       below every page, so nothing moves under anybody. */
    window.addEventListener("hw:done", function () {
      pages.forEach(function (p) { p.hidden = false; });
      pager.hidden = true;
    });

    show(0, false);
  })();

  /* ── The teacher's version of a task nothing marks ───────────────

     Already in the page, hidden. There is nothing to protect: an open
     task is not scored, so the only thing seeing it early costs is
     the exercise of trying first. Fetching it would be ceremony. */
  (function models() {
    [].slice.call(document.querySelectorAll("[data-hw-show]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var box = btn.parentNode.querySelector("[data-hw-model]");
        if (!box) return;
        var open = !box.hidden;
        box.hidden = open;
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        btn.textContent = open ? "So könnte es heißen" : "Ausblenden";
      });
    });
  })();

  /* The tick or the cross, drawn rather than typed. An emoji renders
     as a different picture at a different size on every platform,
     which the congratulation at the end can afford and a verdict on
     one answer cannot. */
  function tick(correct) {
    var box = document.createElement("span");
    box.className = "hw-mark " + (correct ? "is-right" : "is-wrong");
    box.innerHTML = correct
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    return box;
  }
})();
