// ─────────────────────────────────────────────────────────────────────
//  A table of contents for one page, built from its own body.
//
//  Two jobs, because the content does not arrive in one shape.
//
//  27 of the 40 CMS documents already carry real <h2>/<h3> headings and
//  need only an id to link to. Six carry their section titles as
//  <p><b>1. Creating More Opportunities</b></p> — a paragraph containing
//  nothing but a bold run, which is what the old editor produced. Those
//  are headings in every sense except the one that counts: a screen
//  reader cannot list them, a search engine does not weight them, and
//  nothing can link to them.
//
//  So they are promoted to <h3> as the page renders. The stored content
//  is not touched — this is a view concern, and rewriting 2,600
//  characters of somebody's article in the database to add a heading tag
//  is not a migration worth the risk.
//
//  Only when the bold run is the WHOLE paragraph. A paragraph that opens
//  with a bold phrase and continues into a sentence is a paragraph, and
//  promoting it would turn a page into a wall of headings.
// ─────────────────────────────────────────────────────────────────────
"use strict";

/** Text with the tags taken out, entities left as the browser will read them. */
function textOf(html) {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An id that survives being put in a URL and read out loud.
 *
 * Numbers are kept — "1. Creating More Opportunities" becomes
 * "1-creating-more-opportunities", which is a better anchor than
 * "creating-more-opportunities" when a page has both a numbered list and
 * a later section repeating one of the names.
 */
function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      // Accented letters fold rather than vanish, so a German heading
      // does not come out as a row of hyphens.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/**
 * Give every heading an id, promote the fake ones, and list them.
 *
 * Returns { html, items }. `items` is [{ id, text, level }] in document
 * order; an empty list means the page has nothing worth a contents
 * panel, and the caller should not draw one.
 */
function build(html) {
  if (!html || typeof html !== "string") return { html: html || "", items: [] };

  const items = [];
  const used = new Set();

  // Unique within the page, so two sections with the same name still get
  // their own anchor rather than both linking to the first.
  const idFor = (text) => {
    const base = slugify(text);
    let id = base;
    let n = 2;
    while (used.has(id)) id = base + "-" + n++;
    used.add(id);
    return id;
  };

  let out = html;

  // 1. Promote a paragraph that is nothing but a bold run.
  //
  // The inner pattern allows tags inside the bold — <b><i>x</i></b> is
  // still a title — but the paragraph must contain the <b> and nothing
  // else but whitespace.
  out = out.replace(
    /<p>\s*<(b|strong)>([\s\S]{2,120}?)<\/\1>\s*<\/p>/gi,
    (whole, tag, inner) => {
      const text = textOf(inner);
      // A trailing full stop means a sentence, not a title. Section
      // titles in this content are "1. Creating More Opportunities" and
      // "Why Germany" — never "This is important."
      if (!text || /[.!?]$/.test(text)) return whole;
      // Only promoted here. Collecting happens in the pass below, which
      // sees every heading — promoted and original — in document order.
      // Pushing in both places is how this first produced each promoted
      // section twice in the list.
      return `<h3 id="${idFor(text)}">${inner}</h3>`;
    }
  );

  // 2. Real headings: keep an id they already have, add one otherwise.
  out = out.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (whole, lvl, attrs, inner) => {
    const text = textOf(inner);
    if (!text) return whole; // an empty <h5></h5> is markup noise, not a section

    const existing = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
    let id;
    if (existing) {
      id = existing[1];
      used.add(id);
    } else {
      id = idFor(text);
      attrs = `${attrs} id="${id}"`;
    }

    items.push({ id, text, level: Number(lvl) });
    return `<h${lvl}${attrs}>${inner}</h${lvl}>`;
  });

  // No sort needed: the collecting pass walks the finished markup from
  // the top, so `items` is already in the order a reader meets them.
  return { html: out, items };
}

module.exports = { build, slugify, textOf };
