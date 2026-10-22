// ─────────────────────────────────────────────────────────────────────
//  Turning what the office typed into an email somebody else can read.
//
//  The reply box uses public/js/editor.js — the same small editor the
//  course content boxes use. It writes HTML. This takes that HTML and
//  rebuilds it as the sort of HTML an email client will render.
//
//  ── Why it has to be rebuilt and not just passed along ──────────────
//
//  Two reasons, and neither is about mistrusting the office.
//
//  Outlook on Windows renders mail through Word. No stylesheet, no
//  classes, no flexbox: every element has to carry its own inline
//  style, or a paragraph is whatever Word thinks a paragraph is. The
//  editor's output has no styling at all, because on the course pages
//  the site's stylesheet does that job. In an email there is no
//  stylesheet.
//
//  And paste. editor.js exists because the Description box was full of
//  `<p yackocpvbhs="" 0",="" _fb_="" auto;="">` left behind by a paste
//  out of Word years ago. The same paste into a reply would send that
//  to a customer. Anything pasted from a web page can bring a <script>
//  with it too, and while the office is trusted, a page they copied
//  from is not.
//
//  ── How ─────────────────────────────────────────────────────────────
//
//  The output is CONSTRUCTED, never filtered. The input is walked
//  token by token; text is escaped and emitted, a tag on the allowlist
//  is emitted as our own tag with our own style, and anything else is
//  dropped while keeping what was inside it. Nothing from the input is
//  ever copied through into the output as markup.
//
//  That is the difference between this and a sanitiser that strips what
//  it recognises as bad. A stripper has to think of everything; this
//  only has to know what it allows.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const { escapeHtml, INK, NAVY, MUTED, LINE } = require("./mail-template");

/** Only these can be linked. Anything else keeps its text, loses its href. */
const SAFE_URL = /^(?:https?:\/\/|mailto:)/i;

/* What an email is allowed to contain, and how each one is dressed.
   Everything else is dropped, its contents kept. */
const TAGS = {
  p: { style: `margin:0 0 12px;font-size:14px;line-height:1.65;color:${INK}` },
  br: { void: true, style: "" },
  strong: { style: "font-weight:700" },
  b: { as: "strong", style: "font-weight:700" },
  em: { style: "font-style:italic" },
  i: { as: "em", style: "font-style:italic" },
  u: { style: "text-decoration:underline" },
  h3: { style: `margin:18px 0 8px;font-size:17px;line-height:1.35;color:${INK}` },
  h4: { style: `margin:16px 0 6px;font-size:15px;line-height:1.4;color:${INK}` },
  ul: { style: `margin:0 0 12px;padding-left:22px;font-size:14px;line-height:1.65;color:${INK}` },
  ol: { style: `margin:0 0 12px;padding-left:22px;font-size:14px;line-height:1.65;color:${INK}` },
  li: { style: "margin:0 0 4px" },
  blockquote: {
    style:
      `margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid ${LINE};` +
      `font-size:14px;line-height:1.65;color:${MUTED}`,
  },
  a: { style: `color:${NAVY};text-decoration:underline` },
};

/** Tags that may not sit inside a paragraph, so an unclosed <p> is shut. */
const BLOCK = new Set(["p", "h3", "h4", "ul", "ol", "blockquote"]);

/* Tags whose CONTENTS go with them.
 *
 * Everything else not on the allowlist loses its tag and keeps its
 * words, which is right for a <div> or a <span>. It is wrong for these:
 * dropping only the <script> tag leaves "alert(1)" sitting in the
 * message as visible text. Harmless — it is escaped like any other
 * text — and it reads as the office pasting its own source code into
 * a reply to a customer. */
const SKIP_CONTENT = new Set([
  "script", "style", "head", "title", "noscript", "iframe", "object", "template",
]);

/** The few entities the editor emits, for the plain-text version. */
const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&#039;": "'", "&apos;": "'", "&nbsp;": " ",
};
const decode = (s) =>
  s.replace(/&(?:amp|lt|gt|quot|#0?39|apos|nbsp);/g, (m) => ENTITIES[m] || m);

/** The href, if it is one we will link. */
function safeHref(attrs) {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || "");
  if (!m) return null;
  const raw = decode(String(m[2] ?? m[3] ?? m[4] ?? "")).trim();
  return SAFE_URL.test(raw) ? raw : null;
}

/**
 * Rebuild the editor's HTML as email HTML.
 *
 * Returns "" for empty input, so a caller can tell "nothing was written"
 * from "something was written that produced nothing".
 */
function toHtml(src) {
  const input = String(src == null ? "" : src);
  if (!input.trim()) return "";

  const out = [];
  const open = [];
  // Matches a tag, or the text before the next one. Comments and
  // anything else angle-bracketed that is not a tag we know become text
  // and are escaped by the branch below.
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

  let last = 0;
  let m;
  const text = (s) => {
    if (s) out.push(escapeHtml(decode(s)));
  };

  const closeTo = (name) => {
    const i = open.lastIndexOf(name);
    if (i === -1) return; // a closer with nothing open: dropped.
    while (open.length > i) out.push(`</${open.pop()}>`);
  };

  while ((m = re.exec(input))) {
    text(input.slice(last, m.index));
    last = re.lastIndex;

    // A comment. Gone, and nothing of it reaches the output.
    if (!m[1]) continue;

    const raw = m[1].toLowerCase();
    const closing = m[0][1] === "/";
    const spec = TAGS[raw];

    // A tag that takes its contents with it: skip to its closer, or to
    // the end of the input if it never closes.
    if (!closing && SKIP_CONTENT.has(raw)) {
      const shut = input.toLowerCase().indexOf(`</${raw}`, re.lastIndex);
      const gt = shut === -1 ? -1 : input.indexOf(">", shut);
      last = gt === -1 ? input.length : gt + 1;
      re.lastIndex = last;
      continue;
    }

    // Not on the list: the tag goes, whatever was inside it stays, which
    // is what a <div> or a <span> deserves.
    if (!spec) continue;

    const name = spec.as || raw;

    if (closing) {
      closeTo(name);
      continue;
    }

    if (spec.void) {
      out.push(`<${name}>`);
      continue;
    }

    // A block cannot open inside a paragraph. Browsers close the <p>
    // themselves when parsing; Word does not always, and a <p> left
    // open around a list indents the rest of the message.
    if (BLOCK.has(name) && open.includes("p")) closeTo("p");

    if (name === "a") {
      const href = safeHref(m[2]);
      // A link we will not follow keeps its words and loses its link,
      // which is better than either sending it or deleting the sentence.
      if (!href) continue;
      out.push(`<a href="${escapeHtml(href)}" style="${spec.style}">`);
      open.push("a");
      continue;
    }

    out.push(spec.style ? `<${name} style="${spec.style}">` : `<${name}>`);
    open.push(name);
  }

  text(input.slice(last));
  while (open.length) out.push(`</${open.pop()}>`);

  const html = out.join("").trim();
  // Text with no block around it at all — someone typed one line and the
  // editor never wrapped it — still wants a paragraph's spacing.
  if (html && !/^<(?:p|h3|h4|ul|ol|blockquote)\b/i.test(html)) {
    return `<p style="${TAGS.p.style}">${html}</p>`;
  }
  return html;
}

/**
 * The plain-text alternative.
 *
 * Every email here sends both parts, and a text part made by deleting
 * angle brackets reads as one long run-on. Blocks become blank lines and
 * list items get a bullet, so the shape of the message survives.
 */
function toText(src) {
  let s = String(src == null ? "" : src);
  // Same rule as toHtml: these take their contents with them.
  s = s.replace(/<\s*(script|style|head|title|noscript|iframe|object|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  /* A link becomes "text (url)".

     Stripping the tag and keeping the words leaves a plain-text
     reader looking at "have a look at our courses" with no way to
     reach them — the one thing the sentence was for. Only the
     schemes toHtml would have linked are written out; anything else
     keeps its words and loses nothing, because it was never going
     to be a link. */
  s = s.replace(
    /<\s*a\b([^>]*)>([\s\S]*?)<\s*\/\s*a\s*>/gi,
    (whole, attrs, inner) => {
      const href = safeHref(attrs);
      const words = inner.replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
      if (!href) return words;
      // A link whose words ARE the address reads as a stutter.
      return decode(words) === href ? href : `${words} (${href})`;
    }
  );
  /* One newline between list items, two around the list. A closing
     </li> contributes nothing: the next <li> brings its own newline,
     and letting both fire put a blank line between every bullet. */
  s = s.replace(/<\s*\/\s*li\s*>/gi, "");
  s = s.replace(/<\s*li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<\s*\/?\s*(?:p|h3|h4|ul|ol|blockquote)\b[^>]*>/gi, "\n\n");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  s = decode(s);
  // At most one blank line between blocks, whatever the markup did.
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { toHtml, toText, SAFE_URL };
