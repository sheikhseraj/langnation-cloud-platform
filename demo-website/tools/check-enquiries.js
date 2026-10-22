// ─────────────────────────────────────────────────────────────────────
//  Enquiries: the folder counts, and who is refused.
//
//  lib/enquiries.js had no tests at all. That was tolerable while it was
//  validate-and-store; it stopped being tolerable when it started
//  deciding whether a stranger's message reaches the office, because
//  the failure that costs money here is silent. A blocked student does
//  not write again to say they were blocked.
//
//  The database is stubbed rather than reached. These are decisions
//  about a row, not about MySQL, and a suite that needs a live server is
//  a suite nobody runs before pushing.
// ─────────────────────────────────────────────────────────────────────
"use strict";

process.env.TZ = "UTC";

const db = require("../lib/db");
const enquiries = require("../lib/enquiries");

let passed = 0;
let failed = 0;
const ok = (label, cond) => {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
};

const section = (title) => console.log(`\n${title}`);

// ── the stub ────────────────────────────────────────────────────────
const real = {
  isEnabled: db.isEnabled,
  query: db.query,
  queryOne: db.queryOne,
};
let asked = null;

/** `rows` is what query() returns; `one` is what queryOne() returns. */
function stub({ enabled = true, rows = [], one = null, throws = null } = {}) {
  asked = null;
  db.isEnabled = () => enabled;
  db.query = async (sql, params) => {
    asked = { sql, params };
    if (throws) throw new Error(throws);
    return rows;
  };
  db.queryOne = async (sql, params) => {
    asked = { sql, params };
    if (throws) throw new Error(throws);
    return one;
  };
}

const restore = () => Object.assign(db, real);

(async () => {
  // ── counts ────────────────────────────────────────────────────────
  section("What is in each folder");

  stub({ rows: [{ status: "new", n: 2 }, { status: "spam", n: 5 }] });
  let c = await enquiries.counts();
  ok("counts come back keyed by folder", c.new === 2 && c.spam === 5);
  /* A folder the query said nothing about has nothing in it, not
     undefined. "Spam" with no number beside it is the one somebody
     clicks to check, and a chip rendering "Spam undefined" is worse
     than either. */
  ok("...and a folder with nothing in it reads 0, not undefined",
     c.replied === 0 && c.closed === 0);
  ok("...in one query, not one per folder", /GROUP BY/.test(asked.sql));

  stub({ rows: [{ status: "nonsense", n: 9 }] });
  c = await enquiries.counts();
  ok("a status that is not a folder is ignored",
     !("nonsense" in c) && c.new === 0);

  stub({ enabled: false });
  c = await enquiries.counts();
  ok("no database means zeroes, not a crash", c.new === 0 && c.spam === 0);

  stub({ throws: "connection lost" });
  c = await enquiries.counts();
  ok("...and neither does a query that throws", c.new === 0);

  // ── how many are coming in ────────────────────────────────────────
  section("How many arrived");

  stub({ one: { week: 4, month: 17 } });
  let a = await enquiries.arrivals();
  ok("two windows, because one number is not a trend", a.week === 4 && a.month === 17);
  /* Spam arrived too, but counting it makes the figure a measure of how
     much rubbish got through rather than of how many people wrote — and
     a spam wave would read as a good week. */
  ok("...and spam is not one of them", /status <> 'spam'/.test(asked.sql));

  stub({ one: { week: null, month: null } });
  a = await enquiries.arrivals();
  ok("SUM over no rows is 0, not null", a.week === 0 && a.month === 0);

  stub({ enabled: false });
  a = await enquiries.arrivals();
  ok("no database means zeroes", a.week === 0 && a.month === 0);

  stub({ throws: "connection lost" });
  a = await enquiries.arrivals();
  ok("...and so does a query that throws", a.week === 0 && a.month === 0);

  // ── the block list ────────────────────────────────────────────────
  section("Who is refused");

  /* The spam folder IS the block list. There is no second table: an
     address is blocked because somebody looked at something it sent and
     pressed the button, and it stops being blocked the moment that
     enquiry is moved back out. */
  stub({ one: { hit: 1 } });
  ok("an address with a spam enquiry against it is blocked",
     (await enquiries.isBlocked("sales@vantovo.example")) === true);
  ok("...asked of the spam folder and nothing else",
     /status = 'spam'/.test(asked.sql));

  stub({ one: null });
  ok("an address with none is not blocked",
     (await enquiries.isBlocked("student@example.com")) === false);

  /* A spammer who capitalises a letter is not a different person, and
     neither is one who leaves a space on the end of the field. */
  stub({ one: { hit: 1 } });
  await enquiries.isBlocked("  Sales@VANTOVO.example  ");
  ok("the address is compared trimmed and lower-cased",
     asked.params[0] === "sales@vantovo.example" &&
     /LOWER\(TRIM\(email\)\)/.test(asked.sql));

  stub({ one: { hit: 1 } });
  ok("an empty address is not a lookup",
     (await enquiries.isBlocked("")) === false && asked === null);
  stub({ one: { hit: 1 } });
  ok("...and neither is a missing one",
     (await enquiries.isBlocked(undefined)) === false && asked === null);

  /* Both of these fail OPEN, and that is the whole argument: a missed
     spam is an annoyance, a refused student is lost business. A site
     that starts turning away enquiries because a query timed out has
     turned a database wobble into lost revenue. */
  stub({ enabled: false });
  ok("with no database, nobody is blocked",
     (await enquiries.isBlocked("sales@vantovo.example")) === false);

  stub({ throws: "connection lost" });
  ok("...and a query that throws blocks nobody either",
     (await enquiries.isBlocked("sales@vantovo.example")) === false);

  // ── the query is bound, not interpolated ──────────────────────────
  section("The address never reaches the SQL");

  stub({ one: null });
  await enquiries.isBlocked("x' OR '1'='1");
  ok("the address is bound as a parameter",
     asked.sql.includes("?") && asked.params.length === 1);
  ok("...and no part of it is in the statement",
     !asked.sql.includes("OR '1'"));

  // ── who the compose box can be addressed to ───────────────────────
  //
  // Writing to a student meant opening Students, finding them, copying
  // the address and coming back — for somebody whose address the site
  // has had since they signed up.
  section("Who can be written to");

  const contacts = require("../lib/contacts");

  /* Two queries go out, so the stub has to answer by which table was
     asked for rather than handing the same rows to both. */
  const twoTables = (admins, students) => {
    asked = null;
    db.isEnabled = () => true;
    db.query = async (sql) => {
      asked = { sql };
      return /admin_users/.test(sql) ? admins : students;
    };
  };

  twoTables(
    [{ name: "Frau Weber", email: "weber@example.com" }],
    [{ name: "Anita Sharma", email: "anita@example.com" }]
  );
  let people = await contacts.list();
  ok("teachers and students come back together", people.length === 2);
  ok("...each saying which it is",
     people.find((p) => p.email === "weber@example.com").kind === "teacher" &&
     people.find((p) => p.email === "anita@example.com").kind === "student");
  ok("...sorted by name", people[0].name === "Anita Sharma");

  /* Somebody who is both is being written to as a teacher, and two
     identical rows in a picker is a picker somebody stops trusting. */
  twoTables(
    [{ name: "Frau Weber", email: "weber@example.com" }],
    [{ name: "S. Weber", email: "WEBER@example.com" }]
  );
  people = await contacts.list();
  ok("the same address twice appears once", people.length === 1);
  ok("...as the teacher, whatever the capitals said", people[0].kind === "teacher");

  twoTables([], [{ name: "No Address", email: "" }, { name: "Also None", email: null }]);
  people = await contacts.list();
  ok("somebody with no address is not a contact", people.length === 0);

  twoTables([], [{ name: "", email: "quiet@example.com" }]);
  people = await contacts.list();
  ok("...and somebody with no name is listed by address",
     people.length === 1 && people[0].name === "quiet@example.com");

  /* Suspended and closed accounts are left out: one has been cut off
     deliberately, the other may have asked to be forgotten. Typing the
     address still reaches them, which is a speed bump and not a wall. */
  twoTables([], []);
  await contacts.list();
  ok("closed and suspended students are not offered",
     /status = 'active'/.test(asked.sql) && /deleted_at IS NULL/.test(asked.sql));

  db.isEnabled = () => false;
  ok("no database means an empty picker, not a crash",
     (await contacts.list()).length === 0);

  restore();

  // ── the reply formatter ───────────────────────────────────────────
  //
  // What the office types goes out under the school's name. The office
  // is trusted; a page they pasted from is not, and editor.js exists in
  // the first place because a paste out of Word left
  // `<p yackocpvbhs="" 0",="" _fb_="">` all over the course content.
  section("What the reply box sends");

  const rt = require("../lib/rich-text");
  const bare = (html) => html.replace(/ style="[^"]*"/g, "");

  ok("a paragraph stays a paragraph",
     bare(rt.toHtml("<p>Hello.</p><p>Again.</p>")) === "<p>Hello.</p><p>Again.</p>");
  ok("...and carries an inline style, because Outlook has no stylesheet",
     /<p style="[^"]*font-size:14px/.test(rt.toHtml("<p>Hello.</p>")));

  ok("b and i are emitted as strong and em",
     bare(rt.toHtml("<p><b>a</b> <i>b</i></p>")) === "<p><strong>a</strong> <em>b</em></p>");
  ok("lists survive",
     bare(rt.toHtml("<ul><li>one</li><li>two</li></ul>")) ===
       "<ul><li>one</li><li>two</li></ul>");

  /* Text with no block around it still wants a paragraph's spacing:
     somebody typed one line and the editor never wrapped it. */
  ok("a bare line is wrapped", /^<p /.test(rt.toHtml("Just one line")));

  // -- what must not get out ----------------------------------------
  ok("a script tag goes, and takes its source with it",
     rt.toHtml("<p>Hi</p><script>alert(1)</script><p>Bye</p>") ===
       rt.toHtml("<p>Hi</p><p>Bye</p>"));
  ok("...even when it is never closed",
     !/alert/.test(rt.toHtml("<p>Hi</p><script>alert(1)")));
  ok("a style block goes the same way",
     !/color:red/.test(rt.toHtml("<style>p{color:red}</style><p>Hi</p>")));
  ok("an event handler cannot arrive on a tag",
     !/onerror/i.test(rt.toHtml('<p>a</p><img src=x onerror=alert(1)>')));
  ok("a javascript: link keeps its words and loses its link",
     bare(rt.toHtml('<p>See <a href="javascript:alert(1)">this</a>.</p>')) ===
       "<p>See this.</p>");
  ok("an http link is kept",
     /<a href="https:\/\/x\.test\/"/.test(rt.toHtml('<p><a href="https://x.test/">x</a></p>')));
  ok("a mailto link is kept",
     /<a href="mailto:info@langnation\.com"/.test(
       rt.toHtml('<p><a href="mailto:info@langnation.com">mail</a></p>')));

  /* The Word paste that started all this. The tag is allowed; the
     attributes it arrived with are not, and none of them is copied
     through -- the tag is rebuilt rather than cleaned. */
  ok("a paste out of Word loses its attributes and keeps its sentence",
     bare(rt.toHtml('<p yackocpvbhs="" 0",="" _fb_="" auto;="">Real sentence</p>')) ===
       "<p>Real sentence</p>");
  ok("a div loses its tag and keeps its words",
     /words survive/.test(rt.toHtml("<div>words survive</div>")));
  ok("a comment leaves nothing behind",
     bare(rt.toHtml("<p>a<!-- <script>x</script> -->b</p>")) === "<p>ab</p>");
  ok("a stray closing tag is dropped rather than closing something else",
     bare(rt.toHtml("</div><p>Fine</p></span>")) === "<p>Fine</p>");
  ok("an ampersand in a URL stays escaped in the attribute",
     /b=1&amp;c=2/.test(rt.toHtml('<p><a href="https://x.test/?b=1&amp;c=2">q</a></p>')));

  ok("nothing typed is nothing sent", rt.toHtml("") === "" && rt.toHtml("   ") === "");

  // -- the plain-text part ------------------------------------------
  section("...and the plain-text half of it");

  ok("tags come off", rt.toText("<p>Hello <b>there</b>.</p>") === "Hello there.");
  /* One newline between items, two around the list. Both the <li> and
     the </li> firing put a blank line between every bullet. */
  ok("a list keeps its shape",
     rt.toText("<p>Hi</p><ul><li>one</li><li>two</li></ul><p>End.</p>") ===
       "Hi\n\n\u2022 one\n\u2022 two\n\nEnd.");
  ok("a script contributes nothing here either",
     rt.toText("<p>Hi</p><script>alert(1)</script>") === "Hi");
  ok("entities are decoded, not left as source",
     rt.toText("<p>Fish &amp; chips</p>") === "Fish & chips");

  // ── documents on the way out ──────────────────────────────────────
  //
  // These arrive as data: URLs through the ordinary form encoding, the
  // way profile photos do, so there is no multipart parser and nothing
  // to install on the host. Everything about them comes from the page
  // and none of it is trusted.
  section("What may be attached");

  const attach = require("../lib/attachments");
  const asFile = (name, type, bytes) =>
    JSON.stringify({ name, data: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` });

  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
  const ZIPB = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];

  ok("nothing attached is fine", attach.parse(undefined).ok && attach.parse([]).ok);

  let got = attach.parse(asFile("terms.pdf", "application/pdf", PDF));
  ok("a pdf goes", got.ok && got.files.length === 1);
  ok("...as a buffer nodemailer can take",
     Buffer.isBuffer(got.files[0].content) && got.files[0].filename === "terms.pdf" &&
     got.files[0].contentType === "application/pdf");

  /* The browser hands back an EMPTY type for .docx, .odt and .csv on
     Windows, and FileReader then writes "data:;base64,". Insisting on a
     media type refused exactly the files the office was trying to send,
     which is what "it only shows PDF" turned out to be. */
  const noType = (name, bytes) =>
    JSON.stringify({ name, data: `data:;base64,${Buffer.from(bytes).toString("base64")}` });

  for (const [name, bytes, expect] of [
    ["class.docx", ZIPB, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["fees.xlsx", ZIPB, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["notes.odt", ZIPB, "application/vnd.oasis.opendocument.text"],
    ["slides.odp", ZIPB, "application/vnd.oasis.opendocument.presentation"],
    ["bundle.zip", ZIPB, "application/zip"],
    ["old.doc", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], "application/msword"],
    ["marks.csv", [0x61, 0x2c, 0x62], "text/csv"],
    ["a.rtf", [0x7b, 0x5c, 0x72, 0x74, 0x66], "application/rtf"],
  ]) {
    const one = attach.parse(noType(name, bytes));
    ok(`${name} goes, with no help from the browser`,
       one.ok && one.files[0].contentType === expect);
  }

  /* The question is not whether it is dangerous to US — it is going
     out, not being run here — but whether it is a document a language
     school sends a student. An attachment nobody expected is how a
     school's address ends up on a blocklist. */
  got = attach.parse(asFile("setup.exe", "application/x-msdownload", [0x4d, 0x5a]));
  ok("an executable does not", !got.ok && /is a program, not a document/.test(got.reason));

  /* Refused on the extension, not on what the page called it. A browser
     hands back no type at all for plenty of ordinary files, so the
     declared type cannot be the thing that decides — claiming to be a
     PDF must not launder a .exe. */
  got = attach.parse(asFile("setup.exe", "application/pdf", PDF));
  ok("...even when the page swears it is a pdf",
     !got.ok && /is a program, not a document/.test(got.reason));

  /* These open in a browser and carry script. A school emailing one is
     how its address ends up on a blocklist. */
  for (const bad of ["page.html", "logo.svg"]) {
    got = attach.parse(asFile(bad, "text/plain", [0x3c]));
    ok(`...and neither does ${bad}`, !got.ok && /is a program/.test(got.reason));
  }

  /* The declared type is a claim the page makes, and renaming a thing
     .pdf is the oldest way of making it. */
  got = attach.parse(asFile("really.pdf", "application/pdf", [0x4d, 0x5a, 0x90]));
  ok("something merely CALLED a pdf is caught by its bytes",
     !got.ok && /not really a \.pdf/.test(got.reason));

  /* The name travels in a MIME header and is written to disk by
     whoever receives it — neither of which is our machine, which is
     exactly why it is cleaned here rather than trusted to be cleaned
     there. */
  got = attach.parse(asFile("../../../etc/passwd.pdf", "application/pdf", PDF));
  ok("a path cannot travel in the name", got.ok && got.files[0].filename === "passwd.pdf");

  got = attach.parse(asFile('a"b\r\nBcc: someone@else.test.pdf', "application/pdf", PDF));
  ok("...and neither can a header",
     got.ok && !/[\r\n"]/.test(got.files[0].filename));

  /* A file with no name is no longer guessed at. The extension is what
     decides what a file IS, so a nameless one cannot be classified —
     and sending a document nobody can identify under the school's name
     is worse than saying so. */
  got = attach.parse(asFile("", "application/pdf", PDF));
  ok("a file with no name is refused rather than guessed at",
     !got.ok && /no file extension/.test(got.reason));

  got = attach.parse(Array(attach.MAX_FILES + 1).fill(asFile("a.pdf", "application/pdf", PDF)));
  ok("too many files is refused", !got.ok && /Too many files/.test(got.reason));

  const big = new Array(attach.MAX_TOTAL + 64).fill(0);
  big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46;
  got = attach.parse(asFile("huge.pdf", "application/pdf", big));
  ok("too much altogether is refused", !got.ok && /more than/.test(got.reason));

  got = attach.parse("not json at all");
  ok("something that is not a file at all is refused", !got.ok);
  got = attach.parse(JSON.stringify({ name: "x.pdf", data: "https://x.test/a.pdf" }));
  ok("...and so is a URL where the bytes should be", !got.ok);

  /* One refused file stops the whole send. An email that goes without
     the document it was written to carry is worse than one that does
     not go: the sender thinks it is done and finds out a week later. */
  got = attach.parse([
    asFile("good.pdf", "application/pdf", PDF),
    asFile("bad.exe", "application/x-msdownload", [0x4d, 0x5a]),
  ]);
  ok("one bad file stops all of them", !got.ok && got.files.length === 0);

  // ── the Sent folder ───────────────────────────────────────────────
  //
  // Replying marked an enquiry "replied", which says that A reply
  // happened and nothing about what it said; an email from the compose
  // box left no trace at all. This is the only copy — the mailbox the
  // mail goes out through is a relay, not an archive.
  section("What was sent");

  const sentLog = require("../lib/sent");
  const realHasColumn = db.hasColumn;
  const withTable = (yes) => {
    db.hasColumn = (key) => (key === "sent_emails.sent_at" ? yes : realHasColumn(key));
  };

  withTable(false);
  stub({ rows: [], one: null });
  let r2 = await sentLog.record({ to: "a@b.test", subject: "x" });
  ok("before the migration nothing is written", !r2.ok && asked === null);
  ok("...and the folder says it is not ready", (await sentLog.list()).ready === false);
  ok("...and counts nothing rather than throwing", (await sentLog.count()) === 0);

  withTable(true);
  stub({ rows: [], one: null });
  r2 = await sentLog.record({
    enquiryId: 14, to: "anita@example.com", name: "Anita Sharma",
    subject: "Re: your enquiry",
    body: "<p>Hello</p>",
    files: [{ filename: "terms.pdf" }, { filename: "plan.docx" }],
  });
  ok("a sent email is written down", r2.ok && /INSERT INTO sent_emails/.test(asked.sql));
  ok("...with who it went to and what it said",
     asked.params[1] === "anita@example.com" && asked.params[4] === "<p>Hello</p>");
  /* Names only. Keeping the files would turn a log into a file store,
     with everything that implies about size and backups; the names
     answer the question that gets asked, which is whether they went. */
  ok("...and the attachments by name, tab-separated",
     asked.params[5] === "terms.pdf\tplan.docx");
  ok("...tab, because a filename may contain a comma and cannot contain a tab",
     sentLog.SEP === "\t");

  stub({ rows: [], one: null });
  r2 = await sentLog.record({ to: "", subject: "x" });
  ok("an email to nobody is not recorded", !r2.ok && asked === null);

  /* The email has already gone by the time this runs. Reporting a
     failure to file the copy as a failure to send would have the office
     send the same message twice. */
  stub({ throws: "table is full" });
  r2 = await sentLog.record({ to: "a@b.test", subject: "x" });
  ok("a write that fails is reported, not thrown", r2.ok === false);

  stub({ rows: [{ id: 1, to_email: "a@b.test", attachments: "one.pdf\ttwo.pdf" }],
         one: { n: 1 } });
  const page = await sentLog.list({ page: 1, perPage: 10 });
  ok("reading gives the names back as a list",
     page.rows[0].files.length === 2 && page.rows[0].files[0] === "one.pdf");
  ok("...newest first, which is the only way it is read",
     /ORDER BY sent_at DESC/.test(asked.sql));

  stub({ rows: [{ id: 1, to_email: "a@b.test", attachments: null }], one: { n: 1 } });
  ok("no attachments is an empty list, not a null",
     Array.isArray((await sentLog.list()).rows[0].files) &&
     (await sentLog.list()).rows[0].files.length === 0);

  db.hasColumn = realHasColumn;
  restore();

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  restore();
  console.error("\n  threw:", e.message, "\n");
  process.exit(1);
});
