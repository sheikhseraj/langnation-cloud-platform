// /rootadmin — the content editor.
//
// Separate from /admin on purpose. /admin reads enquiries; this changes
// what the public site says and what it charges. They have different
// passwords so the day-to-day one can be handed out later without also
// giving away the ability to edit prices.
//
// Closed by default: with no ROOT_PASSWORD set, every route here says so
// and does nothing. An unconfigured editor must be shut, not open.
//
// Saving writes to MySQL and then awaits a cache refresh before replying,
// so by the time the editor says "Saved" the public site is already
// serving the new value. No publish step, no redeploy.

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const db = require("../lib/db");
const coursesDb = require("../lib/courses-db");
const insight = require("../lib/insight");
const exercises = require("../lib/exercises");
const { env } = require("../lib/env");
const site = require("../lib/site");
const translate = require("../lib/translate");
const intakes = require("../lib/intakes");
const lessons = require("../lib/lessons");
const sched = require("../lib/schedule");
const courseGroups = require("../lib/course-groups");
const enrolments = require("../lib/enrolments");
const teacherAccounts = require("../lib/teachers");

const COOKIE = "ln_root";
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // a working day

/** Fields a form may set. Anything else in the body is ignored. */
const EDITABLE = [
  "title", "track", "level", "level_label", "category", "code",
  "duration", "lectures", "quizzes", "seats",
  "price_eur", "discount_eur", "sticker", "upcoming", "summary",
  "body_description", "body_curriculum", "body_requirements", "body_exam",
  "seo_title", "seo_description", "seo_keywords",
  "status", "sort_order",
];

const NUMERIC = new Set(["quizzes", "seats", "price_eur", "discount_eur", "sort_order"]);

function secret() {
  // Falls back to the password itself so cookies still work when only
  // ROOT_PASSWORD is set. SESSION_SECRET is preferred.
  return env("SESSION_SECRET") || env("ROOT_PASSWORD") || "";
}

function sign(expiresAt) {
  const mac = crypto.createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
  return String(expiresAt) + "." + mac;
}

function valid(token) {
  if (!token || !secret()) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;
  const [expiresAt, mac] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;
  const expected = crypto.createHmac("sha256", secret()).update(expiresAt).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isAuthed = (req) => valid(req.cookies && req.cookies[COOKIE]);
const configured = () => !!(env("ROOT_PASSWORD") || env("ROOT_PASSWORD_HASH"));

/** Turn a form body into a row, dropping anything not in EDITABLE. */
function rowFromForm(body) {
  const row = {};
  for (const f of EDITABLE) {
    if (f === "upcoming") continue; // handled below: unchecked boxes are absent
    if (!(f in body)) continue;
    let v = body[f];
    v = typeof v === "string" ? v.trim() : v;
    if (NUMERIC.has(f)) {
      row[f] = v === "" || v == null ? null : Number(v);
      continue;
    }
    row[f] = v === "" ? null : v;
  }
  row.upcoming = body.upcoming ? 1 : 0;
  return row;
}

/** Reject anything that would render a broken page. */
function problemsWith(row) {
  const out = [];
  if (!row.title) out.push("Title cannot be empty.");
  if (row.title && row.title.length > 200) out.push("Title is too long (maximum 200 characters).");
  for (const f of ["price_eur", "discount_eur"]) {
    if (row[f] != null && (!Number.isFinite(row[f]) || row[f] < 0)) {
      out.push((f === "price_eur" ? "Price" : "Discount") + " must be a number of 0 or more.");
    }
  }
  /* The same rule the Prices page enforces, from the same function.

     Both screens edit the same two columns, so a rule on only one of
     them is a rule with a way round it — and the way round is the
     screen somebody uses when they are editing one course carefully,
     which is the more likely of the two. */
  const money = coursesDb.priceProblem(row.price_eur, row.discount_eur);
  if (money) out.push(money);
  if (row.status && !["draft", "published", "archived"].includes(row.status)) {
    out.push("Status must be draft, published or archived.");
  }
  return out;
}

function build({module='homework'} = {}) {
  const sharedExercises=require('../lib/exercises');
  const reading=module==='reading';
  const base=reading?'/rootadmin/lesen':'/rootadmin';
  const exercises={...sharedExercises,
    library:()=>sharedExercises.library(module),books:()=>sharedExercises.books(module),
    fromLibrary:id=>sharedExercises.fromLibrary(id,module),
    forBatch:id=>sharedExercises.forBatch(id,module),given:chapters=>sharedExercises.given(chapters,module),
    giveOut:fields=>sharedExercises.giveOut({...fields,module}),withdraw:fields=>sharedExercises.withdraw({...fields,module}),
    save:(id,fields,teacher)=>sharedExercises.save(id,{...fields,module},teacher)};

  const router = express.Router();
  router.use(async(req,res,next)=>{
    res.locals.hwBase=base;res.locals.hwLabel=reading?'Lesetraining':'Aufgaben';res.locals.readingAdmin=reading;res.locals.csrfToken='';
    if(!reading){
      if(!isAuthed(req))return next();
      const match=req.path.match(/^\/exercise\/(\d+)/);
      if(match && db.hasColumn('exercises.module')){try{const row=await db.queryOne('SELECT module FROM exercises WHERE id = ?',[Number(match[1])]);if(row?.module==='reading')return req.method==='GET'?res.redirect('/rootadmin/lesen'+req.url):res.sendStatus(403);}catch(e){return next(e);}}
      if(req.path==='/exercises/remove' && db.hasColumn('exercises.module')){try{for(const id of [req.body?.id||[]].flat()){const row=await db.queryOne('SELECT module FROM exercises WHERE id = ?',[Number(id)]);if(row?.module==='reading')return res.sendStatus(403);}}catch(e){return next(e);}}
      return next();
    }
    if(!isAuthed(req))return res.redirect('/rootadmin');
    if(req.path==='/')return res.redirect(base+'/exercises');
    if(!/^\/(?:give|exercises(?:\/remove)?|exercise\/(?:new|\d+)(?:\/(?:results|unlock|preview))?)$/.test(req.path))return res.sendStatus(404);
    if(!require('../lib/reading-schema').ready())return res.status(503).send('Lesen needs migration 37.');
    const csrf=require('../lib/csrf');
    if(req.method!=='GET'&&!csrf.valid(req))return res.status(403).send('Reload the form before saving.');
    res.locals.csrfToken=csrf.token(req,res);
    const redirect=res.redirect.bind(res);res.redirect=(...args)=>{const i=args.length-1;if(typeof args[i]==='string')args[i]=args[i].replace(/^\/rootadmin\/(?=exercise|give)/,base+'/');return redirect(...args);};
    try {
      const match=req.path.match(/^\/exercise\/(\d+)/);
      if(match){const row=await db.queryOne("SELECT id FROM exercises WHERE id = ? AND module = 'reading'",[Number(match[1])]);if(!row)return res.sendStatus(404);}
      if(req.path==='/exercises/remove'){const ids=[req.body?.id||[]].flat().map(Number);for(const id of ids){const row=await db.queryOne("SELECT id FROM exercises WHERE id = ? AND module = 'reading'",[id]);if(!row)return res.sendStatus(404);}}
      next();
    }catch(e){next(e);}
  });

  router.use((req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  // `site` carries the asset version, the brand and the chosen ground, and
  // the shared back-office partials expect it. The public routes get it
  // from their own middleware; this router has none, so it is added here.
  // The weekly pattern is displayed in one place and parsed in
  // another, and a template that reimplements the parsing is a template
  // that will disagree with the module eventually. So the views get the
  // module.
  // Generating lessons must never be the reason a save appears to fail.
  // The batch is already written by the time this runs, and the sweep
  // will pick up anything missed within ten minutes.
  const generateQuietly = (id) =>
    lessons.generate(id).catch((e) => {
      console.warn("  ! lessons not generated for batch " + id + ":", e.message);
    });

  const render = (res, view, data) =>
    res.render("rootadmin/" + view, Object.assign({ site, sched }, data));

  // ── Auth ────────────────────────────────────────────────────────────

  router.get("/", async (req, res, next) => {
    if (!configured()) {
      return render(res, "login", {
        error: "No ROOT_PASSWORD is set. Add it in your hosting environment to open the editor.",
      });
    }
    if (!isAuthed(req)) return render(res, "login", { error: null });
    if (!db.isEnabled()) {
      return render(res, "login", {
        error: "The database is not configured, so there is nothing to edit.",
      });
    }
    try {
      const en = await coursesDb.allForEditing("en");
      const de = await coursesDb.allForEditing("de");
      const deBySlug = new Map(de.map((c) => [c.slug, c]));
      render(res, "list", {
        courses: en,
        groups: courseGroups.group(en),
        deBySlug,
        degraded: coursesDb.isDegraded(),
        ready: coursesDb.isReady(),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/login", async (req, res) => {
    const hash = env("ROOT_PASSWORD_HASH");
    const plain = env("ROOT_PASSWORD");
    const supplied = String((req.body && req.body.password) || "");

    if (!hash && !plain) {
      return render(res, "login", { error: "No ROOT_PASSWORD is set." });
    }

    let ok = false;
    try {
      if (hash) {
        ok = await bcrypt.compare(supplied, hash);
      } else {
        const a = Buffer.from(supplied);
        const b = Buffer.from(plain);
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      // A uniform delay makes a wrong password indistinguishable from a
      // missing one by timing.
      await new Promise((r) => setTimeout(r, 400));
      return render(res, "login", { error: "Incorrect password." });
    }

    const expiresAt = Date.now() + MAX_AGE_MS;
    res.cookie(COOKIE, sign(expiresAt), {
      httpOnly: true,
      sameSite: "lax",
      secure: String(env("SITE_ORIGIN", "")).startsWith("https://"),
      maxAge: MAX_AGE_MS,
      path: "/rootadmin",
    });
    res.redirect("/rootadmin");
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { path: "/rootadmin" });
    res.redirect("/rootadmin");
  });

  // ── Editing ─────────────────────────────────────────────────────────

  router.get("/course/:slug", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const pair = await coursesDb.pair(req.params.slug);
      if (!pair.en && !pair.de) return res.status(404).send("No such course.");
      render(res, "course", {
        pair,
        slug: req.params.slug,
        current: req.query.lang === "de" ? "de" : "en",
        errors: [],
        saved: req.query.saved === "1",
        canTranslate: translate.isEnabled(),
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Translate one course's English fields into German.
   *
   * Answers JSON to the Translate button, which fills the German form
   * with the result. Nothing is saved here — the editor reviews it and
   * presses Save, which is the whole point of a button rather than an
   * automatic translation on write.
   */
  router.post("/translate/:slug", async (req, res) => {
    if (!isAuthed(req)) return res.status(403).json({ error: "Not signed in." });
    if (!translate.isEnabled()) {
      return res.status(400).json({ error: "No DEEPL_API_KEY is set." });
    }

    try {
      const pair = await coursesDb.pair(req.params.slug);
      const en = pair.en;
      if (!en) return res.status(404).json({ error: "No English course to translate from." });

      // Order matters: the reply is matched back to these names.
      const names = [
        "title", "summary", "level_label", "category", "duration", "lectures", "sticker",
        "body_description", "body_curriculum", "body_requirements", "body_exam",
        "seo_title", "seo_description",
      ];
      const source = {
        title: en.title,
        summary: en.summary,
        level_label: en.levelLabel,
        category: en.category,
        duration: en.duration,
        lectures: en.lectures,
        sticker: en.sticker,
        body_description: en.body.description,
        body_curriculum: en.body.curriculum,
        body_requirements: en.body.requirements,
        body_exam: en.body.examPattern,
        seo_title: en.seo.title,
        seo_description: en.seo.description,
      };

      const out = await translate.toGerman(names.map((n) => source[n]));
      const fields = {};
      names.forEach((n, i) => {
        // Only send back fields that had something to translate, so the
        // button never blanks a field the editor has already filled in.
        if (source[n] && String(source[n]).trim()) fields[n] = out[i];
      });

      res.json({ fields });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  router.post("/course/:slug", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    const slug = req.params.slug;
    const lang = req.body && req.body.lang === "de" ? "de" : "en";

    try {
      const row = rowFromForm(req.body || {});
      const problems = problemsWith(row);
      if (problems.length) {
        const pair = await coursesDb.pair(slug);
        return render(res, "course", {
          pair, slug, current: lang, errors: problems, saved: false,
          canTranslate: translate.isEnabled(),
        });
      }

      const existing = await coursesDb.pair(slug);
      const cols = Object.keys(row);
      const values = cols.map((c) => row[c]);

      if (existing[lang]) {
        const sets = cols.map((c) => "`" + c + "` = ?").join(", ");
        await db.query(
          "UPDATE courses SET " + sets + " WHERE slug = ? AND lang = ?",
          values.concat([slug, lang])
        );
      } else {
        // The German row may not exist yet; create it from the form.
        const names = cols.map((c) => "`" + c + "`").join(", ");
        const marks = cols.map(() => "?").join(", ");
        await db.query(
          "INSERT INTO courses (`slug`, `lang`, " + names + ") VALUES (?, ?, " + marks + ")",
          [slug, lang].concat(values)
        );
      }

      // Awaited, so the public site is already serving this by the time
      // the editor sees the result.
      await coursesDb.refresh();
      res.redirect("/rootadmin/course/" + encodeURIComponent(slug) + "?saved=1&lang=" + lang);
    } catch (e) {
      next(e);
    }
  });

  // ── Prices ──────────────────────────────────────────────────────────
  //
  // Every price on one page. Changing the term fee across a dozen
  // courses meant opening a dozen course editors, each a long form
  // where the price is three fields down — so in practice it was done
  // once and then not again. This is the same three columns for every
  // course, saved in one go.

  /* ── Homework ─────────────────────────────────────────────────────
   *
   * An exercise is a batch, a title and a block of text. Everything
   * else about it — the kinds of question, the answers, the number of
   * gaps — is read out of that text by lib/exercise-format, so there
   * is no question builder here and nothing to keep in step with one.
   */

  /* Give out homework: who, what, by when, one button.
   *
   * The two dropdowns only narrow what is listed, and they are their
   * own GET form — so choosing a different level reloads the lists
   * rather than leaving ticks against chapters no longer on screen.
   */
  router.get("/give", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured." });
    }
    try {
      const all = exercises.library();
      const levels = [...new Set(all.map((c) => c.level).filter(Boolean))].sort();

      /* Who already has what.
       *
       * The page used to open with every box blank however much had
       * been given out, so the only way to find out whether somebody
       * already had Kapitel 01 was to give it to them again and read
       * the confirmation afterwards. A screen whose whole job is "who
       * gets what" has to be able to say who has got what.
       *
       * Sent as indices rather than as addresses on every row: forty
       * chapters against a few hundred students is a hundred kilobytes
       * of email address in the HTML, and the same fact fits in a list
       * of small numbers per person. */
      const has = await exercises.given(all);
      const ix = new Map(all.map((c, i) => [c.id, i]));

      /* Per BATCH, not merged across them.
       *
       * These were counted on the chapter's title alone, so a chapter
       * given to LNIKB01 read "already given" for LNIKB02 too, and the
       * office was told a class had homework it had never been given.
       * A chapter is given to a batch; the same chapter on another
       * batch is a different thing.
       *
       * Written as "batch:indices|batch:indices" rather than JSON: it
       * is read by one line of split() in the browser, and a JSON blob
       * in an attribute is a quoting accident waiting to happen.
       * Batch "0" is the homework with no batch on it. */
      const packed = (perBatch) => {
        const bits = [];
        for (const [batch, list] of perBatch) {
          if (list.length) bits.push(batch + ":" + list.join(","));
        }
        return bits.join("|");
      };

      const people = (await everybody()).map((s) => {
        const email = String(s.email || "").toLowerCase();
        const mine = new Map();
        for (const [id, byBatch] of has) {
          for (const [batch, who] of byBatch) {
            if (!who.has(email)) continue;
            if (!mine.has(batch)) mine.set(batch, []);
            mine.get(batch).push(ix.get(id));
          }
        }
        return { ...s, has: packed(mine), hasAny: [...mine.values()].reduce((n, l) => n + l.length, 0) };
      });

      /* Everybody and every chapter, once.
       *
       * Nothing is narrowed here. The two dropdowns on the page hide
       * rows and nothing else, because narrowing on the server meant
       * reloading, and reloading meant the people somebody had already
       * ticked came back unticked. Which is what happened the first
       * time it was used. */
      render(res, "give", {
        levels,
        /* The books themselves, so the page can offer one.
         *
         * The school teaches two programmes out of two different sets
         * of chapters, and the only filter here was the CEFR level --
         * which puts Regular A1 and Intensive A1 in one list and gives
         * nobody a way to hand over "the A2 book". With this, choosing
         * a book and pressing Select all is the whole of it, because
         * Select all has always meant what is on screen. */
        books: exercises.books(),
        batches: await intakes.list(),
        people,
        // How many people already have each chapter, per batch, for
        // the count on its row. The script picks the batch that is
        // chosen; this is what a page with no script shows, which is
        // the no-batch one.
        chapters: all.map((c) => {
          const byBatch = has.get(c.id) || new Map();
          const bits = [];
          for (const [batch, who] of byBatch) {
            if (who.size) bits.push(batch + ":" + who.size);
          }
          return { ...c, outs: bits.join("|"), out: (byBatch.get("0") || new Set()).size };
        }),
        due: req.query.due_on || "",
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/give", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const body = req.body || {};
      const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

      let result;
      try {
        /* One form, two buttons. Which one was pressed is the name of
           the submit that posted — so taking homework back uses the
           lists already in front of somebody rather than a second
           screen for picking the same people again. */
        result = body.lock
          ? await exercises.withdraw({
              chapters: list(body.what),
              emails: list(body.who),
              /* Off this course only — taking Kapitel 01 back from one
                 class is not a reason for another class to lose it —
                 unless "Every course" was chosen, which is the one
                 answer that means all of them. Passed through as it
                 came, so withdraw() decides what it means. */
              intakeId: body.for_intake === "all" ? "all" : (Number(body.for_intake) || null),
            })
          : await exercises.giveOut({
              chapters: list(body.what),
              emails: list(body.who),
              dueOn: body.due_on || null, availableFrom:body.available_from||null, availableUntil:body.available_until||null, isRequired:body.is_required!=='0',
              // Which course it is FOR, which is a label and not a
              // permission: the unlock list still decides who sees it.
              intakeId: Number(body.for_intake) || null,
            });
      } catch (e) {
        /* Back to the page with the reason on it, not to a 500.
           "Internal Server Error" on a button that writes rows leaves
           somebody with no idea whether it half-worked. */
        console.error("Give out threw:", e.stack || e.message);
        result = { ok: false, reason: `It did not go through: ${e.message}` };
      }

      const key = result.ok ? "done" : "problem";
      const text = result.ok ? result.message : result.reason;
      /* `scope` used to be carried back here and nothing read it — the
         GET route never looked at it. It was dead before the two batch
         dropdowns were merged into one; it is dead and misleading
         after, because the name no longer exists on the form. */
      const back = new URLSearchParams();
      back.set(key, text);
      res.redirect("/rootadmin/give?" + back.toString());
    } catch (e) {
      next(e);
    }
  });

  /* Everybody with an account, and which batches they are on.
   *
   * One query rather than one per scope, because the page holds every
   * scope at once: `batches` is what the dropdown filters against in
   * the browser, and somebody on no batch is still listed — they have
   * signed up and not started, and homework is a reasonable thing to
   * give them.
   */
  async function everybody() {
    const people = await exercises.people();
    if (!people.length) return people;

    const rows = await db.query(
      `SELECT student_id, intake_id FROM enrolments WHERE status = 'active'`
    ).catch(() => []);

    const by = new Map();
    for (const r of rows || []) {
      const list = by.get(Number(r.student_id)) || [];
      list.push(Number(r.intake_id));
      by.set(Number(r.student_id), list);
    }
    return people.map((s) => ({ ...s, batches: by.get(Number(s.id)) || [] }));
  }

  router.get("/exercises", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured." });
    }
    try {
      const batches = await intakes.list();
      const groups = [];

      /* Homework with no batch, first.
       *
       * This walked the batches and nothing else, so everything given
       * out to chosen people — which has no batch by design — was
       * invisible here. Thirty-nine chapters in somebody's portal and
       * no page in the back office that admitted they existed, which is
       * also why there was no way to take them back.
       */
      const loose = await exercises.forBatch(null);
      if (loose.length) {
        groups.push({ id: null, code: "Not tied to a batch", course_title: "", rows: loose });
      }

      // One query per batch: this is a handful of batches, and the
      // alternative is a join that has to explain which rows are which
      // anyway.
      for (const b of batches) {
        const rows = await exercises.forBatch(b.id);
        if (rows.length) {
          groups.push({ id: b.id, code: b.code, course_title: b.course_title, rows });
        }
      }

      render(res, "exercises", {
        groups,
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  /* Take homework back.
   *
   * One endpoint for one and for forty, because removing thirty-nine
   * things one at a time is not an undo anybody uses.
   */
  router.post("/exercises/remove", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const body = req.body || {};
      const ids = Array.isArray(body.id) ? body.id : body.id == null ? [] : [body.id];

      let result;
      try {
        result = await exercises.remove(ids);
      } catch (e) {
        console.error("Removing homework threw:", e.stack || e.message);
        result = { ok: false, reason: `It did not go through: ${e.message}` };
      }

      const key = result.ok ? "done" : "problem";
      const text = result.ok ? result.message : result.reason;
      res.redirect(`/rootadmin/exercises?${key}=${encodeURIComponent(text)}`);
    } catch (e) {
      next(e);
    }
  });

  if(reading)router.all('/exercise/:id/preview',async(req,res,next)=>{
    try{
      const row=await db.queryOne("SELECT * FROM exercises WHERE id = ? AND module = 'reading'",[Number(req.params.id)]);
      if(!row)return res.sendStatus(404);
      const chapter=require('../lib/exercise-format').parse(row.source||'').learning;
      if(chapter?.module!=='reading')return res.status(400).send('Save a valid reading lesson before previewing.');
      const engine=require('../lib/homework-engine');
      if(req.method==='POST'){
        try{const state=engine.transition(chapter,req.body.state||engine.initial(),req.body);return res.json({state,chapter:engine.publicChapter(chapter,state),counts:engine.tally(chapter,state)});}catch(e){return res.status(400).json({error:e.message});}
      }
      if(req.method!=='GET')return res.sendStatus(405);
      const state=engine.initial();return render(res,'reading-preview',{ex:row,chapter:engine.publicChapter(chapter,state),state,attempt:0,csrf:res.locals.csrfToken,nextLesson:null,savedCount:0,preview:true,checkUrl:base+'/exercise/'+row.id+'/preview'});
    }catch(e){next(e);}
  });

  router.get(["/exercise/new", "/exercise/:id"], async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured." });
    }
    try {
      const isNew = !req.params.id || req.params.id === "new";
      const id = isNew ? 0 : Number(req.params.id);

      // A chapter chosen from the library, loaded into the box. The
      // id is matched against the list rather than joined onto a path
      // — it is a string off a form, and a string off a form has no
      // business being half of a filename.
      const picked = isNew && req.query.from ? exercises.fromLibrary(req.query.from) : null;

      const ex = id
        ? await db.queryOne("SELECT * FROM exercises WHERE id = ?", [id])
        : {
            id: 0,
            title: picked ? picked.title : "",
            source: picked ? picked.source : "",
            intake_id: null, due_on: null, published: 0,
          };
      if (!ex) return next();

      const count = id
        ? await db.queryOne("SELECT COUNT(*) AS n FROM exercise_questions WHERE exercise_id = ?", [id])
        : { n: 0 };

      const unlocked = id ? await exercises.unlockedFor(id) : [];
      const audience = id ? exercises.audienceOf(ex) : "all";

      render(res, "exercise", {
        ex,
        picked,
        library: exercises.library(),
        audience,
        // Who this actually reaches, named. A page that says "one
        // batch" and leaves somebody to work out which eight people
        // that is has not answered the question they asked it.
        willGet: audience === "people" ? [] : await exercises.audienceFor(audience, ex.intake_id),
        batches: await batchesWithHeads(),
        people: await exercises.people(),
        unlocked,
        hasUnlock: exercises.HAS_UNLOCK(),
        questionCount: ex.learning_config
          ? require('../lib/homework-engine').questions(typeof ex.learning_config === 'string' ? JSON.parse(ex.learning_config) : ex.learning_config).length
          : Number(count ? count.n : 0),
        problems: [],
        done: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  /* The batches, each with how many people are on it.
   *
   * The count is in the dropdown because "which batch" and "how many
   * would get this" are the same question asked twice, and answering
   * both in one line saves a page load somebody would otherwise make
   * to find out. */
  async function batchesWithHeads() {
    const list = await intakes.list();
    const counts = await db.query(
      `SELECT intake_id, COUNT(*) AS n FROM enrolments
        WHERE status = 'active' GROUP BY intake_id`
    );
    const by = new Map((counts || []).map((r) => [Number(r.intake_id), Number(r.n)]));
    return list.map((b) => ({ ...b, heads: by.get(Number(b.id)) || 0 }));
  }

  router.post(["/exercises", "/exercise/:id"], async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const id = req.params.id && req.params.id !== "new" ? Number(req.params.id) : 0;
      const body = req.body || {};

      const result = await exercises.save(id, {
        audience: body.audience,
        intake_id: body.intake_id,
        title: body.title,
        source: body.source,
        due_on: body.due_on || null, available_from:body.available_from||null, available_until:body.available_until||null, is_required:body.is_required!=='0',
        published: body.published ? 1 : 0,
        level: (String(body.title || "").match(/\b(A1|A2|B1|B2|C1|C2)\b/) || [])[1] || null,
        // Not touched here. Unlocking has its own form and its own
        // button, because it takes effect on its own — and because a
        // Save that silently rewrote the unlock list would be a way to
        // hand homework to a class by accident.
        unlock_emails: undefined,
      }, null);

      if (!result.ok) {
        // Re-rendered rather than redirected, so the text somebody just
        // typed is still in the box. A redirect here loses an evening's
        // work to one missing asterisk.
        return render(res, "exercise", {
          ex: { ...body, id, source: body.source }, library:exercises.library(), picked:null, audience:body.audience||"all", willGet:[],
          batches: await intakes.list(),
          people: await exercises.people(),
          unlocked: id ? await exercises.unlockedFor(id) : [],
          hasUnlock: exercises.HAS_UNLOCK(),
          questionCount: result.parsed ? result.parsed.questions.length : 0,
          problems: result.parsed ? result.parsed.problems : [],
          done: null,
          problem: result.reason,
        });
      }

      const read = result.parsed.questions.length;
      const bad = result.parsed.problems.length;
      const said = `Saved — ${read} question${read === 1 ? "" : "s"} read` +
                   (bad ? `, ${bad} line${bad === 1 ? "" : "s"} could not be read` : "") + ".";
      res.redirect(`/rootadmin/exercise/${result.id}?done=${encodeURIComponent(said)}`);
    } catch (e) {
      next(e);
    }
  });

  /* How the class did.
   *
   * Counted from first attempts, which is the whole reason this is
   * worth opening: practice is unlimited, and a student who went back
   * and got it right has learnt it. Counting that would hide the
   * questions that did not land, which is the only thing here that
   * saves anybody any time.
   */
  router.get("/exercise/:id/results", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured." });
    }
    try {
      const ex = await db.queryOne(
        "SELECT id, title, intake_id FROM exercises WHERE id = ?", [Number(req.params.id)]
      );
      if (!ex) return next();

      const { questions, students } = await exercises.results(ex.id);

      // One figure over the whole class, from the same rows the list
      // below is built from — so the tile and the list cannot disagree.
      const seen = questions.reduce((n, q) => n + q.seen, 0);
      const got = questions.reduce((n, q) => n + q.got, 0);

      render(res, "exercise-results", {
        ex,
        questions,
        students,
        classRate: seen ? Math.round((got / seen) * 100) : null,
        at: (v) => (v
          ? new Date(v).toLocaleString("en-GB", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              timeZone: "Europe/Berlin",
            })
          : ""),
      });
    } catch (e) {
      next(e);
    }
  });

  /* Unlocking, one person at a time. Its own endpoint because it acts
     on its own — the same shape as enrolling somebody on a batch, and
     for the same reason. */
  router.post("/exercise/:id/unlock", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const body = req.body || {};
      const result = await exercises.setUnlock(req.params.id, body.email, { on: !body.remove });
      const key = result.ok ? "done" : "problem";
      const text = result.ok ? result.message : result.reason;
      res.redirect(`/rootadmin/exercise/${req.params.id}?${key}=${encodeURIComponent(text)}#unlock`);
    } catch (e) {
      next(e);
    }
  });

  /* The office's own page.
   *
   * Every figure is counted here from the rows the other pages list, so
   * the dashboard and the list it summarises cannot drift apart. The
   * reads run together: five queries in series is five round trips to a
   * shared host, which is the difference between a page and a wait.
   */
  router.get("/dashboard", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured, so there is nothing to show." });
    }
    try {
      const [sum, months, courses, attention] = await Promise.all([
        insight.summary(),
        insight.byMonth({ months: 12 }),
        insight.byCourse(),
        insight.attention(),
      ]);

      render(res, "dashboard", {
        sum,
        courses,
        attention,
        euros: insight.euros,
        // Two charts of the same months, one measure each. Built here
        // rather than in the template because arithmetic in EJS is
        // arithmetic nothing can test.
        enrolChart: insight.toBars(months, (m) => m.heads),
        moneyChart: insight.toBars(months, (m) => m.expected),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/prices", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured, so there is nothing to edit." });
    }
    try {
      render(res, "prices", {
        courses: await coursesDb.allForEditing("en"),
        saved: req.query.saved ? Number(req.query.saved) : 0,
        // Rows the save would not take, and why. Split back out rather
        // than carried as a count: "2 rows refused" is not something
        // anybody can act on.
        refused: req.query.refused ? String(req.query.refused).split(" · ") : [],
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/prices", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const body = req.body || {};
      const ids = [].concat(body.id || []);
      let changed = 0;
      // Rows that were not saved, and why, to be said on the way back.
      const refused = [];

      // One statement per course that actually moved. Rewriting all of
      // them would touch updated_at on rows nobody edited, which turns
      // the revision history into noise.
      for (const rawId of ids) {
        const id = Number(rawId);
        if (!Number.isFinite(id)) continue;

        const num = (v) => {
          const t = String(v == null ? "" : v).trim();
          if (t === "") return null;
          const n = Number(t);
          return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
        };
        const price = num(body["price_eur_" + id]);
        const discount = num(body["discount_eur_" + id]);
        const seats = num(body["seats_" + id]);

        const before = await db.queryOne(
          "SELECT title, price_eur, discount_eur, seats FROM courses WHERE id = ?",
          [id]
        );
        if (!before) continue;

        /* One bad row does not stop the other thirteen.

           Every price on the site is on this one form, so refusing the
           whole save over one course would mean somebody changing the
           seats on A1 is blocked by a discount on B1 they were not
           touching — with no way to fix it except to fix the other
           course first. The row is left as it was and named in the
           message instead. */
        const wrong = coursesDb.priceProblem(price, discount);
        if (wrong) {
          refused.push(`${before.title}: ${wrong}`);
          continue;
        }
        const same =
          Number(before.price_eur) === Number(price) &&
          Number(before.discount_eur) === Number(discount) &&
          Number(before.seats) === Number(seats);
        if (same) continue;

        await db.query(
          "UPDATE courses SET price_eur = ?, discount_eur = ?, seats = ? WHERE id = ?",
          [price, discount, seats, id]
        );
        changed++;
      }

      await coursesDb.refresh();
      const q = new URLSearchParams({ saved: String(changed) });
      if (refused.length) q.set("refused", refused.join(" · "));
      res.redirect("/rootadmin/prices?" + q.toString());
    } catch (e) {
      next(e);
    }
  });

  // ── Batches ─────────────────────────────────────────────────────────
  //
  // A course is what we teach, a batch is when. The table has existed
  // since the portal schema went in and nothing has ever written to it.

  router.get("/batches", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    if (!db.isEnabled()) {
      return render(res, "login", { error: "The database is not configured, so there is nothing to edit." });
    }
    try {
      render(res, "batches", {
        rows: await intakes.list(),
        notice: req.query.done || null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/batch/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const isNew = req.params.id === "new";
      const batch = isNew ? null : await intakes.byId(req.params.id);
      if (!isNew && !batch) return res.status(404).send("No such batch.");

      // On an existing batch, whoever is on it and everyone who could
      // be. On a new one, the code the next batch of the chosen course
      // would get — offered, not reserved, so the office sees it
      // before it exists.
      render(res, "batch", {
        batch,
        isNew,
        groups: courseGroups.group(await intakes.courseOptions()),
        shortLabel: courseGroups.shortLabel,
        statuses: intakes.STATUSES,
        statusLabel: intakes.STATUS_LABEL,
        // Whether the weekly pattern can be saved at all.
        //
        // fromBody() refuses to write a column the database does not
        // have -- otherwise the UPDATE names it, MySQL rejects the whole
        // statement, and saving a batch fails over a field the form is
        // showing. But refusing quietly is its own bug: the fields were
        // drawn, filled in, submitted and dropped, and the page came
        // back empty with nothing said. So the page is told, and draws
        // an explanation instead of an input.
        canPattern: db.hasColumn("intakes.meets_days"),
        canExercise: db.hasColumn("intakes.exercise_url"),
        roster: isNew ? [] : await enrolments.forBatch(batch.id),
        candidates: isNew ? [] : await enrolments.findCandidates(batch.id),
        candidateLimit: enrolments.CANDIDATE_LIMIT,
        teacherOptions: await teacherAccounts.options(),
        errors: [],
        saved: !!req.query.saved,
        created: !!req.query.created,
        notice: req.query.done || null,
        problem: req.query.problem || null,
      });
    } catch (e) {
      next(e);
    }
  });

  // ── Who is on a batch ───────────────────────────────────────────────
  //
  // This is the join that makes the portal show anything: a student
  // sees a course because a row here links them to a batch of it.

  router.post("/batch/:id/enrol", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const result = await enrolments.add(req.params.id, (req.body || {}).identifier);
      const key = result.ok ? "done" : "problem";
      const text = result.ok ? result.message : result.reason;
      res.redirect(`/rootadmin/batch/${req.params.id}?${key}=${encodeURIComponent(text)}`);
    } catch (e) {
      next(e);
    }
  });

  router.post("/batch/:id/enrolment/:enrolmentId", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const body = req.body || {};
      let key = "done";
      let text;

      if (body.remove) {
        const result = await enrolments.remove(req.params.enrolmentId);
        key = result.ok ? "done" : "problem";
        text = result.ok ? "Removed from this batch." : result.reason;
      } else {
        await enrolments.setStatus(req.params.enrolmentId, body.status);
        text = `Marked ${body.status}.`;
      }

      res.redirect(`/rootadmin/batch/${req.params.id}?${key}=${encodeURIComponent(text)}`);
    } catch (e) {
      next(e);
    }
  });

  router.post("/batch/:id", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    const isNew = req.params.id === "new";
    try {
      const row = intakes.fromBody(req.body || {});
      let errors = intakes.validate(row);

      // A page rendered before migration 25 can still be sitting open in
      // somebody's browser, and it will post a pattern this database
      // cannot hold. fromBody drops it, correctly, and the save would
      // then succeed while losing exactly the thing that was typed --
      // which is the silence this whole check exists to break.
      //
      // Refused rather than half-saved. An error stops the save
      // entirely, so the message must not claim anything was kept.
      if ((req.body || {}).meets_shown && !db.hasColumn("intakes.meets_days")) {
        errors = errors.concat(
          "Nothing was saved. The weekly timetable needs MySQL/25_timetable.sql, which has not been run on this database or has been run since the site last restarted. Run it, restart, reload this page, and save again."
        );
      }

      if (!errors.length) {
        try {
          if (isNew) {
            // Flagged as created rather than merely saved: a batch with
            // nobody on it shows in no student's portal, and the next
            // step is not obvious from a page that just says "Saved".
            const id = await intakes.create(row);
            // The timetable, the moment the pattern is saved rather than
            // whenever the next sweep comes round. Somebody who has just
            // typed "Monday to Friday, 09:00" expects to see the lessons
            // on the page they land on.
            await generateQuietly(id);
            return res.redirect("/rootadmin/batch/" + id + "?created=1");
          }
          await intakes.update(req.params.id, row);
          await generateQuietly(req.params.id);
          return res.redirect("/rootadmin/batch/" + req.params.id + "?saved=1");
        } catch (e) {
          // The unique key on `code` is the one a person actually trips
          // over, and "ER_DUP_ENTRY" is not something to show them.
          errors = [
            e.code === "ER_DUP_ENTRY"
              ? "A batch with that code already exists. Codes appear on invoices, so they have to be unique."
              : "Not saved: " + e.message,
          ];
        }
      }

      const id = isNew ? null : Number(req.params.id);
      render(res, "batch", {
        batch: Object.assign({ id }, row),
        isNew,
        groups: courseGroups.group(await intakes.courseOptions()),
        shortLabel: courseGroups.shortLabel,
        statuses: intakes.STATUSES,
        statusLabel: intakes.STATUS_LABEL,
        // Whether the weekly pattern can be saved at all.
        //
        // fromBody() refuses to write a column the database does not
        // have -- otherwise the UPDATE names it, MySQL rejects the whole
        // statement, and saving a batch fails over a field the form is
        // showing. But refusing quietly is its own bug: the fields were
        // drawn, filled in, submitted and dropped, and the page came
        // back empty with nothing said. So the page is told, and draws
        // an explanation instead of an input.
        canPattern: db.hasColumn("intakes.meets_days"),
        canExercise: db.hasColumn("intakes.exercise_url"),
        roster: id ? await enrolments.forBatch(id) : [],
        candidates: id ? await enrolments.findCandidates(id) : [],
        candidateLimit: enrolments.CANDIDATE_LIMIT,
        teacherOptions: await teacherAccounts.options(),
        errors,
        saved: false,
        created: false,
        notice: null,
        problem: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/batch/:id/delete", async (req, res, next) => {
    if (!isAuthed(req)) return res.redirect("/rootadmin");
    try {
      const result = await intakes.remove(req.params.id);
      const done = result.ok ? "Batch deleted." : result.reason;
      res.redirect("/rootadmin/batches?done=" + encodeURIComponent(done));
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { build, isAuthed };
