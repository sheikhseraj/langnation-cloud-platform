// ─────────────────────────────────────────────────────────────────────
//  Turning an answer into something a visitor can click.
//
//  Being told "we run a B1 course for €300" is less useful than being
//  able to go and read about it, and a path typed out as text is a
//  thing somebody has to copy. So the model is asked to write links,
//  and this is what decides whether each one is real.
//
//  ── Every link is checked against the site itself ───────────────────
//
//  A model will cheerfully invent /courses/b2-intensive because it
//  sounds like the others. A link to a page that does not exist is
//  worse than no link: the visitor clicks, lands on "page not found",
//  and concludes the school's own website is broken. So a link is only
//  a link if its path is one this site actually serves — courses,
//  posts and pages read from the same content the rest of the site is
//  built from. Anything else keeps its words and loses its underline.
//
//  Off-site links are never made at all. The assistant answers from
//  this website; a link anywhere else is by definition not grounded in
//  it, however plausible it looks.
//
//  ── Why this returns PARTS and not HTML ─────────────────────────────
//
//  The answer is text written by a model, in reply to text written by a
//  stranger. It has never been allowed to become markup and it still
//  is not: this returns a list of pieces — words, or a link with a
//  label and a path — and the browser builds each one with
//  createElement and textContent. Nothing is parsed as HTML anywhere
//  along the way, so there is no sanitiser here to get wrong.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const content = require("./content");
const site = require("./site");
const { localePath } = require("./i18n");

/* Routes with code behind them rather than a content row. Kept here
   because they cannot be derived: /contact is a form, /tools is a set
   of calculators, and neither is a page anybody can edit away. */
const FIXED = [
  "/",
  "/courses",
  "/blog",
  "/germany",
  "/tools",
  "/contact",
  "/imprint",
  "/exam-papers",
  "/study-material",
  "/faq",
  "/downloads",
  "/team",
  "/events",
  "/gallery",
  "/placement-test",
  "/einbuergerungstest",
  "/einbuergerungstest/fragen",
];

/**
 * Every path on this site the assistant may point at.
 *
 * Built per call from the same content the pages are, so a course
 * retired in the editor stops being linkable the moment it stops being
 * a page. Hidden pages are left out for the same reason the sitemap
 * leaves them out: they are not for visitors.
 */
function allowed(lang) {
  const l = lang === "de" ? "de" : "en";
  const set = new Set(FIXED);
  const add = (p) => {
    if (!site.isHidden(p)) set.add(p);
  };
  for (const c of content.courses(l) || []) if (c.slug) add(`/courses/${c.slug}`);
  for (const p of content.posts(l) || []) if (p.slug) add(`/blog/${p.slug}`);
  for (const p of content.pages(l) || []) if (p.slug) add(`/${p.slug}`);
  return set;
}

/**
 * The path part of whatever the model wrote, or "" if it is not ours.
 *
 * Accepts our own absolute URLs, because a model given a site whose
 * FACTS begin with "Website: https://…" will sometimes write the whole
 * thing. Accepts a /de prefix for the same reason and drops it: the
 * language is decided here, not by the model.
 */
function ourPath(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";

  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      return "";
    }
    const here = (() => {
      try {
        return new URL(site.origin).host;
      } catch {
        return "";
      }
    })();
    if (!here || url.host.toLowerCase() !== here.toLowerCase()) return "";
    s = url.pathname;
  }

  if (!s.startsWith("/")) return "";
  s = s.split("?")[0].split("#")[0];
  s = s.replace(/^\/de(?=\/|$)/i, "") || "/";
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

/* [these words](/this-path). Deliberately narrow: no nesting, no line
   breaks, and a length cap, so a stray bracket in an answer cannot run
   away with the rest of the sentence. */
const MARKDOWN = /\[([^\]\n]{1,100})\]\(([^)\s\n]{1,200})\)/g;

/* **Like this.** A model asked a grammar question reaches for bold
   whether or not anybody invited it to, and two asterisks printed
   either side of a word is the one place this widget has ever looked
   like a text box with markdown in it. Narrow on purpose: no newline
   inside, nothing empty, and a length cap, so an asterisk used as an
   asterisk cannot swallow the rest of a sentence. */
const BOLD = /\*\*([^*\n]{1,200}?)\*\*/g;

/* A path written on its own — "you can see them all on /courses".
   Asked for in the prompt as a markdown link, but a model writes what
   it writes, and a bare path that we know is real is still worth
   making clickable. The trailing punctuation is left out of the match
   so a sentence ending in "/contact." does not link the full stop. */
const BARE = /(^|[\s(])(\/[a-z0-9][a-z0-9/-]{1,90})(?=[\s),.;:!?]|$)/gi;

/**
 * One answer, as a list of pieces.
 *
 * Returns [{ text }] and [{ label, href }] in the order they appear.
 * A link whose path is not on this site keeps its label and becomes
 * ordinary words — the sentence still reads, it just stops being a
 * promise the site cannot keep.
 */
function parts(answer, lang = "en") {
  const text = String(answer || "");
  if (!text) return [];

  const ok = allowed(lang);
  const out = [];
  const words = (t) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.text !== undefined) last.text += t;
    else out.push({ text: t });
  };
  /* Every bit of plain text goes through here, so emphasis is picked
     up wherever it lands — in a sentence, or inside the label of a
     link that was rejected. */
  const push = (t) => {
    if (!t) return;
    let from = 0;
    BOLD.lastIndex = 0;
    let b;
    while ((b = BOLD.exec(t))) {
      words(t.slice(from, b.index));
      out.push({ bold: b[1] });
      from = b.index + b[0].length;
    }
    words(t.slice(from));
  };
  const link = (label, path) => {
    if (ok.has(path)) out.push({ label, href: localePath(lang, path) });
    else push(label);
  };

  /* Markdown first and bare paths inside what is left, so the path in
     [B1](/courses/b1) is never matched twice. */
  let at = 0;
  MARKDOWN.lastIndex = 0;
  let m;
  while ((m = MARKDOWN.exec(text))) {
    bare(text.slice(at, m.index));
    const path = ourPath(m[2]);
    if (path) link(m[1], path);
    else push(m[1]);
    at = m.index + m[0].length;
  }
  bare(text.slice(at));

  function bare(chunk) {
    if (!chunk) return;
    let from = 0;
    BARE.lastIndex = 0;
    let b;
    while ((b = BARE.exec(chunk))) {
      const start = b.index + b[1].length;
      push(chunk.slice(from, start));
      const path = ourPath(b[2]);
      /* The path IS the label here: the model wrote it into the middle
         of a sentence, and replacing it with a page title would change
         what the sentence says. */
      if (path && ok.has(path)) out.push({ label: b[2], href: localePath(lang, path) });
      else push(b[2]);
      from = start + b[2].length;
    }
    push(chunk.slice(from));
  }

  return out;
}

/**
 * The same answer with the link syntax taken back out.
 *
 * What the visitor would have read if none of this existed: the
 * fallback the browser shows if there are no parts, and the text handed
 * back as conversation context.
 *
 * Every label is unwrapped, including the ones whose path was rejected,
 * because this has to say the same thing parts() does. Leaving the
 * brackets on a rejected link would show a visitor the raw syntax at
 * exactly the moment something had already gone wrong.
 */
function plain(answer) {
  return String(answer || "")
    .replace(MARKDOWN, (whole, label) => label)
    .replace(BOLD, (whole, inner) => inner);
}

module.exports = { parts, plain, allowed, ourPath };
