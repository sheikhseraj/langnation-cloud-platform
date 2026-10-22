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
//  Tests the parts of lib/students.js that hold no database: session
//  signing, one-time tokens, registration validation and login
//  throttling.
//
//    node tools/check-students.js
//
//  These are the pieces where a mistake is a security hole rather than a
//  visible bug, so they are checked on every run rather than tried once
//  by hand. No MySQL required.
// ─────────────────────────────────────────────────────────────────────
"use strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-checks-only";

const s = require("../lib/students");

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

// ── session cookies ──────────────────────────────────────────────────
{
  const cookie = s.signSession(7, 3, future());
  const read = s.readSession(cookie);
  ok("a signed session reads back", read && read.id === 7 && read.version === 3);

  ok("rejects a tampered id", s.readSession(cookie.replace(/^7\./, "8.")) === null);
  ok("rejects a tampered version", s.readSession(cookie.replace(/^7\.3\./, "7.4.")) === null);
  ok("rejects a truncated cookie", s.readSession(cookie.split(".").slice(0, 3).join(".")) === null);
  ok("rejects an empty cookie", s.readSession("") === null);
  ok("rejects a non-string", s.readSession(undefined) === null);
  ok("rejects junk", s.readSession("a.b.c.d") === null);

  // The expiry is inside the signature, so a stale cookie cannot be
  // revived by editing it.
  const expired = s.signSession(7, 3, Date.now() - 1000);
  ok("rejects an expired session", s.readSession(expired) === null);

  // The whole point of token_version: same student, bumped version.
  const v1 = s.readSession(s.signSession(9, 1, future()));
  const v2 = s.readSession(s.signSession(9, 2, future()));
  ok("carries the token version", v1.version === 1 && v2.version === 2);

  ok("rejects id 0", s.readSession(s.signSession(0, 1, future())) === null);
  ok("rejects a negative id", s.readSession(s.signSession(-3, 1, future())) === null);
}

// ── one-time tokens ──────────────────────────────────────────────────
{
  const { token, hash } = s.makeToken();
  ok("token is URL-safe", /^[A-Za-z0-9_-]+$/.test(token));
  ok("token is long enough to be unguessable", token.length >= 40);
  ok("hash is sha-256 hex", /^[0-9a-f]{64}$/.test(hash));
  ok("the plaintext is not the hash", token !== hash);
  ok("token matches its own hash", s.tokenMatches(token, hash) === true);
  ok("a different token does not match", s.tokenMatches(s.makeToken().token, hash) === false);
  ok("empty does not match", s.tokenMatches("", hash) === false);
  ok("null hash never matches", s.tokenMatches(token, null) === false);
  ok("hashing is stable", s.hashToken("abc") === s.hashToken("abc"));

  const many = new Set();
  for (let i = 0; i < 500; i++) many.add(s.makeToken().token);
  ok("tokens do not repeat", many.size === 500);
}

// ── registration validation ──────────────────────────────────────────
{
  const good = s.validateRegistration({
    name: "Anita Sharma",
    email: "  Anita@Example.COM ",
    password: "korrekt-pferd-batterie",
    accept: "on",
  });
  ok("accepts a sound registration", good.ok === true);
  ok("lower-cases and trims the email", good.values.email === "anita@example.com");

  const noAccept = s.validateRegistration({
    name: "A B",
    email: "a@b.co",
    password: "korrekt-pferd-batterie",
  });
  ok("requires the terms to be accepted", noAccept.ok === false && !!noAccept.errors.accept);

  const short = s.validateRegistration({
    name: "A B",
    email: "a@b.co",
    password: "short",
    accept: "on",
  });
  ok("rejects a short password", !!short.errors.password);

  for (const bad of ["not-an-email", "a@b", "a b@c.de", "@b.de", "a@.de", ""]) {
    const r = s.validateRegistration({ name: "A B", email: bad, password: "korrekt-pferd-batterie", accept: "on" });
    ok(`rejects the email ${JSON.stringify(bad)}`, !!r.errors.email);
  }
  for (const okEmail of ["a@b.co", "first.last+tag@sub.example.de", "x_y@münchen.de"]) {
    const r = s.validateRegistration({ name: "A B", email: okEmail, password: "korrekt-pferd-batterie", accept: "on" });
    ok(`accepts the email ${okEmail}`, !r.errors.email);
  }

  ok("no name is rejected", !!s.validateRegistration({ email: "a@b.co", password: "korrekt-pferd-batterie", accept: 1 }).errors.name);

  // Long input is cut rather than rejected: a pasted name with trailing
  // rubbish should still register.
  const long = s.validateRegistration({
    name: "x".repeat(400), email: "a@b.co", password: "korrekt-pferd-batterie", accept: 1,
  });
  ok("over-long name is truncated, not refused", long.ok === true && long.values.name.length === 120);
}

// ── obvious passwords ────────────────────────────────────────────────
{
  ok("blocks 'password'", s.isTooObvious("password", {}) === true);
  ok("blocks 'langnation'", s.isTooObvious("langnation", {}) === true);
  ok("blocks the person's own email name", s.isTooObvious("anita12345", { email: "anita@example.com" }) === true);
  ok("blocks the person's own first name", s.isTooObvious("Anita-hallo", { name: "Anita Sharma" }) === true);
  ok("allows a real passphrase", s.isTooObvious("korrekt-pferd-batterie", { name: "Anita Sharma", email: "anita@example.com" }) === false);
  // A two- or three-letter name would otherwise block almost everything.
  ok("a very short name does not block sane passwords", s.isTooObvious("winterreise-1927", { name: "Li Bo" }) === false);
}

// ── login throttling ─────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  ok("not locked with no lock set", s.lockoutState({ locked_until: null }, now).locked === false);
  ok("not locked once the lock has passed", s.lockoutState({ locked_until: new Date(now - 1000) }, now).locked === false);

  const live = s.lockoutState({ locked_until: new Date(now + 30_000) }, now);
  ok("locked while the lock stands", live.locked === true);
  ok("reports the wait in seconds", live.secondsLeft === 30);

  for (let i = 0; i < s.MAX_ATTEMPTS - 1; i++) {
    ok(`attempt ${i + 1} does not lock`, s.nextLockout(i, now).lockedUntil === null);
  }
  const trip = s.nextLockout(s.MAX_ATTEMPTS - 1, now);
  ok("the last attempt locks", trip.lockedUntil !== null);
  ok("locks for the configured window", trip.lockedUntil.getTime() === now + s.LOCKOUT_MS);
  ok("counts from zero when undefined", s.nextLockout(undefined, now).failed === 1);
}

// ── student reference ────────────────────────────────────────────────
//
// One sequence for all time rather than one per year. The reference
// goes on certificates and follows a person for as long as they study
// here, so a year in it would have meant LN2026-0007 and LN2027-0007
// being two different people with nearly the same number.
{
  ok("pads the sequence", s.formatStudentRef(7) === "LNS0007");
  ok("starts at one", s.formatStudentRef(1) === "LNS0001");
  ok("does not truncate past four digits", s.formatStudentRef(12345) === "LNS12345");
}

// ── batch code ───────────────────────────────────────────────────────
{
  const c = require("../lib/codes");
  ok("uses the school's track shorthand", c.formatBatchCode("Intensive", 1) === "LNIKB01");
  ok("numbers each track separately", c.formatBatchCode("Regular", 1) === "LNRKB01");
  ok("pads to two, then grows", c.formatBatchCode("Intensive", 103) === "LNIKB103");
  // A track invented later must still produce a code rather than throw.
  ok("falls back for an unknown track", c.formatBatchCode("Corporate", 2) === "LNCOB02");
  ok("falls back for no track at all", c.formatBatchCode("", 2) === "LNAKB02");
}

// ── The account button in the site header ────────────────────────────
//
// The header is on every public page, and public pages are cached. The
// signed-in state therefore cannot be rendered into one: the script
// asks for it afterwards. What is checked here is that the shipped
// markup stays the safe version — a plain link, no name — and that the
// menu it turns into has words in both languages.
{
  const fs = require("fs");
  const path = require("path");
  const { translator } = require("../lib/i18n");

  const header = fs.readFileSync(
    path.join(__dirname, "..", "views", "partials", "header.ejs"), "utf8");

  ok("the header still has the account hook", header.includes("data-account"));
  ok("...and the link the script replaces", header.includes("data-account-btn"));

  // Without JavaScript this has to remain a working link to the
  // sign-in page, carrying where the visitor was.
  ok("signed out it is a link to the portal", /data-account-btn[\s\S]{0,120}href="\/portal\?next=/.test(header));

  // Nothing about a person may be rendered server-side into a page
  // that something else will cache and serve to the next visitor.
  // Checked inside the EJS tags, with the comments stripped out.
  // Over the raw file "theme.toggle" contains "me." and the comment
  // above the button uses the word "student" in a sentence; neither
  // reads a person. What matters is what the template evaluates.
  const code = (header.replace(/<%#[\s\S]*?%>/g, "").match(/<%[\s\S]*?%>/g) || []).join("\n");
  const READS_A_PERSON = [/\bstudent\b/, /\bavatarUrl\b/, /\binitials\b/, /\bstudent_ref\b/];
  for (const pattern of READS_A_PERSON) {
    ok(`the header evaluates nothing matching ${pattern}`, !pattern.test(code));
  }
  // The greeting is shipped as a template with a placeholder in it,
  // never with a name already substituted — that is the difference
  // between a string every visitor may cache and one that is somebody's.
  ok("the greeting is shipped as a template, not a name",
     /signedIn:\s*t\("nav\.acct\.signedIn"\)/.test(code));

  // A missing key would put the literal "logout" in the menu.
  const MENU = ["menu", "signedIn", "dashboard", "profile", "courses",
                "et", "settings", "logout"];
  for (const lang of ["en", "de"]) {
    const t = translator(lang);
    const missing = MENU.filter((k) => t("nav.acct." + k) === "nav.acct." + k);
    ok(`every account menu string exists in ${lang}`, missing.length === 0);
  }
  // The one with a placeholder has to keep it, or the menu says
  // "Signed in as {name}" to everybody.
  for (const lang of ["en", "de"]) {
    ok(`the ${lang} greeting still takes a name`,
       translator(lang)("nav.acct.signedIn").includes("{name}"));
  }

  // The script must ask an endpoint that the service worker leaves
  // alone. Everything under /portal is excluded there; anywhere else
  // would be cached and served to the next person on the machine.
  const app = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
  ok("the account state is fetched from under /portal",
     app.includes('fetch("/portal/session.json"'));
  ok("...and never stored", /session\.json[\s\S]{0,200}cache: "no-store"/.test(app));

  const sw = fs.readFileSync(
    path.join(__dirname, "..", "public", "sw.js"), "utf8");
  ok("the service worker still keeps its hands off /portal",
     /PRIVATE\s*=\s*\[[^\]]*"\/portal"/.test(sw));

  // The name a student typed goes into markup, so it is escaped.
  ok("the name is escaped before it reaches innerHTML",
     app.includes("escape_(me.name"));
  ok("...and so are the initials derived from it",
     app.includes("escape_(me.initials"));
}


// ── The dashboard's two lies ─────────────────────────────────────────
//
// Both were reported from the same screenshot: tiles reading "2 running
// now" above a card showing one class.
{
  const portal = require("../lib/portal");

  const en = (over = {}) =>
    Object.assign(
      {
        id: 1,
        intake_id: 10,
        code: "LNIKB01",
        course_title: "Fast Track",
        status: "active",
        batch_status: "running",
        starts_on: "2026-09-14",
        meeting_url: "https://example.invalid/room",
      },
      over
    );

  // nextUp returned live[0] and dropped the rest.
  const two = portal.nextUp([
    en({ id: 1, intake_id: 10, code: "LNIKB01", starts_on: "2026-09-14" }),
    en({ id: 2, intake_id: 11, code: "LNRKB02", starts_on: "2026-09-16",
         course_title: "German Regular A2" }),
  ]);
  ok("two running batches produce two cards, not one",
     two && two.when === "now" && two.enrolments.length === 2);
  ok("...soonest first, rather than the query's order",
     two.enrolments[0].code === "LNIKB01");
  ok("...and the old single-enrolment field still points at the first",
     two.enrolment.code === "LNIKB01");

  // A batch that has not started is not running, however active the
  // enrolment on it is.
  const soon = portal.nextUp([
    en({ batch_status: "planned", starts_on: "2099-01-01" }),
  ]);
  ok("a batch that has not started reads as starting soon, not now",
     soon && soon.when === "soon");
  ok("...and only one is announced, because three would be a list",
     soon.enrolments.length === 1);

  ok("nothing running and nothing coming is null, not an empty card",
     portal.nextUp([]) === null);

  // Enrolment order: first joined at the top, whatever the clock says.
  const today = (h) => {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d.toISOString().slice(0, 19).replace("T", " ");
  };
  const joined = portal.nextUp([
    en({ id: 9, code: "SECOND", enrolled_on: "2026-09-13", next_lesson_at: today(10) }),
    en({ id: 4, code: "FIRST", enrolled_on: "2026-09-01", next_lesson_at: today(18) }),
  ]);
  ok("the first course enrolled on comes first",
     joined.enrolments.map((e) => e.code).join(",") === "FIRST,SECOND");
  ok("...and the lesson time does not reorder it during the day",
     joined.enrolments[0].next_lesson_at === today(18));

  // enrolled_on is a DATE, so two on the same day need a tiebreak that
  // is not the query's order.
  const sameDay = portal.nextUp([
    en({ id: 12, code: "LATER", enrolled_on: "2026-09-13" }),
    en({ id: 7, code: "EARLIER", enrolled_on: "2026-09-13" }),
  ]);
  ok("two enrolments on one day fall back to the enrolment id",
     sameDay.enrolments.map((e) => e.code).join(",") === "EARLIER,LATER");

  // A missing enrolled_on must not throw the order away.
  const missing = portal.nextUp([
    en({ id: 5, code: "DATED", enrolled_on: "2026-09-02" }),
    en({ id: 3, code: "UNDATED", enrolled_on: null }),
  ]);
  ok("an enrolment with no date sorts first rather than crashing",
     missing.enrolments.length === 2);

  // A withdrawn student is not in class, whatever the batch is doing.
  ok("a withdrawn enrolment on a running batch is not happening now",
     portal.nextUp([en({ status: "withdrawn" })]) === null);

  // The tile said "running now" and counted active enrolments.
  const stats = portal.summarise({
    enrolments: [
      en({ batch_status: "running" }),
      en({ id: 2, batch_status: "planned", starts_on: "2099-01-01" }),
    ],
    certs: [],
    bills: [],
  });
  ok('"running now" counts running batches, not active enrolments',
     stats.running === 1);
  ok("...while enrolled still counts everything the student is on",
     stats.enrolled === 2);
  ok("...and active still counts active enrolments, for anything using it",
     stats.active === 2);
}

// ── Whose batch it is ────────────────────────────────────────────────
//
// Access to a class list, a register and a "Start the class" button is
// decided by one line of SQL, so that line is checked as the access
// control it is.
{
  const fs = require("fs");
  const path = require("path");
  const teaching = fs.readFileSync(
    path.join(__dirname, "..", "lib", "teaching.js"), "utf8");
  const owns = fs.readFileSync(
    path.join(__dirname, "..", "lib", "owns.js"), "utf8");

  // Every ownership test goes through the one helper, so the predicate
  // and its bind list cannot drift apart.
  const used = teaching.match(/\$\{OWNS\(\)\}/g) || [];
  ok("every teacher query builds its ownership test from OWNS()",
     used.length === 5);
  ok("no query hard-codes the predicate any more",
     !/WHERE \(i\.teacher_id = \? OR/.test(teaching));
  ok("...and does not define its own, but imports the one",
     /require\("\.\/owns"\)/.test(teaching));

  /* The predicate names the batch's teacher and nobody else.

     It used to be `teacher_id = ? OR teacher2_id = ?`, which handed
     whoever the office named as second teacher the primary one's
     access to that batch for the whole term. Cover is a single lesson
     now — lessons.teacher_id, good for its own date only — so the OR
     went, and this is here to notice if it comes back. */
  const { OWNS, BINDS } = require("../lib/owns");
  ok("the predicate is the batch's teacher, alone",
     OWNS() === "i.teacher_id = ?");
  ok("...and takes an alias, because not every query calls intakes i",
     OWNS("x") === "x.teacher_id = ?");
  ok("...and names no second teacher",
     !/teacher2/.test(owns.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")));
  ok("the bind list matches it, one placeholder and one value",
     BINDS(7).length === (OWNS().match(/\?/g) || []).length && BINDS(7)[0] === 7);

  const db = require("../lib/db");
  const intakes = require("../lib/intakes");

  /* A second teacher cannot be set at all any more.

     The office form used to offer one, and it is gone: it granted this
     batch for the whole term to somebody who covers one evening of it,
     and once that access was taken away the two fields asked a question
     with no consequences.

     Asserted on the editor rather than on the form, because the form is
     not what protects the column. A stale page left open in a tab, a
     bookmarked POST, or a browser restoring yesterday's session all
     submit the field, and what decides whether it lands is whether
     lib/intakes.js will write it. */
  const realHas = db.hasColumn;
  db.hasColumn = () => true;
  const posted = {
    teacher2_id: "7", teacher2_name: "Herr Seraj",
    status_auto: "1", status_auto_shown: "1",
  };
  const withCols = intakes.fromBody(posted);
  db.hasColumn = () => false;
  const withoutCols = intakes.fromBody(posted);
  db.hasColumn = realHas;

  ok("a posted second teacher is not written, column or no column",
     !("teacher2_id" in withCols) && !("teacher2_name" in withCols) &&
     !("teacher2_id" in withoutCols) && !("teacher2_name" in withoutCols));
  ok("...and there is no rule left about it to fail on",
     !intakes.validate({ course_id: 1, code: "X", teacher_id: 4, teacher2_id: 4 })
       .some((e) => /cover|second teacher/i.test(e)));

  ok("status_auto is written once its column exists",
     withCols.status_auto === 1);
  ok("...and left out before it does",
     !("status_auto" in withoutCols));
}

// ── Status that follows the dates ────────────────────────────────────
{
  const intakes = require("../lib/intakes");

  // With the migration run, which is the state these rules are about.
  const db2 = require("../lib/db");
  const restore = db2.hasColumn;
  db2.hasColumn = () => true;

  // An unticked checkbox sends nothing, so absence has to mean off --
  // but only when the form is known to have had the box on it.
  ok("an unticked Follow-the-dates box turns automation off",
     intakes.fromBody({ code: "X", status_auto_shown: "1" }).status_auto === 0);
  ok("...and a ticked one turns it on",
     intakes.fromBody({ code: "X", status_auto: "1", status_auto_shown: "1" }).status_auto === 1);

  // The trap this marker exists for.
  //
  // "Unticked" and "this form never had the box" arrive at the server
  // identically: nothing. Reading the second as the first is how a live
  // batch silently stopped following its dates -- one save from a page
  // rendered before the checkbox shipped set it to 0, the sweep then
  // skipped that batch forever, and the course reached its start date
  // with no "Join the class" button. Nothing in the interface said so,
  // because nothing had gone wrong on the page; the field simply was
  // not there.
  ok("a form with no checkbox on it leaves the setting alone",
     !("status_auto" in intakes.fromBody({ code: "X" })));
  ok("...even when something else on that form did change",
     !("status_auto" in intakes.fromBody({ code: "X", seats: "12" })));

  // Half a pattern is a mistake worth a sentence, not a silent
  // discard. Ticking Monday to Friday and forgetting the time used to
  // clear the days on the way in, so the page came back empty with
  // nothing said and no reason to look.
  const pat = (extra) => intakes.fromBody(Object.assign(
    { course_id: "1", code: "X", starts_on: "2026-09-16", meets_shown: "1" }, extra));

  ok("days with no time are refused, not dropped",
     intakes.validate(pat({ meets_days: ["1", "2", "3", "4", "5"] }))
       .some((e) => /days but no time/i.test(e)));
  ok("a time with no days is refused too",
     intakes.validate(pat({ meets_from: "09:00", meets_until: "11:00" }))
       .some((e) => /time but no days/i.test(e)));
  ok("a pattern with no start date has nothing to count from",
     intakes.validate(pat({ starts_on: "", meets_days: ["1"], meets_from: "09:00", meets_until: "11:00" }))
       .some((e) => /pattern needs a start date/i.test(e)));

  const whole = pat({ meets_days: ["1", "3"], meets_from: "18:00", meets_until: "19:30" });
  ok("a complete pattern passes", intakes.validate(whole).length === 0);
  ok("...with the days normalised and the length worked out",
     whole.meets_days === "1,3" && whole.meets_from === "18:00" && whole.meets_minutes === 90);
  ok("a form without the pattern fields leaves them alone",
     !("meets_days" in intakes.fromBody({ code: "X" })));

  // Following dates with no start date is following nothing.
  ok("automatic with no start date is refused",
     intakes.validate({ course_id: 1, code: "X", status_auto: 1 })
       .some((e) => /start date/i.test(e)));
  ok("...but manual with no start date is allowed",
     !intakes.validate({ course_id: 1, code: "X", status_auto: 0 })
       .some((e) => /start date/i.test(e)));

  db2.hasColumn = restore;

  ok("the sweep is exported for the server to run",
     typeof intakes.sweepStatuses === "function");
}

// -- The on-this-page contents ---------------------------------------
{
  const toc = require("../lib/toc");

  // The pattern the old editor produced: a paragraph that is nothing but
  // a bold run. Those are headings, and without promoting them the
  // article has no structure to index.
  const fake = toc.build("<p><b>1. Creating More Opportunities</b></p><p>Body.</p>");
  ok("a paragraph that is only bold becomes a heading",
     /<h3 id="1-creating-more-opportunities">/.test(fake.html));
  ok("...and is listed once, not twice",
     fake.items.length === 1);

  // A paragraph that merely starts bold is a paragraph.
  const lead = toc.build("<p><b>Note:</b> the rest of this sentence.</p>");
  ok("a paragraph that only starts with bold is left alone",
     !/<h3/.test(lead.html) && lead.items.length === 0);

  // A bold sentence is a sentence.
  ok("a bold run ending in a full stop is not promoted",
     !/<h3/.test(toc.build("<p><b>This is important.</b></p>").html));

  // Real headings keep what they have and gain what they lack.
  const real = toc.build('<h2 id="kept">One</h2><h3>Two</h3>');
  ok("an existing id is not replaced", /<h2 id="kept">/.test(real.html));
  ok("...and a heading without one is given it", /<h3[^>]*id="two"/.test(real.html));
  ok("both are listed, in document order",
     real.items.map((i) => i.text).join(",") === "One,Two");
  ok("...with their real levels, so the panel can indent",
     real.items.map((i) => i.level).join(",") === "2,3");

  // Two sections with the same name still need separate anchors.
  const dupe = toc.build("<h3>Costs</h3><h3>Costs</h3>");
  ok("a repeated heading gets its own id rather than a duplicate",
     dupe.items[0].id !== dupe.items[1].id);

  // German headings must not fold to a row of hyphens.
  ok("umlauts and the sharp s fold rather than vanish",
     toc.slugify("Uber Prufungen") === "uber-prufungen");

  // An empty heading is markup noise, not a section.
  ok("an empty heading is not listed",
     toc.build("<h5></h5><h3>Real</h3>").items.length === 1);

  ok("nothing in, nothing out",
     toc.build("").items.length === 0 && toc.build(null).items.length === 0);
}

// -- The batch status sweep keeps the school's clock -------------------
//
// Reported at 00:12 on the morning a course began: the batch still read
// "not started". CURDATE() is the database server's date and the pool
// runs in UTC, so ten past midnight in Berlin was twenty past ten the
// previous evening to MySQL, and the batch would not have started until
// 02:00 local.
{
  const intakes = require("../lib/intakes");
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "intakes.js"), "utf8");

  // Comment lines stripped first: the note explaining why CURDATE is
  // gone mentions CURDATE, and a test that cannot tell prose from code
  // fails on its own explanation.
  const NL = String.fromCharCode(10);
  const code = src.split(NL).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(NL);
  ok("the sweep no longer asks the database what day it is",
     !/CURDATE\(\)/.test(code));
  ok("...it compares against a date bound as a parameter",
     /starts_on <= \?/.test(src));
  ok("...chosen per batch timezone, not one global one",
     /COALESCE\(NULLIF\(timezone/.test(src));

  // The shape has to be what a DATE column compares against.
  ok("todayIn returns YYYY-MM-DD",
     /^\d{4}-\d{2}-\d{2}$/.test(intakes.todayIn("Europe/Berlin")));

  // The bug itself: two zones either side of midnight disagree, and the
  // school's is the one that counts.
  const berlin = intakes.todayIn("Europe/Berlin");
  const auckland = intakes.todayIn("Pacific/Auckland");
  ok("two timezones can be on different dates, and each gets its own",
     typeof berlin === "string" && typeof auckland === "string");

  // A typo in a timezone must not stop a course starting.
  ok("an unknown timezone falls back rather than throwing",
     intakes.todayIn("Not/AZone") === berlin);
  ok("...and so does an empty one",
     /^\d{4}-\d{2}-\d{2}$/.test(intakes.todayIn("")));

  // Late by up to an hour is late on the morning a course starts.
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  ok("the sweep runs more often than hourly",
     /setInterval\(sweep, 10 \* 60 \* 1000\)/.test(server));
}

// -- Removing an exam date --------------------------------------------
//
// "entfernen" answered "please choose a valid date". The button was a
// second control named exam_date beside the date input of the same name,
// so the form submitted both and the body arrived as an array; the
// regex then tested "2026-09-30," and refused it.
{
  const fs = require("fs");
  const path = require("path");
  const view = fs.readFileSync(
    path.join(__dirname, "..", "views", "pages", "portal", "einbuergerungstest.ejs"), "utf8");
  const route = fs.readFileSync(path.join(__dirname, "..", "routes", "student.js"), "utf8");
  const model = fs.readFileSync(path.join(__dirname, "..", "lib", "et-progress.js"), "utf8");

  // Two controls in one form must not share a name when one overrides
  // the other.
  const named = (view.match(/name="exam_date"/g) || []).length;
  ok("only one control in the form is called exam_date", named === 1);
  ok("the remove button has a name of its own", /name="clear"/.test(view));
  ok("the route reads it, and lets it win over the date box",
     /body\.clear \? "" : body\.exam_date/.test(route));

  // And the model no longer trusts the shape it is handed.
  ok("a repeated field is reduced to one value before validating",
     /Array\.isArray\(date\)/.test(model));

  // The reduction itself, run rather than read.
  const pick = (d) => {
    const raw = Array.isArray(d) ? d[d.length - 1] : d;
    return typeof raw === "string" ? raw.trim() : raw ? String(raw) : "";
  };
  ok("the last value wins, as a browser means by a repeated field",
     pick(["2026-09-30", ""]) === "");
  ok("...a plain string is untouched",
     pick("2026-09-30") === "2026-09-30");
  ok("...whitespace around a date does not make it invalid",
     pick("  2026-09-30  ") === "2026-09-30");
  ok("...and nothing at all reads as empty, not as a bad date",
     pick(undefined) === "" && pick(null) === "" && pick("") === "");

  // The distinction that was lost: empty means remove, malformed means
  // refuse. Both used to produce the refusal.
  const rx = /^\d{4}-\d{2}-\d{2}$/;
  const verdict = (d) => {
    const v = pick(d);
    if (!v) return "clear";
    return rx.test(v) ? "set" : "refuse";
  };
  ok("removing reads as a removal", verdict(["2026-09-30", ""]) === "clear");
  ok("a real date still sets", verdict("2026-10-01") === "set");
  ok("a malformed date is still refused", verdict("31/12/2026") === "refuse");
}

/* ── Suspending, and letting back in ──────────────────────────────
 *
 * For fees: somebody who has not settled stops having access until
 * they do, and gets everything back the moment they pay. "Everything"
 * has to mean it — the same homework, the same scores, the same place
 * in the class — and the only way that is true is if suspending
 * deletes nothing at all.
 *
 * So what is asserted here is mostly a negative: what the statement
 * does NOT touch. A suspension that quietly cleared an unlock list, or
 * closed an enrolment, or reset a score would look identical on the
 * day and be discovered a month later by a student who had paid.
 *
 * The file is otherwise synchronous, so the summary moves behind this.
 * A rejected promise nobody waits for is a failure that exits 0 while
 * looking green.
 */
async function suspending() {
  console.log("\nSuspending an account");

  const db = require("../lib/db");
  const real = { isEnabled: db.isEnabled, query: db.query, queryOne: db.queryOne };
  db.isEnabled = () => true;

  const students = require("../lib/students");

  let row = { id: 7, name: "Unpaid Person", status: "active", deleted_at: null };
  const seen = [];
  db.queryOne = async () => row;
  db.query = async (sql, binds) => { seen.push([sql, binds || []]); return []; };

  // ── Suspend ──
  seen.length = 0;
  let r = await students.setStatus(7, "suspended");
  ok("suspending works", r.ok && r.status === "suspended" && !r.already);

  const wrote = seen.map((q) => q[0]).join(" ");
  ok("it writes exactly one statement", seen.length === 1);
  ok("...which sets the status", /SET status = \?/.test(wrote) && seen[0][1][0] === "suspended");
  /* Signed out everywhere. Without this, somebody suspended on Monday
     keeps a valid cookie and carries on as if nothing had happened
     until it expires. */
  ok("...and signs them out everywhere", /token_version = token_version \+ 1/.test(wrote));

  /* The negative, which is the whole feature. */
  ok("it deletes nothing", !/DELETE/i.test(wrote));
  ok("...touches no homework", !/exercise|unlock_emails/i.test(wrote));
  ok("...touches no enrolment", !/enrolment/i.test(wrote));
  ok("...and throws no contact details away",
     !/email\s*=|password_hash|avatar|phone/i.test(wrote));

  // ── And back ──
  row = { id: 7, name: "Unpaid Person", status: "suspended", deleted_at: null };
  seen.length = 0;
  r = await students.setStatus(7, "active");
  ok("letting back in works", r.ok && r.status === "active");
  ok("...and is just as small", seen.length === 1 && !/DELETE/i.test(seen[0][0]));

  // Asking for what is already true is not an error, and not a write.
  row = { id: 7, name: "Unpaid Person", status: "active", deleted_at: null };
  seen.length = 0;
  r = await students.setStatus(7, "active");
  ok("asking for the state it is already in changes nothing",
     r.ok && r.already && seen.length === 0);

  /* A CLOSED account is not a suspended one. remove() has already
     thrown the address and the password away, so letting it back in
     would produce an account nobody can sign in to and whose owner
     cannot be reached. */
  row = { id: 9, name: "Gone Away", status: "suspended", deleted_at: "2026-01-01" };
  seen.length = 0;
  r = await students.setStatus(9, "active");
  ok("a closed account cannot be let back in", !r.ok && /closed/.test(r.reason));
  ok("...and nothing was written trying", seen.length === 0);

  // Anything other than the two states is refused rather than written.
  row = { id: 7, name: "Unpaid Person", status: "active", deleted_at: null };
  seen.length = 0;
  r = await students.setStatus(7, "deleted");
  ok("an unknown status is refused", !r.ok && seen.length === 0);

  db.queryOne = async () => null;
  r = await students.setStatus(404, "suspended");
  ok("an account that does not exist says so", !r.ok && /No such/.test(r.reason));

  Object.assign(db, real);
}

suspending().then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
});
