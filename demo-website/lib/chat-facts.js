// ─────────────────────────────────────────────────────────────────────
//  What the assistant is allowed to know.
//
//  Everything here is read out of the site's own content — the same
//  courses, prices and FAQ answers a visitor could find by clicking
//  around. Nothing is written for the assistant and nothing is
//  summarised by it: if a sentence is not on the website, it is not in
//  here, and the assistant is told to say so rather than fill the gap.
//
//  That is the whole design. A chatbot for a language school will be
//  asked what a course costs and when the next B1 starts, and an
//  invented answer to either is worse than no chatbot — somebody turns
//  up having been told the wrong price.
//
//  ── Why a digest and not a search ───────────────────────────────────
//
//  The site is small enough to hand over whole. Nine courses,
//  twenty-nine FAQs and a contact card fit comfortably in one prompt,
//  which means no index to keep in step, no embedding store, and no
//  retrieval step that can quietly return the wrong three paragraphs.
//  If the site grows past that, this is the file that changes.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const content = require("./content");
const coursesDb = require("./courses-db");
const site = require("./site");
const { toText } = require("./text");

/** Long answers are trimmed; the assistant points at the page instead. */
const FAQ_CHARS = 420;
const SUMMARY_CHARS = 220;

const flat = (html, max) => {
  const words = toText(String(html || "")).replace(/\s+/g, " ").trim();
  return words.length > max ? words.slice(0, max).replace(/\s+\S*$/, "") + "…" : words;
};

const money = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `€${v}` : "";
};

/**
 * One course, as a line.
 *
 * The price is whatever the site is showing today, discount included,
 * because that is the number on the page the visitor is looking at. If
 * a course has no price set, the line says nothing about price rather
 * than guessing at one.
 */
function courseLine(c) {
  const bits = [c.title];
  if (c.levelLabel || c.level) bits.push(`level ${c.levelLabel || c.level}`);
  if (c.duration) bits.push(String(c.duration));
  if (c.lectures) bits.push(`${c.lectures} lessons`);

  /* offer() and not the two columns, because they do not mean what
     they look like. A course in the shipped data has priceEur 300 and
     discountEur 400 -- the "discount" is HIGHER -- and offer() is the
     one place that knows to ignore a discount that is not one. Reading
     the columns directly told visitors B1 cost EUR400 when the site
     charges EUR300, which is the exact failure this file exists to
     prevent. One source of truth, shared with the course page and the
     cards so they cannot disagree. */
  const { priceNow, priceWas } = coursesDb.offer(c.priceEur, c.discountEur);
  const now = money(priceNow);
  const was = money(priceWas);
  if (now && was) bits.push(`${now} (normally ${was})`);
  else if (now) bits.push(now);

  const line = `- ${bits.join(" · ")}`;
  const blurb = flat(c.summary || c.summaryFallback || c.body, SUMMARY_CHARS);
  return blurb ? `${line}\n  ${blurb}\n  Page: /courses/${c.slug}` : `${line}\n  Page: /courses/${c.slug}`;
}

/**
 * Everything the assistant may use, as plain text.
 *
 * Rebuilt per request rather than cached. The office edits courses and
 * prices through the content editor, and an assistant quoting last
 * week's price because a cache never expired is the failure this is
 * supposed to prevent. It is a few string joins over data already in
 * memory; the API call after it costs a thousand times more.
 */
function build(lang = "en") {
  const l = lang === "de" ? "de" : "en";
  const courses = content.courses(l) || [];
  const faqs = content.faqs() || [];
  const pages = content.pages(l) || [];

  const lines = [];

  lines.push("ABOUT THE SCHOOL");
  lines.push(`Name: LangNation — ${site.contact.address || "LangNation"}`);
  lines.push(`Email: ${site.contact.email}`);
  if (site.contact.phoneDe) lines.push(`Phone: ${site.contact.phoneDe}`);
  if (site.contact.whatsapp) lines.push(`WhatsApp: ${site.contact.whatsapp}`);
  lines.push(`Website: ${site.origin}`);
  lines.push("");

  if (courses.length) {
    lines.push("COURSES CURRENTLY OFFERED");
    courses.forEach((c) => lines.push(courseLine(c)));
    lines.push("");
  }

  if (faqs.length) {
    lines.push("QUESTIONS THE SCHOOL HAS ALREADY ANSWERED");
    faqs.forEach((f) => {
      const q = flat(f.question, 200);
      const a = flat(f.answer, FAQ_CHARS);
      if (q && a) lines.push(`Q: ${q}\nA: ${a}`);
    });
    lines.push("");
  }

  /* Titles only, so the assistant can send somebody to the right page
     without pretending to know what is on it. A link it can name is
     worth more than a paragraph it half-remembers. */
  if (pages.length) {
    lines.push("OTHER PAGES ON THE SITE (send people to these by name)");
    pages
      .filter((p) => p.title && p.slug)
      .slice(0, 60)
      .forEach((p) => lines.push(`- ${p.title} — /${p.slug}`));
    lines.push("");
  }

  lines.push("PLACES TO SEND PEOPLE");
  lines.push("- Browse every course: /courses");
  lines.push("- Free placement test, no account needed: /placement-test");
  /* /einbuergerungstest/fragen, with a slash. It was written here as
     one hyphenated word, which is not a route this site has: every
     visitor sent to the practice questions was sent to a 404. The
     paths in this digest are the ones the assistant hands out, so a
     typo here is a dead link in front of a customer -- which is why
     lib/chat-links.js now checks every one of them against the site's
     own content before it is allowed to become a link. */
  lines.push("- Einbürgerungstest practice: /einbuergerungstest/fragen");
  lines.push("- Ask the office anything: /contact");

  return lines.join("\n");
}

module.exports = { build, flat };
