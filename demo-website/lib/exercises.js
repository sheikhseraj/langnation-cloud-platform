// ─────────────────────────────────────────────────────────────────────
//  Homework: storing it, serving it, marking it.
//
//  ── The answer never travels ────────────────────────────────────────
//
//  forStudent() strips `accept`, and rewrites a choice question's
//  options into the shuffled order the student will see with the
//  correct index dropped. Marking happens here, against the row. The
//  same rule lib/placement.js is built on, and for the same reason:
//  anything sent to the browser can be read out of the page source by
//  a fourteen-year-old with a right mouse button.
//
//  A dropdown is the awkward one — its choices are IN the sentence and
//  have to be shown. What is hidden there is not the options but WHICH
//  of them is right: they are shuffled, and the answer index stays on
//  the server.
//
//  ── Practice, not a test ────────────────────────────────────────────
//
//  Unlimited attempts, because that is what this is for: the student
//  sees why they were wrong and goes again. Real tests are on paper.
//
//  Which makes one thing matter. Within an attempt, the FIRST answer to
//  a question is the one recorded and it is never overwritten —
//  `exercise_answers` has a unique key on (attempt, question) and this
//  writes with INSERT IGNORE. Without that, a student who tried all
//  four options would finish with full marks, and the teacher's "six of
//  eight got question 7 wrong" — the only number here that saves anybody
//  any time — would always read zero.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");
const fmt = require("./exercise-format");

/** Reads must never take a page down; an empty panel is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Exercises: ${label} failed:`, e.message);
    return fallback;
  }
}

/** Whether this database has been through migration 28. */
const READY = () => db.hasColumn("exercises.published");

/** ...and 29, which added the unlock list. */
const HAS_UNLOCK = () => db.hasColumn("exercises.unlock_emails");

/* Migration 35. A database without it has no pages and no open
   tasks, and every chapter on it is one page of marked questions —
   which is what every chapter was until this existed. */
const HAS_PAGES = () => db.hasColumn("exercise_questions.page");

/* Who may see an exercise.
 *
 * Two rules, and the second one narrows rather than widens:
 *
 *   unlock_emails empty  → published, and enrolled on its batch.
 *   unlock_emails set    → ONLY those addresses, and for them the
 *                          enrolment and the published flag are both
 *                          bypassed.
 *
 * The bypass is the point. A teacher wants to sit their own homework
 * the way a student will, before a class gets it — which means seeing
 * a draft, on a batch they are not on. Everybody else sees nothing,
 * enrolled or not, so filling the box in can only ever make an
 * exercise more private.
 *
 * FIND_IN_SET against a cleaned list rather than LIKE: LIKE '%a@b.c%'
 * matches "not-a@b.com" and would hand somebody else's homework to the
 * wrong person. The list is normalised in SQL — newlines to commas,
 * spaces stripped, lower-cased — because it is a textarea somebody
 * typed into and it arrives however they left it.
 */
const ONE_BATCH = "e.published = 1 AND en.id IS NOT NULL AND en.status = 'active'";

/* Homework with no batch on it is for everybody who is studying.
 *
 * "Everybody" means an active enrolment on any batch, not every account
 * ever made: somebody who finished a course last year is not a student
 * with homework, and somebody who registered and never enrolled has no
 * course for it to belong to. */
const ANY_BATCH = `e.published = 1 AND e.intake_id IS NULL AND EXISTS (
    SELECT 1 FROM enrolments any_en
     WHERE any_en.student_id = ? AND any_en.status = 'active')`;

const VISIBLE = () =>
  HAS_UNLOCK()
    ? `((COALESCE(TRIM(e.unlock_emails), '') = ''
          AND ((e.intake_id IS NOT NULL AND ${ONE_BATCH}) OR (${ANY_BATCH})))
        OR FIND_IN_SET(LOWER(?), REPLACE(REPLACE(REPLACE(
             LOWER(COALESCE(e.unlock_emails, '')), CHAR(13), ''), CHAR(10), ','), ' ', '')) > 0)`
    : `((e.intake_id IS NOT NULL AND ${ONE_BATCH}) OR (${ANY_BATCH}))`;

/* The bind VISIBLE() wants, or nothing before migration 29. Kept
   beside it, because the number of placeholders changes with it. */
/* The binds VISIBLE() wants, in order: the student id for the
   "everybody" arm, then the email for the unlock arm. Kept beside it,
   because the number of placeholders changes with it and a bind list
   that is merely the right length can still be the wrong order. */
const VISIBLE_BINDS = (studentId, email) =>
  HAS_UNLOCK() ? [studentId, String(email || "")] : [studentId];

/* The order a workbook is in: A1 Kapitel 01 first, B1 Kapitel 43 last.
 *
 * It used to lead on the due date, which put whatever was set most
 * recently at the top and read as a shuffle — a student opening
 * Kapitel 41 before Kapitel 01. A workbook has an order and it is the
 * order it teaches in; the due date is still on every row, and one
 * that has passed is still said in red.
 *
 * Sorted on the title because the chapters are numbered inside it and
 * the numbers are zero-padded ("Kapitel 01"), so plain text order is
 * chapter order. Level leads it so that an exercise with no level on
 * it — one somebody typed by hand — sorts last rather than among the
 * A1s. */
const WORKBOOK_ORDER =
  "COALESCE(NULLIF(e.level, ''), 'ZZ'), e.title, e.id";

/* ── What the tick on a chapter means ─────────────────────────────
 *
 * 80% of the questions, on the best attempt. Not full marks and not
 * merely handing it in — both of those have been tried and both were
 * wrong in the same way, which is that one mark was being asked to
 * carry two different facts.
 *
 * Full marks meant a chapter finished at 5 of 6 looked no better than
 * one never opened. Handing it in meant 0 of 6 showed a green tick.
 * So there are three states and each says one thing:
 *
 *   ""      never opened
 *   "part"  been here — either not handed in, or handed in below the
 *           bar. Both mean the same thing to a student: go again.
 *   "done"  80% or better. This one you have.
 *
 * The exact score is on the row beside it, so the mark never has to
 * stand in for the number.
 *
 * Computed here and not in the two templates that show it, because it
 * was in both of them and they disagreed within a day.
 */
const PASS = 0.8;

/* Rounded up, so 6 questions need 5. On a chapter of four that works
   out at all four — 3 of 4 is 75% and the bar is 80% — which is
   strict but is what the number says; the workbook's chapters are six. */
const passMark = (questions) => Math.ceil(Number(questions || 0) * PASS);

function markOf(row) {
  const questions = Number(row.questions || 0);
  const tries = Number(row.tries || 0);
  const been = tries || Number(row.started || 0);

  if (tries && questions && Number(row.best || 0) >= passMark(questions)) return "done";
  return been ? "part" : "";
}

/* ── The filters, as they travel ──────────────────────────────────
 *
 * Two of them: a course and a level. They are chosen on the contents
 * page and they have to survive the jump into a chapter, because the
 * list beside a worksheet is the same list and ought to be showing the
 * same thing.
 *
 * They travel in the query string, not in the browser's storage. A
 * link somebody sends a classmate then shows what the sender was
 * looking at, the back button works, and the page is right before any
 * script has run — which the flash of forty chapters collapsing to
 * eleven would otherwise give away.
 *
 * Nothing here is trusted: both are matched against a list the
 * database has already decided this student may see, so the worst a
 * typed-in value can do is show nothing.
 */
function scope(query) {
  const q = query || {};
  return {
    level: String(q.level || "").trim().toUpperCase().slice(0, 4),
    course: String(q.course || "").trim().slice(0, 60),
    book: String(q.book || "").trim().slice(0, 60),
  };
}

/* What a row belongs to: its BATCH, and not its course.

   Two batches can run the same course. LNIKB01 and LNIKB02 are both
   "Fast Track", and keying on the title merged them into one — a
   student on both saw a single pile, and the office saw "41 already"
   on a chapter it had given to one batch and not the other.

   A batch code is unique and a course title is not, so the code is the
   key. Homework given to chosen people has no batch at all and gets
   its own key rather than falling into whichever group is first. */
const courseKey = (row) =>
  String(row.batch_code || "").trim() || "—";

function within(rows, want) {
  const w = want || {};
  return (rows || []).filter((r) => {
    if (w.level && String(r.level || "").trim().toUpperCase() !== w.level) return false;
    if (w.course && courseKey(r) !== w.course) return false;
    if (w.book && String(r.book || "") !== w.book) return false;
    return true;
  });
}

/* The query string that carries them, ready to append. Empty when
   nothing is chosen, so an unfiltered link stays clean. */
function query(want, extra) {
  const bits = [];
  if (want && want.course) bits.push("course=" + encodeURIComponent(want.course));
  if (want && want.book) bits.push("book=" + encodeURIComponent(want.book));
  if (want && want.level) bits.push("level=" + encodeURIComponent(want.level));
  for (const [k, v] of Object.entries(extra || {})) {
    if (v) bits.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
  }
  return bits.length ? "?" + bits.join("&") : "";
}

/* Fisher-Yates. Options are shuffled per attempt so a student who has
   seen an exercise before cannot answer it by remembering that the
   right one was second. */
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

/* ── Writing one ─────────────────────────────────────────────────── */

/**
 * Save an exercise from the text a teacher typed.
 *
 * The source is stored verbatim alongside the parsed questions. Editing
 * re-parses it, because rebuilding the text from the rows would lose
 * the teacher's spacing, their blank lines, and any line the parser
 * could not read — which is the line they most need to see again.
 *
 * Questions are replaced wholesale on every save. That deletes the
 * answers recorded against the old ones (ON DELETE CASCADE), which is
 * correct: an answer to a question that no longer exists is not a
 * result, and keeping it would put "6 of 8 wrong" against a sentence
 * nobody can read any more.
 */
async function save(id, fields, teacherId) {
  if (!READY()) return { ok: false, reason: "This needs migration 28. Ask the office to run it." };

  const parsed = fmt.parse(fields.source || "");
  const reading=parsed.learning?.module==='reading';
  if(reading && fields.module!=='reading')return {ok:false,reason:'Manage Lesen through the Lesen screen.',parsed};
  if(fields.module==='reading' && !reading)return {ok:false,reason:parsed.problems?.[0]?.why||'Use a validated @reading lesson.',parsed};
  if(reading && !require('./reading-schema').ready())return {ok:false,reason:'Lesen needs migration 37.',parsed};
  if(reading){
    const error=availabilityError(fields.available_from,fields.available_until,fields.due_on);if(error)return {ok:false,reason:error,parsed};
    if(id){const prior=await db.queryOne('SELECT source, unlock_emails, intake_id FROM exercises WHERE id = ?',[Number(id)]);
      const nextIntake=fields.audience==='batch'?(Number(fields.intake_id)||null):null;
      if((Number(prior?.intake_id)||null)!==nextIntake)return {ok:false,reason:'Give this lesson to the new course through Give out. Existing student work stays with its original assignment.',parsed};
      if(fields.unlock_emails===undefined)fields={...fields,unlock_emails:prior?.unlock_emails};
      if(prior?.source!==fields.source){const work=await db.queryOne('SELECT COUNT(*) AS n FROM exercise_attempts WHERE exercise_id = ?',[Number(id)]);if(Number(work?.n))return {ok:false,reason:'This lesson has student work. Create a new lesson version with a new lessonId instead of changing its answer keys.',parsed};}
    }
  }
  if (parsed.learning && !db.hasColumn('exercises.learning_config')) return {ok:false,reason:'Learning chapters need migration 36. Restart the server to apply it.',parsed};
  if (!parsed.questions.length) {
    return { ok: false, reason: "There are no questions here yet.", parsed };
  }

  const title = String(fields.title || parsed.title || "").trim().slice(0, 200);
  if (!title) return { ok: false, reason: "It needs a title — students see it as the name of the homework.", parsed };

  const row = {
    intake_id: Number(fields.intake_id) || null,
    lesson_id: fields.lesson_id ? Number(fields.lesson_id) : null,
    title,
    intro: (parsed.intro || "").slice(0, 500) || null,
    /* The text and its picture, joined by the same sentinel a
       question's picture uses — splitImage() on the way back out has
       been there all along, and nothing had ever written one in, so
       an illustrated reading text parsed correctly and then rendered
       without the illustration. */
    passage: parsed.passage
      ? (parsed.image ? parsed.passage + IMG + parsed.image : parsed.passage)
      : null,
    passage_page: Number(parsed.passagePage) || null,
    passage_title: (((parsed.pages || [])[(Number(parsed.passagePage) || 0) - 1] || {}).title
      || "").slice(0, 200) || null,
    source: fields.source || "",
    skill: ["grammar", "reading", "vocabulary", "mixed"].includes(fields.skill) ? fields.skill : "grammar",
    level: (parsed.learning?.meta?.cefrLevel || fields.level || "").trim().slice(0, 10) || null,
    due_on: fields.due_on || null,
    published: fields.published ? 1 : 0,
    // Cleaned to a comma list here so the SQL rule has something
    // predictable to match against, and so what is stored is what the
    // teacher can read back.
    unlock: cleanEmails(fields.unlock_emails),
  };
  // No batch is a real answer: homework for everybody studying, rather
  // than for one group. Only the "one batch" choice needs an id.
  if (fields.audience === "batch" && !row.intake_id) {
    return { ok: false, reason: "Choose which batch this is for.", parsed };
  }
  if (fields.audience !== "batch") row.intake_id = null;

  const unlockCol = HAS_UNLOCK();
  let exerciseId = Number(id) || 0;

  if (exerciseId) {
    await db.query(
      `UPDATE exercises SET lesson_id = ?, title = ?, intro = ?, passage = ?, source = ?,
              skill = ?, level = ?, due_on = ?, published = ?
              ${HAS_PAGES() ? ", passage_page = ?, passage_title = ?" : ""}
              ${unlockCol ? ", unlock_emails = ?" : ""}
        WHERE id = ? AND intake_id <=> ?`,
      [row.lesson_id, row.title, row.intro, row.passage, row.source,
       row.skill, row.level, row.due_on, row.published,
       ...(HAS_PAGES() ? [row.passage_page, row.passage_title] : []),
       ...(unlockCol ? [row.unlock] : []), exerciseId, row.intake_id]
    );
    // Structured chapters use stable content IDs. Preserve historical answer rows.
    if (!parsed.learning) await db.query("DELETE FROM exercise_questions WHERE exercise_id = ?", [exerciseId]);
  } else {
    const res = await db.query(
      `INSERT INTO exercises
         (intake_id, lesson_id, title, intro, passage, source, skill, level, due_on, published,
          ${HAS_PAGES() ? "passage_page, passage_title, " : ""}${unlockCol ? "unlock_emails, " : ""}${reading ? "module, " : ""}created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${HAS_PAGES() ? "?, ?, " : ""}${unlockCol ? "?, " : ""}${reading ? "?, " : ""}?)`,
      [row.intake_id, row.lesson_id, row.title, row.intro, row.passage, row.source,
       row.skill, row.level, row.due_on, row.published,
       ...(HAS_PAGES() ? [row.passage_page, row.passage_title] : []),
       ...(unlockCol ? [row.unlock] : []), ...(reading ? ['reading'] : []), teacherId || null]
    );
    exerciseId = res.insertId;
  }

  if(reading)await db.query("UPDATE exercises SET module = 'reading', content_key = ?, skill = 'reading', available_from = ?, available_until = ?, is_required = ? WHERE id = ?",[parsed.learning.key,fields.available_from||null,fields.available_until||null,fields.is_required===false||fields.is_required==='0'?0:1,exerciseId]);
  if (db.hasColumn('exercises.learning_config')) {
    await db.query('UPDATE exercises SET learning_config = ? WHERE id = ?', [parsed.learning?JSON.stringify(parsed.learning):null,exerciseId]);
  }
  const existingQuestions = parsed.learning ? await db.queryOne('SELECT COUNT(*) AS n FROM exercise_questions WHERE exercise_id = ?', [exerciseId]) : null;
  if (parsed.learning && Number(existingQuestions?.n)) return {ok:true,id:exerciseId,parsed};
  let seq = 0;
  for (const q of parsed.questions) {
    seq++;
    const options =
      q.kind === "choice" ? q.options :
      q.kind === "dropdown" ? q.gaps : null;
    await db.query(
      /* `explain` in backticks, because EXPLAIN is a reserved word in
         MySQL and an unquoted one in a column list is a parse error.

         This is what "Internal Server Error" was on the Unlock button.
         The exercise row went in, the first question did not, and the
         whole thing fell over between the two — so the homework
         appeared in the student's portal reading "0 questions", which
         is a piece of homework nobody can do and nothing to say why.

         The table definition had the backticks. Only the INSERT did
         not, and the INSERT is the half that runs. */
      HAS_PAGES()
        ? `INSERT INTO exercise_questions
             (exercise_id, seq, page, page_title, page_intro, kind, prompt, \`options\`, accept, shown, \`explain\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO exercise_questions
             (exercise_id, seq, kind, prompt, \`options\`, accept, \`explain\`)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      HAS_PAGES()
        ? [
          exerciseId, seq, Math.max(1, Number(q.page) || 1),
          q.pageTitle || null, (q.pageIntro || "").slice(0, 300) || null,
          q.kind, withImage(q),
          options ? JSON.stringify(options) : null,
          q.kind === "gap" ? JSON.stringify(q.accept) : null,
          /* Its own column, never `accept`. Anything in accept is
             compared against sooner or later, and a model answer that
             drifted into it would turn an unmarked task back into a
             marked one without anybody editing a line. */
          q.kind === "open" ? JSON.stringify(q.shown) : null,
          q.explain || null,
        ]
        : [
          exerciseId, seq, q.kind, withImage(q),
          options ? JSON.stringify(options) : null,
          q.kind === "gap" ? JSON.stringify(q.accept) : null,
          q.explain || null,
        ]
    );
  }

  return { ok: true, id: exerciseId, parsed };
}

/* The picture rides along with the prompt rather than in a column of
   its own: it is part of what the question shows, it is optional, and
   a column that is NULL on nineteen rows in twenty is a column that
   gets forgotten in the next SELECT. */
const IMG = "\u0000img:";
const withImage = (q) => (q.image ? q.prompt + IMG + q.image : q.prompt);
function splitImage(prompt) {
  const at = String(prompt || "").indexOf(IMG);
  if (at === -1) return { prompt: prompt || "", image: "" };
  return { prompt: prompt.slice(0, at), image: prompt.slice(at + IMG.length) };
}

/* ── The library: homework that is already written ───────────────── */

/**
 * Every chapter shipped in content/homework, ready to be given out.
 *
 * These are files rather than rows on purpose — see the README there.
 * What this adds is that nobody has to type them: the office picks one
 * from a list and the text goes into the box already filled in.
 *
 * Read from disk on every call. There are forty of them and they are
 * 53KB in total; caching that would save nothing measurable and would
 * mean a chapter edited on the server needing a restart to show up.
 */
/**
 * What a folder says about itself: content/homework/<slug>/workbook.json
 *
 *     { "course": "german-regular-a1", "sort": 10 }
 *
 * It names a COURSE, and the rest is read from the catalogue: the
 * title the website shows, the programme it sits under, its level.
 * One source of truth, so a book cannot come to be called something
 * the course page does not call it -- and so "put this in Regular,
 * German A1" is one slug rather than three fields kept in step by
 * hand.
 *
 *     "title"  overrides the course's own name
 *     "level"  for a course that spans several (Fast Track is A1-B1
 *              and the catalogue gives it no single level)
 *     "sort"   teaching order; the slugs and titles do not give it
 *
 * All optional, course included. A folder with no manifest still
 * works and is named after itself, because a book that will not
 * appear until somebody writes a JSON file is a book somebody loses.
 */
function bookMeta(dir, slug) {
  const fs = require("fs");
  const path = require("path");

  let j = {};
  try {
    j = JSON.parse(fs.readFileSync(path.join(dir, "workbook.json"), "utf8")) || {};
  } catch (e) {
    /* A missing file is ordinary. Anything else is said out loud: the
       book is about to appear under its folder name, and the only
       person who can fix that is the one running the server. */
    if (e.code !== "ENOENT") {
      console.error(`content/homework/${slug}/workbook.json: ${e.message}`);
    }
  }

  const wanted = String(j.course || "").trim();
  let course = null;
  if (wanted) {
    /* Required here rather than at the top: lib/content is the heavy
       module and nothing else in this file needs it. */
    const all = require("./content").courses("en") || [];
    course = all.find((c) => c.slug === wanted) || null;
    if (!course) {
      console.error(
        `content/homework/${slug}/workbook.json names course "${wanted}", ` +
        "which is not in the catalogue."
      );
    }
  }

  return {
    slug,
    /* What the manifest ASKED for, right or wrong, and separately
       whether it was found. Nulling an unknown slug here hid the
       mistake from everything downstream -- including the check that
       exists to catch it, which was reading a field that no longer
       said what had been asked for and so could never fail. */
    course: wanted || null,
    known: Boolean(course),
    title: String(j.title || "").trim() || (course ? course.title : slug),
    /* The programme, from the catalogue and nowhere else. lib/content
       derives it once for the course list, the batch picker and the
       codes; a second opinion here is a second answer. */
    track: course ? course.track : null,
    level: String(j.level || "").trim() || (course ? course.level : null) || null,
    sort: Number.isFinite(Number(j.sort)) ? Number(j.sort) : 500,
  };
}

/** Every workbook shipped, in the order they should be offered. */
function books(module = 'homework') {
  if(module==='reading')return require('./reading-content').LEVELS.map((level,i)=>({slug:'reading-'+level,title:'Lesetraining '+level,level,sort:i,chapters:require('./reading-content').library().filter(c=>c.level===level).length}));
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "content", "homework");

  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }

  const out = [];
  for (const slug of names) {
    const dir = path.join(root, slug);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    // A folder with no readable chapter in it is not a book yet.
    const chapters = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
    if (!chapters.length) continue;
    out.push(Object.assign(bookMeta(dir, slug), { chapters: chapters.length }));
  }

  /* sort, then title. The number is there so Regular A1 comes before
     Regular A2 and both before Intensive -- an order the slugs do not
     give and the titles only give by accident. */
  return out.sort((a, b) => (a.sort - b.sort) || a.title.localeCompare(b.title));
}

function library(module = 'homework') {
  if(module==='reading')return require('./reading-content').library();
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "content", "homework");

  const out = [];
  for (const meta of books()) {
    const dir = path.join(root, meta.slug);

    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
      let source;
      try {
        source = fs.readFileSync(path.join(dir, name), "utf8");
      } catch {
        continue;
      }
      const parsed = fmt.parse(source);
      // A chapter the parser cannot read is not offered. It would go
      // into the box looking fine and lose questions on save, which is
      // the one thing the format is written to prevent.
      if (!parsed.questions.length) continue;

      out.push({
        book: meta.slug,
        /* What the book is called, what programme it belongs to, and
           at what level -- carried on every chapter so the page
           offering them does not have to join two lists together. */
        bookTitle: meta.title,
        track: meta.track,
        file: name,
        id: `${meta.slug}/${name}`,
        title: parsed.title || name.replace(/\.txt$/, ""),
        intro: parsed.intro || "",
        /* The chapter's own level, and the book's only when the book
           has a single CEFR one.

           "A1–B1" is a span, not a level, and inheriting it put a
           chapter called "Kapitel 09" at the very top of a workbook
           whose first entry is Kapitel 01 — "A1–B1" sorts before "A1"
           as a string. A chapter with no level of its own sorts last
           instead, which is what the order was written to do with
           one. */
        level: (parsed.title.match(/\b(A1|A2|B1|B2|C1|C2)\b/) || [])[1]
          || (/^(A1|A2|B1|B2|C1|C2)$/.test(meta.level || "") ? meta.level : null),
        questions: parsed.questions.length,
        source,
      });
    }
  }
  return out;
}

/**
 * Which book each chapter title belongs to.
 *
 * An exercise in the database has no book on it — it has a title,
 * because that is what giveOut() matches on, one row per chapter per
 * course. The book is a fact about the file it came from, so the map
 * is built from the files.
 *
 * Deliberately NOT library(): that parses all forty-two chapters to
 * count their questions, which is the right price on the giving-out
 * screen and the wrong one on a page that only wants to group a list.
 * Here only the title is needed, and the title is the first # line —
 * so each file is read and scanned no further.
 *
 * A chapter somebody typed by hand is in no book and gets none, which
 * is honest: it came from nowhere this can name.
 */
function bookOfTitle() {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "content", "homework");
  const out = new Map();

  for (const meta of books()) {
    const dir = path.join(root, meta.slug);
    let names;
    try {
      names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
    } catch {
      continue;
    }
    for (const name of names) {
      let head;
      try {
        head = fs.readFileSync(path.join(dir, name), "utf8");
      } catch {
        continue;
      }
      /* The first # line, and nothing after it. A chapter's title is
         always its first line; reading on would be reading the whole
         workbook to learn forty-two strings. */
      const line = (head.split("\n").find((l) => l.trim().startsWith("#")) || "").trim();
      const title = line.replace(/^#+\s*/, "").trim();
      if (!title || out.has(title)) continue;
      out.set(title, { book: meta.slug, bookTitle: meta.title, track: meta.track });
    }
  }
  return out;
}

/** One chapter by its book/file id, or null. Path-safe. */
function fromLibrary(id, module = 'homework') {
  if(module==='reading')return library(module).find(c=>c.id===id)||null;
  // Matched against the list rather than joined onto a path: an id is a
  // string off a form, and a string off a form has no business being
  // half of a filename.
  return library().find((x) => x.id === String(id || "")) || null;
}

/* ── Reading them ────────────────────────────────────────────────── */

/** Every exercise on a batch, in workbook order. For the teacher. */
function forBatch(intakeId, module = 'homework') {
  if (!READY()) return Promise.resolve([]);
  return safe("for batch", () =>
    db.query(
      `SELECT e.id, e.title, e.skill, e.level, e.due_on, e.published, e.created_at,
              ${db.hasColumn('exercises.learning_config') ? 'e.learning_config,' : ''}
              ${db.hasColumn('exercises.module') ? 'e.module, e.available_from, e.available_until, e.is_required,' : ''}
              ${HAS_UNLOCK() ? "e.unlock_emails" : "NULL AS unlock_emails"},
              (SELECT COUNT(*) FROM exercise_questions q WHERE q.exercise_id = e.id) AS questions,
              (SELECT COUNT(DISTINCT a.student_id) FROM exercise_attempts a
                WHERE a.exercise_id = e.id) AS students
         FROM exercises e
        WHERE ${moduleWhere(module)} AND ${intakeId === null ? "e.intake_id IS NULL" : "e.intake_id = ?"}
        ORDER BY ${WORKBOOK_ORDER}`,
      intakeId === null ? [] : [intakeId]
    ), []).then(rows=>rows.map(row=>{
      const config=parseJson(row.learning_config,null);
      if(config)row.questions=require('./homework-engine').questions(config).length;
      delete row.learning_config;
      return row;
    }));
}

/**
 * Homework waiting for this student, across every batch they are on.
 *
 * Published only, and with their best score so far, so the portal can
 * show what is done without a second query per row.
 */
async function forStudentList(studentId, email, module = 'homework') {
  if (!READY()) return [];
  const rows = await safe("student list", () =>
    db.query(
      `SELECT e.id, e.title, e.intro, e.skill, e.level, e.due_on,
              ${db.hasColumn('exercises.learning_config') ? 'e.learning_config,' : ''}
              ${db.hasColumn('exercises.module') ? 'e.module, e.available_from, e.available_until, e.is_required,' : ''}
              i.code AS batch_code, c.title AS course_title,
              ${HAS_UNLOCK()
                ? "COALESCE(TRIM(e.unlock_emails), '') <> '' AS unlocked"
                : "0 AS unlocked"},
              (SELECT COUNT(*) FROM exercise_questions q WHERE q.exercise_id = e.id) AS questions,
              (SELECT MAX(a.score) FROM exercise_attempts a
                WHERE a.exercise_id = e.id AND a.student_id = ?
                  AND a.finished_at IS NOT NULL) AS best,
              (SELECT COUNT(*) FROM exercise_attempts a
                WHERE a.exercise_id = e.id AND a.student_id = ?
                  AND a.finished_at IS NOT NULL) AS tries,
              /* Opened at all, finished or not — so "started but not
                 handed in" can be told apart from "never touched".
                 Without it a chapter somebody is halfway through looks
                 identical to one they have never seen. */
              (SELECT COUNT(*) FROM exercise_attempts a
                WHERE a.exercise_id = e.id AND a.student_id = ?) AS started
         FROM exercises e
         LEFT JOIN intakes i ON i.id = e.intake_id
         LEFT JOIN enrolments en ON en.intake_id = i.id AND en.student_id = ?
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE ${moduleWhere(module)} AND ${availabilityWhere(module)} AND ${VISIBLE()}
        ORDER BY ${WORKBOOK_ORDER}`,
      [studentId, studentId, studentId, studentId, ...VISIBLE_BINDS(studentId, email)]
    ), []);

  /* Which book each one came out of, so the page can offer them by
     book. A Fast Track chapter spans A1 to B1 and therefore has no
     CEFR level of its own, which left it filed under "Not graded" —
     true, and no use at all to somebody looking for it. */
  const byTitle = bookOfTitle();
  const learningStates = new Map();
  if (db.hasColumn('exercise_attempts.learning_state') && rows.some(r=>r.learning_config)) {
    const saved = await db.query('SELECT exercise_id, learning_state FROM exercise_attempts WHERE student_id = ? AND learning_state IS NOT NULL ORDER BY attempt DESC', [studentId]);
    for (const row of saved) if (!learningStates.has(Number(row.exercise_id))) learningStates.set(Number(row.exercise_id),parseJson(row.learning_state,null));
  }

  // Worked out once, here, so the contents page and the chapter list
  // beside a worksheet cannot come to different conclusions about the
  // same row — which they did, within a day of each other.
  return (rows || []).map((r) => {
    const config = parseJson(r.learning_config, null);
    let learningMark;
    if (config) {
      const engine = require('./homework-engine');
      const state = learningStates.get(Number(r.id)) || engine.initial();
      const counts = engine.tally(config,state);
      r.questions = counts.total;
      r.best = counts.green + counts.yellow;
      r.tries = (counts.done ?? (counts.completed === counts.total)) ? 1 : 0;
      learningMark = (counts.done ?? (r.best === counts.total)) ? 'done' : Object.keys(state.items).length ? 'part' : '';
      if(config.module==='reading'){r.completed=counts.requiredCompleted;r.total=counts.requiredTotal;r.estimatedMinutes=config.meta.estimatedMinutes;}
    }
    delete r.learning_config;
    const b = byTitle.get(String(r.title || "").trim()) || {};
    return { ...r, mark: learningMark === undefined ? markOf(r) : learningMark, book: b.book || "", bookTitle: b.bookTitle || "" };
  });
}

/**
 * One exercise, as the student may see it — with every answer removed.
 *
 * Returns null when it is not theirs, so "not yours" and "does not
 * exist" are the same answer to somebody typing ids into the address
 * bar.
 */
async function forStudent(exerciseId, studentId, email, module = 'homework') {
  if (!READY()) return null;

  const ex = await db.queryOne(
    `SELECT e.id, e.title, e.intro, e.passage, e.skill, e.level, e.due_on,
            ${db.hasColumn('exercises.learning_config') ? 'e.learning_config,' : ''}
              ${db.hasColumn('exercises.module') ? 'e.module, e.available_from, e.available_until, e.is_required,' : ''}
            ${HAS_PAGES() ? "e.passage_page, e.passage_title," : "NULL AS passage_page, NULL AS passage_title,"}
            e.published,
            ${HAS_UNLOCK()
              ? "COALESCE(TRIM(e.unlock_emails), '') <> '' AS unlocked"
              : "0 AS unlocked"},
            i.code AS batch_code, c.title AS course_title
       FROM exercises e
       LEFT JOIN intakes i ON i.id = e.intake_id
       LEFT JOIN enrolments en ON en.intake_id = i.id AND en.student_id = ?
       LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
      WHERE e.id = ? AND ${moduleWhere(module)} AND ${availabilityWhere(module)} AND ${VISIBLE()}
      LIMIT 1`,
    [studentId, Number(exerciseId), ...VISIBLE_BINDS(studentId, email)]
  );
  if (!ex) return null;
  ex.learning = parseJson(ex.learning_config, null);
  delete ex.learning_config;

  const rows = await db.query(
    HAS_PAGES()
      ? `SELECT id, seq, page, page_title, page_intro, kind, prompt, \`options\`, shown
           FROM exercise_questions WHERE exercise_id = ? ORDER BY page, seq`
      : `SELECT id, seq, kind, prompt, \`options\`
           FROM exercise_questions WHERE exercise_id = ? ORDER BY seq`,
    [ex.id]
  );

  const passageBits = splitImage(ex.passage || "");
  ex.passage = passageBits.prompt || null;
  /* Computed here since the sentinel went in, and thrown away ever
     since: nothing wrote an image into a passage, so nothing missed
     it. Now something does. */
  ex.passageImage = passageBits.image || null;
  ex.passagePage = Number(ex.passage_page) || 0;
  ex.passageTitle = ex.passage_title || "";

  ex.questions = rows.map(function (r) {
    const bits = splitImage(r.prompt);
    const base = {
      id: r.id, seq: r.seq, kind: r.kind, prompt: bits.prompt, image: bits.image || null,
      page: Math.max(1, Number(r.page) || 1),
      pageTitle: r.page_title || "",
      pageIntro: r.page_intro || "",
    };

    /* An open task carries its model answers to the browser, which is
       the one kind that may: there is nothing to cheat at. Nothing is
       compared against them and no score moves, so the only thing
       seeing them early costs a student is the exercise of trying
       first. A marked answer never travels — see the comment at the
       top of lib/exercise-format.js. */
    if (r.kind === "open") return { ...base, shown: parseJson(r.shown, []) };

    if (r.kind === "choice") {
      // Shuffled, and the answer index goes nowhere: marking compares
      // the TEXT that came back against the row.
      return { ...base, options: shuffle(parseJson(r.options, [])) };
    }
    if (r.kind === "dropdown") {
      const gaps = parseJson(r.options, []);
      return { ...base, gaps: gaps.map((g) => ({ options: shuffle(g.options || []) })) };
    }
    // A gap sends nothing but the sentence.
    return base;
  });

  /* The pages, in order, worked out here rather than in the template.
     The page list and the questions on it must not be able to
     disagree about how many pages there are, and they can only be one
     answer if one of them is derived from the other. */
  const seen = new Map();
  for (const q of ex.questions) {
    if (!seen.has(q.page)) {
      seen.set(q.page, { no: q.page, title: q.pageTitle, intro: q.pageIntro, questions: 0 });
    }
    seen.get(q.page).questions++;
  }
  ex.pages = [...seen.values()].sort((a, b) => a.no - b.no);
  if (ex.learning) {
    ex.questions = require('./homework-engine').questions(ex.learning).map(q=>({id:q.id,kind:q.type,prompt:q.prompt}));
  }

  return ex;
}

/**
 * What has already been answered in an open attempt.
 *
 * So somebody who did three of five yesterday comes back to question
 * four rather than to question one. Without it the only way to finish
 * a long chapter is in one sitting, which is not how homework gets
 * done — and re-answering three questions to reach the fourth is how
 * somebody stops opening it.
 *
 * Returns { questionId: true|false }, right or wrong. The verdict is
 * there because the list down the side shows it: a question you got
 * wrong and one you have not reached are different things.
 */
async function progress(attemptId) {
  if (!READY() || !attemptId) return {};
  const rows = await safe("progress", () =>
    db.query(
      "SELECT question_id, correct FROM exercise_answers WHERE attempt_id = ?",
      [Number(attemptId)]
    ), []);

  const out = {};
  for (const r of rows || []) out[Number(r.question_id)] = Number(r.correct) === 1;
  return out;
}

/**
 * The attempt to show: the one still open, or the last one finished.
 *
 * Finishing used to close the attempt and that was the end of it —
 * come back tomorrow and start() found nothing open, made a new one,
 * and the page said "0 of 6 answered" over an exercise somebody had
 * completed the day before. Their work was in the database the whole
 * time and no page would show it.
 *
 * So a finished attempt is still the current one until somebody asks
 * for a new one. What they did is what they see, and going again is a
 * button rather than a side effect of returning.
 */
async function latest(exerciseId, studentId) {
  if (!READY()) return null;
  return db.queryOne(
    `SELECT id, attempt, score, out_of, finished_at
       FROM exercise_attempts
      WHERE exercise_id = ? AND student_id = ?
      ORDER BY attempt DESC LIMIT 1`,
    [Number(exerciseId), studentId]
  );
}

/**
 * Who already has which chapter of the library.
 *
 * The give-out screen opened with every box blank whatever had been
 * given out before, so the only way to find out whether somebody
 * already had Kapitel 01 was to give it to them again and read the
 * confirmation. A screen whose whole job is "who gets what" has to be
 * able to say who has got what.
 *
 * Keyed on the title, because that is what giveOut() matches on — one
 * exercises row per chapter per course, with unlock_emails the union
 * of everybody it has been given to.
 *
 * Returns a Map from library id to a Set of lower-case addresses.
 */
async function given(chapters, module = 'homework') {
  if(module==='reading'){
    if(!db.hasColumn('exercises.module'))return new Map();
    const rows=await db.query("SELECT content_key, intake_id, unlock_emails FROM exercises WHERE module = 'reading'");
    const out=new Map();for(const c of chapters){const batches=new Map();for(const r of rows.filter(r=>r.content_key===c.contentKey)){const key=String(r.intake_id||0);const who=batches.get(key)||new Set();splitEmails(r.unlock_emails).forEach(e=>who.add(e));batches.set(key,who);}out.set(c.id,batches);}return out;
  }
  if (!READY() || !HAS_UNLOCK()) return new Map();

  const rows = await safe("given", () =>
    db.query(
      `SELECT title, intake_id, unlock_emails FROM exercises
        WHERE COALESCE(TRIM(unlock_emails), '') <> '' ${homeworkOnly()}`
    ), []);

  /* Title, then BATCH, then addresses — three levels and the middle
     one is the fix. These used to be merged on the title alone, so
     giving Kapitel 01 to LNIKB01 made it read "already given" for
     LNIKB02 as well, and the office was told a class had homework it
     had never been given. A chapter is given to a batch; the same
     chapter in another batch is another thing entirely.

     "0" is the key for homework with no batch on it. */
  const byTitle = new Map();
  for (const r of rows || []) {
    const title = String(r.title || "");
    const batch = String(r.intake_id || 0);
    const per = byTitle.get(title) || new Map();
    const set = per.get(batch) || new Set();
    for (const e of splitEmails(r.unlock_emails)) set.add(e);
    per.set(batch, set);
    byTitle.set(title, per);
  }

  const out = new Map();
  for (const c of chapters || []) {
    out.set(c.id, byTitle.get(c.title) || new Map());
  }
  return out;
}

/**
 * Take chapters back off people. The exact inverse of giveOut().
 *
 * ── The trap in here ────────────────────────────────────────────────
 *
 * An exercise with an EMPTY unlock list is not private, it is public.
 * VISIBLE() reads an empty list as "the ordinary rules apply", and for
 * a chapter with no batch on it those rules are ANY_BATCH: published,
 * and visible to everybody with an active enrolment. So removing the
 * last person from a chapter would have handed it to the whole school
 * — the opposite of what the button says.
 *
 * Emptying the list therefore also unpublishes. Nobody was the last
 * person to have it, so nobody has it.
 *
 * Nothing is deleted. The exercise stays, and so does every answer
 * recorded against it, because a student's work is a record of what
 * they knew and taking a chapter back is not a reason to rewrite the
 * class results. Removing outright is a separate button on the
 * homework list and it says what it costs.
 */
async function withdraw({ chapters, emails, intakeId, module = 'homework' }) {
  if (!READY()) return { ok: false, reason: "This needs migration 28. It runs itself on the next restart." };
  if (!HAS_UNLOCK()) return { ok: false, reason: "This needs migration 29. It runs itself on the next restart." };

  const want = (Array.isArray(chapters) ? chapters : [chapters]).filter(Boolean);
  const who = new Set(
    (Array.isArray(emails) ? emails : [emails])
      .map((e) => String(e || "").trim().toLowerCase())
      .filter((e) => e.includes("@"))
  );

  if (!want.length) return { ok: false, reason: "Tick at least one chapter to take back." };
  if (!who.size) return { ok: false, reason: "Tick at least one person to take it back from." };

  /* Which course it comes off.
   *
   * "all" is every course at once, and it is the only way to answer
   * "take this person's access away" in one action. Without it,
   * somebody who had taken every chapter off LNIKB02 went to a
   * student's portal expecting nothing and found fifty-two still
   * there under LNIKB01 — correct, and indistinguishable from broken.
   *
   * Nothing means the homework that has no course on it, which is a
   * real answer and not "all of them". The two are different and the
   * dropdown says which is which. */
  const everywhere = String(intakeId) === "all";
  const forIntake = everywhere ? null : (Number(intakeId) || null);

  let taken = 0;
  let shut = 0;
  let untouched = 0;

  try {
    for (const id of want) {
      const chapter = fromLibrary(id, module);
      if (!chapter) continue;

      /* This chapter ON THIS BATCH, and no other.

         It used to take every row of the title, so taking Kapitel 01
         back from LNIKB01 silently took it off LNIKB02 as well — a
         class losing homework because a different class lost it. */
      const rows = module==='reading' ? await db.query("SELECT id, intake_id, unlock_emails FROM exercises WHERE module = 'reading' AND content_key = ?"+(everywhere?'':' AND intake_id <=> ?'),[chapter.contentKey,...(everywhere?[]:[forIntake])]) : everywhere
        ? await db.query(
            "SELECT id, intake_id, unlock_emails FROM exercises WHERE title = ?" + homeworkOnly(),
            [chapter.title])
        : forIntake
          ? await db.query(
              "SELECT id, intake_id, unlock_emails FROM exercises WHERE title = ? AND intake_id = ?" + homeworkOnly(),
              [chapter.title, forIntake])
          : await db.query(
              "SELECT id, intake_id, unlock_emails FROM exercises WHERE title = ? AND intake_id IS NULL" + homeworkOnly(),
              [chapter.title]);

      for (const row of rows || []) {
        const had = splitEmails(row.unlock_emails);
        const left = had.filter((e) => !who.has(e));
        if (left.length === had.length) { untouched++; continue; }

        taken += had.length - left.length;

        /* The list is empty: nobody has it, so it is closed.
         *
         * This used to be "empty AND no batch", on the reasoning that
         * a chapter given to a batch keeps its batch audience. That
         * reasoning does not survive contact with how the row was
         * made. giveOut() says so itself: the course "labels the
         * homework; it does not decide who can see it. The unlock
         * list still does that."
         *
         * So the two halves disagreed. Giving treated the batch as a
         * label, taking back treated it as an audience, and an empty
         * unlock list means "not restricted" to VISIBLE() -- which
         * made published + a batch visible to the WHOLE CLASS.
         *
         * Taking homework back off the last person therefore handed
         * it to everybody on the course. Reported from the live site:
         * "i take it out but still it shows in the portal". It did
         * not still show; it had just been given to more people.
         *
         * Only rows that HAD an unlock list reach this line -- one
         * with none is untouched above -- so this cannot close a
         * chapter that was deliberately published to a batch and
         * never unlocked for anybody. */
        const goesQuiet = !left.length;
        if (goesQuiet) shut++;

        await db.query(
          "UPDATE exercises SET unlock_emails = ?, published = ? WHERE id = ?",
          [left.join(","), goesQuiet ? 0 : 1, row.id]
        );
      }
    }
  } catch (e) {
    console.error("Taking homework back failed:", e.message);
    return { ok: false, reason: `The database refused it: ${e.message}` };
  }

  /* Which course it came off, said back.
   *
   * Lock takes a chapter off ONE course's copy, which is right — a
   * class losing homework is not a reason for another class to lose
   * it. But the confirmation said only "41 people taken off the
   * chapters ticked", and somebody who had just taken everything off
   * LNIKB02 went to a student's portal, found fifty-two chapters still
   * there under LNIKB01, and reasonably concluded it was broken.
   *
   * So the message says which course, and says that the others are
   * untouched. The same lookup giveOut() does, and for the same
   * reason: the difference only shows up later, on somebody else's
   * screen. */
  let offWhat = " with no course on them";
  if (everywhere) {
    offWhat = " on every course";
  } else if (forIntake) {
    const b = await safe("withdraw batch", () => db.queryOne(
      `SELECT i.code, c.title AS course_title
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE i.id = ? LIMIT 1`, [forIntake]), null);
    offWhat = b ? ` on ${b.code}${b.course_title ? " — " + b.course_title : ""}` : "";
  }

  if (!taken) {
    return {
      ok: true,
      message: `Nobody ticked had any of the ticked chapters${offWhat}, so nothing changed.` +
               (everywhere
                 ? ""
                 : " Copies on other courses are not touched by this — choose that course, " +
                   "or “Every course”, and lock again."),
    };
  }

  const bits = [
    `${taken} ${taken === 1 ? "person" : "people"} taken off the chapters ticked${offWhat}`,
  ];
  if (shut) {
    bits.push(`${shut} ${shut === 1 ? "chapter is" : "chapters are"} now closed — ` +
              "nobody was left on them");
  }
  if (untouched) bits.push(`${untouched} did not have it anyway`);

  return {
    ok: true,
    message: bits.join(", ") + ". Any work already done against them is kept" +
             (everywhere
               ? ", on every course they were on."
               : ", and the same chapters on other courses are untouched."),
  };
}

/**
 * Where this student stands in their class.
 *
 * ── What it is for ──────────────────────────────────────────────────
 *
 * Motivation, and nothing else. A student who can see that the class
 * is getting through the workbook does more of it than one looking at
 * a list on their own. That is the whole claim, and it sets the limits
 * below.
 *
 * ── What it deliberately does NOT do ────────────────────────────────
 *
 * It never names another student, and it never gives anybody else's
 * score. A class leaderboard with names on it is a weekly, public
 * ranking of the slowest learner in the room, and that is not a thing
 * a language school should build. What comes back is this student's
 * own position, how many people it is out of, and the top score as a
 * bare number with nobody attached to it — enough to see the class
 * moving, not enough to identify anyone.
 *
 * ── How the position is worked out ──────────────────────────────────
 *
 * Chapters PASSED, which is the same 80% the tick on a chapter uses.
 * Doing more homework moves you up and doing it well moves you up;
 * opening forty chapters and finishing none moves you nowhere. Ties
 * break on accuracy, so two people who have passed the same number are
 * separated by how much of it they got right first time.
 *
 * Compared in SQL as best * 100 >= out_of * 80, which is the integer
 * form of the same rule — no rounding to disagree about, and it holds
 * for a chapter of any length.
 *
 * `out_of` comes off the attempt rather than counting the questions
 * now: a chapter that has been edited since should be judged by what
 * it asked at the time, not by what it asks today.
 */
async function standings(studentId) {
  if (!READY()) return null;

  return safe("standings", async () => {
    // Every class this student is actually in.
    const mine = await db.query(
      `SELECT i.id, i.code, c.title AS course_title
         FROM enrolments en
         JOIN intakes i ON i.id = en.intake_id
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE en.student_id = ? AND en.status = 'active'
        ORDER BY i.id`,
      [studentId]
    );
    if (!mine || !mine.length) return null;

    /* One set of figures for the student, and a place in each class.
       These numbers come off their own attempts, so they do not change
       from one class to the next — the class only decides who they are
       being measured against. */
    let figures = null;
    const classes = [];

    for (const batch of mine) {
      /* One row per classmate who has finished anything, with their
         chapters passed and what they got out of what they answered.
         Classmates who have finished nothing are not in here; they are
         counted in `of` below and sit at the bottom, which is where
         somebody who has done nothing belongs. */
      const rows = await db.query(
        `SELECT t.student_id,
                SUM(CASE WHEN t.out_of > 0 AND t.best * 100 >= t.out_of * 80
                         THEN 1 ELSE 0 END) AS passed,
                COUNT(*) AS done,
                SUM(t.best) AS got,
                SUM(t.out_of) AS asked
           FROM (SELECT a.student_id, a.exercise_id,
                        MAX(a.score) AS best, MAX(a.out_of) AS out_of
                   FROM exercise_attempts a
                   JOIN enrolments en ON en.student_id = a.student_id
                                     AND en.intake_id = ? AND en.status = 'active'
                  WHERE a.finished_at IS NOT NULL ${db.hasColumn('exercises.module') ? "AND EXISTS (SELECT 1 FROM exercises module_ex WHERE module_ex.id = a.exercise_id AND module_ex.module = 'homework')" : ''}
                  GROUP BY a.student_id, a.exercise_id) t
          GROUP BY t.student_id`,
        [batch.id]
      );

      const roster = await db.queryOne(
        `SELECT COUNT(*) AS n FROM enrolments
          WHERE intake_id = ? AND status = 'active'`,
        [batch.id]
      );

      const acc = (r) => (Number(r.asked) ? Number(r.got) / Number(r.asked) : 0);
      const list = (rows || []).map((r) => ({
        id: Number(r.student_id),
        passed: Number(r.passed || 0),
        done: Number(r.done || 0),
        got: Number(r.got || 0),
        asked: Number(r.asked || 0),
      }));

      // Passed first, accuracy to break a tie.
      list.sort((a, b) => b.passed - a.passed || acc(b) - acc(a));

      const meAt = list.findIndex((r) => r.id === Number(studentId));
      const me = meAt > -1 ? list[meAt] : { passed: 0, done: 0, got: 0, asked: 0 };

      /* Position, with ties sharing a place: two people on four
         chapters are both 2nd and the next is 4th. Ranking them 2nd
         and 3rd on a hidden tiebreak would be telling somebody they
         are behind a person they are level with. */
      let rank = 0;
      if (meAt > -1) {
        rank = 1;
        for (const r of list) {
          if (r.id === me.id) break;
          if (r.passed !== me.passed || acc(r) !== acc(me)) rank++;
        }
      } else {
        // Nothing finished yet: last, with everybody who has.
        rank = list.length + 1;
      }

      if (!figures) {
        figures = {
          passed: me.passed,
          done: me.done,
          got: me.got,
          asked: me.asked,
          // Whole per cent, and null rather than 0 when nothing has
          // been answered — "0% right" about a blank record is a lie.
          accuracy: me.asked ? Math.round((me.got / me.asked) * 100) : null,
        };
      }

      classes.push({
        batch: { id: batch.id, code: batch.code, course_title: batch.course_title },
        rank,
        of: Math.max(Number(roster ? roster.n : 0) || 0, list.length, 1),
        // The class's best, with nobody attached to it.
        top: list.length ? list[0].passed : 0,
      });
    }

    if (!figures) return null;

    /* Biggest class first. A place out of six says something and a
       place out of one says nothing, so the one worth leading with is
       the one with the most people in it. */
    classes.sort((a, b) => b.of - a.of);
    return { ...figures, classes };
  }, null);
}

/**
 * The whole class, for the teacher who teaches it.
 *
 * ── Why this one has names on it and the student's does not ─────────
 *
 * Because the question is different. A student is shown their own
 * position and nobody else's score, because a class leaderboard with
 * names on it is a weekly public ranking of the slowest learner in the
 * room. A teacher is shown names because the point is to find the
 * student who has stopped — that is the job, and doing it from
 * anonymous rows is not doing it.
 *
 * So this is never rendered on a page a student can reach. The route
 * that calls it checks the batch belongs to the teacher asking.
 *
 * Ranked the same way as the student's own card, on chapters PASSED at
 * the same 80%, so the two never disagree about who is where.
 */
async function classBoard(intakeId) {
  if (!READY()) return [];

  return safe("class board", async () => {
    const rows = await db.query(
      `SELECT s.id, s.name, s.student_ref,
              COALESCE(t.passed, 0) AS passed,
              COALESCE(t.done, 0)   AS done,
              COALESCE(t.got, 0)    AS got,
              COALESCE(t.asked, 0)  AS asked,
              (SELECT MAX(a2.finished_at) FROM exercise_attempts a2
                WHERE a2.student_id = s.id) AS last_at
         FROM enrolments en
         JOIN students s ON s.id = en.student_id AND s.deleted_at IS NULL
         LEFT JOIN (
           SELECT x.student_id,
                  SUM(CASE WHEN x.out_of > 0 AND x.best * 100 >= x.out_of * 80
                           THEN 1 ELSE 0 END) AS passed,
                  COUNT(*) AS done,
                  SUM(x.best) AS got,
                  SUM(x.out_of) AS asked
             FROM (SELECT a.student_id, a.exercise_id,
                          MAX(a.score) AS best, MAX(a.out_of) AS out_of
                     FROM exercise_attempts a
                    WHERE a.finished_at IS NOT NULL ${db.hasColumn('exercises.module') ? "AND EXISTS (SELECT 1 FROM exercises module_ex WHERE module_ex.id = a.exercise_id AND module_ex.module = 'homework')" : ''}
                    GROUP BY a.student_id, a.exercise_id) x
            GROUP BY x.student_id
         ) t ON t.student_id = s.id
        WHERE en.intake_id = ? AND en.status = 'active'`,
      [Number(intakeId) || 0]
    );

    const acc = (r) => (Number(r.asked) ? Number(r.got) / Number(r.asked) : 0);
    const list = (rows || []).map((r) => ({
      id: Number(r.id),
      name: r.name,
      ref: r.student_ref,
      passed: Number(r.passed || 0),
      done: Number(r.done || 0),
      got: Number(r.got || 0),
      asked: Number(r.asked || 0),
      accuracy: Number(r.asked) ? Math.round((Number(r.got) / Number(r.asked)) * 100) : null,
      lastAt: r.last_at || null,
    }));

    list.sort((a, b) => b.passed - a.passed || acc(b) - acc(a) || a.name.localeCompare(b.name));

    /* Ties share a place, as they do on the student's own card: two
       people level on both counts are both 2nd and the next is 4th.
       Ranking them 2nd and 3rd on a hidden tiebreak would be telling
       one of them they are behind somebody they are level with. */
    let rank = 0;
    let seen = 0;
    let last = null;
    for (const r of list) {
      seen++;
      const key = r.passed + ":" + acc(r).toFixed(6);
      if (key !== last) { rank = seen; last = key; }
      r.rank = rank;
    }
    return list;
  }, []);
}

/**
 * The chapter after this one, at the same level.
 *
 * Finishing used to land back on the contents page, which is a
 * reasonable place to be and the wrong place to be sent: somebody
 * working through A1 has just told you what they are doing, and
 * making them find Kapitel 08 in a list of forty-one is asking them
 * to do it again every six questions.
 *
 * Strictly the next one in workbook order, finished or not, rather
 * than the next UNfinished one. "Next" that skips about is a "next"
 * nobody can predict, and going over an old chapter again is a thing
 * students do on purpose.
 *
 * The same visibility rule as everything else here, so this can never
 * hand somebody a chapter they were not given.
 */
async function nextFor(exerciseId, studentId, email) {
  if (!READY()) return null;
  return safe("next", async () => {
    const here = await db.queryOne(
      "SELECT id, level, title FROM exercises WHERE id = ? LIMIT 1",
      [Number(exerciseId)]
    );
    if (!here) return null;

    return db.queryOne(
      `SELECT e.id, e.title, e.level
         FROM exercises e
         LEFT JOIN intakes i ON i.id = e.intake_id
         LEFT JOIN enrolments en ON en.intake_id = i.id AND en.student_id = ?
        WHERE ${VISIBLE()}
          AND COALESCE(NULLIF(e.level, ''), 'ZZ') = COALESCE(NULLIF(?, ''), 'ZZ')
          AND (e.title > ? OR (e.title = ? AND e.id > ?))
        ORDER BY ${WORKBOOK_ORDER}
        LIMIT 1`,
      [
        studentId, ...VISIBLE_BINDS(studentId, email),
        here.level, here.title, here.title, here.id,
      ]
    );
  }, null);
}

/**
 * Put the current attempt away and open a new one.
 *
 * For "start fresh". Closing rather than deleting: an attempt is a
 * record of what somebody knew at the time, and the teacher's figures
 * are counted from first attempts — so throwing one away would quietly
 * rewrite the class results.
 */
async function restart(exerciseId, studentId, email) {
  if (!READY()) return null;
  const open = await db.queryOne(
    `SELECT id FROM exercise_attempts
      WHERE exercise_id = ? AND student_id = ? AND finished_at IS NULL
      ORDER BY attempt DESC LIMIT 1`,
    [Number(exerciseId), studentId]
  );
  if (open) await finish(open.id, studentId);
  return start(exerciseId, studentId, email);
}

/* ── Sitting one ─────────────────────────────────────────────────── */

/** Start an attempt, or pick up the one already open. */
async function start(exerciseId, studentId, email) {
  if (!READY()) return null;

  // The same rule as the page, asked again. A student who can open an
  // exercise can start it and one who cannot cannot, and the two must
  // not be able to disagree.
  const mine = await db.queryOne(
    `SELECT e.id FROM exercises e
       LEFT JOIN enrolments en ON en.intake_id = e.intake_id AND en.student_id = ?
                              AND e.intake_id IS NOT NULL
      WHERE e.id = ? AND ${VISIBLE()} LIMIT 1`,
    [studentId, Number(exerciseId), ...VISIBLE_BINDS(studentId, email)]
  );
  if (!mine) return null;

  const open = await db.queryOne(
    `SELECT id, attempt FROM exercise_attempts
      WHERE exercise_id = ? AND student_id = ? AND finished_at IS NULL
      ORDER BY attempt DESC LIMIT 1`,
    [mine.id, studentId]
  );
  if (open) return open;

  const last = await db.queryOne(
    "SELECT COALESCE(MAX(attempt), 0) AS n FROM exercise_attempts WHERE exercise_id = ? AND student_id = ?",
    [mine.id, studentId]
  );
  const attempt = Number(last ? last.n : 0) + 1;

  /* Marked questions only.
   *
   * An open task cannot be right or wrong, so counting it would make
   * every chapter containing one unpassable: a student answering all
   * fourteen marked questions of a twenty-question chapter scores
   * 70%, and the pass mark is 80%. The score has to be out of what
   * was actually judged. */
  const of = await db.queryOne(
    HAS_PAGES()
      ? "SELECT COUNT(*) AS n FROM exercise_questions WHERE exercise_id = ? AND kind <> 'open'"
      : "SELECT COUNT(*) AS n FROM exercise_questions WHERE exercise_id = ?",
    [mine.id]
  );

  const res = await db.query(
    `INSERT INTO exercise_attempts (exercise_id, student_id, attempt, out_of, started_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
    [mine.id, studentId, attempt, Number(of ? of.n : 0)]
  );
  return { id: res.insertId, attempt };
}

/**
 * Mark one answer.
 *
 * Returns what the student is shown: whether it was right, the correct
 * answer, and the teacher's explanation. The answer is only revealed
 * once it has been attempted, which is the point at which telling them
 * is teaching rather than giving it away.
 */
async function check(attemptId, questionId, given, studentId) {
  if (!READY()) return null;

  const q = await db.queryOne(
    `SELECT q.id, q.kind, q.prompt, q.\`options\`, q.accept, q.\`explain\`, a.id AS attempt_id
       FROM exercise_questions q
       JOIN exercise_attempts a ON a.exercise_id = q.exercise_id
      WHERE q.id = ? AND a.id = ? AND a.student_id = ? AND a.finished_at IS NULL
      LIMIT 1`,
    [Number(questionId), Number(attemptId), studentId]
  );
  if (!q) return null;

  /* An open task is never marked and never written down.
   *
   * Without this it fell through to the gap branch, where `accept` is
   * null, every answer is therefore wrong, and a row went into
   * exercise_answers saying so — so writing a perfectly good German
   * sentence took a student's score DOWN. The model answers already
   * travelled to the browser with the question, so there is nothing
   * for the server to do here but refuse. */
  if (q.kind === "open") return { open: true, correct: null, answer: "", explain: q.explain || "" };

  const verdict = judge(q, given);

  /* INSERT IGNORE, and the unique key does the rest.

     The first answer within an attempt is the one that counts and it is
     never overwritten. Practice is unlimited so somebody can and will
     try every option; without this they would finish on full marks and
     the class figures a teacher actually uses would read zero wrong,
     every time. */
  await db.query(
    "INSERT IGNORE INTO exercise_answers (attempt_id, question_id, given, correct) VALUES (?, ?, ?, ?)",
    [Number(attemptId), q.id, textOf(given), verdict.correct ? 1 : 0]
  );

  return verdict;
}

/**
 * A textarea of addresses, as a comma list.
 *
 * Whatever somebody typed — one per line, commas, stray spaces, mixed
 * capitals — comes out as "a@b.com,c@d.com". Lower-cased because an
 * address is not case-sensitive in the half that matters and nobody
 * types their own consistently. Empty stays empty, which is what the
 * ordinary rule keys off.
 */
function cleanEmails(v) {
  const list = String(v == null ? "" : v)
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.includes("@"));
  return list.length ? [...new Set(list)].join(",") : null;
}

const textOf = (given) =>
  Array.isArray(given) ? given.map((g) => String(g == null ? "" : g)).join(" | ")
                       : String(given == null ? "" : given).slice(0, 500);

/** Right or wrong, and what the right answer was. */
function judge(q, given) {
  if (q.kind === "choice") {
    const options = parseJson(q.options, []);
    const right = options[0];
    return {
      correct: String(given == null ? "" : given).trim() === String(right),
      answer: right,
      explain: q.explain || "",
    };
  }

  if (q.kind === "dropdown") {
    const gaps = parseJson(q.options, []);
    const picks = Array.isArray(given) ? given : [given];
    const rights = gaps.map((g) => (g.options || [])[g.answer || 0]);
    const correct = gaps.length > 0 && gaps.every(
      (g, i) => String(picks[i] == null ? "" : picks[i]).trim() === String(rights[i])
    );
    return { correct, answer: rights.join(" · "), explain: q.explain || "" };
  }

  // A gap: one typed answer per blank, all of them right or the
  // question is wrong. Half a sentence is not a right answer.
  const accept = parseJson(q.accept, []);
  const typed = Array.isArray(given) ? given : [given];
  const correct = accept.length > 0 && accept.every((list, i) => fmt.matches(typed[i], list));
  return {
    correct,
    answer: accept.map((list) => list[0]).join(" · "),
    explain: q.explain || "",
  };
}

/** Close the attempt and total it up. */
async function finish(attemptId, studentId) {
  if (!READY()) return null;

  const a = await db.queryOne(
    "SELECT id, exercise_id, out_of FROM exercise_attempts WHERE id = ? AND student_id = ? LIMIT 1",
    [Number(attemptId), studentId]
  );
  if (!a) return null;

  const tally = await db.queryOne(
    "SELECT COALESCE(SUM(correct), 0) AS right_n, COUNT(*) AS answered FROM exercise_answers WHERE attempt_id = ?",
    [a.id]
  );
  const score = Number(tally ? tally.right_n : 0);

  await db.query(
    "UPDATE exercise_attempts SET score = ?, finished_at = UTC_TIMESTAMP() WHERE id = ? AND finished_at IS NULL",
    [score, a.id]
  );

  return { score, outOf: Number(a.out_of || 0), answered: Number(tally ? tally.answered : 0) };
}

/**
 * The students an audience actually reaches, by name.
 *
 * Named rather than counted, because "one batch" leaves somebody to
 * work out which eight people that is, and the answer to "who gets
 * this" is a list of people.
 *
 * Active enrolments only, in both cases. Somebody who finished last
 * term is not a student with homework, and somebody who registered
 * and never enrolled has no course for it to belong to.
 */
function audienceFor(audience, intakeId) {
  if (!db.isEnabled()) return Promise.resolve([]);
  if (audience === "batch" && !intakeId) return Promise.resolve([]);

  const one = audience === "batch";
  return safe("audience", () =>
    db.query(
      `SELECT DISTINCT s.id, s.name, s.email, s.student_ref
         FROM enrolments en
         JOIN students s ON s.id = en.student_id AND s.deleted_at IS NULL
        WHERE en.status = 'active'${one ? " AND en.intake_id = ?" : ""}
        ORDER BY s.name`,
      one ? [Number(intakeId)] : []
    ), []);
}

/**
 * Who a piece of homework is for, in one word.
 *
 * Derived rather than stored, so there is no fourth column to fall out
 * of step with the three that decide it. The order matters: an unlock
 * list beats everything, because for the people on it the batch and the
 * published flag are both ignored.
 */
function audienceOf(ex) {
  if (!ex) return "batch";
  if (String(ex.unlock_emails || "").trim()) return "people";
  return ex.intake_id ? "batch" : "all";
}

/**
 * Give chapters to people. One chapter stays one piece of homework.
 *
 * Three ticked chapters make three exercises, not one of eighteen
 * questions: a student works through them in order, and the results
 * page can then say which chapter caught the class out rather than
 * which third of a long list.
 *
 * Idempotent on the chapter. A chapter already given out is found by
 * title and the new people are ADDED to its list — so giving Kapitel 16
 * to three more students who missed a week does not make a second
 * Kapitel 16 sitting beside the first in everybody's portal.
 */
async function giveOut({ chapters, emails, dueOn, intakeId, module = 'homework', availableFrom=null, availableUntil=null, isRequired=true }) {
  if(module==='reading' && !require('./reading-schema').ready())return {ok:false,reason:'Lesen needs migration 37.'};
  const dateError=availabilityError(availableFrom,availableUntil,dueOn);if(dateError)return {ok:false,reason:dateError};
  if (!READY()) return { ok: false, reason: "This needs migration 28. It runs itself on the next restart." };
  if (!HAS_UNLOCK()) return { ok: false, reason: "This needs migration 29. It runs itself on the next restart." };

  const want = (Array.isArray(chapters) ? chapters : [chapters]).filter(Boolean);
  const who = [...new Set(
    (Array.isArray(emails) ? emails : [emails])
      .map((e) => String(e || "").trim().toLowerCase())
      .filter((e) => e.includes("@"))
  )];

  if (!want.length) return { ok: false, reason: "Tick at least one chapter." };
  if (!who.length) return { ok: false, reason: "Tick at least one person." };

  /* Which course this was given for.
   *
   * It labels the homework; it does not decide who can see it. The
   * unlock list still does that, and VISIBLE() has the unlock arm
   * bypass the batch arm entirely — so setting this cannot widen the
   * audience by one person. What it buys is that the student's portal
   * can say "German Regular A2" over a chapter instead of nothing,
   * and can offer a course dropdown to somebody taking two.
   *
   * Nothing is also an answer: a chapter given to a handful of people
   * across three classes belongs to no course, and saying it belongs
   * to one would be a lie on their screen.
   */
  const forIntake = Number(intakeId) || null;

  let made = 0;
  let added = 0;
  let repaired = 0;
  let refreshed = 0;
  const missing = [];

  try {
  for (const id of want) {
    const chapter = fromLibrary(id, module);
    if (!chapter) { missing.push(id); continue; }

    /* One row per chapter per course, not one per chapter.
       Matching on the title alone meant giving Kapitel 01 to an A1
       class and then to a Fast Track class updated the same row, and
       the second course silently took the first one's label. */
    const existing = module==='reading' ? await db.queryOne("SELECT id, source, unlock_emails FROM exercises WHERE module = 'reading' AND content_key = ? AND intake_id <=> ? LIMIT 1",[chapter.contentKey,forIntake]) : forIntake
      ? await db.queryOne(
          "SELECT id, source, unlock_emails FROM exercises WHERE title = ? AND intake_id = ?" + homeworkOnly() + " LIMIT 1",
          [chapter.title, forIntake])
      : await db.queryOne(
          "SELECT id, source, unlock_emails FROM exercises WHERE title = ? AND intake_id IS NULL" + homeworkOnly() + " LIMIT 1",
          [chapter.title]);

    if (existing) {
      /* A piece of homework with no questions in it is broken, and
         giving it out again is when somebody notices — so this is
         where it gets put right.

         It happened for real: `explain` is a MySQL reserved word and
         was unquoted in the question INSERT, so the exercise row was
         written and its questions were not. What reached the student
         was a piece of homework reading "0 questions", and pressing
         Start answered 404. Fixing the INSERT stops it recurring; this
         repairs the rows already in that state, because otherwise the
         match-by-title below would find them forever and never look
         inside. */
      const has = await db.queryOne(
        "SELECT COUNT(*) AS n FROM exercise_questions WHERE exercise_id = ?",
        [existing.id]
      );
      const already = splitEmails(existing.unlock_emails);
      const merged = [...new Set([...already, ...who])];

      /* The library has moved on since this row was written.
       *
       * Giving a chapter out again used to touch nothing but the
       * unlock list, the date and the batch -- so a chapter written
       * into the database once kept that version for ever. Kapitel 9
       * was given out as twenty-three questions on one page, the
       * file then grew seven pages, fourteen written tasks and a
       * reading picture, and the student went on seeing the old one
       * with no way to tell and nothing to press.
       *
       * The library is the master copy: it is in the repository, it
       * travels with a deploy, and it is what the Give-out screen
       * offers. So giving a chapter out again brings it up to date,
       * and the confirmation says how many were refreshed rather
       * than doing it silently -- because this DOES overwrite an
       * edit made in the Homework editor, and somebody who made one
       * needs to see that it has gone. */
      const stale = String(existing.source || "") !== String(chapter.source || "");

      if (!Number(has ? has.n : 0) || stale) {
        const res = await save(existing.id, {
          audience: forIntake ? "batch" : "people",
          intake_id: forIntake,
          title: chapter.title,
          source: chapter.source,
          level: chapter.level,
          due_on: dueOn || null, module, available_from:availableFrom, available_until:availableUntil, is_required:isRequired,
          published: 1,
          unlock_emails: merged.join(","),
        }, null);
        if (!res.ok) return { ok: false, reason: `${chapter.title}: ${res.reason}` };
        if (Number(has ? has.n : 0)) refreshed++;
        else repaired++;
        if(module==='reading')await db.query('UPDATE exercises SET available_from = ?, available_until = ?, is_required = ? WHERE id = ?',[availableFrom||null,availableUntil||null,isRequired?1:0,existing.id]);
      added += merged.length - already.length;
        continue;
      }

      // Union, so nobody is removed by somebody else being added.
      await db.query(
        "UPDATE exercises SET unlock_emails = ?, published = 1, due_on = ?, intake_id = ? WHERE id = ?",
        [merged.join(","), dueOn || null, forIntake, existing.id]
      );
      if(module==='reading')await db.query('UPDATE exercises SET available_from = ?, available_until = ?, is_required = ? WHERE id = ?',[availableFrom||null,availableUntil||null,isRequired?1:0,existing.id]);
      added += merged.length - already.length;
      continue;
    }

    const res = await save(0, {
      audience: forIntake ? "batch" : "people",
      intake_id: forIntake,
      title: chapter.title,
      source: chapter.source,
      level: chapter.level,
      due_on: dueOn || null, module, available_from:availableFrom, available_until:availableUntil, is_required:isRequired,
      published: 1,
      unlock_emails: who.join(","),
    }, null);

    if (!res.ok) return { ok: false, reason: `${chapter.title}: ${res.reason}` };
    made++;
  }

  } catch (e) {
    /* Whatever the database said, said back in words.
     *
     * This used to reach the route as an exception and the office got
     * "Internal Server Error" — a page that says nothing, on an action
     * that had just written some rows and not others. The message is
     * the database's own, because a guess about what went wrong is
     * worse than the truth, and the two cases worth naming are named.
     */
    console.error("Giving out homework failed:", e.message);

    if (e && e.code === "ER_BAD_NULL_ERROR" && /intake_id/.test(e.message || "")) {
      return {
        ok: false,
        reason: "Homework for chosen people rather than a batch needs migration 30, " +
                "which has not run yet. It applies itself the next time the site restarts.",
      };
    }
    if (e && e.code === "ER_BAD_FIELD_ERROR") {
      return {
        ok: false,
        reason: `The database is missing a column this needs (${e.message}). ` +
                "Restarting the site applies the migrations that add it.",
      };
    }
    return { ok: false, reason: `The database refused it: ${e.message}` };
  }

  if (missing.length) {
    return { ok: false, reason: `${missing.length} chapter(s) could not be found in the library.` };
  }

  /* What it was given FOR, said back.

     Without it there is no way to tell a give that recorded the course
     from one that did not — which matters, because the field is easy
     to leave alone and the difference only shows up later, in a
     student's portal, as a missing course name. */
  let forWhat = "";
  if (forIntake) {
    const b = await db.queryOne(
      `SELECT i.code, c.title AS course_title
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE i.id = ? LIMIT 1`, [forIntake]);
    forWhat = b ? ` for ${b.code}${b.course_title ? " — " + b.course_title : ""}` : "";
  }

  const bits = [];
  if (made) bits.push(`${made} chapter${made === 1 ? "" : "s"} given out`);
  if (repaired) {
    bits.push(`${repaired} chapter${repaired === 1 ? "" : "s"} had no questions and ` +
              `${repaired === 1 ? "was" : "were"} rebuilt`);
  }
  /* Said rather than done quietly: refreshing replaces whatever was
     in the database with what is in content/homework, and that
     includes an edit somebody made in the Homework editor. */
  if (refreshed) {
    bits.push(`${refreshed} chapter${refreshed === 1 ? "" : "s"} brought up to date ` +
              `from the library`);
  }
  if (added) bits.push(`${added} more ${added === 1 ? "person" : "people"} added to chapters already out`);
  if (!bits.length) bits.push("Everybody ticked already had every chapter ticked");

  return {
    ok: true,
    message: `${bits.join(", ")} — to ${who.length} ` +
             `${who.length === 1 ? "person" : "people"}${forWhat}` +
             `${forIntake ? "" : ", with no course on it"}.`,
  };
}

/**
 * Take homework back. Deletes it, and everything hanging off it.
 *
 * There was no way to undo a mistake here at all, which is not a
 * feature anybody asks for until the first time they need it — and by
 * then thirty-nine chapters are in somebody's portal.
 *
 * What goes with it: the questions, and every attempt and answer
 * against them (ON DELETE CASCADE). That is the part worth saying out
 * loud before it happens, so this counts the attempts first and hands
 * the number back for the confirmation to use. A student's work is not
 * something to remove quietly.
 */
async function remove(ids) {
  if (!READY()) return { ok: false, reason: "This needs migration 28." };

  const list = (Array.isArray(ids) ? ids : [ids])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) return { ok: false, reason: "Nothing was ticked." };

  const holes = list.map(() => "?").join(",");

  const [titles, attempts] = await Promise.all([
    db.query(`SELECT id, title FROM exercises WHERE id IN (${holes})`, list),
    db.queryOne(
      `SELECT COUNT(*) AS n FROM exercise_attempts WHERE exercise_id IN (${holes})`, list
    ),
  ]);

  if (!titles || !titles.length) return { ok: false, reason: "No such homework." };

  await db.query(`DELETE FROM exercises WHERE id IN (${holes})`, list);

  const gone = titles.length;
  const work = Number(attempts ? attempts.n : 0);
  return {
    ok: true,
    message:
      `${gone} piece${gone === 1 ? "" : "s"} of homework removed` +
      (work ? `, along with ${work} attempt${work === 1 ? "" : "s"} against ${gone === 1 ? "it" : "them"}` : "") +
      ". Nobody can see " + (gone === 1 ? "it" : "them") + " any more.",
  };
}

/** How much student work would go with these. For the confirmation. */
async function workOn(ids) {
  if (!READY()) return 0;
  const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
  if (!list.length) return 0;
  const row = await db.queryOne(
    `SELECT COUNT(*) AS n FROM exercise_attempts WHERE exercise_id IN (${list.map(() => "?").join(",")})`,
    list
  );
  return Number(row ? row.n : 0);
}

/* ── Unlocking, one person at a time ─────────────────────────────── */

/**
 * Everybody with a student account, newest first.
 *
 * The same shape and the same order as the enrolment picker's, because
 * it is the same job — find a person in a dropdown — and two lists of
 * students that sort differently is two things to learn.
 */
function people(limit = 400) {
  return safe("people", () =>
    db.query(
      `SELECT s.id, s.student_ref, s.name, s.email, s.status, s.created_at
         FROM students s
        WHERE s.deleted_at IS NULL AND s.email IS NOT NULL AND s.email <> ''
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ${Number(limit) || 400}`
    ), []);
}

/** Who this exercise is currently unlocked for, as rows. */
async function unlockedFor(exerciseId) {
  if (!HAS_UNLOCK()) return [];
  const row = await db.queryOne(
    "SELECT unlock_emails FROM exercises WHERE id = ?", [Number(exerciseId)]
  );
  const list = splitEmails(row && row.unlock_emails);
  if (!list.length) return [];

  // Matched back to accounts so the page can show a name rather than
  // an address. An address with no account still appears — it was
  // typed deliberately and hiding it would make it look removed.
  const found = await safe("unlocked", () =>
    db.query(
      `SELECT id, name, email, student_ref FROM students
        WHERE deleted_at IS NULL AND LOWER(email) IN (${list.map(() => "?").join(",")})`,
      list
    ), []);

  const byEmail = new Map(found.map((r) => [String(r.email).toLowerCase(), r]));
  return list.map((e) => byEmail.get(e) || { id: null, name: null, email: e, student_ref: null });
}

/**
 * Add or remove one address from an exercise's unlock list.
 *
 * Read, change, write — rather than an UPDATE that appends a string.
 * Appending cannot tell whether an address is already there, and a
 * list that grows a duplicate every time somebody clicks twice is a
 * list that eventually will not fit in the column.
 */
async function setUnlock(exerciseId, email, { on }) {
  if (!HAS_UNLOCK()) {
    return { ok: false, reason: "This needs migration 29. It runs itself on the next restart." };
  }
  const who = String(email || "").trim().toLowerCase();
  if (!who.includes("@")) return { ok: false, reason: "That is not an email address." };

  const row = await db.queryOne(
    "SELECT unlock_emails FROM exercises WHERE id = ?", [Number(exerciseId)]
  );
  if (!row) return { ok: false, reason: "No such exercise." };

  const list = splitEmails(row.unlock_emails);
  const at = list.indexOf(who);
  if (on && at === -1) list.push(who);
  if (!on && at !== -1) list.splice(at, 1);

  await db.query(
    "UPDATE exercises SET unlock_emails = ? WHERE id = ?",
    [list.length ? list.join(",") : null, Number(exerciseId)]
  );

  return {
    ok: true,
    locked: list.length === 0,
    message: on
      ? `Unlocked for ${who}. Nobody else can see it.`
      : (list.length
          ? `${who} can no longer see it.`
          : `${who} removed — the last one, so the ordinary rule applies again: published, and enrolled on the batch.`),
  };
}

/* The right answer, for a results row.
 *
 * Read from the same columns the marking reads, so the page cannot
 * show one answer while the site accepts another. Alternatives are
 * joined with "or" because that is what they are — a teacher scanning
 * this needs to see that both were allowed. */
function answerOf(q) {
  if (q.kind === "choice") return (parseJson(q.options, []) || [])[0] || "";
  if (q.kind === "dropdown") {
    return (parseJson(q.options, []) || [])
      .map((g) => (g.options || [])[g.answer || 0])
      .join(" · ");
  }
  return (parseJson(q.accept, []) || []).map((list) => list.join(" or ")).join(" · ");
}

const splitEmails = (v) =>
  String(v == null ? "" : v)
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.includes("@"));

/* ── What the teacher needs ──────────────────────────────────────── */

/**
 * The only figure here that saves anybody time: which questions the
 * class got wrong.
 *
 * Counted from FIRST attempts only. A student who went back and got it
 * right the second time has learnt it; counting that as a pass would
 * hide the very thing this is for, which is what to go over on Monday.
 */
function results(exerciseId) {
  if (!READY()) return Promise.resolve({ questions: [], students: [] });

  return safe("results", async () => {
    if(db.hasColumn('exercises.learning_config') && db.hasColumn('exercise_attempts.learning_state')) {
      const row=await db.queryOne('SELECT learning_config FROM exercises WHERE id = ?',[Number(exerciseId)]);
      const config=parseJson(row?.learning_config,null);
      if(config)return require('./homework-progress').results(exerciseId,config);
    }
    const questions = await db.query(
      `SELECT q.id, q.seq, q.kind, q.prompt, q.accept, q.\`options\`,
              SUM(ans.correct = 1) AS got_it,
              SUM(ans.correct = 0) AS missed
         FROM exercise_questions q
         LEFT JOIN exercise_attempts a ON a.exercise_id = q.exercise_id AND a.attempt = 1
         LEFT JOIN exercise_answers ans ON ans.question_id = q.id AND ans.attempt_id = a.id
        WHERE q.exercise_id = ?
        GROUP BY q.id
        ORDER BY q.seq`,
      [Number(exerciseId)]
    );

    /* What they actually wrote when they were wrong.
     *
     * The number that says how many got a question wrong tells a
     * teacher to go over it again. This tells them what to say: six
     * students writing "komme" for "kommt" is one sentence on Monday
     * morning, and six different wrong answers is a question that was
     * badly worded.
     *
     * First attempts only, for the same reason as the counts above —
     * and grouped after trimming and lower-casing, so "Komme" and
     * "komme " are one wrong answer rather than three. */
    const wrong = await db.query(
      `SELECT ans.question_id, LOWER(TRIM(ans.given)) AS given, COUNT(*) AS n
         FROM exercise_answers ans
         JOIN exercise_attempts a ON a.id = ans.attempt_id AND a.attempt = 1
        WHERE a.exercise_id = ? AND ans.correct = 0
          AND TRIM(COALESCE(ans.given, '')) <> ''
        GROUP BY ans.question_id, LOWER(TRIM(ans.given))
        ORDER BY n DESC, given
        LIMIT 200`,
      [Number(exerciseId)]
    );

    const wrongBy = new Map();
    for (const w of wrong || []) {
      const list = wrongBy.get(w.question_id) || [];
      // Three is enough to see a pattern; the fourth is noise on a
      // page somebody is scanning between classes.
      if (list.length < 3) list.push({ given: w.given, n: Number(w.n) });
      wrongBy.set(w.question_id, list);
    }

    const students = await db.query(
      `SELECT s.id, s.name, s.student_ref,
              MAX(a.score) AS best, MIN(a.score) AS first_score,
              COUNT(a.id) AS tries, MAX(a.finished_at) AS last_at,
              MAX(a.out_of) AS out_of
         FROM enrolments en
         JOIN students s ON s.id = en.student_id AND s.deleted_at IS NULL
         LEFT JOIN exercise_attempts a ON a.student_id = s.id AND a.exercise_id = ?
                                      AND a.finished_at IS NOT NULL
        WHERE en.intake_id = (SELECT intake_id FROM exercises WHERE id = ?)
          AND en.status = 'active'
        GROUP BY s.id
        ORDER BY a.finished_at IS NULL, s.name`,
      [Number(exerciseId), Number(exerciseId)]
    );

    return {
      questions: questions.map(function (q) {
        const bits = splitImage(q.prompt);
        const got = Number(q.got_it || 0);
        const missed = Number(q.missed || 0);
        const seen = got + missed;
        return {
          id: q.id, seq: q.seq, kind: q.kind, prompt: bits.prompt,
          got, missed, seen,
          // What the right answer was, so the row reads on its own.
          answer: answerOf(q),
          wrong: wrongBy.get(q.id) || [],
          // Null rather than 0 when nobody has answered it: "0% got
          // this right" and "nobody has tried it" are different facts
          // and only one of them is worth acting on.
          rate: seen ? Math.round((got / seen) * 100) : null,
        };
      }),
      students: students.map((s) => ({
        id: s.id, name: s.name, ref: s.student_ref,
        tries: Number(s.tries || 0),
        best: s.best == null ? null : Number(s.best),
        outOf: s.out_of == null ? null : Number(s.out_of),
        lastAt: s.last_at || null,
      })),
    };
  }, { questions: [], students: [] });
}


function moduleWhere(module) {return db.hasColumn('exercises.module') ? "e.module = '"+(module==='reading'?'reading':'homework')+"'" : module==='reading'?'0=1':'1=1';}
function availabilityWhere(module) {return module==='reading' && db.hasColumn('exercises.module') ? '(e.available_from IS NULL OR e.available_from <= UTC_TIMESTAMP()) AND (e.available_until IS NULL OR e.available_until > UTC_TIMESTAMP())' : '1=1';}
function availabilityError(from,until,due) {
  for(const d of [from,until])if(d && (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(d)||!Number.isFinite(Date.parse(d+'Z'))))return 'Invalid availability date (UTC).';
  if(due && (!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))))return 'Invalid due date.';
  if(from&&until&&new Date(from+'Z')>=new Date(until+'Z'))return 'Availability end must be after start.';
  return null;
}

module.exports = {
  READY, HAS_UNLOCK, save, forBatch, forStudentList, forStudent,
  markOf, passMark, PASS,
  scope, within, query, courseKey,
  start, check, finish, results, judge, splitImage, progress, restart, latest, nextFor,
  people, unlockedFor, setUnlock, splitEmails,
  library, books, bookOfTitle, fromLibrary, audienceOf, audienceFor, giveOut,
  remove, workOn, given, withdraw, standings, classBoard,
};

function homeworkOnly() { return db.hasColumn("exercises.module") ? " AND module = 'homework'" : ""; }
