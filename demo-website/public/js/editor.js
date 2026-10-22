/* ═══════════════════════════════════════════════════════════════════
   A small editor for the course content boxes.

   The four tabs of a course page are stored as HTML and were edited as
   HTML, in a plain textarea. That is fine for whoever wrote it and no
   use at all to anybody else: the Description box opens on nine
   visible lines of `<p yackocpvbhs="" 0",="" _fb_="" auto;="">`, which
   is what a paste out of Word left behind years ago, and the actual
   sentence is somewhere past it.

   No library. The Content-Security-Policy on this site allows scripts
   from 'self' only, so a CDN editor is blocked before it loads, and
   there is no build step to vendor one through. contenteditable plus
   execCommand is deprecated and works in every browser this will meet,
   which for a back office two people use is the right trade.

   ── The one rule that matters ────────────────────────────────────────

   A box nobody edits is submitted byte for byte as it arrived.

   The editor never writes back to the textarea until its field has
   actually been typed in. Round-tripping HTML through contenteditable
   normalises it — quotes, attribute order, empty tags, the hand-written
   tables in Curriculum — so a page that syncs on load would silently
   rewrite all four sections of every course the first time anybody
   opened it to fix a typo in the title. Nothing here touches content
   somebody did not touch.

   Source view is always one click away, because the tables in these
   pages were written by hand and are easier to fix as text.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var boxes = Array.prototype.slice.call(document.querySelectorAll("textarea[data-rich]"));
  if (!boxes.length) return;

  // execCommand is the whole mechanism. Without it the textareas stay
  // exactly as they are, which is the state this page shipped in for a
  // year — a worse editor, not a broken one.
  if (!document.execCommand || !document.queryCommandSupported) return;

  /* Bold as <strong>, not <span style="font-weight:bold">.

     The default in several browsers is the span, which puts back
     exactly the kind of inline styling the paste cleaner exists to take
     out — and the course page has its own stylesheet that such a span
     then argues with. Asked once; browsers that do not know the command
     throw, and they are the ones that already use tags. */
  try {
    document.execCommand("styleWithCSS", false, false);
  } catch (e) {
    /* nothing to do: the default is what we wanted anyway */
  }

  var BLOCKS = [
    { label: "Text", tag: "p", title: "Ordinary paragraph" },
    { label: "Heading", tag: "h3", title: "A heading inside the tab" },
    { label: "Sub-heading", tag: "h4", title: "A smaller heading under it" },
  ];

  var MARKS = [
    { cmd: "bold", label: "B", title: "Bold (Ctrl+B)", style: "font-weight:700" },
    { cmd: "italic", label: "I", title: "Italic (Ctrl+I)", style: "font-style:italic" },
    { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
    { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
    { cmd: "formatBlock:blockquote", label: "❝", title: "Quote" },
  ];

  /* Ids are only needed to point a label at its textarea, and only
     when the markup did not already give one. */
  var seq = 0;

  boxes.forEach(build);

  function build(area) {
    var wrap = document.createElement("div");
    wrap.className = "rt";
    area.parentNode.insertBefore(wrap, area);

    var bar = document.createElement("div");
    bar.className = "rt-bar";
    wrap.appendChild(bar);

    var page = document.createElement("div");
    page.className = "rt-page";
    page.contentEditable = "true";
    page.spellcheck = true;
    page.innerHTML = area.value;
    wrap.appendChild(page);

    // The textarea stays in the form and stays the field that is
    // submitted. It is moved inside the wrapper so Source view can show
    // it in the same place the page was.
    wrap.appendChild(area);
    area.classList.add("rt-source");
    area.hidden = true;

    /* A caption that steals the caret.

       A <label> with no `for` attaches itself to the first LABELLABLE
       control inside it. The textarea is hidden, so the browser skips
       it and settles on the next one — which, once this editor has
       built its toolbar, is the block-format <select>. Clicking into
       the text put focus on that dropdown, and the next letter typed
       picked an option from it: typing a word beginning with H turned
       the box into a Heading.

       Pointing the label at the textarea by id stops it. The textarea
       cannot take focus while it is hidden, so clicking the caption
       does nothing at all, which is what clicking a caption should do.

       The surface takes the caption's words as its own name, because a
       contenteditable div has none otherwise and the <label> is now
       pointing somewhere invisible. */
    var label = area.closest ? area.closest("label") : null;
    if (label) {
      if (!area.id) area.id = "rt-" + (seq += 1);
      label.htmlFor = area.id;
      var caption = label.querySelector("span");
      if (caption && caption.textContent.trim()) {
        page.setAttribute("aria-label", caption.textContent.trim());
      }
    }

    var touched = false;
    var sourceOn = false;

    function sync() {
      if (!touched) return;
      area.value = tidy(page.innerHTML);
    }

    // ── the toolbar ──────────────────────────────────────────────────
    var picker = document.createElement("select");
    picker.className = "rt-pick";
    picker.title = "Paragraph or heading";
    BLOCKS.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.tag;
      o.textContent = b.label;
      o.title = b.title;
      picker.appendChild(o);
    });
    picker.addEventListener("change", function () {
      run("formatBlock", picker.value);
    });
    bar.appendChild(picker);

    MARKS.forEach(function (m) {
      var parts = m.cmd.split(":");
      bar.appendChild(button(m.label, m.title, m.style, function () {
        run(parts[0], parts[1]);
      }));
    });

    bar.appendChild(button("Link", "Add a link", "", function () {
      // prompt() rather than a dialog of our own: it is one field, it
      // cannot be styled, and it cannot get out of step with the
      // selection the way a custom popover can.
      var url = window.prompt("Link to where?", "https://");
      if (!url) return;
      run("createLink", url.trim());
    }));
    bar.appendChild(button("Unlink", "Remove the link", "", function () {
      run("unlink");
    }));

    bar.appendChild(button("Clear", "Strip the formatting from the selection", "", function () {
      run("removeFormat");
    }));

    var srcBtn = button("Source", "Edit the HTML by hand", "", function () {
      sourceOn = !sourceOn;
      if (sourceOn) {
        // Going to source: whatever is on screen is what gets edited,
        // so the page's HTML has to be in the textarea whether or not
        // anybody typed. From here on the textarea is authoritative.
        area.value = tidy(page.innerHTML);
        touched = true;
      } else {
        page.innerHTML = area.value;
      }
      area.hidden = !sourceOn;
      page.hidden = sourceOn;
      srcBtn.setAttribute("aria-pressed", String(sourceOn));
      srcBtn.classList.toggle("is-on", sourceOn);
      (sourceOn ? area : page).focus();
    });
    srcBtn.style.marginLeft = "auto";
    bar.appendChild(srcBtn);

    // ── keeping the two in step ──────────────────────────────────────
    page.addEventListener("input", function () {
      touched = true;
      sync();
    });

    /* Paste is where the mess came from in the first place.

       Word and Google Docs put a whole stylesheet on the clipboard, and
       pasting it straight in is how a paragraph ends up carrying
       `yackocpvbhs=""` and eleven inline styles. The HTML flavour is
       taken and cleaned rather than dropped, because dropping it loses
       the lists and links somebody spent an hour on. */
    page.addEventListener("paste", function (e) {
      var data = e.clipboardData;
      if (!data) return;
      var html = data.getData("text/html");
      var text = data.getData("text/plain");
      if (!html && !text) return;
      e.preventDefault();
      touched = true;
      document.execCommand("insertHTML", false, html ? clean(html) : escapeText(text));
      /* Cleaning the clipboard is not enough.

         insertHTML puts the cleaned markup through the browser's own
         insertion, and Chrome then writes the computed style of the
         insertion point back onto every node it inserted — so a
         paragraph that went in bare comes out carrying
         style="font-size: 0.92rem". Which is the editor's font size,
         baked into the page's content, where it would override the
         course page's own type scale for that one paragraph forever.

         So the sweep happens after, on what is actually in the box. */
      scrub(page);
      sync();
      /* And again on the next tick, which is the one that works.

         Chrome does that styling AFTER the paste handler returns, so a
         sweep inside the handler sees markup that is still clean and
         the styles land a moment later. Measured, not guessed: the
         first version of this ran only here and the box came out
         carrying style="font-size: 0.92rem" every time.

         Both calls stay. The immediate one costs nothing and covers a
         browser that inserts synchronously. */
      setTimeout(function () {
        scrub(page);
        sync();
      }, 0);
    });

    // A form can be submitted by Enter in a text field, which fires no
    // click on the button — so the last word typed has to be carried
    // over by the submit event rather than by anything the mouse does.
    var form = area.form;
    if (form) form.addEventListener("submit", sync);

    function run(cmd, arg) {
      page.focus();
      try {
        document.execCommand(cmd, false, arg);
      } catch (err) {
        return;
      }
      touched = true;
      sync();
    }
  }

  /* Strip every attribute that is not on the allow-list.

     Attributes only — nothing is unwrapped and no node is removed, so
     this cannot lose anything somebody wrote. Run over the whole box
     rather than the pasted fragment because the browser gives back no
     handle on what it inserted, and because a box being pasted into is
     a box being edited: there is nothing left in it to preserve
     untouched. */
  function scrub(root) {
    Array.prototype.slice.call(root.querySelectorAll("*")).forEach(function (el) {
      var allowed = KEEP_ATTRS[el.tagName] || [];
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (allowed.indexOf(a.name.toLowerCase()) === -1) el.removeAttribute(a.name);
      });
    });
  }

  /* Make the markup legal on the way out.

     execCommand builds DOM that HTML does not allow. Select a whole
     paragraph, press the list button, and contenteditable produces
     <p><ul><li>...</li></ul></p> — a list inside a paragraph, which no
     parser accepts and every browser silently rearranges on the way
     back in. Storing it means the page a visitor gets is not the page
     the editor was looking at.

     Re-parsing is the fix, because the HTML parser applies those
     nesting rules itself: the string above comes back as <p></p><ul>
     ...</ul><p></p>. Verified idempotent on the markup already in
     these boxes, so saving twice does not churn the content.

     The empty paragraphs it leaves behind are then dropped — they are
     the remains of the container, not a blank line somebody asked for.
     <p><br></p> is left alone: that IS a blank line somebody asked
     for. */
  function tidy(html) {
    var doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    Array.prototype.slice.call(doc.body.querySelectorAll("p, h3, h4, h5, blockquote"))
      .forEach(function (el) {
        if (!el.childNodes.length && !el.textContent.trim()) el.remove();
      });
    return doc.body.innerHTML;
  }

  function button(label, title, style, onClick) {
    var b = document.createElement("button");
    b.type = "button";               // or it submits the form
    b.className = "rt-btn";
    b.title = title;
    b.textContent = label;
    if (style) b.setAttribute("style", style);
    b.addEventListener("click", onClick);
    return b;
  }

  var escapeText = function (t) {
    return t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .split(/\n{2,}/)
      .map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; })
      .join("");
  };

  /* What survives a paste.

     An allow-list, not a block-list. A block-list of the attributes
     Word is known to emit is a list of the ones somebody has seen, and
     the next version of Word emits different ones — which is how
     `yackocpvbhs` got in. Anything not named here is dropped, including
     every style, class and id: the course page has its own stylesheet
     and pasted styling only ever fights it. */
  var KEEP_TAGS = [
    "P", "BR", "STRONG", "B", "EM", "I", "U", "A",
    "UL", "OL", "LI", "H3", "H4", "H5", "BLOCKQUOTE",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
  ];
  var KEEP_ATTRS = { A: ["href", "title", "target", "rel"], TH: ["colspan", "rowspan"], TD: ["colspan", "rowspan"] };

  function clean(html) {
    var doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;

    // Word wraps everything it sends in comments and <o:p> elements.
    Array.prototype.slice.call(doc.body.querySelectorAll("style, script, meta, link, o\\:p"))
      .forEach(function (n) { n.remove(); });

    walk(doc.body);
    return doc.body.innerHTML;
  }

  function walk(node) {
    Array.prototype.slice.call(node.children).forEach(function (el) {
      walk(el);

      if (KEEP_TAGS.indexOf(el.tagName) === -1) {
        // Unwrapped rather than deleted: a <span> around a sentence is
        // junk, and the sentence is not.
        unwrap(el);
        return;
      }
      var allowed = KEEP_ATTRS[el.tagName] || [];
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (allowed.indexOf(a.name.toLowerCase()) === -1) el.removeAttribute(a.name);
      });
      // A link that opens a new tab and does not say noopener hands the
      // new page a handle on this one.
      if (el.tagName === "A" && el.getAttribute("target")) {
        el.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  function unwrap(el) {
    var parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
})();
