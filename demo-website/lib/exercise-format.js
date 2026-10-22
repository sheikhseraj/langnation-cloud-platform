// ─────────────────────────────────────────────────────────────────────
//  Homework, written as text.
//
//  The marking is the easy half. The half that decides whether any of
//  this saves a teacher time is WRITING the questions: a form with a
//  prompt field, four option fields, a right-answer tick and an
//  explanation box is perhaps ninety seconds a question, and a week's
//  homework is thirty questions. That is the marking time moved, not
//  removed.
//
//  So an exercise is a block of text, typed or pasted, and the KIND of
//  each question is inferred from how the answer is written rather than
//  chosen from a menu:
//
//      Ich ___ Student.          ← a gap, and options under it
//      * bin                     ← the * is the right one
//        bist                    ← multiple choice
//        ist
//      > „sein" in der 1. Person Singular.   ← why (optional)
//
//      Sie ___ aus Italien.      ← a gap and a typed answer
//      = kommt                   ← fill in the blank
//
//      Ich [bin|bist|ist] Student.   ← a dropdown inside the sentence
//
//      ! /img/homework/markt.jpg  ← a picture above the question
//
//      Schreibe den Satz neu.    ← a task with no single right answer
//      ~ Ich fahre nicht mit dem Auto.   ← ONE correct version, shown
//                                          when the student asks, and
//                                          never marked
//
//      ## Übung 3 – Stellung von nicht   ← a new page, under this
//                                            heading
//
//  Nothing to memorise: write the sentence, and how you write the
//  answer decides the type. The markers are * (this option is right),
//  = (type this), ~ (one correct version, unmarked), > (why),
//  ! (a picture) and ## (start a new page).
//
//  ── Why ~ exists ────────────────────────────────────────────────────
//
//  "Aktiv → Passiv", "Beginne mit dem Ort", "Korrigiere den Fehler" —
//  the workbooks are full of these and they are the half that was
//  being thrown away, because a model answer marked as THE answer
//  fails a student who wrote a different correct sentence.
//
//  So they are not marked at all. The student writes, asks to see it,
//  and gets the teacher's version labelled as one way of doing it.
//  They count for nothing in the score, which is what keeps the pass
//  mark honest: a chapter is not 60% because a third of it could not
//  be marked either way.
//
//  ── Conventions kept from the placement test ────────────────────────
//
//  The correct option is written FIRST, as content/placement-questions
//  .json already does, so a file of them can be reviewed by eye. The
//  server shuffles before serving. And the answer never travels: this
//  module parses on the server, and what reaches the browser is built
//  by stripping the answers out (see forStudent below).
//
//  This file invents nothing. It reads what a teacher wrote and says
//  what it could not understand; it never guesses at a missing answer,
//  fills in an option, or writes an explanation.
// ─────────────────────────────────────────────────────────────────────
"use strict";

/** The kinds of question this understands. */
const KINDS = ["choice", "gap", "dropdown"];

/* A gap in a sentence: three or more underscores.

   Three rather than one, because a single underscore turns up inside
   ordinary German compound examples and file names, and a rule that
   fires on those would break sentences nobody meant as questions. */
const GAP = /_{3,}/;

/* A dropdown written inline: [bin|bist|ist].

   Square brackets because they almost never appear in a German
   sentence, and because the alternatives are visibly IN the sentence,
   which is the point — a dropdown is a choice made in place. */
const INLINE = /\[([^\][]+\|[^\][]*)\]/g;

/**
 * Turn a block of text into an exercise.
 *
 * Returns { title, intro, passage, questions, problems }. `problems`
 * is the important half: a line this could not make sense of is
 * reported with its number and left out, never guessed at. An exercise
 * with problems is still returned so the preview can show what did
 * work beside what did not.
 */
function parse(text) {
  if (/^@reading\s*$/m.test(String(text))) {
    try {
      const data = JSON.parse(String(text).split(/^@reading\s*$/m)[1]);
      const learning = require('./reading-content').chapter(data);
      return {title:learning.title,intro:data.presentation?.instructions||'',passage:'',learning,problems:[],pages:[],
        questions:learning.sections[0].questions.map(q=>({kind:'gap',prompt:q.prompt,accept:[['structured']]}))};
    } catch(e) {return {title:'',questions:[],problems:[{line:1,why:e.message}]};}
  }
  if (/^@learning\s*$/m.test(String(text))) {
    try {
      const learning = require('./homework-engine').validate(JSON.parse(String(text).split(/^@learning\s*$/m)[1]));
      return { title:learning.title, intro:'', passage:learning.passage||'', image:learning.passageImage||'', passagePage:learning.sections.length,
        learning, problems:[], pages:learning.sections.map(s=>({title:s.title,intro:s.instruction})),
        questions:learning.sections.flatMap((s,index)=>s.questions.map(q=>({
          kind:'gap', prompt:q.prompt.includes('___')?q.prompt:q.prompt+' ___',
          accept:Array.from({length:(q.prompt.match(/___/g)||['___']).length},(_,i)=>q.accepted?.map(a=>Array.isArray(a)?a[i]:a)||['structured']),
          page:index+1,pageTitle:s.title,pageIntro:s.instruction,explain:q.feedback
        }))) };
    } catch(e) { return {title:'',questions:[],problems:[{line:1,why:e.message}]}; }
  }
  const lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");

  const out = { title: "", intro: "", passage: "", image: "", passagePage: 0,
                questions: [], problems: [] };
  let current = null;
  let inPassage = false;
  const passageLines = [];
  /* The pages, in order. A question belongs to whichever is open when
     it is read; anything before the first ## belongs to page one. */
  const pages = [];

  const fail = (line, why) => out.problems.push({ line, why });

  const finish = () => {
    if (!current) return;
    const done = settle(current, fail);
    if (done) {
      /* Page numbers start at one whether or not anybody wrote a ##,
         so everything downstream can group by page without caring
         which kind of chapter it is looking at. */
      done.page = Math.max(1, pages.length);
      done.pageTitle = pages.length ? pages[pages.length - 1].title : "";
      done.pageIntro = pages.length ? pages[pages.length - 1].intro : "";
      out.questions.push(done);
    }
    current = null;
  };

  lines.forEach(function (raw, i) {
    const no = i + 1;
    const line = raw.replace(/\s+$/, "");
    const body = line.trim();

    // A passage: everything between ~~~ fences, shown above the
    // questions. This is what makes a reading exercise a reading
    // exercise rather than a list of sentences.
    if (body === "~~~") {
      inPassage = !inPassage;
      if (inPassage) {
        finish();
        /* Which page the text sits on. A reading page has no
           questions, so it would not otherwise exist: the page list
           is derived from the questions, and deriving it from
           nothing gives nothing. */
        out.passagePage = Math.max(1, pages.length);
      }
      return;
    }
    if (inPassage) {
      /* A picture inside the fences is the text's illustration, not a
         line of the text. Without this the address was printed as
         prose in the middle of the passage. */
      if (body.startsWith("!")) {
        const src = body.slice(1).trim();
        if (src) out.image = src;
        else fail(no, "a picture with no address after the !");
        return;
      }
      passageLines.push(line);
      return;
    }

    if (!body) {
      // A blank line ends a question. Two questions running together
      // with no gap between them is the one thing a reader of this
      // format gets wrong, and it is worth being strict about.
      finish();
      return;
    }

    /* ## starts a new page, and names it.
     *
     * Checked before #, which would otherwise swallow it: one hash is
     * the chapter title and anything after it is the instruction, and
     * "## Übung 2" read that way became a second sentence of intro.
     *
     * A chapter without a single ## is one page, exactly as before. */
    if (body.startsWith("##")) {
      finish();
      pages.push({ title: body.replace(/^#+\s*/, "").trim(), intro: "" });
      return;
    }

    /* # Title, and anything after it before the first question is the
       instruction line students read.

       Inside a page it is that PAGE's instruction instead — "Ergänze
       die richtige Negation" belongs over Übung 1 and nowhere else,
       and appending it to the chapter intro put all seven Übungen's
       instructions in one sentence at the top.

       ### was the obvious spelling for this and is not available:
       startsWith("##") catches it, so a three-hash line would have
       opened a page named after the instruction. */
    if (body.startsWith("#")) {
      finish();
      const t = body.replace(/^#+\s*/, "").trim();
      if (pages.length) {
        const pg = pages[pages.length - 1];
        pg.intro = pg.intro ? pg.intro + " " + t : t;
      } else if (!out.title) out.title = t;
      else out.intro = out.intro ? out.intro + " " + t : t;
      return;
    }

    /* A picture, above the question it belongs to.

       Vocabulary is the obvious use — a photograph of a market beats
       the word "Markt" — and it is the one thing a text format cannot
       carry itself. So it carries an address instead: an image the
       school already hosts, or any URL the teacher pastes. */
    if (body.startsWith("!")) {
      const src = body.slice(1).trim();
      if (!src) {
        fail(no, "a picture with no address after the !");
        return;
      }
      if (current) current.image = src;
      else out.image = src;
      return;
    }

    if (body.startsWith("*") || body.startsWith("=") || body.startsWith(">") ||
        body.startsWith("~")) {
      if (!current) {
        fail(no, "an answer with no question above it");
        return;
      }
      const value = body.slice(1).trim();
      if (body.startsWith(">")) {
        current.explain = current.explain ? current.explain + " " + value : value;
        return;
      }
      if (!value) {
        fail(no, body.startsWith("*") ? "an empty option"
          : body.startsWith("~") ? "an empty model answer" : "an empty answer");
        return;
      }
      /* One correct version, not the correct one. More than one may be
         given and all of them are shown. */
      if (body.startsWith("~")) { current.shown.push(value); return; }
      if (body.startsWith("*")) current.options.push({ text: value, right: true });
      else current.accept.push(value.split("|").map(trim).filter(Boolean));
      return;
    }

    // An indented line under a question is another option. At the left
    // margin it is a new question.
    const indented = /^\s/.test(raw);
    if (current && indented) {
      current.options.push({ text: body, right: false });
      return;
    }

    finish();
    current = { line: no, prompt: body, options: [], accept: [], shown: [], explain: "", image: "" };
  });

  finish();
  out.passage = passageLines.join("\n").trim();
  /* The pages as written, including any with no questions on them —
     a reading page is one, and deriving the list from the questions
     cannot see it. */
  out.pages = pages.map((p, i) => ({ no: i + 1, title: p.title, intro: p.intro }));

  if (!out.questions.length && !out.problems.length) {
    out.problems.push({ line: 0, why: "there are no questions here yet" });
  }
  return out;
}

const trim = (s) => String(s).trim();

/**
 * Work out what kind of question this is, and check it holds together.
 *
 * Returns the question, or null when it could not be understood — in
 * which case `fail` has been told why. Nothing is ever repaired by
 * guessing: a question with two right answers marked is reported, not
 * quietly reduced to one.
 */
function settle(q, fail) {
  /* An open task, settled first: it has no gap to check and no option
     to count, and everything below would reject it for that. */
  if (q.shown.length) {
    if (q.options.length || q.accept.length) {
      fail(q.line, "this has both a marked answer (* or =) and a model answer (~) — pick one");
      return null;
    }
    return {
      kind: "open",
      prompt: q.prompt,
      /* "shown", not "accept": nothing is compared against these. The
         student sees them when they ask and marks themselves. */
      shown: q.shown,
      explain: q.explain,
      image: q.image,
    };
  }

  const inline = [...q.prompt.matchAll(INLINE)];

  /* [bin] with no | is somebody reaching for a dropdown and stopping
     one character short. Without this it falls through to "no answer",
     which is true and unhelpful — the mistake is right there in the
     sentence and the message should point at it. */
  if (!inline.length && /\[[^\][]*\]/.test(q.prompt)) {
    fail(q.line, "a [dropdown] needs at least two choices, separated by | — [bin|bist|ist]");
    return null;
  }

  if (inline.length) {
    if (q.options.length || q.accept.length) {
      fail(q.line, "a sentence with [choices] in it cannot also have options under it");
      return null;
    }
    const gaps = inline.map(function (m) {
      const parts = m[1].split("|").map(trim).filter(Boolean);
      return { options: parts, answer: 0 };
    });
    if (gaps.some((g) => g.options.length < 2)) {
      fail(q.line, "a [dropdown] needs at least two choices, separated by |");
      return null;
    }
    return {
      kind: "dropdown",
      // The brackets stay in the prompt: the view replaces each one
      // with a select, and it has to know where they were.
      prompt: q.prompt,
      gaps,
      explain: q.explain,
      image: q.image,
    };
  }

  if (q.options.length) {
    if (q.accept.length) {
      fail(q.line, "this has both options (*) and a typed answer (=) — pick one");
      return null;
    }
    const right = q.options.filter((o) => o.right);
    if (!right.length) {
      fail(q.line, "no option is marked with * as the right one");
      return null;
    }
    if (right.length > 1) {
      fail(q.line, "more than one option is marked with * — only one can be right");
      return null;
    }
    if (q.options.length < 2) {
      fail(q.line, "a question needs at least two options");
      return null;
    }
    // Correct first, as the placement question file does, so a teacher
    // can review a page of these by eye. Shuffled when served.
    const others = q.options.filter((o) => !o.right).map((o) => o.text);
    return {
      kind: "choice",
      prompt: q.prompt,
      options: [right[0].text, ...others],
      answer: 0,
      explain: q.explain,
      image: q.image,
    };
  }

  if (q.accept.length) {
    if (!GAP.test(q.prompt)) {
      fail(q.line, "a typed answer needs a gap in the sentence — write ___ where it goes");
      return null;
    }
    const gaps = q.prompt.match(new RegExp(GAP.source, "g")) || [];
    if (gaps.length !== q.accept.length) {
      fail(
        q.line,
        `the sentence has ${gaps.length} gap${gaps.length === 1 ? "" : "s"} ` +
          `but ${q.accept.length} answer${q.accept.length === 1 ? "" : "s"} under it`
      );
      return null;
    }
    return { kind: "gap", prompt: q.prompt, accept: q.accept, explain: q.explain, image: q.image };
  }

  fail(q.line, "no answer: options with *, a typed answer with =, or a model answer with ~");
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   Marking.

   German makes this less obvious than it looks, and every rule below
   is a decision about what counts as knowing the answer:

     - Case matters on nouns and not on anything else. "Der Hund" for
       "der Hund" is right; "hund" is not, because capitalising nouns
       IS the grammar. So the comparison is case-sensitive only when
       the expected answer starts with a capital.
     - ue is ü, oe is ö, ae is ä, ss is ß. A student on a keyboard
       without umlauts has not got it wrong.
     - Spacing and the odd trailing full stop are typing, not German.

   What is NOT forgiven: a different word, a different ending, a
   missing article. Those are the thing being tested.
   ═══════════════════════════════════════════════════════════════════ */

const FOLD = [
  [/ä/g, "ae"], [/ö/g, "oe"], [/ü/g, "ue"], [/ß/g, "ss"],
  [/Ä/g, "Ae"], [/Ö/g, "Oe"], [/Ü/g, "Ue"],
];

/**
 * Trim, collapse spaces, drop a trailing full stop, spell out umlauts.
 *
 * Case is kept: whether it matters is the caller's decision, and it
 * cannot be made here because it depends on the expected answer.
 */
function normalise(s) {
  let t = String(s == null ? "" : s).trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  for (const [from, to] of FOLD) t = t.replace(from, to);
  return t;
}

/**
 * Does this typed answer count as right?
 *
 * Capitals are checked when the expected answer has one ANYWHERE in it,
 * not only at the front. The first version asked whether the answer
 * STARTED with a capital, which is right for "Hund" and wrong for "der
 * Hund" — the capital is on the second word, so the test decided
 * capitals did not matter and accepted "Der Hund". Capitalising the
 * noun and not the article is the whole of that question.
 *
 * When the expected answer is all lower case there is nothing to test,
 * so "Kommt" at the start of a sentence is accepted for "kommt".
 */
function matches(given, accepted) {
  const g = normalise(given);
  if (!g) return false;

  return accepted.some(function (a) {
    const want = normalise(a);
    const casing = /[A-ZÄÖÜ]/.test(want);
    return casing ? g === want : g.toLowerCase() === want.toLowerCase();
  });
}

module.exports = { parse, matches, normalise, KINDS, GAP, INLINE };
