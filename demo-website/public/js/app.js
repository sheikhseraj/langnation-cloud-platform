/* ═══════════════════════════════════════════════════════════════════
   LangNation — all client-side behaviour.

   Deliberately one small vanilla file: no jQuery, no framework, no build
   step. Every block below is independent and exits quietly if its markup
   is not on the page, so the same file serves every route.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* ── Drafts: nothing typed is lost ───────────────────────────────

     Two things lose a half-written email: closing the tab, and the
     internet going while it sends. Neither can be helped by saving to
     the server — in the second one there is no server to reach — so
     drafts are written to this browser instead, as you type.

     The cost is said on the page rather than hidden: a draft lives in
     one browser on one machine. A Drafts folder that quietly means "on
     this computer" is one somebody is surprised by exactly once, at the
     worst possible moment.

     ── When a draft is cleared ──────────────────────────────────────

     Not when the form is submitted. A submit that fails — the send is
     refused, the attachment is too big, the office is offline — comes
     back with the text gone, which is the thing this exists to prevent.

     So submitting only MARKS it, and the next page load decides. The
     admin redirects with ?done=..., and a message starting "Nothing
     sent" or "Not sent" means it did not go. Anything else did, and
     only then is the draft dropped.                                   */
  (function drafts() {
    const KEY = "ln.drafts.v1";

    // localStorage throws in a private window and in a browser with
    // site data blocked. A draft is a convenience; losing it must not
    // take the page with it.
    const read = () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      } catch (e) {
        return {};
      }
    };
    const write = (all) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(all));
      } catch (e) {
        /* Full, or refused. Nothing to do and nothing worth saying. */
      }
    };

    const forms = $$("form[action='/admin/reply']");
    if (!forms.length) return;

    const idOf = (form) => {
      const hidden = $("input[name=id]", form);
      return hidden && hidden.value ? "reply:" + hidden.value : "compose";
    };

    const fieldsOf = (form) => ({
      to: $("input[name=to]", form),
      name: $("input[name=name]", form),
      subject: $("input[name=subject]", form),
      body: $("textarea[name=body]", form),
    });

    /* What was typed, or nothing.

       The body is read off the textarea, which /js/editor.js keeps in
       step with the box it draws. A draft of an untouched form is not a
       draft: the subject is prefilled on every reply, so saving on that
       alone would fill the folder with blank messages nobody wrote. */
    function snapshot(form) {
      const f = fieldsOf(form);
      const body = f.body ? f.body.value.trim() : "";
      const to = f.to ? f.to.value.trim() : "";
      if (!body && !to) return null;
      return {
        to,
        name: f.name ? f.name.value.trim() : "",
        subject: f.subject ? f.subject.value.trim() : "",
        body,
        at: Date.now(),
        label: $("summary", form.closest("details") || document.body)
          ? $("summary", form.closest("details")).textContent.trim()
          : "Email",
      };
    }

    function save(form) {
      const key = idOf(form);
      const all = read();
      const shot = snapshot(form);
      if (shot) all[key] = shot;
      else delete all[key];
      write(all);
      paintCount();
    }

    function restore(form) {
      const saved = read()[idOf(form)];
      if (!saved) return false;
      const f = fieldsOf(form);
      // Never over anything already on the page. A reply the server
      // prefilled, or a box somebody has started typing in, outranks
      // whatever was left here.
      if (f.to && !f.to.value) f.to.value = saved.to || "";
      if (f.name && !f.name.value) f.name.value = saved.name || "";
      if (f.subject && saved.subject) f.subject.value = saved.subject;
      if (f.body && !f.body.value.trim()) {
        f.body.value = saved.body || "";
        // editor.js has already drawn its surface from the textarea, so
        // it has to be told. It is the same element either way.
        const page = $(".rt-page", form);
        if (page) page.innerHTML = saved.body || "";
      }
      return true;
    }

    function paintCount() {
      const chip = $("[data-draft-count]");
      if (!chip) return;
      const n = Object.keys(read()).length;
      chip.textContent = n ? String(n) : "";
      chip.hidden = !n;
    }

    /* ── Did the last submit actually go? ───────────────────────── */
    const done = new URLSearchParams(location.search).get("done") || "";
    if (done) {
      const failed = /^(Nothing sent|Not sent)/.test(done);
      const all = read();
      let changed = false;
      Object.keys(all).forEach((k) => {
        if (!all[k] || !all[k].pending) return;
        if (failed) delete all[k].pending; // keep it; it did not go
        else delete all[k];
        changed = true;
      });
      if (changed) write(all);
    }

    forms.forEach((form) => {
      restore(form);

      let timer = null;
      const later = () => {
        clearTimeout(timer);
        timer = setTimeout(() => save(form), 400);
      };

      // Typing anywhere in the form, including the editor's own
      // surface, which is a contenteditable and not a field.
      form.addEventListener("input", later);
      $$(".rt-page", form).forEach((page) => page.addEventListener("input", later));

      form.addEventListener("submit", () => {
        const all = read();
        const key = idOf(form);
        const shot = snapshot(form);
        if (shot) {
          all[key] = shot;
          all[key].pending = true;
          write(all);
        }
      });
    });

    paintCount();

    /* ── The folder ─────────────────────────────────────────────── */
    const panel = $("[data-drafts-list]");
    if (!panel) return;

    function drawList() {
      const all = read();
      const keys = Object.keys(all).sort((x, y) => (all[y].at || 0) - (all[x].at || 0));
      panel.textContent = "";

      if (!keys.length) {
        const empty = document.createElement("p");
        empty.className = "notice";
        empty.textContent = "Nothing half-written.";
        panel.appendChild(empty);
        return;
      }

      const stack = document.createElement("div");
      stack.className = "stack";

      keys.forEach((key) => {
        const d = all[key];
        const card = document.createElement("article");
        card.className = "card";
        card.style.cssText = "padding:1.25rem 1.4rem;gap:.7rem";

        const head = document.createElement("div");
        head.className = "row";
        head.style.cssText = "justify-content:space-between;align-items:flex-start;gap:1rem";
        const who = document.createElement("div");
        const subject = document.createElement("strong");
        subject.textContent = d.subject || "(no subject)";
        const to = document.createElement("div");
        to.className = "muted";
        to.style.fontSize = ".85rem";
        to.textContent = d.to ? "To " + (d.name ? d.name + " \u00b7 " : "") + d.to : "No address yet";
        who.appendChild(subject);
        who.appendChild(to);
        const kind = document.createElement("span");
        kind.className = "pill";
        kind.textContent = key === "compose" ? "written" : "reply";
        head.appendChild(who);
        head.appendChild(kind);

        // The words, as text. The draft is the editor's HTML and this
        // is a summary of it, not a rendering: a half-written message
        // should not be able to lay out the page it is listed on.
        const peek = document.createElement("p");
        peek.className = "muted";
        peek.style.cssText = "font-size:.85rem;margin:0";
        const words = String(d.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        peek.textContent = words.length > 180 ? words.slice(0, 180) + "\u2026" : words || "(empty)";

        const foot = document.createElement("div");
        foot.className = "row";
        foot.style.cssText = "justify-content:space-between;align-items:center;gap:1rem";
        const when = document.createElement("span");
        when.className = "muted";
        when.style.fontSize = ".8rem";
        when.textContent = d.at ? new Date(d.at).toLocaleString("en-GB", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        }) : "";

        const buttons = document.createElement("span");
        buttons.className = "row";
        buttons.style.gap = ".5rem";

        const open = document.createElement("a");
        open.className = "btn btn-sm";
        open.textContent = "Carry on writing";
        // Back to the box it came from, already open.
        open.href = key === "compose" ? "/admin?compose=1" : "/admin?reply=" + key.slice(6);

        const drop = document.createElement("button");
        drop.type = "button";
        drop.className = "btn btn-sm btn-ghost";
        drop.textContent = "Discard";
        drop.addEventListener("click", () => {
          const now = read();
          delete now[key];
          write(now);
          paintCount();
          drawList();
        });

        buttons.appendChild(open);
        buttons.appendChild(drop);
        foot.appendChild(when);
        foot.appendChild(buttons);

        card.appendChild(head);
        card.appendChild(peek);
        card.appendChild(foot);
        stack.appendChild(card);
      });

      panel.appendChild(stack);
    }

    drawList();
  })();

  /* ── Attaching documents to an admin email ───────────────────────

     The file input carries no name, so nothing of it is submitted.
     Each file is read here and written into a hidden field as a data:
     URL, which is how profile photos already travel: no multipart
     parser on the server, and nothing to install on the host.

     The limits are checked twice. Here, so somebody learns their file
     is too big before waiting for an 8MB upload to fail; and again on
     the server, which is the one that counts, because everything below
     can be bypassed by anyone willing to post by hand.              */
  (function attachments() {
    const MAX_TOTAL = 5 * 1024 * 1024;
    const MAX_FILES = 5;

    $$("[data-attach]").forEach((box) => {
      const input = $("[data-attach-input]", box);
      const list = $("[data-attach-list]", box);
      const form = box.closest("form");
      if (!input || !list || !form) return;

      // The chosen files, kept here rather than read off the input:
      // picking a second time replaces the input's list, and somebody
      // attaching two documents one after another means both.
      const chosen = [];

      const size = (n) =>
        n < 1024 ? n + " B"
          : n < 1024 * 1024 ? Math.round(n / 1024) + " KB"
            : (n / (1024 * 1024)).toFixed(1) + " MB";

      function draw() {
        list.textContent = "";
        chosen.forEach((f, i) => {
          const li = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = f.name + " \u00b7 " + size(f.size);
          const drop = document.createElement("button");
          drop.type = "button";
          drop.className = "ad-attach-drop";
          drop.textContent = "Remove";
          drop.setAttribute("aria-label", "Remove " + f.name);
          drop.addEventListener("click", () => {
            chosen.splice(i, 1);
            draw();
          });
          li.appendChild(name);
          li.appendChild(drop);
          list.appendChild(li);
        });
      }

      function say(message) {
        list.textContent = "";
        const li = document.createElement("li");
        li.className = "ad-attach-bad";
        li.textContent = message;
        list.appendChild(li);
      }

      input.addEventListener("change", () => {
        const picked = Array.prototype.slice.call(input.files || []);
        // The input is emptied so the same file can be picked again
        // after being removed, which it otherwise cannot be.
        input.value = "";
        if (!picked.length) return;

        if (chosen.length + picked.length > MAX_FILES) {
          say("That is more than " + MAX_FILES + " files.");
          return;
        }
        const total = chosen.concat(picked).reduce((n, f) => n + f.size, 0);
        if (total > MAX_TOTAL) {
          say("That is more than " + size(MAX_TOTAL) + " altogether.");
          return;
        }
        picked.forEach((f) => chosen.push(f));
        draw();
      });

      /* Read at submit rather than at pick.

         Reading is asynchronous and submitting is not, so the fields
         have to exist before the form goes. The submit is stopped, the
         files are read, and the form is sent again once they are in —
         with a flag so the second pass does not stop itself.        */
      let ready = false;
      form.addEventListener("submit", (e) => {
        if (ready || !chosen.length) return;
        e.preventDefault();

        const submit = $("button[type=submit]", form);
        if (submit) {
          submit.disabled = true;
          submit.dataset.was = submit.textContent;
          submit.textContent = "Attaching\u2026";
        }

        Promise.all(
          chosen.map(
            (f) =>
              new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ name: f.name, data: reader.result });
                reader.onerror = () => reject(new Error(f.name));
                reader.readAsDataURL(f);
              })
          )
        )
          .then((files) => {
            files.forEach((f) => {
              const field = document.createElement("input");
              field.type = "hidden";
              field.name = "attach";
              field.value = JSON.stringify(f);
              form.appendChild(field);
            });
            ready = true;
            form.submit();
          })
          .catch((err) => {
            if (submit) {
              submit.disabled = false;
              submit.textContent = submit.dataset.was || "Send";
            }
            say("Could not read " + err.message + ". Try attaching it again.");
          });
      });
    });
  })();

  /* ── Picking a contact fills in their name ───────────────────────

     The To field is a plain email input with a datalist behind it, so
     the browser does the matching and an address nobody has ever
     written to can still be typed in. What the browser will not do is
     carry the name across, and the name is what decides whether the
     email opens with a greeting.

     Only into an EMPTY name box. Somebody who typed "Dr Sharma" meant
     it, and a picker that overwrites what you typed is a picker you
     stop using.                                                      */
  (function contactPicker() {
    const pick = $("[data-contact-pick]");
    const to = $("[data-contact-to]");
    const name = $("[data-contact-name]");
    if (!pick || !to) return;

    /* Fill the fields from one person. The name IS overwritten, unlike
       every other autofill here: choosing somebody from a list is a
       deliberate act, and leaving the previous person's name beside the
       new one's address is how an email opens "Hello Anita" to Ravi. */
    function choose(email, who) {
      to.value = email;
      if (name) name.value = who || "";
    }

    /* The native <select> is the fallback, and it works: with no
       JavaScript the form is a dropdown and a text field and sends
       perfectly well. What it cannot do is be read. The browser draws
       its option list at the operating system's size, which on a
       school's list of names was a full-height wall of addresses with
       no way to scroll to a person without reading past everyone
       before them, and no way to search.

       So it is replaced by a listbox we draw ourselves: a fixed height
       with a scrollbar, and a box to type a name into. The <select>
       stays in the DOM, hidden, because it is still what the page
       falls back to if this throws. */
    const people = [];
    $$("optgroup", pick).forEach((group) => {
      $$("option", group).forEach((o) => {
        people.push({
          email: o.value,
          name: o.getAttribute("data-name") || o.textContent.trim(),
          kind: group.label,
        });
      });
    });
    if (!people.length) return;

    pick.hidden = true;

    const box = document.createElement("div");
    box.className = "cb";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "cb-open";
    open.setAttribute("aria-expanded", "false");
    open.setAttribute("aria-label", "Pick somebody to write to");
    open.textContent = "Choose from " + people.length + " people\u2026";

    const panel = document.createElement("div");
    panel.className = "cb-panel";
    panel.hidden = true;

    const search = document.createElement("input");
    search.type = "text";
    search.className = "cb-search";
    search.placeholder = "Type a name\u2026";
    search.setAttribute("aria-label", "Search people");

    const list = document.createElement("ul");
    list.className = "cb-list";
    list.setAttribute("role", "listbox");

    panel.appendChild(search);
    panel.appendChild(list);
    box.appendChild(open);
    box.appendChild(panel);
    pick.parentNode.insertBefore(box, pick);

    let rows = [];
    let at = -1;

    function draw(filter) {
      const want = filter.trim().toLowerCase();
      const hits = want
        ? people.filter(
            (p) =>
              p.name.toLowerCase().includes(want) || p.email.toLowerCase().includes(want)
          )
        : people;

      list.textContent = "";
      rows = [];
      at = -1;

      if (!hits.length) {
        const none = document.createElement("li");
        none.className = "cb-none";
        none.textContent = "Nobody by that name.";
        list.appendChild(none);
        return;
      }

      let lastKind = null;
      hits.forEach((p) => {
        // The heading is only worth drawing when the group changes, and
        // a search that lands entirely in one group needs none at all.
        if (p.kind !== lastKind) {
          lastKind = p.kind;
          const head = document.createElement("li");
          head.className = "cb-group";
          head.textContent = p.kind;
          list.appendChild(head);
        }
        const li = document.createElement("li");
        li.className = "cb-row";
        li.setAttribute("role", "option");
        li.tabIndex = -1;
        const who = document.createElement("strong");
        who.textContent = p.name;
        const addr = document.createElement("span");
        addr.textContent = p.email;
        li.appendChild(who);
        li.appendChild(addr);
        li.addEventListener("click", () => {
          choose(p.email, p.name);
          shut();
          to.focus();
        });
        list.appendChild(li);
        rows.push(li);
      });
    }

    function mark(next) {
      if (!rows.length) return;
      if (at > -1) rows[at].classList.remove("is-at");
      at = (next + rows.length) % rows.length;
      rows[at].classList.add("is-at");
      rows[at].scrollIntoView({ block: "nearest" });
    }

    function show() {
      draw("");
      search.value = "";
      panel.hidden = false;
      open.setAttribute("aria-expanded", "true");
      search.focus();
    }

    function shut() {
      panel.hidden = true;
      open.setAttribute("aria-expanded", "false");
    }

    open.addEventListener("click", () => (panel.hidden ? show() : shut()));
    search.addEventListener("input", () => draw(search.value));

    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); mark(at + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mark(at - 1); }
      else if (e.key === "Enter") { e.preventDefault(); if (at > -1) rows[at].click(); }
      else if (e.key === "Escape") { shut(); open.focus(); }
    });

    // Clicking anywhere else closes it, which is what every other
    // dropdown on every other page does.
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !box.contains(e.target)) shut();
    });
  })();

  /* ── The assistant ───────────────────────────────────────────────

     A question goes to /chat and an answer comes back. The server does
     the thinking; this only has to be honest about what is happening.

     The widget is rendered with `hidden` on it and shown from here, so
     a browser with no JavaScript never sees a button that would do
     nothing. Everything below exits quietly if the markup is absent,
     which is every page where the key is not configured.            */
  (function assistant() {
    const box = $("[data-chat]");
    if (!box) return;

    const openBtn = $("[data-chat-open]", box);
    const panel = $("[data-chat-panel]", box);
    const log = $("[data-chat-log]", box);
    const form = $("[data-chat-form]", box);
    const input = $("[data-chat-input]", box);
    const send = $("[data-chat-send]", box);
    const starters = $("[data-chat-starters]", box);
    const officeCard = $("[data-chat-office]", box);
    if (!openBtn || !panel || !log || !form || !input) return;

    box.hidden = false;

    /* "de-DE", not "de".
     *
     * The German pages carry lang="de-DE" — a proper BCP 47 tag, set
     * from LOCALE_TAG in lib/i18n.js so that screen readers and
     * browsers pick the right voice and hyphenation. An exact ===
     * comparison against "de" therefore never matched, and every German
     * visitor's question was sent to the assistant marked English: it
     * was told to reply in English, and its answers were written into
     * the English half of the cache under a German question.
     *
     * Matched on the prefix, which is what a language tag is for. */
    const lang = /^de\b/i.test(document.documentElement.getAttribute("lang") || "") ? "de" : "en";
    const say = (en, de) => (lang === "de" ? de : en);

    /* The conversation, kept here and nowhere else. It is not written to
       storage: a stranger's questions on a shared machine are not ours
       to leave lying about, and a reload starting fresh is the ordinary
       expectation of a chat bubble on a website. */
    const turns = [];
    let waiting = false;
    let conversationId = 0;
    let position = null;

    /* The welcome pause is remembered for this tab; conversations stay in memory. */
    const MET = "ln.ai.met";
    /* The handle on the opening pause, so a visitor who types straight
       over it gets her hello first and then their answer, rather than
       an introduction arriving in the middle of the reply to it. */
    let intro = null;
    const remembers = (fn, fallback) => {
      try {
        return fn();
      } catch (e) {
        return fallback;
      }
    };

    /* An answer, with its links.
     *
     * The server sends the answer twice: as words, and as a list of
     * pieces where each link has already been checked against a real
     * page on this site. The pieces are built here with createElement
     * and textContent — the same rule as before, that nothing a model
     * or a stranger wrote is ever parsed as markup. There is no
     * innerHTML in this function and no sanitiser, because nothing
     * arrives as HTML to sanitise.
     *
     * Anything unexpected in the list is skipped rather than guessed
     * at, and an answer with no pieces falls back to its words. */
    /* Her face beside what she says.
     *
     * Copied from the portrait already in the header rather than built
     * from a path: that one is written by the server, which knows the
     * asset version, and two places naming the same file is one place
     * to forget when it changes.
     *
     * Only on the FIRST of a run. Three answers in a row with three
     * copies of her face down the side is a column of thumbnails, not
     * a conversation — so the ones after the first get an invisible
     * one of the same size, which holds the bubbles in line without
     * drawing anything. */
    const headFace = $(".ai-her.is-face", panel);

    function pip(ghost) {
      const img = document.createElement("img");
      img.className = "ai-pip" + (ghost ? " is-ghost" : "");
      img.width = 30;
      img.height = 30;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.decoding = "async";
      if (headFace) {
        img.src = headFace.getAttribute("src") || "";
        const set = headFace.getAttribute("srcset");
        if (set) img.srcset = set;
      }
      return img;
    }

    /** True when the message above this one was also hers. */
    function afterHerself() {
      const last = log.lastElementChild;
      return Boolean(last && last.classList.contains("is-assistant"));
    }

    /**
     * One message.
     *
     * Hers is a row — face, then bubble — and the visitor's is the
     * bubble alone, against the other edge. Returns the ROW either
     * way, because that is what the suggestions hang off and what the
     * waiting message removes.
     */
    function bubble(role, text, parts) {
      const mine = role === "assistant";
      /* Measured before the message goes in, or the thing just added
         is what decides whether we were at the bottom. The visitor's
         own message always scrolls: they pressed send, so they are
         looking at what they sent. */
      const atEnd = following();
      const row = document.createElement("div");
      row.className = "ai-row is-" + role;
      if (mine) row.appendChild(pip(afterHerself()));

      const said = document.createElement("div");
      said.className = "ai-msg is-" + role;

      if (Array.isArray(parts) && parts.length) {
        parts.forEach((p) => {
          if (!p) return;
          if (typeof p.href === "string" && typeof p.label === "string" && p.href[0] === "/") {
            const a = document.createElement("a");
            a.href = p.href;
            a.textContent = p.label;
            said.appendChild(a);
          } else if (typeof p.bold === "string") {
            const b = document.createElement("strong");
            b.textContent = p.bold;
            said.appendChild(b);
          } else if (typeof p.text === "string") {
            said.appendChild(document.createTextNode(p.text));
          }
        });
      } else {
        said.textContent = text;
      }

      row.appendChild(said);
      /* The visitor's own message always scrolls: they pressed send,
         so what they sent is the thing they are looking for. */
      const stay = role === "user" || atEnd;
      log.appendChild(row);
      if (stay) toBottom();
      return row;
    }

    /* What to offer under the answer that just arrived.
     *
     * Built the same way the answer itself is: createElement and
     * textContent, never innerHTML. The labels come from a table on
     * the server, but they arrive over the wire like everything else
     * and are treated as text.
     *
     * Only the LAST answer carries them. Left on every message they
     * pile up into a wall of buttons, and the ones higher up are
     * suggestions about a part of the conversation that has moved on. */
    function offer(after, items) {
      /* Asked before the row goes in, and before the old one comes
         out, or removing the previous suggestions is itself enough to
         move the bottom out from under the reader. */
      const atEnd = following();
      $$(".ai-next", log).forEach((old) => old.remove());
      if (!Array.isArray(items) || !items.length) return;

      const row = document.createElement("div");
      row.className = "ai-next";

      items.forEach((it) => {
        if (!it || typeof it.label !== "string") return;

        if (it.office) {
          const btn = document.createElement("button");
          btn.className = "ai-chip is-office";
          btn.type = "button";
          btn.textContent = it.label;
          btn.addEventListener("click", showOffice);
          row.appendChild(btn);
        } else if (typeof it.href === "string" && it.href[0] === "/") {
          const link = document.createElement("a");
          link.className = "ai-chip";
          link.href = it.href;
          link.textContent = it.label;
          row.appendChild(link);
        } else if (typeof it.ask === "string") {
          const btn = document.createElement("button");
          btn.className = "ai-chip";
          btn.type = "button";
          btn.textContent = it.label;
          /* The label IS the question. It was written as the thing a
             visitor would tap, so sending it as their next message is
             exactly what tapping it should mean — and the turn before
             it carries the context that makes a two-word question
             answerable. */
          btn.addEventListener("click", () => ask(it.ask));
          row.appendChild(btn);
        }
      });

      if (!row.children.length) return;
      after.insertAdjacentElement("afterend", row);
      /* This scrolled unconditionally, which quietly undid the rule in
         bubble() one line earlier: the answer politely stayed where
         the reader was and then its own suggestions dragged them to
         the bottom anyway. */
      if (atEnd) toBottom();
    }

    /* The column that scrolls is .ai-body, which holds the log AND the
       quick actions; the log itself is a block inside it and has no
       scrollbar of its own to move. Setting log.scrollTop here did
       nothing at all, and an answer longer than the panel arrived off
       the bottom of it. */
    function toBottom() {
      const body = log.parentElement;
      if (body) body.scrollTop = body.scrollHeight;
    }

    /* Whether the reader is at the bottom, asked BEFORE anything is
       added.

       Somebody who has scrolled up to re-read an answer is reading it,
       and yanking them back down because a new message arrived is the
       chat equivalent of turning the page for them. Within this much
       of the end counts as "following along", because a line and a bit
       of slack is not the same as having deliberately gone looking. */
    const NEAR = 64;
    function following() {
      const body = log.parentElement;
      if (!body) return true;
      return body.scrollHeight - body.scrollTop - body.clientHeight < NEAR;
    }

    /* The office, answered without asking anybody.
     *
     * The details are already on the page, written by the server from
     * the same place the contact page reads them. Cloning that costs
     * no request, cannot be wrong, and cannot be refused by a provider
     * having an afternoon — which matters, because the likeliest
     * moment for somebody to press this is the moment nothing else
     * worked. */
    function showOffice() {
      $$(".ai-next", log).forEach((old) => old.remove());
      if (!officeCard || !officeCard.content) return;

      const row = document.createElement("div");
      row.className = "ai-row is-assistant";
      row.appendChild(pip(afterHerself()));

      const said = document.createElement("div");
      said.className = "ai-msg is-assistant";
      /* The ELEMENT, not the whole fragment. A template's content also
         holds the newlines and indentation the view was written with,
         and .ai-msg is pre-wrap, so cloning all of it printed the
         template's own formatting as blank lines down the bubble. */
      const card = officeCard.content.firstElementChild;
      if (!card) return;
      said.appendChild(card.cloneNode(true));

      row.appendChild(said);
      log.appendChild(row);
      toBottom();
    }

    /* Three dots, and not a word.
     *
     * It used to say "Looking…", which is the assistant describing its
     * own machinery — nobody waiting for a person watches them announce
     * that they are thinking. Dots say the same thing without claiming
     * anything, and they say it in every language.
     *
     * The word is still there for a screen reader, which cannot see
     * three dots move: role="status" announces it once, politely, and
     * the dots themselves are hidden from it. */
    function thinking() {
      const atEnd = following();
      const row = document.createElement("div");
      row.className = "ai-row is-assistant";
      row.appendChild(pip(afterHerself()));

      const bub = document.createElement("div");
      bub.className = "ai-msg is-assistant is-typing";
      bub.setAttribute("role", "status");

      const heard = document.createElement("span");
      heard.className = "ai-sr";
      heard.textContent = say("Lina is typing", "Lina schreibt");
      bub.appendChild(heard);

      const dots = document.createElement("span");
      dots.className = "ai-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) dots.appendChild(document.createElement("i"));
      bub.appendChild(dots);

      row.appendChild(bub);
      log.appendChild(row);
      if (atEnd) toBottom();
      return row;
    }

    /* Long enough not to flash.
     *
     * A cached answer comes back in about thirty milliseconds, and
     * dots that appear and vanish inside two frames read as a glitch
     * rather than as an answer arriving. This is the only wait in the
     * whole feature that is not real work — and it is a floor, never a
     * delay: an answer that took longer than this is shown the instant
     * it lands. */
    const MIN_TYPING = 420;
    const settle = (since) => {
      const left = MIN_TYPING - (Date.now() - since);
      return left > 0 ? new Promise((r) => setTimeout(r, left)) : Promise.resolve();
    };

    async function ask(question) {
      if (waiting || !question.trim()) return;
      if (intro) {
        clearTimeout(intro);
        intro = null;
        const dots = log.lastElementChild;
        if (dots && dots.querySelector(".ai-dots")) dots.remove();
        greet();
        remembers(() => sessionStorage.setItem(MET, "1"));
      }
      const thisConversation = conversationId;
      waiting = true;
      if (starters) starters.hidden = true;
      input.value = "";
      send.disabled = true;

      bubble("user", question);
      turns.push({ role: "user", content: question });
      const pending = thinking();
      const since = Date.now();

      try {
        const res = await fetch("/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: turns.slice(-10), lang }),
        });
        const data = await res.json().catch(() => ({}));
        const answer =
          (data && data.answer) ||
          say(
            "Something went wrong at our end. Please try again, or write to the office.",
            "Bei uns ist etwas schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie dem Büro."
          );
        await settle(since);
        if (thisConversation !== conversationId) return;
        pending.remove();
        const row = bubble("assistant", answer, data && data.parts);
        offer(row, data && data.suggest);
        // Only a real answer becomes part of the conversation. An error
        // message is not something the assistant said, and feeding it
        // back as context would have it apologise for itself.
        if (res.ok && data && data.answer) {
          turns.push({ role: "assistant", content: data.answer });
        }
      } catch (e) {
        await settle(since);
        if (thisConversation !== conversationId) return;
        pending.remove();
        /* No suggestions here, and the office is not offered either:
           this is the branch where the request never left the
           browser, so a link would not load any better than the
           question did. The message says to check the connection
           because that is the only thing that will help. */
        bubble(
          "assistant",
          say(
            "I could not reach the office just now — check your connection and try again.",
            "Ich konnte das Büro gerade nicht erreichen — bitte prüfen Sie Ihre Verbindung."
          )
        );
      } finally {
        if (thisConversation === conversationId) {
          waiting = false;
          send.disabled = false;
          if (!panel.hidden && box.contains(document.activeElement)) input.focus();
        }
      }
    }

    /* One short welcome line leaves room for the mobile quick actions. */
    function greet() {
      const atEnd = following();
      const row = document.createElement("div");
      row.className = "ai-row is-assistant";
      row.appendChild(pip(afterHerself()));

      const said = document.createElement("div");
      said.className = "ai-msg is-assistant is-hi";
      [say("Hi, I'm Lina. How can I help?", "Hallo, ich bin Lina. Wie kann ich helfen?")
      ].forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        said.appendChild(p);
      });

      row.appendChild(said);
      log.appendChild(row);
      if (atEnd) toBottom();
      return row;
    }

    function show() {
      panel.hidden = false;
      /* She steps out of the corner while the panel is open: her
         portrait is already at the top of it, and two of her on one
         screen is one too many. The greeting goes with her. */
      box.classList.add("is-open");
      openBtn.setAttribute("aria-expanded", "true");
      position?.sync();
      if (!log.children.length) {
        /* She writes it, the first time.
         *
         * Only the first time in a visit: a pause before hello is a
         * nice touch once and an obstacle on the fourth reopening, and
         * somebody who has already met her does not need introducing
         * again. After that the greeting is simply there. */
        if (remembers(() => sessionStorage.getItem(MET), "1")) greet();
        else {
          const dots = thinking();
          intro = setTimeout(() => {
            intro = null;
            dots.remove();
            greet();
            remembers(() => sessionStorage.setItem(MET, "1"));
          }, 650);
        }
      }
      /* Back to the top, every time it opens.
       *
       * bubble() scrolls to the bottom, which is right for an answer
       * arriving and wrong for the first thing anybody sees: the
       * quick actions sit below the greeting and are taller than it,
       * so the column scrolled down and the greeting was cut off
       * above the fold of a panel that had only just opened. */
      const body = log.parentElement;
      if (body) body.scrollTop = 0;

      /* Not on a phone. Focusing the input is what opens the on-screen
         keyboard, and arriving at a chat with half the screen already
         eaten hides the quick actions that are the reason to open it. */
      if (window.matchMedia("(min-width: 561px)").matches) input.focus();
    }

    /* Out of the way, but still there.
     *
     * Minimise and close are the same movement and different promises:
     * minimise puts the conversation down, close ends it. So close
     * forgets it — the log is emptied and the turns with it. A stranger
     * on a shared machine who closed a chat has every reason to expect
     * it gone, and reopening to find their own questions still sitting
     * there is the moment they wish they had not asked. */
    function hide(keepFocus = false) {
      // The class comes off FIRST: the button is display:none while it
      // is on, and focus() on a hidden element does nothing.
      box.classList.remove("is-open");
      panel.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
      position?.sync();
      if (!keepFocus) openBtn.focus();
    }

    function end() {
      conversationId += 1;
      waiting = false; send.disabled = false;
      input.value = "";
      if (intro) { clearTimeout(intro); intro = null; }
      hide();
      log.textContent = "";
      turns.length = 0;
      if (starters) starters.hidden = false;
    }

    position = window.LangNationChatPosition?.create({ widget: box, launcher: openBtn, panel, minimise: hide });

    openBtn.addEventListener("click", () => (panel.hidden ? show() : hide()));
    $$("[data-chat-min]", box).forEach((b) => b.addEventListener("click", () => hide()));
    $$("[data-chat-close]", box).forEach((b) => b.addEventListener("click", end));
    $$("[data-chat-ask]", box).forEach((b) =>
      b.addEventListener("click", () => ask(b.getAttribute("data-chat-ask") || ""))
    );

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      ask(input.value);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) hide();
    });
  })();

  /* ── Theme toggle ────────────────────────────────────────────────
     Three states: stored "light", stored "dark", or nothing stored (in
     which case the OS decides). The button flips to the opposite of what
     is currently on screen.                                          */
  (function theme() {
    const root = document.documentElement;
    const buttons = $$("[data-theme-toggle]");
    if (!buttons.length) return;

    const prefersDark = () =>
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    const current = () => root.getAttribute("data-theme") || (prefersDark() ? "dark" : "light");

    function paint() {
      const dark = current() === "dark";
      buttons.forEach((b) => {
        const sun = $("[data-icon-sun]", b);
        const moon = $("[data-icon-moon]", b);
        if (sun) sun.hidden = dark;
        if (moon) moon.hidden = !dark;
      });
    }

    buttons.forEach((b) =>
      b.addEventListener("click", function () {
        const next = current() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem("ln-theme", next);
        } catch (e) {
          /* private mode — the choice just won't survive a reload */
        }
        paint();
      })
    );

    paint();
  })();

  /* ── Mobile navigation drawer ────────────────────────────────── */
  (function drawer() {
    const dialog = $("[data-drawer]");
    if (!dialog) return;

    const open = () => (dialog.showModal ? dialog.showModal() : dialog.setAttribute("open", ""));
    const close = () => (dialog.close ? dialog.close() : dialog.removeAttribute("open"));

    $$("[data-drawer-open]").forEach((b) => b.addEventListener("click", open));
    $$("[data-drawer-close]").forEach((b) => b.addEventListener("click", close));

    // Click on the backdrop (i.e. outside the panel) closes it.
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) close();
    });

    // Following a link should not leave the drawer stuck open on back-nav.
    $$("a", dialog).forEach((a) => a.addEventListener("click", close));
  })();

  /* ── Dropdown menus in the header ─────────────────────────────────
     CSS already opens these on hover and on focus-within, which covers
     mice and keyboards. This adds click/tap toggling — needed on touch,
     where there is no hover — plus Escape and click-away to close.      */
  (function menus() {
    const groups = $$("[data-menu]");
    if (!groups.length) return;

    const triggers = groups
      .map((g) => $(".menu-trigger", g))
      .filter(Boolean);

    const closeAll = (except) =>
      triggers.forEach((t) => {
        if (t !== except) t.setAttribute("aria-expanded", "false");
      });

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        const open = trigger.getAttribute("aria-expanded") === "true";
        closeAll(trigger);
        trigger.setAttribute("aria-expanded", open ? "false" : "true");
      });

      trigger.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        trigger.setAttribute("aria-expanded", "true");
        const first = $("a", trigger.parentElement);
        if (first) first.focus();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      const openTrigger = triggers.find((t) => t.getAttribute("aria-expanded") === "true");
      if (!openTrigger) return;
      closeAll();
      openTrigger.focus();
    });

    document.addEventListener("click", function (e) {
      if (!groups.some((g) => g.contains(e.target))) closeAll();
    });

    // Following a link should not leave the menu stuck open on back-nav.
    groups.forEach((g) => $$("a", g).forEach((a) => a.addEventListener("click", () => closeAll())));
  })();

  /* ── Reveal on scroll ────────────────────────────────────────── */
  (function reveal() {
    const items = $$(".reveal");
    if (!items.length) return;

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    items.forEach((el) => io.observe(el));
  })();

  /* ── Course filters ──────────────────────────────────────────── */
  (function filters() {
    const bar = $("[data-course-filters]");
    if (!bar) return;

    const empty = $("[data-empty]");
    const groups = $$("[data-track-group]");
    const state = { level: "", track: "" };

    function apply() {
      let visible = 0;

      groups.forEach(function (group) {
        let shownInGroup = 0;

        $$("[data-level]", group).forEach(function (card) {
          const okLevel = !state.level || card.getAttribute("data-level") === state.level;
          const okTrack = !state.track || card.getAttribute("data-track") === state.track;
          const show = okLevel && okTrack;
          card.hidden = !show;
          if (show) shownInGroup++;
        });

        group.hidden = shownInGroup === 0;
        visible += shownInGroup;
      });

      if (empty) empty.hidden = visible > 0;
    }

    $$("[data-filter]", bar).forEach(function (btn) {
      btn.addEventListener("click", function () {
        const key = btn.getAttribute("data-filter");
        state[key] = btn.getAttribute("data-value");

        $$('[data-filter="' + key + '"]', bar).forEach(function (sibling) {
          sibling.setAttribute("aria-pressed", sibling === btn ? "true" : "false");
        });

        apply();

        // Keep the choice in the URL so a filtered view can be shared.
        const params = new URLSearchParams();
        if (state.level) params.set("level", state.level);
        if (state.track) params.set("track", state.track);
        const qs = params.toString();
        history.replaceState(null, "", qs ? "?" + qs : location.pathname);
      });
    });

    // Restore from the URL on load.
    const params = new URLSearchParams(location.search);
    ["level", "track"].forEach(function (key) {
      const value = params.get(key);
      if (!value) return;
      const btn = bar.querySelector('[data-filter="' + key + '"][data-value="' + value + '"]');
      if (btn) btn.click();
    });
  })();

  /* ── Tabs (course detail) ────────────────────────────────────── */
  (function tabs() {
    const bar = $("[data-tabs]");
    if (!bar) return;

    const buttons = $$('[role="tab"]', bar);

    function select(btn) {
      buttons.forEach(function (b) {
        const on = b === btn;
        b.setAttribute("aria-selected", on ? "true" : "false");
        const panel = document.getElementById(b.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", () => select(btn));
      btn.addEventListener("keydown", function (e) {
        const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = buttons[(i + dir + buttons.length) % buttons.length];
        next.focus();
        select(next);
      });
    });
  })();

  /* ── Enquiry form ────────────────────────────────────────────────
     Submits over fetch so the visitor keeps their place on the page.
     If JavaScript is unavailable the form still posts normally and the
     server renders the same result — this is an enhancement, not a
     requirement.                                                     */
  (function enquiry() {
    const form = $("[data-enquiry-form]") || $("[data-placement-form]");
    if (!form) return;

    const success = $("[data-form-success]");
    const failure = $("[data-form-error]");
    const submit = $("[data-submit]", form);
    const submitLabel = submit ? submit.textContent : "";

    function fieldOf(input) {
      return input.closest(".field");
    }

    function setError(input, message) {
      const field = fieldOf(input);
      if (!field) return;
      const slot = $(".err", field);
      if (message) {
        field.setAttribute("data-invalid", "");
        if (slot) {
          slot.textContent = message;
          slot.hidden = false;
        }
        input.setAttribute("aria-invalid", "true");
      } else {
        field.removeAttribute("data-invalid");
        if (slot) slot.hidden = true;
        input.removeAttribute("aria-invalid");
      }
    }

    function validate() {
      let ok = true;
      let firstBad = null;

      $$("[required]", form).forEach(function (input) {
        if (input.type === "checkbox") {
          if (!input.checked) {
            ok = false;
            firstBad = firstBad || input;
          }
          return;
        }
        const value = input.value.trim();
        if (!value) {
          setError(input, form.dataset.msgRequired || "Please fill in this field.");
          ok = false;
          firstBad = firstBad || input;
        } else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          setError(input, form.dataset.msgEmail || "Please enter a valid email address.");
          ok = false;
          firstBad = firstBad || input;
        } else {
          setError(input, null);
        }
      });

      if (firstBad) firstBad.focus();
      return ok;
    }

    $$("input, textarea, select", form).forEach(function (input) {
      input.addEventListener("input", function () {
        if (fieldOf(input) && fieldOf(input).hasAttribute("data-invalid")) setError(input, null);
      });
    });

    form.addEventListener("submit", function (e) {
      if (!window.fetch) return; // let the browser post it the old way
      e.preventDefault();

      if (failure) failure.hidden = true;
      if (!validate()) return;

      if (submit) {
        submit.disabled = true;
        submit.textContent = form.dataset.msgSending || "Sending…";
      }

      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      })
        .then(function (res) {
          return res.json().then((body) => ({ ok: res.ok, body }));
        })
        .then(function (r) {
          if (!r.ok || !r.body.ok) throw new Error(r.body && r.body.error);
          form.hidden = true;
          if (success) {
            success.hidden = false;
            success.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        })
        .catch(function () {
          if (failure) failure.hidden = false;
          if (submit) {
            submit.disabled = false;
            submit.textContent = submitLabel;
          }
        });
    });
  })();

  /* ── Grade converter (modified Bavarian formula) ─────────────────
     German grade = 1 + 3 × (Nmax − Nd) / (Nmax − Nmin)
       Nmax  best achievable mark
       Nmin  minimum passing mark
       Nd    the student's own mark
     Result is capped to the 1.0–5.0 German scale.                    */
  (function grade() {
    const form = $("[data-grade-form]");
    if (!form) return;

    const box = $("[data-grade-result]");
    const value = $("[data-grade-value]");
    const label = $("[data-grade-label]");
    const error = $("[data-grade-error]");

    const bands = form.dataset.bands
      ? JSON.parse(form.dataset.bands)
      : ["Very good", "Good", "Satisfactory", "Sufficient", "Fail"];

    function bandFor(g) {
      if (g <= 1.5) return bands[0];
      if (g <= 2.5) return bands[1];
      if (g <= 3.5) return bands[2];
      if (g <= 4.0) return bands[3];
      return bands[4];
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const max = parseFloat(form.max.value);
      const min = parseFloat(form.min.value);
      const yours = parseFloat(form.yours.value);

      const invalid =
        !isFinite(max) || !isFinite(min) || !isFinite(yours) ||
        max <= min || yours > max || yours < min;

      if (invalid) {
        if (box) box.hidden = true;
        if (error) error.hidden = false;
        return;
      }
      if (error) error.hidden = true;

      let g = 1 + 3 * ((max - yours) / (max - min));
      g = Math.min(5, Math.max(1, g));

      if (value) value.textContent = g.toFixed(1);
      if (label) label.textContent = bandFor(g);
      if (box) box.hidden = false;
    });
  })();

  /* ── ECTS calculator ─────────────────────────────────────────── */
  (function ects() {
    const form = $("[data-ects-form]");
    if (!form) return;

    const box = $("[data-ects-result]");
    const value = $("[data-ects-value]");
    const totalOut = $("[data-ects-total]");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const n = (el) => {
        const v = parseFloat(el.value);
        return isFinite(v) && v > 0 ? v : 0;
      };
      const total = n(form.contact) + n(form.self) + n(form.exam);
      const per = parseFloat(form.per.value) || 30;

      if (value) value.textContent = total ? (total / per).toFixed(1) : "0";
      if (totalOut) totalOut.textContent = String(total);
      if (box) box.hidden = false;
    });
  })();

  /* ── Placement test progress ─────────────────────────────────────
     Twenty-one questions is long enough that it is worth showing how far
     through you are, and marking the ones already done so the eye lands
     on what is left. The form posts normally, so none of this is
     required for the test to work.                                     */
  (function quiz() {
    const form = $("[data-quiz-form]");
    if (!form) return;

    const items = $$("[data-quiz-item]", form);
    const countOut = $("[data-quiz-count]", form);
    const fill = $("[data-quiz-fill]", form);
    if (!items.length) return;

    const template = countOut ? countOut.textContent : "";

    function update() {
      let done = 0;
      items.forEach(function (item) {
        const answered = Boolean($("input:checked", item));
        if (answered) {
          item.setAttribute("data-answered", "");
          done++;
        } else {
          item.removeAttribute("data-answered");
        }
      });

      if (fill) fill.style.width = Math.round((done / items.length) * 100) + "%";
      // Swap the leading number in the existing localised string, so the
      // wording stays whatever the server rendered.
      if (countOut && template) {
        countOut.textContent = template.replace(/\d+/, String(done));
      }
    }

    form.addEventListener("change", function (e) {
      if (e.target && e.target.type === "radio") update();
    });
    update();
  })();

  /* ── IELTS overall band ──────────────────────────────────────────
     The overall band is the mean of the four skills rounded to the nearest
     half band — with the quirk that .25 rounds UP to the next half and .75
     rounds UP to the next whole. So 6.125 → 6.0, 6.25 → 6.5, 6.75 → 7.0.  */
  (function ielts() {
    const form = $("[data-ielts-form]");
    if (!form) return;

    const box = $("[data-ielts-result]");
    const value = $("[data-ielts-value]");
    const avgOut = $("[data-ielts-avg]");
    const error = $("[data-ielts-error]");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const scores = ["listening", "reading", "writing", "speaking"].map((k) => parseFloat(form[k].value));
      const bad = scores.some((s) => !isFinite(s) || s < 0 || s > 9);

      if (bad) {
        if (box) box.hidden = true;
        if (error) error.hidden = false;
        return;
      }
      if (error) error.hidden = true;

      const mean = scores.reduce((a, b) => a + b, 0) / 4;
      // Round to the nearest 0.5, with exact .25 and .75 going upwards.
      const overall = Math.round(mean * 2) / 2;

      if (value) value.textContent = overall.toFixed(1);
      if (avgOut) avgOut.textContent = mean.toFixed(2);
      if (box) box.hidden = false;
    });
  })();

  /* ── TOEFL ⇄ IELTS ───────────────────────────────────────────────
     ETS publishes comparison bands rather than a formula, so this is a
     lookup table: each row is [minimum TOEFL total, IELTS band].         */
  (function toefl() {
    const form = $("[data-toefl-form]");
    if (!form) return;

    const TABLE = [
      [118, 9.0], [115, 8.5], [110, 8.0], [102, 7.5], [94, 7.0],
      [79, 6.5], [60, 6.0], [46, 5.5], [35, 5.0], [32, 4.5], [0, 4.0],
    ];

    const box = $("[data-toefl-result]");
    const value = $("[data-toefl-value]");
    const label = $("[data-toefl-label]");
    let direction = "toefl";

    // Remember which button was pressed; both submit the same form.
    $$("[data-direction]", form).forEach((b) =>
      b.addEventListener("click", () => { direction = b.getAttribute("data-direction"); })
    );

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (direction === "toefl") {
        const total = parseFloat(form.toefl.value);
        if (!isFinite(total) || total < 0 || total > 120) return;
        const row = TABLE.find((r) => total >= r[0]);
        if (value) value.textContent = row[1].toFixed(1);
        if (label) label.textContent = "IELTS · TOEFL " + total;
      } else {
        const band = parseFloat(form.ielts.value);
        if (!isFinite(band) || band < 0 || band > 9) return;
        // Lowest TOEFL total that still maps to this band or better.
        const match = TABLE.filter((r) => r[1] <= band).sort((a, b) => b[1] - a[1])[0] || TABLE[TABLE.length - 1];
        if (value) value.textContent = String(match[0]) + "+";
        if (label) label.textContent = "TOEFL iBT · IELTS " + band.toFixed(1);
      }
      if (box) box.hidden = false;
    });
  })();


  /* ── Enhanced select ─────────────────────────────────────────────
     A nicer-looking dropdown, with search, for any <select> marked
     data-enhance.

     The native control is kept and hidden rather than replaced. It is
     still what the form submits, still what validation sees, and still
     what a browser gets if this script never runs — so the worst case
     is a plain dropdown rather than a broken form.

     Search is not decoration here: the country lists hold 239 entries,
     and a styled list that long without a filter would be worse than
     the native one, not better.

     Keyboard behaviour follows the ARIA combobox pattern closely
     enough to be usable: arrows move, Enter picks, Escape closes and
     returns focus, typing filters. */
  (function enhancedSelects() {
    var all = $$("select[data-enhance]");
    if (!all.length) return;

    all.forEach(function (native) {
      var wrap = document.createElement("div");
      wrap.className = "lns";
      native.parentNode.insertBefore(wrap, native);
      wrap.appendChild(native);
      native.classList.add("lns-native");
      /* Out of the tab order: the trigger below stands in for it. */
      native.tabIndex = -1;
      native.setAttribute("aria-hidden", "true");

      var id = "lns-" + Math.random().toString(36).slice(2, 8);

      var trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "lns-trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.id = id + "-t";
      if (native.getAttribute("aria-label")) {
        trigger.setAttribute("aria-label", native.getAttribute("aria-label"));
      } else {
        var lbl = native.id && document.querySelector('label[for="' + native.id + '"]');
        if (lbl) trigger.setAttribute("aria-labelledby", (lbl.id = lbl.id || id + "-l"));
      }

      var label = document.createElement("span");
      label.className = "lns-label";
      trigger.appendChild(label);

      var caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      caret.setAttribute("class", "lns-caret");
      caret.setAttribute("viewBox", "0 0 24 24");
      caret.setAttribute("fill", "none");
      caret.setAttribute("stroke", "currentColor");
      caret.setAttribute("stroke-width", "2");
      caret.setAttribute("aria-hidden", "true");
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "m6 9 6 6 6-6");
      caret.appendChild(path);
      trigger.appendChild(caret);

      var panel = document.createElement("div");
      panel.className = "lns-panel";
      panel.hidden = true;

      /* Only worth a search box when the list is long enough to hunt
         through. Below that it is one more thing in the way. */
      var searchable = native.options.length > 12;
      var search = null;
      if (searchable) {
        search = document.createElement("input");
        search.type = "text";
        search.className = "lns-search";
        search.setAttribute("placeholder", native.dataset.searchLabel || "Type to filter…");
        search.setAttribute("aria-label", native.dataset.searchLabel || "Filter the list");
        panel.appendChild(search);
      }

      var list = document.createElement("ul");
      list.className = "lns-list";
      list.setAttribute("role", "listbox");
      list.id = id + "-l";
      panel.appendChild(list);
      wrap.appendChild(panel);

      var items = [];

      function paintLabel() {
        var o = native.options[native.selectedIndex];
        var text = o ? o.text.trim() : "";
        /* Inside the open list a row can be just "B2", because the
           heading above it has already said Regular German. Closed,
           that heading is gone and "B2" alone does not say which
           course — so the group comes back for the collapsed label. */
        if (o && o.parentNode && o.parentNode.tagName === "OPTGROUP") {
          text = o.parentNode.label + " · " + text;
        }
        label.textContent = text;
        /* An empty value is the "choose one" entry, which should read
           as a placeholder rather than as an answer. */
        if (o && o.value === "") label.setAttribute("data-placeholder", "");
        else label.removeAttribute("data-placeholder");
      }

      function build(filter) {
        list.textContent = "";
        items = [];
        var needle = (filter || "").trim().toLowerCase();
        var lastGroup = null;
        for (var i = 0; i < native.options.length; i++) {
          var o = native.options[i];
          var text = o.text.trim();
          /* Matched against the name in the other language too, where
             the option carries one. The German pages list Deutschland,
             and somebody typing "Germany" there should still find it —
             plenty of people search in whichever language comes to
             mind first. */
          var alt = o.dataset.alt || "";
          if (
            needle &&
            text.toLowerCase().indexOf(needle) === -1 &&
            alt.toLowerCase().indexOf(needle) === -1
          ) {
            continue;
          }
          /* Group headings, where the native control has optgroups.
             Emitted lazily, immediately before the first option of a
             group that survived the filter, so filtering never leaves
             a heading standing over nothing. They are not pushed into
             `items`, so arrow keys move straight past them and the
             keyboard behaviour is unchanged. */
          var parent = o.parentNode;
          var group = parent && parent.tagName === "OPTGROUP" ? parent.label : null;
          if (group !== lastGroup) {
            lastGroup = group;
            if (group) {
              var head = document.createElement("li");
              head.className = "lns-group";
              head.setAttribute("role", "presentation");
              head.textContent = group;
              list.appendChild(head);
            }
          }

          var li = document.createElement("li");
          li.className = "lns-opt";
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", i === native.selectedIndex ? "true" : "false");
          li.dataset.index = String(i);
          li.textContent = text;
          if (group) li.setAttribute("data-grouped", "");
          list.appendChild(li);
          items.push(li);
        }
        if (!items.length) {
          var none = document.createElement("li");
          none.className = "lns-empty";
          none.textContent = "Nothing matches.";
          list.appendChild(none);
        }
      }

      function active() {
        return list.querySelector("[data-active]");
      }

      function setActive(li) {
        var prev = active();
        if (prev) prev.removeAttribute("data-active");
        if (!li) return;
        li.setAttribute("data-active", "");
        list.setAttribute("aria-activedescendant", (li.id = li.id || id + "-o" + li.dataset.index));
        /* Keep the highlighted row in view when arrowing past the edge. */
        var top = li.offsetTop;
        var bottom = top + li.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) {
          list.scrollTop = bottom - list.clientHeight;
        }
      }

      function open() {
        build("");
        if (search) search.value = "";
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        var sel = list.querySelector('[aria-selected="true"]') || items[0];
        setActive(sel);
        if (sel) list.scrollTop = Math.max(0, sel.offsetTop - 60);
        if (search) search.focus();
      }

      function close(focusTrigger) {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        if (focusTrigger) trigger.focus();
      }

      function choose(li) {
        if (!li) return;
        native.selectedIndex = Number(li.dataset.index);
        /* Dispatched so anything listening to the real control — other
           scripts, or the form itself — sees a normal change event. */
        native.dispatchEvent(new Event("change", { bubbles: true }));
        paintLabel();
        close(true);
      }

      trigger.addEventListener("click", function () {
        if (panel.hidden) open();
        else close(true);
      });

      trigger.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      list.addEventListener("click", function (e) {
        var li = e.target.closest(".lns-opt");
        if (li) choose(li);
      });

      list.addEventListener("mousemove", function (e) {
        var li = e.target.closest(".lns-opt");
        if (li) setActive(li);
      });

      function move(step) {
        if (!items.length) return;
        var cur = items.indexOf(active());
        var next = cur + step;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        setActive(items[next]);
      }

      function onKey(e) {
        if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "Home") { e.preventDefault(); setActive(items[0]); }
        else if (e.key === "End") { e.preventDefault(); setActive(items[items.length - 1]); }
        else if (e.key === "Enter") { e.preventDefault(); choose(active()); }
        else if (e.key === "Escape") { e.preventDefault(); close(true); }
        else if (e.key === "Tab") { close(false); }
      }

      panel.addEventListener("keydown", onKey);

      if (search) {
        search.addEventListener("input", function () {
          build(search.value);
          setActive(items[0]);
        });
      } else {
        /* No search box, so the list itself has to take the keys. */
        list.tabIndex = -1;
      }

      document.addEventListener("click", function (e) {
        if (!panel.hidden && !wrap.contains(e.target)) close(false);
      });

      /* A change made anywhere else — a reset, or another script — must
         still be reflected on the face of the control. */
      native.addEventListener("change", paintLabel);

      trigger.setAttribute("aria-controls", list.id);
      native.parentNode.insertBefore(trigger, panel);
      paintLabel();
    });
  })();

  /* ── Type-to-confirm deletion ────────────────────────────────────
     Every destructive action on the site, behind the same gate.

     window.confirm() was what guarded these, and a confirm dialog is
     dismissed by muscle memory — the button that means "delete
     everything" and the one that means "yes I saved the file" look
     identical and sit in the same place. Typing the word cannot be
     done by reflex.

     Marked up as `data-confirm-delete="what is being deleted"` on the
     form. Without JavaScript the form still submits directly, which
     is the right failure: the button is plainly labelled, and a
     delete that silently does nothing is worse than one that works.

     The submitter is remembered because these forms often carry
     several buttons — Completed, Withdraw, Remove — and re-submitting
     without it would send the wrong one. */
  /* A lighter one, on a button rather than a form.

     Not everything that takes something away is a deletion. Locking a
     chapter is undone by unlocking it and nothing is lost either way,
     so it gets a question rather than a word to type — the typing
     above is priced for actions that cannot be undone, and spending it
     on one that can is how people learn to type it without reading. */
  (function confirmSimply() {
    $$("[data-confirm-simple]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        if (!window.confirm(btn.getAttribute("data-confirm-simple"))) e.preventDefault();
      });
    });
  })();

  (function confirmDelete() {
    var forms = $$("form[data-confirm-delete]");
    if (!forms.length || typeof HTMLDialogElement === "undefined") return;

    var WORD = "delete";

    forms.forEach(function (form) {
      var armed = false;
      var pending = null;

      /* Only the buttons that actually destroy something. A form with
         a Remove button alongside status buttons must not gate all of
         them. */
      form.addEventListener("click", function (e) {
        var btn = e.target.closest("button, input[type=submit]");
        if (btn && form.contains(btn)) pending = btn;
      });

      form.addEventListener("submit", function (e) {
        if (armed) return;
        if (pending && pending.hasAttribute("data-confirm-skip")) return;
        e.preventDefault();

        var what = form.getAttribute("data-confirm-delete") || "this";

        var dialog = document.createElement("dialog");
        dialog.className = "ln-dialog ln-confirm";
        dialog.innerHTML =
          '<h2>Delete ' + escapeHtml(what) + "?</h2>" +
          '<p class="ln-confirm-lead">This cannot be undone. Type ' +
          "<strong>" + WORD + "</strong> below to confirm.</p>" +
          '<input class="ln-confirm-input" type="text" autocomplete="off" ' +
          'autocapitalize="off" spellcheck="false" aria-label="Type ' + WORD + ' to confirm">' +
          '<p class="ln-confirm-actions">' +
          '<button type="button" class="btn btn-ghost" data-cancel>Cancel</button> ' +
          '<button type="button" class="btn ln-confirm-go" data-go disabled>Delete</button>' +
          "</p>";

        document.body.appendChild(dialog);
        var input = dialog.querySelector(".ln-confirm-input");
        var go = dialog.querySelector("[data-go]");

        input.addEventListener("input", function () {
          go.disabled = input.value.trim().toLowerCase() !== WORD;
        });

        input.addEventListener("keydown", function (e2) {
          if (e2.key === "Enter") {
            e2.preventDefault();
            if (!go.disabled) go.click();
          }
        });

        dialog.querySelector("[data-cancel]").addEventListener("click", function () {
          dialog.close();
        });

        go.addEventListener("click", function () {
          armed = true;
          dialog.close();
          /* Re-submitted through the button that was pressed, so a
             form with several actions sends the right one. */
          if (pending && typeof form.requestSubmit === "function") form.requestSubmit(pending);
          else form.submit();
        });

        dialog.addEventListener("close", function () {
          dialog.remove();
        });

        dialog.showModal();
        input.focus();
      });
    });

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
  })();

  /* ── Searching and ordering the student picker ───────────────────
     Filter and reorder the list of students who could join a batch.

     Both work on the list already on the page rather than reloading
     with a query parameter: the whole eligible set is here, and a
     round trip to reorder or narrow rows sitting in memory is a
     needless wait.

     The options are held in an array and the <select> rebuilt from
     it, because a filtered-out <option> cannot simply be hidden —
     `hidden` on an option is honoured unevenly across browsers, and
     the enhanced select reads native.options directly, so anything
     still in the DOM would still be listed.

     The enhanced select rebuilds from native.options every time it
     opens, so it picks up both without being told; a browser with the
     enhancement off sees the same plain control behave the same way. */
  (function studentPicker() {
    var picker = $("[data-student-picker]");
    var tools = $("[data-student-tools]");
    if (!picker || !tools) return;

    var search = $("[data-student-search]", tools);
    var sort = $("[data-student-sort]", tools);
    var count = $("[data-student-count]", tools);

    /* The placeholder is not a student. It stays at the top whatever
       the order, and survives every filter. */
    var placeholder = picker.querySelector('option[value=""]');
    var all = Array.prototype.slice
      .call(picker.options)
      .filter(function (o) { return o !== placeholder; });

    if (!all.length) return; /* nothing to search or order */
    tools.hidden = false;

    function matches(option, needle) {
      if (!needle) return true;
      /* The whole visible row — name, reference and address — so
         "LNS0005", "bo@" and "chen" all find the same person. */
      return option.textContent.toLowerCase().indexOf(needle) !== -1;
    }

    function apply() {
      var needle = search ? search.value.trim().toLowerCase() : "";
      var mode = sort ? sort.value : "new";

      var shown = all.filter(function (o) { return matches(o, needle); });

      shown.sort(function (a, b) {
        var an = a.getAttribute("data-name") || "";
        var bn = b.getAttribute("data-name") || "";
        var ac = Number(a.getAttribute("data-created")) || 0;
        var bc = Number(b.getAttribute("data-created")) || 0;

        if (mode === "az") return an.localeCompare(bn);
        if (mode === "za") return bn.localeCompare(an);
        if (mode === "old") return ac - bc;
        return bc - ac; /* newest first */
      });

      /* Rebuild: detach everything but the placeholder, then append
         the survivors in order. */
      all.forEach(function (o) {
        if (o.parentNode) o.parentNode.removeChild(o);
      });
      shown.forEach(function (o) { picker.appendChild(o); });

      if (count) {
        count.textContent = needle
          ? shown.length + " of " + all.length + " shown"
          : all.length + (all.length === 1 ? " student" : " students");
      }

      /* A filter can remove whoever was chosen. Telling the enhanced
         select so repaints its label instead of leaving a name on a
         control that no longer holds it. */
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (search) search.addEventListener("input", apply);
    if (sort) sort.addEventListener("change", apply);
    apply();
  })();

  /* ── Tick all ────────────────────────────────────────────────────
     A "Select all" box over a list of them.

     Three-state, which is the part worth having: ticking some of a
     list leaves the master box indeterminate rather than showing a
     tick nobody asked for, so "all of them" and "some of them" do not
     look the same at a glance.                                       */
  (function tickAll() {
    $$("[data-tick-all]").forEach(function (master) {
      var group = master.getAttribute("data-tick-all");
      var boxes = $$('[data-tick="' + group + '"]');
      if (!boxes.length) return;

      /* Only what is on screen.

         "Select all" used to mean every box in the group, hidden ones
         included — so filtering to A1, pressing it, and giving out got
         all forty-one chapters from A1 to B1. Select all means select
         all of what you are looking at; anything a filter is hiding is
         left exactly as it was, and the running total below says so if
         any of it is ticked. */
      function shown() {
        return boxes.filter(function (b) {
          // A list row or a table row, whichever this list is made of.
          var row = b.closest("li, tr");
          return !(row && row.hidden);
        });
      }

      function refresh() {
        var here = shown();
        var on = here.filter(function (x) { return x.checked; }).length;
        master.checked = here.length > 0 && on === here.length;
        master.indeterminate = on > 0 && on < here.length;
      }

      master.addEventListener("change", function () {
        var want = master.checked;
        shown().forEach(function (b) { b.checked = want; });
        /* Whatever this form does with a tick — a running total, a
           filter — has to hear about a dozen of them changing at once.
           Its own event name, and not `input`:

           a checkbox fires a NATIVE input before it fires change. A
           listener on that input ran while the click was still in
           flight, called back into refresh() below, found none of the
           boxes ticked yet and set master.checked back to false — so
           the handler you are reading read `false` and Select all
           ticked nothing. A name nothing else dispatches cannot be
           mistaken for the browser's own event. */
        master.dispatchEvent(new CustomEvent("ln:ticks", { bubbles: true }));
      });

      boxes.forEach(function (b) { b.addEventListener("change", refresh); });

      // The visible set changes when a filter does, so the master has
      // to be recomputed against the new one.
      master.__refresh = refresh;
      refresh();
    });
  })();

  /* ── Giving out homework ─────────────────────────────────────────
     Narrow the two lists, without losing a single tick.

     The dropdowns used to be a GET form: choosing a level reloaded the
     page with the chapters narrowed, and every person already ticked
     came back unticked because the page was new. Tick a student, pick
     A1, student gone.

     So nothing reloads. Every row is on the page and these only hide
     them — and the running total counts what is ticked whether it is
     on screen or not, because a tick somewhere you cannot see it is
     the thing this must not have.                                    */
  (function give() {
    var form = $("[data-give]");
    if (!form) return;

    var scope = $("[data-filter-scope]", form);
    var level = $("[data-filter-level]", form);
    var book = $("[data-filter-book]", form);
    var sum = $("[data-give-sum]", form);

    function rows(group) {
      var list = $("[data-list=" + group + "]", form);
      return list ? $$("li", list) : [];
    }

    /* ── Everything here is per BATCH ───────────────────────────────

       A batch code is unique and a course title is not: LNIKB01 and
       LNIKB02 are both "Fast Track". Counting on the title merged
       them, so a chapter given to one class read "already given" for
       the other, and the office was told a class had homework it had
       never been given.

       The chosen batch is the one on the Course dropdown. Its two
       "no course" answers both mean the homework that has no batch on
       it, which is a real answer and not "all of them" — it is where
       a give with no batch lands, so it is where its counts live. */
    function batch() {
      /* No course dropdown means the page is about one class and says
         which in the markup — the teacher's version of this screen.
         Falling through to "0" there looked at the access map under
         the key for homework with no course, found nothing, and showed
         an empty panel to a teacher whose class had plenty. */
      if (!scope) return form.getAttribute("data-batch") || "0";
      var v = scope.value;
      if (v === "all") return "*";          // every course at once
      return !v || v === "everyone" ? "0" : v;
    }

    /* Every batch a row carries, for the "every course" answer. */
    function allOf(el, attr) {
      var out = [];
      (el.getAttribute(attr) || "").split("|").filter(Boolean).forEach(function (part) {
        var at = part.indexOf(":");
        if (at > -1) out = out.concat(part.slice(at + 1).split(",").filter(Boolean));
      });
      return out;
    }

    /* "12:0,1,2|0:7" — read one batch's list out of it. Not JSON: this
       is one split in the browser, and a JSON blob in an attribute is
       a quoting accident waiting to happen. */
    function packed(el, attr, want) {
      var raw = el.getAttribute(attr) || "";
      if (!raw) return [];
      var parts = raw.split("|");
      for (var i = 0; i < parts.length; i++) {
        var at = parts[i].indexOf(":");
        if (at > -1 && parts[i].slice(0, at) === want) {
          return parts[i].slice(at + 1).split(",").filter(Boolean);
        }
      }
      return [];
    }

    /* How many chapters this person holds on the chosen batch. */
    function holds(li) {
      // "*" is every course, so the chapters are the union rather than
      // one batch's list. De-duplicated: a chapter given to two of a
      // student's classes is still one chapter they can open.
      if (batch() === "*") {
        var seen = {};
        return allOf(li, "data-has").filter(function (ix) {
          if (seen[ix]) return false;
          seen[ix] = 1;
          return true;
        });
      }
      return packed(li, "data-has", batch());
    }

    /* Narrow the list — but never hide something that is ticked.
     *
     * "Nothing you have ticked is lost" used to mean a tick could sit
     * behind a filter, and that is how forty-one chapters were given
     * out by somebody who had narrowed the list to eleven: tick
     * everything, then filter to A1, and the thirty that no longer
     * match are still ticked and still submitted. The running total
     * said so and nobody reads a running total.
     *
     * So a ticked row stays on screen whatever the filter says,
     * marked as kept from another one. Nothing lost, and nothing
     * ticked where you cannot see it — which are the same promise,
     * and only the second one is checkable by looking.
     */
    function show(group, keep) {
      var seen = 0;   // matches the filter
      var kept = 0;   // does not, but is ticked, so it stays visible

      rows(group).forEach(function (li) {
        var match = keep(li);
        var box = li.querySelector("[data-tick]");
        var ticked = !!(box && box.checked);

        li.hidden = !match && !ticked;
        li.classList.toggle("is-kept", !match && ticked);

        if (match) seen++;
        else if (ticked) kept++;
      });

      var count = $("[data-count-" + group + "]", form);
      if (count) {
        count.textContent = seen + " shown" +
          (kept ? " · " + kept + " ticked from another filter" : "");
      }

      // The list is not empty, it is filtered to nothing — which is a
      // different sentence and the one worth printing. Not printed
      // when kept rows are still on screen, because then there is a
      // list to look at.
      var empty = $("[data-empty=" + group + "]", form);
      if (empty) empty.hidden = (seen + kept) > 0;
      var all = $("[data-tick-all=" + group + "]", form);
      if (all) {
        all.closest("label").hidden = seen === 0;
        // Its state is about what is on screen, and what is on screen
        // just changed.
        if (all.__refresh) all.__refresh();
      }

      tally();
    }

    function byScope() {
      var want = scope ? scope.value : "";
      show("who", function (li) {
        /* Everyone with an account, enrolled or not — and the same
           for "every course", which asks about a person's whole
           access and so cannot start by hiding people. Without this
           it fell through to the batch match below, found nobody with
           a batch called "all", and showed an empty panel. */
        if (want === "everyone" || want === "all") return true;
        // Nothing chosen: everybody who is actually studying. This is
        // the empty value now, because the same dropdown is submitted
        // as the course and "no course" has to post as nothing.
        if (!want) return li.getAttribute("data-enrolled") === "1";
        return (li.getAttribute("data-batches") || "").indexOf("," + want + ",") !== -1;
      });
      note();
      pills();
    }

    /* "N already" means N on the batch being given to, not N anywhere.
       Merged across batches it said 41 for somebody who had 41 on one
       class and none on the one in front of you. */
    function pills() {
      var want = batch();

      rows("who").forEach(function (li) {
        var pill = $("[data-already]", li);
        if (!pill) return;
        var n = holds(li).length;
        pill.hidden = n === 0;
        pill.textContent = n + " already";
      });

      rows("what").forEach(function (li) {
        var pill = $("[data-out]", li);
        if (!pill) return;
        // Only when nobody is ticked; once people are, `already()`
        // says how many of THEM have it, which is the better number.
        if ($$('[data-tick="who"]', form).some(function (b) { return b.checked; })) return;
        var n = want === "*"
          ? allOf(li, "data-outs").reduce(function (t, x) { return t + Number(x || 0); }, 0)
          : Number((packed(li, "data-outs", want)[0] || 0));
        pill.hidden = !n;
        pill.textContent = n + (n === 1 ? " person" : " people");
      });
    }

    /* What the one dropdown is doing, in the words of the mode it is
       in. It narrows either way; it is only saved when giving out. */
    function note() {
      var el = $("[data-scope-note]", form);
      if (!el) return;
      /* Nothing to say when there is no course dropdown to say it
         about. The teacher's version of this screen has one class and
         names it in the markup; without this guard the sentence
         written for the office — "no course will be saved on this
         homework" — overwrote it, and told a teacher the opposite of
         what was about to happen. */
      if (!scope) return;
      // Saved only when giving out. Taking back and reading are both
      // just narrowing, and saying "will be saved" in either of them
      // would be describing something that is not going to happen.
      var narrowOnly = form.getAttribute("data-mode") !== "give";
      var named = scope && scope.value && scope.value !== "everyone";

      var reading = form.getAttribute("data-mode") === "access";

      el.textContent = reading
        ? "Course narrows who is listed below. Only people who have something are shown."
        : narrowOnly
        ? "Course and Level only narrow the two lists. Nothing ticked is ever hidden — " +
          "a row you ticked under a different one stays on screen, marked."
        : (named
            ? "This class's people are listed below, and its name is saved on the " +
              "homework, so students see which course it belongs to."
            : "No course will be saved on this homework, which is right when the " +
              "people are picked from more than one class.") +
          " Level only narrows the chapters. Nothing ticked is ever hidden.";
    }

    function byLevel() {
      var want = level ? level.value : "";
      /* Both cuts, ANDed, in the one show() call.
         Two independent show("what", ...) calls would each decide the
         whole list and the second would simply undo the first -- so
         choosing a book and then a level would show every chapter at
         that level, from every book. */
      var wantBook = book ? book.value : "";
      var lock = form.getAttribute("data-mode") === "lock";

      /* Taking homework back, the only chapters worth listing are the
         ones the ticked people actually have. Ticking a chapter nobody
         has does nothing, and a list of forty-one when three are in
         play is a list to read rather than a list to use. */
      var held = null;
      if (lock) {
        held = {};
        $$('[data-tick="who"]', form).forEach(function (b) {
          if (!b.checked) return;
          holds(b.closest("li")).forEach(function (ix) { held[ix] = true; });
        });
      }

      show("what", function (li) {
        if (wantBook && li.getAttribute("data-book") !== wantBook) return false;
        if (want && li.getAttribute("data-level") !== want) return false;
        // Nobody ticked yet: show everything, or the list is empty for
        // a reason nobody can see.
        if (held && Object.keys(held).length) {
          return !!held[li.getAttribute("data-ix")];
        }
        return true;
      });
    }

    /* Unlock or Lock, chosen at the top instead of at the bottom.
       Both buttons used to sit under two long lists, which is the same
       mistake the course field made: the decision is taken first and
       was offered last. */
    (function modes() {
      var box = $("[data-give-mode]", form);
      if (!box) return;
      box.hidden = false;

      var note = $("[data-mode-note]", box);
      var NOTES = {
        give: "Ticked chapters go to ticked people, and they see them straight away.",
        lock: "Ticked chapters come back off ticked people. Work they have already " +
              "done is kept, and only the chapters they actually have are listed.",
        access: "What each person can open right now. Take one back from here and " +
                "it goes back off that person only.",
      };

      function wear(mode) {
        form.setAttribute("data-mode", mode);
        $$("[data-mode-set]", box).forEach(function (b) {
          var on = b.getAttribute("data-mode-set") === mode;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("is-on", on);
        });
        /* "Every course" answers a question Unlock cannot be asked:
           homework belongs to one course or to none. Hidden while
           giving out, and stood down if it was the chosen answer. */
        $$("[data-not-give]", form).forEach(function (el) { el.hidden = mode === "give"; });
        if (mode === "give" && scope && scope.value === "all") scope.value = "";

        $$("[data-give-only]", form).forEach(function (el) { el.hidden = mode !== "give"; });
        $$("[data-lock-only]", form).forEach(function (el) { el.hidden = mode !== "lock"; });
        // The two tick lists are for picking; the access panel is for
        // reading. Only one of them is ever the thing being looked at.
        $$("[data-pick-only]", form).forEach(function (el) { el.hidden = mode === "access"; });
        $$("[data-access]", form).forEach(function (el) { el.hidden = mode !== "access"; });

        if (note) note.textContent = NOTES[mode] || "";
        // redraw() rebuilds the access panel itself, and data-mode is
        // already set above, so it knows whether to.
        redraw();
      }

      /* data-mode-set, not data-mode: the form itself carries
         data-mode as its current state, so `[data-mode="give"]` would
         match the form as well as the button that sets it — and the
         form comes first in document order. */
      $$("[data-mode-set]", box).forEach(function (b) {
        b.addEventListener("click", function () { wear(b.getAttribute("data-mode-set")); });
      });
      wear("give");
    })();

    /* ── Who has what ──────────────────────────────────────────────

       Built from the page, not from the server: each person's row
       carries the indices of the chapters they hold, each chapter's
       row carries its index. So this is a second view of facts already
       here rather than a second source of them, and the two cannot
       disagree.

       Only the people currently on show, so the Course dropdown
       narrows this the same way it narrows everything else.

       Taking one back submits THIS form with exactly one person and
       one chapter ticked, through the same Lock the button below uses.
       One way of doing it, and one place it can be wrong. */
    function access() {
      var body = $("[data-access-body]", form);
      if (!body) return;

      var titles = {};
      rows("what").forEach(function (li) {
        var box = li.querySelector("[data-tick]");
        titles[li.getAttribute("data-ix")] = {
          title: (li.querySelector(".ad-tick-name") || {}).textContent || "",
          box: box,
        };
      });

      body.textContent = "";
      var people = 0;
      var held = 0;

      rows("who").forEach(function (li) {
        // byScope() hides people the chosen course excludes.
        if (li.hidden) return;
        var mine = holds(li);
        if (!mine.length) return;

        people++;
        held += mine.length;

        var box = li.querySelector("[data-tick]");
        var who = box ? box.value : "";
        var name = (li.querySelector(".ad-tick-name") || {}).textContent || who;

        var d = document.createElement("details");
        d.className = "ad-access-one";

        var sum = document.createElement("summary");
        sum.innerHTML = '<span class="ad-access-who"></span>' +
                        '<span class="pill pill-has"></span>';
        // textContent, not innerHTML: a student's own name is not
        // markup and must never be treated as any.
        sum.querySelector(".ad-access-who").textContent = name.replace(/\s+/g, " ").trim();
        sum.querySelector(".pill").textContent =
          mine.length + (mine.length === 1 ? " chapter" : " chapters");
        d.appendChild(sum);

        var ul = document.createElement("ul");
        ul.className = "ad-access-list";
        mine.forEach(function (ix) {
          var c = titles[ix];
          if (!c) return;
          var row = document.createElement("li");

          var label = document.createElement("span");
          label.textContent = c.title.replace(/\s+/g, " ").trim();
          row.appendChild(label);

          var go = document.createElement("button");
          go.type = "submit";
          go.name = "lock";
          go.value = "1";
          go.className = "btn btn-sm btn-ghost";
          go.textContent = "Take it back";
          go.addEventListener("click", function (e) {
            if (!window.confirm("Take this chapter back off this one person?")) {
              e.preventDefault();
              return;
            }
            /* Exactly one of each. The boxes are hidden in this mode
               but hidden is not disabled, so they still post. */
            $$('[data-tick="who"]', form).forEach(function (b) { b.checked = false; });
            $$('[data-tick="what"]', form).forEach(function (b) { b.checked = false; });
            if (box) box.checked = true;
            if (c.box) c.box.checked = true;
          });
          row.appendChild(go);
          ul.appendChild(row);
        });
        d.appendChild(ul);
        body.appendChild(d);
      });

      var count = $("[data-access-count]", form);
      if (count) {
        count.textContent = people
          ? people + (people === 1 ? " person" : " people") + ", " + held + " in all"
          : "";
      }

      /* "Nobody has any homework" is only ever true OF THIS COURSE.
         Said flatly it sent somebody to a student's portal expecting it
         to be empty, where they found fifty-two chapters belonging to a
         different class and concluded the screen was lying. So when the
         people on show hold something elsewhere, it says where. */
      var empty = $("[data-access-empty]", form);
      if (empty) {
        empty.hidden = people > 0;
        if (!people) {
          var other = 0;
          rows("who").forEach(function (li) {
            if (li.hidden) return;
            var raw = li.getAttribute("data-has") || "";
            raw.split("|").filter(Boolean).forEach(function (part) {
              var at = part.indexOf(":");
              if (at > -1 && part.slice(0, at) !== batch()) {
                other += part.slice(at + 1).split(",").filter(Boolean).length;
              }
            });
          });
          empty.textContent = other
            ? "Nobody on show has homework on this course. They hold " + other +
              " chapter" + (other === 1 ? "" : "s") + " on other courses — pick that " +
              "course above to see, or to take those back."
            : "Nobody on show has any homework yet. Give some out and it appears here.";
        }
      }
    }

    /* What is ticked, counted over everything — hidden rows included.

       Without this a tick can sit behind a filter and be given out
       without anybody seeing it, which is the same class of mistake as
       the reload that lost them. */
    function tally() {
      if (!sum) return;
      var who = $$('[data-tick="who"]', form).filter(function (b) { return b.checked; });
      var what = $$('[data-tick="what"]', form).filter(function (b) { return b.checked; });

      /* Above the early return, not below it. Clearing the last tick
         is exactly when the chapter pills have to go back to saying
         how many people have them at all — and the "nothing ticked"
         branch returns, so putting this after it left "0 of 1 have
         it" frozen on every row. */
      already(who);

      if (!who.length && !what.length) {
        sum.textContent = "Nothing ticked yet.";
        sum.classList.remove("is-ready");
        return;
      }

      /* Nothing ticked can be off screen any more — show() keeps a
         ticked row visible whatever the filter says — so this no
         longer has to warn about ticks somewhere you cannot see. It
         says what is about to happen, and the lists say the rest. */
      var kept = who.concat(what).filter(function (b) {
        return b.closest("li").classList.contains("is-kept");
      }).length;

      var out = "Giving " + plural(what.length, "chapter") + " to " + plural(who.length, "person", "people");
      if (kept) {
        out += " — " + kept + " of them ticked under a different filter, and still listed above";
      }
      sum.textContent = out + ".";
      sum.classList.toggle("is-ready", who.length > 0 && what.length > 0);
    }

    /* What the ticked people already have.
       Each person's row carries the indices of the chapters they have
       been given; each chapter's row carries its index. So once
       somebody is ticked, every chapter can say whether THESE people
       have it — which is the question being asked, and the one the
       screen could not answer at all. */
    function already(who) {
      var sets = who.map(function (b) { return holds(b.closest("li")); });

      rows("what").forEach(function (li) {
        var pill = $("[data-out]", li);
        if (!pill) return;
        var ix = li.getAttribute("data-ix");

        // Nobody ticked: back to how many people have it on this
        // batch, which pills() keeps up to date.
        if (!sets.length) {
          var n = batch() === "*"
            ? allOf(li, "data-outs").reduce(function (t, x) { return t + Number(x || 0); }, 0)
            : Number((packed(li, "data-outs", batch())[0] || 0));
          pill.hidden = !n;
          pill.textContent = n + (n === 1 ? " person" : " people");
          pill.classList.remove("is-all");
          return;
        }

        var n = sets.filter(function (s) { return s.indexOf(ix) !== -1; }).length;
        pill.hidden = n === 0;
        pill.classList.toggle("is-all", n === sets.length);
        pill.textContent = n === sets.length
          ? (sets.length === 1 ? "already has it" : "all " + sets.length + " have it")
          : n + " of " + sets.length + " have it";
      });
    }

    function plural(n, one, many) {
      return n + " " + (n === 1 ? one : many || one + "s");
    }

    /* Both go through redraw(), not straight to their own half.
       Course narrows the people AND the chapters worth listing when
       taking something back, and it narrows the access panel — which
       is rebuilt in redraw(). Calling byScope() alone left that panel
       showing people the filter had just excluded. */
    if (scope) scope.addEventListener("change", redraw);
    if (level) level.addEventListener("change", redraw);
    if (book) book.addEventListener("change", redraw);

    /* Re-run the filters on every tick, not just the total.
       Unticking a row that was being kept on screen only because it
       WAS ticked is the moment it should drop out of the list, and
       nothing else would notice. show() calls tally() at the end, so
       the total still follows. */
    // A declaration, not a var: the mode switch above calls it while
    // it is setting itself up, which is before a `var` would be
    // assigned.
    function redraw() {
      byScope();
      byLevel();
      // The Course dropdown narrows who is listed, and the access
      // panel lists people — so it has to be rebuilt with them.
      if (form.getAttribute("data-mode") === "access") access();
    }

    form.addEventListener("change", function (e) {
      if (!e.target || e.target.type !== "checkbox") return;
      /* Not for the Select all box. Redrawing recomputes that box from
         the ones below it, and doing so from inside its own click is
         what made Select all tick nothing. It announces itself when
         its work is done, below. */
      if (e.target.hasAttribute("data-tick-all")) return;
      redraw();
    });

    // Select all changes a dozen boxes without each of them firing.
    form.addEventListener("ln:ticks", redraw);

    byScope();
    byLevel();
    tally();
  })();

  /* ── The student's own homework, narrowed ────────────────────────
     Level, then topic. A workbook is forty-one chapters and a list of
     forty-one chapters is a wall, not a list.

     Nothing reloads. The rows are all on the page and these two hide
     them, which is the same decision the give-out screen above makes
     and for the same reason — a filter that rebuilds the page is a
     filter that loses your place.

     The topic dropdown is built from the rows themselves rather than
     rendered alongside them, so the two cannot drift apart: if a
     chapter is on the page it is in the dropdown, and if it is not,
     it is not.

     A level with nothing at it stays in the list. A student who can
     only see A1 should still be able to find out B1 exists and ask
     for it; hiding it would mean the only people who know what the
     school teaches are the ones already being taught it. */
  (function homeworkFilter() {
    var box = $("[data-hw-filter]");
    if (!box) return;

    var level = $("[data-hw-level]", box);
    var topic = $("[data-hw-topic]", box);
    var course = $("[data-hw-course]", box);   // only when there is a choice
    var book = $("[data-hw-book]", box);       // only when there is more than one
    var shown = $("[data-hw-shown]", box);
    var none = $("[data-hw-none]");
    var go = $("[data-hw-go]");
    var items = $$("[data-hw-item]");
    var groups = $$("[data-hw-group]");
    if (!level || !topic || !items.length) return;

    var KEEP = "ln-hw-level";
    var KEEP_C = "ln-hw-course";
    var askHref = none && $("[data-hw-none-ask]", none)
      ? $("[data-hw-none-ask]", none).getAttribute("href")
      : "";

    /* Last time's level, so somebody working through A2 is not asked
       to say so every time they open the page. Per-browser and
       nothing more: it is a convenience, not a record. */
    try {
      var kept = localStorage.getItem(KEEP);
      if (kept) {
        level.value = kept;
        // A level that is no longer offered leaves the select with
        // nothing chosen, which would show an empty box. Back to all.
        if (level.selectedIndex < 0) level.value = "";
        /* And a remembered level with nothing at it is worse than no
           memory at all: somebody who once looked at C1 out of
           curiosity opens their homework a week later to "No C1
           exercises yet" and an empty page. Remembering is only worth
           doing while it still points at something.

           Choosing an empty level by hand still says so — that is an
           answer to a question they just asked. */
        if (level.value && !items.some(function (li) {
          return li.getAttribute("data-level") === level.value;
        })) level.value = "";
      }
    } catch (e) {}

    if (course) {
      try {
        var keptC = localStorage.getItem(KEEP_C);
        if (keptC) {
          course.value = keptC;
          if (course.selectedIndex < 0) course.value = "";
        }
      } catch (e) {}
      course.addEventListener("change", function () {
        try { localStorage.setItem(KEEP_C, course.value); } catch (e) {}
        fillTopics();
        apply();
      });
    }

    topic.disabled = false;
    level.addEventListener("change", function () {
      try { localStorage.setItem(KEEP, level.value); } catch (e) {}
      fillTopics();
      apply();
    });
    topic.addEventListener("change", apply);
    /* fillTopics as well as apply: the topic list is the chapters
       currently showing, and choosing a book changes which those are.
       Without it the dropdown went on offering a chapter from a book
       nobody was looking at, and picking it showed nothing. */
    if (book) {
      book.addEventListener("change", function () {
        fillTopics();
        apply();
      });
    }

    fillTopics();
    apply();

    /* The chapters at the chosen level, in the order they are on the
       page — which is the order they were set, so Kapitel 3 does not
       come after Kapitel 30. */
    function fillTopics() {
      var want = level.value;
      var wantC = course ? course.value : "";
      var wantB = book ? book.value : "";
      var was = topic.value;

      topic.textContent = "";
      topic.appendChild(new Option("All topics", ""));

      items.forEach(function (li) {
        if (want && li.getAttribute("data-level") !== want) return;
        if (wantC && li.getAttribute("data-course") !== wantC) return;
        if (wantB && li.getAttribute("data-book") !== wantB) return;
        topic.appendChild(new Option(
          li.getAttribute("data-title") || "",
          li.getAttribute("data-id") || ""
        ));
      });

      // Keep the choice if it survived the change of level; otherwise
      // fall back to all, rather than silently showing one chapter
      // nobody asked for.
      topic.value = was;
      if (topic.selectedIndex < 0) topic.value = "";
      topic.disabled = topic.options.length < 2;
    }

    function apply() {
      var wantLevel = level.value;
      var wantTopic = topic.value;
      var wantCourse = course ? course.value : "";
      var wantBook = book ? book.value : "";
      var at = 0;   // how many are at the chosen level, before topic
      var on = 0;   // how many are actually visible

      items.forEach(function (li) {
        var okCourse = !wantCourse || li.getAttribute("data-course") === wantCourse;
        var okBook = !wantBook || li.getAttribute("data-book") === wantBook;
        var okLevel = !wantLevel || li.getAttribute("data-level") === wantLevel;
        // Counted within the chosen course: "no B1 exercises yet" has
        // to mean none on this course, or somebody on two of them is
        // told to ask for something they already have.
        if (okLevel && okCourse && okBook) at++;
        var okTopic = !wantTopic || li.getAttribute("data-id") === wantTopic;
        var show = okCourse && okBook && okLevel && okTopic;
        li.hidden = !show;
        if (show) on++;
      });

      // A course card with every row hidden is an empty box with a
      // heading on it. Put the whole card away instead.
      groups.forEach(function (card) {
        card.hidden = !$$("[data-hw-item]", card).some(function (li) { return !li.hidden; });
      });

      /* Nothing at that level is not "no results" — it is a level the
         student has not been given yet, which is a different sentence
         and has a different thing to do next. */
      if (none) {
        var empty = !!wantLevel && at === 0;
        none.hidden = !empty;
        if (empty) {
          var name = label(wantLevel);
          $$("[data-hw-none-level]", none).forEach(function (el) { el.textContent = name; });
          var ask = $("[data-hw-none-ask]", none);
          if (ask && askHref) {
            ask.setAttribute("href", askHref + "?subject=" +
              encodeURIComponent("Please unlock " + name + " exercises"));
            ask.textContent = "Ask for " + name + " exercises";
          }
        }
      }

      if (shown) {
        shown.textContent = wantLevel || wantTopic
          ? on + " of " + items.length + " shown"
          : "";
      }

      point();
      carry();
    }

    /* The filters travel with every link into a chapter.

       The list beside a worksheet is this list, and it can only show
       what was chosen here if it is told. The server reads these off
       the query string, so the chapter page is right before any script
       has run and a link somebody shares shows what they were looking
       at. */
    function q() {
      var bits = [];
      if (course && course.value) bits.push("course=" + encodeURIComponent(course.value));
      if (level.value) bits.push("level=" + encodeURIComponent(level.value));
      return bits.length ? "?" + bits.join("&") : "";
    }

    function carry() {
      var tail = q();
      items.forEach(function (li) {
        $$("a[href^='/portal/homework/']", li).forEach(function (a) {
          a.setAttribute("href", "/portal/homework/" + li.getAttribute("data-id") + tail);
        });
      });
    }

    /* Where the one button goes: the first chapter on show that has
       not been finished, so pressing it repeatedly walks the book.
       When they are all done it goes back to the first, because
       "start again" is a thing people do and a dead button is not. */
    function point() {
      if (!go) return;

      var live = items.filter(function (li) { return !li.hidden; });
      if (!live.length) { go.hidden = true; return; }
      go.hidden = false;

      var todo = live.filter(function (li) {
        return li.getAttribute("data-state") !== "done";
      });
      var pick = todo[0] || live[0];
      var where = level.value && level.value !== "—" ? " " + level.value : "";

      go.setAttribute("href", "/portal/homework/" + pick.getAttribute("data-id") + q());
      go.textContent = !todo.length
        ? "Start" + where + " again"
        : todo.length < live.length
          ? "Continue" + where
          : "Start" + where;
    }

    /* "—" is the value given to homework with no level on it. Saying
       "No — exercises yet" would be nonsense. */
    function label(v) { return v === "—" ? "ungraded" : v; }
  })();

  /* ── Batch code ──────────────────────────────────────────────────
     Removed, along with the field it filled in.

     The code was an editable box with a suggestion in it, and asking
     for a suggestion reserved nothing — so two tabs, or one form left
     open while the course was changed, could be handed the same code
     twice. The second save hit the unique key, and the office was told
     "a batch with that code already exists" about a code it had never
     typed.

     It is allocated when the row is written now (lib/intakes.create),
     from the greater of the counter and what is actually in the table,
     and the form only displays it. There is nothing here left to keep
     in step. */

  /* ── Profile photo ───────────────────────────────────────────────
     Resize in the browser, then post the result as a data: URL.

     A phone photo is four megabytes and 4000 pixels wide; what the
     portal shows is 96 pixels. Shrinking it here means the server
     needs no upload library and no image library, and nothing crosses
     the wire that has not already been reduced to a known size and
     re-encoded — the canvas throws away whatever the original file
     was, EXIF and all.

     The form starts hidden and is revealed here, so a browser without
     JavaScript is not offered a control that cannot work. The server
     re-checks everything regardless: this is for the upload's sake,
     not for the server's safety. */
  (function profilePhoto() {
    var form = $("[data-avatar-form]");
    if (!form) return;

    var input = form.querySelector("[data-avatar-input]");
    var payload = form.querySelector("[data-avatar-payload]");
    var status = form.querySelector("[data-avatar-status]");
    if (!input || !payload) return;

    var SIDE = 256;
    var MAX_BYTES = 400 * 1024;

    form.hidden = false;

    function say(msg) {
      if (status) status.textContent = msg || "";
    }

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;

      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        say("Choose a PNG, JPEG or WebP image.");
        input.value = "";
        return;
      }

      say("Preparing…");

      /* Read to a data: URL rather than URL.createObjectURL. The site's
         Content-Security-Policy allows img-src 'self' data: and not
         blob:, so an object URL never loads here and the only symptom
         is a picture that silently refuses to appear. Loosening the
         policy for one upload control would be the wrong trade. */
      var reader = new FileReader();
      var img = new Image();

      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = SIDE;
          canvas.height = SIDE;
          var ctx = canvas.getContext("2d");

          /* Centre-crop to a square first. Squashing a portrait into a
             square is the one thing nobody forgives in a photo of
             their own face. */
          var side = Math.min(img.width, img.height);
          ctx.drawImage(
            img,
            (img.width - side) / 2, (img.height - side) / 2, side, side,
            0, 0, SIDE, SIDE
          );

          /* JPEG, not PNG: a photograph as PNG is several hundred
             kilobytes and as JPEG about twenty, for no visible
             difference at this size. */
          var data = canvas.toDataURL("image/jpeg", 0.85);
          if (data.length * 0.75 > MAX_BYTES) {
            data = canvas.toDataURL("image/jpeg", 0.6);
          }

          payload.value = data;
          say("Saving…");
          form.submit();
        } catch (e) {
          say("That image could not be read. Try another one.");
          input.value = "";
        }
      };

      img.onerror = function () {
        say("That image could not be read. Try another one.");
        input.value = "";
      };

      reader.onload = function () {
        img.src = reader.result;
      };
      reader.onerror = function () {
        say("That file could not be opened. Try another one.");
        input.value = "";
      };
      reader.readAsDataURL(file);
    });
  })();

  /* ── Copy to clipboard ───────────────────────────────────────────
     Any [data-copy] button copies its value and says so.

     navigator.clipboard needs a secure context, which the back office
     always is in production but is not on a plain-http staging box —
     so there is a fallback, and if both fail the button says it
     failed rather than pretending. */
  (function copyButtons() {
    // Delegate clicks so dialogs created after page load use this same component.

    function fallback(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      /* Off-screen rather than hidden: a display:none textarea cannot
         be selected, so the copy would silently do nothing. */
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function flash(btn, text, ok) {
      btn.setAttribute("data-copied", ok ? "yes" : "no");
      var scope = btn.closest("[data-copy-scope]") || document;
      var live = scope.querySelector("[data-copy-live]");
      text = btn.getAttribute("data-copy-label") || text;
      /* The back office is in English; the copy button is only used
         there. A German string here was a slip. */
      if (live) live.textContent = ok ? text + " copied" : "Could not copy";
      window.setTimeout(function () { btn.removeAttribute("data-copied"); }, 1600);
    }

    document.addEventListener("click", function (event) {
        var btn = event.target.closest && event.target.closest("[data-copy]");
        if (!btn || btn.disabled) return;
        var text = btn.getAttribute("data-copy") || "";
        if (!text) return;

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text)
            .then(function () { flash(btn, text, true); })
            .catch(function () { flash(btn, text, fallback(text)); });
        } else {
          flash(btn, text, fallback(text));
        }
    });
  })();

  /* ── Rails ───────────────────────────────────────────────────────
     A row that scrolls sideways. The scrolling itself is the browser's
     — this only adds the two arrows a mouse wants, and takes them away
     again when there is nothing to scroll to.

     Which is most of the point: a track with one course must not show
     arrows that do nothing, and the same row on a wide screen often
     fits entirely, at which point the arrows are furniture.           */
  (function rails() {
    const wraps = $$("[data-rail]");
    if (!wraps.length) return;

    const ARROW = (d) =>
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";

    wraps.forEach(function (wrap) {
      const rail = $(".rail", wrap);
      if (!rail) return;

      const prev = document.createElement("button");
      prev.className = "rail-btn rail-prev";
      prev.type = "button";
      prev.setAttribute("aria-label", wrap.getAttribute("data-rail-prev") || "Previous");
      prev.innerHTML = ARROW('<path d="m15 18-6-6 6-6"/>');

      const next = document.createElement("button");
      next.className = "rail-btn rail-next";
      next.type = "button";
      next.setAttribute("aria-label", wrap.getAttribute("data-rail-next") || "Next");
      next.innerHTML = ARROW('<path d="m9 18 6-6-6-6"/>');

      wrap.appendChild(prev);
      wrap.appendChild(next);

      /* One card plus its gap, measured rather than assumed: the card
         width is a clamp() and the gap is a clamp(), so there is no
         number here that would still be right at another width. */
      function step() {
        const first = rail.firstElementChild;
        if (!first) return rail.clientWidth;
        const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
        return first.getBoundingClientRect().width + gap;
      }

      function paint() {
        const slack = rail.scrollWidth - rail.clientWidth;
        /* The rail is padded so the cards' shadows and focus rings are
           not clipped, and scroll snapping rests against that padding
           rather than against zero — so a rail at its start sits at
           scrollLeft 4, not 0. Measured, because the padding is there
           for a reason and will change when that reason does. */
        const pad = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
        const edge = pad + 2;
        const scrollable = slack > edge;
        wrap.classList.toggle("is-scrollable", scrollable);
        prev.hidden = !scrollable || rail.scrollLeft <= edge;
        next.hidden = !scrollable || rail.scrollLeft >= slack - edge;
      }

      const go = (dir) =>
        rail.scrollBy({ left: dir * step(), behavior: reduceMotion() ? "auto" : "smooth" });

      prev.addEventListener("click", () => go(-1));
      next.addEventListener("click", () => go(1));
      rail.addEventListener("scroll", paint, { passive: true });
      window.addEventListener("resize", paint);

      /* Cards are lazy-loaded images, so the row's width is not final
         when this runs. Re-measure when the box actually changes. */
      if (window.ResizeObserver) new ResizeObserver(paint).observe(rail);

      /* Filtering hides cards inside the rail, which changes whether
         there is anything to scroll to. */
      if (window.MutationObserver) {
        new MutationObserver(paint).observe(rail, {
          attributes: true, attributeFilter: ["hidden", "style", "class"],
          childList: true, subtree: true,
        });
      }

      paint();
    });

    function reduceMotion() {
      return window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  })();

  /* ── "Read more" on a quote ──────────────────────────────────────
     The cards are clamped to a few lines so a rail of them is one
     height rather than a ragged row. The button appears only where
     the clamp actually cut something off — offered on a quote that is
     already complete, it reads as a broken link.                     */
  (function quotes() {
    const cards = $$("[data-quote]");
    if (!cards.length) return;

    let dialog = null;

    function open(card) {
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.className = "quote-modal";
        dialog.innerHTML =
          '<div class="quote-modal-panel">' +
          '<button class="icon-btn quote-modal-close" type="button" data-close ' +
          'aria-label="' + (card.getAttribute("data-quote-close") || "Close") + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
          'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          "</button>" +
          '<blockquote data-modal-quote></blockquote>' +
          '<div class="quote-modal-who" data-modal-who></div>' +
          "</div>";
        document.body.appendChild(dialog);
        dialog.addEventListener("click", function (e) {
          /* The backdrop is the dialog itself; the panel is inside it. */
          if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
        });
      }

      $("[data-modal-quote]", dialog).textContent =
        card.getAttribute("data-quote-full") || "";
      const who = $(".who", card);
      const img = $("img", card);
      const holder = $("[data-modal-who]", dialog);
      holder.textContent = "";
      if (img) {
        const copy = img.cloneNode(true);
        copy.removeAttribute("loading");
        holder.appendChild(copy);
      }
      if (who) holder.appendChild(who.cloneNode(true));

      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    cards.forEach(function (card) {
      const body = $("blockquote", card);
      if (!body) return;

      /* Measured, not guessed at from the character count: whether the
         clamp bit depends on the font, the language and the width. */
      function check() {
        const cut = body.scrollHeight - body.clientHeight > 2;
        let btn = $(".quote-more", card);
        if (cut && !btn) {
          btn = document.createElement("button");
          btn.className = "linklike quote-more";
          btn.type = "button";
          btn.textContent = card.getAttribute("data-quote-more") || "Read more";
          btn.addEventListener("click", () => open(card));
          body.insertAdjacentElement("afterend", btn);
        } else if (!cut && btn) {
          btn.remove();
        }
      }

      check();
      window.addEventListener("resize", check);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
    });
  })();

  /* ── The account button ──────────────────────────────────────────
     Signed out, the header link is already right: it goes to the
     sign-in page and carries where you were. This only runs for
     somebody who is actually signed in, and then it does two things —
     puts their own face on the button, and turns it into a menu.

     Asked for after the page loads rather than rendered into it. The
     header is on every public page and public pages are cached; a name
     baked into one would be served to whoever asks for that page next.
     That is also why the request is made once per page and never
     stored.                                                          */
  (function account() {
    const host = $("[data-account]");
    if (!host || !window.fetch) return;

    const link = $("[data-account-btn]", host);
    if (!link) return;

    let S = {};
    try { S = JSON.parse(host.getAttribute("data-account-strings") || "{}"); } catch (e) { S = {}; }
    const say = (key, vars) => {
      let out = S[key] || key;
      if (vars) Object.keys(vars).forEach((k) => { out = out.split("{" + k + "}").join(vars[k]); });
      return out;
    };

    const ICON = (d) =>
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";

    /* The same five destinations as the portal's own sidebar, in the
       same order, because somebody who has been inside already knows
       that shape. */
    const ITEMS = [
      ["dashboard", "/portal/me", '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z"/>'],
      ["profile", "/portal/profile", '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
      ["courses", "/portal/courses", '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'],
      ["et", "/portal/einbuergerungstest",
       '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/>' +
       '<path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>'],
      ["settings", "/portal/settings",
       '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1' +
       'a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1' +
       'A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1' +
       'A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1' +
       'A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>'],
    ];

    function signedIn(me) {
      /* The face, or the initials on their own colour — the same
         monogram the portal draws, so it is recognisably the same
         person in both places. */
      const face = me.avatarUrl
        ? '<img class="acct-face" src="' + me.avatarUrl + '" alt="" width="64" height="64" decoding="async">'
        : '<span class="acct-face acct-initials" aria-hidden="true" style="--av-h:' +
          (Number(me.hue) || 0) + '">' + escape_(me.initials || "?") + "</span>";

      const btn = document.createElement("button");
      btn.className = "icon-btn acct-btn";
      btn.type = "button";
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", say("menu"));
      btn.innerHTML = face;

      const menu = document.createElement("div");
      menu.className = "acct-menu";
      menu.setAttribute("role", "menu");
      menu.hidden = true;
      menu.innerHTML =
        '<p class="acct-who">' + say("signedIn", { name: escape_(me.name || "") }) + "</p>" +
        '<ul>' +
        ITEMS.map(([key, href, d]) =>
          '<li><a role="menuitem" href="' + href + '">' + ICON(d) + say(key) + "</a></li>"
        ).join("") +
        /* A form, not a link. Signing out changes something, and every
           crawler and link-preview bot fetches the links it finds. */
        '<li class="acct-out"><form method="post" action="/portal/logout">' +
        '<button role="menuitem" type="submit">' +
        ICON('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>') +
        say("logout") + "</button></form></li>" +
        "</ul>";

      link.replaceWith(btn);
      host.appendChild(menu);
      host.classList.add("is-in");

      const items = () => $$('[role="menuitem"]', menu);

      function open(focusFirst) {
        menu.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        if (focusFirst && items()[0]) items()[0].focus();
        document.addEventListener("click", onOutside, true);
      }
      function close(giveBack) {
        if (menu.hidden) return;
        menu.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        document.removeEventListener("click", onOutside, true);
        if (giveBack) btn.focus();
      }
      function onOutside(e) { if (!host.contains(e.target)) close(false); }

      btn.addEventListener("click", () => (menu.hidden ? open(false) : close(false)));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          /* The list handler below listens on the whole host, so this
             same keypress would bubble up and immediately step past
             the item just focused — Arrow Down opened the menu on
             "My profile" rather than on "Dashboard". */
          e.stopPropagation();
          open(true);
        }
      });

      /* Escape closes and hands focus back; the arrows walk the list.
         Without this the menu is a trap: a keyboard user can open it
         and then has to tab through every item to get out. */
      host.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { close(true); return; }
        if (menu.hidden) return;
        const list = items();
        const at = list.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); (list[at + 1] || list[0]).focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); (list[at - 1] || list[list.length - 1]).focus(); }
        if (e.key === "Tab" && at === list.length - 1 && !e.shiftKey) close(false);
      });
    }

    /* The name goes into markup, so it is escaped. It comes from our
       own database, but "it came from us" is how every injection
       starts — and a student can set their own name. */
    function escape_(v) {
      return String(v).replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
      ));
    }

    fetch("/portal/session.json", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => { if (me && me.signedIn) signedIn(me); })
      .catch(() => {
        /* Offline, or the database is down. The link stays what it is,
           which is a working link to the sign-in page. */
      });
  })();

  /* ── Terms you have to actually read ─────────────────────────────
     Drives views/partials/terms-gate.ejs, on every page where somebody
     agrees to something: the student account request, the student
     invitation, the teacher invitation.

     The link opens a dialog with the terms in it; "I accept" stays
     disabled until the panel has been scrolled to the end; pressing it
     is what ticks the box. Clicking the box itself opens the terms
     rather than ticking it.

     Unticking is always allowed with no ceremony. Withdrawing consent
     should never be harder than giving it.

     Every line here is an enhancement. With no JavaScript, or in a
     browser without <dialog>, the link is a plain link to the terms
     page and the box is a plain box — which is why the markup uses an
     <a> and not a button.                                            */
  (function termsGate() {
    $$("[data-terms-gate]").forEach(function (gate) {
      const box = $("[data-accept]", gate);
      const link = $("[data-open-terms]", gate);
      const dialog = $("[data-terms-dialog]", gate);
      if (!box || !link || !dialog || typeof dialog.showModal !== "function") return;

      const pane = $("[data-terms-scroll]", dialog);
      const acceptBtn = $("[data-terms-accept]", dialog);
      const declineBtn = $("[data-terms-decline]", dialog);
      const progress = $("[data-terms-progress]", dialog);
      if (!pane || !acceptBtn) return;

      let readToEnd = false;

      /* "Reached the bottom" carries a small tolerance: sub-pixel
         rounding and browser zoom mean scrollTop rarely lands exactly
         on the maximum, and a panel that never quite counts as read is
         a form nobody can submit. A panel short enough not to scroll
         counts as read straight away. */
      function measure() {
        const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 24;
        if (!atEnd) {
          const pct = Math.round(((pane.scrollTop + pane.clientHeight) / pane.scrollHeight) * 100);
          progress.textContent = "Please read to the end — " + Math.min(pct, 99) + "% shown.";
          return;
        }
        readToEnd = true;
        acceptBtn.disabled = false;
        progress.textContent = "You have reached the end. You can accept now.";
      }

      function open() {
        dialog.showModal();
        /* Measured after opening: a closed dialog has no layout, so
           scrollHeight and clientHeight are both zero until it is
           shown, and everything would look already-read. */
        requestAnimationFrame(measure);
      }

      pane.addEventListener("scroll", measure);

      link.addEventListener("click", function (e) {
        /* A modified click is somebody asking for a new tab, and the
           href is a real page. Let the browser have it. */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open();
      });

      acceptBtn.addEventListener("click", function () {
        if (!readToEnd) return;
        box.checked = true;
        /* Announced, because other scripts on the page watch this box
           to enable their submit button. */
        box.dispatchEvent(new Event("change", { bubbles: true }));
        dialog.close();
      });

      declineBtn.addEventListener("click", function () {
        box.checked = false;
        dialog.close();
      });

      box.addEventListener("click", function (e) {
        if (box.checked) {
          e.preventDefault();
          open();
        }
      });
    });
  })();

  /* ── Show the password ───────────────────────────────────────────
     An eye on every password box wrapped in [data-password].

     Built here rather than written into the markup so that a browser
     with no JavaScript never shows a button that cannot do anything.
     The rules ask for a long passphrase, and a long passphrase is
     exactly what people mistype into a field they cannot see.

     The button is aria-pressed rather than swapping its label, so a
     screen reader hears the state rather than having to infer it from
     an icon it cannot see. It is deliberately not in the tab order
     before the field it belongs to: it is appended after the input.  */
  (function passwordEye() {
    const EYE =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 3l18 18"/>' +
      '<path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/>' +
      '<path d="M6.2 7.4A17 17 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.5-1.1"/>' +
      '<path d="M9.9 10.1a3 3 0 0 0 4.2 4.2"/></svg>';

    $$("[data-password]").forEach((wrap) => {
      const input = $("input", wrap);
      if (!input) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-eye";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Show the password");
      btn.title = "Show the password";
      btn.innerHTML = EYE;
      wrap.appendChild(btn);

      btn.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.setAttribute("aria-pressed", showing ? "false" : "true");
        const label = showing ? "Show the password" : "Hide the password";
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.innerHTML = showing ? EYE : EYE_OFF;
        /* Focus goes back to where they were typing, with the caret at
           the end rather than at the start. */
        input.focus();
        const end = input.value.length;
        try { input.setSelectionRange(end, end); } catch (e) { /* not all types allow it */ }
      });

      /* A revealed password must not stay revealed on a shared machine
         once the person has moved on. Hidden again as soon as the field
         loses focus to anything but the eye itself. */
      input.addEventListener("blur", () => {
        setTimeout(() => {
          if (document.activeElement === btn || document.activeElement === input) return;
          if (input.type !== "text") return;
          input.type = "password";
          btn.setAttribute("aria-pressed", "false");
          btn.setAttribute("aria-label", "Show the password");
          btn.title = "Show the password";
          btn.innerHTML = EYE;
        }, 0);
      });
    });
  })();

  /* ── The guide and blog contents panel ─────────────────────────────
     Open in the markup, because a closed <details> cannot be forced
     open by CSS and the panel beside the text is the whole point on a
     wide screen. On a phone that is five links between the reader and
     the headline, so close it there.

     A matchMedia listener rather than a one-off check: a phone rotated
     into landscape crosses the breakpoint, and the summary is hidden
     above it — a panel that was closed on the way past would become an
     empty box with no way to open it. */
  (function () {
    var panels = document.querySelectorAll(".page-nav");
    if (!panels.length || !window.matchMedia) return;

    var narrow = window.matchMedia("(max-width: 899px)");

    var apply = function () {
      for (var i = 0; i < panels.length; i++) {
        // Only while the reader has not touched it. Their choice on this
        // page outlives a resize; the next page starts fresh.
        if (panels[i].dataset.touched) continue;
        panels[i].open = !narrow.matches;
      }
    };

    for (var i = 0; i < panels.length; i++) {
      panels[i].addEventListener("toggle", function () {
        this.dataset.touched = "1";
      });
    }

    apply();
    if (narrow.addEventListener) narrow.addEventListener("change", apply);
    else if (narrow.addListener) narrow.addListener(apply);
  })();

  /* ── Service worker, and telling people when it has something new ──
     The worker no longer takes over the moment it installs. It waits,
     and this offers the swap: "a new version is ready", with the reload
     on a button rather than happening underneath somebody mid-sentence.

     Without it a deploy was invisible. The new worker activated, the open
     page went on showing the HTML and CSS it already had, and the only
     way to see the new site was to happen to reload. */
  if ("serviceWorker" in navigator) {
    var swReloading = false;

    // The reload, once the waiting worker has taken control. Guarded:
    // controllerchange can fire more than once, and a reload loop is a
    // page nobody can read.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (swReloading) return;
      swReloading = true;
      window.location.reload();
    });

    var offer = function (worker) {
      if (document.querySelector(".sw-toast")) return;

      var root = document.documentElement;
      var box = document.createElement("div");
      box.className = "sw-toast";
      // polite, not assertive: this is worth saying, not worth
      // interrupting whatever is being read.
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");

      var msg = document.createElement("p");
      msg.className = "sw-toast-msg";
      msg.textContent = root.getAttribute("data-sw-ready") || "A new version is ready.";

      var now = document.createElement("button");
      now.type = "button";
      now.className = "btn btn-sm";
      now.textContent = root.getAttribute("data-sw-update") || "Update now";

      var later = document.createElement("button");
      later.type = "button";
      later.className = "btn btn-sm btn-ghost";
      later.textContent = root.getAttribute("data-sw-later") || "Later";

      now.addEventListener("click", function () {
        now.disabled = true;
        later.disabled = true;
        // The worker activates, takes control, and controllerchange above
        // does the reload. If it somehow never arrives, reload anyway
        // rather than leaving two dead buttons on the screen.
        worker.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(function () {
          if (!swReloading) {
            swReloading = true;
            window.location.reload();
          }
        }, 3000);
      });

      later.addEventListener("click", function () {
        box.remove();
        // Not dismissed for good: the worker is still waiting, so the
        // next page load offers it again. "Later" means later, not never.
      });

      var actions = document.createElement("div");
      actions.className = "sw-toast-actions";
      actions.appendChild(now);
      actions.appendChild(later);
      box.appendChild(msg);
      box.appendChild(actions);
      document.body.appendChild(box);
    };

    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/sw.js")
        .then(function (reg) {
          if (!reg) return;

          // Every branch below checks for an existing controller. Without
          // that check the very first visit — where there is no previous
          // version at all — would announce an update to a site the
          // reader has only just opened.
          if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);

          reg.addEventListener("updatefound", function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", function () {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                offer(installing);
              }
            });
          });

          // A phone keeps one tab open for weeks. Without this the check
          // only happens on a cold load, which is exactly the thing that
          // was not happening. Throttled to once every ten minutes so
          // flicking between apps is not a stream of requests.
          var lastCheck = 0;
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState !== "visible") return;
            var now = Date.now();
            if (now - lastCheck < 600000) return;
            lastCheck = now;
            reg.update().catch(function () {});
          });
        })
        .catch(function () {
          /* Offline support is a bonus; the site works without it. */
        });
    });
  }

  /* ── The instalment editor ───────────────────────────────────────

     Type an amount and the rows you have NOT touched share what is
     left. Set the first of four to 300 out of 750 and the other three
     become 150 each; set the second to 50 as well and the last two
     become 200 each. The office is then only ever typing the numbers
     it cares about, and the plan still adds up.

     A row you have edited is left alone from then on, because the
     whole point of typing a number into it was to say what it should
     be. The running total says what the rows come to and whether that
     matches the fee — checked again on the server, which is where it
     actually matters.                                               */
  (function instalments() {
    const form = $("[data-plan]");
    if (!form) return;

    const rows = $$("[data-plan-amount]", form);
    const dates = $$("[data-plan-due]", form);
    const sum = $("[data-plan-sum]", form);
    const go = $("[data-plan-go]", form);
    if (!rows.length) return;

    /* Whole cents, parsed from the string rather than multiplied as a
       float — the same rule the server keeps, for the same reason. */
    const cents = (v) => {
      const m = /^\s*(-?)(\d*)(?:[.,](\d{0,2}))?\s*$/.exec(String(v == null ? "" : v));
      if (!m) return NaN;
      const whole = Number(m[2] || 0) * 100;
      const frac = m[3] ? Number((m[3] + "0").slice(0, 2)) : 0;
      return (m[1] === "-" ? -1 : 1) * (whole + frac);
    };
    const show = (c) => (c / 100).toFixed(2);
    const euro = (c) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(c / 100);

    const total = () => cents(form.getAttribute("data-plan-total")) || 0;
    const touched = new Set();

    function spread(after) {
      const want = total();
      let fixed = 0;
      const free = [];
      rows.forEach((input, i) => {
        if (touched.has(i) || i <= after) fixed += cents(input.value) || 0;
        else free.push(i);
      });

      /* Nothing left to move it into, or already over the fee: leave
         every box exactly as typed and let the line below say so.
         Silently rewriting what somebody just entered is worse than
         showing them that it does not add up. */
      const rest = want - fixed;
      if (free.length && rest >= 0) {
        const each = Math.floor(rest / free.length);
        const odd = rest - each * free.length;
        free.forEach((i, n) => {
          rows[i].value = show(each + (n === 0 ? odd : 0));
        });
      }
      tally();
    }

    function tally() {
      const want = total();
      const got = rows.reduce((n, r) => n + (cents(r.value) || 0), 0);
      const same = got === want;
      if (sum) {
        sum.textContent = same
          ? `These add up to ${euro(got)}, which matches the fee.`
          : `These add up to ${euro(got)}, against a fee of ${euro(want)} — ` +
            `${euro(Math.abs(want - got))} ${got < want ? "short" : "over"}.`;
        sum.classList.toggle("is-off", !same);
      }
      /* Disabled rather than hidden: the button staying where it is,
         greyed, explains itself. A button that vanishes just looks
         like the page is broken. */
      if (go) go.disabled = !same;
    }

    rows.forEach((input, i) => {
      input.addEventListener("input", () => {
        touched.add(i);
        spread(i);
      });
      /* Tidied to two decimals when the box is left, so 200 becomes
         200.00 and matches everything around it. */
      input.addEventListener("blur", () => {
        const c = cents(input.value);
        if (Number.isFinite(c)) input.value = show(c);
        tally();
      });
    });
    dates.forEach((d) => d.addEventListener("change", tally));

    tally();
  })();


  /* ── Recording a payment against the right invoice ───────────────

     Choosing a different invoice fills the amount with what is owed
     on THAT one. It stayed on the first invoice's figure before, so
     selecting instalment 2 and pressing Record put instalment 1's
     amount against it — right number, wrong row, and nothing on the
     page to say so.

     Overwritten only while the box still holds the amount this put
     there. Once somebody types their own figure it is theirs, because
     a part payment is the normal case and having it replaced on every
     change of the dropdown would be worse than the bug.             */
  (function owes() {
    const pick = $("[data-owes]");
    const amount = $("[data-owes-amount]");
    if (!pick || !amount) return;

    /* True until the office types its own figure, false for ever
       after. The first version of this had the test the wrong way
       round and overwrote a hand-typed amount on the next change of
       the dropdown — which is worse than the bug it was fixing, since
       the typed number is the one somebody meant. */
    let filling = true;
    amount.addEventListener("input", () => { filling = false; });

    pick.addEventListener("change", () => {
      if (!filling) return;
      const owed = pick.options[pick.selectedIndex].getAttribute("data-owed");
      if (owed) amount.value = owed;
    });
  })();


  /* Print, which is also save-as-PDF in every browser worth the name.
     No library, nothing generated on a shared host, and the document
     that comes out is the one on the screen.                        */
  (function printable() {
    const go = $("[data-print]");
    if (go) go.addEventListener("click", () => window.print());
  })();

})();

// Remember navigation expansion for this tab; the current page's group always opens.
(function () {
  document.querySelectorAll('[data-portal-group]').forEach(function (group) {
    var key='ln-portal-group:'+group.dataset.portalGroup;
    try { if(!group.classList.contains('is-active'))group.open=sessionStorage.getItem(key)==='open'; } catch(e) {}
    group.addEventListener('toggle',function(){try{sessionStorage.setItem(key,group.open?'open':'closed');}catch(e){}});
  });
})();

/* WhatsApp community: no additional bundle or dependency. */
(() => {
 'use strict';
 const root=document.querySelector('[data-community-admin],[data-community-public]'); if(!root)return;
 const admin=root.hasAttribute('data-community-admin'),de=root.dataset.lang==='de';
 const content=root.querySelector('[data-cm-content]'),notice=root.querySelector('[data-cm-notice]');
 const tr=(en,german)=>de?german:en;
 function el(tag,text,attrs={}) {const n=document.createElement(tag);if(text!==null&&text!==undefined)n.textContent=String(text);for(const [k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='checked')n.checked=v;else if(k==='value')n.value=v??'';else if(v!==false&&v!==undefined)n.setAttribute(k,v);}return n;}
 function add(parent,...nodes){parent.append(...nodes.filter(Boolean));return parent;}
 const btn=(label,action)=>el('button',label,{type:'button',onclick:action});
 function message(text,error=false){notice.textContent=text;notice.className=error?'cm-error':'cm-success';}
 async function api(route,method='GET',body){const res=await fetch((admin?'/admin/community/api/':'/api/community/')+route,{method,credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await res.json();}catch{throw Error(tr('The server returned an unexpected response. Refresh and try again.','Unerwartete Serverantwort. Bitte die Seite neu laden.'));}if(!res.ok){const error=Error(data.error||tr('Request failed','Anfrage fehlgeschlagen'));error.status=res.status;throw error;}return data;}
 function field(form,name,label,options={}){const wrap=el('label',null,{class:'cm-field'});wrap.append(el('span',label));const input=el(options.choices?'select':options.type==='textarea'?'textarea':'input',null,{name,...(options.choices?{}:{type:options.type||'text'}),required:options.required||false,maxlength:options.max,min:options.min,max:options.maxNumber});if(options.choices)for(const choice of options.choices){const [value,title]=Array.isArray(choice)?choice:[choice,choice];input.append(el('option',title,{value}));}input.value=options.value??'';if(options.type==='textarea')input.rows=4;if(!admin)wrap.append(input);if(options.hint)wrap.append(el('small',options.hint,{class:'cm-muted'}));if(admin)wrap.append(input);form.append(wrap);return input;}
 function toggle(form,name,label,checked=false){const wrap=el('label',null,{class:'cm-checkbox'}),input=el('input',null,{type:'checkbox',name,checked});add(wrap,input,el('span',label));form.append(wrap);return input;}
 const value=(form,name)=>form.elements.namedItem(name)?.value;
 const checked=(form,name)=>form.elements.namedItem(name)?.checked===true;
 function badge(text){return el('span',text??'—',{class:'cm-badge','data-tone':['ACTIVE','Active','APPROVED','LOW','APPROVE'].includes(text)?'good':['REVIEW','PENDING','FINAL_WARNING','WARNING'].includes(text)?'review':['HIGH','BLOCKED','REJECTED','REJECT'].includes(text)?'bad':''});}
 function card(title,...children){return add(el('section',null,{class:'cm-card'}),el('h3',title),...children);}
 function details(title,data){const dl=el('dl');for(const [key,val]of Object.entries(data)){if(val===null||val===undefined||key.includes('encrypted'))continue;add(dl,el('dt',key.replaceAll('_',' ')),el('dd',typeof val==='object'?JSON.stringify(val,null,2):val));}return card(title,dl);}
 function dialog(title){const d=el('dialog',null,{class:'cm-dialog cm-module','aria-label':title});const close=btn('Close',()=>d.close());add(d,add(el('div',null,{class:'cm-heading'}),el('h2',title),close));document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
 function mutation(title,description,fields,send,onDone){const d=dialog(title),form=el('form',null,{class:'cm-form'}),error=el('p',null,{role:'alert',class:'cm-error',hidden:true});add(d,el('p',description),form);fields(form);const submit=el('button','Confirm '+title,{type:'submit',class:'btn'});add(form,error,submit);let pending=false;form.addEventListener('submit',async event=>{event.preventDefault();if(pending||!form.reportValidity())return;pending=true;submit.disabled=true;const idleLabel=submit.textContent;submit.textContent=submit.getAttribute('data-busy-label')||'Saving…';error.hidden=true;try{await send(form);d.close();message('Settings / changes saved successfully.');try{await loadAdmin();if(onDone)await onDone();}catch(refreshError){message('Saved, but the view could not refresh: '+refreshError.message,true);}}catch(e){error.textContent=e.message;error.hidden=false;}finally{pending=false;submit.disabled=false;submit.textContent=idleLabel;}});return form;}
 const categories=['ADVERTISEMENT','REPEATED_PROMOTION','SPAM','SCAM_CONCERN','HARASSMENT','INAPPROPRIATE_CONTENT','OTHER'];
 let groups=[],settings={},query={page:1,limit:20};
 const groupLabel=id=>groups.find(g=>Number(g.id)===Number(id))?.name||'#'+id;
 const groupChoices=(optional=false)=>[...(optional?[['','All / none']]:[]),...groups.map(g=>[g.id,g.name])];
 async function requestDetail(id){const raw=await api('join-requests/'+id),record={...raw,request:raw},d=dialog('Join request #'+id);add(d,details('Application',Object.fromEntries(Object.entries(record.request).filter(([key,value])=>!Array.isArray(value)&&!key.endsWith('_text_snapshot')))));const consent=card('Rules & Privacy acceptance',el('p','Recorded with this submitted application.'));const consentData={'Rules accepted':friendlyDate(record.request.rules_accepted_at),'Rules version':record.request.rules_version,'Privacy acknowledged':friendlyDate(record.request.privacy_accepted_at),'Privacy version':record.request.privacy_version};consent.append(details('Acceptance record',consentData));for(const [key,label]of [['rules_text_snapshot','Accepted rules'],['privacy_text_snapshot','Acknowledged privacy notice']]){if(record.request[key]){const saved=el('details');add(saved,el('summary',label),configuredText(record.request[key]));consent.append(saved);}}if(!record.request.rules_text_snapshot||!record.request.privacy_text_snapshot)consent.append(el('p','Historical request: original notice text was not captured. Saved versions and timestamps remain available.',{class:'cm-muted'}));d.append(consent);const actions=el('div',null,{class:'cm-actions'});if(['PENDING','REVIEW'].includes(record.request.status)){
  for(const [label,status]of [['Approve','APPROVED'],['Reject','REJECTED'],['Mark for review','REVIEW']])actions.append(btn(label,()=>{d.close();mutation(label+' request','This records a human decision. Approval does not add the applicant to WhatsApp.',f=>field(f,'reason','Internal decision reason',{type:'textarea',max:2000,required:status==='REJECTED'}),f=>api('join-requests/'+id+'/decision','POST',{status,reason:value(f,'reason')}),status==='APPROVED'?()=>requestDetail(id):null);}));
  actions.append(btn('Re-screen',async()=>{try{await api('join-requests/'+id+'/rescreen','POST',{});d.close();await requestDetail(id);}catch(e){message(e.message,true);}}));
 }
 if(record.request.status==='APPROVED'){
  const pending=record.request.handoff_status==='PENDING';
  const next=card(pending?'Approved — waiting for WhatsApp admission':'Approved — admission recorded',el('p',pending?'Next: open the handoff, send the message manually in WhatsApp, then confirm actual admission.':'WhatsApp admission has been manually confirmed.'));
  next.append(btn('Open Handoff',()=>openHandoff(id,d)));d.append(next);
  actions.append(btn('Manual WhatsApp handoff',()=>openHandoff(id,d)));
 }
 actions.append(btn('Add internal note',()=>{d.close();note('JOIN_REQUEST',id);}));d.append(actions);
 for(const key of ['assessments','requests','memberships','warnings','reports','blocks','audit','auditLogs','notes'])if(record[key])for(const item of record[key])d.append(details(key,item));
 }
 async function openHandoff(requestId, previousDialog) {
  try {
   const handoff=await api('join-requests/'+requestId+'/handoff');
   if(previousDialog?.open)previousDialog.close();
   const d=dialog('Manual WhatsApp handoff');d.setAttribute('data-copy-scope','');
   add(d,details('Approved applicant',{'Applicant name':handoff.fullName,'WhatsApp number':handoff.phone,'Approved group':handoff.group.name}),
    el('p',handoff.whatsappMembershipVerified?'Admission already recorded.':'Approved — waiting for WhatsApp admission',{class:'cm-success'}),
    el('p','Review the message, open WhatsApp and press Send yourself. Copying or opening WhatsApp does not record admission.'));
   if(handoff.inviteLink)d.append(details('Private group invitation',{'Invite link':handoff.inviteLink}));
   const messageBox=el('label',null,{class:'cm-field'}),messageText=el('textarea',null,{readonly:true,rows:14});messageText.value=handoff.approvalMessage;
   add(messageBox,el('span','Generated approval message'),messageText);d.append(messageBox);
   const live=el('p',null,{'data-copy-live':'',role:'status','aria-live':'polite',class:'cm-success'}),actions=el('div',null,{class:'cm-actions'});
   const copyMessage=btn('Copy message',()=>{});copyMessage.setAttribute('data-copy',handoff.approvalMessage);copyMessage.setAttribute('data-copy-label','Message');actions.append(copyMessage);
   if(handoff.inviteLink){const copyInvite=btn('Copy invite link',()=>{});copyInvite.setAttribute('data-copy',handoff.inviteLink);copyInvite.setAttribute('data-copy-label','Invite link');actions.append(copyInvite);}
   if(handoff.whatsappUrl)actions.append(el('a','Open WhatsApp',{href:handoff.whatsappUrl,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer',class:'btn btn-sm'}));
   else d.append(el('p','A valid international phone number is needed to open WhatsApp. You can still copy the message.',{class:'cm-muted'}));
   if(!handoff.whatsappMembershipVerified)actions.append(btn('Record actual admission',()=>{d.close();recordAdmission(requestId);}));
   add(d,actions,live,details('Handoff instructions',{'Handoff method':{STANDARD:'Standard – Send private invite link',MANUAL:'Manual – Admin adds member',CUSTOM:'Custom instructions'}[handoff.mode]||'Manual WhatsApp workflow',Instructions:handoff.instructions}));
  }catch(e){message(e.message,true);}
 }
 function recordAdmission(requestId){
  mutation('record admission','Confirm only after the applicant actually joins the WhatsApp group.',f=>toggle(f,'confirm','I have confirmed actual WhatsApp admission'),f=>{
   if(!checked(f,'confirm'))throw Error('Confirm actual admission first.');
   return api('join-requests/'+requestId+'/handoff-complete','POST',{admissionConfirmed:true});
  });
 }

 function note(targetType,targetId){mutation('add note','Internal notes are visible only to administrators.',f=>field(f,'body','Note',{type:'textarea',required:true,max:4000}),f=>api('notes','POST',{[{MEMBER:'memberId',JOIN_REQUEST:'requestId',REPORT:'reportId',GROUP:'groupId'}[targetType]]:targetId,body:value(f,'body')}));}
 function generatedGroupSlug(name){return String(name||'').trim().toLowerCase().replaceAll('ß','ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,160).replace(/-+$/g,'');}
 function groupForm(group={}){
  const creating=!group.id;let savedId=group.id,groupEdits=false;
  const form=mutation(creating?'Create Group':'Edit Group','Community / City Groups are managed here. Private course/batch groups stay in their existing module.',f=>{
   f.addEventListener('input',()=>{groupEdits=true;});f.addEventListener('change',()=>{groupEdits=true;});
   add(f,el('h3','Basic Information'),el('p','Group type: Community / City Group',{class:'cm-muted'}));
   const name=field(f,'name','Group name',{value:group.name,required:true,max:160});
   const slug=field(f,'slug','URL slug',{value:group.slug,required:true,max:160,hint:creating?'Generated from the group name. You may edit it. Must be unique.':'Changing the group name does not change this existing slug. Edit it explicitly if needed.'});
   let manualSlug=false;slug.addEventListener('input',()=>{manualSlug=true;});
   if(creating)name.addEventListener('input',()=>{if(!manualSlug)slug.value=generatedGroupSlug(name.value);});
   field(f,'city','City',{value:group.city,required:true,max:120});
   field(f,'description','Description',{type:'textarea',value:group.description,max:4000,hint:'Optional short public description.'});
   field(f,'community_name','WhatsApp community name',{value:group.community_name,max:160,hint:'Optional parent community name, maintained manually.'});
   if(group.id){const imageStatus=el('small',null,{class:'cm-muted',role:'status'});f.append(btn(group.has_image?'Change Group Image':'Add Group Image',()=>{if(groupEdits){imageStatus.textContent='Save these group changes before editing the image.';return;}f.closest('dialog').close();groupImageForm(group);}),imageStatus);}else f.append(el('small','Create the group first, then add its image from Group Details.',{class:'cm-muted'}));
   add(f,el('h3','Availability'));
   field(f,'status','Status',{choices:[['ACTIVE','Active'],['INACTIVE','Inactive'],['ARCHIVED','Archived']],value:group.status||'ACTIVE'});
   toggle(f,'is_public','List on public community page',creating?true:Boolean(group.is_public));f.append(el('small','When enabled, this group can appear on the public community page.',{class:'cm-muted'}));
   toggle(f,'accepting_applications','Accept applications',creating?true:Boolean(group.accepting_applications));f.append(el('small','When enabled, visitors can submit requests to join this group.',{class:'cm-muted'}));
   add(f,el('h3','WhatsApp Group Information'));
   const capacity=field(f,'approximate_capacity','Approximate capacity',{type:'number',value:group.approximate_capacity,min:1,maxNumber:100000,hint:'Optional. Used only for internal planning and capacity warnings.'});
   const count=field(f,'current_member_count','Current member count',{type:'number',value:group.current_member_count,min:0,maxNumber:100000,hint:'Optional manual count of members currently in the WhatsApp group.'});
   const countWarning=el('p',null,{class:'cm-muted',role:'status','aria-live':'polite'});f.append(countWarning);
   function warnCount(){countWarning.textContent=capacity.value&&count.value&&Number(count.value)>Number(capacity.value)?'The current member count exceeds the approximate capacity. This is informational; applications are not automatically rejected.':'';}
   capacity.addEventListener('input',warnCount);count.addEventListener('input',warnCount);warnCount();
   if(!group.has_invite_link)field(f,'inviteLink','Private WhatsApp invite link',{type:'url',max:512,hint:'Private group invitation link used only during the approved-member handoff. Never shown publicly.'+(group.has_invite_link?' A link is already stored; leave this field blank to keep it.':'')});
   if(group.has_invite_link)f.append(el('p','✓ Invite link configured. Use Private invite on the group detail to copy, replace or remove it.',{class:'cm-muted'}));
   add(f,el('h3','Handoff'));
   const method=field(f,'invite_delivery_mode','Handoff method',{choices:[['STANDARD','Standard – Send private invite link'],['MANUAL','Manual – Admin adds member'],['CUSTOM','Custom instructions']],value:creating?'STANDARD':group.handoff_method||((group.invite_delivery_mode==='STANDARD'||group.invite_delivery_mode==='CUSTOM')?group.invite_delivery_mode:group.instructions?'CUSTOM':group.has_invite_link?'STANDARD':'MANUAL')});
   const custom=field(f,'instructions','Custom handoff instructions',{type:'textarea',value:group.instructions,max:4000}),help=el('p',null,{class:'cm-muted'});f.append(help);
   function showMethod(){custom.parentNode.hidden=method.value!=='CUSTOM';custom.disabled=method.value!=='CUSTOM';custom.required=method.value==='CUSTOM';help.textContent=method.value==='STANDARD'?"Approved applicants receive this group's private invitation through the manual admin handoff. A private invite link is required. After they join, confirm their admission.":method.value==='MANUAL'?'The admin adds approved applicants manually. No invite link is needed. After they join, confirm their admission.':'These instructions are shown privately to admins during handoff.';}method.addEventListener('change',showMethod);showMethod();
   if(settings.group_policy==='CUSTOM'){
    add(f,el('h3','Additional Group Rules'));
    field(f,'custom_rules','Additional group rules',{type:'textarea',value:group.custom_rules,max:10000});
    field(f,'custom_rules_version','Group rules version',{value:group.custom_rules_version||'1.0',max:64,required:true,hint:'Increase when changing the group-specific rules.'});
   }
  },async f=>{
   const body={name:value(f,'name'),slug:value(f,'slug'),city:value(f,'city'),description:value(f,'description'),community_name:value(f,'community_name'),status:value(f,'status'),is_public:checked(f,'is_public'),accepting_applications:checked(f,'accepting_applications'),
    approximate_capacity:value(f,'approximate_capacity')===''?null:Number(value(f,'approximate_capacity')),current_member_count:value(f,'current_member_count')===''?null:Number(value(f,'current_member_count')),invite_delivery_mode:value(f,'invite_delivery_mode'),...(value(f,'invite_delivery_mode')==='CUSTOM'?{instructions:value(f,'instructions')}:{ }),
    ...(settings.group_policy==='CUSTOM'?{custom_rules:value(f,'custom_rules'),custom_rules_version:value(f,'custom_rules_version')}:{})};
   if(value(f,'inviteLink')?.trim())body.inviteLink=value(f,'inviteLink');
   const out=await api('groups'+(creating?'':'/'+group.id),creating?'POST':'PATCH',body);savedId=out.id;
  },async()=>{message(creating?'Group created.':'Group updated.');await groupDetail(savedId);});
  const submit=form.querySelector('button[type=submit]');submit.textContent=creating?'Create Group':'Save Group';submit.setAttribute('data-busy-label',creating?'Creating…':'Saving…');
  const actions=el('div',null,{class:'cm-actions'});submit.remove();add(actions,btn('Cancel',()=>form.closest('dialog').close()),submit);form.append(actions);
 }

 async function privateInvite(group){
  const d=dialog('Private WhatsApp Invite');d.setAttribute('data-copy-scope','');
  add(d,el('h3',group.name),el('p',group.has_invite_link?'✓ Invite link configured':'No private invite link configured.',{class:group.has_invite_link?'cm-success':'cm-muted'}),el('p','Invite links are stored securely.',{class:'cm-muted'}));
  const live=el('p',null,{'data-copy-live':'',role:'status','aria-live':'polite'}),actions=el('div',null,{class:'cm-actions'});add(d,actions,live);
  function editInvite(){
   d.close();const form=mutation(group.has_invite_link?'Replace invite link':'Add invite link','The stored invite is changed only when you save a valid new link.',f=>field(f,'invite','New WhatsApp group invite link',{type:'url',required:true,max:512}),f=>api('groups/'+group.id+'/invite-link','PUT',{inviteLink:value(f,'invite')}),async()=>{message('Private invite saved.');await privateInvite(await api('groups/'+group.id));});
   const save=form.querySelector('button[type=submit]');save.textContent='Save new invite';form.insertBefore(btn('Cancel',()=>form.closest('dialog').close()),save);
  }
  if(!group.has_invite_link){actions.append(btn('Add invite link',editInvite));return;}
  actions.append(btn('Replace invite link',editInvite),btn('Remove invite link',()=>{
   d.close();const form=mutation('Remove invite','Remove the private invite link for '+group.name+'?',()=>{},()=>api('groups/'+group.id+'/invite-link','DELETE',{confirm:true}),async()=>{message('Private invite removed.');await privateInvite(await api('groups/'+group.id));});
   const remove=form.querySelector('button[type=submit]');remove.textContent='Remove invite';form.insertBefore(btn('Cancel',()=>form.closest('dialog').close()),remove);
  }));
  try{
   const stored=await api('groups/'+group.id+'/invite-link');
   if(!d.open)return;
   if(!stored.inviteLink){live.textContent='The invite is no longer configured. Close and reopen to refresh.';return;}
   const copy=btn('Copy invite link',()=>{});copy.setAttribute('data-copy',stored.inviteLink);copy.setAttribute('data-copy-label','Invite link');
   const open=el('a','Open invite link',{href:stored.inviteLink,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer',class:'btn btn-sm'});
   const revealed=el('p',null,{class:'cm-pre',hidden:true}),show=btn('Show invite link',()=>{
    revealed.hidden=!revealed.hidden;revealed.textContent=revealed.hidden?'':stored.inviteLink;show.textContent=revealed.hidden?'Show invite link':'Hide invite link';
   });
   actions.prepend(copy,open,show);d.append(revealed);
  }catch(e){live.textContent=e.message;live.className='cm-error';}
 }

 function groupAvatar(group,small=false){
  const name=group.name||'',words=name.trim().split(/\s+/).filter(Boolean),initials=group.initials||(words.length>1?words[0][0]+words.at(-1)[0]:name.slice(0,2)).toUpperCase()||'?';
  const box=el('span',initials,{class:'cm-group-avatar'+(small?' cm-group-avatar-small':''),'aria-hidden':'true'});
  const url=group.imageUrl||(group.has_image?'/admin/community/api/groups/'+group.id+'/image?v='+new Date(group.image_updated_at).getTime():null);
  if(url&&/^\/(?:api\/community|admin\/community\/api)\/groups\/\d+\/image(?:\?v=\d+)?$/.test(url)){
   const image=el('img',null,{src:url,alt:'',width:256,height:256,loading:'lazy',decoding:'async',onerror:()=>image.remove()});box.textContent='';box.append(el('span',initials),image);
  }return box;
 }
 function friendlyDate(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(date);}
 async function resizeGroupImage(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
  if(file.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('That image could not be read.'));image.src=url;});
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const side=Math.min(image.width,image.height);
   canvas.getContext('2d').drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);
   const data=canvas.toDataURL(file.type,.85);if(data.length*.75>400*1024)throw Error('That image is too large. Choose a smaller image.');return data;
  }finally{URL.revokeObjectURL(url);}
 }
 function groupImageForm(group){
  const form=mutation('Update group image','Images are resized to a square and stored using the existing photo system. Active/public groups show this logo on the community page.',f=>field(f,'image','Group image',{type:'file',required:true}),async f=>{
   const file=f.elements.namedItem('image').files[0];await api('groups/'+group.id+'/image','PUT',{imageDataUrl:await resizeGroupImage(file)});
  },()=>groupDetail(group.id));
  form.elements.namedItem('image').accept='.jpg,.jpeg,.png,.webp';
  form.elements.namedItem('image').setAttribute('aria-label','Group image (JPG, JPEG, PNG or WebP)');
  form.querySelector('button[type=submit]').textContent='Save image';
 }
 function publicJoinUrl(group){const base=root.dataset.publicOrigin||'https://www.langnation.com';return base.replace(/\/$/,'')+'/community/join/'+encodeURIComponent(group.slug);}
 async function groupDetail(id){
  const g=await api('groups/'+id),d=dialog('Group details'),summary=el('div',null,{class:'cm-group-profile'}),heading=el('div');
  add(heading,el('h2',g.name),el('p',g.city),el('p','WhatsApp'+(g.community_name?' · '+g.community_name:''),{class:'cm-muted'}));
  if(g.current_member_count!==null&&g.current_member_count!==undefined)heading.append(el('p',g.current_member_count+' members · manually maintained',{class:'cm-muted'}));
  add(summary,groupAvatar(g),heading);d.append(summary);
  const flags=el('div',null,{class:'cm-actions'});add(flags,badge({ACTIVE:'Active',INACTIVE:'Inactive',ARCHIVED:'Archived'}[g.status]||g.status),badge(g.is_public?'Public':'Private'),badge(g.accepting_applications?'Applications open':'Applications closed'),badge(g.has_invite_link?'Invite configured':'Invite not configured'));d.append(flags);
  const actions=el('div',null,{class:'cm-actions'});
  add(actions,btn('Private Invite',()=>{d.close();privateInvite(g);}),btn('Edit Group',()=>{d.close();groupForm(g);}),btn('View Memberships',()=>{d.close();query={page:1,limit:20,groupId:id};resourceView('memberships').catch(e=>message(e.message,true));}),btn('Add Note',()=>{d.close();note('GROUP',id);}),btn(g.has_image?'Change Group Image':'Add Group Image',()=>{d.close();groupImageForm(g);}));
  if(g.has_image)actions.append(btn('Remove Group Image',()=>{d.close();mutation('Remove group image','Remove the image for '+g.name+'?',()=>{},()=>api('groups/'+id+'/image','DELETE',{confirm:true}),()=>groupDetail(id));}));d.append(actions);
  d.append(details('Group Information',{'Group name':g.name,City:g.city,Description:g.description||'—',Platform:'WhatsApp','Handoff method':{STANDARD:'Standard – Send private invite link',MANUAL:'Manual – Admin adds member',CUSTOM:'Custom instructions'}[g.handoff_method]||'Manual WhatsApp workflow','WhatsApp Community':g.community_name||'Not specified',Status:{ACTIVE:'Active',INACTIVE:'Inactive',ARCHIVED:'Archived'}[g.status],Visibility:g.is_public?'Public':'Private',Applications:g.accepting_applications?'Open':'Closed','Approximate capacity':g.approximate_capacity??'Not specified','Current members':g.current_member_count??'Not recorded',Invite:g.has_invite_link?'Configured':'Not configured',Created:friendlyDate(g.created_at),Updated:friendlyDate(g.updated_at)}));
  d.append(el('p','Member counts and images are manually maintained. WhatsApp membership is not synchronized. Open a stored invitation through Private Invite.',{class:'cm-muted'}));
  const joinLink=publicJoinUrl(g),joinCard=card('Public Join Link',el('a',joinLink,{href:joinLink,target:'_blank',rel:'noopener noreferrer',class:'cm-join-url'}));joinCard.setAttribute('data-copy-scope','');const joinActions=el('div',null,{class:'cm-actions'}),copyJoin=btn('Copy link',()=>{});copyJoin.setAttribute('data-copy',joinLink);copyJoin.setAttribute('data-copy-label','Join link');add(joinActions,copyJoin,el('a','Open public page',{href:joinLink,target:'_blank',rel:'noopener noreferrer',class:'btn btn-sm btn-ghost'}));add(joinCard,joinActions,el('p',null,{'data-copy-live':'',role:'status','aria-live':'polite'}),el('p',g.status==='ACTIVE'&&g.is_public&&g.accepting_applications?'Share this application link publicly. Availability also follows global community settings.':'This group is unavailable for public applications. Private or inactive groups return 404; public closed groups show a closed notice.',{class:'cm-muted'}));d.append(joinCard);
  const technical=el('details',null,{class:'cm-card'});add(technical,el('summary','Technical details'),details('Technical information',{'Database ID':g.id,'URL slug':g.slug,'Created timestamp':g.created_at,'Updated timestamp':g.updated_at}));d.append(technical);
 }

 function warning(memberId){mutation('issue warning','The policy recommends a level; an administrator makes the final moderation decision.',f=>{field(f,'memberId','Member ID',{type:'number',required:true,min:1,value:memberId});field(f,'groupId','Group',{choices:groupChoices(true)});field(f,'reportId','Related report ID',{type:'number',min:1});field(f,'level','Level',{choices:[['','Use configured progression'],'WARNING','FINAL_WARNING','REMOVAL_RECOMMENDED']});field(f,'reason','Reason',{type:'textarea',required:true,max:2000});},f=>api('warnings','POST',{memberId:Number(value(f,'memberId')),groupId:value(f,'groupId')?Number(value(f,'groupId')):null,reportId:value(f,'reportId')?Number(value(f,'reportId')):null,...(value(f,'level')?{level:value(f,'level')}:{}),reason:value(f,'reason')}));}
 function block(memberId){mutation('block member','Records an internal block. Perform any WhatsApp removal separately and manually.',f=>{field(f,'memberId','Member ID',{type:'number',required:true,min:1,value:memberId});field(f,'groupId','Originating group',{choices:groupChoices(true)});field(f,'reportId','Related report ID',{type:'number',min:1});field(f,'reason','Reason',{type:'textarea',required:true,max:2000});},f=>api('blocks','POST',{memberId:Number(value(f,'memberId')),groupId:value(f,'groupId')?Number(value(f,'groupId')):null,reportId:value(f,'reportId')?Number(value(f,'reportId')):null,reason:value(f,'reason')}));}
 async function memberDetail(id){const m=await api('members/'+id),d=dialog('Member #'+id);add(d,details('Member',m));const acts=el('div',null,{class:'cm-actions'});add(acts,btn('Edit name / city',()=>{d.close();mutation('edit member','Changes the central profile; previous application snapshots remain in the history.',f=>{field(f,'full_name','Name',{value:m.full_name,required:true,max:160});field(f,'city','City',{value:m.city,required:true,max:120});},f=>api('members/'+id,'PATCH',{full_name:value(f,'full_name'),city:value(f,'city')}));}),btn('Issue warning',()=>{d.close();warning(id);}),btn('Block',()=>{d.close();block(id);}),btn('Add note',()=>{d.close();note('MEMBER',id);}),btn('Export for privacy review',async()=>{try{const data=await api('members/'+id+'/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a','Download',{href:url,download:'community-member-'+id+'.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message,true);}}),btn('Anonymize',()=>{d.close();mutation('anonymize member','This permanently removes identifying community data. Review necessary moderation retention first. Active blocks must be resolved before anonymization.',f=>toggle(f,'confirm','I have reviewed this request and confirm anonymization'),f=>{if(!checked(f,'confirm'))throw Error('Confirmation required');return api('members/'+id+'/anonymize','POST',{confirm:true});});}));d.append(acts);
 for(const resource of ['memberships','join-requests','warnings','reports','blocks','notes']){const out=await api(resource+'?memberId='+id+'&limit=20');if(out.total)d.append(card(resource+' ('+out.total+')',table(resource,out.items)));}
 }
 function createReport(){mutation('create report','Paste only relevant content. No WhatsApp messages are extracted automatically.',f=>{field(f,'groupId','Group',{choices:groupChoices(),required:true});field(f,'memberId','Reported member ID (optional)',{type:'number',min:1});field(f,'category','Category',{choices:categories,required:true});field(f,'description','Description',{type:'textarea',min:15,required:true,max:4000});field(f,'quotedText','Relevant quoted text',{type:'textarea',max:4000});field(f,'severity','Severity',{choices:['NORMAL','HIGH','URGENT']});toggle(f,'approvedAdminPost','Verified official admin-approved post');field(f,'adminPostType','Official post type',{choices:['ANNOUNCEMENT','COURSE_PROMOTION','OFFICIAL_NOTICE']});},f=>api('reports','POST',{groupId:Number(value(f,'groupId')),memberId:value(f,'memberId')?Number(value(f,'memberId')):null,category:value(f,'category'),description:value(f,'description'),quotedText:value(f,'quotedText'),severity:value(f,'severity'),approvedAdminPost:checked(f,'approvedAdminPost'),adminPostType:value(f,'adminPostType')}));}
 async function reportDetail(id){const r=await api('reports/'+id),d=dialog('Report #'+id);add(d,details('Report',r),add(el('div',null,{class:'cm-actions'}),btn('Review / resolve',()=>{d.close();mutation('update report','Resolve or dismiss with a reason. Individual admin assignment is unavailable with the existing shared login.',f=>{field(f,'status','Status',{choices:['OPEN','REVIEW','RESOLVED','DISMISSED'],value:r.status});field(f,'severity','Severity',{choices:['NORMAL','HIGH','URGENT'],value:r.severity});field(f,'memberId','Reported member ID',{type:'number',min:1,value:r.reported_member_id});toggle(f,'approvedAdminPost','Verified official admin-approved post',Boolean(r.approved_admin_post));field(f,'adminPostType','Official post type',{choices:['ANNOUNCEMENT','COURSE_PROMOTION','OFFICIAL_NOTICE'],value:r.admin_post_type||'ANNOUNCEMENT'});field(f,'resolution','Resolution / review note',{type:'textarea',max:2000});},f=>api('reports/'+id,'PATCH',{status:value(f,'status'),severity:value(f,'severity'),memberId:value(f,'memberId')?Number(value(f,'memberId')):null,resolution:value(f,'resolution'),approvedAdminPost:checked(f,'approvedAdminPost'),adminPostType:value(f,'adminPostType')}));}),btn('Issue warning',()=>{d.close();warning(r.reported_member_id);}),btn('Add note',()=>{d.close();note('REPORT',id);})));}
 const columns={
  groups:[['id','ID'],['name','Group'],['city','City'],['current_member_count','Members (manual)'],['status','Status'],['accepting_applications','Applications']],
  members:[['id','ID'],['full_name','Name'],['normalized_phone','Phone'],['city','City'],['status','Status']],
  'join-requests':[['id','ID'],['full_name','Applicant'],['normalized_phone','Phone'],['group_id','Group'],['city','City'],['risk_score','Risk'],['recommendation','Recommendation'],['status','Status'],['created_at','Submitted']],
  reports:[['id','ID'],['group_id','Group'],['member_name','Reported member'],['category','Category'],['severity','Severity'],['status','Status'],['created_at','Reported']],
  warnings:[['id','ID'],['member_name','Member'],['group_id','Group'],['level','Level'],['reason','Reason'],['status','Status']],
  blocks:[['id','ID'],['member_name','Member'],['member_phone','Phone'],['reason','Reason'],['blocked_at','Blocked'],['unblocked_at','Unblocked']],
  memberships:[['id','ID'],['member_name','Member'],['group_id','Group'],['status','Recorded status'],['joined_at','Admission recorded']],
  'audit-logs':[['id','ID'],['action','Action'],['actor_kind','Actor'],['target_type','Target'],['target_id','Target ID'],['created_at','Time']],
  notes:[['id','ID'],['body','Note'],['actor_kind','Actor'],['created_at','Time']]
 };
 function table(resource,items){if(!items.length)return el('p','No records match these filters.',{class:'cm-muted'});const cols=columns[resource],tbl=el('table',null,{class:'cm-table'}),head=el('tr');for(const [,label]of cols)head.append(el('th',label,{scope:'col'}));head.append(el('th','Action',{scope:'col'}));tbl.append(add(el('thead'),head));const body=el('tbody');for(const row of items){const tr=el('tr');for(const [key]of cols){let val=row[key];if(key==='group_id')val=val?groupLabel(val):'—';if(key==='accepting_applications')val=val?'Open':'Closed';const cell=el('td');if(['status','recommendation','level'].includes(key))cell.append(badge(val));else if(key==='risk_score'&&val!==null&&val!==undefined){const risk=Number(val)<=settings.low_risk_threshold?'LOW':Number(val)>settings.high_risk_threshold?'HIGH':'REVIEW';add(cell,badge(risk),el('span',' '+val));}else if(resource==='groups'&&key==='name')add(cell,groupAvatar(row,true),el('span',val));else cell.textContent=val??'—';tr.append(cell);}const action=el('td');action.append(btn('View',async()=>{try{if(resource==='groups')await groupDetail(row.id);else if(resource==='members')await memberDetail(row.id);else if(resource==='join-requests')await requestDetail(row.id);else if(resource==='reports')await reportDetail(row.id);else {const d=dialog(resource+' #'+row.id);d.append(details('Record',await api(resource+'/'+row.id).catch(()=>row)));if(resource==='warnings'&&row.status==='ACTIVE')d.append(btn('Revoke warning',()=>{d.close();mutation('revoke warning','Marks this warning as revoked and updates the member summary.',()=>{},()=>api('warnings/'+row.id,'PATCH',{status:'REVOKED'}));}));if(resource==='blocks'&&!row.unblocked_at)d.append(btn('Unblock',()=>{d.close();mutation('unblock member','Removes the internal block. It does not add anyone to WhatsApp.',()=>{},()=>api('blocks/'+row.id+'/unblock','POST',{}));}));if(resource==='memberships')d.append(btn('Record status',()=>{d.close();mutation('record membership status','Record a status you have checked manually in WhatsApp.',f=>field(f,'status','Status',{choices:[['','Choose a recorded status'],'LEFT','REMOVED'],value:row.status,required:true}),f=>api('memberships/'+row.id,'PATCH',{status:value(f,'status')}));}));}}catch(e){message(e.message,true);}}));tr.append(action);body.append(tr);}tbl.append(body);return add(el('div',null,{class:'cm-table-wrap'}),tbl);}
 const statuses={groups:['ACTIVE','INACTIVE','ARCHIVED'],members:['PENDING','ACTIVE','WARNED','BLOCKED','LEFT','REMOVED','ANONYMIZED'],'join-requests':['PENDING','REVIEW','APPROVED','REJECTED'],reports:['OPEN','REVIEW','RESOLVED','DISMISSED'],warnings:['ACTIVE','REVOKED'],memberships:['PENDING','ACTIVE','WARNED','BLOCKED','LEFT','REMOVED']};
 let loadGeneration=0;
 async function resourceView(resource){const generation=++loadGeneration;content.setAttribute('aria-busy','true');const list=await api(resource+'?'+new URLSearchParams(query));if(generation!==loadGeneration)return;content.replaceChildren();const actions=el('div',null,{class:'cm-actions'});if(resource==='groups')actions.append(btn('Add group',()=>groupForm()));if(resource==='reports')actions.append(btn('Create report',createReport));if(resource==='warnings')actions.append(btn('Issue warning',()=>warning()));if(resource==='blocks')actions.append(btn('Block member',()=>block()));content.append(actions);const form=el('form',null,{class:'cm-filters'});
 if(['groups','members','join-requests'].includes(resource)){field(form,'search','Search name',{value:query.search,max:160});field(form,'city','City',{value:query.city,max:120});}
 if(statuses[resource])field(form,'status','Status',{choices:[['','All statuses'],...statuses[resource]],value:query.status});
 if(!['groups','members','audit-logs'].includes(resource))field(form,'groupId','Group',{choices:groupChoices(true),value:query.groupId});
 if(resource==='join-requests'){field(form,'risk','Risk',{choices:[['','All risks'],'LOW','REVIEW','HIGH'],value:query.risk});field(form,'recommendation','Recommendation',{choices:[['','All recommendations'],'APPROVE','REVIEW','REJECT'],value:query.recommendation});}
 if(resource==='blocks')field(form,'active','Blocks',{choices:[['true','Active'],['false','All']],value:query.active||'true'});
 field(form,'from','From',{type:'date',value:query.from});field(form,'to','To',{type:'date',value:query.to});
 add(form,el('button','Filter',{type:'submit'}),btn('Reset',()=>{query={page:1,limit:20};resourceView(resource).catch(e=>message(e.message,true));}));form.addEventListener('submit',event=>{event.preventDefault();query={page:1,limit:20,...Object.fromEntries([...new FormData(form)].filter(([,v])=>v!==''))};resourceView(resource).catch(e=>message(e.message,true));});content.append(form,table(resource,list.items));const pager=el('div',null,{class:'cm-pager'}),previous=btn('Previous',()=>{query.page=Math.max(1,query.page-1);resourceView(resource).catch(e=>message(e.message,true));}),next=btn('Next',()=>{query.page++;resourceView(resource).catch(e=>message(e.message,true));});previous.disabled=list.page<=1;next.disabled=list.page*list.limit>=list.total;add(pager,previous,el('span',list.total+' records · page '+list.page),next);content.append(pager);content.setAttribute('aria-busy','false');}
 function settingsView(){
  const f=el('form',null,{class:'cm-form cm-card cm-wide'}),defaults=settings.recommended_defaults||{};
  content.replaceChildren(f);
  add(f,el('h3','Rules & Settings'),el('p','Review settings opens a summary. Click Save settings in that summary to store your changes.'),el('p',settings.feature_enabled?'Community is enabled. Groups must also be ACTIVE and public; accepting applications requires both the global and group switches.':'Community is disabled. Saved rules and privacy notice remain visible on the public page; applications are closed.',{class:'cm-card'}));
  const controls={};
  for(const [key,label]of [['feature_enabled','Enable community'],['applications_enabled','Accept applications'],['public_reporting_enabled','Allow public reports']])controls[key]=toggle(f,key,label,Boolean(settings[key]));
  for(const [key,label]of [['rules_text','Full Community Rules'],['privacy_text','Privacy Notice']])controls[key]=field(f,key,label,{type:'textarea',value:settings[key]||defaults[key],required:true,max:10000});
  for(const [key,label]of [['rules_version','Rules version'],['privacy_version','Privacy notice version']])controls[key]=field(f,key,label,{value:settings[key]||'1.0',required:true,max:64,hint:'Increase the version when the corresponding text changes materially.'});
  add(f,el('h3','Screening'));
  controls.low_risk_threshold=field(f,'low_risk_threshold','Low-risk threshold',{type:'number',value:settings.low_risk_threshold??30,required:true,min:0,maxNumber:100,hint:'Applications with a risk score at or below this value are shown as low risk.'});
  controls.high_risk_threshold=field(f,'high_risk_threshold','High-risk threshold',{type:'number',value:settings.high_risk_threshold??60,required:true,min:0,maxNumber:100,hint:'Applications above this value are shown as high risk and should be reviewed carefully.'});
  const range=el('p',null,{class:'cm-muted'});f.append(range);
  function updateRange(){const low=Number(controls.low_risk_threshold.value),high=Number(controls.high_risk_threshold.value);range.textContent=`0–${low} Low risk · ${low+1}–${high} Manual review · ${high+1}–100 High risk`;}
  controls.low_risk_threshold.addEventListener('input',updateRange);controls.high_risk_threshold.addEventListener('input',updateRange);updateRange();
  controls.retention_days=field(f,'retention_days','Review stored applicant data after',{type:'number',value:settings.retention_days??180,required:true,min:1,maxNumber:3650,hint:'Days. This is a review reminder for administrators. Data is not deleted automatically.'});
  const retentionSummary=el('p',controls.retention_days.value+' days',{class:'cm-muted'});f.append(retentionSummary);controls.retention_days.addEventListener('input',()=>retentionSummary.textContent=controls.retention_days.value+' days');
  controls.patterns=field(f,'patterns','Advertisement phrases',{type:'textarea',value:(settings.screening_patterns?.length?settings.screening_patterns:defaults.screening_patterns||[]).join('\n'),max:20100,hint:'Add phrases commonly associated with unsolicited advertising. One phrase per line. A match may increase the risk score but must not automatically reject an applicant.'});
  controls.policy=field(f,'policy','Warning progression',{type:'textarea',value:(settings.warning_policy?.length?settings.warning_policy:['WARNING','FINAL_WARNING','REMOVAL_RECOMMENDED']).join('\n'),required:true,hint:'Warnings escalate progressively. Serious cases can be manually escalated by an administrator. At most five entries; no automatic blocking.'});
  add(f,el('h3','Group Policy'));
  controls.group_policy=field(f,'group_policy','Default group policy',{choices:[['INHERIT','Inherit global rules'],['CUSTOM','Allow custom rules per group']],value:settings.group_policy||'INHERIT',hint:'Custom group rules extend global rules. The applicant acknowledges the effective rules for the selected group.'});
  add(f,el('h3','Admin Promotional Posts'));
  const promotion=settings.admin_promotional_policy||{announcements:true,coursePromotions:true,exemptApprovedPosts:true};
  for(const [key,label]of [['announcements','Allow official admin announcements'],['coursePromotions','Allow LangNation/course promotions'],['exemptApprovedPosts','Exempt approved admin posts from advertisement detection']])controls[key]=toggle(f,key,label,Boolean(promotion[key]));
  add(f,el('p','Member advertising remains prohibited unless explicitly approved. Only an authenticated administrator can mark reported content as an approved official post. Applicants cannot claim this exemption.',{class:'cm-muted'}));
  controls.dashboard=toggle(f,'dashboard','Show dashboard notifications',Boolean(settings.notification_preferences?.dashboard));
  add(f,el('p','AI screening: OFF. WhatsApp connection: manual handoff. This page does not connect an API account or send messages.',{class:'cm-muted'}));
  if(defaults.rules_text)f.append(btn('Use recommended defaults',()=>{
    for(const [key,input]of Object.entries(controls)){
      if(['feature_enabled','applications_enabled','public_reporting_enabled','dashboard','announcements','coursePromotions','exemptApprovedPosts'].includes(key))input.checked=true;
      else if(key==='patterns')input.value=defaults.screening_patterns.join('\n');
      else if(key==='policy')input.value=defaults.warning_policy.join('\n');
      else if(key==='group_policy')input.value='INHERIT';
      else if(defaults[key]!==undefined)input.value=defaults[key];
    }
    for(const [contentKey,versionKey]of [['rules_text','rules_version'],['privacy_text','privacy_version']])if(settings[contentKey]!==controls[contentKey].value&&settings[versionKey]===controls[versionKey].value)controls[versionKey].value=nextVersion(settings[versionKey]);
    retentionSummary.textContent=controls.retention_days.value+' days';updateRange();message('Recommended defaults loaded into the form. Review and save to apply them.');
  }));
  add(f,el('button','Review settings',{type:'submit',class:'btn'}));
  f.addEventListener('submit',event=>{
    event.preventDefault();if(!f.reportValidity())return;
    const body={ai_enabled:false,default_handoff_mode:'MANUAL'};
    for(const k of ['feature_enabled','applications_enabled','public_reporting_enabled'])body[k]=checked(f,k);
    for(const k of ['rules_text','rules_version','privacy_text','privacy_version','group_policy'])body[k]=value(f,k);
    for(const k of ['low_risk_threshold','high_risk_threshold','retention_days'])body[k]=Number(value(f,k));
    for(const [textKey,versionKey]of [['rules_text','rules_version'],['privacy_text','privacy_version']])if(body[textKey]!==settings[textKey]&&body[versionKey]===settings[versionKey]){body[versionKey]=nextVersion(settings[versionKey]);controls[versionKey].value=body[versionKey];}
    body.screening_patterns=value(f,'patterns').split('\n').map(v=>v.trim()).filter(Boolean);body.warning_policy=value(f,'policy').split('\n').map(v=>v.trim()).filter(Boolean);
    body.notification_preferences={dashboard:checked(f,'dashboard'),applicantDelivery:'MANUAL'};
    body.admin_promotional_policy=Object.fromEntries(['announcements','coursePromotions','exemptApprovedPosts'].map(k=>[k,checked(f,k)]));
    const review=mutation('save settings','Review the changes below. They are not saved until you click Save settings.',form=>form.append(details('Settings summary',{
      'Community':body.feature_enabled?'Enabled':'Disabled','Applications':body.applications_enabled?'Enabled':'Disabled','Public reports':body.public_reporting_enabled?'Enabled':'Disabled',
      'Low-risk threshold':body.low_risk_threshold,'High-risk threshold':body.high_risk_threshold,'Warning progression':body.warning_policy.join(' → '),'Retention review':body.retention_days+' days',
      'Group policy':body.group_policy==='INHERIT'?'Inherit global rules':'Custom group extensions allowed','Official admin announcements':body.admin_promotional_policy.announcements?'Allowed':'Not allowed',
      'LangNation/course promotions':body.admin_promotional_policy.coursePromotions?'Allowed':'Not allowed','Approved admin post exemption':body.admin_promotional_policy.exemptApprovedPosts?'Enabled':'Disabled',
      'Dashboard notifications':body.notification_preferences.dashboard?'Enabled':'Disabled','Rules version':body.rules_version,'Privacy version':body.privacy_version,'AI':'Off','WhatsApp handoff':'Manual',
    })),()=>api('settings','PATCH',body));
    review.querySelector('button[type=submit]').textContent='Save settings';
  });
 }
 function nextVersion(version){const n=String(version).match(/^(\d+)(?:\.(\d+))?$/);return n?`${n[1]}.${Number(n[2]||0)+1}`:String(version).slice(0,48)+'-updated';}

 async function loadAdmin(){content.setAttribute('aria-busy','true');settings=await api('settings');const section=root.dataset.section;if(section==='settings'){settingsView();content.setAttribute('aria-busy','false');return;}groups=(await api('groups?limit=100')).items;if(section!=='overview'){await resourceView(section);return;}const overview=await api('overview');content.replaceChildren();if(!settings.feature_enabled)content.append(el('p','The public community is disabled. Configure rules, privacy and groups before enabling it.',{class:'cm-card'}));const tiles=el('div',null,{class:'cm-tiles'});for(const [key,label]of [['groups','Total Groups'],['activeMembers','Active Members'],['pendingRequests','Pending Requests'],['needsReview','Needs Review'],['openReports','Open Reports'],['warnedMembers','Warned Members'],['blockedMembers','Blocked Members']])tiles.append(add(el('div',null,{class:'cm-tile'}),el('strong',overview.counts[key]),el('span',label)));content.append(tiles,card('Recent Join Requests',table('join-requests',overview.recentRequests.items)),card('Unresolved Reports',table('reports',overview.unresolvedReports.items)),card('Recent Activity',table('audit-logs',overview.recentActivity.items)),card('Groups Near Capacity',...overview.groupsNearCapacity.map(g=>el('p',g.name+': '+g.current_member_count+' / '+g.approximate_capacity))));content.setAttribute('aria-busy','false');}
 const publicState={join:null,report:null};
 function inlineConfigured(parent,text){
  const pattern=/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g;let index=0,match;
  while((match=pattern.exec(text))){parent.append(document.createTextNode(text.slice(index,match.index)),el(match[3]?'code':'strong',match[1]||match[2]||match[3]));index=pattern.lastIndex;}
  parent.append(document.createTextNode(text.slice(index)));return parent;
 }
 function configuredText(text){
  const box=el('div',null,{class:'cm-policy-copy'});let list=null,item=null;
  for(const raw of String(text||'').replace(/\r/g,'').split('\n')){
   const line=raw.trim();if(!line){item=null;continue;}
   const heading=line.match(/^#{1,6}\s+(.+)$/),bullet=line.match(/^([-*]|\d+[.)])\s+(.+)$/);
   if(heading){box.append(inlineConfigured(el('h4'),heading[1]));list=null;item=null;continue;}
   if(bullet){const tag=/\d/.test(bullet[1])?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=el(tag);box.append(list);}item=el('li',null,tag==='ol'?{value:Number.parseInt(bullet[1],10)}:{});if(tag==='ol')item.append(inlineConfigured(el('strong'),bullet[2]));else inlineConfigured(item,bullet[2]);list.append(item);continue;}
   const paragraph=inlineConfigured(el('p'),line);if(item)item.append(paragraph);else{box.append(paragraph);list=null;}
  }return box;
 }
 function configuredSummary(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean),items=lines.filter(s=>/^(?:\d+[.)]|[-*])\s+/.test(s));
  if(items.length)return items.slice(0,8).map(s=>s.replace(/^(?:\d+[.)]|[-*])\s+/,'').replace(/\*\*|__/g,''));
  const first=lines.find(s=>!/^#/.test(s))||'';return first?[first.length>240?first.slice(0,237)+'…':first]:[];
 }
 function policySections(config){
  function panel(id,title,description,text,kind){
   const box=el('section',null,{class:'cm-card cm-policy cm-policy-'+kind,id}),summary=btn('',()=>consentPopup(title,text,null,summary)),heading=el('div',null,{class:'cm-policy-heading'});summary.classList.add('cm-policy-launch');summary.setAttribute('aria-haspopup','dialog');
   add(heading,el('h2',title),el('p',description,{class:'cm-muted'}));add(summary,el('span',null,{class:'cm-policy-icon','aria-hidden':'true'}),heading);
   const copy=configuredText(text);copy.classList.add('cm-policy-body');if(kind==='rules')copy.setAttribute('data-full-rules','');copy.hidden=true;add(box,summary,copy);return box;
  }
  const rules=panel('community-rules',tr('Community Rules','Community-Regeln'),tr('Please read and follow these rules to keep our community helpful, respectful and safe for everyone.','Bitte lies und befolge diese Regeln für eine hilfreiche, respektvolle und sichere Community.'),config.rules,'rules');
  const privacy=panel('community-privacy',tr('Privacy Notice','Datenschutzhinweis'),tr('How we use your information and your rights.','Wie wir deine Informationen verwenden und welche Rechte du hast.'),config.privacyNotice,'privacy');
  return {rules,privacy};
 }
 function revealPolicy(id){const panel=document.getElementById(id);if(!panel)return;panel.open=true;const full=panel.querySelector('[data-full-rules]');if(full)full.open=true;panel.scrollIntoView({block:'start',behavior:'smooth'});panel.querySelector('summary')?.focus();}
 function consentPopup(title,text,input,trigger){
  const d=dialog(title);d.classList.add('ln-dialog-wide','cm-consent-dialog');const pane=el('div',null,{class:'terms-scroll',tabindex:'0','aria-label':title}),progress=el('p',null,{class:'field-hint',role:'status','aria-live':'polite'}),actions=el('div',null,{class:'cm-actions'});
  const policyCopy=configuredText(text);policyCopy.classList.add('cm-popup-policy');for(const item of policyCopy.querySelectorAll('li')){const title=item.firstChild?.textContent||item.textContent;item.setAttribute('data-rule-icon',/advert|promotion|werbung/i.test(title)?'ban':/link|invitation|einladung/i.test(title)?'link':/event|veranstaltung/i.test(title)?'calendar':/spam|scam|privacy|datenschutz/i.test(title)?'shield':'people');}pane.append(policyCopy);if(!input){add(d,pane);d.classList.add('cm-policy-read');d.addEventListener('close',()=>trigger?.focus());return d;}const accept=btn(tr('I accept','Ich akzeptiere'),()=>{if(accept.disabled)return;input.checked=true;d.close();}),decline=btn(tr('Decline','Ablehnen'),()=>{input.checked=false;d.close();});accept.classList.add('btn');decline.classList.add('btn','btn-ghost');accept.disabled=true;
  add(actions,accept,decline);add(d,el('p',tr('Scroll to the end to accept.','Zum Akzeptieren bis zum Ende scrollen.'),{class:'cm-muted'}),pane,progress,actions);
  function measure(){const end=pane.scrollTop+pane.clientHeight>=pane.scrollHeight-24;if(end){accept.disabled=false;progress.textContent=tr('You have reached the end. You can accept now.','Du hast das Ende erreicht und kannst jetzt akzeptieren.');}else{progress.textContent=tr('Please read to the end — ','Bitte bis zum Ende lesen — ')+Math.min(99,Math.round((pane.scrollTop+pane.clientHeight)/pane.scrollHeight*100)||0)+'%';}}
  pane.addEventListener('scroll',measure);d.addEventListener('close',()=>trigger?.focus());if(typeof requestAnimationFrame==='function')requestAnimationFrame(measure);else setTimeout(measure,0);if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(measure);observer.observe(pane);d.addEventListener('close',()=>observer.disconnect());}return d;
 }
 function acknowledge(fields,name,before,linkText,id,noticeText){
  const label=el('label',null,{class:'cm-checkbox cm-form-wide'}),input=el('input',null,{type:'checkbox',name,required:true});
  const link=el('a',linkText,{href:'#'+id,onclick:event=>{event.preventDefault();consentPopup(id==='community-rules'?tr('Community Rules','Community-Regeln'):tr('Privacy Notice','Datenschutzhinweis'),noticeText(),input,link);}});
  input.addEventListener('click',event=>{if(!input.checked)return;event.preventDefault();input.checked=false;consentPopup(id==='community-rules'?tr('Community Rules','Community-Regeln'):tr('Privacy Notice','Datenschutzhinweis'),noticeText(),input,input);});
  add(label,input,el('span',before+' '),link);fields.append(label);return input;
 }
 async function loadPublic(draft={},reopen=false){
  const hero=root.querySelector('[data-community-join]'),heroState=root.querySelector('[data-community-availability]');if(hero)hero.hidden=true;
  content.setAttribute('aria-busy','true');const [config,groups]=await Promise.all([api('config'),api('groups')]);content.replaceChildren();content.setAttribute('aria-busy','false');publicState.join=null;publicState.report=null;
  const accepting=config.enabled&&config.applicationsEnabled?groups.filter(g=>g.acceptingApplications):[],canApply=accepting.length>0;
  if(hero){hero.hidden=!canApply;hero.onclick=event=>{event.preventDefault();publicState.join?.open(accepting.length===1?accepting[0].id:null);};}
  if(heroState){heroState.hidden=canApply;heroState.textContent=tr('Applications are currently closed.','Anfragen sind derzeit geschlossen.');}
  if(!config.enabled)content.append(el('p',tr('The community is not currently accepting applications.','Die Community nimmt derzeit keine Anfragen an.'),{class:'cm-muted'}));
  const policies=policySections(config);const policyRow=el('div',null,{class:'cm-policy-links'});add(policyRow,policies.rules,policies.privacy);content.append(policyRow);const groupHeading=el('div',null,{class:'cm-group-section-heading'});add(groupHeading,add(el('div'),el('h2',tr('Available Groups','Verfügbare Gruppen')),el('p',tr('Join your local community group on WhatsApp and connect with people in your city.','Finde deine lokale WhatsApp-Community und vernetze dich in deiner Stadt.'))),add(el('aside',null,{class:'cm-whatsapp-note'}),el('span',null,{class:'cm-wa-icon','aria-hidden':'true'}),el('p',tr('These are WhatsApp groups. Join to connect, ask questions and exchange useful information.','Dies sind WhatsApp-Gruppen zum Vernetzen, Fragenstellen und Informationsaustausch.'))));content.append(groupHeading);
  if(!groups.length)content.append(el('p',tr('No public groups are available yet.','Noch keine öffentlichen Gruppen verfügbar.'),{class:'cm-muted'}));
  const list=el('div',null,{class:'cm-public-groups'});
  for(const g of groups){
   const text=el('div',null,{class:'cm-public-group-copy'});add(text,el('h3',g.name),el('p',g.city,{class:'cm-group-city'}));if(g.description){text.append(el('p',g.description.length>260?g.description.slice(0,257)+'…':g.description));if(g.description.length>260){const more=el('details');add(more,el('summary',tr('More about this group','Mehr über diese Gruppe')),el('p',g.description));text.append(more);}}
   const meta=el('div',null,{class:'cm-group-meta'});if(Number.isFinite(g.memberCount))meta.append(el('span',g.memberCount+' '+tr('members','Mitglieder')));if(g.communityName)meta.append(el('span',tr('Part of: ','Teil von: ')+g.communityName));text.append(meta);
   const groupCard=el('article',null,{class:'cm-card cm-public-group'}),cover=el('div',null,{class:'cm-group-cover'});const avatar=groupAvatar(g);const source=/^\/img\/community\/covers\/(?:cities\/|groups\/)?[a-z0-9-]+\.(?:webp|jpe?g|png)$/.test(g.coverImageUrl||'')?g.coverImageUrl:'/img/community/covers/default.webp';const coverPhoto=el('img',null,{src:source,alt:'',loading:'lazy'});coverPhoto.addEventListener('error',()=>{if(coverPhoto.getAttribute('src')!=='/img/community/covers/default.webp')coverPhoto.setAttribute('src','/img/community/covers/default.webp');else coverPhoto.remove();});cover.append(coverPhoto);cover.append(el('span',g.city,{class:'cm-cover-city'}));const profile=el('div',null,{class:'cm-public-profile'});add(profile,avatar,el('span',null,{class:'cm-wa-icon','aria-hidden':'true'}));add(groupCard,cover,profile,text);
   if(config.enabled&&config.applicationsEnabled&&g.acceptingApplications){const apply=btn(tr('Request to Join','Beitritt anfragen'),()=>publicState.join?.open(g.id));apply.classList.add('btn');apply.setAttribute('aria-controls','community-join');apply.setAttribute('aria-expanded','false');groupCard.append(apply);}
   else groupCard.append(el('span',tr('Applications closed','Anfragen geschlossen'),{class:'cm-badge'}));list.append(groupCard);
  }content.append(list);
  if(canApply)publicState.join=publicForm('join-requests',config,accepting,draft);
  if(config.enabled&&config.publicReportingEnabled&&groups.length){
   const reportCard=card(tr('Need to report something?','Möchtest du etwas melden?'),el('p',tr('If you notice spam, advertising, scams or another community-rule violation, you can report it to the administrators.','Spam, Werbung, Betrugsversuche und andere Regelverstöße können der Administration gemeldet werden.')));
   reportCard.classList.add('cm-report-summary');const action=btn(tr('Report a concern','Ein Anliegen melden'),()=>publicState.report?.open(null));action.classList.add('btn','btn-sm','btn-ghost');action.setAttribute('aria-controls','community-report');action.setAttribute('aria-expanded','false');reportCard.append(action);content.append(reportCard);publicState.report=publicForm('reports',config,groups,{},action);
  }
  if(reopen&&publicState.join)publicState.join.open(draft.groupId||null);
  else if(root.dataset.joinTarget){let target;try{target=JSON.parse(root.dataset.joinTarget);}catch{}if(target){const group=groups.find(g=>g.slug===target.slug&&Number(g.id)===Number(target.id));if(config.enabled&&config.applicationsEnabled&&group?.acceptingApplications&&publicState.join){publicState.join.open(group.id);}else{if(hero)hero.hidden=true;if(heroState){heroState.hidden=false;heroState.textContent=group?tr('Applications for ','Anfragen für ')+group.name+tr(' are currently closed.',' sind derzeit geschlossen.'):tr('This group is currently unavailable for applications.','Diese Gruppe ist derzeit nicht für Anfragen verfügbar.');}}}}
 }
 function phoneCountries(){try{return JSON.parse(root.dataset.countries||'[]');}catch{return [];}}
 function suggestedPhoneCountry(countries){
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;const zones={'Europe/Berlin':'DE','Europe/Vienna':'AT','Europe/Zurich':'CH','Europe/London':'GB','Asia/Kolkata':'IN','Asia/Calcutta':'IN','Asia/Karachi':'PK','Asia/Dhaka':'BD','Asia/Kathmandu':'NP','Asia/Colombo':'LK','America/New_York':'US','America/Los_Angeles':'US','Europe/Paris':'FR','Europe/Rome':'IT','Europe/Madrid':'ES','Asia/Dubai':'AE','Australia/Sydney':'AU'};
  if(countries.some(c=>c.code===zones[timezone]))return zones[timezone];
  try{const region=new Intl.Locale(typeof navigator!=='undefined'?navigator.language:'en').region;if(countries.some(c=>c.code===region))return region;}catch{}
  return 'DE';
 }
 function internationalPhone(number,country){const clean=String(number||'').trim();if(clean.startsWith('+'))return clean;if(clean.startsWith('00'))return '+'+clean.slice(2);return '+'+String(country?.dial||'49')+clean.replace(/^0/,'');}
 function publicForm(kind,config,groups,draft={},opener=null){
  const join=kind==='join-requests',id=join?'community-join':'community-report',box=card(join?tr('Request to join','Beitritt anfragen'):tr('Report a concern','Ein Anliegen melden'));
  box.id=id;box.hidden=true;box.classList.add('cm-application');box.tabIndex=-1;
  const f=el('form',null,{class:'cm-form'}),fields=el('fieldset',null,{class:'cm-public-fields'}),status=el('p',null,{role:'status','aria-live':'polite'}),banner=el('div',null,{class:'cm-applying cm-form-wide'});
  const close=btn(tr('Close form','Formular schließen'),()=>{box.hidden=true;root.querySelectorAll('[aria-controls="'+id+'"]').forEach(control=>control.setAttribute('aria-expanded','false'));if(opener)opener.setAttribute('aria-expanded','false');document.getElementById('community-rules')?.querySelector('summary')?.focus();});const heading=box.querySelector('h3'),header=el('div',null,{class:'cm-heading'});heading.remove();add(header,heading,close);box.prepend(header);
  add(box,f);f.append(fields);content.append(box);
  if(join){fields.append(banner);field(fields,'fullName',tr('Full name','Vollständiger Name'),{required:true,max:160,value:draft.fullName});const countries=phoneCountries(),saved=String(draft.phone||'').replace(/[^+0-9]/g,''),matched=saved.startsWith('+')?[...countries].sort((a,b)=>b.dial.length-a.dial.length).find(c=>saved.startsWith('+'+c.dial)):null;
   field(fields,'phoneCountry',tr('Country code','Ländervorwahl'),{choices:(countries.length?countries:[{code:'DE',dial:'49',en:'Germany',de:'Deutschland'}]).map(c=>[c.code,tr(c.en,c.de)+' (+'+c.dial+')']),required:true,value:matched?.code||suggestedPhoneCountry(countries),hint:tr('Suggested from your browser region/time zone. Please check.','Aus Browserregion/Zeitzone vorgeschlagen. Bitte prüfen.')});
   field(fields,'phone',tr('WhatsApp number','WhatsApp-Nummer'),{type:'tel',required:true,max:40,value:draft.phone,hint:tr('Enter your number; a complete +country-code number also works.','Nummer eingeben; eine vollständige Nummer mit +Ländervorwahl ist ebenfalls möglich.')});field(fields,'city',tr('City / current location','Stadt / aktueller Ort'),{required:true,max:120,value:draft.city});}
  const select=field(fields,'groupId',tr('Community group','Community-Gruppe'),{choices:[['',tr('Choose a group','Gruppe auswählen')],...groups.map(g=>[g.id,g.name])],required:true,value:groups.some(g=>Number(g.id)===Number(draft.groupId))?draft.groupId:''});
  const custom=el('div',null,{class:'cm-card cm-form-wide',hidden:true});if(join)fields.append(custom);
  if(join){const reason=field(fields,'reason',tr('Why would you like to join?','Warum möchtest du beitreten?'),{type:'textarea',required:true,max:2000,value:draft.reason,hint:tr('At least 15 characters. Please do not include sensitive personal data.','Mindestens 15 Zeichen. Bitte keine sensiblen persönlichen Daten angeben.')});reason.parentNode.classList.add('cm-form-wide');field(fields,'referralSource',tr('How did you hear about us? (optional)','Wie hast du von uns erfahren? (optional)'),{max:200,value:draft.referralSource});}
  else{const labels={ADVERTISEMENT:tr('Advertisement','Werbung'),REPEATED_PROMOTION:tr('Repeated promotion','Wiederholte Werbung'),SPAM:'Spam',SCAM_CONCERN:tr('Scam concern','Betrugsverdacht'),HARASSMENT:tr('Harassment','Belästigung'),INAPPROPRIATE_CONTENT:tr('Inappropriate content','Unangemessener Inhalt'),OTHER:tr('Other','Sonstiges')};field(fields,'category',tr('Category','Kategorie'),{choices:[['',tr('Choose a category','Kategorie auswählen')],...categories.map(category=>[category,labels[category]])],required:true});field(fields,'description',tr('Describe your concern','Beschreibe dein Anliegen'),{type:'textarea',required:true,max:4000});field(fields,'quotedText',tr('Relevant quoted text (optional)','Relevanter zitierter Text (optional)'),{type:'textarea',max:4000});field(fields,'reporterContact',tr('Contact for follow-up (optional)','Kontakt für Rückfragen (optional)'),{max:200});}
  const rules=join?acknowledge(fields,'rulesAccepted',tr('I agree to the','Ich stimme zu:'),tr('community rules','Community-Regeln'),'community-rules',()=>config.rules+(selected()?.customRules?'\n\n'+selected().customRules:'')):null;
  const privacy=acknowledge(fields,'privacyAccepted',tr('I acknowledge the','Ich habe gelesen:'),tr('privacy notice','Datenschutzhinweis'),'community-privacy',()=>config.privacyNotice);
  const honeypot=field(fields,'website','Website',{value:'',max:200});honeypot.parentNode.className='cm-honeypot';honeypot.tabIndex=-1;honeypot.autocomplete='off';honeypot.parentNode.setAttribute('aria-hidden','true');
  function selected(){return groups.find(g=>Number(g.id)===Number(select.value));}
  function selectionChanged(){if(!join)return;const g=selected();banner.replaceChildren(el('span',g?tr('Applying for: ','Anfrage für: ')+g.name:tr('Choose the community group you would like to join.','Bitte eine Community-Gruppe auswählen.')));if(g)banner.append(btn(tr('Change group','Gruppe ändern'),()=>select.focus()));custom.replaceChildren();custom.hidden=!g?.customRules;if(g?.customRules)add(custom,el('h4',tr('Additional group rules','Zusätzliche Gruppenregeln')),configuredText(g.customRules));rules.checked=false;}
  select.addEventListener('change',selectionChanged);selectionChanged();
  const submit=el('button',join?tr('Submit request','Anfrage senden'):tr('Submit report','Meldung senden'),{type:'submit',class:'btn'});add(f,status,submit);let pending=false,completed=false;
  f.addEventListener('submit',async event=>{
   event.preventDefault();if(pending||!f.reportValidity())return;if(!privacy.checked||(join&&!rules.checked)){status.textContent=tr('Please acknowledge the current rules and privacy notice.','Bitte die aktuellen Regeln und den Datenschutzhinweis bestätigen.');status.className='cm-error';return;}
   const g=selected(),body={groupId:Number(select.value),privacyAccepted:true,privacyVersion:config.privacyVersion,website:value(f,'website')};for(const name of join?['fullName','phone','city','reason','referralSource']:['category','description','quotedText','reporterContact'])body[name]=value(f,name);if(join){body.phone=internationalPhone(body.phone,phoneCountries().find(c=>c.code===value(f,'phoneCountry')));body.rulesAccepted=true;body.rulesVersion=g?.rulesVersion||config.rulesVersion;}
   pending=true;fields.disabled=true;submit.disabled=true;status.className='';status.textContent=tr('Submitting…','Wird gesendet…');
   try{await api(kind,'POST',body);const success=card(join?tr('Request received','Anfrage empfangen'):tr('Report received','Meldung empfangen'));
    success.setAttribute('role','status');success.classList.add('cm-received');
    if(join)add(success,el('p',tr('Thank you. Your request to join ','Vielen Dank. Deine Beitrittsanfrage für ')+(g?.name||'')+tr(' has been received.',' wurde empfangen.')),el('p',tr('Our community administrators will review it. Submitting a request does not automatically add you to the WhatsApp group.','Die Community-Administration wird sie prüfen. Eine Anfrage fügt dich nicht automatisch zur WhatsApp-Gruppe hinzu.')),el('p',tr('If approved, you will receive the next joining instructions.','Bei einer Genehmigung erhältst du die nächsten Schritte zum Beitritt.')));
    else success.append(el('p',tr('Your report has been received and will be reviewed.','Deine Meldung wurde empfangen und wird geprüft.')));
    completed=true;box.replaceChildren(success);box.focus();
   }catch(error){status.textContent=error.message;status.className='cm-error';if(join&&[409,503].includes(error.status)){try{await loadPublic(body,true);message(tr('Availability or notices changed. Please review and acknowledge them again.','Verfügbarkeit oder Hinweise haben sich geändert. Bitte erneut lesen und bestätigen.'),true);}catch{status.textContent=tr('Unable to refresh. Keep this page open and try again later.','Aktualisierung fehlgeschlagen. Diese Seite offen lassen und später erneut versuchen.');}}}
   finally{pending=false;fields.disabled=false;submit.disabled=false;}
  });
  return {element:box,open(groupId){if(pending)return;if(completed){const fresh=publicForm(kind,config,groups,{},opener);box.replaceWith(fresh.element);if(join)publicState.join=fresh;else publicState.report=fresh;fresh.open(groupId);return;}box.hidden=false;root.querySelectorAll('[aria-controls="'+id+'"]').forEach(control=>control.setAttribute('aria-expanded','true'));if(opener)opener.setAttribute('aria-expanded','true');select.value=groupId&&groups.some(g=>Number(g.id)===Number(groupId))?String(groupId):'';selectionChanged();box.scrollIntoView({block:'start',behavior:'smooth'});const first=f.elements.namedItem(join?'fullName':'groupId');if(first?.isConnected)first.focus({preventScroll:true});else box.focus();}};
 }

 async function start(){try{if(admin)await loadAdmin();else await loadPublic();}catch(e){content.setAttribute('aria-busy','false');content.replaceChildren(card(tr('Community unavailable','Community nicht verfügbar'),el('p',e.message),btn(tr('Try again','Erneut versuchen'),start)));message(tr('The community could not be loaded.','Die Community konnte nicht geladen werden.'),true);}}
 start();
})();

// The same native collapsible menus in every student material section.
(() => {
 const tools=document.querySelector('.material-mobile-tools');
 if(!tools&&!document.querySelector('[data-responsive-menu]'))return;
 const portalMenu=document.querySelector('.sp-global-nav'),portalButton=document.querySelector('[data-portal-nav-toggle]'),compact=matchMedia('(max-width: 900px)');
 const menus=[...document.querySelectorAll('[data-responsive-menu]')];
 for(const menu of menus){const media=matchMedia('(max-width: '+menu.dataset.menuBreakpoint+'px)');const sync=()=>{menu.open=!media.matches;};sync();media.addEventListener('change',sync);menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&media.matches&&menu.open){event.preventDefault();menu.open=false;(menu===portalMenu&&portalButton?portalButton:menu.querySelector('summary'))?.focus();}});}
 if(portalMenu&&portalButton){
  portalMenu.classList.add('has-header-toggle');
  function syncButton(){portalButton.hidden=!compact.matches;portalButton.setAttribute('aria-expanded',String(compact.matches&&portalMenu.open));}
  portalButton.addEventListener('click',()=>{portalMenu.open=!portalMenu.open;syncButton();});
  portalButton.addEventListener('keydown',event=>{if(event.key==='Escape'&&portalMenu.open){event.preventDefault();portalMenu.open=false;syncButton();}});
  portalMenu.addEventListener('toggle',syncButton);compact.addEventListener('change',syncButton);syncButton();
  document.addEventListener('click',event=>{if(compact.matches&&portalMenu.open&&!portalMenu.contains(event.target)&&!portalButton.contains(event.target)){portalMenu.open=false;syncButton();}});
 }
 // Sticky lesson navigation remains visible below the header when jumping to a question.
 if(tools){const measure=()=>document.documentElement.style.setProperty('--material-tools-h',Math.ceil(tools.getBoundingClientRect().height)+'px');new ResizeObserver(measure).observe(tools);measure();}
})();

/* CLASS-LINK-TRACKING: Opening the room is native link navigation.
   Attendance is a separate same-origin POST and cannot block the new tab. */
(function classLinkTracking() {
  "use strict";
  document.querySelectorAll("a[data-class-action]").forEach(function (link) {
    let pending = false;
    link.addEventListener("click", function (event) {
      if (event.button !== 0 || pending || event.defaultPrevented) return;
      // No preventDefault/window.open: the user gesture follows target=_blank.
      const action = new URL(link.dataset.classAction, location.origin);
      if (action.origin !== location.origin) return;
      pending = true;
      fetch(action.href, {
        method: "POST", credentials: "same-origin", redirect: "error", keepalive: true,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({ _csrf: link.dataset.classCsrf || "" }).toString()
      }).then(function (response) {
        if (!response.ok) throw new Error("Attendance was not saved");
        return response.json();
      }).then(function (result) {
        if (!result.ok) throw new Error("Attendance was not saved");
        const notice = link.parentElement.querySelector("[data-class-notice]");
        if (notice) notice.remove();
      }).catch(function () {
        let notice = link.parentElement.querySelector("[data-class-notice]");
        if (!notice) {
          notice = document.createElement("p"); notice.dataset.classNotice = "";
          notice.className = "notice notice-bad"; notice.setAttribute("role", "alert");
          link.parentElement.appendChild(notice);
        }
        notice.textContent = "Attendance could not be saved. You can still use the class link; please tell your teacher or contact the office.";
      }).finally(function () { pending = false; });
    });
  });
})();
/* END CLASS-LINK-TRACKING */
