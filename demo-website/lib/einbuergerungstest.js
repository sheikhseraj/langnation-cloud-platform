// The Einbürgerungstest question catalogue.
//
// 460 questions from the official BAMF Gesamtfragenkatalog: 300 general
// and 10 for each of the 16 Bundesländer. Loaded from content/ at boot
// and held in memory — it is about 400KB of JSON, it never changes
// between deploys, and reading it per request would be work for nothing.
//
// Split by Bundesland on the wire rather than sent whole: somebody
// preparing in Hamburg needs 300 + 10 questions, not 460, and the ten
// they do not need are a third of the payload.
//
// The catalogue is public information. Nothing here is secret, so the
// correct answers travel to the browser with the questions — the
// practice mode has to show them the moment an answer is chosen, and a
// round trip per question to protect a published PDF would be theatre.

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "content", "einbuergerungstest");

/** Official exam rules, from the BAMF. */
const RULES = {
  questions: 33,
  generalQuestions: 30,
  stateQuestions: 3,
  minutes: 60,
  passMark: 17,
};

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

let cache = null;

// Every byte that goes into the catalogue, hashed as it is read. The
// digest becomes the version in the URLs the browser fetches, which is
// the only thing that gets a corrected answer past a cache.
let digest = null;

function readJson(file) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");
  digest.update(file);
  digest.update(raw);
  return JSON.parse(raw);
}

/**
 * Load once, and survive a missing or broken catalogue.
 *
 * A data problem must not take the whole site down at boot — the page
 * checks `ready` and says so rather than throwing on a request.
 */
function load() {
  if (cache) return cache;
  digest = crypto.createHash("sha1");
  try {
    const meta = readJson("meta.json");
    const general = readJson("general.json");
    const states = {};
    for (const name of meta.states) {
      states[slug(name)] = { name, questions: readJson(slug(name) + ".json") };
    }
    // Sidecars, not part of the catalogue. Missing or broken, the
    // page still works and simply offers no translation or note —
    // never a reason to take the questions down with them.
    const en = readSidecar("translations.en.json");
    const notes = readSidecar("notes.json");
    cache = { ready: true, meta, general, states, en, notes,
              version: digest.digest("hex").slice(0, 10), error: null };
  } catch (e) {
    console.error("Einbürgerungstest catalogue could not be loaded:", e.message);
    cache = { ready: false, meta: null, general: [], states: {},
              en: {}, notes: {}, version: "none", error: e.message };
  }
  return cache;
}

/**
 * A sidecar keyed by question id, or an empty one.
 *
 * The English wording and the explanatory notes are written by hand and
 * live beside the catalogue rather than inside it. Keeping them
 * separate means the verified question data — which was checked
 * against the official PDF answer by answer — is never edited to add
 * a translation, and a mistake in a note can never move a right
 * answer.
 */
function readSidecar(file) {
  try {
    const out = readJson(file);
    return out && typeof out === "object" ? out : {};
  } catch {
    return {};
  }
}

/**
 * The English wording and note for a set of questions, as two objects
 * keyed by question id.
 *
 * Sent separately from the questions and only when asked for. Folding
 * them into the main payload would put roughly twice the bytes on the
 * wire for every learner, most of whom never press either button —
 * and most of whom are on a phone.
 */
function extrasFor(questions) {
  const d = load();
  const en = {};
  const notes = {};
  for (const q of questions || []) {
    if (d.en[q.id]) en[q.id] = d.en[q.id];
    if (d.notes[q.id]) notes[q.id] = d.notes[q.id];
  }
  return { en, notes };
}

/** How much of the catalogue has an English wording and a note. */
function coverage() {
  const d = load();
  if (!d.ready) return { total: 0, en: 0, notes: 0 };
  const all = d.general.concat(
    ...Object.keys(d.states).map((k) => d.states[k].questions)
  );
  return {
    total: all.length,
    en: all.filter((q) => d.en[q.id]).length,
    notes: all.filter((q) => d.notes[q.id]).length,
  };
}

const isReady = () => load().ready;

/** [{ slug, name, count }] in the official order. */
function stateList() {
  const d = load();
  if (!d.ready) return [];
  return d.meta.states.map((name) => ({
    slug: slug(name),
    name,
    count: (d.states[slug(name)] || { questions: [] }).questions.length,
  }));
}

function stateBySlug(s) {
  const d = load();
  return d.states[slug(s)] || null;
}

/** What the landing page shows without loading any questions. */
function summary() {
  const d = load();
  if (!d.ready) return { ready: false, rules: RULES };
  return {
    ready: true,
    rules: RULES,
    general: d.general.length,
    perState: 10,
    total: d.meta.counts.total,
    withImages: d.meta.counts.withImages,
    catalogueDate: d.meta.catalogueDate,
    builtOn: d.meta.builtOn,
    // Goes into the question URLs the browser asks for. Nine answers
    // were corrected on 12 September 2026; without this, every learner
    // whose service worker had already cached the old file would have
    // kept practising the wrong answers, and nothing would have told
    // them or us.
    version: d.version,
    states: stateList(),
  };
}

/**
 * The questions one learner needs: the 300 general plus their own ten.
 *
 * Returned as a plain object ready to be sent as JSON — the route adds
 * the caching headers, this decides only what is in it.
 */
function payloadFor(stateSlug) {
  const d = load();
  if (!d.ready) return null;
  const st = stateBySlug(stateSlug);
  if (!st) return null;
  return {
    rules: RULES,
    state: { slug: slug(st.name), name: st.name },
    catalogueDate: d.meta.catalogueDate,
    general: d.general,
    stateQuestions: st.questions,
  };
}

/** How many questions one page of the reading list holds. */
const PER_PAGE = 30;

/**
 * One page of the catalogue, to read rather than to be tested on.
 *
 * `area` is a Bundesland slug, or anything falsy for the 300 general
 * questions — "Deutschland", since they are the ones that apply
 * wherever you live. Returns null for an area that does not exist, so
 * the route can answer 404 rather than an empty page.
 */
function overview({ area, page } = {}) {
  const data = load();
  if (!data.ready) return null;

  const wanted = String(area || "").trim().toLowerCase();
  const isGeneral = !wanted || wanted === "deutschland";
  const state = isGeneral ? null : stateBySlug(wanted);
  if (!isGeneral && !state) return null;
  // stateBySlug returns { name, questions } and no slug of its own, so
  // the one that was asked for is the one to carry forward — without
  // it the active chip never matches and nothing looks selected.
  const stateSlug = isGeneral ? "deutschland" : wanted;

  const questions = isGeneral ? data.general : state.questions;
  const pages = Math.max(1, Math.ceil(questions.length / PER_PAGE));

  let current = parseInt(page, 10);
  if (!Number.isFinite(current) || current < 1) current = 1;
  if (current > pages) current = pages;

  const start = (current - 1) * PER_PAGE;
  const slice = questions.slice(start, start + PER_PAGE);

  return {
    area: {
      slug: stateSlug,
      name: isGeneral ? "Deutschland" : state.name,
      isGeneral,
      count: questions.length,
    },
    // Deutschland first, then the sixteen: the general questions apply
    // to everybody and are the ones most people want.
    areas: [{ slug: "deutschland", name: "Deutschland", count: data.general.length }]
      .concat(stateList().map((st) => ({ slug: st.slug, name: st.name, count: st.count }))),
    questions: slice,
    page: current,
    pages,
    perPage: PER_PAGE,
    from: start + 1,
    to: start + slice.length,
    total: questions.length,
    catalogue: data.meta || null,
    // Thirty questions, so the extras ride along with the page rather
    // than costing a second request: this page is read, not drilled.
    extras: extrasFor(slice),
  };
}

module.exports = {
  RULES, slug, load, isReady, stateList, stateBySlug, summary, payloadFor,
  overview, extrasFor, coverage, PER_PAGE,
};
