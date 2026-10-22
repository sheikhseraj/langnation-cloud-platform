// Small text helpers shared by the runtime and the migration tools.
"use strict";

const ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&lt;": "<", "&gt;": ">", "&hellip;": "…",
  "&ndash;": "–", "&mdash;": "—", "&rsquo;": "’", "&lsquo;": "‘",
  "&ldquo;": "“", "&rdquo;": "”", "&euro;": "€",
};

/** Strip tags and decode the entities our content actually contains. */
function toText(html, limit = 0) {
  if (!html) return "";
  let t = String(html).replace(/<[^>]+>/g, " ");
  for (const [entity, char] of Object.entries(ENTITIES)) {
    t = t.split(entity).join(char);
  }
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  t = t.replace(/\s+/g, " ").trim();

  if (limit && t.length > limit) {
    t = t.slice(0, limit).replace(/\s+\S*$/, "") + "…";
  }
  return t;
}

/** Escape a string for safe use inside an HTML attribute or text node. */
function escapeHtml(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format a date for display. The old database holds a few malformed values
 * (e.g. "2022-28-10"), so anything unparseable is returned as-is rather
 * than shown as "Invalid Date".
 */
function formatDate(value, lang = "en") {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Google shows roughly 155–160 characters of a description and about 60 of a
// title. Anything longer is cut mid-sentence in the search result, so trim to
// a word boundary here instead of letting the search engine do it badly.
const META_DESC_MAX = 155;
const META_TITLE_MAX = 60;

/** Tidy a meta description: strip tags, collapse space, trim to length. */
function metaDescription(value, fallback = "") {
  const text = toText(value) || toText(fallback);
  if (text.length <= META_DESC_MAX) return text;
  return text.slice(0, META_DESC_MAX).replace(/[\s,;:.–—-]+\S*$/, "") + "…";
}

/**
 * Tidy a page title. Adds the brand when it is missing, and drops it again
 * if that would push the title past what a search result shows.
 */
function metaTitle(value, brand = "LangNation") {
  let title = toText(value).replace(/\s*[|·–-]\s*$/, "").trim();
  if (!title) return brand;

  const hasBrand = title.toLowerCase().includes(brand.toLowerCase());
  if (!hasBrand && title.length + brand.length + 3 <= META_TITLE_MAX + 12) {
    title = `${title} | ${brand}`;
  }
  return title;
}

module.exports = {
  toText, escapeHtml, formatDate,
  metaDescription, metaTitle,
  META_DESC_MAX, META_TITLE_MAX,
};
