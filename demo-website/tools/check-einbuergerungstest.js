/* The tests run in UTC, because the server does.
 *
 * This is not tidiness. A template that formats a time without naming a
 * zone falls back to the machine's own, and a developer in Germany
 * cannot see that: a 19:00 Europe/Berlin class formats as "19:00" on a
 * Berlin laptop and "17:00" on the UTC host that actually serves it.
 *
 * That bug shipped. Students were told their evening class was two
 * hours earlier than it is, on a card whose own footnote says the times
 * are Europe/Berlin. The regression test written for it passed on the
 * machine that wrote it and would have passed forever.
 *
 * Set before anything else, so no module captures a date first.
 */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Validates the Einbürgerungstest catalogue and the exam rules.
//
//    node tools/check-einbuergerungstest.js
//
//  Two halves. The first checks the DATA — 460 questions that came out
//  of a PDF by machine, where a parsing slip produces a question that
//  looks fine and is wrong. The second checks the RULES, which are the
//  part nobody notices is broken: a paper with 29 general questions or
//  a pass mark off by one looks exactly like a correct one on screen.
//
//  No MySQL, no network, no browser.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");
const cat = require("../lib/einbuergerungstest");
const core = require("../public/js/et-core");
const { translator } = require("../lib/i18n");

let pass = 0;
let fail = 0;
const problems = [];

function ok(what, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + what + (detail ? "\n      " + detail : ""));
  }
}

// ── The data ─────────────────────────────────────────────────────────

const data = cat.load();
ok("the catalogue loads", data.ready, data.error || "");
if (!data.ready) {
  console.log("\n  Cannot continue without the catalogue.");
  process.exit(1);
}

const all = data.general.concat(
  ...Object.values(data.states).map((s) => s.questions)
);

ok("300 general questions", data.general.length === 300, "got " + data.general.length);
ok("16 Bundesländer", Object.keys(data.states).length === 16);
ok("460 questions in total", all.length === 460, "got " + all.length);

for (const [slug, s] of Object.entries(data.states)) {
  ok("10 questions for " + s.name, s.questions.length === 10,
     "got " + s.questions.length);
}

// Unique ids. A duplicate would make two questions share one progress
// record and one bookmark, which is invisible until a learner wonders
// why a question they saved keeps un-saving itself.
const ids = new Set();
const dupes = [];
for (const q of all) {
  if (ids.has(q.id)) dupes.push(q.id);
  ids.add(q.id);
}
ok("every id is unique", dupes.length === 0, dupes.slice(0, 5).join(", "));

let badAnswers = 0, badIndex = 0, emptyQ = 0, emptyA = 0, badState = 0, badCat = 0;
for (const q of all) {
  if (!Array.isArray(q.answers) || q.answers.length !== 4) { badAnswers++; problems.push(q.id + ": " + (q.answers || []).length + " options"); }
  if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 3) { badIndex++; problems.push(q.id + ": correctAnswer " + q.correctAnswer); }
  if (!q.question || !q.question.trim()) { emptyQ++; problems.push(q.id + ": empty question"); }
  if ((q.answers || []).some((a) => !a || !String(a).trim())) { emptyA++; problems.push(q.id + ": an empty option"); }
  if (q.type === "state" && !data.meta.states.includes(q.state)) { badState++; problems.push(q.id + ": unknown Bundesland " + q.state); }
  if (!q.category || !String(q.category).trim()) { badCat++; problems.push(q.id + ": no category"); }
}
ok("every question has exactly 4 options", badAnswers === 0, badAnswers + " bad");
ok("every correctAnswer is an index 0–3", badIndex === 0, badIndex + " bad");
ok("no empty question text", emptyQ === 0);
ok("no empty options", emptyA === 0);
ok("every state question names a real Bundesland", badState === 0);
ok("every question has a category", badCat === 0);

// Four identical options would make the question unanswerable; two
// identical ones make it ambiguous.
let dupOptions = 0;
for (const q of all) {
  const seen = new Set((q.answers || []).map((a) => String(a).trim().toLowerCase()));
  if (seen.size !== (q.answers || []).length) { dupOptions++; problems.push(q.id + ": repeated option text"); }
}
ok("no question repeats an option", dupOptions === 0, dupOptions + " affected");

// Images. A reference to a file that is not there renders as a broken
// picture in the middle of a question, which is worse than no picture.
let missingImages = 0, imageCount = 0, badShape = 0;
const PUB = path.join(__dirname, "..", "public");
for (const q of all) {
  if (!q.image) continue;
  imageCount++;
  const files = q.image.files || [];
  if (q.image.kind === "options" && files.length !== 4) { badShape++; problems.push(q.id + ": option-image question with " + files.length + " files"); }
  if (q.image.kind === "single" && files.length !== 1) { badShape++; problems.push(q.id + ": single-image question with " + files.length + " files"); }
  for (const f of files) {
    if (!fs.existsSync(path.join(PUB, f.src.replace(/^\//, "")))) {
      missingImages++;
      problems.push(q.id + ": missing " + f.src);
    }
    if (!f.w || !f.h) { badShape++; problems.push(q.id + ": " + f.src + " has no dimensions"); }
  }
}
ok("every referenced image exists on disk", missingImages === 0, missingImages + " missing");
ok("image questions have the right number of files", badShape === 0);

// A picture-choice question whose options are bare numbers must have a
// picture, or the learner is choosing between "1" and "2" with nothing
// to look at.
let numericWithoutImage = 0;
for (const q of all) {
  const numeric = (q.answers || []).every((a) => /^(Bild\s*)?[1-4]\.?$/.test(String(a).trim()));
  if (numeric && !q.image) { numericWithoutImage++; problems.push(q.id + ": numeric options but no image"); }
}
ok("no picture question is missing its picture", numericWithoutImage === 0,
   numericWithoutImage + " affected");

// ── The rules ────────────────────────────────────────────────────────

const general = data.general;
const bayern = data.states["bayern"].questions;

const paper = core.buildExam(general, bayern);
ok("an exam paper has 33 questions", paper.length === 33, "got " + paper.length);
ok("exactly 30 are general", paper.filter((q) => q.type === "general").length === 30);
ok("exactly 3 are state questions", paper.filter((q) => q.type === "state").length === 3);
ok("the 3 state questions are the chosen Bundesland's",
   paper.filter((q) => q.type === "state").every((q) => q.state === "Bayern"));

let anyDupe = false;
for (let i = 0; i < 200; i++) {
  const p = core.buildExam(general, bayern);
  const s = new Set(p.map((q) => q.id));
  if (s.size !== p.length) anyDupe = true;
}
ok("no paper ever repeats a question (200 papers)", !anyDupe);

// Changing the Bundesland must change which state questions appear.
const hh = core.buildExam(general, data.states["hamburg"].questions);
ok("choosing another Bundesland changes the state questions",
   hh.filter((q) => q.type === "state").every((q) => q.state === "Hamburg"));

// Papers must actually vary, or "neuen Test starten" gives the same 33.
const first = core.buildExam(general, bayern).map((q) => q.id).join();
let differs = false;
for (let i = 0; i < 20 && !differs; i++) {
  if (core.buildExam(general, bayern).map((q) => q.id).join() !== first) differs = true;
}
ok("two papers are not the same paper", differs);

// Scoring, at the boundary the whole thing turns on.
function fakePaper(n) {
  return Array.from({ length: n }, (_, i) => ({ id: "q" + i, correctAnswer: 0 }));
}
function answersFor(n, rightCount) {
  const a = {};
  for (let i = 0; i < n; i++) a["q" + i] = i < rightCount ? 0 : 1;
  return a;
}
const at17 = core.score(fakePaper(33), answersFor(33, 17));
const at16 = core.score(fakePaper(33), answersFor(33, 16));
ok("17 correct is a pass", at17.passed === true);
ok("16 correct is a fail", at16.passed === false);
ok("17 correct counts 16 wrong", at17.correct === 17 && at17.wrong === 16);

const partly = core.score(fakePaper(33), answersFor(10, 10));
ok("unanswered is counted apart from wrong",
   partly.correct === 10 && partly.wrong === 0 && partly.unanswered === 23);
ok("the pass mark is not reached by leaving questions blank", partly.passed === false);

// Every real question must be answerable correctly by its own index —
// a sanity check that score() and the data agree.
const perfect = {};
for (const q of paper) perfect[q.id] = q.correctAnswer;
const full = core.score(paper, perfect);
ok("answering every question correctly scores 33/33",
   full.correct === 33 && full.passed === true);

const zero = {};
for (const q of paper) zero[q.id] = (q.correctAnswer + 1) % 4;
ok("answering every question wrongly scores 0", core.score(paper, zero).correct === 0);

// The clock. Driven by two timestamps, so a backgrounded tab cannot
// quietly hand somebody a longer exam than the rules allow.
const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const deadline = t0 + 60 * 60 * 1000;
ok("a fresh exam has the full hour", core.secondsLeft(deadline, t0) === 3600);
ok("half an hour in, half an hour left", core.secondsLeft(deadline, t0 + 30 * 60000) === 1800);
ok("time cannot go negative", core.secondsLeft(deadline, deadline + 99999) === 0);
ok("a missing deadline reads as expired", core.secondsLeft(null, t0) === 0);

ok("not expired at one second left", core.isExpired(deadline, deadline - 1000) === false);
ok("expired exactly on the hour", core.isExpired(deadline, deadline) === true);
ok("expired after the hour", core.isExpired(deadline, deadline + 60000) === true);
// The case a ticking counter gets wrong: the tab slept through the end.
ok("expired after the tab slept past the deadline",
   core.isExpired(deadline, t0 + 90 * 60000) === true);

ok("the clock is calm at 11 minutes", core.timerTone(660) === "calm");
ok("the clock warns at 10 minutes", core.timerTone(600) === "warn");
ok("the clock is still warning at 6 minutes", core.timerTone(360) === "warn");
ok("the clock is urgent at 5 minutes", core.timerTone(300) === "urgent");
ok("the clock is urgent at zero", core.timerTone(0) === "urgent");

ok("the timer formats mm:ss", core.formatTime(3600) === "60:00");
ok("the timer formats a part minute", core.formatTime(2538) === "42:18");
ok("the timer never goes negative", core.formatTime(-5) === "00:00");
ok("the timer survives rubbish", core.formatTime(undefined) === "00:00");

// Mistake practice.
const hist = { "general-1": { lastWrong: true }, "general-2": { lastWrong: false, right: 2 } };
const weak = core.weakQuestions(general.slice(0, 5), hist);
ok("mistake practice picks up a wrong answer", weak.some((q) => q.id === "general-1"));
ok("mistake practice drops one since got right", !weak.some((q) => q.id === "general-2"));
ok("mistake practice is empty with no history", core.weakQuestions(general, {}).length === 0);

// Smart practice ordering.
const ordered = core.smartOrder(general.slice(0, 20), hist);
ok("smart practice puts a known-weak question first", ordered[0].id === "general-1");
ok("smart practice keeps every question", ordered.length === 20);

// Refusals.
let threw = false;
try { core.buildExam(general.slice(0, 10), bayern); } catch (e) { threw = true; }
ok("a short general pool is refused, not silently shortened", threw);
threw = false;
try { core.buildExam(general, bayern.slice(0, 2)); } catch (e) { threw = true; }
ok("a short state pool is refused", threw);

// ── Picture questions ────────────────────────────────────────────────
//
// The one class of question where the answer cannot be checked by
// comparing strings: the options are only "Bild 1".."Bild 4", so the
// index is the whole answer and a wrong one is invisible to every
// other test in this file.
//
// Ten of these nineteen were wrong at one point, because they had been
// taken from a reference that lays the same four pictures out in a
// different order — including telling learners that a decoy emblem was
// the flag of the European Union. Each index below was read off the
// catalogue's own artwork, and is pinned here so it cannot drift back.
{
  const PICTURES = {
    "general-21": 1,                  // Bundesadler
    "general-209": 3,                 // DDR emblem
    "general-226": 2,                 // EU flag: twelve stars on blue
    "baden-wuerttemberg-1": 1,
    "bayern-1": 1,
    "berlin-1": 3,
    "brandenburg-1": 2,
    "bremen-1": 2,
    "hamburg-1": 2,
    "hessen-1": 0,
    "mecklenburg-vorpommern-1": 2,
    "niedersachsen-1": 2,
    "nordrhein-westfalen-1": 1,
    "rheinland-pfalz-1": 0,
    "saarland-1": 1,
    "sachsen-1": 3,
    "sachsen-anhalt-1": 3 - 1,
    "schleswig-holstein-1": 3,
    "thueringen-1": 2,
  };

  const everything = general.concat(
    ...Object.values(data.states).map((s) => s.questions)
  );
  const pictures = everything.filter((q) =>
    q.answers.every((a) => /^Bild \d+$/.test(a))
  );

  ok("every picture question is pinned", pictures.length === Object.keys(PICTURES).length);

  for (const [id, index] of Object.entries(PICTURES)) {
    const q = everything.find((x) => x.id === id);
    ok("picture answer pinned: " + id, !!q && q.correctAnswer === index);
    ok("picture question has its four images: " + id,
       !!q && !!q.image && (q.image.files || []).length === 4);
  }

  // A picture question with no pinned answer must never reach the app.
  for (const q of pictures) {
    ok("no unpinned picture question ships: " + q.id, PICTURES[q.id] !== undefined);
  }
}

// ── Every answer, against a second source ────────────────────────────
//
// The import took all of its answers from one reference site, and that
// site has now been caught three separate ways: ten picture answers,
// two general questions (Frage 127 on the 5% threshold and Frage 175 on
// the number of occupation zones), and eight of the 128 Bundesland
// answers — including telling learners they could vote at 16 in Bayern,
// Hessen, Rheinland-Pfalz, Saarland and Sachsen, where the age is 18.
//
// One source is not a check. The fixture beside this file is what a
// SECOND reference gives for every question; where the two disagreed,
// the underlying fact was looked up and the data corrected. It is
// pinned so that re-running the import cannot quietly put the old
// answers back.
{
  const second = require("./einbuergerungstest-second-source.json");
  const byId = new Map(
    general.concat(...Object.values(data.states).map((st) => st.questions))
      .map((q) => [q.id, q])
  );

  let compared = 0;
  const agrees = (q, want) => {
    compared++;
    ok("second source agrees: " + q.id, q.answers[q.correctAnswer].indexOf(want) !== -1,
       "ours says \"" + q.answers[q.correctAnswer] + "\", the second source says \"" + want + "\"");
  };

  for (const number of Object.keys(second.general)) {
    const q = general.find((x) => x.number === Number(number));
    ok("the second source's Frage " + number + " exists", !!q);
    if (q) agrees(q, second.general[number]);
  }

  ok("the second-source table covers all sixteen Bundesländer",
     Object.keys(second.states).length === 16);
  for (const land of Object.keys(second.states)) {
    const set = data.states[land];
    ok("second source has a set to check: " + land, !!set && set.questions.length === 10);
    if (!set) continue;
    second.states[land].forEach((want, i) => {
      if (want === null) return;
      agrees(set.questions[i], want);
    });
  }

  // Question 8 of each Bundesland set, and Frage 130, answer with a
  // number — but the numbers are printed INSIDE a single BAMF image
  // rather than under four separate ones, so unlike the Wappen
  // questions they do carry across from one site to another.
  for (const land of Object.keys(second.stateMaps)) {
    const q = data.states[land] && data.states[land].questions[7];
    ok("map answer agrees with the second source: " + land,
       !!q && q.correctAnswer + 1 === second.stateMaps[land],
       q ? "ours " + (q.correctAnswer + 1) + ", second " + second.stateMaps[land] : "missing");
    ok("...and it really is a single image: " + land,
       !!q && !!q.image && (q.image.files || []).length === 1);
    compared += 1;
  }
  for (const number of Object.keys(second.generalMapAnswer)) {
    const q = general.find((x) => x.number === Number(number));
    ok("Frage " + number + " agrees with the second source",
       !!q && q.correctAnswer + 1 === second.generalMapAnswer[number]);
    compared += 1;
  }

  // 296 general + 128 Bundesland + 17 numbered images. The nineteen
  // left over are the Wappen questions, pinned against the artwork.
  ok("441 answers were compared against a second source", compared === 441,
     String(compared));

  // The PDF numbers every question, and for two of them the number came
  // through stuck to the front of the sentence — so the card read
  // "184. Auf welcher rechtlichen Grundlage …".
  const numbered = [...byId.values()].filter(
    (q) => new RegExp("^" + q.number + "\\.\\s").test(q.question));
  ok("no question begins with its own number",
     numbered.length === 0, numbered.map((q) => q.number).join(", "));

  // Nothing in the catalogue is now trusted to one source alone.
  ok("every question is verified by the second source or pinned to the artwork",
     compared + 19 === 460, String(compared + 19));
}

// ── The English wording and the notes ────────────────────────────────
//
// Sidecars, so a mistake in one can never move a right answer. What
// they must not do is drift out of shape: an English question with
// three options beside a German one with four is worse than no
// translation at all, because the learner reads the letters as if they
// lined up.
{
  const everything = general.concat(
    ...Object.values(data.states).map((s) => s.questions)
  );
  const byId = new Map(everything.map((q) => [q.id, q]));
  const cover = cat.coverage();

  ok("every question is in the catalogue exactly once", byId.size === 460,
     String(byId.size));

  const shapeProblems = [];
  const strayEn = [];
  for (const id of Object.keys(data.en)) {
    const en = data.en[id];
    const q = byId.get(id);
    if (!q) { strayEn.push(id); continue; }
    if (!en.question || typeof en.question !== "string"
        || !Array.isArray(en.answers)
        || en.answers.length !== q.answers.length
        || en.answers.some((a) => typeof a !== "string" || !a.trim())) {
      shapeProblems.push(id);
    }
  }
  ok("no English entry is for a question that does not exist",
     strayEn.length === 0, strayEn.slice(0, 5).join(", "));
  ok("every English entry has the same number of options as the German",
     shapeProblems.length === 0, shapeProblems.slice(0, 5).join(", "));

  // A picture question's options are "Bild 1".."Bild 4" — labels under
  // numbered artwork, not words. Translating them to "Picture 1" would
  // stop them matching what is printed on the page.
  for (const id of Object.keys(data.en)) {
    const q = byId.get(id);
    if (!q || !q.answers.every((a) => /^Bild \d+$/.test(a))) continue;
    ok("picture labels are left alone in English: " + id,
       data.en[id].answers.every((a) => /^Bild \d+$/.test(a)),
       data.en[id].answers.join(" / "));
  }

  const noteProblems = [];
  const strayNotes = [];
  for (const id of Object.keys(data.notes)) {
    const note = data.notes[id];
    if (!byId.has(id)) { strayNotes.push(id); continue; }
    // Both languages, or the reader of one gets a blank panel.
    if (!note.de || !note.en || typeof note.de !== "string"
        || typeof note.en !== "string") noteProblems.push(id);
  }
  ok("no note is for a question that does not exist",
     strayNotes.length === 0, strayNotes.slice(0, 5).join(", "));
  ok("every note is written in both languages",
     noteProblems.length === 0, noteProblems.slice(0, 5).join(", "));

  // The page survives a missing note — it shows the sources instead —
  // but the claim on the landing page is that every question has one,
  // so the claim is what gets tested.
  ok("every question has an English wording", cover.en === cover.total,
     cover.en + " of " + cover.total);
  ok("every question has an explanation", cover.notes === cover.total,
     cover.notes + " of " + cover.total);

  // A note whose German and English say different things is worse than
  // no note, and the commonest way that happens is one of them being
  // left as a copy of the other. Not conclusive, but it catches the
  // careless case.
  const untranslated = Object.keys(data.notes)
    .filter((id) => data.notes[id].de === data.notes[id].en);
  ok("no note has the same text in both languages",
     untranslated.length === 0, untranslated.slice(0, 5).join(", "));
}

// ── The catalogue as a reading list ──────────────────────────────────

{
  const overview = cat.overview.bind(cat);

  const de = overview({});
  ok("Deutschland is the default area", de.area.slug === "deutschland");
  ok("Deutschland holds the 300 general questions", de.total === 300);
  ok("a page holds thirty", de.questions.length === 30 && de.perPage === 30);
  ok("300 questions make ten pages", de.pages === 10);
  ok("the first page starts at one", de.from === 1 && de.to === 30);

  // Deutschland first, then the sixteen: the general questions apply
  // wherever you live.
  ok("seventeen areas are offered", de.areas.length === 17);
  ok("Deutschland leads the list", de.areas[0].slug === "deutschland");
  ok("...and the other sixteen are the Bundesländer",
     de.areas.slice(1).length === 16 && de.areas.slice(1).every((a) => a.count === 10));

  const p8 = overview({ page: 8 });
  ok("page eight is questions 211-240", p8.from === 211 && p8.to === 240);
  ok("...and its questions carry those numbers",
     p8.questions[0].number === 211 && p8.questions[29].number === 240);

  const by = overview({ area: "bayern" });
  ok("a Bundesland holds its ten", by.total === 10 && by.pages === 1);
  ok("...and is marked as the current area", by.area.slug === "bayern");
  ok("...and the chip list still offers every area", by.areas.length === 17);

  // The area has to identify itself, or nothing looks selected.
  for (const slug of ["deutschland", "bayern", "thueringen", "nordrhein-westfalen"]) {
    const v = overview({ area: slug });
    ok("area slug survives the round trip: " + slug,
       v.area.slug === slug && v.areas.some((a) => a.slug === v.area.slug));
  }

  // Nonsense in, nothing out — the route turns null into a 404.
  ok("an unknown Bundesland gives nothing", overview({ area: "atlantis" }) === null);

  // Out-of-range pages are clamped rather than throwing or emptying.
  ok("page 0 clamps to the first", overview({ page: 0 }).page === 1);
  ok("page 999 clamps to the last", overview({ page: 999 }).page === 10);
  ok("a non-numeric page is the first", overview({ page: "abc" }).page === 1);
  ok("a negative page is the first", overview({ page: -5 }).page === 1);

  // Every question across every page, exactly once.
  const collected = [];
  for (let i = 1; i <= de.pages; i++) collected.push(...overview({ page: i }).questions);
  ok("the pages cover all 300", collected.length === 300);
  ok("...with no repeats", new Set(collected.map((q) => q.id)).size === 300);

  // Each listed question can actually be rendered: it needs an answer
  // index that points at one of its own options.
  ok("every listed question has a valid answer index",
     collected.every((q) => q.correctAnswer >= 0 && q.correctAnswer < q.answers.length));
}

// ── What a finished block is told ────────────────────────────────────
//
// Praise that does not track the result is not encouragement, it is
// noise — and a learner who is told "well done" for nine out of thirty
// stops believing the next one.
{
  const bands = [100, 95, 94, 80, 79, 60, 59, 40, 39, 0];
  const seen = bands.map((p) => core.praise(p));

  ok("every band names itself and has an emoji",
     seen.every((b) => b && b.emoji && b.band));
  ok("every band is a known one",
     seen.every((b) => core.PRAISE_BANDS.indexOf(b.band) !== -1));

  // The boundaries are where a wrong comparison hides.
  ok("95 and over is the top band", core.praise(95).band === core.praise(100).band);
  ok("94 is not the top band", core.praise(94).band !== core.praise(95).band);
  ok("80 is the passing band", core.praise(80).band === core.praise(94).band);
  ok("79 drops a band", core.praise(79).band !== core.praise(80).band);
  ok("40 and 59 share a band", core.praise(40).band === core.praise(59).band);
  ok("39 is the lowest band", core.praise(39).band === core.praise(0).band);

  // Five distinct bands, not one message wearing five hats.
  ok("there are five distinct bands", new Set(seen.map((b) => b.band)).size === 5);
  ok("...and five distinct emoji", new Set(seen.map((b) => b.emoji)).size === 5);

  // Ordered worst to best, so the list can be read as a scale.
  ok("the bands run from worst to best",
     core.PRAISE_BANDS.indexOf(core.praise(10).band)
       < core.PRAISE_BANDS.indexOf(core.praise(50).band));
  ok("...all the way up",
     core.PRAISE_BANDS.indexOf(core.praise(85).band)
       < core.PRAISE_BANDS.indexOf(core.praise(99).band));

  // A bad round must not land in a band that congratulates it.
  ok("a third right is not called strong",
     ["seed", "start"].indexOf(core.praise(33).band) !== -1);

  // Nothing silly at the edges.
  ok("zero is handled", !!core.praise(0).band);
  ok("a hundred is handled", !!core.praise(100).band);

  // The words live in the translation file now, so every band has to
  // have them — in both languages. A missing key would show a learner
  // the literal string "et.praiseGoodHead" at the proudest moment of
  // their session.
  const cap = (s2) => s2.charAt(0).toUpperCase() + s2.slice(1);
  for (const lang of ["en", "de"]) {
    const t = translator(lang);
    const missing = [];
    for (const band of core.PRAISE_BANDS) {
      for (const part of ["Head", "Body"]) {
        const key = "et.praise" + cap(band) + part;
        if (t(key) === key) missing.push(key);
      }
    }
    ok(`every praise band has ${lang} words`, missing.length === 0,
       missing.join(", "));
  }
}

// ── The version stamped into the question URLs ───────────────────────
//
// Nine answers were corrected on 12 September 2026. The browser fetches
// the catalogue cache-first through a service worker, so without a
// version in the URL every learner who had already practised once would
// have kept the wrong answers — silently, and for as long as the cache
// survived. This is the thing that makes a correction actually arrive.
{
  const v = cat.summary().version;
  ok("the catalogue reports a version", typeof v === "string" && v.length >= 8, String(v));
  ok("...and it is a hash, not a date", /^[0-9a-f]+$/.test(v || ""), String(v));

  // The point of the version is that it MOVES when an answer does.
  // Proved rather than asserted: hash the same bytes with one answer
  // changed and check the digest differs.
  const crypto = require("crypto");
  const stamp = (mutate) => {
    const h = crypto.createHash("sha1");
    const copy = JSON.parse(JSON.stringify(general));
    if (mutate) copy[0].correctAnswer = (copy[0].correctAnswer + 1) % 4;
    h.update(JSON.stringify(copy));
    return h.digest("hex");
  };
  ok("changing one answer changes the hash", stamp(false) !== stamp(true));
}

// ── The strings the client-side app is handed ────────────────────────
//
// The quiz is built in the browser from a blob of strings the page
// ships in a data attribute. A key listed there but missing from the
// translation table falls back to the key itself, so the button's
// tooltip reads "et.toolsAria" — plausible-looking markup, nonsense on
// screen, and nothing fails. This reads the list out of the template
// and checks every key in both languages.
{
  const view = fs.readFileSync(
    path.join(__dirname, "..", "views", "pages", "einbuergerungstest.ejs"), "utf8");
  const block = /const CLIENT_KEYS = \[([\s\S]*?)\];/.exec(view);
  ok("the template still declares CLIENT_KEYS", !!block);

  if (block) {
    const keys = (block[1].match(/"([^"]+)"/g) || []).map((k) => k.slice(1, -1));
    ok("CLIENT_KEYS is not empty", keys.length > 50, String(keys.length));
    ok("...with no duplicates", new Set(keys).size === keys.length);

    for (const lang of ["en", "de"]) {
      const t = translator(lang);
      const missing = keys.filter((k) => t("et." + k) === "et." + k);
      ok(`every client string exists in ${lang}`, missing.length === 0,
         missing.join(", "));
    }

    // The four buttons under each question are icon-only. Their label
    // is the tooltip and the aria-label at once, so an empty one is a
    // button nobody can identify — by sight or by screen reader.
    const TOOLTIPS = ["translate", "translateOff", "explain", "report",
                      "save", "saved", "toolsAria"];
    for (const key of TOOLTIPS) {
      ok("the tool row ships " + key, keys.indexOf(key) !== -1);
      for (const lang of ["en", "de"]) {
        const v = translator(lang)("et." + key);
        ok(`${key} has ${lang} words`, !!v && v !== "et." + key && v.trim().length > 2, v);
      }
    }

    // The label is a tooltip now, not a caption beside an icon, so a
    // leading ☆ or 🌐 would be a second icon inside the tooltip.
    for (const key of TOOLTIPS) {
      for (const lang of ["en", "de"]) {
        ok(`${key} (${lang}) carries no icon character`,
           !/[\u2605\u2606\u2691\u{1F300}-\u{1FAFF}]/u.test(translator(lang)("et." + key)),
           translator(lang)("et." + key));
      }
    }
  }
}

// ── Readiness ────────────────────────────────────────────────────────
//
// "You are ready to book the exam" is a claim, so it gets checked at
// the boundary and in both the ways somebody can fail to be ready.

function pool(n) {
  return Array.from({ length: n }, (_, i) => ({ id: "p" + i, type: "general", category: "C" }));
}
function seen(ids, right) {
  const h = {};
  ids.forEach((i) => { h["p" + i] = { seen: 1, right: right ? 1 : 0, wrong: right ? 0 : 1, lastWrong: !right }; });
  return h;
}

{
  const empty = core.readiness(pool(310), {});
  ok("nothing practised is 0% ready", empty.ready === 0 && empty.isReady === false);
  ok("nothing practised counts every question untouched", empty.untouched === 310);

  // Perfect but tiny: 30 answered, all right. Accuracy 100, coverage
  // under 10 — the case a single average would call "ready".
  const tiny = core.readiness(pool(310), seen([...Array(30).keys()], true));
  ok("30 perfect answers is not ready", tiny.isReady === false);
  ok("...and says coverage is what is missing", tiny.limiter === "coverage");
  ok("...with accuracy still reported as 100", tiny.accuracy === 100);

  // Broad but weak: everything seen, just over half right.
  const weak = core.readiness(pool(100), {
    ...seen([...Array(55).keys()], true),
    ...seen([...Array(45).keys()].map((i) => i + 55), false),
  });
  ok("seeing everything at 55% is not ready", weak.isReady === false);
  ok("...and says accuracy is what is missing", weak.limiter === "accuracy");
  ok("...with full coverage reported", weak.coverage === 100);

  // The boundary.
  const at80 = core.readiness(pool(100), seen([...Array(80).keys()], true));
  ok("80% seen and all right is ready", at80.isReady === true && at80.ready === 80);
  const at79 = core.readiness(pool(100), seen([...Array(79).keys()], true));
  ok("79% is not ready", at79.isReady === false);

  // The last outcome is what counts, not the tally.
  const redeemed = core.readiness(pool(1), { p0: { seen: 4, right: 1, wrong: 3, lastWrong: false } });
  ok("a question got right most recently counts as known", redeemed.known === 1);
  const lapsed = core.readiness(pool(1), { p0: { seen: 4, right: 3, wrong: 1, lastWrong: true } });
  ok("a question got wrong most recently counts as shaky", lapsed.known === 0 && lapsed.shaky === 1);
}

// Advice never promises a pass below the line, and never discourages.
{
  const notReady = core.readiness(pool(100), seen([...Array(40).keys()], true));
  const a = core.advice(notReady, 10);
  ok("advice below the line is 'working', never 'ready'", a.tone === "working");
  ok("advice says how many questions are still needed", a.need > 0);
  ok("advice divides the work across the days left", a.perDay === Math.ceil(a.need / 10));

  const ready = core.advice(core.readiness(pool(100), seen([...Array(90).keys()], true)), 5);
  ok("advice above the line is 'ready'", ready.tone === "ready");
  ok("...and knows there is a date", ready.key === "readyWithDate");
  ok("...and 'ready' with no date says so differently",
     core.advice(core.readiness(pool(100), seen([...Array(90).keys()], true)), null).key === "ready");

  ok("advice with no practice tells you where to start",
     core.advice(core.readiness(pool(310), {}), null).tone === "start");
}

// Days to the exam, counted in calendar days.
{
  ok("tomorrow is one day away", core.daysUntil("2026-09-12", "2026-09-11") === 1);
  ok("today is zero days away", core.daysUntil("2026-09-11", "2026-09-11") === 0);
  ok("yesterday is negative", core.daysUntil("2026-09-10", "2026-09-11") === -1);
  ok("no date gives no number", core.daysUntil(null) === null);
  ok("rubbish gives no number", core.daysUntil("not-a-date") === null);
  // Late at night, tomorrow morning is still one day away.
  ok("the time of day does not change the count",
     core.daysUntil("2026-09-12T09:00:00", "2026-09-11T23:30:00") === 1);
}

// Categories add up to the whole.
{
  const mixed = general.slice(0, 60);
  const cats = core.byCategory(mixed, {});
  ok("every question lands in exactly one category",
     cats.reduce((n, c) => n + c.count, 0) === mixed.length);
  ok("categories are named", cats.every((c) => !!c.name));
}

// ── Merging two devices ──────────────────────────────────────────────

{
  const merge = require("../lib/et-progress");

  const phone = { "general-1": { right: 2, wrong: 1, seen: 3, lastWrong: false } };
  const laptop = { "general-1": { right: 0, wrong: 1, seen: 1, lastWrong: true },
                   "general-2": { right: 1, wrong: 0, seen: 1, lastWrong: false } };

  const both = merge.mergeHistory(phone, laptop);
  ok("merging keeps a question only one side has", !!both["general-2"]);
  ok("merging sums the attempts", both["general-1"].seen === 4);
  ok("merging sums right and wrong",
     both["general-1"].right === 2 && both["general-1"].wrong === 2);
  // The phone answered three times to the laptop's one, so the phone
  // is the more recent word on whether it is known.
  ok("the side with more attempts decides the last outcome",
     both["general-1"].lastWrong === false);

  ok("merging an empty side changes nothing",
     JSON.stringify(merge.mergeHistory(phone, {})) === JSON.stringify(phone));
  ok("merging into nothing adopts the other side",
     JSON.stringify(merge.mergeHistory({}, laptop)) === JSON.stringify(laptop));

  const saved = merge.mergeSaved(["a", "b"], ["b", "c"]);
  ok("bookmarks combine without duplicates",
     saved.length === 3 && saved.includes("a") && saved.includes("c"));

  const exams = merge.mergeExams(
    [{ date: "2026-01-02", correct: 20, total: 33, passed: true }],
    [{ date: "2026-01-02", correct: 20, total: 33, passed: true },
     { date: "2026-03-04", correct: 25, total: 33, passed: true }]
  );
  ok("the same exam submitted twice is stored once", exams.length === 2);
  ok("exams come back newest first", exams[0].date === "2026-03-04");
  ok("rubbish in the exam list is dropped",
     merge.mergeExams([{ nonsense: true }], []).length === 0);
}

// ── Report ───────────────────────────────────────────────────────────

const summary = cat.summary();
console.log("\n  Question database validated:");
console.log("    %d general questions", summary.general);
console.log("    %d state-specific questions across %d Bundesländer",
            summary.total - summary.general, summary.states.length);
console.log("    %d total question records", summary.total);
console.log("    %d questions carry a picture", summary.withImages);
console.log("    catalogue Stand %s, built %s", summary.catalogueDate, summary.builtOn);
console.log("    a learner's pool: %d general + 10 state = %d questions",
            summary.general, summary.general + 10);

if (data.meta.manuallyDecided && data.meta.manuallyDecided.length) {
  console.log("\n  Decided by hand (verify these against the current BAMF catalogue):");
  for (const m of data.meta.manuallyDecided) {
    console.log("    " + m.id.padEnd(14) + " -> " + m.option);
    console.log("        " + m.why);
  }
}
if (data.meta.dropped && data.meta.dropped.length) {
  console.log("\n  NOT IMPORTED (%d):", data.meta.dropped.length);
  for (const d of data.meta.dropped) console.log("    " + d.id.padEnd(20) + " " + d.question);
}

if (problems.length) {
  console.log("\n  Details:");
  for (const p of problems.slice(0, 25)) console.log("    - " + p);
  if (problems.length > 25) console.log("    ... and %d more", problems.length - 25);
}

console.log("\n  %d passed, %d failed\n", pass, fail);
process.exitCode = fail ? 1 : 0;
