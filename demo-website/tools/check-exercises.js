/* The tests run in UTC, because the server does. Set before anything
 * else, so no module captures a date first. */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Homework: the format teachers write it in, and the marking.
//
//      node tools/check-exercises.js
//
//  Two things are being protected here and they are not the same.
//
//  THE FORMAT has to fail loudly. A teacher writes thirty questions on
//  a Sunday evening and finds out on Monday morning whether the site
//  understood them; a question quietly dropped, or one whose answer was
//  guessed at, is worse than an error message. So every way of getting
//  it wrong is listed below with the sentence it should produce, and
//  nothing may be silently repaired.
//
//  THE MARKING has to be right about German. Every rule in it is a
//  decision about what counts as knowing the answer — whether "Der
//  Hund" is the same as "der Hund" (it is not; capitalising the noun
//  and not the article is the question), whether "gruen" is "grün" (it
//  is; a keyboard is not a grammar test). Those judgements are the
//  feature. A wrong one marks a student down for typing.
//
//  No MySQL required.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fmt = require("../lib/exercise-format");

let pass = 0;
let fail = 0;

function ok(label, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

console.log("\nHomework format\n");

// ── The four kinds, from one block a teacher would actually write ────
{
  const text = [
    "# Präsens von sein und kommen",
    "# Setze die richtige Form ein.",
    "",
    "Ich ___ Student.",
    "* bin",
    "  bist",
    "  ist",
    "> „sein“ in der 1. Person Singular.",
    "",
    "Sie ___ aus Italien.",
    "= kommt",
    "",
    "Ich [bin|bist|ist] Student und [komme|kommt] aus Indien.",
    "",
    "Wir ___ nach Berlin und ___ dort.",
    "= fahren",
    "= bleiben",
  ].join("\n");

  const r = fmt.parse(text);

  ok("the first # line is the title", r.title === "Präsens von sein und kommen");
  ok("...and a second one is the instruction students read",
     r.intro === "Setze die richtige Form ein.");
  ok("a page a teacher would really write has no problems in it", r.problems.length === 0);
  ok("four questions, one of each kind", r.questions.length === 4);

  const [a, b, c, d] = r.questions;

  ok("options under a sentence make it multiple choice", a.kind === "choice");
  ok("...with the right answer first, as the placement file has it",
     a.options[0] === "bin" && a.answer === 0);
  ok("...and the > line becomes the explanation",
     a.explain === "„sein“ in der 1. Person Singular.");

  ok("a typed answer makes it a gap to fill", b.kind === "gap");
  ok("...and the accepted answers are a list, for alternatives",
     Array.isArray(b.accept[0]) && b.accept[0][0] === "kommt");

  ok("[choices] in the sentence make it a dropdown", c.kind === "dropdown");
  ok("...one per pair of brackets", c.gaps.length === 2);
  ok("...each keeping its own choices, right one first",
     c.gaps[0].options[0] === "bin" && c.gaps[1].options[0] === "komme");
  ok("...and the brackets stay in the prompt, so the view knows where they were",
     c.prompt.includes("[bin|bist|ist]"));

  ok("two gaps take two answers, in order",
     d.kind === "gap" && d.accept.length === 2 &&
     d.accept[0][0] === "fahren" && d.accept[1][0] === "bleiben");
}

// ── A reading passage ────────────────────────────────────────────────
{
  const r = fmt.parse([
    "# Leseverstehen",
    "~~~",
    "Marco kommt aus Italien.",
    "Er wohnt seit zwei Jahren in München.",
    "~~~",
    "",
    "Woher kommt Marco?",
    "* Aus Italien",
    "  Aus München",
  ].join("\n"));

  ok("a ~~~ block becomes the passage",
     r.passage === "Marco kommt aus Italien.\nEr wohnt seit zwei Jahren in München.");
  ok("...and the questions after it are still questions", r.questions.length === 1);
  ok("...and the passage is not mistaken for one", r.problems.length === 0);
}

// ── Every way of getting it wrong ────────────────────────────────────
//
// Each of these must be REPORTED and the question DROPPED. A question
// the site half-understood is the failure mode worth most of this file:
// it reaches a student looking finished and marks them on an answer
// nobody wrote.
{
  const cases = [
    ["Ich ___ Student.\n  bin\n  bist", /no option is marked with \*/, "nothing marked right"],
    ["Ich ___ Student.\n* bin\n* bist", /only one can be right/, "two marked right"],
    ["Ich ___ Student.\n* bin", /at least two options/, "a single option"],
    ["Ich bin Student.\n= bin", /needs a gap/, "a typed answer with nowhere to type"],
    ["Wir ___ und ___ dort.\n= fahren", /2 gaps but 1 answer/, "fewer answers than gaps"],
    ["Wir ___ dort.\n= fahren\n= bleiben", /1 gap but 2 answers/, "more answers than gaps"],
    ["Ich [bin|bist] Student.\n* bin", /cannot also have options/, "a dropdown with options too"],
    ["Ich [bin] Student.", /separated by \|/, "a dropdown with one choice"],
    ["Ich ___ Student.\n* bin\n= bin", /pick one/, "both an option and a typed answer"],
    ["* bin", /no question above it/, "an answer on its own"],
    ["Ich ___ Student.", /no answer/, "a question with no answer at all"],
    ["Ich ___ Student.\n*", /empty option/, "a bare *"],
    ["Ich ___ Student.\n=", /empty answer/, "a bare ="],
  ];

  for (const [text, expect, label] of cases) {
    const r = fmt.parse(text);
    const said = r.problems.map((p) => p.why).join(" | ");
    ok(`${label} is reported`, expect.test(said));
    ok(`...and ${label} is not turned into a question anyway`, r.questions.length === 0);
    ok(`...and the line number is given for ${label}`,
       r.problems.every((p) => Number.isInteger(p.line)));
  }

  ok("an empty page says so rather than looking successful",
     fmt.parse("").problems.length === 1);
  ok("...and so does a page of only a title",
     fmt.parse("# Hausaufgabe").questions.length === 0 &&
     fmt.parse("# Hausaufgabe").problems.length === 1);
}

// ── Two questions with no blank line between them ────────────────────
//
// The one mistake everybody makes with a format like this.
{
  const r = fmt.parse([
    "Ich ___ Student.",
    "* bin",
    "  bist",
    "Sie ___ aus Italien.",
    "= kommt",
  ].join("\n"));

  ok("a new question at the left margin ends the one above it",
     r.questions.length === 2 && r.problems.length === 0);
  ok("...and the second one did not swallow the first one's options",
     r.questions[0].options.length === 2);
}

console.log("\nMarking German\n");

// ── What counts as knowing the answer ────────────────────────────────
{
  const m = (given, accepted) => fmt.matches(given, accepted);

  // Typing, not German. Forgiven.
  ok("an exact answer is right", m("kommt", ["kommt"]));
  ok("spaces round it are typing", m("   kommt  ", ["kommt"]));
  ok("a trailing full stop is typing", m("kommt.", ["kommt"]));
  ok("a capital on a verb is typing — it may start a sentence",
     m("Kommt", ["kommt"]));
  ok("ue for ü is a keyboard, not a mistake", m("gruen", ["grün"]));
  ok("...and so is ss for ß", m("Strasse", ["Straße"]));
  ok("...and oe and ae likewise", m("schoen", ["schön"]) && m("Maedchen", ["Mädchen"]));
  ok("a real umlaut is right too", m("grün", ["grün"]));
  ok("Ue for Ü at the front of a noun", m("Ueber", ["Über"]));

  // German. Not forgiven.
  ok("the wrong ending is wrong — it is the thing being tested",
     !m("komme", ["kommt"]));
  ok("a different word is wrong", !m("fahren", ["kommt"]));
  ok("a noun without its capital is wrong", !m("hund", ["Hund"]));
  ok("...even spelt out with ue", !m("ueber", ["Über"]));
  ok("an article wrongly capitalised is wrong", !m("Der Hund", ["der Hund"]));
  ok("...and the noun in it still has to be", !m("der hund", ["der Hund"]));
  ok("nothing typed is not an answer", !m("", ["kommt"]) && !m("   ", ["kommt"]));

  // Alternatives the teacher allowed.
  ok("any of the accepted answers counts",
     m("kommen", ["kommt", "kommen"]) && m("kommt", ["kommt", "kommen"]));
  ok("...and something else still does not",
     !m("kommst", ["kommt", "kommen"]));

  /* The capital rule is decided by the EXPECTED answer, not the given
     one, and it looks at the whole of it rather than the first letter.
     The first version asked whether the answer started with a capital,
     which is right for "Hund" and wrong for "der Hund" — the capital is
     on the second word, so it concluded capitals did not matter here
     and accepted "Der Hund". */
  ok("an all-lower-case answer is not testing capitals",
     m("Kommt", ["kommt"]) && m("KOMMT", ["kommt"]));
  ok("an answer with a capital anywhere in it is",
     !m("Der Hund", ["der Hund"]) && m("der Hund", ["der Hund"]));
}

// ── The homework that ships with the site ────────────────────────────
//
// content/homework holds the real chapters, in the same text format.
// They are read by the same parser the editor uses, so a chapter
// somebody edits by hand and gets wrong is a chapter that reaches a
// class with questions silently missing from it — the site would load
// what parsed and quietly drop the rest.
//
// Checked here rather than at load time because the failure is worth
// catching before a deploy, not during one.
{
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "content", "homework");

  let files = 0;
  let questions = 0;

  if (fs.existsSync(root)) {
    for (const book of fs.readdirSync(root)) {
      const dir = path.join(root, book);
      if (!fs.statSync(dir).isDirectory()) continue;

      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
        files++;
        const parsed = fmt.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        questions += parsed.questions.length;

        ok(`${book}/${name} reads without a problem`,
           parsed.problems.length === 0);
        if (parsed.problems.length) {
          for (const p of parsed.problems) console.log(`      line ${p.line}: ${p.why}`);
        }
        ok(`...and has questions in it`, parsed.questions.length > 0);

        /* Every gap has an answer for it.

           The parser already refuses a question whose answer count does
           not match its gaps, so this is belt and braces — but it is the
           one mistake that would mark a whole class wrong, and it costs
           nothing to say out loud. */
        for (const q of parsed.questions) {
          if (q.kind !== "gap") continue;
          const gaps = (q.prompt.match(/_{3,}/g) || []).length;
          ok(`${book}/${name}: "${q.prompt.slice(0, 40)}" has an answer per gap`,
             q.accept.length === gaps && q.accept.every((a) => a.length > 0));
        }
      }
    }
  }

  if (files) {
    console.log(`\n  ${files} chapter(s) shipped, ${questions} questions, all readable`);
  }
}

/* ── What earns a tick ────────────────────────────────────────────
 *
 * 80% of the questions on the best attempt. This has now been three
 * different rules in three days and each earlier one failed the same
 * way — by asking one mark to carry two facts — so the rule is in one
 * place and the boundary is written down here rather than left to be
 * rediscovered from a screenshot.
 */
{
  console.log("\nThe pass mark");
  const ex = require("../lib/exercises");

  ok("6 questions need 5", ex.passMark(6) === 5);
  ok("5 questions need 4", ex.passMark(5) === 4);
  ok("10 questions need 8", ex.passMark(10) === 8);

  const mark = (o) => ex.markOf({ questions: 6, best: null, tries: 0, started: 0, ...o });

  ok("never opened has no mark", mark({}) === "");
  ok("opened and not handed in is part", mark({ started: 1 }) === "part");

  /* The one the student actually queried: every answer given, none of
     them right, and a green tick against it. */
  ok("handed in with 0 of 6 is NOT done", mark({ tries: 1, started: 1, best: 0 }) === "part");
  ok("4 of 6 is under the bar", mark({ tries: 1, started: 1, best: 4 }) === "part");
  ok("5 of 6 is over it", mark({ tries: 1, started: 1, best: 5 }) === "done");
  ok("6 of 6 is done", mark({ tries: 2, started: 2, best: 6 }) === "done");

  /* The best attempt counts, not the last one. Practice is unlimited
     and a bad second go must not take a tick away — that would teach
     people not to practise, which is the opposite of the point. */
  ok("the best attempt is what counts",
     mark({ tries: 3, started: 3, best: 6 }) === "done");

  // An exercise whose questions failed to save must not read as done
  // on the strength of a zero-question attempt.
  ok("no questions is never done",
     ex.markOf({ questions: 0, best: 0, tries: 1, started: 1 }) === "part");
}

/* ── The filters, and their trip through the URL ──────────────────
 *
 * The chapter list beside a worksheet has to show what the contents
 * page was showing, and it has been wrong in both directions: always
 * everything, then always one level. Neither was a choice the student
 * had made. They travel in the query string now, so this is where the
 * reading and the matching are pinned down.
 */
{
  console.log("\nCarrying the filters");
  const ex = require("../lib/exercises");

  const rows = [
    { id: 1, level: "A1", course_title: "German Regular A1", batch_code: "LNRKB01" },
    { id: 2, level: "A2", course_title: "German Regular A1", batch_code: "LNRKB01" },
    { id: 3, level: "A1", course_title: "Fast Track", batch_code: "LNIKB09" },
    // Given to chosen people: no batch and no course at all.
    { id: 4, level: "B1", course_title: null, batch_code: null },
    // The case the old key could not tell apart: the SAME course run
    // as a second class. Row 3 is the other one.
    { id: 5, level: "A1", course_title: "Fast Track", batch_code: "LNIKB10" },
  ];
  const ids = (list) => list.map((r) => r.id).join(",");

  ok("nothing chosen filters nothing",
     ids(ex.within(rows, ex.scope({}))) === "1,2,3,4,5");

  /* The bug the student reported: "All levels" showed only A1. An
     empty level has to mean every level, not the one they happen to
     be sitting. */
  ok("an empty level means every level",
     ids(ex.within(rows, ex.scope({ level: "" }))) === "1,2,3,4,5");

  ok("a level narrows to it", ids(ex.within(rows, ex.scope({ level: "A1" }))) === "1,3,5");
  ok("lower case still matches", ids(ex.within(rows, ex.scope({ level: "a1" }))) === "1,3,5");
  /* On the BATCH, not the course. Two batches can run the same course
     — LNIKB01 and LNIKB02 are both "Fast Track" — and keying on the
     title merged them, so a student on both saw one pile of homework
     with the chapter numbers of two running through it. */
  ok("a batch narrows to it",
     ids(ex.within(rows, ex.scope({ course: "LNRKB01" }))) === "1,2");
  ok("both together narrow together",
     ids(ex.within(rows, ex.scope({ course: "LNRKB01", level: "A1" }))) === "1");

  /* And the book, which is the cut that matters for a chapter with
     no CEFR level of its own. Fast Track runs A1 to B1, so its
     chapters answer to no letter and the list beside an open
     worksheet has to be able to name the book instead. */
  const booked = rows.map((r) => ({ ...r, book: r.id === 3 || r.id === 5 ? "intensive-a1-b1" : "regular-a1" }));
  ok("a book narrows to it",
     ids(ex.within(booked, ex.scope({ book: "intensive-a1-b1" }))) === "3,5");
  ok("an empty book means every book",
     ids(ex.within(booked, ex.scope({ book: "" }))) === "1,2,3,4,5");
  ok("book and course narrow together",
     ids(ex.within(booked, ex.scope({ book: "intensive-a1-b1", course: "LNIKB09" }))) === "3");
  /* It has to survive in the URL or every link on the worksheet
     drops it, and the next page shows the whole library again. */
  ok("...and it travels in the query string",
     /book=intensive-a1-b1/.test(ex.query(ex.scope({ book: "intensive-a1-b1" }))));
  ok("two batches of ONE course stay apart",
     ids(ex.within(rows, ex.scope({ course: "LNIKB09" }))) === "3" &&
     ids(ex.within(rows, ex.scope({ course: "LNIKB10" }))) === "5");

  /* Homework with no course used to key on `undefined`, which put
     every one of them in a group with a blank heading. */
  ok("homework with no batch has a key of its own",
     ex.courseKey(rows[3]) === "—" && ex.courseKey(rows[0]) === "LNRKB01");
  ok("...and can be filtered to", ids(ex.within(rows, ex.scope({ course: "—" }))) === "4");

  // Nothing in the query string is trusted; it can only ever show less.
  ok("a made-up level shows nothing rather than everything",
     ex.within(rows, ex.scope({ level: "Z9" })).length === 0);

  ok("no filters means a clean link", ex.query(ex.scope({})) === "");
  void 0;
  ok("the query string carries what is set",
     ex.query(ex.scope({ level: "A1" })) === "?level=A1");
  ok("...both of them, and anything extra",
     ex.query(ex.scope({ course: "Fast Track", level: "A1" }), { fresh: "1" })
       === "?course=Fast%20Track&level=A1&fresh=1");
}

/* ── Who already has what, and which course it was for ────────────
 *
 * Both need the database, and there is none here — so it is stubbed
 * and what the module ASKS it is checked. That is enough for the two
 * things that have actually gone wrong in this area: a query that
 * cannot run at all, and a match that finds the wrong row.
 *
 * The file is otherwise synchronous, so the summary is moved behind
 * this. A rejected promise nobody waits for is a failure that exits 0
 * while looking green — which has happened here before.
 */
async function givingOut() {
  console.log("\nGiving out");
  const db = require("../lib/db");
  const real = {
    hasColumn: db.hasColumn, isEnabled: db.isEnabled,
    query: db.query, queryOne: db.queryOne,
  };
  db.hasColumn = () => true;
  db.isEnabled = () => true;

  const ex = require("../lib/exercises");

  /* given(): title, then BATCH, then addresses. The middle level is
     the fix — merged on the title alone, a chapter given to LNIKB01
     read "already given" for LNIKB02 as well. */
  db.query = async () => ([
    { title: "A1 · Kapitel 01", intake_id: 12, unlock_emails: "a@b.c,d@e.f" },
    { title: "A1 · Kapitel 01", intake_id: 13, unlock_emails: "g@h.i" },
    { title: "A1 · Kapitel 02", intake_id: null, unlock_emails: "a@b.c" },
  ]);
  db.queryOne = async () => null;

  const chapters = [
    { id: "book/01.txt", title: "A1 · Kapitel 01" },
    { id: "book/02.txt", title: "A1 · Kapitel 02" },
    { id: "book/03.txt", title: "A1 · Kapitel 03" },
  ];
  const has = await ex.given(chapters);

  ok("every chapter is in the answer, including ones nobody has", has.size === 3);

  const ch1 = has.get("book/01.txt");
  ok("two classes' worth of one chapter stay apart", ch1.size === 2);
  ok("...each with only its own people",
     [...ch1.get("12")].sort().join(",") === "a@b.c,d@e.f" &&
     [...ch1.get("13")].sort().join(",") === "g@h.i");
  ok("...and neither leaks into the other", !ch1.get("12").has("g@h.i"));

  // Homework with no batch on it lives under "0".
  ok("a chapter with no batch is keyed 0", has.get("book/02.txt").get("0").size === 1);
  ok("a chapter given to nobody has no batches at all", has.get("book/03.txt").size === 0);

  /* giveOut(): which row it looks for.

     Matching on the title alone meant giving Kapitel 01 to an A1 class
     and then to a Fast Track class updated the same row, and the
     second course silently took the first one's label. */
  const asked = [];
  db.query = async (sql, binds) => { asked.push([sql, binds || []]); return []; };
  db.queryOne = async (sql, binds) => { asked.push([sql, binds || []]); return null; };

  const lookups = () =>
    asked.map((a) => a[0]).filter((q) => /FROM exercises WHERE title/.test(q));

  // A real chapter id, so it gets as far as the lookup.
  const one = ex.library()[0];
  if (one) {
    asked.length = 0;
    await ex.giveOut({ chapters: [one.id], emails: ["a@b.c"], intakeId: null });
    ok("with no course it looks for the row that has none",
       lookups().some((q) => /intake_id IS NULL/.test(q)));

    asked.length = 0;
    await ex.giveOut({ chapters: [one.id], emails: ["a@b.c"], intakeId: 12 });
    const forCourse = asked.find((a) => /FROM exercises WHERE title/.test(a[0]));
    ok("with a course it looks for that course's row",
       !!forCourse && /intake_id = \?/.test(forCourse[0]) && forCourse[1][1] === 12);

    /* And the course reaches the row it writes. It is a label and not
       a permission — the unlock list still decides who can see it —
       but a label that never arrives is no label. */
    const wrote = asked.find((a) => /INSERT INTO exercises|UPDATE exercises/.test(a[0]));
    ok("the course is written with it", !!wrote && wrote[1].includes(12));

    /* ── Giving it out again brings it up to date ──────────────────
     *
     * It used to touch the unlock list, the date and the batch and
     * nothing else, so a chapter written into the database once kept
     * that version for ever. Kapitel 9 went out as 23 questions on
     * one page; the file then grew seven pages, fourteen written
     * tasks and a reading picture, and the student went on seeing the
     * old one with no way to tell and nothing to press.
     *
     * The library is the master copy — it is in the repository and
     * it is what this screen offers — so the row follows it.
     */
    {
      const seenSql = [];
      db.query = async (sql, binds) => { seenSql.push([sql, binds || []]); return []; };
      db.queryOne = async (sql) => {
        if (/FROM exercises WHERE title/.test(sql)) {
          // Already out, with an older version of the text in it.
          return { id: 7, source: "# Something older\n\nIch ___ da.\n= bin\n", unlock_emails: "a@b.c" };
        }
        if (/COUNT\(\*\) AS n FROM exercise_questions/.test(sql)) return { n: 1 };
        return null;
      };

      const again = await ex.giveOut({
        chapters: [one.id], emails: ["a@b.c"], intakeId: 12,
      });

      /* The questions are rewritten, which is the whole point: the
         row kept its old ones and nothing else would have replaced
         them. */
      ok("a chapter already out is rewritten when the library has moved on",
         seenSql.some((q) => /DELETE FROM exercise_questions/.test(q[0])) &&
         seenSql.some((q) => /INSERT INTO exercise_questions/.test(q[0])));
      ok("...and the text written is the library's",
         seenSql.some((q) => /UPDATE exercises SET/.test(q[0]) &&
           (q[1] || []).some((b) => String(b).includes(one.title))));
      /* Said out loud, because it overwrites an edit made in the
         Homework editor and whoever made one has to see that. */
      ok("...and it says so rather than doing it quietly",
         again.ok && /up to date from the library/.test(again.message));

      // Unchanged: nothing to rewrite, so nothing is rewritten.
      seenSql.length = 0;
      db.queryOne = async (sql) => {
        if (/FROM exercises WHERE title/.test(sql)) {
          return { id: 7, source: one.source, unlock_emails: "a@b.c" };
        }
        if (/COUNT\(\*\) AS n FROM exercise_questions/.test(sql)) return { n: 1 };
        return null;
      };
      const same = await ex.giveOut({
        chapters: [one.id], emails: ["a@b.c"], intakeId: 12,
      });
      ok("a chapter that matches the library is left alone",
         !seenSql.some((q) => /DELETE FROM exercise_questions/.test(q[0])) &&
         !/up to date from the library/.test(same.message || ""));
    }

    db.query = async (sql, binds) => { asked.push([sql, binds || []]); return []; };
    db.queryOne = async (sql, binds) => { asked.push([sql, binds || []]); return null; };
  } else {
    ok("the library has a chapter to give out", false);
  }

  /* ── Taking it back ───────────────────────────────────────────
   *
   * The trap here is worth the test on its own. An exercise with an
   * EMPTY unlock list is not private, it is PUBLIC: VISIBLE() reads an
   * empty list as "the ordinary rules apply", and for a chapter with
   * no batch those rules are published-and-any-active-enrolment. So
   * removing the last person from a chapter would hand it to the whole
   * school — the exact opposite of what the button says.
   */
  {
    const seen = [];
    const rows = new Map([
      // Two people on it, no course.
      [1, { id: 1, intake_id: null, unlock_emails: "a@b.c,d@e.f" }],
    ]);
    db.query = async (sql, binds) => {
      seen.push([sql, binds || []]);
      if (/SELECT id, intake_id, unlock_emails/.test(sql)) return [...rows.values()];
      return [];
    };
    db.queryOne = async () => null;

    const chapter = ex.library()[0];

    // One of two removed: still somebody on it, so it stays published.
    seen.length = 0;
    let r = await ex.withdraw({ chapters: [chapter.id], emails: ["a@b.c"] });
    let write = seen.find((q) => /UPDATE exercises SET unlock_emails/.test(q[0]));
    ok("taking one person off leaves the others", !!write && write[1][0] === "d@e.f");
    ok("...and the chapter stays open", !!write && write[1][1] === 1);
    ok("...and it says what happened", r.ok && /1 person/.test(r.message));

    // The last one removed: the list empties, so the chapter closes.
    rows.set(1, { id: 1, intake_id: null, unlock_emails: "a@b.c" });
    seen.length = 0;
    r = await ex.withdraw({ chapters: [chapter.id], emails: ["a@b.c"] });
    write = seen.find((q) => /UPDATE exercises SET unlock_emails/.test(q[0]));
    ok("taking the last person off empties the list", !!write && write[1][0] === "");
    ok("...and CLOSES it, rather than handing it to the whole school",
       !!write && write[1][1] === 0);
    ok("...and says so", r.ok && /closed/.test(r.message));

    /* A chapter with a BATCH on it closes too, and this case used to
       assert the opposite.
     *
     * The old rule was "empty AND no batch", on the reasoning that a
     * chapter given to a batch keeps its batch audience. giveOut()
     * says otherwise in its own comment: the course "labels the
     * homework; it does not decide who can see it. The unlock list
     * still does that."
     *
     * So giving treated the batch as a label and taking back treated
     * it as an audience, and an empty unlock list means "not
     * restricted" to VISIBLE(). Taking a chapter off the last person
     * therefore published it to the WHOLE CLASS. Reported from the
     * live site as "i take it out but still it shows in the portal"
     * -- it did not still show, it had just been given to more
     * people, which is the worst possible reading of Lock. */
    rows.set(1, { id: 1, intake_id: 12, unlock_emails: "a@b.c" });
    seen.length = 0;
    await ex.withdraw({ chapters: [chapter.id], emails: ["a@b.c"] });
    write = seen.find((q) => /UPDATE exercises SET unlock_emails/.test(q[0]));
    ok("a chapter with a batch on it closes as well",
       !!write && write[1][0] === "" && write[1][1] === 0);

    /* ...and one that never had an unlock list is not touched at all,
       which is what keeps this from closing homework somebody
       deliberately published to a class. */
    rows.set(1, { id: 1, intake_id: 12, unlock_emails: "" });
    seen.length = 0;
    await ex.withdraw({ chapters: [chapter.id], emails: ["a@b.c"] });
    ok("...but one published to a batch and never unlocked is left alone",
       !seen.some((q) => /UPDATE exercises SET unlock_emails/.test(q[0])));

    // Somebody who never had it.
    rows.set(1, { id: 1, intake_id: null, unlock_emails: "a@b.c" });
    seen.length = 0;
    r = await ex.withdraw({ chapters: [chapter.id], emails: ["nobody@here.com"] });
    ok("taking it off somebody who never had it changes nothing",
       r.ok && /nothing changed/.test(r.message) &&
       !seen.some((q) => /UPDATE exercises SET unlock_emails/.test(q[0])));

    // Nothing is deleted, ever. A score is a record of what somebody
    // knew and taking a chapter back is not a reason to rewrite it.
    ok("nothing is deleted by taking a chapter back",
       !seen.some((q) => /DELETE/i.test(q[0])));

    /* The message says WHICH course it came off.

       Lock takes a chapter off one course's copy, which is right. But
       the confirmation said only "41 people taken off the chapters
       ticked", so somebody who had just taken everything off LNIKB02
       went to a student's portal, found fifty-two chapters still there
       under LNIKB01, and reasonably concluded it was broken. */
    rows.set(1, { id: 1, intake_id: 12, unlock_emails: "a@b.c" });
    db.queryOne = async (sql) => (/FROM intakes i/.test(sql)
      ? { code: "LNIKB02", course_title: "Fast Track" } : null);
    const named = await ex.withdraw({
      chapters: [chapter.id], emails: ["a@b.c"], intakeId: 12,
    });
    ok("it says which course it came off",
       named.ok && /LNIKB02/.test(named.message) && /Fast Track/.test(named.message));
    ok("...and that the other courses still have it",
       /other courses are untouched/.test(named.message));

    // ...including when it changed nothing, which is the case that
    // looks most like a bug.
    rows.set(1, { id: 1, intake_id: 12, unlock_emails: "somebody@else.com" });
    const none2 = await ex.withdraw({
      chapters: [chapter.id], emails: ["a@b.c"], intakeId: 12,
    });
    ok("a lock that changed nothing says where to look instead",
       none2.ok && /LNIKB02/.test(none2.message) && /other courses/.test(none2.message));

    db.queryOne = async () => null;

    /* "Every course" — the one answer that takes it all back.

       Without it there was no single action for "this person has not
       paid, take their access away": somebody took every chapter off
       LNIKB02, opened the student's portal expecting nothing, and
       found fifty-two still there under LNIKB01. Correct, and
       indistinguishable from broken. */
    {
      const asked = [];
      const many = [
        { id: 1, intake_id: 12, unlock_emails: "a@b.c" },
        { id: 2, intake_id: 13, unlock_emails: "a@b.c,d@e.f" },
        { id: 3, intake_id: null, unlock_emails: "a@b.c" },
      ];
      db.query = async (sql, binds) => {
        asked.push([sql, binds || []]);
        return /SELECT id, intake_id, unlock_emails/.test(sql) ? many : [];
      };
      db.queryOne = async () => null;

      const all = await ex.withdraw({
        chapters: [chapter.id], emails: ["a@b.c"], intakeId: "all",
      });

      const look = asked.find((q) => /SELECT id, intake_id, unlock_emails/.test(q[0]));
      ok("every course looks at every row of the chapter",
         !!look && !/intake_id/.test(look[0].split("WHERE")[1] || ""));

      const writes = asked.filter((q) => /UPDATE exercises SET unlock_emails/.test(q[0]));
      ok("...and writes to all three of them", writes.length === 3);
      ok("...leaving the people who were not ticked",
         writes.some((w) => w[1][0] === "d@e.f"));
      /* Two of the three empty out — rows 1 and 3, both of which had
         only a@b.c — and both close. Row 2 keeps d@e.f and stays
         open. "Take this person's access away" has to mean away, not
         away from the list and over to the class. */
      ok("...closing every one the list empties, batch or not",
         writes.filter((w) => w[1][1] === 0).length === 2);
      ok("it says it was every course", all.ok && /every course/.test(all.message));
      ok("...and does not send anybody looking elsewhere",
         !/other courses are untouched/.test(all.message));
    }

    const noChapter = await ex.withdraw({ chapters: [], emails: ["a@b.c"] });
    ok("no chapter ticked is refused in words",
       !noChapter.ok && /chapter/i.test(noChapter.reason));
    const noPerson = await ex.withdraw({ chapters: [chapter.id], emails: [] });
    ok("no person ticked is refused in words",
       !noPerson.ok && /person/i.test(noPerson.reason));
  }

  /* ── Where a student stands ───────────────────────────────────
   *
   * Two things are being protected and the second one matters more.
   *
   * THE ORDER has to reward doing the work: chapters PASSED at the
   * same 80% the tick uses, so opening forty and finishing none moves
   * nobody anywhere, and a tie breaks on accuracy.
   *
   * THE PRIVACY is the one that cannot be got wrong quietly. This
   * feeds a page a student looks at, and a class leaderboard with
   * names on it is a weekly public ranking of the slowest learner in
   * the room. Nothing that comes back may carry another student's
   * name, email, or reference — so that is asserted on the whole
   * returned object rather than trusted to the template.
   */
  {
    const roster = [
      // id, chapters passed, right, asked
      { student_id: 7, passed: 8, done: 11, got: 60, asked: 70 },   // us
      { student_id: 8, passed: 11, done: 12, got: 70, asked: 72 },  // ahead
      { student_id: 9, passed: 8, done: 9, got: 50, asked: 70 },    // level, less accurate
      { student_id: 10, passed: 2, done: 3, got: 10, asked: 18 },
    ];

    db.query = async (sql) => {
      if (/FROM enrolments en/.test(sql) && /JOIN intakes/.test(sql)) {
        return [{ id: 12, code: "LNRKB02", course_title: "German Regular A2" }];
      }
      if (/exercise_attempts/.test(sql)) return roster;
      return [];
    };
    db.queryOne = async (sql) => (/COUNT\(\*\) AS n FROM enrolments/.test(sql)
      ? { n: 12 } : null);

    const st = await ex.standings(7);

    /* ONE set of figures, and a place in each class.

       These used to come back once per batch, and every copy was
       identical: passed, done, got and asked are counted from the
       student's own attempts and the batch only decides who they are
       measured against. Three classes drew three cards with the same
       bar in them. */
    ok("the figures are the student's own, and there is one set of them",
       st && st.passed === 8 && st.done === 11 && !Array.isArray(st));
    ok("accuracy is a whole per cent", st.accuracy === 86);
    ok("it answers for the class the student is in",
       st.classes.length === 1 && st.classes[0].batch.code === "LNRKB02");

    /* Second: one person has passed more, and the one level with us on
       chapters got less of it right, so we are ahead of them. */
    ok("the order is chapters passed, then accuracy", st.classes[0].rank === 2);
    ok("the class size counts people who have done nothing too", st.classes[0].of === 12);
    ok("the best in the class is reported as a bare number", st.classes[0].top === 11);

    /* Nobody else's name, address or reference, anywhere in it. */
    const printed = JSON.stringify(st);
    ok("no other student can be identified from it",
       !/name|email|student_ref|LNS\d/i.test(printed));

    /* A tie shares a place. Ranking two people level on both a hidden
       tiebreak would tell somebody they are behind a person they are
       level with. */
    roster[2] = { student_id: 9, passed: 8, done: 11, got: 60, asked: 70 };
    const tied = await ex.standings(7);
    ok("people who are exactly level share a place", tied.classes[0].rank === 2);

    // Somebody who has finished nothing is last, not missing.
    const none = await ex.standings(99);
    ok("having done nothing puts you last rather than nowhere",
       none.classes[0].rank === roster.length + 1 && none.passed === 0);
    ok("...and their accuracy is null, not 0%", none.accuracy === null);

    /* Several classes, biggest first: a place out of six says
       something and a place out of one says nothing, so the one worth
       leading the card with is the one with the most people in it. */
    db.query = async (sql) => {
      if (/FROM enrolments en/.test(sql) && /JOIN intakes/.test(sql)) {
        return [
          { id: 1, code: "LNRKB02", course_title: "German Regular A2" },
          { id: 2, code: "LNIKB01", course_title: "Fast Track" },
        ];
      }
      if (/exercise_attempts/.test(sql)) return roster;
      return [];
    };
    let sizes = [3, 9];
    let at = 0;
    db.queryOne = async (sql) => (/COUNT\(\*\) AS n FROM enrolments/.test(sql)
      ? { n: sizes[at++] } : null);

    const many = await ex.standings(7);
    ok("a student in two classes gets one set of figures and two places",
       many.classes.length === 2 && typeof many.passed === "number");
    /* `of` is the roster or the number of people with attempts,
       whichever is larger — a class of three where four people have
       handed something in is not a class of three. So the assertion is
       the ORDER, which is what the card depends on. */
    ok("...with the biggest class first",
       many.classes[0].of > many.classes[1].of &&
       many.classes[0].batch.code === "LNIKB01");

    // No class, no standing at all.
    db.query = async () => [];
    ok("a student in no class has no standing", (await ex.standings(7)) === null);
  }

  /* The guards, which are the same whichever course it is for. */
  const noOne = await ex.giveOut({ chapters: ["x"], emails: [] });
  ok("nobody ticked is refused in words", !noOne.ok && /person/i.test(noOne.reason));

  const nothing = await ex.giveOut({ chapters: [], emails: ["a@b.c"] });
  ok("nothing ticked is refused in words", !nothing.ok && /chapter/i.test(nothing.reason));

  // An address without an @ is not an address.
  const junk = await ex.giveOut({ chapters: ["x"], emails: ["not-an-address"] });
  ok("a junk address counts as nobody", !junk.ok && /person/i.test(junk.reason));

  Object.assign(db, real);
}

/* ── The books ────────────────────────────────────────────────────
 *
 * The school teaches two programmes out of two different sets of
 * chapters. Until a folder could say which it belonged to, the only
 * grouping was its name and the only filter was the CEFR level --
 * which puts Regular A1 and Intensive A1 in one undifferentiated list
 * and gives nobody a way to hand somebody "the A2 book".
 */
function theBooks() {
  console.log("\nThe books");
  const ex = require("../lib/exercises");
  const books = ex.books();
  const bySlug = new Map(books.map((b) => [b.slug, b]));

  ok("there is at least one", books.length > 0);

  /* A book names a COURSE and inherits the rest. One source of truth,
     so a book cannot come to be called something the course page does
     not call it -- and so "put this in Regular, German A1" is one slug
     rather than three fields kept in step by hand. */
  const content = require("../lib/content");
  const catalogue = content.courses("en") || [];
  const intensive = bySlug.get("intensive-a1-b1");

  ok("a manifest names a course", intensive && intensive.course === "intensive-courses");
  ok("...and every course it names is really in the catalogue",
     books.length > 0 &&
     books.every((b) => !b.course || (b.known && catalogue.some((c) => c.slug === b.course))));

  const fastTrack = catalogue.find((c) => c.slug === "intensive-courses");
  ok("...the title comes from the catalogue, not the folder",
     intensive && fastTrack && intensive.title === fastTrack.title);
  ok("...and so does the programme",
     intensive && fastTrack && intensive.track === fastTrack.track &&
     intensive.track === "Intensive");

  /* Fast Track is A1-B1 and the catalogue gives it no single level,
     which is exactly what the override is for. */
  ok("...with the manifest's level where the course has none",
     intensive && !fastTrack.level && intensive.level === "A1\u2013B1");

  /* A folder with a manifest and no chapters is a slot, not a book.
     The Regular levels are reserved on disk so there is one obvious
     place to put each workbook when it arrives, and offering an empty
     one would be offering nothing. B2 upwards are still slots; A1 to
     B1 hold the workbook that was split across them. */
  ok("an empty book is not offered", !bySlug.has("regular-c2"));
  ok("...and a filled one is", bySlug.has("regular-a1"));

  /* sort first, so Regular A1 comes before Regular A2 and both before
     Intensive -- an order neither the slugs nor the titles give. */
  const sorted = books.map((b) => b.sort);
  ok("they come in the order the manifests ask for",
     sorted.every((n, i) => i === 0 || sorted[i - 1] <= n));

  const lib = ex.library();
  ok("every chapter knows its book",
     lib.length > 0 && lib.every((c) => c.book && c.bookTitle));
  ok("...and the programme it belongs to",
     lib.every((c) => c.track === (bySlug.get(c.book) || {}).track));
  /* The chapter's own level wins over the book's: a chapter titled
     "A2 Kapitel 07" is A2 whatever the cover says. Only one that
     names no level falls back to the book. */
  ok("a chapter's own level wins over the cover",
     lib.filter((c) => /A1/.test(c.title)).every((c) => c.level === "A1"));
}

givingOut().then(theBooks).then(() => {
  console.log(fail ? `\n  ${pass} passed, ${fail} failed` : `\n  ${pass} passed, 0 failed`);
  process.exitCode = fail ? 1 : 0;
});
