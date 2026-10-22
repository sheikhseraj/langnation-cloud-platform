// ─────────────────────────────────────────────────────────────────────
//  What to offer after an answer.
//
//  An answer that ends is a dead end. Somebody just told what B1 costs
//  usually wants to know when it starts, and typing that out is work
//  they should not have to do — so two or three likely next things
//  appear as buttons, with the way to reach a person beside them.
//
//  ── Who writes them ─────────────────────────────────────────────────
//
//  The model does, in the same breath as the answer. It has just read
//  the question, the digest and its own reply; a table in this file has
//  read none of those, and the difference shows the moment somebody
//  asks about paying in instalments and is offered "When does it
//  start?".
//
//  In the SAME call, as one extra line at the end of the reply:
//
//      SUGGEST: Payment options | Course prices | Pay in instalments
//
//  Not a second request, which would double both the wait and the
//  bill; not JSON mode or tool use, which are spelled differently by
//  each of the two providers and would have to be written twice. One
//  line of about fifteen tokens, parsed the same way whoever answered.
//
//  The line is cut off the answer before anybody sees it. It is also
//  stored WITH the answer, so a question served from the cache comes
//  back with its suggestions and costs nothing at all.
//
//  ── Why they are still checked here ─────────────────────────────────
//
//  Because a suggestion is a promise. A model that offers "Evening
//  classes" for a school with no evening classes has told the visitor
//  something untrue before anybody clicks, and one that renames the
//  office button has quietly removed the way out. So what comes back
//  is treated as a draft: trimmed, capped, de-duplicated, dropped if
//  it is too long to be a pill or if it is trying to be the office.
//  Fewer than two survive and the small table at the bottom of this
//  file answers instead.
//
//  ── The office ──────────────────────────────────────────────────────
//
//  Never asked of the model and never dropped. It is appended here,
//  last, under every answer including the ones that failed — the
//  moment the assistant cannot help is exactly the moment somebody
//  needs a person, and it is the only thing left that is still true
//  when both providers are down.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const { localePath } = require("./i18n");

/* The line the model is asked for. Anchored to the start of a line and
   allowed to be the last thing in the message with or without a
   trailing newline. */
const MARK = /^[ \t]*SUGGEST:[ \t]*(.+?)[ \t]*$/im;

/** A pill has to fit on a pill. */
const MAX_WORDS = 6;
const MAX_CHARS = 38;
const MAX_SMART = 3;

/* Anything that is trying to be the office button. The office is the
   application's to offer, not the model's: left to the model it can be
   renamed, translated into something unrecognisable, or quietly left
   out of the one answer where it mattered. */
const IS_OFFICE =
  /\b(kontakt|kontaktier|b[üu]ro|office|contact|email|e-mail|mail|telefon|phone|anruf|call|whatsapp|berater|staff|team|mensch|human|person)\b/i;

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/^[-–—•*\d.)\s]+/, "");

/* One spelling for comparing two bits of text, so the label and the
   question it might be repeating are stripped the same way. Without
   it "What does B1 cost?" never matched "What does B1 cost", because
   only one side had lost its question mark, and the check for
   repeating the visitor back at themselves quietly did nothing. */
const same = (s) => tidy(s).replace(/[.?!]+$/, "").toLowerCase();

/**
 * The answer with its SUGGEST line taken off, and the labels from it.
 *
 * Returns { text, labels }. A reply with no such line comes back
 * unchanged with no labels, which is the ordinary case when a model
 * has decided not to follow instructions that day.
 */
function split(answer) {
  const whole = String(answer || "");
  const m = MARK.exec(whole);
  if (!m) return { text: whole, labels: [] };

  const text = (whole.slice(0, m.index) + whole.slice(m.index + m[0].length)).replace(/\s+$/, "");
  const labels = m[1].split("|").map(tidy).filter(Boolean);
  return { text, labels };
}

/**
 * The labels, as far as they can be trusted.
 *
 * `said` is everything the visitor has typed, so a suggestion that
 * only repeats a question they have already asked is dropped — being
 * offered your own last sentence back says nobody was listening.
 */
function clean(labels, said) {
  const asked = (Array.isArray(said) ? said : []).map(same);
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(labels) ? labels : []) {
    const label = tidy(raw).replace(/[.?!]+$/, "");
    if (!label) continue;
    if (label.length > MAX_CHARS) continue;
    if (label.split(" ").length > MAX_WORDS) continue;
    if (IS_OFFICE.test(label)) continue;

    const key = same(label);
    if (seen.has(key)) continue;
    if (asked.indexOf(key) !== -1) continue;

    seen.add(key);
    out.push(label);
    if (out.length >= MAX_SMART) break;
  }
  return out;
}

/* The small table, for when the model gives nothing usable. Kept
   deliberately short: this is a floor, not a feature, and a long list
   of generic openers offered under every answer is exactly the thing
   the model is there to replace. */
const PLAIN = {
  en: ["What does it cost?", "When does it start?"],
  de: ["Was kostet das?", "Wann startet der Kurs?"],
};

/** Always last, always there, never the model's to name. */
const OFFICE = { en: "Contact the office", de: "Büro kontaktieren" };

const MIN_SMART = 2;

/**
 * The buttons under one answer.
 *
 * [{ label, ask }] for a question and [{ label, office: true }] for the
 * permanent one, which the browser answers from contact details the
 * server has already rendered rather than by asking anybody.
 */
function next(labels, said, lang) {
  const l = lang === "de" ? "de" : "en";
  let smart = clean(labels, said);
  if (smart.length < MIN_SMART) smart = clean(PLAIN[l], said);

  const out = smart.map((label) => ({ label, ask: label }));
  out.push({ label: OFFICE[l], office: true });
  return out;
}

/** The office button by itself, for the replies that are not answers. */
const only = (lang) => ({ label: OFFICE[lang === "de" ? "de" : "en"], office: true });

/** Where the office button goes when somebody follows it instead. */
const officePath = (lang) => localePath(lang === "de" ? "de" : "en", "/contact");

module.exports = { split, clean, next, only, officePath, OFFICE, PLAIN, MAX_SMART, MAX_CHARS, MAX_WORDS };
