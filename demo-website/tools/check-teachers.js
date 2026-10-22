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
//  Tests the parts of lib/teachers.js and lib/teaching.js that hold no
//  database: staff session signing, invitation validation, password
//  rules, and the arithmetic behind the dashboard.
//
//    node tools/check-teachers.js
//
//  The first block is the one that matters most. A teacher account and
//  a student account are signed with the same secret, and the teacher
//  portal shows whole class lists, so "can a student cookie be worn as
//  a teacher cookie" is not a theoretical question — it is the thing
//  that would have gone wrong if the realm prefix had been left out.
//
//  No MySQL required.
// ─────────────────────────────────────────────────────────────────────
"use strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-checks-only";

const t = require("../lib/teachers");
const s = require("../lib/students");
const teaching = require("../lib/teaching");

let pass = 0;
let fail = 0;

function ok(what, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${what}`);
  }
}

const future = () => Date.now() + 60_000;

// ── staff session cookies ────────────────────────────────────────────
{
  const cookie = t.signSession(4, 2, future());
  const read = t.readSession(cookie);
  ok("a signed staff session reads back", read && read.id === 4 && read.version === 2);

  ok("rejects a tampered id", t.readSession(cookie.replace("staff.4.", "staff.5.")) === null);
  ok("rejects a tampered version", t.readSession(cookie.replace("staff.4.2.", "staff.4.3.")) === null);
  ok("rejects a truncated cookie", t.readSession(cookie.split(".").slice(0, 4).join(".")) === null);
  ok("rejects an empty cookie", t.readSession("") === null);
  ok("rejects a non-string", t.readSession(undefined) === null);
  ok("rejects junk", t.readSession("a.b.c.d.e") === null);

  const expired = t.signSession(4, 2, Date.now() - 1000);
  ok("rejects an expired staff session", t.readSession(expired) === null);
}

// ── the two realms cannot borrow each other's cookies ────────────────
//
// Both are HMACs over the same secret. Without the realm word in the
// signed payload, a genuine student cookie for student 4 would verify
// as a genuine teacher cookie for teacher 4 — the signature is real,
// it just meant something else. These four assertions are the whole
// reason lib/teachers.js does not simply re-export the student
// functions.
{
  const studentCookie = s.signSession(4, 1, future());
  const teacherCookie = t.signSession(4, 1, future());

  ok("a student cookie is not a staff session", t.readSession(studentCookie) === null);
  ok("a staff cookie is not a student session", s.readSession(teacherCookie) === null);
  ok("the two are not even the same string", studentCookie !== teacherCookie);

  // Belt and braces: dropping the realm word must not leave something
  // that verifies, or the prefix would be decoration.
  const stripped = teacherCookie.replace(/^staff\./, "");
  ok("a staff cookie with the realm removed is refused everywhere",
     t.readSession(stripped) === null && s.readSession(stripped) === null);

  // And the cookies go in different jars, so a browser cannot be
  // confused into presenting one where the other is read.
  ok("the two cookies have different names", t.COOKIE !== s.COOKIE);
}

// ── the office's invite form ─────────────────────────────────────────
{
  const good = t.validateInvite({ name: "Frau Weber", email: " Weber@Example.COM ", role: "teacher" });
  ok("accepts a sound invitation", good.ok);
  ok("lower-cases and trims the address", good.values.email === "weber@example.com");
  ok("defaults to the teacher role", t.validateInvite({ name: "A B", email: "a@b.co" }).values.role === "teacher");

  // An unknown role must not travel to the database: the column is an
  // enum and a stray value is either an error or, worse, silently
  // coerced.
  ok("an unknown role falls back to teacher",
     t.validateInvite({ name: "A B", email: "a@b.co", role: "superuser" }).values.role === "teacher");
  ok("an owner may be invited as an owner",
     t.validateInvite({ name: "A B", email: "a@b.co", role: "owner" }).values.role === "owner");

  const bad = t.validateInvite({ name: "A", email: "nope" });
  ok("refuses a one-letter name", !bad.ok && bad.errors.name);
  ok("refuses an address with no @", bad.errors.email);

  // There is no password field on that form, and there must never be
  // one: the office would be choosing somebody else's password and
  // emailing it in plain text.
  ok("the invite form carries no password",
     t.validateInvite({ name: "A B", email: "a@b.co", password: "hunter22222" }).values.password === undefined);
}

// ── reading a name that starts with a courtesy title ─────────────────
//
// The office types what it would write on a timetable. In a German
// language school that is "Frau Weber" — not a first name and a
// surname — and the obvious split greets somebody as "Frau".
{
  ok("greets a plain first name", t.greeting("Anita Sharma") === "Anita");
  ok("greets a titled name in full", t.greeting("Frau Weber") === "Frau Weber");
  ok("...with a full stop on the title too", t.greeting("Dr. Klein") === "Dr. Klein");
  ok("...and in English", t.greeting("Mrs Baker") === "Mrs Baker");
  ok("a single name is its own greeting", t.greeting("Madonna") === "Madonna");
  ok("nothing at all is 'there'", t.greeting("") === "there" && t.greeting(null) === "there");

  ok("the monogram skips the title", t.bareName("Frau Weber") === "Weber");
  ok("...including a stacked one", t.bareName("Frau Dr. Weber") === "Weber");
  ok("...but never eats the whole name", t.bareName("Frau") === "Frau");
  ok("an untitled name is untouched", t.bareName("Anita Sharma") === "Anita Sharma");
}

// ── choosing a password ──────────────────────────────────────────────
{
  ok("accepts a long passphrase", t.validatePassword("correct horse battery", { name: "Frau Weber", email: "weber@example.com" }) === null);
  ok("refuses a short one", t.validatePassword("short", {}) !== null);
  ok("refuses an absurd one", t.validatePassword("x".repeat(300), {}) !== null);
  ok("refuses the obvious", t.validatePassword("password1", {}) !== null);
  ok("refuses their own name",
     t.validatePassword("weber-weber-1", { name: "Frau Weber", email: "weber@example.com" }) !== null);
  ok("refuses the local part of their address",
     t.validatePassword("xx-weber-xx99", { name: "", email: "weber@example.com" }) !== null);
}

// ── what a teacher may change about themselves ───────────────────────
{
  const row = t.profileFromBody({
    phone: "  +49 176 1234567 ",
    timezone: "Europe/Berlin",
    bio: "x".repeat(500),
    // Not on the list: the office owns these, and a form that quietly
    // accepted them would let a teacher rename themselves on every
    // batch they run.
    name: "Somebody Else",
    email: "other@example.com",
    role: "owner",
    status: "active",
  });
  ok("trims the phone", row.phone === "+49 176 1234567");
  ok("keeps the timezone", row.timezone === "Europe/Berlin");
  ok("trims an over-long bio to the column", row.bio.length === 400);
  ok("ignores the name", row.name === undefined);
  ok("ignores the email", row.email === undefined);
  ok("ignores the role", row.role === undefined);
  ok("ignores the status", row.status === undefined);

  ok("an emptied field becomes NULL, not an empty string",
     t.profileFromBody({ phone: "   " }).phone === null);
  ok("a field that was not submitted is left alone",
     Object.keys(t.profileFromBody({ phone: "1" })).length === 1);
}

// ── the dashboard's arithmetic ───────────────────────────────────────
//
// Counted in JavaScript rather than SQL so a tile can never disagree
// with the list beneath it — which means it is worth checking that the
// counting is right.
{
  const rows = [
    { id: 1, batch_status: "running", starts_on: "2026-04-01", seats: 12, active_students: 8 },
    { id: 2, batch_status: "running", starts_on: "2026-05-01", seats: 10, active_students: 10 },
    { id: 3, batch_status: "planned", starts_on: "2099-01-01", seats: 12, active_students: 0 },
    { id: 4, batch_status: "finished", starts_on: "2025-01-01", seats: 12, active_students: 12 },
  ];
  const stats = teaching.summarise(rows);

  ok("counts every batch", stats.batches === 4);
  ok("counts the running ones", stats.running === 2);
  ok("counts the planned ones", stats.planned === 1);
  // Heads on running batches only. A teacher asking "how many students
  // have I got" means this term, not everyone ever taught — and
  // counting the finished batch would say 30.
  ok("counts students on running batches only", stats.students === 18);
  ok("counts the free seats", stats.seatsLeft === 4);

  // No seat limit anywhere is not "no seats left", it is "there is
  // nothing to be short of", and the tile prints an em dash for it.
  const noSeats = teaching.summarise([
    { id: 1, batch_status: "running", starts_on: "2026-04-01", seats: null, active_students: 8 },
  ]);
  ok("no seat limit reads as unknown, not as zero", noSeats.seatsLeft === null);

  ok("an empty portal counts to nothing",
     teaching.summarise([]).batches === 0 && teaching.summarise().students === 0);
}

// ── which batch goes at the top ──────────────────────────────────────
{
  const running = { id: 2, batch_status: "running", starts_on: "2026-05-01" };
  const soon = { id: 3, batch_status: "planned", starts_on: "2099-01-01" };
  const sooner = { id: 4, batch_status: "planned", starts_on: "2098-01-01" };
  const over = { id: 5, batch_status: "finished", starts_on: "2025-01-01" };

  ok("a running batch wins", teaching.nextUp([soon, running, over]).batch.id === 2);
  ok("...and is labelled as now", teaching.nextUp([running]).when === "now");

  ok("otherwise the soonest to start wins", teaching.nextUp([soon, sooner]).batch.id === 4);
  ok("...and is labelled as soon", teaching.nextUp([soon]).when === "soon");

  // The most recently started running batch is the one still finding
  // its feet, and the one being asked about.
  const older = { id: 6, batch_status: "running", starts_on: "2026-01-01" };
  ok("among running batches the newest is shown", teaching.nextUp([older, running]).batch.id === 2);

  ok("a finished batch is not 'happening now'", teaching.nextUp([over]) === null);
  // A planned batch whose start date has already gone by is not
  // upcoming; it is a batch somebody forgot to start.
  const stale = { id: 7, batch_status: "planned", starts_on: "2020-01-01" };
  ok("a planned batch in the past is not upcoming", teaching.nextUp([stale]) === null);
  ok("nothing at all is null", teaching.nextUp([]) === null && teaching.nextUp() === null);
}

// ── the redirect after signing in ────────────────────────────────────
{
  const { safeNext } = require("../routes/teacher");

  ok("keeps a path inside the portal", safeNext("/teach/batch/12") === "/teach/batch/12");
  ok("refuses an absolute URL", safeNext("https://evil.example/") === "/teach/me");
  // A browser reads "//evil.example" as protocol-relative and leaves
  // the site; a naive startsWith("/") would let it through.
  ok("refuses a protocol-relative URL", safeNext("//evil.example/") === "/teach/me");
  ok("refuses a backslash", safeNext("/teach/\\evil.example") === "/teach/me");
  ok("refuses the login page itself, or sign-in loops", safeNext("/teach/login") === "/teach/me");
  // The student portal is a different realm with a different cookie:
  // landing there after a staff sign-in would simply bounce.
  ok("refuses a path outside /teach", safeNext("/portal/me") === "/teach/me");
  ok("refuses nothing at all", safeNext("") === "/teach/me" && safeNext(undefined) === "/teach/me");
}

// ── the terms a teacher accepts ──────────────────────────────────────
//
// The clauses here are the ones the school would actually have to rely
// on — that the materials stay its property, that they may not be sold
// or used for private teaching, that they come back when somebody
// leaves. A page missing one of them is a page that does not do its
// job, and it would go unnoticed until it mattered.
{
  const content = require("../lib/content");

  ok("the version is a date", /^\d{4}-\d{2}-\d{2}$/.test(t.TERMS_VERSION));
  ok("the path is the page's own", t.TERMS_PATH === "/teacher-terms-and-conditions");

  for (const lang of ["en", "de"]) {
    const page = content.page("teacher-terms-and-conditions", lang);
    ok(`the ${lang} terms page exists`, Boolean(page));
    if (!page) continue;

    ok(`...and its body is text, not an object`, typeof page.body === "string");
    ok(`...and it is not the student terms`,
       page.slug === "teacher-terms-and-conditions");

    const body = String(page.body);
    const clauses = lang === "en"
      ? ["remain the property of LangNation", "sell", "private lessons",
         "LangNation students", "delete every digital copy", "confidential"]
      : ["bleiben Eigentum von LangNation", "verkaufen", "Privatunterricht",
         "LangNation-Studierende", "digitale Kopie", "Verschwiegenheit"];
    for (const clause of clauses) {
      ok(`the ${lang} terms cover "${clause}"`, body.toLowerCase().includes(clause.toLowerCase()));
    }
  }

  // German is a translation of the English page, not a copy of it.
  const de = content.page("teacher-terms-and-conditions", "de");
  ok("the German page is actually translated", de && de.translated === true);
  ok("...and has a German title", de && de.title === "Bedingungen für Lehrkräfte");
}

// ── The register ─────────────────────────────────────────────────────
//
// The arithmetic is the part worth pinning down. What counts as
// attendance, and what counts as somebody worth ringing, are decisions
// the school will be held to — "she was marked absent" is a sentence
// that gets said in a room with a parent in it.
{
  const att = require("../lib/attendance");

  // ── which dates a register may be taken for ──
  const today = new Date("2026-09-13T09:00:00Z");
  ok("defaults to today", att.normaliseDate(null, today) === "2026-09-13");
  ok("accepts today", att.normaliseDate("2026-09-13", today) === "2026-09-13");
  ok("accepts the past", att.normaliseDate("2026-09-01", today) === "2026-09-01");
  // A register is a record of what happened. Marking next Tuesday in
  // advance turns the table from evidence into a guess.
  ok("refuses tomorrow", att.normaliseDate("2026-09-14", today) === null);
  ok("refuses next year", att.normaliseDate("2027-01-01", today) === null);
  ok("refuses a date that is not one", att.normaliseDate("2026-02-31", today) === null);
  ok("refuses nonsense", att.normaliseDate("yesterday", today) === null);
  ok("takes the date out of a timestamp",
     att.normaliseDate("2026-09-01T14:00:00Z", today) === "2026-09-01");

  // Midday, not midnight: midnight UTC is the evening before in Berlin
  // and the middle of the night in Bengaluru, and a lesson that lands
  // on the wrong day is a register nobody can find again.
  ok("a created lesson sits at midday UTC", att.middayUtc("2026-09-13") === "2026-09-13 12:00:00");

  // ── what a mark may be ──
  ok("keeps a known mark", att.cleanStatus("absent") === "absent");
  // A register opens with everybody marked here, so an unrecognised
  // value falling back to "present" matches what the form shows.
  ok("an unknown mark becomes present", att.cleanStatus("truant") === "present");
  ok("...as does a missing one", att.cleanStatus(undefined) === "present");
  ok("there are four marks", att.STATUS_KEYS.length === 4);

  // ── the attendance percentage ──
  ok("nothing recorded is null, not zero", att.rate({}) === null);
  ok("all present is 100", att.rate({ present: 6 }) === 100);
  // Late counts as attended. They came. Counting it against somebody is
  // how a register stops being trusted by the person filling it in.
  ok("late counts as attended", att.rate({ present: 4, late: 2 }) === 100);
  ok("absent counts against", att.rate({ present: 3, absent: 1 }) === 75);
  // Excused is left out of the sum entirely rather than counted either
  // way: an absence the school agreed to is not a mark against anybody,
  // and counting it as attendance would be a lie in the other direction.
  ok("excused is left out of the sum", att.rate({ present: 3, absent: 1, excused: 4 }) === 75);
  ok("only excused is still null", att.rate({ excused: 3 }) === null);
  ok("all absent is zero, not null", att.rate({ absent: 3 }) === 0);

  // ── who is worth a message ──
  ok("three missed is enough on its own", att.concerning({ present: 20, absent: 3 }));
  ok("two missed out of twenty is not", !att.concerning({ present: 18, absent: 2 }));
  // One absence out of two is 50% and says nothing at all, so the
  // percentage rule waits until there are four lessons to judge on.
  ok("one of two is too early to judge", !att.concerning({ present: 1, absent: 1 }));
  ok("below two thirds once there are four", att.concerning({ present: 2, absent: 2 }));
  ok("a good student is not flagged", !att.concerning({ present: 10, late: 1 }));
  ok("an empty record is not flagged", !att.concerning({}));
  // Excused absences must never make somebody a concern: they told us.
  ok("excused absence is not a concern", !att.concerning({ present: 4, excused: 6 }));
}

// ── things elsewhere that this portal depends on ─────────────────────
{
  const fs = require("fs");
  const path = require("path");
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

  // A cached class list sitting in a shared browser cache is somebody
  // else's contact details left on a staffroom machine.
  const sw = read("public", "sw.js");
  ok("the service worker keeps its hands off /teach",
     /PRIVATE\s*=\s*\[[^\]]*"\/teach"/.test(sw));

  const server = read("server.js");
  ok("/teach is mounted", server.includes('app.use("/teach", teacher.build())'));
  ok("...and kept out of robots.txt", server.includes('"Disallow: /teach"'));

  // teacher_id is what the whole portal filters on. If the batch form
  // cannot set it, every teacher's portal is empty for ever.
  const intakes = read("lib", "intakes.js");
  ok("a batch form may set the teacher's account", /EDITABLE[\s\S]{0,400}teacher_id/.test(intakes));

  const batchForm = read("views", "rootadmin", "batch.ejs");
  ok("...and the form actually offers it", batchForm.includes('name="teacher_id"'));

  // The teacher opens the room; they do not join somebody else's class.
  for (const page of ["dashboard", "batches", "batch"]) {
    const view = read("views", "pages", "teach", page + ".ejs");
    ok(`${page} says "Start the class"`, view.includes("Start the class"));
    ok(`...and not "Join the class"`, !view.includes("Join the class"));
  }

  // Setting up an account must record the terms in the same statement
  // that creates it, or there is a path to an active teacher account
  // with no agreement behind it.
  const lib = read("lib", "teachers.js");
  ok("claiming an invitation records the terms",
     /terms_accepted_at = NOW\(\), terms_version = \?/.test(lib));
  ok("...and refuses without the tick box", /if \(!accept\)/.test(lib));

  // The tick box itself lives in the shared partial, so that a student
  // creating an account and a teacher creating one meet exactly the
  // same control rather than two that drift apart.
  const invite = read("views", "pages", "teach", "invite.ejs");
  ok("the invite page uses the shared terms gate",
     invite.includes('include("../../partials/terms-gate"'));
  ok("...and passes the teacher terms to it", invite.includes("termsPath: termsPath"));

  const gate = read("views", "partials", "terms-gate.ejs");
  ok("the gate has the tick box", gate.includes('name="<%= _name %>"'));
  ok("...and a dialog to read in", gate.includes("data-terms-dialog"));
  // The fallback, and the reason the opener is an <a>: a button that
  // works only with JavaScript leaves somebody no way to read what they
  // are agreeing to.
  ok("...and the opener is a real link",
     /<a href="<%= termsPath %>"[^>]*data-open-terms/.test(gate));

  const app = read("public", "js", "app.js");
  ok("the gate is driven from app.js, not from a page", app.includes("termsGate"));
  ok("...and Accept waits for the end of the text", app.includes("readToEnd"));

  const teachRoute = read("routes", "teacher.js");
  ok("the teacher route hands over the terms text",
     /content\.page\("teacher-terms-and-conditions"/.test(teachRoute));

  // The register is only useful if it is one tap from where the teacher
  // already is. Buried, it does not get taken — which is why it is now
  // on My classes too, and why it is called the same thing in all three
  // places rather than "Take the register" here and "Attendance" there.
  const batchView = read("views", "pages", "teach", "batch.ejs");
  const listView = read("views", "pages", "teach", "batches.ejs");
  ok("the batch page offers the register", /register">Attendance</.test(batchView));
  ok("...and so does My classes, without going through the batch page",
     /register">Attendance</.test(listView));
  ok("...under one name, not two",
     !batchView.includes("Take the register") && !listView.includes("Take the register"));
  ok("...and lists the ones already taken", batchView.includes("<h2>Registers</h2>"));

  const dash = read("views", "pages", "teach", "dashboard.ejs");
  ok("the dashboard surfaces students slipping away", dash.includes("Worth a message"));

  // Opening a register must not write anything, or clicking back
  // through last week leaves a trail of classes that never happened.
  const register = read("lib", "attendance.js");
  const open = register.slice(
    register.indexOf("async function openRegister"),
    register.indexOf("async function saveRegister")
  );
  ok("opening a register writes nothing", !/INSERT|UPDATE|DELETE/.test(open));
  // And an empty form must invent nothing either.
  ok("an empty register creates no lesson",
     /if \(!rows\.length\) return \{ ok: true, saved: 0 \}/.test(register));
  // The browser sends a date, never a lesson id — there is then nothing
  // for a tampered form field to point at.
  const registerView = read("views", "pages", "teach", "register.ejs");
  ok("the form carries no lesson id", !registerView.includes('name="lesson_id"'));

  // Room navigation is a real new-tab link. Only the tracking endpoint writes,
  // and a prefetcher cannot call that protected POST by following the href.
  const studentDash = read("views", "pages", "portal", "dashboard.ejs");
  const studentRoute = read("routes", "student.js");
  ok("joining tracks through a protected POST",
     studentDash.includes('data-class-action="/portal/join/') && studentRoute.includes('router.post("/join/:intakeId"'));
  ok("...and the meeting opens in a separate tab",
     studentDash.includes('href="<%= classLinks.room(en) %>" target="_blank"'));
  const teachDash = read("views", "pages", "teach", "dashboard.ejs");
  ok("starting tracks through a POST while opening a separate tab",
     teachDash.includes('data-class-action="/teach/batch/') && teachDash.includes('target="_blank"') && teachRoute.includes('router.post("/batch/:id/start"'));

  // A teacher's mark is the record. An automatic one must never
  // overwrite it, and that has to be enforced in SQL rather than by a
  // check a later edit can walk past.
  ok("an automatic mark never overwrites a teacher's",
     /IF\(source = 'self', VALUES\(status\), status\)/.test(register));
  ok("...and taking the register promotes the row",
     /source = 'teacher'/.test(register));
}

// ── Joining the class marks you here ─────────────────────────────────
//
// The grace window decides whether somebody is recorded as late, which
// is a thing that ends up on a certificate. It is worth being exact
// about the boundary rather than approximately right.
{
  const att = require("../lib/attendance");
  const start = new Date("2026-09-13T18:00:00Z");
  const at = (m) => new Date(start.getTime() + m * 60000);

  ok("the grace window is five minutes", att.GRACE_MINUTES === 5);

  ok("arriving early is here", att.markForJoin(start, at(-3)) === "present");
  ok("arriving on the dot is here", att.markForJoin(start, at(0)) === "present");
  // The boundary itself counts as on time. Somebody at exactly five
  // minutes should not be the one person the rule punishes.
  ok("the last second of the window is here", att.markForJoin(start, at(5)) === "present");
  ok("a minute past is late", att.markForJoin(start, at(6)) === "late");

  ok("no minutes recorded when on time", att.minutesLate(start, at(4)) === null);
  ok("minutes recorded when late", att.minutesLate(start, at(12)) === 12);

  // The teacher has not pressed Start. A student arriving before their
  // teacher is not the one who is late.
  ok("no start time means here", att.markForJoin(null) === "present");
  ok("...and no minutes", att.minutesLate(null) === null);
  ok("rubbish in is here, not a crash", att.markForJoin("not a date", at(90)) === "present");
}

// ── The two lines every figure is read against ──────────────────
//
// One place, because the office, the teacher and the student have to be
// looking at the same numbers. A student seeing amber while the office
// sees red about the same 62% is an argument nobody can settle.
{
  const att = require("../lib/attendance");

  ok("healthy is 90", att.GOOD === 90);
  ok("the line is 60", att.POOR === 60);

  ok("100 is good", att.band(100) === "good");
  ok("90 exactly is good", att.band(90) === "good");
  ok("89 is worth an eye", att.band(89) === "watch");
  ok("60 exactly is still only worth an eye", att.band(60) === "watch");
  ok("59 is poor", att.band(59) === "poor");
  ok("0 is poor", att.band(0) === "poor");

  // Nothing recorded keeps its own answer all the way to the page,
  // instead of being coloured as though it were a bad one.
  ok("nothing recorded has no band", att.band(null) === null);
  ok("...and undefined likewise", att.band(undefined) === null);

  // The teacher's "worth a message" list and the office's red figure
  // are the same judgement, not two that nearly agree. Both of these
  // sit under the three-absence rule, so only the percentage can fire
  // and the boundary is genuinely what is being tested.
  ok("3 of 5 is exactly 60, and 60 is not below 60",
     att.rate({ present: 3, absent: 2 }) === 60 && !att.concerning({ present: 3, absent: 2 }));
  ok("2 of 4 is 50, and that is a concern",
     att.rate({ present: 2, absent: 2 }) === 50 && att.concerning({ present: 2, absent: 2 }));
  ok("...and the office would print the same figure red",
     att.band(att.rate({ present: 2, absent: 2 })) === "poor");
}

// ── Shaping the office's chart ───────────────────────────────────────
{
  const att = require("../lib/attendance");
  const row = (id, code, day, present, absent) =>
    ({ intake_id: id, batch_code: code, course_title: "X", day, present, late: 0, absent, excused: 0 });

  const chart = att.toChart([
    row(12, "A", "2026-09-01", 9, 1),
    row(12, "A", "2026-09-03", 5, 5),
    // nothing on the 5th for batch 12
    row(12, "A", "2026-09-08", 10, 0),
    row(13, "B", "2026-09-05", 4, 6),
  ]);

  ok("every day appears once, in order",
     chart.days.join(",") === "2026-09-01,2026-09-03,2026-09-05,2026-09-08");
  ok("one line per batch", chart.lines.length === 2);

  const a = chart.lines.find((l) => l.label === "A");
  ok("a batch's own lessons only", a.lessons === 3);
  ok("the rate is over the whole batch", a.rate === att.rate(a.counts));

  // The one that matters. A day a batch did not meet must break the
  // line, not drop it to the floor — otherwise every chart has a cliff
  // in it at every half-term.
  ok("a day it did not meet breaks the line", (a.path.match(/M/g) || []).length === 2);
  ok("...and is not plotted as zero", !a.points.some((p) => p.day === "2026-09-05"));

  // Both batches are measured against the same days, so two lines on
  // one chart line up vertically.
  const b = chart.lines.find((l) => l.label === "B");
  ok("batches share the x scale", b.points[0].x === chart.x[2]);

  // 100% sits at the top of the plot and 0% at the bottom, not upside
  // down — an inverted y axis is the classic way to ship a chart that
  // says the opposite of the truth.
  const best = a.points.find((p) => p.rate === 100);
  const worst = a.points.find((p) => p.rate === 50);
  ok("a higher rate is higher up", best.y < worst.y);

  ok("one lesson is a dot, not a crash", att.toChart([row(9, "C", "2026-09-01", 1, 0)]).lines[0].points.length === 1);
  ok("nothing at all is an empty chart", att.toChart([]).lines.length === 0);
  ok("...with a usable frame anyway", att.toChart([]).width > 0);
}

// ── A teacher has a reference, like a student ────────────────────────
{
  const codes = require("../lib/codes");

  ok("LNT0001", codes.formatTeacherRef(1) === "LNT0001");
  ok("padded to four", codes.formatTeacherRef(42) === "LNT0042");
  ok("and grows past that", codes.formatTeacherRef(12345) === "LNT12345");

  // One letter apart from a student's, and never the same string — they
  // are read side by side on a batch.
  ok("a teacher is not a student", codes.formatTeacherRef(1) !== codes.formatStudentRef(1));
  ok("both are the same shape", codes.formatTeacherRef(7).length === codes.formatStudentRef(7).length);

  ok("its own counter series", /nextNumber\("teacher", 0/.test(
    require("fs").readFileSync(require("path").join(__dirname, "..", "lib", "codes.js"), "utf8")));
}

/* Waited on at the foot of the file, beside the other asynchronous
   block. Declared out here because a `return` inside the block would
   return from the MODULE — skipping every check below it and the
   summary too, which prints nothing and exits 0. */
let batchCodeChecks = Promise.resolve();

// ── A batch code cannot be handed out twice ──────────────────────────
//
// The office reported "a batch with that code already exists" about a
// code it had never typed, on a form whose code box filled itself in.
// Two causes, and the second one is why this is tested against a fake
// database rather than only read:
//
//   The field was editable and its suggestion reserved nothing, so two
//   tabs — or one form left open while the course was changed — were
//   offered the same code and the second save hit the unique key. That
//   is fixed by there being no field: the code is allocated when the
//   row is written.
//
//   And the counter could fall behind the table. A batch created while
//   its course row was missing never advanced it; a restore from an
//   older dump takes the counter back without taking the batches back.
//   Then the next generated code is one somebody already has, and no
//   amount of removing form fields helps.
//
// So nextBatchCode is given a counter that lags and asked what it
// returns. If it trusts the counter, this fails.
{
  const codes = require("../lib/codes");

  const fakeDb = ({ counter, highestInTable }) => {
    let last = counter;
    return {
      async query(sql, binds) {
        // The counter bump, and the catch-up write.
        if (/INSERT INTO invoice_counters/.test(sql)) {
          const asked = binds && binds.length > 2 ? Number(binds[2]) : null;
          last = asked === null ? last + 1 : Math.max(last, asked);
        }
        return {};
      },
      async queryOne(sql) {
        if (/FROM invoice_counters/.test(sql)) return { last_number: last };
        if (/FROM intakes/.test(sql)) return { n: highestInTable };
        return null;
      },
    };
  };

  batchCodeChecks = (async () => {
    // The ordinary case: nothing in the table, counter leads.
    ok("the first Regular batch is LNRKB01",
       (await codes.nextBatchCode("Regular", fakeDb({ counter: 0, highestInTable: 0 }))) === "LNRKB01");

    // The counter is behind what exists. This is the bug.
    ok("a counter behind the table does not hand out a code in use",
       (await codes.nextBatchCode("Regular", fakeDb({ counter: 1, highestInTable: 7 }))) === "LNRKB08");
    ok("...however far behind it is",
       (await codes.nextBatchCode("Regular", fakeDb({ counter: 0, highestInTable: 23 }))) === "LNRKB24");

    // And the counter still leads when it is ahead — a code that was
    // allocated and then deleted must not be handed out again.
    ok("a counter ahead of the table is still followed",
       (await codes.nextBatchCode("Regular", fakeDb({ counter: 9, highestInTable: 2 }))) === "LNRKB10");

    // Tracks number independently, which is the whole point of the
    // per-track counter.
    ok("Intensive numbers separately from Regular",
       (await codes.nextBatchCode("Intensive", fakeDb({ counter: 0, highestInTable: 0 }))) === "LNIKB01");

    /* And the code is not something a form can send.

       A field with a name is a field a browser submits. The absence of
       `code` from the editable list is what stops a crafted or stale
       post setting one, and it is the half of the fix that does not
       show up on screen. */
    const intakes = require("../lib/intakes");
    const posted = intakes.fromBody({
      course_id: "1", code: "LNRKB99", title: "Evening group",
    });
    ok("a posted code is dropped by the editor",
       !("code" in posted) && posted.title === "Evening group");
    ok("...and nothing is left validating a field that no longer exists",
       !intakes.validate({ course_id: 1 }).some((e) => /code/i.test(e)));
  })();
}

// ── Forgotten passwords, in both realms ──────────────────────────────
//
// The database work cannot be exercised without MySQL, but the shape of
// it can: every one of these is a rule that is invisible when it is
// right and a security hole when it is wrong.
{
  const fs = require("fs");
  const path = require("path");
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

  for (const [realm, file] of [["student", "students.js"], ["teacher", "teachers.js"]]) {
    const lib = read("lib", file);
    const mod = realm === "teacher" ? t : s;

    ok(`${realm}: the three steps are exported`,
       ["requestReset", "findReset", "resetPassword"].every((f) => typeof mod[f] === "function"));

    // An hour. A reset link is the more dangerous of the two kinds of
    // link if it leaks, and it is asked for by somebody at the keyboard.
    ok(`${realm}: a reset link lasts an hour`, mod.RESET_TTL_MS === 60 * 60 * 1000);

    // Only the hash is stored, so a leaked table cannot be used to take
    // accounts over.
    ok(`${realm}: only the hash of the token is stored`,
       /reset_token_hash = \?/.test(lib) && /makeToken\(\)|students\.makeToken\(\)/.test(lib));

    // Expiry compared in SQL, on one clock, rather than racing the
    // server's idea of now against the column.
    ok(`${realm}: expiry is checked by the database`,
       /reset_expires_at > NOW\(\)/.test(lib));

    // The one that matters most. Somebody resetting a password they
    // think another person knows is doing it precisely to end that
    // person's session — a reset that left them signed in is theatre.
    ok(`${realm}: a reset ends every other session`,
       /token_version = token_version \+ 1/.test(lib));

    // Spent in the statement that still requires it, so two browsers
    // racing on one link cannot both succeed.
    ok(`${realm}: the link is spent atomically`,
       /WHERE id = \? AND reset_token_hash = \?/.test(lib));

    // A suspended or closed account must not be resurrected through the
    // side door.
    ok(`${realm}: only an account that may sign in gets a link`,
       /status = 'active'/.test(lib));
  }

  // A teacher account that was never claimed has no password to reset;
  // the invitation is the way in, and offering a reset would be a
  // second, weaker path to the same account.
  ok("an unclaimed teacher account gets no reset link",
     /password_hash IS NOT NULL/.test(read("lib", "teachers.js")));

  for (const [realm, file] of [["student", "student.js"], ["teacher", "teacher.js"]]) {
    const route = read("routes", file);
    // Throttled on the address being asked about as well as on the
    // caller, or a hundred machines can fill one person's inbox.
    ok(`${realm}: the form is throttled per address, not only per IP`,
       /Limited\("(reset|who):/.test(route));
    ok(`${realm}: the reset signs them in afterwards`,
       /setSession\(res, result\.(studentId|teacherId), result\.tokenVersion\)/.test(route));
  }
}

// -- The register's field names --------------------------------------
//
// A register of five saved two. The fields were status[91] — a numeric
// bracket key — and qs, which is what express's extended parser uses,
// turns a set of those into an ARRAY. An array has no holes, so student
// ids 2, 3, 6 came back as 0, 1, 2 and every mark landed on whoever held
// those ids. Not a miscount: the wrong attendance against the wrong
// person, and silent while everybody is present.
{
  const qs = require("qs");
  const fs = require("fs");
  const path = require("path");

  // The shape that broke it, run rather than described.
  const bare = qs.parse("status[2]=present&status[3]=late&status[6]=absent");
  ok("numeric bracket keys still parse as an array — the trap is real",
     Array.isArray(bare.status));
  ok("...and the student ids are gone, replaced by indices",
     Object.keys(bare.status).join(",") === "0,1,2");

  // The shape now used.
  const safe = qs.parse("status[s2]=present&status[s3]=late&status[s6]=absent");
  ok("a prefixed key parses as an object", !Array.isArray(safe.status));
  ok("...and every id survives",
     Object.keys(safe.status).join(",") === "s2,s3,s6");
  ok("...paired with the right status",
     safe.status.s2 === "present" && safe.status.s3 === "late" && safe.status.s6 === "absent");

  // Five in, five out — the count that was two.
  const five = qs.parse("status[s2]=present&status[s3]=present&status[s4]=present&status[s6]=present&status[s7]=present");
  const marks = Object.keys(five.status)
    .filter((k) => /^s\d+$/.test(k))
    .map((k) => ({ studentId: k.slice(1), status: five.status[k] }));
  ok("a register of five produces five marks",
     marks.length === 5);
  ok("...with the real ids on them",
     marks.map((m) => m.studentId).join(",") === "2,3,4,6,7");

  // The form and the route have to agree.
  const view = fs.readFileSync(
    path.join(__dirname, "..", "views", "pages", "teach", "register.ejs"), "utf8");
  const route = fs.readFileSync(path.join(__dirname, "..", "routes", "teacher.js"), "utf8");
  ok("the form emits the prefixed name", /name="status\[s<%= s\.id %>\]"/.test(view));
  ok("no bare numeric key is left in the form",
     !/name="(status|note|late)\[<%= s\.id %>\]"/.test(view));
  ok("the route only accepts keys of that shape",
     /\/\^s\\d\+\$\//.test(route));

  // Absent until something says otherwise.
  ok("the register opens with nobody marked present",
     /\(s\.mark \|\| "absent"\)/.test(view));
  ok("...and says which rows nothing has marked yet",
     /not seen/.test(view));

  const att = fs.readFileSync(path.join(__dirname, "..", "lib", "attendance.js"), "utf8");
  const owns = (att.match(/\$\{OWNS\(/g) || []).length;
  // The count rises whenever a teacher-scoped query is added, and
  // bumping it is the point: it makes you look at the new query and
  // confirm it went through a helper. What this really asserts is the
  // line below — that no query writes its own ownership test — because
  // the one that did was the one that locked a cover teacher out of a
  // register they were covering.
  //
  // Six became seven with batchRegisters(), which is the teacher's own
  // attendance page: every lesson of one batch with the state of its
  // register. It tests OWNS() alone and deliberately not ownsOnDate().
  // A stand-in covering one lesson should be able to take THAT
  // register and should not thereby be handed the whole term's
  // attendance for a class that is not theirs.
  //
  // Six rather than eight before that: three of the old sites moved
  // behind ownsOnDate(), which is the second helper. It is the only
  // thing in the file that will accept a stand-in, and only for the
  // one date they were handed — opening the register, saving it, and
  // starting the class. Every other query still tests OWNS() alone,
  // which is what keeps a stand-in out of the class list, the
  // materials and every other day.
  ok("every ownership test in attendance.js goes through OWNS()", owns === 7);
  const code = att.split(String.fromCharCode(10))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join(String.fromCharCode(10));
  // One, and it is the stand-in's: `hl.teacher_id = ?` inside
  // ownsOnDate(). OWNS() itself now lives in lib/owns.js, so the two
  // that used to be here have gone with it. A second would mean
  // somebody wrote their own ownership test, which is the thing this
  // is here to catch.
  ok("...leaving no bare teacher_id test outside a helper",
     (code.match(/teacher_id = \?/g) || []).length === 1);

  /* The standing cover teacher is gone, and must stay gone.

     intakes.teacher2_id used to be ORed into every one of these
     queries, which handed whoever the office named on the batch the
     primary teacher's access to it for the whole term — the class
     list, the materials, every register in it. Cover is one lesson
     now (lessons.teacher_id, and only for its own date).

     Checked by reading the files rather than by calling them, because
     the bug this prevents is a one-word edit to a WHERE clause that no
     fixture would notice: every list would simply have one more batch
     in it, which looks like data. */
  for (const f of ["lib/owns.js", "lib/teaching.js", "lib/attendance.js",
                   "lib/lessons.js", "lib/backlog.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8")
      .split(String.fromCharCode(10))
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join(String.fromCharCode(10));
    ok(`${f} gives a batch's second teacher no access to it`,
       !/teacher2_id/.test(src));
  }
}

// -- The weekly pattern, and the timezone it lives in ------------------
//
// A batch says "Monday to Friday, 09:00, two hours" once and every
// lesson follows from it. The awkward part is that lessons.starts_at is
// a DATETIME and the pool runs in UTC, so 09:00 Berlin is 07:00 in
// summer and 08:00 in winter — an hour out for half the year if the
// conversion is wrong, which is exactly how it was wrong first time.
{
  const sched = require("../lib/schedule");

  // The only test that proves the conversion: put a wall time in, read
  // it back on a clock in that zone, and require the same digits.
  const reads = (iso, time, tz) => {
    const d = sched.utcFor(iso, time, tz);
    if (!d) return "(null)";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  };

  ok("09:00 in summer reads back as 09:00",
     reads("2026-07-15", "09:00", "Europe/Berlin") === "09:00");
  ok("09:00 in winter reads back as 09:00",
     reads("2026-12-15", "09:00", "Europe/Berlin") === "09:00");
  ok("...on the day the clocks go forward",
     reads("2026-03-29", "09:00", "Europe/Berlin") === "09:00");
  ok("...and the day they go back",
     reads("2026-10-25", "09:00", "Europe/Berlin") === "09:00");
  ok("an evening class survives the round trip too",
     reads("2026-07-15", "18:30", "Europe/Berlin") === "18:30");

  // And the stored instant differs by the season, which is the whole
  // reason this is not a fixed offset.
  const summer = sched.utcFor("2026-07-15", "09:00", "Europe/Berlin").toISOString();
  const winter = sched.utcFor("2026-12-15", "09:00", "Europe/Berlin").toISOString();
  ok("summer stores 07:00 UTC", summer.slice(11, 16) === "07:00");
  ok("winter stores 08:00 UTC", winter.slice(11, 16) === "08:00");

  // A bad time or zone gives nothing rather than something wrong.
  ok("an unparseable time is null, not a guess",
     sched.utcFor("2026-07-15", "half nine", "Europe/Berlin") === null);
  ok("an unknown zone is null, not a wrong hour",
     sched.utcFor("2026-07-15", "09:00", "Not/AZone") === null);

  // Weekdays: ISO numbering, Monday is 1.
  ok("Monday is 1", sched.weekdayOf("2026-09-14") === 1);
  ok("Sunday is 7", sched.weekdayOf("2026-09-20") === 7);

  ok("a Mon-Fri week produces five dates",
     sched.datesBetween("2026-09-14", "2026-09-18", "1,2,3,4,5").length === 5);
  ok("Mon and Wed over a fortnight produces four",
     sched.datesBetween("2026-09-14", "2026-09-25", "1,3").length === 4);
  ok("no days means no timetable",
     sched.datesBetween("2026-09-14", "2026-12-25", "").length === 0);
  ok("an end date before the start produces nothing",
     sched.datesBetween("2026-09-20", "2026-09-14", "1").length === 0);
  // A typo in a year should cost a short timetable, not the server.
  ok("a runaway range is capped",
     sched.datesBetween("2026-09-14", "2206-09-14", "1,2,3,4,5").length === 400);

  ok("days are parsed, sorted and deduplicated",
     sched.formatDays("5,1,3,1") === "1,3,5");
  ok("rubbish in the column costs that day, not the timetable",
     sched.formatDays("1,9,x,3") === "1,3");

  ok("a consecutive run reads as a range",
     sched.describeDays("1,2,3,4,5") === "Monday to Friday");
  ok("...and a scattered one reads as a list",
     sched.describeDays("1,3,5") === "Monday, Wednesday and Friday");

  ok("09:00 plus two hours is 11:00", sched.endTime("09:00", 120) === "11:00");
  ok("a time with seconds is accepted", sched.parseTime("09:00:00") === "09:00");
  ok("25:00 is not a time", sched.parseTime("25:00") === null);

  // The whole plan, which is what the generator will store.
  const plan = sched.plan({
    startsOn: "2026-09-16", endsOn: "2026-09-22", days: "1,2,3,4,5",
    time: "09:00", minutes: 120, timezone: "Europe/Berlin",
  });
  ok("a week of Mon-Fri from Wednesday gives five lessons", plan.length === 5);
  ok("...each with a real instant and a length",
     plan.every((l) => l.startsAt instanceof Date && l.minutes === 120));
  ok("...starting on the batch's own start date", plan[0].date === "2026-09-16");
}

// -- Turning a pattern into lessons -----------------------------------
//
// The generator runs on every batch save and every ten minutes, so it
// will meet the same rows thousands of times. What keeps that from
// being frightening is not the SQL but these three: what counts as a
// pattern at all, what day an instant falls on, and how long a class is.
{
  const sched = require("../lib/schedule");
  const lessons = require("../lib/lessons");

  // -- the office types two times, the column stores a length --------
  ok("09:00 until 11:00 is two hours", sched.minutesBetween("09:00", "11:00") === 120);
  ok("09:00 until 09:45 is forty-five minutes", sched.minutesBetween("09:00", "09:45") === 45);
  ok("a class that ends when it starts is not a class",
     sched.minutesBetween("09:00", "09:00") === null);
  // Wrapping would silently turn a two-hour class into a twenty-two
  // hour one, which is worse than refusing a typo.
  ok("an end before the start is refused, not wrapped past midnight",
     sched.minutesBetween("11:00", "09:00") === null);
  ok("half a time is no time", sched.minutesBetween("09:00", "") === null);
  // The pair has to survive the round trip, because the form shows an
  // end time and the database holds minutes.
  ok("minutes and end time are inverses",
     sched.endTime("09:00", sched.minutesBetween("09:00", "11:30")) === "11:30");

  // -- what counts as a pattern --------------------------------------
  const full = {
    starts_on: "2026-09-16", ends_on: "2026-11-30", timezone: "Europe/Berlin",
    meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
  };
  const p = lessons.patternOf(full);
  ok("a complete row is a pattern", p !== null);
  ok("...with the days normalised", p.days === "1,2,3,4,5");
  ok("...and the TIME column's seconds trimmed", p.time === "09:00");

  // Half a pattern generates nothing, so it must not read as one.
  ok("days with no time is not a pattern",
     lessons.patternOf({ ...full, meets_from: null }) === null);
  ok("a time with no days is not a pattern",
     lessons.patternOf({ ...full, meets_days: "" }) === null);
  ok("no start date is not a pattern",
     lessons.patternOf({ ...full, starts_on: null }) === null);

  // An open-ended batch cannot generate forever; a year is longer than
  // anything taught here and the cap in schedule.js stops it sooner.
  const open = lessons.patternOf({ ...full, ends_on: null });
  ok("a batch with no end date still gets a horizon", open.endsOn === "2027-09-16");

  // -- a DATE column, whichever shape the driver hands back ----------
  ok("a Date becomes YYYY-MM-DD",
     lessons.isoDate(new Date(Date.UTC(2026, 8, 16))) === "2026-09-16");
  ok("...and a string is trimmed to the same",
     lessons.isoDate("2026-09-16T00:00:00.000Z") === "2026-09-16");
  ok("nothing stays nothing", lessons.isoDate(null) === null);

  // -- which day a lesson lands on -----------------------------------
  //
  // This is what decides whether a date is already covered, so it is
  // what stops the generator putting a second class on a day that has
  // one. It has to be the day in the BATCH's zone, not the server's.
  const berlin = "Europe/Berlin";
  ok("09:00 Berlin in summer is stored at 07:00 UTC and still reads as that day",
     lessons.localDay(sched.utcFor("2026-07-15", "09:00", berlin), berlin) === "2026-07-15");
  ok("...and in winter, stored at 08:00",
     lessons.localDay(sched.utcFor("2026-12-15", "09:00", berlin), berlin) === "2026-12-15");
  // The case that would put a lesson on the wrong day: late in Berlin is
  // already tomorrow in Tokyo, and the batch's zone is the one that
  // decides.
  ok("a late instant is the next day in a zone further east",
     lessons.localDay(new Date("2026-07-15T22:30:00Z"), "Asia/Tokyo") === "2026-07-16");
  ok("...and the same instant is still today in Berlin",
     lessons.localDay(new Date("2026-07-15T22:30:00Z"), berlin) === "2026-07-16");
  ok("an unusable instant gives nothing rather than a wrong day",
     lessons.localDay(null, berlin) === null);

  // -- the plan the generator will insert ----------------------------
  const plan = sched.plan(lessons.patternOf(full));
  ok("Mon-Fri from 16 Sept to 30 Nov is 54 lessons", plan.length === 54);
  ok("...the first on the batch's own start date", plan[0].date === "2026-09-16");
  ok("...the last on or before the end date", plan[plan.length - 1].date <= "2026-11-30");
  ok("...and none of them on a weekend",
     plan.every((l) => sched.weekdayOf(l.date) <= 5));
  // The pattern crosses the October clock change, and every lesson has
  // to stay at 09:00 local through it.
  ok("every lesson is still at 09:00 in Berlin, both sides of the clock change",
     plan.every((l) => new Intl.DateTimeFormat("en-GB", {
       timeZone: berlin, hour: "2-digit", minute: "2-digit", hour12: false,
     }).format(l.startsAt) === "09:00"));
}

// -- Moving and calling off a class -----------------------------------
//
// The rules that decide whether a change is allowed, exercised against
// a stubbed database rather than described. Every one of them is a way
// somebody's register or somebody's evening gets lost.
// -- Registers that have not been taken -------------------------------
//
// "Take it later" only means something if later has an edge. The edge
// is the Sunday of the week the class fell in -- a date a teacher can
// say out loud, rather than "within seven days", which is a different
// date for every class in the week.
{
  const backlog = require("../lib/backlog");

  // Every day of one week closes on the same Sunday.
  ok("Monday is due that Sunday", backlog.dueBy("2026-09-14") === "2026-09-20");
  ok("Wednesday is due the same Sunday", backlog.dueBy("2026-09-16") === "2026-09-20");
  ok("Saturday too", backlog.dueBy("2026-09-19") === "2026-09-20");
  // A Sunday class is due that day, not eight days later: the week it
  // belongs to is the one it happened in.
  ok("a Sunday class is due the same day", backlog.dueBy("2026-09-20") === "2026-09-20");
  ok("and the next week rolls over", backlog.dueBy("2026-09-21") === "2026-09-27");
  ok("nothing in, nothing out", backlog.dueBy(null) === null);

  ok("days are counted whole", backlog.daysBetween("2026-09-20", "2026-09-27") === 7);
  ok("...and negative before the date", backlog.daysBetween("2026-09-27", "2026-09-20") === -7);

  // decorate() is what every page reads. It works out where a lesson
  // sits relative to its own Sunday, in the BATCH's timezone.
  const at = (iso) => ({
    lesson_id: 1, batch_code: "LNRKB02", timezone: "Europe/Berlin",
    starts_at: new Date(iso + "T07:00:00Z"), students: 5,
  });

  // A fixed "today" cannot be injected, so these are built relative to
  // now -- which is also the honest test, because the thing being
  // checked is behaviour against the real clock.
  const daysAgo = (n) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const fresh = backlog.decorate(at(daysAgo(0)));
  ok("today's class is not overdue", fresh.overdue === false && fresh.daysLate === 0);
  ok("...and it knows its Sunday", /^\d{4}-\d{2}-\d{2}$/.test(fresh.due));

  const old = backlog.decorate(at(daysAgo(30)));
  ok("a class a month ago is overdue", old.overdue === true);
  ok("...and escalated", old.escalated === true);
  ok("...by more than a week", old.daysLate > backlog.ESCALATE_AFTER_DAYS);

  // The whole feature rests on the register page accepting a date that
  // has passed. If it clamped to today, every "Take it now" link in the
  // banner would land on an empty form for the wrong day -- and it
  // would look like it worked.
  {
    const attendance = require("../lib/attendance");
    const today = new Date("2026-09-22T10:00:00Z");
    ok("a register can be taken for a day that has passed",
       attendance.normaliseDate("2026-09-14", today) === "2026-09-14");
    ok("...and for today",
       attendance.normaliseDate("2026-09-22", today) === "2026-09-22");
    // A register for a class that has not happened is not a late
    // register, it is a guess.
    ok("but never for a day that has not happened",
       attendance.normaliseDate("2026-09-23", today) === null);
  }

  // -- what the teacher is told -------------------------------------
  ok("nothing owed draws no banner at all", backlog.summarise([]) === null);
  ok("...and neither does nothing", backlog.summarise(null) === null);

  const due = { ...at(daysAgo(0)), on: daysAgo(0), due: "2026-12-31", overdue: false, daysLate: 0, escalated: false };
  const sum = backlog.summarise([due]);
  ok("one pending register is a sentence, not a scolding",
     sum.tone === "due" && /due by Sunday/.test(sum.text));
  ok("...counted correctly in the singular", /1 class/.test(sum.text));

  const late = { ...due, overdue: true, daysLate: 3, escalated: false, due: "2026-09-20" };
  const lateSum = backlog.summarise([late, due]);
  ok("an overdue register says so and names the Sunday",
     lateSum.tone === "overdue" && /overdue/.test(lateSum.text) && /2026-09-20/.test(lateSum.text));
  ok("...and counts every pending one, not only the late ones",
     /2 classes/.test(lateSum.text));

  const gone = { ...late, daysLate: 12, escalated: true };
  const goneSum = backlog.summarise([gone]);
  // Being told you were reported is better than finding out later.
  ok("once the office has been told, the teacher is told that too",
     goneSum.tone === "escalated" && /office has been told/.test(goneSum.text));
}

// -- Which class is "happening now" ----------------------------------
//
// Reported from a screenshot: a card headed "Happening now" naming a
// batch that meets tomorrow, while another of the same teacher's
// classes met that evening.
//
// It sorted running batches by START DATE, which was the best answer
// available when no lesson had a time on it. It is plainly wrong now
// that they do -- the newest batch is not the next class.
{
  const teaching = require("../lib/teaching");

  const rows = [
    { id: 1, code: "LNIKB01", batch_status: "running",
      starts_on: "2026-09-14", next_lesson_at: "2026-09-23T17:00:00Z" },
    { id: 2, code: "LNIKB02", batch_status: "running",
      starts_on: "2026-09-22", next_lesson_at: "2026-09-24T17:00:00Z" },
  ];

  ok("the batch that meets soonest is the one happening now",
     teaching.nextUp(rows).batch.code === "LNIKB01");
  // The newer batch is the one the old sort would have picked.
  ok("...not simply the one that started most recently",
     teaching.nextUp(rows).batch.code !== "LNIKB02");

  // Without a timetable there is nothing better to go on, and the old
  // behaviour is still the right answer.
  const noTimes = rows.map(({ next_lesson_at, ...rest }) => rest);
  ok("with no timetable at all it falls back to the newest start",
     teaching.nextUp(noTimes).batch.code === "LNIKB02");

  // A batch with a lesson beats one without, whatever the dates say.
  ok("a batch with a timetable is preferred to one without",
     teaching.nextUp([
       { id: 3, code: "NOPLAN", batch_status: "running", starts_on: "2026-09-30" },
       { id: 4, code: "HASPLAN", batch_status: "running", starts_on: "2026-01-01",
         next_lesson_at: "2026-09-25T17:00:00Z" },
     ]).batch.code === "HASPLAN");

  ok("nothing running and nothing planned is nothing to show",
     teaching.nextUp([]) === null);

  /* Every batch reaching this is now the teacher's own.

     There used to be a sort step in front of nextUp's choice, because
     batches() also returned the ones the office had named this teacher
     as standing cover on, and "Happening now" — which carries Start the
     class and Take the register — must not lead with somebody else's
     class. Cover is one lesson now and never reaches batches(), so the
     step went. What is left must still pick by the clock. */
  const mixed = [
    // NOON meets first; EVENING started later. The two rules disagree
    // here on purpose, because sorting by start date was the old answer
    // and it is wrong now that lessons have times: a card headed
    // "Happening now" named a class meeting tomorrow while another one
    // met that evening.
    { id: 13, code: "NOON", batch_status: "running",
      starts_on: "2026-09-14", next_lesson_at: "2026-09-23T10:00:00Z" },
    { id: 1, code: "EVENING", batch_status: "running",
      starts_on: "2026-09-16", next_lesson_at: "2026-09-23T17:00:00Z" },
  ];
  ok("the class that meets soonest takes the card",
     teaching.nextUp(mixed).batch.code === "NOON");
  ok("...and the fixture makes that disagree with the start date",
     new Date(mixed[1].starts_on) > new Date(mixed[0].starts_on));

  /* A batch is_cover ever came back set would mean the column had been
     ORed back into batches(). Nothing marks cover any more, and a stray
     flag must not change which card is chosen. */
  const flagged = teaching.nextUp([{ ...mixed[0], is_cover: 1 }, mixed[1]]);
  ok("a leftover cover flag decides nothing",
     flagged && flagged.batch.code === "NOON");

  /* A class handed to you is a class you are teaching.

     "Happening now" carries Start the class and Attendance, so it has
     to name the class you are actually about to take. Two halves, and
     both were wrong before: the teacher who gave a lesson away was
     told to start it, and the one who accepted it saw nothing at all
     unless they happened to open the schedule. */
  const handed = {
    id: 9, code: "GIVEN", standing_in: 1, batch_status: "running",
    // Before NOON, which is the earliest of this teacher's own.
    next_lesson_at: "2026-09-23T08:00:00Z",
  };
  const later = { ...handed, next_lesson_at: "2026-09-24T10:00:00Z" };

  ok("a class handed to you takes the card when it is the sooner one",
     teaching.nextUp(mixed, handed).batch.code === "GIVEN");
  ok("...and does not when your own class comes first",
     teaching.nextUp(mixed, later).batch.code === "NOON");
  ok("a teacher with no batch of their own still sees the one they were handed",
     teaching.nextUp([], handed).batch.code === "GIVEN");
  ok("...and a teacher handed nothing, with nothing running, still sees nothing",
     teaching.nextUp([], null) === null);
  ok("the card can tell the two apart",
     Number(teaching.nextUp([], handed).batch.standing_in) === 1 &&
     !Number(teaching.nextUp(mixed).batch.standing_in));

  /* The other half, which is SQL and so is read rather than run.

     batches() computes "when does this next meet", and a lesson handed
     to somebody else must not answer it. COALESCE(l.teacher_id,
     i.teacher_id) is "whose class is this actually" — drop it and the
     dashboard tells a teacher to start a class they arranged not to
     take, which is exactly what it did. */
  {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "teaching.js"), "utf8");
    const sub = src.slice(src.indexOf("function batches("), src.indexOf("function batch("));
    ok("the next lesson skips one that was handed away",
       /COALESCE\(l\.teacher_id, i\.teacher_id\) = \?/.test(sub));
    /* Three functions here may read lessons.teacher_id, and they are
       named rather than counted.

       A count passes for the wrong reason the moment a comment is
       reworded, and the first version of this check did exactly that.
       What matters is WHERE the column is read: everything else in
       this file decides access from the batch, and that is what keeps
       a stand-in out of the class list, the materials and the roster.

       Found by the enclosing function, as tools/check-sql.js does for
       ownsOnDate(), and with comments blanked first so prose about the
       column is not mistaken for a query using it. */
    const ALLOWED = new Set(["batches", "lessons", "standingIn"]);
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
                             (m) => m.replace(/[^\n]/g, " "));
    const sites = new Set();
    for (const m of code.matchAll(/\bl\.teacher_id\b/g)) {
      const before = code.slice(0, m.index);
      const fn = [...before.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)].pop();
      sites.add(fn ? fn[1] : "(top level)");
    }
    for (const fn of sites) {
      ok(`...and ${fn}() is allowed to read lessons.teacher_id`, ALLOWED.has(fn));
    }
    ok("...and standingIn() is one of the places that does",
       sites.has("standingIn"));
  }
}

// The only asynchronous block in this file. CommonJS has no top-level
// await, so it runs as a promise and the summary at the foot waits on
// it -- without that the totals print before these checks finish, and a
// failure here would exit 0 while looking green.
const asyncChecks = (async () => {
  const db = require("../lib/db");
  const lessons = require("../lib/lessons");

  const realEnabled = db.isEnabled;
  const realHasColumn = db.hasColumn;
  const realQueryOne = db.queryOne;
  const realQuery = db.query;

  // A lesson at 09:00 Berlin on Wednesday 16 September, stored -- as the
  // column really does -- at 07:00 UTC.
  const LESSON = {
    id: 31, seq: 1, title: "Lesson 1",
    starts_at: new Date("2026-09-16T07:00:00Z"),
    minutes: 120, status: "scheduled", moved_from: null, change_note: null,
    generated: 1, intake_id: 12, batch_code: "LNRKB02",
    timezone: "Europe/Berlin", course_title: "German Regular A2", level: "A2",
  };

  let written = null;
  const stub = (lesson, { column = true } = {}) => {
    written = null;
    db.isEnabled = () => true;
    db.hasColumn = () => column;
    db.queryOne = async () => (lesson ? { ...lesson } : null);
    db.query = async (sql, params) => {
      written = { sql, params };
      return { affectedRows: 1 };
    };
  };
  const restoreDb = () => {
    db.isEnabled = realEnabled;
    db.hasColumn = realHasColumn;
    db.queryOne = realQueryOne;
    db.query = realQuery;
  };

  const run = async () => {
    // -- a held lesson is a record, not a plan ------------------------
    stub({ ...LESSON, status: "held" });
    let r = await lessons.cancel(31, 7, { note: "Teacher ill" });
    ok("a held class cannot be cancelled", !r.ok && /already been held/.test(r.reason));
    ok("...and nothing was written", written === null);

    stub({ ...LESSON, status: "held" });
    r = await lessons.reschedule(31, 7, { date: "2026-09-18", time: "09:00", note: "x" });
    ok("a held class cannot be moved either", !r.ok && /already been held/.test(r.reason));

    // -- a change carries a reason ------------------------------------
    stub(LESSON);
    r = await lessons.cancel(31, 7, { note: "   " });
    // "Cancelled" with nothing beside it reads as a mistake somebody
    // should ring the office about.
    ok("cancelling without a reason is refused", !r.ok && /Say why/.test(r.reason));
    ok("...and nothing was written", written === null);

    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "2026-09-18", time: "09:00", note: "" });
    ok("moving without a reason is refused too", !r.ok && /Say why/.test(r.reason));

    // -- a cancellation keeps the row ---------------------------------
    stub(LESSON);
    r = await lessons.cancel(31, 7, { note: "Public holiday" });
    ok("a cancellation succeeds", r.ok);
    // Deleting it would make a cancelled class indistinguishable from
    // one that was never scheduled, and the student turns up.
    ok("...by UPDATE, never DELETE",
       /UPDATE lessons/.test(written.sql) && !/DELETE/.test(written.sql));
    ok("...and the reason is stored", written.params[0] === "Public holiday");
    ok("...and a held row could not have been caught by it",
       /status <> 'held'/.test(written.sql));

    /* -- whose side it came from -------------------------------------
     *
     * The note was always required and always terse: "ill", "holiday".
     * What could not be answered afterwards was whether the school
     * dropped the class or the students asked for it, which is the
     * question when a batch has had three of them.
     *
     * Composed into change_note rather than kept in a column of its
     * own — a column counts better but needs a migration, and the
     * keys are data so one can be backfilled from these prefixes.
     */
    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "students" });
    ok("a reason alone is enough, with no note",
       r.ok && written.params[0] === "At the students' request");

    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "students", note: "exam week" });
    ok("...and the note is added to it, not instead of it",
       r.ok && written.params[0] === "At the students' request \u2014 exam week");

    /* "Other" means "what follows IS the reason". Labelling it would
       put the word Other in front of the only sentence written. */
    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "other", note: "storm, trains cancelled" });
    ok("\"other\" gives the sentence and no label",
       r.ok && written.params[0] === "storm, trains cancelled");

    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "other", note: "  " });
    ok("...and \"other\" with nothing written is still refused",
       !r.ok && /pick a reason or write one/.test(r.reason));
    ok("...and nothing was written", written === null);

    /* A key that is not on the list is not a label. It must not reach
       change_note as itself — a student would read "nonsense". */
    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "nonsense", note: "Teacher ill" });
    ok("an unknown reason key is dropped, not printed",
       r.ok && written.params[0] === "Teacher ill");

    stub(LESSON);
    r = await lessons.cancel(31, 7, { reason: "nonsense" });
    ok("...and on its own it is refused", !r.ok);

    /* -- a class in the past that never happened ---------------------
     *
     * The schedule only ever offered the cancel control on what is
     * coming, so a class that was behind and unmarked sat in "still to
     * mark" for ever: the only honest register for a class that did
     * not happen is no register at all. The library always allowed
     * this — nothing new is permitted, the page simply asks now — and
     * that is worth a test, because "held" is the rule that matters
     * and it is easy to reach for a date comparison instead.
     */
    stub({ ...LESSON, starts_at: "2020-01-06 09:00:00" });
    r = await lessons.cancel(31, 7, { reason: "noshow" });
    ok("a class long in the past can still be called off",
       r.ok && written.params[0] === "Nobody turned up");

    stub({ ...LESSON, starts_at: "2020-01-06 09:00:00", status: "held" });
    r = await lessons.cancel(31, 7, { reason: "noshow" });
    ok("...but one with a register against it cannot",
       !r.ok && /already been held/.test(r.reason));

    // -- moving reads the time in the BATCH's zone --------------------
    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "2026-09-18", time: "09:00", note: "Holiday" });
    ok("a move succeeds", r.ok);
    // 09:00 Berlin in September is 07:00 UTC. Storing 09:00 UTC would
    // put the class at 11:00 for everybody in the room.
    ok("...storing the instant 09:00 Berlin actually is",
       written.params[0].toISOString() === "2026-09-18T07:00:00.000Z");
    // A class moved twice should say where it was when the students
    // last heard about it -- that is the time they wrote down.
    ok("...and remembering the slot it left",
       new Date(written.params[2]).toISOString() === "2026-09-16T07:00:00.000Z");
    ok("...carrying the reason", written.params[3] === "Holiday");

    // In winter the same wall clock is a different instant. Getting this
    // wrong is an hour out for half the year.
    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "2026-12-16", time: "09:00", note: "Holiday" });
    ok("the same 09:00 in winter is stored an hour earlier",
       written.params[0].toISOString() === "2026-12-16T08:00:00.000Z");

    // -- a move to where it already is is not a move ------------------
    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "2026-09-16", time: "09:00", note: "Holiday" });
    // Announcing a change to a class that would then find nothing
    // changed is worse than refusing.
    ok("moving a class to its own time is refused", !r.ok && /already at/.test(r.reason));
    ok("...and no email-triggering write happened", written === null);

    // -- rescheduling something says it is happening ------------------
    stub({ ...LESSON, status: "cancelled", change_note: "Teacher ill" });
    r = await lessons.reschedule(31, 7, { date: "2026-09-18", time: "10:00", note: "Back on" });
    ok("moving a cancelled class puts it back on",
       r.ok && r.lesson.status === "scheduled" && /status = 'scheduled'/.test(written.sql));

    // -- a garbled time is refused, not guessed at --------------------
    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "2026-09-18", time: "half nine", note: "x" });
    ok("an unreadable time is refused", !r.ok && /Pick a time/.test(r.reason));
    stub(LESSON);
    r = await lessons.reschedule(31, 7, { date: "", time: "09:00", note: "x" });
    ok("a missing date is refused", !r.ok && /Pick a date/.test(r.reason));

    // -- somebody else's lesson ---------------------------------------
    stub(null);
    r = await lessons.cancel(31, 7, { note: "Teacher ill" });
    // "Not yours" and "does not exist" are the same answer, so probing
    // ids teaches nothing.
    ok("another teacher's lesson is simply not found",
       !r.ok && /No such lesson/.test(r.reason));

    // -- shipped ahead of its migration --------------------------------
    stub(LESSON, { column: false });
    r = await lessons.cancel(31, 7, { note: "Teacher ill" });
    ok("without migration 25 it says so rather than failing oddly",
       !r.ok && /migration 25/.test(r.reason));
    ok("...and touched nothing", written === null);
  };


  // -- What the class actually receives ------------------------------
  //
  // The first version of this email reached real students with every
  // line of its detail table rendered as "<" and "t".
  //
  // T.details() takes [label, value] pairs and calls T.row() itself. It
  // was handed finished HTML instead, so it destructured each string --
  // [k, v] on "<tr>..." is its first two characters. And T.button takes
  // (label, href), which was passed the other way round, putting the
  // URL on the face of the button.
  //
  // Neither is a crash. Both render, both send, and both look wrong
  // only to the person who opens it.
  {
    const mailer = require("../lib/mailer");
    const lessonMail = require("../lib/lesson-mail");

    const realSend = mailer.send;
    let sentMail = null;
    mailer.send = async (m) => { sentMail = m; return { sent: true }; };

    const lesson = {
      course_title: "Fast Track", batch_code: "LNIKB01", timezone: "Europe/Berlin",
      starts_at: new Date("2026-09-18T17:00:00Z"),
      moved_from: null, change_note: "Teacher unwell",
    };

    try {
      await lessonMail.tell({ name: "sheikh", email: "x@example.com" }, lesson, "cancelled");

      const html = sentMail.html;
      const text = sentMail.text;

      ok("the email names the course and the batch",
         html.includes("Fast Track") && html.includes("LNIKB01"));
      ok("...and labels each line rather than shredding the table",
         html.includes("Course") && html.includes("Batch") && html.includes("Reason"));
      // The exact shape of the bug: a row whose whole content is the
      // first character of "<tr>".
      ok("...with no row rendered as a stray bracket",
         !/>\s*&lt;\s*</.test(html) && !/<strong>t<\/strong>/.test(html));
      ok("...carrying the reason the teacher typed",
         html.includes("Teacher unwell") && text.includes("Teacher unwell"));

      // 17:00 UTC is 19:00 in Berlin. A class missed by two hours is
      // the whole reason times are printed in the batch's zone.
      ok("the time is the batch's, not the server's",
         html.includes("19:00") && !html.includes("17:00"));
      ok("...and the subject says it too",
         /19:00/.test(sentMail.subject) && /Cancelled/.test(sentMail.subject));

      ok("the button reads as words and links to the schedule",
         /<a href="[^"]*\/portal\/schedule"[^>]*>See my schedule<\/a>/.test(html));

      // A plain-text part, because a client that blocks HTML should not
      // receive an empty message about a cancelled class.
      ok("there is a plain-text version with the same facts",
         text.includes("Fast Track") && text.includes("19:00") && text.includes("Was due"));

      // Moved says where it moved FROM, which is the message somebody
      // who wrote the old time down actually needs.
      sentMail = null;
      await lessonMail.tell(
        { name: "sheikh", email: "x@example.com" },
        { ...lesson, starts_at: new Date("2026-09-19T17:00:00Z"),
          moved_from: new Date("2026-09-18T17:00:00Z"), change_note: "Public holiday" },
        "moved"
      );
      ok("a moved class says the old time as well as the new one",
         sentMail.html.includes("Was") &&
         sentMail.html.includes("Friday 18 September") &&
         sentMail.html.includes("Saturday 19 September"));
    } finally {
      mailer.send = realSend;
    }
  }


  // -- Handing one class to another teacher --------------------------
  //
  // The stand-in's permission is the LESSON, not the course. That is
  // the whole design: a teacher can now give a colleague sight of a
  // class list by choosing a name, so what the colleague gets has to be
  // as small as it can be and still let them teach.
  {
    stub(LESSON);
    let r = await lessons.handOver(31, 7, { toTeacherId: 9, note: "Herr Seraj away" });
    ok("a class can be handed to another teacher", r.ok);
    ok("...recording who is taking it and who arranged it",
       written.params[0] === 9 && written.params[1] === 7);
    ok("...with the reason the students will see", written.params[2] === "Herr Seraj away");
    ok("...and never touching a held lesson", /status <> 'held'/.test(written.sql));

    // A reason is not optional: a different teacher arriving with no
    // explanation reads as a mistake.
    stub(LESSON);
    r = await lessons.handOver(31, 7, { toTeacherId: 9, note: "  " });
    ok("handing over without a reason is refused", !r.ok && /Say why/.test(r.reason));
    ok("...and nothing was written", written === null);

    stub(LESSON);
    r = await lessons.handOver(31, 7, { toTeacherId: 7, note: "x" });
    ok("you cannot hand a class to yourself", !r.ok && /that is you/i.test(r.reason));

    stub(LESSON);
    r = await lessons.handOver(31, 7, { toTeacherId: 0, note: "x" });
    ok("a missing teacher is refused", !r.ok && /Choose the teacher/.test(r.reason));

    // Held and cancelled are both wrong, for different reasons.
    stub({ ...LESSON, status: "held" });
    r = await lessons.handOver(31, 7, { toTeacherId: 9, note: "x" });
    ok("a class already held cannot change teacher",
       !r.ok && /already been held/.test(r.reason));

    stub({ ...LESSON, status: "cancelled" });
    r = await lessons.handOver(31, 7, { toTeacherId: 9, note: "x" });
    // Handing over a cancelled class would tell the students a class
    // they were told was off is on again, by a side effect.
    ok("a cancelled class must be put back on first",
       !r.ok && /put it back on/i.test(r.reason));

    // Taking it back is the batch's own teacher's to do, not the
    // stand-in's -- otherwise a stand-in could pass the class on again.
    stub({ ...LESSON, stand_in_id: 9 });
    db.queryOne = async (sql) =>
      /FROM intakes/.test(sql) ? null : { ...LESSON, stand_in_id: 9 };
    r = await lessons.takeBack(31, 9);
    ok("a stand-in cannot take the class back themselves",
       !r.ok && /own teacher/.test(r.reason));

    stub(LESSON, { column: false });
    r = await lessons.handOver(31, 7, { toTeacherId: 9, note: "x" });
    ok("without migration 27 it says so rather than failing oddly",
       !r.ok && /migration 27/.test(r.reason));
  }

  try { await run(); } finally { restoreDb(); }
})();

/* ── Homework, and the wall around one class ──────────────────────
 *
 * A teacher can set and take back homework now, which means a teacher
 * can write to the access list of an exercise. The only thing standing
 * between that and a teacher giving homework to somebody else's class
 * is the route, so this reads the route rather than trusting it.
 *
 * Three things have to be true and none of them is "the dropdown only
 * offers their batches". A dropdown is a suggestion; the form behind
 * it can be posted with any number in it.
 */
{
  console.log("\nHomework stays inside one class");

  // Required here rather than at the top: this file scopes fs and path
  // inside the blocks that use them, so a bare reference out here
  // reaches for a name that does not exist.
  const fs = require("fs");
  const path = require("path");

  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "teacher.js"), "utf8");
  const post = src.slice(src.indexOf('router.post("/homework"'));
  const body = post.slice(0, post.indexOf("\n  });"));

  /* 1. The batch is checked against the teacher, through the helper
        that joins on OWNS(). Without this the whole thing is an open
        door with a sign on it. */
  ok("the class is verified before anything is written",
     /teacherClass\(me, body\.batch\)/.test(body));
  ok("...and an unverified one is refused", /if \(!found\)/.test(body));

  /* 2. The course saved on the homework comes from the verified row,
        never from the form. Reading it off the form would let a
        teacher label their own class's homework with somebody else's
        batch, which is how it turns up in another class's portal. */
  ok("the course written comes from the verified row",
     /intakeId: found\.batch\.id/.test(body));
  ok("...and never from the form",
     !/intakeId:\s*(Number\()?body\.(for_intake|batch)/.test(body));

  /* 3. Every address is checked against the roster. The lists on that
        page are hidden and shown by a script, and a form can be posted
        with any address at all. */
  ok("the roster is what decides who can be given homework",
     /roster\.has\(e\)/.test(body));
  ok("...built from the verified class", /found\.roster\.map/.test(body));

  // And the GET is scoped the same way, or the page itself leaks who
  // is on another class.
  const get = src.slice(src.indexOf('router.get("/homework"'));
  ok("the page itself only loads their own class",
     /teacherClass\(me, chosen\)/.test(get.slice(0, get.indexOf("\n  });"))));

  const prog = src.slice(src.indexOf('router.get("/progress"'));
  ok("class progress is scoped to their own class too",
     /teaching\.batch\(me\.id, chosen\)/.test(prog.slice(0, prog.indexOf("\n  });"))));
}

Promise.all([asyncChecks, batchCodeChecks])
  .catch((e) => {
    console.error("  x asynchronous checks threw:", e.message);
    fail++;
  })
  .then(() => {
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  });
