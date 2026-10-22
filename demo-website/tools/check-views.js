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
//  Render every portal template with realistic locals, including the
//  states a browser cannot easily be walked into — validation errors, a
//  lockout message, an empty portal, a populated one.
//
//    node tools/check-views.js
//
//  Each case asserts what must APPEAR in the output, not merely that
//  rendering finished. That distinction matters: EJS prints an undefined
//  local as an empty string, so a typo like `student.emailAddress` renders
//  perfectly and silently drops the email. A first version of this file
//  only checked for exceptions and passed with that exact bug injected.
//
//  No MySQL required.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-checks-only";
const site = require("../lib/site");
const pages = require("../routes/pages");

const VIEWS = path.join(__dirname, "..", "views");

// Counted separately from the rendered pages: these are rules, not
// templates, and lumping them together would hide which kind broke.
let pricePass = 0;
let priceFail = 0;

/**
 * Everything a PUBLIC page needs — the translator, the navigation, the
 * locale paths, the SEO defaults.
 *
 * Built by running the real middleware rather than by copying its
 * output into a fixture. A hand-written copy drifts the first time
 * somebody adds a local, and then the suite is testing a page that no
 * longer resembles the one being served.
 */
function publicBase(lang = "en", currentPath = "/") {
  const res = { locals: {} };
  // The middleware wraps res.render to inject shared locals, so the
  // fake response needs one to wrap.
  res.render = () => {};
  pages.context(lang)({ path: currentPath, cookies: {} }, res, () => {});
  return res.locals;
}

const base = {
  classLinks: require("../lib/class-links"),
  classJoinCsrf: "a".repeat(64),
  site,
  student: null,
  error: null,
  notice: null,
  errors: {},
  values: {},
  devLink: null,
};

const student = {
  id: 1,
  student_ref: "LNS0007",
  name: "Anita Sharma",
  email: "anita@example.com",
  status: "active",
  token_version: 1,
  preferred_lang: "en",
};

const portal = require("../lib/portal");
const avatar = require("../lib/avatar");

/**
 * The locals every signed-in portal page needs, matching what
 * routes/student.js builds. Kept in one place so a page added to the
 * shell does not need its own copy of this.
 */
function shell(nav, who = student) {
  return {
    student: who,
    nav,
    avatarUrl: null,
    initials: avatar.initials(who.name),
    hue: avatar.hue(who.student_ref || who.email),
  };
}


// ── The teacher portal ───────────────────────────────────────────────
//
// Same shell as the student portal, different person behind it, and a
// completely different set of things it must never show. The cases
// below lean on the second half of that: a class list is somebody
// else's contact details, so "renders without throwing" is not the
// interesting assertion — "shows the phone number to the teacher and
// the batch to nobody else" is.

const teachers = require("../lib/teachers");
const teaching = require("../lib/teaching");

const teacher = {
  id: 4,
  name: "Frau Weber",
  email: "weber@example.com",
  phone: "+49 176 1234567",
  role: "teacher",
  status: "active",
  token_version: 1,
  timezone: null,
  bio: null,
  avatar_type: null,
  avatar_updated_at: null,
  last_login_at: "2026-09-01T08:00:00Z",
};

function teachShell(nav, who = teacher) {
  return {
    teacher: who,
    nav,
    avatarUrl: null,
    initials: avatar.initials(teachers.bareName(who.name)),
    hue: avatar.hue(who.email),
    greeting: teachers.greeting(who.name),
    // The pending-registers banner is on every teacher page that has a
    // shell, so its locals belong with the shell rather than being
    // repeated on twenty cases. Nothing owed is the ordinary state, and
    // the cases that care override it.
    pending: [],
    pendingSummary: null,
  };
}

/** A batch as lib/teaching.js hands it over. */
function batchRow(over = {}) {
  return {
    id: 12,
    code: "B2-2026-04",
    batch_title: null,
    starts_on: "2026-04-06",
    ends_on: "2026-06-26",
    timezone: "Europe/Berlin",
    seats: 12,
    batch_status: "running",
    meeting_url: "https://meet.example/b2",
    drive_url: "https://drive.example/b2",
    whatsapp_url: "https://chat.example/b2",
    course_title: "German Regular B2",
    level: "B2",
    track: "Regular",
    course_slug: "german-regular-b2",
    active_students: 3,
    enrolled: 3,
    ...over,
  };
}

/** A class list as the route decorates it. */
const rosterRows = [
  {
    id: 91, student_ref: "LNS0007", name: "Anita Sharma",
    email: "anita@example.com", phone: "+91 98765 43210", country: "India",
    status: "active", enrolled_on: "2026-03-20", completed_on: null,
    final_grade: null, photo: null, initials: "AS", hue: 120,
  },
  {
    id: 92, student_ref: "LNS0008", name: "Ravi Kumar",
    email: "ravi@example.com", phone: null, country: "India",
    status: "withdrawn", enrolled_on: "2026-03-21", completed_on: null,
    final_grade: null, photo: null, initials: "RK", hue: 200,
  },
];


/**
 * What a route hands the terms gate.
 *
 * The real body is the CMS page; the tests use a short stand-in so a
 * failure points at the gate rather than at somebody having reworded
 * clause 7.
 */
function gateTerms(title, path) {
  return {
    termsTitle: title,
    termsPath: path,
    termsHtml: "<h2>\u00a7 1 Scope</h2><p>The clauses would be here.</p>",
  };
}

const cases = [
  {
    view: "portal/register",
    label: "empty form",
    locals: {},
    expect: ['name="name"', 'name="email"', 'name="password"', 'name="accept"', 'name="website"', "/portal/login"],
  },
  {
    view: "portal/register",
    label: "every field in error",
    locals: {
      values: { name: "A", email: "nope", phone: "", country: "" },
      errors: {
        name: "Please enter your name.",
        email: "Please enter a valid email address.",
        password: "Use at least 10 characters.",
        accept: "Please accept the terms to continue.",
      },
    },
    // Each message must reach the page, and each field must be flagged for
    // assistive tech rather than only turning red.
    expect: [
      "Please enter your name.",
      "Please enter a valid email address.",
      "Use at least 10 characters.",
      "Please accept the terms to continue.",
      'aria-describedby="err-email"',
      'aria-invalid="true"',
      'value="nope"',
    ],
  },
  {
    view: "portal/register",
    label: "rate limited",
    locals: { error: "Too many attempts from this connection." },
    expect: ["Too many attempts from this connection.", "notice-bad"],
  },
  {
    view: "portal/registered",
    label: "no dev link",
    locals: { values: { email: "anita@example.com" } },
    expect: ["anita@example.com", "Check your email"],
    reject: ["/portal/verify/"],
  },
  {
    view: "portal/registered",
    label: "staging dev link",
    locals: {
      values: { email: "anita@example.com" },
      devLink: "http://localhost:3000/portal/verify/abc",
    },
    expect: ["http://localhost:3000/portal/verify/abc", "no SMTP configured"],
  },
  {
    view: "portal/registered",
    label: "honeypot, no values",
    locals: { values: {} },
    // Must not read as a broken sentence when there is no address to show.
    expect: ["that address"],
  },
  {
    view: "portal/login",
    label: "empty",
    locals: { values: {} },
    expect: ['name="email"', 'name="password"', 'action="/portal/login"', "/portal/register"],
  },
  {
    view: "portal/login",
    label: "bad details",
    locals: { error: "Those details do not match.", values: { email: "a@b.co" } },
    expect: ["Those details do not match.", 'value="a@b.co"'],
  },
  {
    view: "portal/login",
    label: "locked out",
    locals: { error: "Too many attempts. Please try again in 15 minutes." },
    expect: ["Please try again in 15 minutes."],
  },
  {
    view: "portal/login",
    label: "carries next",
    locals: { values: { next: "/portal/me" } },
    expect: ['name="next" value="/portal/me"'],
  },
  {
    view: "portal/unavailable",
    label: "no database",
    locals: { error: "The portal needs the database." },
    expect: ["The portal needs the database.", "Not available yet"],
  },
  // The time a class meets, in the BATCH's zone and not the server's.
  //
  // Reported from a screenshot: a batch set to 19:00 Europe/Berlin was
  // announced to students as "meets tomorrow at 17:00", on a card whose
  // own footnote says "Times are Europe/Berlin". starts_at is a UTC
  // instant, this server runs in UTC, and toLocaleTimeString without a
  // timeZone formats in the server's zone. Two hours out in summer, one
  // in winter, confidently wrong all year.
  // The four links a class runs on, in the order of a class: get in,
  // talk to people, read what was set, then practise it.
  //
  // Each appears only when the office has actually set one. A button
  // that opens nothing is worse than no button -- it teaches people the
  // portal is decorative, and then they stop pressing the ones that
  // work.
  {
    view: "portal/dashboard",
    label: "join, chat, materials and exercise, in that order",
    locals: (() => {
      const enrolments = [
        {
          id: 1, intake_id: 10, status: "active", code: "LNIKB01",
          starts_on: "2026-09-14", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Herr Seraj",
          meeting_url: "https://meet.example/fast",
          whatsapp_url: "https://chat.whatsapp.com/abc",
          drive_url: "https://drive.example/folder",
          exercise_url: "https://exercise.example/set",
          course_title: "Fast Track", level: "A1",
          next_lesson_at: "2026-09-25T17:00:00Z",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments, events: [], results: [], notice: null,
      };
    })(),
    expect: ["Join the class", "Group chat", "Course materials", "Exercise"],
    order: ["Join the class", "Group chat", "Course materials", "Exercise"],
  },
  {
    view: "portal/dashboard",
    label: "...and no Exercise button when the office has not set one",
    locals: (() => {
      const enrolments = [
        {
          id: 1, intake_id: 10, status: "active", code: "LNIKB01",
          starts_on: "2026-09-14", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Herr Seraj",
          meeting_url: "https://meet.example/fast",
          drive_url: "https://drive.example/folder",
          exercise_url: null,
          course_title: "Fast Track", level: "A1",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments, events: [], results: [], notice: null,
      };
    })(),
    expect: ["Course materials"],
    reject: [">Exercise", "exercise.example"],
  },
  {
    view: "portal/dashboard",
    label: "an overdue payment is said once, at the top",
    locals: {
      ...shell("dashboard"),
      stats: portal.summarise({}),
      next: null, enrolments: [], certificates: [], results: [], events: [],
      money: { level: "overdue", amount: 50000, currency: "EUR",
               on: "2026-09-01", course: "Fast Track A1–B1" },
    },
    expect: ["Payment overdue", "€500.00", "1 September 2026", "View payments"],
    /* The amount in cents reaching the page would mean the division
       never happened, which is the failure that turns €500 into
       €50,000 in front of a student. */
    reject: ["NaN", "50000", "€50,000"],
  },
  {
    view: "portal/dashboard",
    label: "a student who is up to date is not nagged",
    locals: {
      ...shell("dashboard"),
      stats: portal.summarise({}),
      next: null, enrolments: [], certificates: [], results: [], events: [],
      money: null,
    },
    /* Nothing owed, nothing said. A reminder that is always on the
       page is furniture, and furniture is what people stop reading. */
    reject: ["Payment overdue", "Payment reminder", "View payments"],
  },
  {
    view: "portal/dashboard",
    label: "a 19:00 Berlin class is announced as 19:00, not the server's clock",
    locals: (() => {
      const enrolments = [
        {
          id: 1, intake_id: 10, status: "active", code: "LNIKB01",
          starts_on: "2026-09-14", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Herr Seraj",
          meeting_url: "https://meet.example/fast",
          course_title: "Fast Track", level: "A1",
          // 17:00 UTC is 19:00 in Berlin in September.
          next_lesson_at: "2026-09-25T17:00:00Z",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments,
        events: [],
        results: [],
        notice: null,
      };
    })(),
    expect: ["19:00"],
    reject: ["17:00"],
  },
  {
    view: "portal/dashboard",
    label: "two running batches, two cards",
    locals: (() => {
      // Reported from a real screenshot: tiles reading "2 running now"
      // over a single card, with the second course's join link reachable
      // from nowhere on the page.
      const enrolments = [
        {
          id: 1, intake_id: 10, status: "active", code: "LNIKB01",
          starts_on: "2026-09-14", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Herr Seraj",
          // Still carried, because the column is still there and the
          // query used to select it. Nothing may print it.
          teacher2_name: "Frau Weber",
          meeting_url: "https://meet.example/fast",
          course_title: "Fast Track", level: "A1",
        },
        {
          id: 2, intake_id: 11, status: "active", code: "LNRKB02",
          starts_on: "2026-09-16", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Frau Kanishka",
          meeting_url: "https://meet.example/regular",
          course_title: "German Regular A2", level: "A2",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments,
        events: [],
        results: [],
        notice: null,
      };
    })(),
    expect: [
      // Both courses named, both join forms present.
      "Fast Track", "German Regular A2",
      "LNIKB01", "LNRKB02",
      "/portal/join/10", "/portal/join/11",
      // The heading is said once, above the set.
      "Happening now",
    ],
    /* The batch's second teacher is not a name the student is told.

       It used to print as "· or Frau Weber" beside the teacher, from a
       field the office set on the batch — which told a student that a
       person with no access to their class might turn up to teach it.
       Standing in is a single lesson now and says so on that lesson. */
    reject: ["Frau Weber"],
  },
  {
    view: "portal/dashboard",
    label: "one running, one not yet — the tile counts one",
    locals: (() => {
      const enrolments = [
        {
          id: 1, intake_id: 10, status: "active", code: "LNIKB01",
          starts_on: "2026-09-14", batch_status: "running",
          timezone: "Europe/Berlin", teacher_name: "Herr Seraj",
          meeting_url: "https://meet.example/fast",
          course_title: "Fast Track", level: "A1",
        },
        {
          id: 2, intake_id: 11, status: "active", code: "LNRKB02",
          starts_on: "2099-01-01", batch_status: "planned",
          timezone: "Europe/Berlin", teacher_name: "Frau Kanishka",
          meeting_url: "https://meet.example/regular",
          course_title: "German Regular A2", level: "A2",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments,
        events: [],
        results: [],
        notice: null,
      };
    })(),
    expect: ["Fast Track", "/portal/join/10", "Happening now"],
    // The batch that has not started must not be offered as joinable,
    // and must not be counted in "running now".
    reject: ["/portal/join/11"],
  },
  {
    view: "portal/dashboard",
    label: "empty portal",
    locals: {
      ...shell("dashboard"),
      stats: portal.summarise({}),
      next: null,
      enrolments: [],
      events: [],
      results: [],
      notice: "Your account is confirmed.",
    },
    expect: [
      "Anita",
      "LNS0007",
      "Your account is confirmed.",
      "not on a course yet",
      "No placement test on record",
      "Nothing booked",
      "/portal/logout",
    ],
  },
  {
    view: "portal/dashboard",
    label: "populated",
    locals: (() => {
      const enrolments = [
        {
          id: 1, status: "active", enrolled_on: "2026-03-01", code: "B2-2026-04",
          starts_on: "2026-04-01", ends_on: "2026-06-30", timezone: "Europe/Berlin",
          batch_status: "running", teacher_name: "Frau Weber", meeting_url: "https://meet.example/x",
          course_title: "German Regular B2", level: "B2",
        },
      ];
      const bills = [
        { kind: "invoice", status: "part_paid", total: "280.00", paid_amount: "100.00" },
      ];
      const certs = [{ revoked_at: null }];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments, certs, bills }),
        next: portal.nextUp(enrolments),
        enrolments,
        events: [
          { event_slug: "stammtisch-april", event_title: "Stammtisch", event_date: "2026-04-12", status: "registered" },
        ],
        results: [
          { placed_level: "B1", track: "a1-b1", score_percent: "74.00", taken_at: "2026-03-12T10:00:00Z" },
        ],
      };
    })(),
    expect: [
      "German Regular B2", "B2-2026-04", "1 Apr 2026", "Frau Weber",
      "Stammtisch", "12 Apr 2026", "registered",
      "B1", "74%", "12 Mar 2026",
      // The tiles must agree with the lists they sit above.
      "Happening now", "€180", "to pay",
    ],
    // The empty-state copy must be gone when there is data.
    reject: ["not on a course yet", "No placement test on record", "nothing owed"],
  },
  {
    view: "portal/dashboard",
    label: "all three batch links are offered",
    locals: (() => {
      const enrolments = [
        {
          id: 1, intake_id: 12, status: "active", enrolled_on: "2026-03-01", code: "B2-2026-04",
          starts_on: "2026-04-01", ends_on: "2026-06-30", timezone: "Europe/Berlin",
          batch_status: "running", teacher_name: "Frau Weber",
          meeting_url: "https://meet.example/x",
          drive_url: "https://drive.example/b2",
          whatsapp_url: "https://chat.example/b2",
          course_title: "German Regular B2", level: "B2",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments, events: [], results: [],
      };
    })(),
    expect: [
      // The native room link opens separately; tracking stays same-origin.
      "Join the class", 'data-class-action="/portal/join/12"', 'href="https://meet.example/x"', 'target="_blank"',
      "Course materials", "https://drive.example/b2",
      "Group chat", "https://chat.example/b2",
    ],
    reject: ['form method="post" action="/portal/join/12"'],
  },
  {
    view: "portal/dashboard",
    label: "a link the school has not set is not offered",
    locals: (() => {
      // Only the meeting link. A "Group chat" button that opens nothing
      // is worse than no button: it teaches people the portal is
      // decorative.
      const enrolments = [
        {
          id: 1, status: "active", enrolled_on: "2026-03-01", code: "B2-2026-04",
          starts_on: "2026-04-01", ends_on: "2026-06-30", timezone: "Europe/Berlin",
          batch_status: "running", teacher_name: "Frau Weber",
          meeting_url: "https://meet.example/x",
          drive_url: null, whatsapp_url: "",
          course_title: "German Regular B2", level: "B2",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments, events: [], results: [],
      };
    })(),
    expect: ["Join the class"],
    reject: ["Course materials", "Group chat"],
  },
  {
    view: "portal/dashboard",
    label: "enrolled but nothing running: the courses card takes the slot",
    locals: (() => {
      // The old dashboard always carried a "My courses" list. It is
      // gone, so a student whose batches have all finished must still
      // be told something about their courses.
      const enrolments = [
        {
          id: 1, status: "completed", enrolled_on: "2025-01-01", code: "A2-2025-01",
          starts_on: "2025-01-06", ends_on: "2025-03-28", timezone: "Europe/Berlin",
          batch_status: "finished", teacher_name: "Herr Klein",
          meeting_url: null, drive_url: null, whatsapp_url: null,
          course_title: "German Regular A2", level: "A2",
        },
      ];
      return {
        ...shell("dashboard"),
        stats: portal.summarise({ enrolments }),
        next: portal.nextUp(enrolments),
        enrolments, events: [], results: [],
      };
    })(),
    expect: ["My courses", "German Regular A2", "A2-2025-01", "See all"],
    reject: ["not on a course yet", "Happening now", "Join the class"],
  },
  {
    view: "portal/dashboard",
    label: "no ref, single-word name",
    locals: {
      ...shell("dashboard", { ...student, student_ref: null, name: "Ravi" }),
      stats: portal.summarise({}),
      next: null,
      enrolments: [], events: [], results: [],
    },
    expect: ["Hello, Ravi", "anita@example.com"],
    // With no reference, the lead falls back to the email rather than
    // printing an empty "Student reference".
    reject: ["Student reference "],
  },
  {
    view: "portal/dashboard",
    label: "result with no score",
    locals: {
      ...shell("dashboard"),
      stats: portal.summarise({}),
      next: null,
      enrolments: [], events: [],
      results: [{ placed_level: "A2", track: "a1-b1", score_percent: null, taken_at: "2026-02-02T09:00:00Z" }],
    },
    expect: ["A2", "2 Feb 2026"],
    // A missing score must be omitted, not shown as 0% or NaN%.
    reject: ["0%", "NaN"],
  },
  {
    view: "portal/certificates",
    label: "a revoked certificate is shown, not hidden",
    locals: {
      ...shell("certificates"),
      enrolments: [],
      certificates: [
        { id: 1, code: "LN-CERT-1", course_title: "German Regular B1", level: "B1",
          grade: "1.7", hours: 120, issued_on: "2025-12-22", revoked_at: null, revoked_reason: null },
        { id: 2, code: "LN-CERT-2", course_title: "German Speaking", level: null,
          grade: null, hours: null, issued_on: "2024-11-02",
          revoked_at: "2025-01-15", revoked_reason: "Issued against the wrong batch." },
      ],
    },
    expect: ["LN-CERT-1", "LN-CERT-2", "Withdrawn on 15 Jan 2025", "Issued against the wrong batch."],
    reject: ["NaN", "undefined"],
  },
  {
    view: "portal/certificates",
    label: "no certificate, course still running",
    locals: {
      ...shell("certificates"),
      certificates: [],
      enrolments: [{ status: "active", course_title: "German Regular B2", code: "LNRKB04" }],
    },
    expect: ["still running", "German Regular B2", "LNRKB04", "contact the office"],
    reject: ["there is nothing to issue", "your certificate is due"],
  },
  {
    view: "portal/certificates",
    label: "no certificate, course finished",
    locals: {
      ...shell("certificates"),
      certificates: [],
      enrolments: [{ status: "completed", course_title: "German Regular B1", code: "LNRKB02" }],
    },
    // Owed one: say so, and give them the reference to quote.
    expect: ["finished", "German Regular B1", "LNS0007", "contact the office"],
    reject: ["still running", "there is nothing to issue"],
  },
  {
    view: "portal/certificates",
    label: "no certificate, never enrolled",
    locals: { ...shell("certificates"), certificates: [], enrolments: [] },
    // No promise of a certificate to somebody who has not studied.
    expect: ["Nothing to certify yet", "there is nothing to issue"],
    reject: ["your certificate is due", "still running"],
  },
  {
    view: "portal/payments",
    label: "an instalment plan, one paid, one late",
    locals: (() => {
      const billing = require("../lib/billing");
      const on = "2026-10-02";
      const inv = (no, total, paid, due, extra) => ({
        id: no, number: `2026-010${no}`, kind: "invoice", currency: "EUR",
        total, paid_amount: paid, status: paid === "0.00" ? "issued" : "part_paid",
        due_on: due, enrolment_id: 7, instalment_no: no, instalment_of: 3,
        batch_code: "LNIKB01", course_title: "Fast Track A1–B1", ...extra,
      });
      const rows = [
        inv(1, "500.00", "500.00", "2026-08-01", { status: "paid" }),
        inv(2, "500.00", "200.00", "2026-09-01"),
        inv(3, "500.00", "0.00", "2026-11-01"),
      ];
      const plan = {
        enrolmentId: 7, label: "Fast Track A1–B1", batch: "LNIKB01", currency: "EUR",
        ...billing.summarise(rows, on),
        history: [
          { received_on: "2026-08-01", amount_cents: 50000, currency: "EUR",
            method: "bank_transfer", instalment_no: 1, reference: "E2E-0099" },
          { received_on: "2026-09-02", amount_cents: 20000, currency: "EUR",
            method: "cash", instalment_no: 2, reference: null },
        ],
      };
      return {
        ...shell("payments"), plans: [plan],
        stateLabel: billing.STATE_LABEL, summaryLabel: billing.SUMMARY_STATE,
      };
    })(),
    /* The three figures have to agree with each other, and the late
       one has to say so in words and not only in red. */
    expect: ["Fast Track A1–B1", "€1,500.00", "€700.00", "€800.00",
             "Overdue", "Instalment 2 of 3", "Payment history", "Bank transfer",
             /* Each instalment is its own invoice, so each row opens one. */
             "/portal/payments/invoice/2"],
    /* €300.00 IS on this page and should be: instalment 2 is 500
       with 200 against it, so 300 is exactly what is overdue. The
       figures that would mean a bug are the ones that ignore the
       part payment -- 500 overdue, or 1,000 still owed instead of
       800. The first version of this rejected €300.00 and the
       suite was right to fail it. */
    reject: ["NaN", "undefined", "€1,000.00", "€500.00 is overdue"],
  },
  {
    view: "portal/payments",
    label: "paid in full, so no plan table and no warning",
    locals: (() => {
      const billing = require("../lib/billing");
      const rows = [{
        id: 1, number: "2026-0200", kind: "invoice", currency: "EUR",
        total: "1500.00", paid_amount: "1500.00", status: "paid",
        due_on: "2026-08-01", enrolment_id: 9, instalment_no: null, instalment_of: null,
        course_title: "German Regular B1",
      }];
      return {
        ...shell("payments"),
        plans: [{
          enrolmentId: 9, label: "German Regular B1", batch: null, currency: "EUR",
          ...billing.summarise(rows, "2026-10-02"), history: [],
        }],
        stateLabel: billing.STATE_LABEL, summaryLabel: billing.SUMMARY_STATE,
      };
    })(),
    /* One invoice is not a plan, so the list does not render -- and
       without this line there would be nothing on the card to click
       and no way for the student to reach the document at all. */
    expect: ["German Regular B1", "Paid in full", "€1,500.00", "€0.00",
             "Invoice 2026-0200", "/portal/payments/invoice/1"],
    /* One invoice is not a plan. Three headings over a single number
       is a table pretending to be information. */
    reject: ["Payment plan", "Overdue", "is due on", "NaN"],
  },
  {
    view: "portal/payments",
    label: "nothing billed yet",
    locals: (() => {
      const billing = require("../lib/billing");
      return {
        ...shell("payments"), plans: [],
        stateLabel: billing.STATE_LABEL, summaryLabel: billing.SUMMARY_STATE,
      };
    })(),
    expect: ["Nothing to pay yet"],
    reject: ["Payment plan", "NaN", "€"],
  },
  {
    view: "portal/invoice",
    label: "the student reads the same document the office does",
    locals: (() => {
      const billing = require("../lib/billing");
      const head = { total: "500.00", paid_amount: "200.00", due_on: "2026-09-01",
                     status: "part_paid", kind: "invoice" };
      return {
        ...shell("payments"),
        plan: [],
        bill: Object.assign({
          id: 2, number: "LN-2026-000002", kind: "invoice", currency: "EUR",
          student_id: 1, student_name: "Anita Sharma", student_ref: "LNS0007",
          course_title: "Fast Track A1–B1", batch_code: "LNIKB01",
          seller_name: "LangNation Education", seller_address: "Musterweg 1, 39104 Magdeburg",
          seller_tax_id: "DE000000000", billing_name: "Anita Sharma",
          billing_address: "Musterstraße 12, Magdeburg", tax_note: null,
          issued_on: "2026-08-15", due_on: "2026-09-01", paid_on: null,
          service_from: null, service_to: null,
          total: "500.00", paid_amount: "200.00", status: "part_paid",
          totalCents: 50000, paidCents: 20000, owedCents: 30000,
          items: [{ description: "Fast Track A1–B1 — Rate 2 von 3",
                    quantity: 1, amountCents: 50000 }],
          payments: [{ id: 1, amountCents: 20000, method: "bank_transfer",
                       reference: "E2E-0099", received_on: "2026-08-20", note: null,
                       reverses_id: null, reversed_by: null }],
        }, billing.stateOf(head, "2026-10-02")),
        methods: billing.METHODS, stateLabel: billing.STATE_LABEL,
      };
    })(),
    /* The document itself, inside the portal rather than instead of
       it: the student must still be able to get back. */
    expect: ["RECHNUNG", "LN-2026-000002", "Anita Sharma",
             "500,00", "200,00", "300,00",
             "Back to payments", "Print or save as PDF", "/portal/payments",
             /* Part paid and late: both have to be said in words. */
             "ÜBERFÄLLIG", "tell the office"],
    /* Nothing settled, so nothing may thank anybody; and no control
       that would let a student change the school's record. */
    reject: ["Vielen Dank", "Vollständig bezahlt", "Invalid Date", "NaN",
             /* Nothing on a student's page may write to the ledger, and
                nothing may point at the office's side of it. The only
                form in the shell is Log out, so the check names the
                controls rather than the tag. */
             "Record a payment", "Reverse", 'name="amount"', "/admin/"],
  },
  {
    view: "portal/profile",
    label: "fixed details are shown but not editable",
    locals: {
      ...shell("profile"),
      countries: [{ code: "DE", dial: "49", en: "Germany", de: "Deutschland" }],
      student: { ...student, phone: "+49 176 1", city: "Heidelberg", country: "Germany",
        date_of_birth: "1994-03-18", gender: "Male", timezone: "Europe/Berlin",
        created_at: "2025-02-11T00:00:00Z" },
    },
    expect: ['name="phone"', 'value="1994-03-18"', "Heidelberg", "anita@example.com", "Fixed details"],
    // The name and email must not appear as editable inputs.
    reject: ['name="name"', 'name="email"'],
  },
  {
    view: "portal/settings",
    label: "no photo yet",
    locals: { ...shell("settings") },
    expect: ["Upload a photo", "data-avatar-form", "current_password", "new_password"],
    // The remove control belongs only to someone who has a photo.
    reject: ["Remove my photo"],
  },
  {
    view: "portal/settings",
    label: "with a photo",
    locals: { ...shell("settings"), avatarUrl: "/portal/avatar?v=1" },
    expect: ["Change photo", "Remove my photo", "/portal/avatar?v=1"],
  },
  {
    view: "portal/settings",
    label: "deleting the account is gated and honest about what survives",
    locals: { ...shell("settings") },
    expect: [
      'data-confirm-delete="your account"',
      '/portal/settings/close',
      // The password is asked for again, signed in or not.
      'name="password"',
      "ten years",
    ],
  },
  {
    view: "portal/dashboard",
    label: "the header shows a face, not a name",
    locals: {
      ...shell("dashboard"),
      stats: portal.summarise({}),
      next: null, enrolments: [], events: [], results: [],
    },
    expect: [
      // The avatar is the way back to the dashboard.
      'class="icon-btn sp-homelink" href="/portal/me"',
      // The name still reaches assistive technology and hover.
      'aria-label="Dashboard — Anita Sharma"',
      "sp-avatar-sm",
    ],
    // The name must not be printed as visible text in the header bar:
    // on a phone it pushed Sign out off the row.
    reject: ['<span class="muted" style="font-size:.85rem">Anita Sharma</span>'],
  },
  {
    view: "portal/closed",
    label: "says what was kept",
    locals: { student: null, retained: { invoices: 2, certificates: 1 } },
    expect: ["Your account is closed", "2 invoices", "1 certificate", "ten years"],
  },
  {
    view: "portal/closed",
    label: "nothing was kept",
    locals: { student: null, retained: { invoices: 0, certificates: 0 } },
    expect: ["Your account is closed"],
    // With nothing retained there must be no paragraph about retention.
    reject: ["What we had to keep", "ten years"],
  },
];

// ── The back office's batch page ─────────────────────────────────────
//
// Not a portal page, but the most intricate screen in the project: a
// form, a roster, a picker and four destructive controls on one page.

const cg = require("../lib/course-groups");
const intakes = require("../lib/intakes");
const enrolments = require("../lib/enrolments");

const batchCourses = [
  { id: 7, slug: "intensive-courses", title: "Fast Track", level: null, track: "Intensive", status: "published" },
];

const batchBase = {
  site,
  batch: {
    id: 1, code: "LNIKB01", title: null, course_id: 7, teacher_name: "Frau Weber",
    starts_on: "2026-04-06", ends_on: "2026-07-10", seats: 20,
    status: "running", timezone: "Europe/Berlin", meeting_url: null,
  },
  isNew: false,
  roster: [
    { id: 11, status: "active", enrolled_on: "2026-03-02", student_id: 1,
      student_ref: "LNS0001", name: "Sheikh Seraj", email: "seraj@example.com" },
  ],
  candidates: [
    { id: 20, student_ref: "LNS0009", name: "Zoe Ahmad", email: "zoe@example.com",
      status: "active", created_at: "2026-09-09" },
    { id: 21, student_ref: "LNS0002", name: "Anna Weber", email: "anna@example.com",
      status: "active", created_at: "2025-03-14" },
  ],
  candidateLimit: enrolments.CANDIDATE_LIMIT,
  groups: cg.group(batchCourses),
  shortLabel: cg.shortLabel,
  statuses: intakes.STATUSES,
  statusLabel: intakes.STATUS_LABEL,
  // The weekly-pattern field reads the schedule module rather than
  // reimplementing "1,2,3,4,5" means Monday to Friday in a template.
  // routes/rootadmin.js puts it in every rootadmin render, so the
  // harness has to as well or the page renders here and nowhere else.
  sched: require("../lib/schedule"),
  // Whether the pattern fields can be offered at all. When the column
  // is missing the page draws an instruction instead of inputs --
  // a form showing a field the database cannot keep is a form that
  // loses what you type into it, silently, which is how this was found.
  canPattern: true,
  canExercise: true,
  errors: [], saved: false, created: false, notice: null, problem: null, suggestedCode: "",
};

const people = require("../lib/people");

const everyone = [
  { kind: "request", stage: "requested", name: "Neu Anfrage", email: "neu@example.com",
    ref: null, country: "India", requestedAt: "2026-09-01", decidedAt: null,
    createdAt: "2026-09-01", studentId: null, reachable: true },
  { kind: "request", stage: "approved", name: "Warte Person", email: "warte@example.com",
    ref: null, country: "Germany", requestedAt: "2026-08-01", decidedAt: "2026-08-02",
    createdAt: "2026-08-01", studentId: null, reachable: true },
  { kind: "student", stage: "active", name: "Anita Sharma", email: "anita@example.com",
    ref: "LNS0001", country: "India", requestedAt: "2026-07-01", decidedAt: "2026-07-02",
    createdAt: "2026-07-03", studentId: 1, reachable: true },
  { kind: "student", stage: "suspended", name: "Unpaid Person", email: "unpaid@example.com",
    ref: "LNS0003", country: "India", requestedAt: "2026-07-01", decidedAt: "2026-07-02",
    createdAt: "2026-07-03", studentId: 3, reachable: true },
  { kind: "student", stage: "closed", name: "Gone Away", email: "deleted-9@removed.invalid",
    ref: "LNS0002", country: null, requestedAt: null, decidedAt: null,
    createdAt: "2026-06-01", studentId: 9, reachable: false },
];

// The schema panel in the admin sidebar.
//
// Included by every admin page, so any one of them proves it. It exists
// because a missing column switches its feature off SILENTLY -- right
// for a visitor, useless for the person who has to work out why the
// feature will not turn on, and who was otherwise left restarting the
// site and re-running migrations with no way to see which was needed.
{
  const studentsBase = {
    rows: everyone,
    counts: people.counts(everyone),
    stages: people.STAGES,
    stage: "",
    q: "",
    site,
    authed: true,
    dbOk: true,
  };

  cases.push(
    /* Suspend, and let back in.
     *
     * For fees: somebody who has not settled stops having access until
     * they do, and gets it all back the moment they pay. The words
     * matter as much as the button — "nothing has been deleted" is the
     * difference between this and closing an account, and somebody
     * about to press it needs to know which one they are pressing. */
    {
      view: "admin-students",
      label: "an account can be suspended and let back in",
      locals: studentsBase,
      expect: [
        'action="/admin/students/act"',
        // Active: offered the suspension, with what it costs.
        'value="suspend"', "Suspend", "Nothing is deleted",
        // Already suspended: offered the way back.
        'value="activate"', "Let back in",
      ],
      check: (html) => {
        // The closed account gets neither. Closing threw the address
        // and the password away and cannot be undone, so offering to
        // let one back in would be offering something that does not
        // work.
        const row = html.slice(html.indexOf("Gone Away"));
        const cell = row.slice(0, row.indexOf("</tr>"));
        return /students\/act/.test(cell)
          ? "a closed account is offered a suspension button"
          : null;
      },
    },
    {
      view: "admin-students",
      label: "...and what it did is said back, deletion ruled out in words",
      locals: {
        ...studentsBase,
        done: "Unpaid Person is suspended and signed out everywhere. Nothing has been " +
              "deleted — letting them back in restores their homework, their scores " +
              "and their place in the class.",
      },
      expect: ["notice-ok", "Nothing has been deleted", "place in the class"],
    },
    {
      view: "admin-students",
      label: "a missing column is named, with the database it is missing from",
      locals: {
        ...studentsBase,
        dbState: {
          enabled: true,
          database: "u648779252_langnation",
          checked: ["intakes.status_auto", "intakes.meets_days", "lessons.generated"], probed: true,
          missing: ["intakes.meets_days", "lessons.generated"],
        },
      },
      // The database NAME matters as much as the columns: a migration
      // run against the right-looking name on the wrong database is
      // indistinguishable from one that failed, unless the site says
      // which one it actually opened.
      expect: [
        "u648779252_langnation", "2 columns missing",
        "intakes.meets_days", "lessons.generated", "then restart",
      ],
    },
    {
      view: "admin-students",
      label: "...and when nothing is missing it says so rather than going quiet",
      locals: {
        ...studentsBase,
        dbState: {
          enabled: true,
          database: "u648779252_langnation",
          checked: ["intakes.status_auto", "intakes.meets_days", "lessons.generated"], probed: true,
          missing: [],
        },
      },
      // Silence would be indistinguishable from the panel being broken.
      expect: ["all 3 optional columns present"],
      reject: ["columns missing"],
    },
    {
      view: "admin-students",
      label: "...and says plainly when there is no database at all",
      locals: {
        ...studentsBase,
        dbState: { enabled: false, database: null, checked: [], missing: [], probed: false },
      },
      expect: ["not configured"],
    },
    {
      view: "admin-students",
      label: "...and distinguishes a probe that never ran from one that found nothing",
      locals: {
        ...studentsBase,
        // enabled, but start-up did not reach probeColumns. Days were
        // spent treating this as a missing migration when it was a
        // boot that threw before the schema was ever read.
        dbState: { enabled: true, database: null, checked: [], missing: [], probed: false },
      },
      expect: ["schema never checked", "start-up did not finish"],
      reject: ["optional columns present"],
    }
  );
}

cases.push(
  {
    view: "admin-payments",
    label: "the four figures agree with the rows under them",
    locals: (() => {
      const billing = require("../lib/billing");
      const on = "2026-10-02";
      const inv = (total, paid, due, extra) => ({
        total, paid_amount: paid, due_on: due, kind: "invoice",
        status: paid === "0.00" ? "issued" : (paid === total ? "paid" : "part_paid"),
        currency: "EUR", ...extra,
      });
      const mk = (student, ref, label, rows) => ({
        enrolmentId: rows.length, studentId: 1, student, ref, label,
        batch: "LNIKB01", currency: "EUR", ...billing.summarise(rows, on),
      });
      const rows = [
        mk("Anita Sharma", "LNS0007", "Fast Track A1–B1", [
          inv("500.00", "500.00", "2026-08-01", { paid_on: "2026-08-01" }),
          inv("500.00", "200.00", "2026-09-01"),
        ]),
        mk("Rahul Verma", "LNS0008", "German Regular B1", [
          inv("1500.00", "1500.00", "2026-10-01", { paid_on: "2026-10-01" }),
        ]),
        mk("Neu Anfrage", "LNS0009", "German Regular A1", []),
      ];
      return {
        authed: true, dbOk: true, rows,
        totals: billing.tally(rows, on),
        filter: "all", q: "",
        counts: Object.fromEntries(
          Object.keys(billing.FILTERS).map((k) => [k, rows.filter(billing.FILTERS[k]).length])
        ),
        label: billing.SUMMARY_STATE, done: null, problem: null,
      };
    })(),
    /* 300 overdue on Anita, 1,500 settled this month on Rahul, and the
       student with no invoices still listed -- a course nobody has
       billed for is the most useful row on this page, and a query
       that only returned invoices would hide exactly the people the
       office needs to chase. */
    expect: ["Anita Sharma", "Neu Anfrage", "€300.00", "€1,500.00",
             "outstanding", "overdue", "settled this month",
             "Nothing billed yet", "Set up"],
    reject: ["NaN", "undefined", "€0.00</span>\n          <span class=\"ad-tile-l\">overdue"],
  },
  {
    view: "admin-payment",
    label: "a preview can be edited and adds up before anything is written",
    locals: (() => {
      const billing = require("../lib/billing");
      const courses = [{ id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: null }];
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses, combined: null, canSetUp: true, anyBilled: false, pick: "all", one: null,
        scope: null, everything: { total: 0, paid: 0, owed: 0 },
        history: [], suggested: 75000, total: 75000, n: 3,
        preview: billing.split(75000, 3).map((a, i) => ({
          amount: a, due_on: billing.monthly("2026-11-01", 3)[i],
        })),
        trail: [],
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    expect: ["Set up a payment plan", "3 instalments", "Create as drafts",
             "250.00", "data-plan-total", "All courses (1)",
             /* What it costs, before anything is raised. Three zeros
                under Billed/Paid/Remaining is true and useless. */
             "Course fee", "€750.00",
             /* And the other half of the question: they already paid. */
             "Already paid in full", "Record as paid in full"],
    /* There is no separate first-due-date box any more: every row has
       its own, and two places to set the same thing is one place to
       set it wrongly. Nothing is issued, so nothing may offer to take
       money for it. */
    reject: ["First due date", "Record a payment", "Issue ", "NaN", "250.0000"],
  },
  {
    view: "admin-payment",
    label: "one plan across two courses says which course each part is for",
    locals: (() => {
      const billing = require("../lib/billing");
      const inv = (id, no, total, paid, due, status) => ({
        id, number: `2026-020${no}`, kind: "invoice", currency: "EUR",
        total, paid_amount: paid, status, due_on: due,
        instalment_no: no, instalment_of: 2, enrolment_id: null,
        lines: [
          { description: `Fast Track (LNIKB02) — instalment ${no} of 2`, amount: 37500 },
          { description: `German Regular B1 — instalment ${no} of 2`, amount: 62500 },
        ],
      });
      const rows = [
        inv(1, 1, "1000.00", "1000.00", "2026-09-01", "paid"),
        inv(2, 2, "1000.00", "0.00", "2026-10-10", "issued"),
      ];
      const combined = {
        enrolmentId: null, label: "All courses", combined: true, currency: "EUR",
        ...billing.summarise(rows, "2026-10-02"),
      };
      combined.parts.forEach((p, i) => { p.lines = rows[i].lines; });
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses: [
          { id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: null },
          { id: 9, title: "German Regular B1", batch: null, status: "active", fee: 125000, plan: null },
        ],
        combined, canSetUp: false, anyBilled: true, pick: "all", one: null, scope: combined,
        everything: { total: combined.total, paid: combined.paid, owed: combined.owed },
        history: [{ received_on: "2026-09-01", amount: "1000.00", currency: "EUR",
                    method: "bank_transfer", number: "2026-0201", reference: "E2E-1",
                    enrolment_id: null }],
        suggested: 200000, total: 200000, n: 0, preview: null,
        trail: [],
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    /* Two courses, two thousand, and each instalment saying how much
       of it belongs to which course -- that is what keeps the money
       attributable to the course that earned it. */
    expect: ["All courses (2)", "Fast Track", "German Regular B1",
             "€2,000.00", "€1,000.00", "€375.00", "€625.00",
             "Record a payment", "Payment history"],
    /* Already billed, so no setup form. Cash and bank transfer only. */
    reject: ["Set up a payment plan", "NaN", ">Card<", ">SEPA direct debit<"],
  },
  {
    view: "admin-payment",
    label: "one course of two, with the other left alone",
    locals: (() => {
      const billing = require("../lib/billing");
      const rows = [{
        id: 1, number: "2026-0301", kind: "invoice", currency: "EUR",
        total: "750.00", paid_amount: "300.00", status: "part_paid",
        due_on: "2026-09-01", instalment_no: 1, instalment_of: 1, enrolment_id: 7,
      }];
      const mine = { enrolmentId: 7, label: "Fast Track", currency: "EUR",
                     ...billing.summarise(rows, "2026-10-02") };
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses: [
          { id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: mine },
          { id: 9, title: "German Regular B1", batch: null, status: "active", fee: 125000, plan: null },
        ],
        combined: null, canSetUp: false, anyBilled: true, pick: "7",
        one: { id: 7, title: "Fast Track", batch: "LNIKB02", fee: 75000, plan: mine },
        scope: mine,
        everything: { total: mine.total, paid: mine.paid, owed: mine.owed },
        /* A Date, not a string, because that is what mysql2 hands
           back for a DATE column -- and the fixtures passing strings
           is why the whole payment history rendered "Invalid Date"
           in production while this suite was green. */
        history: [{ received_on: new Date(2026, 7, 20), amount: "300.00", currency: "EUR",
                    method: "cash", number: "2026-0301", reference: null, enrolment_id: 7 }],
        suggested: 75000, total: 75000, n: 0, preview: null,
        trail: [],
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    expect: ["Fast Track", "€450.00 owed", "Overdue", "Cash",
             /* The date has to survive arriving as a Date object. */
             "20 Aug 2026"],
    /* The other course's money must not appear here. 2,000 or 1,250
       would mean the two accounts had been added together, which is
       the one thing a per-course view must never do. */
    reject: ["€2,000.00", "€1,250.00", "NaN", "By course", "Invalid Date"],
  },
  {
    view: "admin-payment",
    label: "a reversed payment stays on the record, with the reason",
    locals: (() => {
      const billing = require("../lib/billing");
      const rows = [{
        id: 1, number: "2026-0401", kind: "invoice", currency: "EUR",
        total: "750.00", paid_amount: "0.00", status: "issued",
        due_on: "2026-09-01", instalment_no: 1, instalment_of: 1, enrolment_id: 7,
      }];
      const mine = { enrolmentId: 7, label: "Fast Track", currency: "EUR",
                     ...billing.summarise(rows, "2026-10-02") };
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses: [{ id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: mine }],
        combined: null, canSetUp: false, anyBilled: true, pick: "7",
        one: { id: 7, title: "Fast Track", batch: "LNIKB02", fee: 75000, plan: mine },
        scope: mine,
        everything: { total: mine.total, paid: mine.paid, owed: mine.owed },
        history: [
          /* The original, withdrawn — struck through, not removed. */
          { id: 11, received_on: "2026-09-02", amount: "750.00", currency: "EUR",
            method: "cash", number: "2026-0401", reference: "R-1",
            enrolment_id: 7, reverses_id: null, reversed_by: 12, note: null },
          /* And the row that withdrew it, carrying the reason. */
          { id: 12, received_on: "2026-10-02", amount: "-750.00", currency: "EUR",
            method: "cash", number: "2026-0401", reference: null,
            enrolment_id: 7, reverses_id: 11, reversed_by: null,
            note: "Entered against the wrong student" },
        ],
        trail: [
          { id: 2, action: "payment.reversed", entity_id: 1, created_at: "2026-10-02T09:15:00Z",
            detail: JSON.stringify({ payment_id: 11, amount: "750.00",
                                     reason: "Entered against the wrong student" }) },
          { id: 1, action: "payment.recorded", entity_id: 1, created_at: "2026-09-02T11:02:00Z",
            detail: JSON.stringify({ amount: "750.00", method: "cash",
                                     received_on: "2026-09-02", reference: "R-1" }) },
        ],
        suggested: 75000, total: 75000, n: 0, preview: null,
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    expect: [
      "Payment history", "Reversed", "Put back",
      "Entered against the wrong student",
      /* The changes list, read out of audit_log. */
      "Changes", "Payment recorded", "Payment reversed",
      /* And the limitation said plainly rather than implied. The
         phrase is one the template keeps on a single line; the
         sentence around it wraps. */
      "Individual logins would fix that",
      /* The invoice is owed again, because the balance is recomputed
         from the payments rather than left where it was. */
      "€750.00",
    ],
    /* A reversed payment must never be offered for reversal again --
       twice would take 1,500 off a 750 account, which is the hole the
       whole arrangement exists to close. */
    reject: ["NaN", "undefined"],
  },
  {
    view: "admin-payment",
    label: "a drafted plan is visible to the office, with a way out of it",
    locals: (() => {
      const billing = require("../lib/billing");
      /* The exact state somebody got stuck in: a plan drafted and
         never issued. The office's read excluded drafts, so this card
         could not render, the setup form came back as though nothing
         existed, and drafting again was refused by a guard pointing
         at invoices nobody could see. */
      const rows = [1, 2, 3].map((no) => ({
        id: no, number: null, kind: "invoice", currency: "EUR",
        total: "250.00", paid_amount: "0.00", status: "draft",
        due_on: `2026-1${no}-01`, instalment_no: no, instalment_of: 3, enrolment_id: 7,
      }));
      const mine = { enrolmentId: 7, label: "Fast Track", currency: "EUR",
                     ...billing.summarise(rows, "2026-10-02") };
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses: [{ id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: mine }],
        combined: null, canSetUp: false, anyBilled: true, pick: "7",
        one: { id: 7, title: "Fast Track", batch: "LNIKB02", fee: 75000, plan: mine },
        scope: mine,
        everything: { total: 0, paid: 0, owed: 0 },
        history: [], trail: [],
        suggested: 75000, total: 75000, n: 0, preview: null,
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    expect: [
      "Drafted, not yet issued", "Issue 3 invoices", "Discard and start again",
      "The student cannot see these", "Instalment 1 of 3", "€250.00",
    ],
    /* And NOT the setup form, which is what made the page look empty
       while the guard said otherwise. Nothing is issued, so there is
       nothing to take money against either. */
    reject: ["Set up a payment plan", "Already paid in full", "Record a payment", "NaN"],
  },
  {
    view: "admin-payment",
    label: "billing one course does not close the door on the others",
    locals: (() => {
      const billing = require("../lib/billing");
      /* The bug this guards: "billed" asked whether the STUDENT had
         ever been invoiced, so raising invoices for one course made
         the setup form vanish from the other two — which read as the
         page deciding they were finished when nothing had been billed
         for them at all. */
      const done = [{
        id: 1, number: "2026-0001", kind: "invoice", currency: "EUR",
        total: "750.00", paid_amount: "0.00", status: "issued",
        due_on: "2026-10-02", instalment_no: 1, instalment_of: 1, enrolment_id: 7,
      }];
      const billedPlan = { enrolmentId: 7, label: "Fast Track", currency: "EUR",
                           ...billing.summarise(done, "2026-10-02") };
      return {
        authed: true, dbOk: true,
        who: { id: 3, name: "Anita Sharma", email: "a@x.test", student_ref: "LNS0007" },
        courses: [
          { id: 7, title: "Fast Track", batch: "LNIKB02", status: "active", fee: 75000, plan: billedPlan },
          { id: 9, title: "German Regular A2", batch: "LNRKB02", status: "active", fee: 30000, plan: null },
        ],
        combined: null,
        /* Looking at the one that has NOT been billed. */
        canSetUp: true, anyBilled: true, pick: "9",
        one: { id: 9, title: "German Regular A2", batch: "LNRKB02", fee: 30000, plan: null },
        scope: null,
        everything: { total: 75000, paid: 0, owed: 75000 },
        history: [], trail: [],
        suggested: 30000, total: 30000, n: 0, preview: null,
        methods: billing.METHODS, label: billing.SUMMARY_STATE,
        stateLabel: billing.STATE_LABEL, done: null, problem: null,
      };
    })(),
    expect: [
      "German Regular A2",
      /* The whole point: this course can still be set up. */
      "Set up a payment plan", "Already paid in full",
      "€300.00",
      /* And the other course's money is reported as the other
         course's, not folded into this one. */
      "Across all 2 courses", "€750.00",
    ],
    /* Nothing is billed against THIS course, so nothing may offer to
       issue or take money for it. */
    reject: ["Unpaid invoices", "Paid invoices", "Record a payment",
             "Drafted, not yet issued", "NaN"],
  },
  {
    view: "admin-invoice",
    label: "unpaid: bilingual, German formatting, and how to pay it",
    locals: (() => {
      const billing = require("../lib/billing");
      const head = { total: "900.00", paid_amount: "0.00", due_on: "2026-10-15",
                     status: "issued", kind: "invoice" };
      return {
        authed: true, plan: [],
        bill: Object.assign({
          id: 1, number: "LN-2026-000001", kind: "invoice", currency: "EUR",
          student_id: 3, student_name: "Max Mustermann", student_ref: "LNS0042",
          course_title: "Deutsch-Intensivkurs A1-B1", batch_code: null,
          seller_name: null, seller_address: null, seller_tax_id: null,
          billing_name: "Max Mustermann", billing_address: "Musterstraße 12, Magdeburg, Germany",
          tax_note: null,
          issued_on: "2026-10-02", due_on: "2026-10-15", paid_on: null,
          service_from: null, service_to: null,
          total: "900.00", paid_amount: "0.00", status: "issued",
          totalCents: 90000, paidCents: 0, owedCents: 90000,
          items: [{ description: "Deutsch-Intensivkurs A1-B1 · German Intensive Course A1-B1",
                    quantity: 1, amountCents: 90000 }],
          payments: [],
        }, billing.stateOf(head, "2026-10-02")),
        methods: billing.METHODS, stateLabel: billing.STATE_LABEL,
      };
    })(),
    expect: [
      "RECHNUNG", "INVOICE", "OFFEN / UNPAID",
      "Rechnungssteller", "Rechnung an", "Max Mustermann", "LNS0042",
      "Rechnungsnummer", "LN-2026-000001",
      /* German formatting throughout: 900,00 and 15.10.2026. */
      "900,00", "02.10.2026", "15.10.2026",
      "Leistungen", "Gesamtbetrag", "Bereits bezahlt", "Offener Betrag",
      "Zahlungsinformation", "Verwendungszweck",
      /* Unconfigured, so it says so rather than inventing an IBAN. */
      "Not ready to send", "MUSTER / SAMPLE",
    ],
    /* Nothing is paid, so nothing may thank anybody for paying, and
       no invented bank details may appear. */
    reject: ["BEZAHLT / PAID", "Vielen Dank", "Invalid Date", "NaN", "DE00"],
  },
  {
    view: "admin-invoice",
    label: "paid in cash: no transfer instructions, and the plan it belongs to",
    locals: (() => {
      const billing = require("../lib/billing");
      const head = { total: "300.00", paid_amount: "300.00", due_on: "2026-10-01",
                     status: "paid", kind: "invoice" };
      const sched = [
        { id: 1, instalment_no: 1, total: 30000, paid: 30000, owed: 0, state: "paid",
          partial: false, due: "2026-10-01", paid_on: "2026-10-01" },
        { id: 2, instalment_no: 2, total: 30000, paid: 0, owed: 30000, state: "due",
          partial: false, due: "2026-11-01", paid_on: null },
        { id: 3, instalment_no: 3, total: 30000, paid: 0, owed: 30000, state: "upcoming",
          partial: false, due: "2026-12-01", paid_on: null },
      ];
      return {
        authed: true, plan: sched,
        bill: Object.assign({
          id: 1, number: "LN-2026-000002", kind: "invoice", currency: "EUR",
          student_id: 3, student_name: "Max Mustermann", student_ref: "LNS0042",
          course_title: "Deutsch-Intensivkurs A1-B1", batch_code: null,
          seller_name: "LangNation Education", seller_address: "Musterweg 1, 39104 Magdeburg, Germany",
          seller_tax_id: "DE000000000", billing_name: "Max Mustermann",
          billing_address: "Musterstraße 12, Magdeburg, Germany", tax_note: null,
          issued_on: "2026-10-01", due_on: "2026-10-01", paid_on: "2026-10-01",
          service_from: null, service_to: null,
          total: "300.00", paid_amount: "300.00", status: "paid",
          totalCents: 30000, paidCents: 30000, owedCents: 0,
          items: [{ description: "Deutsch-Intensivkurs A1-B1 — Rate 1 von 3",
                    quantity: 1, amountCents: 30000 }],
          payments: [{ id: 1, amountCents: 30000, method: "cash", reference: null,
                       received_on: "2026-10-01", note: null,
                       reverses_id: null, reversed_by: null }],
        }, billing.stateOf(head, "2026-10-02")),
        methods: billing.METHODS, stateLabel: billing.STATE_LABEL,
      };
    })(),
    expect: [
      "BEZAHLT / PAID", "Zahlungsart", "Barzahlung / Cash",
      "Vollständig bezahlt", "Vielen Dank",
      /* The schedule, so one instalment is never read as the fee. */
      "Zahlungsplan", "01.11.2026", "01.12.2026",
      "300,00",
      /* The schedule has its own vocabulary: a future instalment is
         ANSTEHEND, not "unpaid" -- calling it unpaid says nothing
         about whether anybody is late. */
      "OFFEN / PENDING", "ANSTEHEND / UPCOMING",
    ],
    /* Settled, and in cash. Printing "please transfer" under it is the
       one line that makes somebody pay twice. */
    reject: ["Bitte überweisen", "Please transfer", "Verwendungszweck",
             "OFFEN / UNPAID", "Invalid Date", "NaN"],
    /* The invoice first and whole -- totals, then how to pay it -- and
       the schedule after it, on its own sheet when printed. The plan
       used to sit between the two, which left "Zahlungsinformation" as
       a heading at the foot of one page with its IBAN on the next. */
    order: ["Gesamtbetrag", "Offener Betrag", "Zahlungsinformation",
            "inv-plan", "Zahlungsplan"],
  },
  {
    view: "admin-students",
    label: "every step is shown, and the closed account is not pretended reachable",
    locals: {
      rows: everyone,
      counts: people.counts(everyone),
      stages: people.STAGES,
      stage: "",
      q: "",
      dbOk: true,
      authed: true,
    },
    expect: [
      "Neu Anfrage", "Warte Person", "Anita Sharma", "LNS0001",
      "Asked", "Approved", "Created", "Closed",
      "— address removed —",
      // The tile counts must match the rows beneath them.
      "asked for an account", "approved, not signed up", "accounts created",
    ],
    // A closed account's tombstone address must not become a mailto.
    reject: ["mailto:deleted-9@removed.invalid"],
  },
  {
    view: "admin-students",
    label: "every address has a copy button",
    locals: {
      rows: everyone, counts: people.counts(everyone), stages: people.STAGES,
      stage: "", q: "", dbOk: true, authed: true,
    },
    expect: [
      'data-copy="anita@example.com"',
      'aria-label="Copy anita@example.com"',
      // What was copied has to be announced, not just ticked.
      "data-copy-live",
    ],
    // A closed account's address is a tombstone; there is nothing
    // worth copying and it must not be offered.
    reject: ['data-copy="deleted-9@removed.invalid"'],
  },
  {
    view: "admin-students",
    label: "nobody at all",
    locals: {
      rows: [], counts: people.counts([]), stages: people.STAGES,
      stage: "", q: "", dbOk: true, authed: true,
    },
    expect: ["People appear here the moment they ask for an account"],
    reject: ["Nobody matches that"],
  },
  {
    view: "admin-students",
    label: "a filter that matches nothing says so differently",
    locals: {
      rows: [], counts: people.counts(everyone), stages: people.STAGES,
      stage: "active", q: "zzz", dbOk: true, authed: true,
    },
    expect: ["Nobody matches that"],
    reject: ["People appear here the moment"],
  }
);

cases.push(
  // The weekly pattern, and the form's duty not to offer what cannot be
  // kept.
  //
  // Found the hard way: the fields were drawn, filled in, submitted and
  // silently dropped, and the page came back empty with nothing said.
  // fromBody refuses to write a column the database does not have -- it
  // has to, or the UPDATE names a missing column and saving the whole
  // batch fails -- but refusing QUIETLY means the office types a
  // timetable twice and watches it vanish twice.
  {
    view: "rootadmin/batch",
    label: "the weekly pattern is offered when the column is there",
    locals: {
      ...batchBase,
      batch: { ...batchBase.batch, meets_days: "1,2,3,4,5",
               meets_from: "09:00:00", meets_minutes: 120 },
    },
    expect: [
      'name="meets_shown"', 'name="meets_days" value="1"',
      'name="meets_from"', 'name="meets_until"', "Monday to Friday",
    ],
  },
  {
    view: "rootadmin/batch",
    label: "...and replaced by an instruction when it is not",
    locals: { ...batchBase, canPattern: false },
    // An input the database cannot keep is worse than no input at all:
    // it looks like it worked.
    expect: ["25_timetable.sql", "Everything else on this page saves normally"],
    reject: ['name="meets_shown"', 'name="meets_days"', 'name="meets_from"'],
  },
  {
    view: "rootadmin/batch",
    label: "the picker lists candidates and carries what sorting needs",
    locals: batchBase,
    expect: [
      "data-student-picker",
      "data-student-sort",
      // Every option needs both keys or the reorder silently does nothing.
      'data-created="',
      'data-name="',
      "LNS0009", "LNS0002",
      // The office's words, not the database's.
      "Not started", "Completed",
    ],
    // Somebody already on the batch must not be offered again.
    reject: ['value="LNS0001"'],
  },
  {
    view: "rootadmin/batch",
    label: "everyone is already enrolled",
    locals: { ...batchBase, candidates: [] },
    expect: ["Everybody with an account is already on this batch."],
    reject: ["No student accounts yet"],
  },
  {
    view: "rootadmin/batch",
    label: "no student accounts at all",
    locals: { ...batchBase, candidates: [], roster: [] },
    expect: ["No student accounts yet"],
    reject: ["Everybody with an account"],
  },
  {
    view: "rootadmin/batch",
    label: "destructive controls are gated, reversible ones are not",
    locals: batchBase,
    expect: [
      'data-confirm-delete="batch LNIKB01"',
      "data-confirm-delete=\"Sheikh Seraj's place on LNIKB01\"",
      // Status changes must opt out of the gate.
      'value="completed" type="submit" data-confirm-skip',
    ],
  },
  {
    view: "rootadmin/batch",
    label: "a new batch has no roster, and no code to type",
    locals: { ...batchBase, batch: null, isNew: true, roster: [], candidates: [], suggestedCode: "LNIKB02" },
    expect: ["assigned when you save", "Students are added once the batch exists"],
    reject: ["data-student-picker", "Delete this batch"],
  },
  /* The code cannot be posted, on either form.
   *
   * This is the bug the whole change exists for. The field used to be
   * an editable box filled in with a suggestion, and asking for a
   * suggestion reserved nothing — so two tabs, or one form left open
   * while the course was changed, offered the same code twice and the
   * second save hit the unique key. The office was shown "a batch with
   * that code already exists" about a code it had never typed.
   *
   * A field with a name is a field a browser submits, so the absence
   * of the name is the fix and it is what is asserted. Not the
   * readonly attribute: readonly is a suggestion to a person, and the
   * point is that nothing reaches the server to be trusted.
   */
  {
    view: "rootadmin/batch",
    label: "the code on a new batch is not a field that can be posted",
    locals: { ...batchBase, batch: null, isNew: true, roster: [], candidates: [], suggestedCode: "LNIKB02" },
    reject: ['name="code"'],
  },
  {
    view: "rootadmin/batch",
    label: "...nor on one that already exists, where it is shown and fixed",
    locals: batchBase,
    expect: ["LNIKB01", "it cannot change"],
    reject: ['name="code"'],
  }
);

// ── Question reports ─────────────────────────────────────────────────
//
// The screen that catches "this answer is wrong". It has to survive a
// report with almost nothing in it — no email, no question text, an
// unknown kind — because the form asks for one sentence and nothing
// else, which is the whole reason people use it.

const KIND_LABEL = {
  wrong_answer: "wrong answer", typo: "typo", image: "picture",
  translation: "translation", other: "other",
};
const etHref = (r) =>
  String(r.question_id || "").startsWith("general-")
    ? "/einbuergerungstest/fragen?seite=8#frage-226"
    : "/einbuergerungstest/fragen?land=bayern#frage-3";

cases.push(
  {
    view: "admin-et-reports",
    label: "a full report, with the repeat count called out",
    locals: {
      rows: [{
        id: 1, question_id: "general-226", question_no: 226,
        question: "Welches Land ist kein Mitglied der Europäischen Union?",
        kind: "wrong_answer",
        message: "Die richtige Antwort müsste die Schweiz sein.",
        email: "lerner@example.com", lang: "de", status: "open",
        admin_note: null, same_question: 2,
        created_at: "2026-09-10T08:00:00Z", updated_at: "2026-09-10T08:00:00Z",
      }],
      counts: { open: 1, done: 0, dismissed: 0 },
      status: "open", KIND_LABEL, catalogueHref: etHref,
      notice: null, dbOk: true, authed: true,
    },
    expect: [
      "Frage 226", "general-226", "wrong answer",
      "2 more on this question",
      "Die richtige Antwort müsste die Schweiz sein.",
      'data-copy="lerner@example.com"',
      "read in German",
      // Acting on one has to be possible from the list itself.
      'value="done"', 'value="dismissed"',
    ],
  },
  {
    view: "admin-et-reports",
    label: "a bare report does not render blanks or [object Object]",
    locals: {
      rows: [{
        id: 2, question_id: "bayern-3", question_no: null, question: null,
        kind: "other", message: "Bild passt nicht.", email: null,
        lang: "en", status: "open", admin_note: null, same_question: 0,
        created_at: "2026-09-11T09:30:00Z", updated_at: "2026-09-11T09:30:00Z",
      }],
      counts: { open: 1, done: 0, dismissed: 0 },
      status: "open", KIND_LABEL, catalogueHref: etHref,
      notice: null, dbOk: true, authed: true,
    },
    expect: ["Frage ?", "No reply address given", "read in English"],
    // Nothing to copy, so no copy button pretending there is.
    reject: ["ad-copy"],
  },
  {
    view: "admin-et-reports",
    label: "an empty queue and an unreachable database do not look alike",
    locals: {
      rows: [], counts: { open: 0, done: 0, dismissed: 0 },
      status: "open", KIND_LABEL, catalogueHref: etHref,
      notice: null, dbOk: false, authed: true,
    },
    expect: ["The database is unreachable", "not the same as there being none"],
  },
);

// ── The placement test's "who are you" step ──────────────────────────
//
// A signed-in student had to type their name, email, phone, country and
// address into a site they were already logged into. The step is now
// prefilled from the account — and while that was being fixed, two
// older faults on the same form turned up: the address was read by the
// template and never by the route, so every one that was typed went in
// the bin, and a rejected form came back with the phone blank and the
// dialling code reset to Germany.
{
  const countries = require("../content/countries.json");

  cases.push(
    {
      view: "placement/details",
      label: "prefilled from the account, and it says so",
      locals: {
        ...publicBase("en", "/placement-test/details"),
        countries,
        consentToken: "tok",
        errors: {},
        values: {
          prefilled: true,
          name: "Clara Buttontest",
          email: "clara@example.com",
          country: "India",
          address: "12 MG Road, Bengaluru",
          phone_cc: "91",
          phone_number: "9876543210",
        },
      },
      expect: [
        "Clara Buttontest", "clara@example.com", "12 MG Road, Bengaluru",
        'value="9876543210"',
        // India's code chosen, not the German default.
        '<option value="91" selected>',
        "Filled in from your account",
      ],
      reject: ['<option value="49" selected>'],
    },
    {
      view: "placement/details",
      label: "a visitor gets an empty form and no note",
      locals: {
        ...publicBase("en", "/placement-test/details"),
        countries, consentToken: "tok", errors: {}, values: {},
      },
      expect: [
        // Germany stays the default when nothing is known.
        '<option value="49" selected>',
      ],
      reject: ["Filled in from your account"],
    },
    {
      view: "placement/details",
      label: "a rejected form keeps the phone it was given",
      locals: {
        ...publicBase("en", "/placement-test/details"),
        countries,
        consentToken: "tok",
        errors: { email: "invalid" },
        values: {
          name: "Ravi", email: "not-an-email", country: "India",
          address: "", phone_cc: "91", phone_number: "9876543210",
        },
      },
      expect: ['value="9876543210"', '<option value="91" selected>'],
    },
  );
}

// ── The shared terms gate, from the student side ─────────────────────
//
// A student creating an account and a teacher creating one now meet
// exactly the same control, so it is worth checking from both. What
// matters most is the fallback: the link has to be a real link to a
// real page, because a button that only works with JavaScript leaves
// somebody no way to read what they are agreeing to.
{
  const countries = require("../content/countries.json");

  cases.push(
    {
      view: "portal/invite",
      label: "the terms open in a dialog, and still work without one",
      locals: {
        invite: { id: 1, name: "Anita Sharma", email: "anita@example.com", phone: null, country: "India" },
        token: "tok-abc",
        errors: {},
        ...gateTerms("Terms and Conditions", "/student-terms-and-conditions"),
      },
      expect: [
        "Anita Sharma", 'name="accept"', "data-terms-gate", "data-terms-dialog",
        "data-terms-accept", "Scroll to the end to accept",
        // The fallback: a real href, not a scripted button.
        'href="/student-terms-and-conditions"',
        "\u00a7 1 Scope",
      ],
      reject: ["data-open-terms></button>"],
    },
    {
      view: "portal/invite",
      label: "no terms text still leaves a working link",
      locals: {
        invite: { id: 1, name: "Anita Sharma", email: "anita@example.com", phone: null, country: "India" },
        token: "tok-abc",
        errors: {},
        termsTitle: "Terms and Conditions",
        termsPath: "/student-terms-and-conditions",
        termsHtml: null,
      },
      // The database of pages could be empty on a fresh install. The box
      // and the link must still be there; only the dialog goes.
      expect: ['name="accept"', 'href="/student-terms-and-conditions"'],
      reject: ["data-terms-dialog"],
    },
    {
      view: "portal/request",
      label: "the request form uses the same gate",
      locals: {
        values: {},
        countries,
        error: null,
        ...gateTerms("Terms and Conditions", "/student-terms-and-conditions"),
      },
      expect: [
        "data-terms-gate", 'id="accept"', 'id="err-accept"',
        "data-terms-dialog", 'href="/student-terms-and-conditions"',
      ],
      // The page carried its own copy of all this in an inline script.
      // Two copies drift; this is the one that must be gone.
      reject: ["data-terms-scroll\">\n      <%"],
    },
  );
}

// ── Teacher portal pages ─────────────────────────────────────────────
{
  const batches = [batchRow()];

  // Everything routes/teacher.js hands the schedule page beyond the
  // shell. Without these the page renders in the harness and nowhere
  // else -- or, worse, renders here while throwing in production.
  // 07:00 UTC is 09:00 in Berlin in summer, which is what every page,
  // every email and the classroom itself call it.
  const lessonRow = (over = {}) => Object.assign({
    id: 31, seq: 1, title: "Lesson 1", starts_at: "2026-09-16T07:00:00Z",
    minutes: 120, status: "scheduled", meeting_url: null, notes: null,
    moved_from: null, change_note: null,
    intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
    batch_meeting_url: "https://meet.example.com/b2",
    course_title: "German B2", level: "B2",
  }, over);

  // The attendance chart on the teacher's own dashboard.
  //
  // The same partial the office uses, given this teacher's batches
  // instead of a chosen list. It answers a different question from
  // the "Worth a message" list below it: that names students who have
  // already slipped, this shows a whole batch sliding, which happens
  // weeks earlier and belongs to no one student.
  {
    const attendance = require("../lib/attendance");
    const series = [
      { intake_id: 12, batch_code: "B2-2026-04", course_title: "German B2", day: "2026-09-07", present: 9, late: 1, absent: 0, excused: 0 },
      { intake_id: 12, batch_code: "B2-2026-04", course_title: "German B2", day: "2026-09-14", present: 7, late: 1, absent: 2, excused: 0 },
      { intake_id: 12, batch_code: "B2-2026-04", course_title: "German B2", day: "2026-09-21", present: 5, late: 0, absent: 5, excused: 0 },
    ];
    const dash = (extra) => ({
      ...teachShell("dashboard"),
      stats: { batches: 1, running: 1, students: 10 }, next: null, roster: [],
      slipping: [], today: "2026-09-22", batches, notice: null,
      lineColour: attendance.lineColour,
      ...extra,
    });

    cases.push(
      {
        view: "teach/dashboard",
        label: "a teacher sees the shape of their own term",
        locals: dash({ chart: attendance.toChart(series) }),
        expect: [
          "How your classes are attending", "<svg", "B2-2026-04",
          // The two-thirds line, which is where a class stops being
          // healthy — the same threshold the bands use.
          "stroke-dasharray",
        ],
      },
      {
        view: "teach/dashboard",
        label: "...but two registers are not a trend, so nothing is drawn",
        locals: dash({ chart: attendance.toChart(series.slice(0, 2)) }),
        // Charting two points invites a conclusion the data cannot
        // carry.
        reject: ["How your classes are attending"],
      },
      {
        view: "teach/dashboard",
        label: "...and a teacher with no registers at all sees no chart",
        locals: dash({ chart: attendance.toChart([]) }),
        reject: ["How your classes are attending"],
      },
      /* The card for a class somebody handed you.

         "Happening now" carries Start the class and Attendance, and
         both of those are genuinely the stand-in's on that day. What is
         not theirs is the batch: its class list, its materials, its
         group chat and its head count all belong to the teacher whose
         batch it is, and the queries behind them return nothing for a
         stand-in anyway. A button that opens an empty page is worse
         than no button — it reads as the portal being broken rather
         than as the page not being yours. */
      {
        view: "teach/dashboard",
        label: "a class handed to you is the card, and only the class",
        locals: dash({
          chart: attendance.toChart([]),
          next: {
            when: "now",
            batch: {
              id: 12, code: "B2-2026-04", standing_in: 1,
              course_title: "German Regular B2", level: "B2",
              timezone: "Europe/Berlin", batch_status: "running",
              next_lesson_at: "2026-09-23T17:00:00Z",
              lesson_id: 88, minutes: 120,
              for_name: "Frau Weber", handover_note: "dentist",
              // Set on the batch, and still not offered: they are the
              // batch's, not this lesson's.
              meeting_url: "https://meet.example/b2",
              drive_url: "https://drive.example/b2",
              whatsapp_url: "https://chat.example/b2",
              // 17 rather than the 10 in the tiles above, so rejecting
              // it says something about this card and not about them.
              active_students: 17,
            },
          },
        }),
        expect: [
          "Happening now", "German Regular B2", "standing in",
          "Frau Weber", "dentist",
          // The two things a stand-in may actually do.
          "/teach/batch/12/start", "/teach/batch/12/register",
          // And the list they cannot see, said as what it is.
          "The class list belongs to",
        ],
        reject: [
          "Course materials", "Group chat",
          // The head count is the batch's roster, which is not theirs.
          "17 students",
          // And the panel below must not report an empty roster as
          // "nobody is enrolled" — a different fact, and an alarming
          // one to be told the evening before you teach.
          "Nobody is enrolled",
        ],
      },
      {
        view: "teach/dashboard",
        label: "...while your own class still carries all of it",
        locals: dash({
          chart: attendance.toChart([]),
          next: {
            when: "now",
            batch: {
              id: 12, code: "B2-2026-04",
              course_title: "German Regular B2", level: "B2",
              timezone: "Europe/Berlin", batch_status: "running",
              next_lesson_at: "2026-09-23T17:00:00Z",
              meeting_url: "https://meet.example/b2",
              drive_url: "https://drive.example/b2",
              whatsapp_url: "https://chat.example/b2",
              active_students: 17,
            },
          },
        }),
        expect: [
          "Class list", "Course materials", "Group chat", "17 students",
          "/teach/batch/12/start", "/teach/batch/12/register",
        ],
        reject: ["standing in"],
      }
    );
  }

  const scheduleExtras = {
    sched: require("../lib/schedule"),
    // Which batch the page is filtered to, or null for all of them.
    only: null,
    // Handing a class to another teacher, from the schedule.
    canHandOver: true,
    teacherOptions: [
      { id: 7, name: "Frau Weber", email: "weber@example.com" },
      { id: 8, name: "Frau Kanishka", email: "kanishka@example.com" },
    ],
    // How far forward and back the page looks. Two weeks is the
    // ordinary question; the rest is a link away.
    weeks: 2,
    // Which half of the page is on screen: both, next, or past.
    show: "both",
    weekChoices: [2, 4, 6],
    // Classes already taught. Empty is the ordinary state for a new
    // teacher; the cases that care override it.
    history: [],
    canChange: true,
    canEmail: true,
    noteMax: require("../lib/lessons").NOTE_MAX,
    cancelReasons: require("../lib/lessons").CANCEL_REASONS,
    notice: null,
    error: null,
  };

  cases.push(
    {
      view: "teach/login",
      label: "no way to create an account from here",
      locals: { teacher: null, values: {} },
      expect: [
        // The credentials go to the teacher endpoint, whichever side of
        // the switch somebody arrived from.
        'action="/teach/login"', 'name="email"', 'name="password"',
        "login-switch", 'href="/portal/login"',
        '<a href="/teach/login" aria-current="page">',
      ],
      // Teacher accounts are created by the office. A "register" link on
      // this page would be a way for anyone to ask for a class list.
      reject: ["/teach/register", "Create one"],
    },
    {
      view: "portal/login",
      label: "the same chooser, posting to the student endpoint",
      locals: { student: null, values: {} },
      expect: [
        'action="/portal/login"', "login-switch",
        'href="/teach/login"',
        '<a href="/portal/login" aria-current="page">',
        // Students can still ask for an account; teachers cannot.
        "/portal/register",
      ],
      // One form, one destination. A page offering both would be a
      // screen deciding what kind of person you are from your password.
      reject: ['action="/teach/login"'],
    },
    {
      view: "teach/invite",
      label: "the name comes from the account, not the form",
      locals: {
        teacher: null,
        invited: { id: 4, name: "Frau Weber", email: "weber@example.com", role: "teacher" },
        token: "tok-123",
        errors: {},
        ...gateTerms("Teacher Terms and Conditions", teachers.TERMS_PATH),
      },
      expect: [
        "Frau Weber", "weber@example.com", 'name="password"', "/teach/invite/tok-123",
        // The clauses the school would actually rely on, said before
        // the link rather than only behind it.
        'name="accept"', "/teacher-terms-and-conditions",
        "stays LangNation's", "lessons of your own",
        "return or delete all of it",
      ],
      // The email must be shown but never be an input: an intercepted
      // link that could be re-pointed at another address is an account
      // takeover, not an invitation.
      reject: ['name="email"'],
    },
    {
      view: "teach/invite",
      label: "a missed tick box is reported at the tick box",
      locals: {
        teacher: null,
        invited: { id: 4, name: "Frau Weber", email: "weber@example.com", role: "teacher" },
        token: "tok-123",
        errors: { accept: "Please accept the teacher terms to set up your account." },
        ...gateTerms("Teacher Terms and Conditions", teachers.TERMS_PATH),
      },
      expect: ["Please accept the teacher terms", 'aria-invalid="true"'],
    },
    {
      view: "teach/dashboard",
      label: "happening now, with all three links",
      locals: {
        ...teachShell("dashboard"),
        stats: teaching.summarise(batches),
        next: teaching.nextUp(batches),
        roster: rosterRows,
        batches,
      },
      expect: [
        "Happening now", "German Regular B2", "B2-2026-04",
        "Start the class", 'data-class-action="/teach/batch/12/start"', 'href="https://meet.example/b2"', 'target="_blank"',
        "Course materials", "https://drive.example/b2",
        "Group chat", "https://chat.example/b2",
        "Anita Sharma",
      ],
      reject: ['form method="post" action="/teach/batch/12/start"'],
    },
    {
      view: "teach/dashboard",
      label: "a link the office has not set is named, not faked",
      locals: (() => {
        const partial = [batchRow({ drive_url: null, whatsapp_url: "" })];
        return {
          ...teachShell("dashboard"),
          stats: teaching.summarise(partial),
          next: teaching.nextUp(partial),
          roster: rosterRows,
          batches: partial,
        };
      })(),
      expect: ["Start the class", "a materials folder", "a group chat"],
      // A button that opens nothing teaches people the portal is
      // decorative. The missing links are reported instead.
      reject: ["Course materials", ">Group chat<"],
    },
    {
      view: "teach/dashboard",
      label: "a new teacher with nothing assigned yet",
      locals: {
        ...teachShell("dashboard"),
        stats: teaching.summarise([]),
        next: null,
        roster: [],
        batches: [],
      },
      expect: ["No classes are assigned to you yet"],
      reject: ["Happening now", "Start the class"],
    },
    {
      view: "teach/batches",
      label: "the class link only while the batch is running",
      locals: (() => {
        const later = [batchRow({ id: 13, code: "A1-2026-09", batch_status: "planned" })];
        return { ...teachShell("batches"), batches: later, stats: teaching.summarise(later) };
      })(),
      expect: ["A1-2026-09", "Class list"],
      // Before a batch starts the room link usually opens an empty
      // meeting, which reads as a broken class rather than an early one.
      reject: ["Start the class"],
    },
    {
      view: "teach/batch",
      label: "the class list carries what a teacher needs to reach somebody",
      locals: {
        ...teachShell("batches"),
        batch: batchRow(),
        roster: rosterRows.map((r, i) => ({
          ...r,
          // One good attender and one who has stopped coming.
          attendance: i === 0
            ? { present: 8, late: 1, absent: 0, excused: 0, rate: 100, band: "good", concerning: false }
            : { present: 2, late: 0, absent: 4, excused: 1, rate: 33, band: "poor", concerning: true },
        })),
        materials: [],
        registers: [],
      },
      expect: [
        "Anita Sharma", "anita@example.com", "+91 98765 43210",
        "LNS0007", "Ravi Kumar", "withdrawn",
        // Attendance beside the name, and the poor one marked as poor.
        "100%", "33%", "sp-rate-poor", "sp-rate-good", "Attendance",
      ],
      // A teacher never needs a home address, and a page that shows
      // data nobody uses is data leaked without anybody noticing.
      reject: ["address", "Address"],
    },
    {
      view: "teach/batch",
      label: "a hidden material is shown to the teacher as hidden",
      locals: {
        ...teachShell("batches"),
        batch: batchRow(),
        roster: [],
        registers: [],
        materials: [
          { id: 1, title: "Week 1 worksheet", description: null, kind: "worksheet",
            original_name: "w1.pdf", mime: "application/pdf", bytes: 204800,
            visible: 0, created_at: "2026-04-07", intake_id: 12, batch_code: "B2-2026-04" },
        ],
      },
      expect: ["Week 1 worksheet", "hidden from students"],
    },
    // An empty timetable has two causes and they are not the same
    // message. "No classes in the next six weeks" told to a teacher
    // whose batch simply has no pattern set is a lie they could plan
    // around, and only one of the two is somebody's to fix.
    //
    // This page used to explain itself by saying the timetable did not
    // exist, which was true until lessons were generated from a
    // pattern. A stale reason on an empty page is worse than no reason,
    // so the wording is asserted rather than left to drift.
    {
      view: "teach/schedule",
      label: "an empty timetable blames the missing pattern, not the teacher",
      locals: { ...teachShell("schedule"), ...scheduleExtras, batches, lessons: [] },
      expect: ["no weekly pattern set", "My classes", "B2-2026-04"],
      reject: ["No classes in the next six weeks"],
      // The card naming what you teach used to be at the foot of the
      // page, under fifty-four lessons — the one thing that orients you,
      // reachable only by scrolling past everything that depends on it.
      order: ["My classes", "Lesson timetable"],
    },
    {
      view: "teach/schedule",
      label: "one batch can be shown on its own, and offers a way back",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({
          ...b, meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
        })),
        only: 12,
        lessons: [lessonRow()],
      },
      // A teacher with three classes was reading every lesson of all
      // three in one date-ordered list.
      expect: ["tl-picked", "showing", "Show all", "/teach/schedule?batch=12"],
    },
    {
      view: "teach/schedule",
      label: "...and with all of them, each offers to be shown alone",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({
          ...b, meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
        })),
        lessons: [lessonRow()],
      },
      expect: ["Only this", "/teach/schedule?batch=12"],
      reject: ["tl-picked", ">Show all<"],
    },
    // Either half can be put away.
    //
    // Two columns is right when you are planning and wrong when you are
    // concentrating, and a teacher working through the registers they
    // owe reads past a fortnight of future classes to get to them.
    //
    // Each of these asserts what is GONE as well as what is left. A
    // hide control that renders the link and shows both halves anyway
    // looks entirely correct in a screenshot.
    {
      view: "teach/schedule",
      label: "only what is coming, when the past half is hidden",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        show: "next",
        lessons: [lessonRow()],
        history: [{ ...lessonRow({ id: 90 }), taken: 0, present: 0, of: 0 }],
      },
      expect: ["Next 2 weeks", "Show both", "what is coming"],
      // The half that was hidden, and the offer to hide the half that
      // is left — there is nothing to fall back to.
      reject: ["Last 2 weeks"],
    },
    {
      view: "teach/schedule",
      label: "only what is behind, when the future half is hidden",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        show: "past",
        lessons: [lessonRow()],
        history: [{ ...lessonRow({ id: 90 }), taken: 0, present: 0, of: 0 }],
      },
      expect: ["Last 2 weeks", "Show both", "what is behind"],
      reject: ["Next 2 weeks"],
    },
    {
      view: "teach/schedule",
      label: "showing both says nothing about hiding having happened",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
        history: [{ ...lessonRow({ id: 90 }), taken: 0, present: 0, of: 0 }],
      },
      expect: ["Next 2 weeks", "Last 2 weeks", "tl-hide"],
      reject: ["Show both"],
    },
    {
      view: "teach/schedule",
      label: "widening the window keeps the half you hid hidden",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        show: "next", weeks: 2, only: 12,
        lessons: [lessonRow()],
      },
      // Every link out of this page carries all three settings, or the
      // next click quietly undoes one of the other two.
      expect: [
        "/teach/schedule?weeks=4&amp;show=next&amp;batch=12",
        "/teach/schedule?weeks=6&amp;show=next&amp;batch=12",
      ],
      reject: ['/teach/schedule?weeks=4&amp;batch=12"'],
    },
    {
      view: "teach/schedule",
      label: "the window can be widened, and carries the batch filter with it",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        only: 12, weeks: 2,
        lessons: [lessonRow()],
        history: [],
      },
      // Both halves named by the window rather than by a fixed number
      // of weeks nobody asked for.
      expect: [
        "Next 2 weeks",
        // &amp; because EJS escapes the attribute, which is correct
        // HTML and what a browser reads back as "&".
        "/teach/schedule?weeks=4&amp;batch=12",
        "/teach/schedule?weeks=6&amp;batch=12",
      ],
      // Changing how far to look must not quietly widen the filter.
      reject: ['/teach/schedule?weeks=4"'],
    },
    // The batch code as an identifier rather than grey text.
    //
    // LNIKB02 is unique, it is what goes on an invoice and a
    // certificate, and it is what somebody says out loud when they mean
    // one run of a course. Printed plain among the dates it was the
    // least noticeable thing on the line.
    // "Covering" is not a thing a batch can be any more.
    //
    // It marked a batch the office had named this teacher as standing
    // cover on, which gave them that batch for the whole term — its
    // class list, its materials, every register in it — because until a
    // single lesson could be handed to somebody, a batch with one
    // teacher was a batch nobody could cover.
    //
    // Cover is one handed lesson now, so there is nothing left for the
    // pill to mark. The row here still carries the old flag, because
    // the thing worth proving is that the page ignores it: a batch that
    // reached this list at all would mean the term-long access had come
    // back with it.
    {
      view: "teach/schedule",
      label: "no batch is shown as covered, whatever the row says",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: [
          { ...batchRow(), id: 12, code: "B2-2026-04", is_cover: 0 },
          { ...batchRow(), id: 13, code: "A2-2026-09", is_cover: 1,
            course_title: "German Regular A2" },
        ],
        lessons: [],
      },
      expect: ["B2-2026-04", "A2-2026-09"],
      reject: ["covering", "pill-cover"],
    },
    // Handing a class over, from the schedule rather than two pages in.
    {
      view: "teach/schedule",
      label: "a lesson can be handed to another teacher from the schedule",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
      },
      expect: [
        "/teach/lesson/31/handover",
        "Frau Weber", "Frau Kanishka",
        // The office being told is not a choice on the form.
        "The office is told",
      ],
    },
    {
      view: "teach/schedule",
      label: "...and once handed over it offers to be taken back",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow({ stand_in_id: 7, stand_in_name: "Frau Weber", standing_in: 0 })],
      },
      expect: ["/teach/lesson/31/takeback", "Handed to", "Frau Weber"],
      reject: ["/teach/lesson/31/handover"],
    },
    {
      view: "teach/schedule",
      label: "...and the stand-in is told it is theirs, not offered to give it away",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow({ stand_in_id: 7, stand_in_name: "Frau Weber", standing_in: 1 })],
      },
      // A stand-in who could pass it on would be lending access they
      // were lent.
      expect: ["You are standing in"],
      reject: ["/teach/lesson/31/takeback", "/teach/lesson/31/handover"],
    },
    {
      view: "teach/schedule",
      label: "the batch code is a pill, and filters to that batch",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
        history: [{
          id: 9, title: "Lesson 1", starts_at: "2026-09-16T07:00:00Z", day: "2026-09-16",
          status: "held", intake_id: 12, batch_code: "B2-2026-04",
          timezone: "Europe/Berlin", course_title: "German B2", level: "B2",
          marked: 9, attended: 9, absent: 0, by_teacher: 9, students: 9,
        }],
      },
      expect: [
        'class="pill pill-code" href="/teach/schedule?batch=12"',
        "B2-2026-04",
      ],
    },
    {
      view: "teach/schedule",
      label: "lessons are broken by the day they fall on",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [
          // Two on one day, one on the next. 07:00 UTC is 09:00 Berlin;
          // 17:00 UTC is 19:00. The heading must read in Berlin too.
          lessonRow({ id: 1, starts_at: "2026-09-16T07:00:00Z" }),
          lessonRow({ id: 2, starts_at: "2026-09-16T17:00:00Z", title: "Lesson 2" }),
          lessonRow({ id: 3, starts_at: "2026-09-17T07:00:00Z", title: "Lesson 3" }),
        ],
      },
      expect: ["Wednesday 16 September", "Thursday 17 September", "09:00", "19:00"],
      // One heading per day, not one per lesson.
      order: ["Wednesday 16 September", "Lesson 2", "Thursday 17 September"],
    },
    {
      view: "teach/schedule",
      label: "...and with a pattern set, says there is nothing coming up",
      locals: {
        ...teachShell("schedule"),
        ...scheduleExtras,
        batches: batches.map((b) => ({
          ...b, meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
        })),
        lessons: [],
      },
      expect: ["No classes in the next six weeks"],
      reject: ["no weekly pattern set"],
    },
    {
      view: "teach/schedule",
      label: "a generated timetable lists the lessons",
      locals: {
        ...teachShell("schedule"),
        ...scheduleExtras,
        batches: batches.map((b) => ({
          ...b, meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
        })),
        lessons: [
          { id: 1, seq: 1, title: "Lesson 1", starts_at: "2026-09-16T07:00:00Z",
            minutes: 120, status: "scheduled", meeting_url: null, notes: null,
            intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
            batch_meeting_url: "https://meet.example.com/b2", course_title: "German B2",
            level: "B2" },
        ],
      },
      // 07:00 UTC is 09:00 in Berlin, and Berlin is what the batch says.
      // Printing the server's zone here is the whole mistake the column
      // was made UTC to avoid.
      expect: ["Lesson 1", "09:00", "B2-2026-04", "Join"],
    },
    // Moving and cancelling.
    //
    // The date and time boxes are prefilled from the lesson's CURRENT
    // slot in the BATCH's timezone. Prefilling from the server's would
    // offer a teacher a 07:00 class that the student portal, the email
    // and the classroom all call 09:00 -- and it would look right,
    // which is the dangerous part.
    {
      view: "teach/schedule",
      label: "a lesson can be moved, prefilled in the batch's own timezone",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
      },
      expect: [
        '/teach/lesson/31/move', '/teach/lesson/31/cancel',
        'name="date" value="2026-09-16"', 'name="time" value="09:00"',
        'name="note"', 'name="notify"',
        "Email everyone on this batch",
      ],
    },
    {
      view: "teach/schedule",
      label: "a cancelled lesson offers to be put back, not cancelled again",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow({ status: "cancelled", change_note: "Teacher ill" })],
      },
      expect: ["/teach/lesson/31/restore", "Teacher ill", "Put it back on"],
      // No Join link into a room nobody is in, and no second cancel.
      reject: ["/teach/lesson/31/cancel", ">Join<"],
    },
    {
      view: "teach/schedule",
      label: "with no mail server the tick box is replaced by the truth",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras, canEmail: false,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
      },
      // An inviting tick box that silently does nothing is worse than
      // no tick box.
      expect: ["No mail server is set up", "still shows in every student"],
      reject: ['name="notify"'],
    },
    {
      view: "teach/schedule",
      label: "before migration 25 the controls are not offered at all",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras, canChange: false,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow()],
      },
      // Buttons that would every one of them fail are worse than none.
      expect: ["Lesson 1"],
      reject: ["/teach/lesson/31/move", "Change this class"],
    },
    {
      view: "teach/schedule",
      label: "a moved lesson says where it came from",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras,
        batches: batches.map((b) => ({ ...b, meets_days: "1,2,3,4,5" })),
        lessons: [lessonRow({
          starts_at: "2026-09-18T07:00:00Z",
          moved_from: "2026-09-17T07:00:00Z",
          change_note: "Public holiday",
        })],
      },
      expect: ["Moved from", "Thu", "Public holiday"],
    },
    // The pending-registers banner, in each of its three tones. They
    // are genuinely different messages and only one of them is bad
    // news, so the wording is asserted rather than left to drift into
    // scolding a teacher for this week's ordinary work.
    {
      view: "teach/dashboard",
      label: "a register due this week is a reminder, not a telling-off",
      locals: {
        ...teachShell("dashboard"),
        stats: { batches: 1, running: 1, students: 5 }, next: null, roster: [],
        slipping: [], today: "2026-09-22", batches, notice: null,
        pending: [{
          lesson_id: 81, intake_id: 12, batch_code: "LNRKB02", course_title: "German B2",
          students: 5, on: "2026-09-21", due: "2026-09-27",
          overdue: false, daysLate: 0, escalated: false,
        }],
        pendingSummary: {
          tone: "due", count: 1, due: "2026-09-27",
          text: "Attendance is pending for 1 class. It is due by Sunday.",
        },
      },
      // A link straight to that date's register: a reminder you have to
      // go and act on somewhere else is a reminder that gets dismissed.
      expect: [
        "Attendance pending", "due by Sunday",
        "/teach/batch/12/register?date=2026-09-21", "Take it now",
        "tl-owed-due",
      ],
    },
    {
      view: "teach/dashboard",
      label: "...and once the office has been told, the teacher is told that too",
      locals: {
        ...teachShell("dashboard"),
        stats: { batches: 1, running: 1, students: 5 }, next: null, roster: [],
        slipping: [], today: "2026-09-22", batches, notice: null,
        pending: [{
          lesson_id: 81, intake_id: 12, batch_code: "LNRKB02", course_title: "German B2",
          students: 5, on: "2026-09-07", due: "2026-09-13",
          overdue: true, daysLate: 12, escalated: true,
        }],
        pendingSummary: {
          tone: "escalated", count: 1, due: "2026-09-13", daysLate: 12,
          text: "Attendance for 1 class is more than a week overdue. The office has been told.",
        },
      },
      // Finding out later that you were reported is worse than being
      // told now.
      expect: ["office has been told", "12 days past Sunday", "tl-owed-escalated"],
    },
    {
      view: "teach/dashboard",
      label: "nothing owed draws no banner at all",
      locals: {
        ...teachShell("dashboard"),
        stats: { batches: 1, running: 1, students: 5 }, next: null, roster: [],
        slipping: [], today: "2026-09-22", batches, notice: null,
      },
      reject: ["Attendance pending"],
    },
    // Which dates are done and which are not, across every batch.
    //
    // Three states, and the middle one is why this is not just a
    // boolean: students can mark themselves present by clicking the
    // class link, so a lesson can have attendance rows and still have
    // no register. That is the case that showed a class of five as two.
    {
      view: "teach/schedule",
      label: "a taken register, an unconfirmed one and an untouched one read differently",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras, batches, lessons: [],
        history: [
          { id: 1, title: "Lesson 3", starts_at: "2026-09-21T07:00:00Z", day: "2026-09-21",
            status: "held", intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
            course_title: "German B2", level: "B2",
            marked: 9, attended: 8, absent: 1, by_teacher: 9, students: 9 },
          { id: 2, title: "Lesson 2", starts_at: "2026-09-18T07:00:00Z", day: "2026-09-18",
            status: "scheduled", intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
            course_title: "German B2", level: "B2",
            marked: 4, attended: 4, absent: 0, by_teacher: 0, students: 9 },
          { id: 3, title: "Lesson 1", starts_at: "2026-09-16T07:00:00Z", day: "2026-09-16",
            status: "scheduled", intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
            course_title: "German B2", level: "B2",
            marked: 0, attended: 0, absent: 0, by_teacher: 0, students: 9 },
        ],
      },
      expect: [
        // Named by its window now: a teacher looking for a register
        // they have not done is always looking at the recent past, and
        // "already taught" said what they were without saying when.
        "Last 2 weeks", "2 still to mark",
        ">taken<", "8 of 9 here",
        "joined only", "4 of 9 joined by link",
        "not taken", "9 students, nothing marked",
        // Every row acts from where it is read.
        "/teach/batch/12/register?date=2026-09-18",
        "/teach/batch/12/register?date=2026-09-16",
        /* A class that is behind and was never marked can be called
           off from here. Until now the only offer was "Take it", which
           assumes it happened; when it did not, the row sat in "still
           to mark" for ever, because the only honest register for a
           class that did not happen is no register at all. */
        "It did not happen", "/teach/lesson/3/cancel",
        // ...and the reason list comes with it, both sides named.
        "At the students&#39; request", "Nobody turned up",
        /* And on the joined-only one. This fixture used to reject it,
           on the view that students clicking a link proved the class
           ran. It does not: they join, the teacher never arrives, and
           the row is left offering "Confirm" as its only action --
           write a register for a class that did not happen -- with no
           way to say so. A register taken by a person is the only
           thing that settles it, and that is the line lessons.cancel()
           draws as well. */
        "/teach/lesson/2/cancel",
        // Not silently: the self-marks are what is being set aside.
        "marked themselves here by",
      ],
      reject: [
        /* Only the one with a register against it. That is a person
           saying the class happened, and calling it off would throw
           away what they wrote. */
        "/teach/lesson/1/cancel",
      ],
    },
    {
      view: "teach/schedule",
      label: "...and a cancelled class is not a register anybody owes",
      locals: {
        ...teachShell("schedule"), ...scheduleExtras, batches, lessons: [],
        history: [
          { id: 4, title: "Lesson 4", starts_at: "2026-09-23T07:00:00Z", day: "2026-09-23",
            status: "cancelled", intake_id: 12, batch_code: "B2-2026-04", timezone: "Europe/Berlin",
            course_title: "German B2", level: "B2",
            marked: 0, attended: 0, absent: 0, by_teacher: 0, students: 9 },
        ],
      },
      expect: ["cancelled", "0 still to mark"],
      // Nothing to take, so nothing offering to take it -- and nothing
      // offering to call it off either. A cancelled class has no
      // teacher marks on it, so the "it did not happen" control
      // matched it on the first attempt and would have invited
      // somebody to cancel a class that was already cancelled.
      reject: [
        "/teach/batch/12/register?date=2026-09-23", "not taken",
        "It did not happen", "/teach/lesson/4/cancel",
      ],
    },
    {
      view: "teach/settings",
      label: "the office owns the name, the teacher owns the password",
      locals: { ...teachShell("settings") },
      expect: [
        'action="/teach/settings/password"', 'name="current_password"',
        'action="/teach/settings/profile"', 'name="phone"',
        "changed by the office",
      ],
      reject: ['name="name"', 'name="email"', 'name="role"'],
    },
    {
      view: "teach/missing",
      label: "not yours and does not exist read the same",
      locals: { ...teachShell("batches") },
      expect: ["does not exist or is not one you teach"],
    },
    {
      view: "admin-teachers",
      label: "the office never types somebody else's password",
      locals: {
        authed: true,
        rows: [
          { id: 4, name: "Frau Weber", email: "weber@example.com", phone: null,
            role: "teacher", status: "active", batches: 2, last_login_at: "2026-09-01",
            invite_expires_at: null, invite_pending: 0,
            terms_accepted_at: "2026-09-05", terms_version: "2026-09-13" },
          { id: 5, name: "Herr Klein", email: "klein@example.com", phone: null,
            role: "teacher", status: "invited", batches: 0, last_login_at: null,
            invite_expires_at: "2026-09-20", invite_pending: 1,
            terms_accepted_at: null, terms_version: null },
          // An active account with nothing on record. It should not be
          // possible — claiming an invitation writes both in the same
          // statement — which is exactly why the office should see it.
          { id: 6, name: "Dr. Alt", email: "alt@example.com", phone: null,
            role: "teacher", status: "active", batches: 1, last_login_at: "2026-08-01",
            invite_expires_at: null, invite_pending: 0,
            terms_accepted_at: null, terms_version: null },
        ],
        roles: teachers.ROLES,
        roleLabel: teachers.ROLE_LABEL,
        dbOk: true,
        notice: null,
        error: null,
      },
      expect: [
        "Frau Weber", "Herr Klein", "Invited", "Resend", "Suspend",
        'action="/admin/teachers"',
        "terms 2026-09-13 accepted", "no terms on record",
      ],
      reject: [
        'type="password"',
        // No invitation link on the ordinary screen. It appears only
        // when the email failed, and only in that one response.
        "/teach/invite/",
      ],
    },
    {
      view: "admin-teachers",
      label: "a failed email hands the office the link instead",
      locals: {
        authed: true,
        rows: [],
        roles: teachers.ROLES,
        roleLabel: teachers.ROLE_LABEL,
        dbOk: true,
        notice: null,
        error: "Email is not configured on this server, so the invitation could not be sent.",
        handoff: {
          name: "Frau Weber",
          email: "weber@example.com",
          url: "https://www.langnation.com/teach/invite/tok-abc123",
          expires: "2026-09-27",
        },
      },
      expect: [
        "Send this link to Frau Weber yourself",
        "https://www.langnation.com/teach/invite/tok-abc123",
        "weber@example.com",
        // The office has one chance at it: the token is hashed on the
        // way into the database.
        "Copy it now",
        'data-copy="https://www.langnation.com/teach/invite/tok-abc123"',
      ],
      // Clicking it here would claim the account for whoever is sitting
      // at the office desk, so it must not be a link.
      reject: ['<a href="https://www.langnation.com/teach/invite/'],
    },
  );
}

// ── A student's own attendance, and the office's chart ───────────────
{
  const attendance = require("../lib/attendance");

  const lesson = (day, status, source, min, note) => ({
    lesson_id: 1, day, starts_at: day + "T12:00:00Z", title: "Class",
    intake_id: 12, batch_code: "LNIKB01", timezone: "Europe/Berlin",
    course_title: "Fast Track", level: "B1",
    status, source, minutes_late: min, note, joined_at: null,
  });

  const lessons = [
    lesson("2026-09-13", "present", "self", null, null),
    lesson("2026-09-11", "late", "self", 12, null),
    lesson("2026-09-09", "absent", "teacher", null, "Texted me, job interview"),
    lesson("2026-09-07", "excused", "teacher", null, "Hospital"),
    lesson("2026-09-05", null, null, null, null),
  ];
  const counts = { present: 1, late: 1, absent: 1, excused: 1 };

  // -- The student's own timetable ------------------------------------
  //
  // Three things decide whether this page is any use: that it prints in
  // the BATCH's timezone and not the server's, that a cancelled class
  // stays visible instead of quietly vanishing, and that an empty page
  // says which of the three reasons it is empty for.
  {
    const sched = require("../lib/schedule");
    const lesson = (over = {}) => Object.assign({
      id: 1, seq: 1, title: "Lesson 1",
      // 07:00 UTC is 09:00 in Berlin in summer. The page must say 09:00.
      starts_at: "2026-09-16T07:00:00Z",
      minutes: 120, status: "scheduled", meeting_url: null, notes: null,
      moved_from: null, change_note: null,
      intake_id: 12, batch_code: "LNRKB02", timezone: "Europe/Berlin",
      batch_meeting_url: "https://meet.example.com/a2", batch_status: "running",
      course_title: "German Regular A2", level: "A2",
    }, over);

    const enrolled = (over = {}) => Object.assign({
      id: 5, status: "active", intake_id: 12, code: "LNRKB02",
      course_title: "German Regular A2", level: "A2", timezone: "Europe/Berlin",
      batch_status: "running",
      meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
    }, over);

    const base = (over = {}) => Object.assign({
      ...shell("schedule"), sched, weeks: 6,
      days: [], lessonCount: 0, active: [], withoutPattern: [],
    }, over);

    cases.push(
      {
        view: "portal/schedule",
        label: "a lesson prints in the batch's timezone, not the server's",
        locals: base({
          lessonCount: 1,
          active: [enrolled()],
          days: [{ date: "2026-09-16", lessons: [lesson()] }],
        }),
        // 09:00-11:00 Berlin, from an instant stored at 07:00 UTC.
        expect: ["German Regular A2", "09:00", "11:00", "Wednesday", "Join", "Monday to Friday"],
      },
      {
        view: "portal/schedule",
        label: "a cancelled class stays on the page, with its reason",
        locals: base({
          lessonCount: 1,
          active: [enrolled()],
          days: [{
            date: "2026-09-16",
            lessons: [lesson({ status: "cancelled", change_note: "Teacher ill" })],
          }],
        }),
        // Vanishing would be indistinguishable from never having been
        // scheduled, and the student turns up to an empty room.
        expect: ["cancelled", "Teacher ill", "sp-lesson-off"],
        // ...and no link into a room nobody is in.
        reject: [">Join<"],
      },
      {
        view: "portal/schedule",
        label: "a moved class says where it moved from",
        locals: base({
          lessonCount: 1,
          active: [enrolled()],
          days: [{
            date: "2026-09-18",
            lessons: [lesson({
              starts_at: "2026-09-18T07:00:00Z",
              moved_from: "2026-09-17T07:00:00Z",
              change_note: "Public holiday",
            })],
          }],
        }),
        // "Thursday's class is now Friday" is a different message from
        // "there is a class on Friday".
        expect: ["Moved from", "Thu", "Public holiday"],
      },
      {
        view: "portal/schedule",
        label: "an empty page blames the missing pattern rather than the student",
        locals: base({ active: [enrolled({ meets_days: null, meets_from: null })],
                       withoutPattern: [enrolled({ meets_days: null, meets_from: null })] }),
        expect: ["no weekly timetable set yet", "no weekly timetable set"],
        reject: ["No classes in the next"],
      },
      {
        view: "portal/schedule",
        label: "...and says so plainly when there is simply nothing coming up",
        locals: base({ active: [enrolled()] }),
        expect: ["No classes in the next 6 weeks", "Monday to Friday"],
        reject: ["no weekly timetable set yet"],
      },
      {
        view: "portal/schedule",
        label: "...and does not imply a timetable when nobody is enrolled",
        locals: base({}),
        expect: ["not on a running course"],
        reject: ["no weekly timetable set yet", "No classes in the next"],
      }
    );
  }

  // The course card names the weekly pattern in words. There was no
  // render test for this view at all, so the branch could have thrown on
  // a missing helper and the suite would have stayed green -- the
  // fixtures simply had no pattern and never entered it.
  {
    const sched = require("../lib/schedule");
    const enrolment = (over = {}) => Object.assign({
      id: 5, status: "active", intake_id: 12, code: "LNRKB02", batch_title: "Day Time Batch",
      course_title: "German Regular A2", level: "A2", timezone: "Europe/Berlin",
      batch_status: "running", starts_on: "2026-09-16", ends_on: "2026-11-30",
      enrolled_on: "2026-09-15", completed_on: null, final_grade: null,
      teacher_name: "Frau Kanishka", teacher2_name: null,
      meeting_url: "https://meet.example.com/a2", drive_url: null, whatsapp_url: null,
      meets_days: "1,2,3,4,5", meets_from: "09:00:00", meets_minutes: 120,
    }, over);

    cases.push(
      {
        view: "portal/courses",
        label: "the course card says which days and times it meets",
        locals: { ...shell("courses"), sched, enrolments: [enrolment()], materials: [] },
        expect: ["Meets", "Monday to Friday", "09:00", "11:00", "see every date"],
      },
      {
        view: "portal/courses",
        label: "...and says nothing at all when the office has not set one",
        locals: {
          ...shell("courses"), sched, materials: [],
          enrolments: [enrolment({ meets_days: null, meets_from: null })],
        },
        // An invented default would be a timetable nobody agreed to.
        reject: ["<dt>Meets</dt>"],
      }
    );
  }

  cases.push(
    {
      view: "portal/attendance",
      label: "a student can see how their own register reads",
      locals: {
        ...shell("attendance"),
        statusLabel: attendance.STATUS_LABEL,
        graceMinutes: attendance.GRACE_MINUTES,
        band: attendance.band,
        good: attendance.GOOD,
        poor: attendance.POOR,
        batches: [{
          intakeId: 12, code: "LNIKB01", title: "Fast Track", level: "B1",
          timezone: "Europe/Berlin", lessons, counts, unmarked: 1,
          rate: attendance.rate(counts), marked: 4,
        }],
      },
      expect: [
        "LNIKB01", "Texted me, job interview",
        // Late counts as attended, excused is out of the sum: 2 of 3.
        "67%",
        // Where the mark came from, so a student knows their teacher
        // has not corrected it yet and that it can be.
        "marked when you joined",
        // A lesson held with no mark is not an absence.
        "not registered",
        "tell your teacher",
        // 67% is amber, and the legend says what the colours mean in
        // words as well as in colour.
        "sp-rate-watch", "90% and above", "below 60%",
      ],
    },
    {
      view: "portal/attendance",
      label: "nothing recorded yet reads as nothing, not as zero",
      locals: {
        ...shell("attendance"),
        statusLabel: attendance.STATUS_LABEL,
        graceMinutes: attendance.GRACE_MINUTES,
        band: attendance.band,
        good: attendance.GOOD,
        poor: attendance.POOR,
        batches: [],
      },
      expect: ["Nothing to show yet", "Join the class"],
      reject: ["0%"],
    },
    {
      view: "admin",
      label: "the Drafts folder says where drafts live before anybody is surprised by it",
      locals: {
        site: require("../lib/site"),
        authed: true, error: null,
        rows: [], total: 0, page: 1, pages: 1,
        status: "", folder: "drafts",
        folderCounts: { new: 2, replied: 7, closed: 1, spam: 0, sent: 3 },
        dbOk: true, topPages: [], notice: null, reply: null, compose: false,
        contacts: [], sentRows: [], sentReady: true,
      },
      expect: [
        'href="/admin?status=drafts" aria-pressed="true"',
        /* The count is written by the browser, because the drafts are in
           the browser and the server has never seen them. */
        "data-draft-count",
        "data-drafts-list",
        /* Said on the page. A Drafts folder that quietly means "on this
           computer" is one somebody is surprised by exactly once, at the
           worst possible moment. */
        "Kept in this browser on this computer",
        "will not appear on another machine",
        // ...and what it does without JavaScript, which is not nothing.
        "this needs JavaScript",
      ],
      reject: ["No enquiries yet", "Mark replied"],
    },
    {
      view: "admin",
      label: "the Sent folder shows what went out, to whom, and what was attached",
      locals: {
        site: require("../lib/site"),
        authed: true, error: null,
        rows: [], total: 2, page: 1, pages: 1,
        status: "", folder: "sent",
        folderCounts: { new: 0, replied: 7, closed: 1, spam: 0, sent: 2 },
        dbOk: true, topPages: [], notice: null, reply: null, compose: false,
          sentRows: [], sentReady: true,
        contacts: [],
        sentReady: true,
        sentRows: [
          { id: 2, enquiry_id: 14, to_email: "anita@example.com", to_name: "Anita Sharma",
            subject: "Re: your enquiry \u2014 LangNation",
            body: '<p style="margin:0">The C1 course starts in October.</p>',
            attachments: "terms.pdf", files: ["terms.pdf"],
            sent_by: null, sent_at: "2026-09-28T09:15:00Z" },
          { id: 1, enquiry_id: null, to_email: "weber@example.com", to_name: "Frau Weber",
            subject: "Timetable", body: "<p style=\"margin:0\">Attached.</p>",
            attachments: null, files: [],
            sent_by: null, sent_at: "2026-09-27T16:02:00Z" },
        ],
      },
      expect: [
        'href="/admin?status=sent" aria-pressed="true"',
        // Who it went to and what it said.
        "Anita Sharma", "anita@example.com", "The C1 course starts in October.",
        "Re: your enquiry", "Timetable",
        /* Which of the two it was. A reply is filed against an enquiry
           and a written one is not, and that is the difference somebody
           is looking for. */
        ">reply<", ">written<",
        // The attachment, by name.
        "terms.pdf",
      ],
      reject: [
        // The enquiry list is not what this folder shows.
        "Mark replied", "No enquiries yet",
      ],
    },
    {
      view: "admin",
      label: "...and before migration 31 it says so rather than looking empty",
      locals: {
        site: require("../lib/site"),
        authed: true, error: null,
        rows: [], total: 0, page: 1, pages: 1,
        status: "", folder: "sent",
        folderCounts: { new: 0, replied: 0, closed: 0, spam: 0, sent: 0 },
        dbOk: true, topPages: [], notice: null, reply: null, compose: false,
          sentRows: [], sentReady: true,
        contacts: [], sentReady: false, sentRows: [],
      },
      /* An empty folder and a folder that cannot work yet look the
         same, and only one of them is somebody's to fix. */
      expect: ["needs migration 31", "runs by itself", "emails still", "send"],
      reject: ["Nothing sent yet"],
    },
    /* The dashboard, which had no case either.
     *
     * Same blind spot as the enquiries screen next door: the office
     * opens on this page and the suite had never rendered it. Adding a
     * card to it was what made that obvious — the run stayed green
     * while the page would have thrown on the first local it read.
     */
    {
      view: "admin-dashboard",
      label: "the dashboard says how many enquiries arrived and where they went",
      locals: {
        site: require("../lib/site"),
        authed: true,
        enquiries: [],
        enquiryTotal: 31,
        newEnquiries: 2,
        folderCounts: { new: 2, replied: 21, closed: 5, spam: 3 },
        enquiryArrivals: { week: 4, month: 17 },
        requestCounts: { pending: 1, approved: 9, denied: 0 },
        peopleCounts: { total: 64, requested: 3, approved: 2, active: 58, refused: 1, students: 58 },
        placementsWaiting: 0,
        recentPlacements: [],
        views: [],
        dbOk: true,
      },
      expect: [
        // The question the page could not answer: how many are coming in.
        "Arrived this week", ">4<",
        "Arrived in 30 days", ">17<",
        // ...and where the answered ones went.
        "Waiting in the inbox", "Replied", "Closed",
        /* Said plainly, because "spam: 3" does not tell anybody that
           those three senders are refused from now on. */
        "Spam — senders blocked",
        "See what is blocked",
        'href="/admin?status=new"',
        'href="/admin?status=spam"',
        // The tiles that were already here still work.
        "new enquiries", "account request", "student accounts",
      ],
    },
    {
      view: "admin-dashboard",
      label: "...and an empty spam folder is not mentioned at all",
      locals: {
        site: require("../lib/site"),
        authed: true,
        enquiries: [],
        enquiryTotal: 0,
        newEnquiries: 0,
        folderCounts: { new: 0, replied: 0, closed: 0, spam: 0 },
        enquiryArrivals: { week: 0, month: 0 },
        requestCounts: { pending: 0, approved: 0, denied: 0 },
        peopleCounts: { total: 0, requested: 0, approved: 0, active: 0, refused: 0, students: 0 },
        placementsWaiting: 0,
        recentPlacements: [],
        views: [],
        dbOk: true,
      },
      expect: ["Arrived this week", "Waiting in the inbox"],
      /* A row reading "Spam — senders blocked: 0" invites somebody to
         go and look at an empty folder, and a link to it is a link to
         nothing. */
      reject: ["senders blocked", "See what is blocked"],
    },
    /* The enquiries screen, which had no case at all until now.
     *
     * It is the office's inbox and the only place a stranger's message
     * is ever read, and every check-views run was passing without
     * rendering it once. Adding folders to it was what made that
     * obvious: the suite went green on a page that would have thrown.
     */
    {
      view: "admin",
      label: "the enquiries page opens on the inbox and counts what is in each folder",
      locals: (() => {
        const enq = (id, over) => ({
          id, name: "Dixie Coughlin", email: "coughlin.dixie@msn.com",
          phone: "+852 3727575159", country: "Austria",
          course_slug: "german-regular-c1", message: "Please send me the C1 timetable.",
          lang: "en", source_page: "/contact", status: "new",
          spam_score: 0, spam_reasons: "", created_at: "2026-09-28",
          createdLabel: "28 September 2026", ...over,
        });
        return {
          site: require("../lib/site"),
          authed: true, error: null,
          rows: [enq(1), enq(2, { name: "parsa mir", email: "mirparsa896@gmail.com" })],
          total: 2, page: 1, pages: 1,
          status: "new", folder: "new",
          folderCounts: { new: 2, replied: 7, closed: 1, spam: 0 },
          dbOk: true, topPages: [], notice: null, reply: null, compose: false,
          sentRows: [], sentReady: true,
          contacts: [
            { name: "Frau Weber", email: "weber@example.com", kind: "teacher" },
            { name: "Herr Seraj", email: "seraj@example.com", kind: "teacher" },
            ...["Anita Sharma", "Ravi Kumar", "Bilal Hassan", "Diljot Singh",
                "Noman Ahmed", "Sadaf Seraj", "Umair Ali", "Naziya Parveen",
                "Ali Awais", "Shahbaj Ahmed", "Kawalnain Singh"].map((n, i) => ({
              name: n, email: "s" + i + "@example.com", kind: "student",
            })),
          ],
        };
      })(),
      expect: [
        // The folders, named as folders.
        "Inbox", "Replied", "Closed", "Spam", "All",
        // ...and the inbox is the one that is open.
        'href="/admin?status=new" aria-pressed="true"',
        'href="/admin?status=all" aria-pressed="false"',
        // What is in each, so the row of words says which one needs you.
        "chip-n",
        // Both enquiries, and the reply box that was already here.
        "Dixie Coughlin", "parsa mir", "Reply to Dixie Coughlin",
        // Marking spam does more than file it, so the button says so.
        "refuse anything else from coughlin.dixie@msn.com",
        /* The reply box uses the same editor as the course content
           boxes. data-rich is the whole of the wiring, and the script
           has to be on the page for it to find anything. */
        "data-rich",
        "/js/editor.js",
        /* Writing to somebody who never sent an enquiry. Same editor,
           same formatter and the same From address as a reply, because
           two different-looking emails going out under one name is the
           thing worth preventing. */
        "Compose email",
        "Leave empty for no greeting",
        /* Everyone the office might write to, offered by name in the
           To field. A datalist and not a dropdown, so an address that
           belongs to nobody on the list can still be typed. */
        "data-contact-pick", "Anita Sharma", "Frau Weber",
        "Teachers", "Students",
        "data-contact-to", "data-contact-name",
      ],
      reject: [
        // A count of zero is not drawn -- "Spam 0" invites a click that
        // finds nothing.
        ">0<",
        // The blocking notice belongs on the spam folder, not the inbox.
        "Anything in here is blocked",
      ],
    },
    {
      view: "admin",
      label: "...and the spam folder says plainly that those senders are blocked",
      locals: {
        site: require("../lib/site"),
        authed: true, error: null,
        rows: [{
          id: 9, name: "Vantovo", email: "sales@vantovo.example",
          phone: "", country: "", course_slug: "", message: "Try it free for 7 days.",
          lang: "en", source_page: "/contact", status: "spam",
          spam_score: 5, spam_reasons: "links, sales vocabulary",
          created_at: "2026-09-28", createdLabel: "28 September 2026",
        }],
        total: 1, page: 1, pages: 1,
        status: "spam", folder: "spam",
        folderCounts: { new: 0, replied: 7, closed: 1, spam: 1 },
        dbOk: true, topPages: [], notice: null, reply: null, compose: false,
          sentRows: [], sentReady: true,
          contacts: [
            { name: "Frau Weber", email: "weber@example.com", kind: "teacher" },
            { name: "Herr Seraj", email: "seraj@example.com", kind: "teacher" },
            ...["Anita Sharma", "Ravi Kumar", "Bilal Hassan", "Diljot Singh",
                "Noman Ahmed", "Sadaf Seraj", "Umair Ali", "Naziya Parveen",
                "Ali Awais", "Shahbaj Ahmed", "Kawalnain Singh"].map((n, i) => ({
              name: n, email: "s" + i + "@example.com", kind: "student",
            })),
          ],
      },
      expect: [
        'href="/admin?status=spam" aria-pressed="true"',
        "Anything in here is blocked",
        /* The way back out, said on the page. The spam folder IS the
           block list, so moving one back to the inbox is the whole of
           the undo and nobody should have to guess that. */
        "Moving one back to the inbox lifts that immediately",
        "Mark new",
      ],
    },
    {
      view: "admin-attendance",
      label: "the office compares two batches, and names who to ring",
      locals: (() => {
        const rows = [
          { intake_id: 12, batch_code: "LNIKB01", course_title: "Fast Track", day: "2026-09-01", present: 9, late: 1, absent: 0, excused: 0 },
          { intake_id: 12, batch_code: "LNIKB01", course_title: "Fast Track", day: "2026-09-08", present: 4, late: 0, absent: 6, excused: 0 },
          { intake_id: 13, batch_code: "LNRKB02", course_title: "Regular A2", day: "2026-09-08", present: 8, late: 0, absent: 0, excused: 1 },
        ];
        const student = (name, ref, code, teacher, present, absent) => ({
          id: ref, student_ref: ref, name, email: ref.toLowerCase() + "@example.com",
          phone: null, intake_id: 12, batch_code: code, course_title: "Fast Track",
          teacher_name: teacher, enrolment_status: "active",
          present, late: 0, absent, excused: 0,
          lessons: present + absent,
          rate: attendance.rate({ present, absent }),
          band: attendance.band(attendance.rate({ present, absent })),
          concerning: attendance.concerning({ present, absent }),
          last_seen: "2026-08-20",
        });
        return {
          authed: true,
          dbOk: true,
          untouched: 1,
          chosen: [12, 13],
          // The escalation. By the time a name is here it has been on
          // that teacher's own dashboard for a week, so the table is a
          // list to follow up rather than a list of offences -- and the
          // classes are named, because "chase Frau Weber" is not
          // actionable and "two classes, oldest 14 September" is.
          escalateAfter: 7,
          lineColour: attendance.lineColour,
          chase: [
            {
              teacherId: 4, name: "Frau Weber", email: "weber@example.com",
              worstDaysLate: 11,
              lessons: [
                { lesson_id: 81, on: "2026-09-14", batch_code: "LNRKB02", daysLate: 11 },
                { lesson_id: 82, on: "2026-09-16", batch_code: "LNRKB02", daysLate: 9 },
              ],
            },
          ],
          chart: attendance.toChart(rows),
          good: attendance.GOOD,
          poor: attendance.POOR,
          only: false,
          poorCount: 1,
          // Worst first, the way the library hands them over.
          students: [
            student("Ravi Kumar", "LNS0008", "LNIKB01", "Herr Seraj", 2, 4),
            student("Marta Nowak", "LNS0011", "LNRKB02", "Frau Weber", 7, 2),
            student("Anita Sharma", "LNS0007", "LNIKB01", "Herr Seraj", 10, 0),
          ],
          options: [
            { id: 12, code: "LNIKB01", status: "running", course_title: "Fast Track", teacher_name: "Herr Seraj", held: 2, marks: 20 },
            { id: 13, code: "LNRKB02", status: "running", course_title: "Regular A2", teacher_name: "Frau Weber", held: 1, marks: 9 },
            { id: 14, code: "LNRKB03", status: "planned", course_title: "Regular B2", teacher_name: null, held: 0, marks: 0 },
          ],
        };
      })(),
      expect: [
        "Registers not taken", "Frau Weber", "LNRKB02", "2026-09-14", "11 days",
        "LNIKB01", "LNRKB02", "<svg", "<path", 'name="batch" multiple',
        // A batch nobody has registered says so in the picker, rather
        // than silently charting as a flat nothing.
        "no register yet",
        // 100% then 40% for the first batch.
        "100%", "40%",
        // And the students, worst first, with the teacher to tell.
        "Ravi Kumar", "Herr Seraj", "33%", "sp-rate-poor", "tell the teacher",
        "Below 60% (1)",
      ],
      reject: [
        // A student with nothing recorded must never read as 0% — but
        // nobody here is in that state, so the dash belongs to the
        // batch column only.
        "came to nothing",
      ],
    },
    {
      view: "admin-attendance",
      label: "no registers anywhere says why",
      locals: {
        chase: [], escalateAfter: 7, lineColour: attendance.lineColour,
        authed: true,
        dbOk: true,
        untouched: 3,
        chosen: [],
        chart: attendance.toChart([]),
        students: [],
        poorCount: 0,
        only: false,
        good: attendance.GOOD,
        poor: attendance.POOR,
        options: [
          { id: 14, code: "LNRKB03", status: "planned", course_title: "Regular B2", teacher_name: null, held: 0, marks: 0 },
        ],
      },
      expect: ["Nothing to chart", "no teacher account assigned"],
      // No chart at all — not an empty one with axes. The sidebar has
      // its own <path> icons, so the card's heading is what says
      // whether a chart was drawn.
      reject: ["Attendance per class", "stroke-dasharray"],
    },
    {
      view: "admin-attendance",
      label: "nobody below the line says so, rather than showing nothing",
      locals: {
        chase: [], escalateAfter: 7, lineColour: attendance.lineColour,
        authed: true,
        dbOk: true,
        untouched: 0,
        chosen: [12],
        chart: attendance.toChart([
          { intake_id: 12, batch_code: "LNIKB01", course_title: "Fast Track",
            day: "2026-09-01", present: 10, late: 0, absent: 0, excused: 0 },
        ]),
        students: [],
        poorCount: 0,
        only: true,
        good: attendance.GOOD,
        poor: attendance.POOR,
        options: [
          { id: 12, code: "LNIKB01", status: "running", course_title: "Fast Track",
            teacher_name: "Herr Seraj", held: 1, marks: 10 },
        ],
      },
      // An empty table under a filter has to say which of the two
      // things it means.
      expect: ["Nobody on these batches is below 60%", "That is the"],
    },
  );
}

// ── Forgotten passwords ──────────────────────────────────────────────
//
// Both portals, both steps. The assertion that matters most is a
// rejection: the page that confirms a link was sent must not say
// whether the address had an account, or the form becomes a way of
// asking whether a given person studies — or works — here.
{
  const pages = [
    { view: "portal/", who: "student", head: { student: null }, at: "/portal" },
    { view: "teach/", who: "teacher", head: { teacher: null }, at: "/teach" },
  ];

  for (const page of pages) {
    cases.push(
      {
        view: page.view + "forgot",
        label: `${page.who}: asking for a link`,
        locals: { ...page.head, values: {} },
        expect: [
          `action="${page.at}/forgot"`, 'name="email"', "Email me a link",
          `href="${page.at}/login"`,
        ],
      },
      {
        view: page.view + "forgot",
        label: `${page.who}: the answer gives nothing away`,
        locals: { ...page.head, notice: "sent", values: { email: "someone@example.com" } },
        expect: ["Check your email", "someone@example.com", "stops working in an hour"],
        reject: [
          // Not "we have sent you an email" — "if that address has an
          // account". The difference is the whole point.
          "We have sent", "no account", "not found",
          // And no form to submit again from the same screen, which
          // would make the throttle pointless.
          'name="email"',
        ],
      },
      {
        view: page.view + "reset",
        label: `${page.who}: choosing the new one`,
        locals: {
          ...page.head,
          token: "tok-abc",
          email: "someone@example.com",
          errors: {},
        },
        expect: [
          `action="${page.at}/reset/tok-abc"`, 'name="password"',
          "data-password", 'minlength="10"',
          // The consequence, said before they do it rather than after.
          "signs the account out everywhere else",
        ],
        // The eye is appended by app.js. A button in the markup would be
        // a button that does nothing without JavaScript.
        reject: ["pw-eye"],
      },
      {
        view: page.view + "reset",
        label: `${page.who}: a password that was refused`,
        locals: {
          ...page.head,
          token: "tok-abc",
          email: "someone@example.com",
          errors: { password: "Use at least 10 characters." },
        },
        expect: ["Use at least 10 characters.", 'aria-invalid="true"', 'id="err-password"'],
      },
    );
  }

  cases.push(
    {
      view: "portal/login",
      label: "the way out of a forgotten password is on the form",
      locals: { student: null, values: {} },
      expect: ['href="/portal/forgot"', "Forgotten your password?", "data-password"],
    },
    {
      view: "teach/login",
      label: "and on the teacher's too",
      locals: { teacher: null, values: {} },
      expect: ['href="/teach/forgot"', "Forgotten your password?", "data-password"],
    },
  );
}

// ── Taking the register ──────────────────────────────────────────────
//
// The page a teacher uses more than any other, on a phone, in the two
// minutes after a class. What matters is that it opens already filled
// in with the common answer, that it never offers a day that has not
// happened, and that it is an ordinary form which works with no
// JavaScript at all.
{
  const attendance = require("../lib/attendance");

  // Both active: the withdrawn student in rosterRows belongs in the
  // separated "no longer on this batch" list, which has no note field,
  // and these cases are about the main one.
  const registerRows = rosterRows.map((r) => ({
    ...r, enrolment_status: "active", mark: null, note: null,
  }));
  const registerBase = {
    ...teachShell("batches"),
    batch: { id: 12, code: "B2-2026-04", course_title: "German Regular B2", level: "B2", timezone: "Europe/Berlin" },
    statuses: attendance.STATUSES,
    today: "2026-09-13",
    // Calling the class off or moving it, from the page the backlog
    // banner sends a teacher to. Off by default here; the cases that
    // exercise it switch it on.
    canChange: true,
    canEmail: true,
    noteMax: require("../lib/lessons").NOTE_MAX,
    cancelReasons: require("../lib/lessons").CANCEL_REASONS,
    // Handing one class to another teacher. Every account but your own.
    canHandOver: true,
    teacherOptions: [
      { id: 7, name: "Frau Weber", email: "weber@example.com" },
      { id: 8, name: "Frau Kanishka", email: "kanishka@example.com" },
    ],
  };

  // Calling a class off, or moving it, from the register page.
  //
  // The backlog banner sends a teacher here to "take it now". Until
  // this existed, a class that never ran could only be cleared by
  // marking everybody absent -- a false record of five people missing a
  // lesson nobody taught, which then follows them into their attendance
  // rate and onto a certificate.
  const pastLesson = {
    id: 77, title: "Lesson 3", starts_at: "2026-09-18T17:00:00Z",
    minutes: 120, status: "scheduled", notes: null,
  };

  cases.push(
    {
      view: "teach/register",
      label: "a class that did not happen can be called off or moved",
      locals: {
        ...registerBase,
        date: "2026-09-18",
        lesson: pastLesson,
        rows: registerRows,
        taken: false,
        notice: null,
        error: null,
      },
      expect: [
        "This class did not happen",
        "/teach/lesson/77/cancel", "/teach/lesson/77/move",
        // Back to this register rather than off to the schedule.
        "/teach/batch/12/register?date=2026-09-18",
        // 17:00 UTC is 19:00 in Berlin, and the form must offer the
        // time the teacher and the students call it.
        'name="time" value="19:00"',
        'name="date" value="2026-09-18"',
      ],
    },
    {
      view: "teach/register",
      label: "...but a class already held is a record, not a plan",
      locals: {
        ...registerBase,
        date: "2026-09-18",
        lesson: { ...pastLesson, status: "held" },
        rows: registerRows,
        taken: true,
        notice: null,
        error: null,
      },
      // Moving it would move somebody's register to a day they were not
      // in class.
      reject: ["This class did not happen", "/teach/lesson/77/cancel"],
    },
    {
      view: "teach/register",
      label: "...and before migration 25 it is not offered at all",
      locals: {
        ...registerBase,
        canChange: false,
        date: "2026-09-18",
        lesson: pastLesson,
        rows: registerRows,
        taken: false,
        notice: null,
        error: null,
      },
      reject: ["This class did not happen"],
    },
    {
      view: "teach/register",
      label: "opens with nobody marked present",
      locals: {
        ...registerBase,
        date: "2026-09-13",
        lesson: null,
        rows: registerRows,
        taken: false,
      },
      expect: [
        "Anita Sharma",
        // The "s" is load-bearing. A bare status[91] is a numeric bracket
        // key, and qs turns a set of those into an ARRAY — which has no
        // holes, so student ids 2, 3 and 6 come back as 0, 1 and 2 and
        // every mark lands on the wrong person. Silent while everybody is
        // present; wrong the moment one person is not.
        'name="status[s91]"',
        'value="present"', 'value="absent"',
        "Save the register", 'name="date"', 'value="2026-09-13"',
        // Absent until something says otherwise. It used to pre-select
        // Here, so opening the register and pressing save marked a full
        // house including people who never arrived. Wrong in the
        // direction somebody notices is the safer default: a student
        // marked absent who was there will say so.
        'value="absent"\n                         checked',
        // And the row says why it has no mark, so the teacher can see
        // which ones still need a decision.
        "not seen — set this one",
      ],
      // Nobody is pre-marked present, and nothing client-supplied points
      // at a lesson row.
      reject: ['name="lesson_id"', 'value="present"\n                         checked'],
    },
    {
      view: "teach/register",
      label: "a student who joined from the portal arrives already marked",
      locals: {
        ...registerBase,
        date: "2026-09-13",
        lesson: { id: 5, starts_at: "2026-09-13T09:00:00Z", minutes: 120, status: "held", notes: null },
        rows: registerRows.map((r, i) =>
          i === 0
            ? { ...r, mark: "present", mark_source: "self", joined_at: "2026-09-13T09:02:00Z" }
            : r
        ),
        taken: true,
      },
      // Their own click stands, and the page says it was theirs — a mark
      // the student made is evidence, one the teacher made is a decision,
      // and only one of them should make a teacher look twice.
      expect: ["joined from the portal", 'value="present"'],
    },
    {
      view: "teach/register",
      label: "a register already taken says so and can be corrected",
      locals: {
        ...registerBase,
        date: "2026-09-10",
        lesson: { id: 7, title: "Class on 2026-09-10", starts_at: "2026-09-10T12:00:00Z", status: "held" },
        rows: registerRows.map((r, i) => ({
          ...r,
          mark: i === 0 ? "absent" : "present",
          note: i === 0 ? "Texted me, job interview" : null,
          marked_at: "2026-09-10T14:02:00Z",
        })),
        taken: true,
      },
      expect: [
        "already taken, saving again corrects it",
        "Update the register",
        "Texted me, job interview",
        "Last saved",
      ],
    },
    {
      view: "teach/register",
      label: "today offers no way forward into tomorrow",
      locals: {
        ...registerBase,
        date: "2026-09-13",
        lesson: null,
        rows: registerRows,
        taken: false,
      },
      // Yesterday is a link; tomorrow must not be, because a register
      // for a class that has not happened is a guess.
      expect: ["register?date=2026-09-12"],
      reject: ["register?date=2026-09-14"],
    },
    {
      view: "teach/register",
      label: "an empty batch has nobody to mark",
      locals: {
        ...registerBase,
        date: "2026-09-13",
        lesson: null,
        rows: [],
        taken: false,
      },
      expect: ["nobody to mark"],
      reject: ["Save the register"],
    },
    {
      view: "teach/dashboard",
      label: "a student drifting away is named, with a way to reach them",
      locals: (() => {
        const batches = [batchRow()];
        return {
          ...teachShell("dashboard"),
          stats: teaching.summarise(batches),
          next: teaching.nextUp(batches),
          roster: rosterRows,
          batches,
          today: "2026-09-13",
          slipping: [{
            id: 92, student_ref: "LNS0008", name: "Ravi Kumar",
            email: "ravi@example.com", phone: "+91 91234 56789",
            intake_id: 12, batch_code: "B2-2026-04",
            present: 2, late: 0, absent: 4, excused: 0,
            rate: 33, band: "poor", concerning: true, last_seen: "2026-08-20",
          }],
        };
      })(),
      expect: [
        "Worth a message", "Ravi Kumar", "4 missed", "33%",
        "mailto:ravi@example.com", 'href="tel:+919123456789"',
      ],
    },
  );
}

/* Writing the rendered pages out, for looking at in a browser.
 *
 *   DUMP_VIEWS=1 node tools/check-views.js
 *
 * These fixtures are the only way to see a portal page with realistic
 * data without a database and a login, and the suite renders every one
 * of them already. What it cannot do is measure: CSS is invisible to a
 * string match, and this project has twice shipped a rule that lost a
 * specificity fight and did nothing at all — both times with a green
 * suite. So the pages go somewhere a browser can open them with the
 * real stylesheet attached.
 *
 * Under public/ because that is what makes "/css/site.css" resolve.
 * Cleared on every run and git-ignored: it is a workbench, not output.
 */
const DUMP = process.env.DUMP_VIEWS
  ? path.join(__dirname, "..", "public", "_preview")
  : null;
if (DUMP) {
  fs.rmSync(DUMP, { recursive: true, force: true });
  fs.mkdirSync(DUMP, { recursive: true });
}
const dumped = [];

/* What a course costs.
 *
 * There was no test of any kind on this, which is how a discount came
 * to be saved by two admin screens, stored correctly, and read by
 * nothing at all: the office set one, the page said "the live site is
 * already showing this", and the live site went on charging full price
 * for weeks.
 *
 * The rule is that `discount_eur` is the reduced price and must be
 * lower than `price_eur`. offer() decides what to print, priceProblem()
 * decides what to accept, and they have to agree — a number the editor
 * takes and the site ignores is the original bug with extra steps.
 */
{
  const { offer, priceProblem } = require("../lib/courses-db");
  const ok = (label, cond) => {
    if (cond) pricePass++;
    else { console.log(`  ✗ ${label}`); priceFail++; }
  };

  ok("a real offer prints struck through, with the discount as the price",
     offer(300, 250).priceNow === 250 && offer(300, 250).priceWas === 300);
  ok("no discount is just the price, with nothing struck through",
     offer(200, null).priceNow === 200 && offer(200, null).priceWas === undefined);

  // The rows actually in the live database when this was found.
  for (const [price, discount] of [[300, 400], [500, 600], [12, 15], [300, 300], [300, 0]]) {
    ok(`€${price} with a "discount" of €${discount} is not an offer`,
       offer(price, discount).priceNow === price && !offer(price, discount).priceWas);
    if (discount > 0) {
      ok(`...and the editor refuses to save it`, !!priceProblem(price, discount));
    }
  }

  ok("a price with no number at all prints nothing",
     offer(null, null).priceNow === undefined);
  ok("a discount with no price to discount from is refused",
     !!priceProblem(null, 250));
  ok("a genuine offer is accepted", priceProblem(300, 250) === null);
  ok("...and so is no discount at all", priceProblem(300, null) === null);

  /* The two must never disagree.

     If the editor accepts a pair the page then ignores, somebody sets a
     discount, is told it saved, and nothing changes — which is exactly
     what happened. Walked over a range rather than asserted on
     examples, because the failure was a whole class of values and not
     one of them. */
  for (let price = 0; price <= 40; price += 1) {
    for (let cut = 0; cut <= 40; cut += 1) {
      const accepted = priceProblem(price, cut) === null;
      const shown = offer(price, cut).priceWas !== undefined;
      // Accepted-and-not-shown is the bug. Shown-and-not-accepted would
      // mean the site advertising an offer the editor would refuse.
      if (accepted && cut > 0 && !shown) {
        ok(`€${price}/€${cut} is accepted but would not be shown`, false);
      }
      if (shown && !accepted) {
        ok(`€${price}/€${cut} would be shown but cannot be saved`, false);
      }
    }
  }
  ok("the editor and the page agree about every price up to €40", true);
}

/* The office dashboard.
 *
 * Every panel has an empty state and a full one, and the empty ones are
 * where a dashboard goes wrong: a school with no seat limits anywhere
 * has not filled up, and a month nobody enrolled in is not a month to
 * skip. Both are asserted, because both read as the opposite if they
 * are got wrong and neither shows up on a populated test database.
 */
{
  const insight = require("../lib/insight");
  const months = [
    { ym: "2026-04", label: "Apr", year: 2026, heads: 2, expected: 600 },
    { ym: "2026-05", label: "May", year: 2026, heads: 0, expected: 0 },
    { ym: "2026-06", label: "Jun", year: 2026, heads: 7, expected: 3500 },
  ];
  const courses = [
    { id: 1, title: "German Regular B2", slug: "german-regular-b2", level: "B2",
      track: "Regular", status: "published", price: 500, batches: 2, running: 1,
      heads: 5, expected: 2500 },
    { id: 2, title: "Fast Track", slug: "fast-track", level: null,
      track: "Intensive", status: "published", price: 750, batches: 1, running: 1,
      heads: 2, expected: 1500 },
    { id: 3, title: "German Weekend A1", slug: "german-weekend-a1", level: "A1",
      track: "Weekend", status: "archived", price: 200, batches: 0, running: 0,
      heads: 0, expected: 0 },
  ];
  const dash = (extra) => ({
    site: require("../lib/site"),
    euros: insight.euros,
    sum: { expected: 4000, students: 7, batches: 3, running: 2, planned: 1,
           seatsLeft: 4, perStudent: 571 },
    courses,
    attention: [],
    enrolChart: insight.toBars(months, (m) => m.heads),
    moneyChart: insight.toBars(months, (m) => m.expected),
    ...extra,
  });

  cases.push(
    {
      view: "rootadmin/dashboard",
      label: "the money is never called income",
      locals: dash(),
      expect: [
        "€4,000", "7", "German Regular B2", "€2,500",
        // The sentence that stops the hero figure being read as cash.
        "not money received",
        // Both charts drawn, each with its own measure.
        "Students enrolled, by month", "What those enrolments are worth",
        // The peak of each, labelled — and only the peak.
        ">7<", "€3,500",
      ],
      // Nothing on this page may call it income or revenue: no invoice
      // has been raised and no payment recorded, so nobody has
      // confirmed a euro of it arrived.
      reject: ["Income", "income", "Revenue", "revenue", "Turnover"],
    },
    {
      view: "rootadmin/dashboard",
      label: "no seat limit anywhere is not nought seats free",
      locals: dash({ sum: { expected: 0, students: 0, batches: 0, running: 0,
                            planned: 0, seatsLeft: null, perStudent: 0 } }),
      expect: ["no seat limits set"],
      // "0 seats free" over a school that has set no limits reads as
      // full, which is the opposite of true.
      reject: ["seats free"],
    },
    {
      view: "rootadmin/dashboard",
      label: "an empty month is drawn as an empty month, not skipped",
      locals: dash(),
      // Three months in, three ticks out: a gap that closes up turns a
      // quiet May into a straight line and hides the thing somebody
      // opened the page to see.
      expect: [">Apr<", ">May<", ">Jun<"],
      order: ["Apr", "May", "Jun"],
    },
    {
      view: "rootadmin/dashboard",
      label: "nothing at all says so rather than drawing an empty grid",
      locals: dash({
        enrolChart: insight.toBars([], (m) => m.heads),
        moneyChart: insight.toBars([], (m) => m.expected),
        courses: [],
      }),
      expect: ["nothing yet", "No courses yet"],
    },
    {
      view: "rootadmin/dashboard",
      label: "things worth a look each say what to do about them",
      locals: dash({
        attention: [
          { kind: "empty", what: "LNRKB02 — German Regular A2 has nobody on it",
            why: "It is running, so a teacher is being paid to teach an empty room.",
            href: "/rootadmin/batch/13", cta: "Open the batch" },
        ],
      }),
      expect: ["has nobody on it", "empty room", "Open the batch", "/rootadmin/batch/13"],
      reject: ["Nothing to do"],
    },
    {
      view: "rootadmin/dashboard",
      label: "...and nothing wrong says that plainly",
      locals: dash(),
      expect: ["Nothing to do"],
    }
  );
}

/* The course editor.
 *
 * The page the office actually spends its time in, and it had no render
 * test at all. The content boxes matter most: they are the four tabs of
 * a course page, they hold hand-written tables, and they are now backed
 * by an editor (public/js/editor.js) that only engages if the markup
 * carries data-rich.
 */
{
  const bodyHtml = {
    description: '<p>Welcome to LangNation.</p><blockquote>B1 is the third level.</blockquote>',
    curriculum: '<h3>Course Contents</h3><table><tbody><tr><td>Module 1</td><td>Vocabulary</td></tr></tbody></table>',
    requirements: '<h3>Placement Test</h3><ul><li>PC, laptop or tablet</li></ul>',
    examPattern: '',
  };
  const one = (over) => ({
    id: 3, slug: "german-regular-b1", lang: "en", title: "German Regular B1",
    level: "B1", levelLabel: "B1", track: "Regular", category: "Regular",
    duration: "10 weeks", lectures: "40", quizzes: 4, seats: 8,
    priceEur: 300, discountEur: 250, status: "published", sortOrder: 3,
    summary: "The third level.", body: bodyHtml, seo: {}, translated: true,
    ...over,
  });

  cases.push(
    {
      view: "rootadmin/course",
      label: "the content boxes are editors, and still the fields that submit",
      locals: {
        site: require("../lib/site"),
        slug: "german-regular-b1",
        current: "en",
        errors: [],
        saved: false,
        canTranslate: false,
        pair: { en: one(), de: null },
      },
      expect: [
        "German Regular B1",
        // Four boxes, each marked for the editor to pick up.
        'name="body_description" rows="9" data-rich',
        'name="body_curriculum" rows="9" data-rich',
        'name="body_requirements" rows="9" data-rich',
        'name="body_exam" rows="9" data-rich',
        // The file that reads that attribute.
        "/js/editor.js",
        // The content itself, escaped into the textarea rather than
        // rendered into the page.
        "&lt;blockquote&gt;",
        // And the rule the prices page enforces, said here too.
        "lower than",
      ],
      // The editor is an enhancement. The textarea is what posts, so it
      // must still be a textarea with a name on it.
      reject: ['<div name="body_description"'],
    }
  );
}

/* Every versioned asset is in the version.
 *
 * A file served as /js/thing.js?v=<assetVersion> whose bytes are not in
 * that hash has a URL that never changes when it changes — so every
 * browser that loaded it once keeps the old copy, for as long as the
 * cache header says. That is not hypothetical twice over: it happened to
 * the back-office stylesheet, which is why the hash exists at all, and
 * then again to /js/editor.js, which was added to a page and not to the
 * list of two files the hash named.
 *
 * Checked by reading the views rather than the list, because the list is
 * the thing that goes wrong.
 */
{
  const siteMod = require("../lib/site");
  const hashed = siteMod.assetFiles || new Set();
  const want = new Set();

  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { scan(full); continue; }
      if (!name.endsWith(".ejs")) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/["'\/]((?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js))\?v=<%=\s*site\.assetVersion/g)) {
        want.add(m[1]);
      }
    }
  };
  scan(VIEWS);

  for (const asset of want) {
    if (!hashed.has(asset)) {
      console.log(`  ✗ /${asset} is served with ?v=assetVersion but is not in the hash`);
      priceFail++;
    } else {
      pricePass++;
    }
  }
  console.log(`\n  ${want.size} versioned asset(s), all in the hash`);
}

/* A separator after the LAST item.
 *
 * Every breadcrumb on the public site ended in a slash pointing at
 * nothing — "Home / Germany Guide /" — for as long as the rule was
 * `.crumbs span::after { content: "/" }`. It is a one-character
 * difference from the right rule, it is invisible to every other check
 * in this suite because the suite reads markup and not CSS, and the
 * back office had it right the whole time, which is the only reason
 * anybody noticed.
 *
 * So: a separator drawn with `::after` on every child is a failure.
 * The correct shape is `x + x::before`, which by construction cannot
 * draw one after the last.
 */
{
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "css", "site.css"), "utf8");

  // Both halves, because the mirror of a trailing slash is a leading
  // one: `span::before` with a divider in it draws before the FIRST
  // item, which is the same mistake facing the other way.
  const DIVIDERS = ['"/"', "'/'", '"·"', '"›"', '"»"', '"|"', '"—"'];
  let looked = 0;

  for (const m of css.matchAll(/([^{}]*::(?:before|after))\s*\{([^}]*)\}/g)) {
    const head = m[1].trim().split(/\r?\n/).pop().trim();
    const body = m[2];
    if (!DIVIDERS.some((d) => body.replace(/\s/g, "").includes("content:" + d))) continue;
    looked++;

    /* An adjacent-sibling combinator is the shape that cannot go
       wrong: `a + a::before` has no first element to sit before and
       `a + a::after` has no last one to sit after. An explicit
       :not(:last-child) / :not(:first-child) says the same thing the
       long way round. */
    const safe = /\+/.test(head) || /:not\(\s*:(?:last|first)-(?:child|of-type)\s*\)/.test(head);
    if (!safe) {
      const side = /::after/.test(head) ? "after the last" : "before the first";
      console.log(`  ✗ ${head} draws a separator ${side} item`);
      priceFail++;
    } else {
      pricePass++;
    }
  }

  if (!looked) {
    console.log("  ✗ no separator rules found — this check is looking at nothing");
    priceFail++;
  } else {
    console.log(`  ${looked} separator rule(s) checked for a stray one at the end`);
  }
}

/* A modifier that loses to the class it modifies.
 *
 * Four bugs in this file have been the same one. An element carries a
 * base class and a modifier — `class="sp-card hw-rank"` — and the
 * modifier is written as a single class, `.hw-rank { background: … }`,
 * somewhere ABOVE `.sp-card` in the file. Equal specificity, later
 * rule wins, so the base class silently takes the property back.
 *
 * It is invisible in review, because the modifier reads correctly on
 * its own, and invisible to every other test here, because the markup
 * is right and only the painting is wrong. The four:
 *
 *   .tl-lessons > li   align-items, lost to .sp-list > li
 *   .sp-cols-even      columns, lost to .sp-cols
 *   .hw-index > li     align-items, lost to .sp-list > li
 *   .hw-rank           background, lost to .sp-card
 *
 * So: find which classes actually appear together in the views, and
 * for each pair check whether the modifier's own rule sits above the
 * base's and sets something the base also sets. Written from the
 * markup rather than from a hand-kept list, because a hand-kept list
 * is what nobody updates.
 */
{
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "css", "site.css"), "utf8");

  /* Comments out first. This file is mostly comments, and a block
     sitting above a rule is otherwise swept into its selector. */
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /* A scanner, not a pattern.

     The first version of this used one regular expression over the
     whole file and quietly lost its place at every @media block: the
     rules inside one are opened by `{` rather than by `}`, so the
     pattern skipped them AND resynchronised on the wrong brace. It
     reported nothing, found nothing when the bug was put back, and
     looked like it was working. `.sp-card` itself was not in the list
     it had built.

     Walking the braces costs twenty lines and cannot go out of step.
     Rules inside an at-rule are collected too — a modifier losing
     inside a media query loses just as hard. */
  const rules = new Map();   // class -> [{ at, props:Set, when }]
  {
    let at = 0;
    let head = "";
    /* Which at-rule we are inside, if any.

       Rules in different media queries are not in conflict — they are
       never both in force. `.hw-other { display: none }` under
       max-width: 859px and `.hw-aside { display: flex }` under
       min-width: 860px describe two different screens, and reporting
       them would be reporting the layout working. */
    const stack = [];
    while (at < bare.length) {
      const ch = bare[at];
      if (ch === "{") {
        const start = at;
        let depth = 1;
        let k = at + 1;
        while (k < bare.length && depth) {
          if (bare[k] === "{") depth++;
          else if (bare[k] === "}") depth--;
          k++;
        }
        const body = bare.slice(start + 1, k - 1);
        const sel = head.trim();

        if (sel.startsWith("@")) {
          // An at-rule: its body is more rules, so go into it.
          stack.push({ when: sel, ends: k });
          at = start + 1;
          head = "";
          continue;
        }

        const props = new Set(
          [...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((p) => p[2])
        );
        if (props.size) {
          // A comma list is several selectors sharing one body.
          for (const one of sel.split(",")) {
            const plain = one.trim().match(/^\.([A-Za-z0-9_-]+)$/);
            if (!plain) continue;
            if (!rules.has(plain[1])) rules.set(plain[1], []);
            rules.get(plain[1]).push({
              at: start, props,
              when: stack.length ? stack[stack.length - 1].when : "",
            });
          }
        }
        at = k;
        head = "";
        continue;
      }
      if (ch === "}") {
        while (stack.length && at + 1 >= stack[stack.length - 1].ends) stack.pop();
        at++;
        head = "";
        continue;
      }
      head += ch;
      at++;
    }
  }

  // Which classes are worn together, straight off the markup.
  const partners = new Map();   // class -> Set of classes seen beside it
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith(".ejs")) continue;
      for (const c of fs.readFileSync(full, "utf8").matchAll(/class="([^"<>]*)"/g)) {
        // Anything with EJS in it is a state class, not a pair.
        if (c[1].includes("<%")) continue;
        const list = [...new Set(
          c[1].split(/\s+/).filter((x) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(x))
        )];
        for (const a of list) {
          if (!partners.has(a)) partners.set(a, new Set());
          for (const b of list) if (a !== b) partners.get(a).add(b);
        }
      }
    }
  };
  walk(VIEWS);

  /* Which of the two is the BASE.
   *
   * Derived, not listed: the base is the one worn with more different
   * things. `.sp-card` turns up beside a dozen classes and `.hw-rank`
   * beside two, so `.sp-card` is the base and `.hw-rank` modifies it.
   * The same test says `.pill` is the base of `.pill-live`, which is
   * why a variant written after its base — the correct way round — is
   * not reported.
   *
   * A list would have been shorter and would have gone stale the first
   * time somebody added a card class. */
  let looked = 0;
  const said = new Set();

  for (const [mod, beside] of partners) {
    const mods = rules.get(mod);
    if (!mods) continue;

    for (const base of beside) {
      const bases = rules.get(base);
      if (!bases) continue;
      // The base is the more widely worn of the two.
      if ((partners.get(base) || new Set()).size <= beside.size) continue;

      for (const b of bases) {
        for (const d of mods) {
          if (d.when !== b.when) continue;      // never both in force
          if (d.at > b.at) continue;            // the modifier wins anyway
          const clash = [...d.props].filter((p) => b.props.has(p));
          if (!clash.length) continue;
          const key = mod + ">" + base + ">" + clash.join(",");
          if (said.has(key)) continue;
          said.add(key);
          looked++;
          console.log(`  ✗ .${mod} sets ${clash.join(", ")} above .${base}, ` +
                      `which sets ${clash.length === 1 ? "it" : "them"} too — ` +
                      `.${base} wins. Write .${base}.${mod}`);
          priceFail++;
        }
      }
    }
  }
  if (!looked) {
    console.log("  no modifier loses to the class it modifies");
    pricePass++;
  }
}

/* A one-column grid that cannot be one column.
 *
 * `grid-template-columns: 1fr` is `minmax(auto, 1fr)`: the track will
 * not shrink below the min-content width of what is in it. For a
 * single full-width column — the "collapse to one column on a phone"
 * pattern — that is never what is wanted, and it has now gone wrong
 * three times in this file.
 *
 * The last one was the whole back office. `.ad-shell` collapsed to
 * `1fr`, the sidebar inside it is a strip of nowrap links, and the
 * column sized itself to that strip laid out flat: every admin page
 * was 1122px wide on a 375px phone, scrolling sideways.
 *
 * Only the SINGLE-track form is checked. A blanket rule against `1fr`
 * would fire on sixty-six perfectly good multi-column layouts and be
 * switched off within a week, which is the same reason the reserved
 * word list above is short.
 */
{
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "css", "site.css"), "utf8");
  const lines = css.split(/\r?\n/);
  let seen = 0;

  lines.forEach((line, i) => {
    if (!/grid-template-columns:\s*1fr\s*;/.test(line)) return;
    seen++;
    console.log(`  \u2717 site.css:${i + 1} single-column 1fr is minmax(auto, 1fr) and ` +
                "will not shrink below its content — use minmax(0, 1fr)");
    priceFail++;
  });

  if (!seen) {
    console.log("  every single-column grid is minmax(0, 1fr)");
    pricePass++;
  }
}

/* Sitting a piece of homework.
 *
 * The page is served with every question on it and no answers on any
 * of them, which is the property worth asserting: an answer key in the
 * page source is readable by anybody who presses Ctrl+U, and once it
 * has been read the exercise is worth nothing to the person who read
 * it. So the fixture below has answers in it, and the test rejects
 * every one of them appearing in the rendered page.
 */
{
  const exFmt = require("../lib/exercise-format");
  const exLib = require("../lib/exercises");

  // Written the way a teacher would write it, then put through the
  // real parser and the real answer-stripping — not hand-built into
  // the shape the view wants. A fixture that skips those two steps
  // tests the template against a shape nothing produces.
  const source = [
    "# Präsens im Alltag",
    "# Setze die richtige Form ein.",
    "",
    "Ich ___ Student.",
    "* bin",
    "  bist",
    "  ist",
    "> „sein“ in der 1. Person Singular: ich bin.",
    "",
    "Sie ___ aus Italien.",
    "= kommt",
    "> 3. Person Singular: sie kommt.",
    "",
    "Ich [bin|bist|ist] Student und [wohne|wohnt] in Berlin.",
    "",
    "Wir ___ nach Berlin und ___ dort.",
    "= fahren",
    "= bleiben",
  ].join("\n");

  const parsed = exFmt.parse(source);

  // What forStudent() would return, built by the same rules: a choice
  // keeps its options and loses which one is right; a gap sends only
  // the sentence.
  const questions = parsed.questions.map((q, i) => {
    const base = { id: 100 + i, seq: i + 1, kind: q.kind, prompt: q.prompt, image: q.image || null };
    if (q.kind === "choice") return { ...base, options: q.options };
    if (q.kind === "dropdown") return { ...base, gaps: q.gaps.map((g) => ({ options: g.options })) };
    return base;
  });

  const shell = (over) => ({
    site: require("../lib/site"),
    // The site header is on this page now — it was the only one
    // without one — so it needs what every other portal page gives it.
    student: { name: "Anita Sharma", student_ref: "LNS0007" },
    avatarUrl: null, initials: "AS", hue: 150,
    siblings: [],
    attemptId: 7,
    ex: {
      id: 12, title: parsed.title, intro: parsed.intro, passage: null,
      skill: "grammar", level: "A1", due_on: null,
      batch_code: "LNIKB01", course_title: "Fast Track",
      questions,
      ...(over || {}),
    },
  });

  /* The real Kapitel 9, from the file that ships.
   *
   * Built out of content/homework rather than a hand-written source,
   * because the thing worth holding is the whole path: the importer
   * reads the school's worksheet, the format parses what it wrote,
   * and the page shows it. A fixture typed by hand next to it would
   * agree with itself forever while the shipped file rotted.
   *
   * It is the chapter with everything in it — eight pages, marked
   * gaps, tasks nothing marks, and a reading text with a picture on
   * the last one.
   */
  {
    const fs = require("fs");
    const real = exFmt.parse(
      fs.readFileSync("content/homework/intensive-a1-b1/09-negation.txt", "utf8"));

    const engine = require('../lib/homework-engine');
    cases.push({
      view:'portal/exercise', label:'the real chapter uses the reusable learning controls without exposing keys',
      locals:{...shell({id:99,title:real.title,learning:true}),keep:'',next:null,unlocked:false,published:true,
        learningChapter:engine.publicChapter(real.learning,engine.initial()),learningState:engine.initial()},
      expect:['Kapitel 09','learning-data','homework-learning.js','homework-learning.css',
        'fill_blank','insert_word','text_highlight','categorize','short_answer','Kein perfekter Montag',
        '/img/homework/kein-perfekter-montag.webp'],
      reject:['"accepted"','"positions"','"groups"','keines','hw-write','data-hw-show'],
    });
  }

  cases.push(
    {
      view: "portal/exercise",
      label: "every question is there, and not one answer is",
      locals: shell(),
      expect: [
        "Präsens",
        // Numbered rows rather than a card per question: the whole
        // worksheet on one page, the way the workbook has it.
        'class="hw-row', 'id="frage-1"', 'id="frage-4"',
        // Each kind rendered as its own control.
        'type="radio"', "hw-blank", "hw-drop",
        // The dropdown's choices have to be visible — they are in the
        // sentence — so what is hidden is which one is right.
        'value="bin"', 'value="bist"',
        // Progress, and the way out.
        "hw-bar", "/portal/homework",
      ],
      reject: [
        // The gap answers. These exist in the source and must not reach
        // the browser in any form: not in a value, not in a data
        // attribute, not in a comment.
        "kommt\"", "fahren", "bleiben",
        // Nor the explanations, which give the answer away in words.
        "1. Person Singular", "3. Person Singular",
        // Nor anything that says which option was written first.
        'data-answer', '"answer"',
      ],
    },
    /* The list down the side, and coming back to it later. */
    {
      view: "portal/exercise",
      label: "every question is listed, with the theme toggle kept",
      locals: shell(),
      expect: [
        // The same three columns the blog uses: everything on the
        // left, the page in the middle, what is on it down the right.
        "hw-other", "hw-onpage", "On this page",
        // One jump link per question, and they are real anchors — so
        // they work with the script blocked and a question can be
        // linked to.
        'data-hw-jump="1"', 'href="#frage-4"',
        "Ich ___ Student",
        // The site header, which is where the logo and the light
        // switch live. This was the only page on the site without it.
        "site-header", "data-theme-toggle",
      ],
    },
    {
      view: "portal/exercise",
      label: "what was already answered is marked, and says how to start over",
      locals: (() => {
        const base = shell();
        return {
          ...base,
          // Three of four answered: two right, one wrong.
          done: {
            [base.ex.questions[0].id]: true,
            [base.ex.questions[1].id]: false,
            [base.ex.questions[2].id]: true,
          },
        };
      })(),
      expect: [
        // Marked on the row and on the jump link beside it, so the
        // list is a record of how it went and not only a way about.
        "hw-row is-right", "hw-row is-wrong", "hw-jump is-right",
        "of 4 answered",
        // Nothing is lost on the way back, so starting over is a
        // deliberate thing that has to be offered.
        "hw-foot-again", "Noch einmal üben", "?fresh=1",
      ],
    },
    {
      view: "portal/exercise",
      label: "...and nothing answered yet offers nothing to start over from",
      locals: shell(),
      // The class, not the words: the same words sit in the finished
      // panel, which is on the page from the start and hidden.
      reject: ["hw-foot-again", "is-right", "is-wrong"],
    },
    /* Coming back to one that is already done.
     *
     * This is the bug the student hit: a finished attempt closed, the
     * page found nothing open, started a blank one, and a chapter
     * completed the night before read "0 of 6 answered". The answers
     * had been in the database the whole time.
     *
     * So a finished attempt is now read back — and read back means
     * read: check() refuses an answer against a closed attempt, so
     * every box on it has to arrive disabled rather than live and
     * silently useless. */
    {
      view: "portal/exercise",
      label: "a finished attempt is shown, not thrown away",
      locals: (() => {
        const base = shell();
        const q = base.ex.questions;
        return {
          ...base,
          finished: true,
          done: { [q[0].id]: true, [q[1].id]: true, [q[2].id]: false, [q[3].id]: true },
        };
      })(),
      expect: [
        "hw-sheet is-finished",
        // What it was, said plainly, with the one button that makes
        // sense beside it.
        "Schon gemacht", ">3<", "Noch einmal üben", "?fresh=1",
        // Nothing on a closed attempt is writable.
        "disabled",
      ],
      reject: [
        "hw-row-go", "Alles prüfen", "/finish",
        // No point choosing when to mark a sheet that cannot be marked.
        "data-hw-mode",
      ],
    },
    /* Finishing carries on through the book.
     *
     * Landing back on the contents page is where somebody just came
     * from, and where they would now have to find their place among
     * forty-one chapters again. */
    {
      view: "portal/exercise",
      label: "finishing offers the next chapter by name",
      locals: { ...shell(), next: { id: 13, title: "A1 · Kapitel 02 — Präsens" } },
      expect: [
        'href="/portal/homework/13"', "A1 · Kapitel 02 — Präsens",
        // The button posts, and the server sends them on — so it says
        // where it goes rather than "Fertig".
        ">Weiter<", "/portal/homework/12/finish",
      ],
    },
    {
      view: "portal/exercise",
      label: "...and says Fertig when there is no next chapter",
      locals: shell(),
      expect: [">Fertig<"],
      reject: ["Als Nächstes"],
    },
    /* Mark each answer as it is written, or fill the sheet in and mark
       it all at once. Which of those somebody wants is not a thing a
       website gets to decide for them. */
    {
      view: "portal/exercise",
      label: "the student chooses when their answers are marked",
      locals: shell(),
      expect: [
        'data-hw-mode-set="each"', 'data-hw-mode-set="end"',
        "nach jeder Antwort", "am Ende",
        // Hidden until the script runs: with it blocked every row has
        // its own button and the choice does not arise.
        "data-hw-mode hidden",
        // ...and with it blocked, every row still has its own button.
        "hw-row-go", "Alles prüfen",
      ],
    },
    /* "Unlocked for you only" sat on every chapter this school sets,
       because every one of them is given to chosen people. It said the
       same thing forty-one times and told a student nothing they could
       act on. The draft case is the one that earns its place. */
    {
      view: "portal/exercise",
      label: "a published chapter does not announce that it was unlocked",
      locals: { ...shell(), unlocked: true, published: true },
      reject: ["hw-unlocked", "Unlocked for you"],
    },
    {
      view: "portal/exercise",
      label: "...but a draft says the class cannot see it yet",
      locals: { ...shell(), unlocked: true, published: false },
      expect: ["hw-unlocked", "Still a draft"],
    },
    /* The way back was two grey words with a dot between them, which
       reads as a caption and not a door. */
    {
      view: "portal/exercise",
      label: "the way back is a pair of buttons, not a caption",
      locals: shell(),
      expect: ["hw-back-one", "Meine Aufgaben", "Dashboard", 'href="/portal/me"'],
    },
    /* The filters travel on.
     *
     * The list beside a worksheet is the contents page's list, and it
     * can only show what was chosen there if every link from here
     * keeps saying so. Worth a case of its own because the natural way
     * to default the local — `const keep = typeof keep ... ` — throws
     * rather than defaulting: the declaration shadows the local for
     * the whole scope and `typeof` on a const in its own dead zone is
     * a ReferenceError, not "undefined". */
    {
      view: "portal/exercise",
      label: "the level and course carry on to every link",
      locals: {
        ...shell(),
        keep: "?course=Fast%20Track&level=A1",
        keepFresh: "?course=Fast%20Track&level=A1&fresh=1",
        next: { id: 13, title: "A1 · Kapitel 02 — Präsens" },
        siblings: [{ id: 13, title: "A1 · Kapitel 02 — Präsens", level: "A1",
                     questions: 6, tries: 0, started: 0, best: null, mark: "" }],
      },
      // &amp; and not &: an ampersand in an href is escaped in HTML,
      // and the browser reads it back as one separator.
      expect: [
        // Back to the contents page, on to a sibling, and on to next.
        'href="/portal/homework?course=Fast%20Track&amp;level=A1"',
        'href="/portal/homework/13?course=Fast%20Track&amp;level=A1"',
        // Going again keeps them too, with its own flag on the end.
        'href="/portal/homework/12?course=Fast%20Track&amp;level=A1&amp;fresh=1"',
      ],
      // The bare forms would mean a link had been missed.
      reject: ['href="/portal/homework/12?fresh=1"'],
    },
    {
      view: "portal/exercise",
      label: "...and no filters means clean links, not a stray question mark",
      locals: shell(),
      expect: ['href="/portal/homework"', 'href="/portal/homework/12?fresh=1"'],
      reject: ["/portal/homework?"],
    },
    /* The way out, and the record of the other chapters.
     *
     * On a phone the left-hand list is hidden, so without the back
     * link the only way to the portal was the browser's own button. */
    {
      view: "portal/exercise",
      label: "there is a way back, and finished chapters carry a tick",
      locals: {
        ...shell(),
        siblings: [
          { id: 12, title: "Präsens im Alltag", level: "A1", questions: 4, tries: 0, started: 0, best: null },
          { id: 13, title: "Perfekt mit haben", level: "A1", questions: 6, tries: 2, started: 2, best: 6 },
          // Handed in below the pass mark, and opened without being
          // handed in. Both say the same thing to a student — go
          // again — so both get the ring.
          { id: 14, title: "Wechselpräpositionen", level: "A1", questions: 6, tries: 1, started: 1, best: 2 },
          { id: 15, title: "Trennbare Verben", level: "A1", questions: 6, tries: 0, started: 1, best: null },
        ].map((r) => ({ ...r, mark: require("../lib/exercises").markOf(r) })),
      },
      expect: [
        // Out of here.
        "hw-back", 'href="/portal/homework"', 'href="/portal/me"',
        // Finished, opened but not handed in, and never touched.
        "hw-chapter is-done", "hw-chapter is-part",
        "Perfekt mit haben", "Wechselpräpositionen", "Trennbare Verben",
      ],
    },
    /* Homework given to chosen people has no batch, and the eyebrow
       printed the separator regardless — leaving a lonely "· B1" over
       the title, which is what it looked like on the live site. */
    {
      view: "portal/exercise",
      label: "no batch means no stray separator above the title",
      locals: (() => {
        const base = shell();
        return {
          ...base,
          // Homework given to chosen people: no course and no batch.
          ex: { ...base.ex, batch_code: null, course_title: null, level: "B1" },
        };
      })(),
      expect: [">B1<"],
      reject: ["· B1"],
    },
    /* Which course set it. Somebody on two of them has chapter numbers
       running over each other, and "A1 · Kapitel 03" on its own says
       nothing about who set it. */
    {
      view: "portal/exercise",
      label: "the course is named above the title",
      locals: shell(),
      expect: ["Fast Track · LNIKB01 · A1"],
    },
    {
      view: "portal/exercise",
      label: "a reading passage sits beside the questions",
      locals: shell({ passage: "Marco kommt aus Italien.\nEr wohnt in München." }),
      expect: ["hw-passage", "Marco kommt aus Italien", "Lies den Text"],
    },
    {
      view: "portal/exercise",
      label: "...and there is no passage panel when there is no passage",
      locals: shell(),
      reject: ["hw-passage"],
    },
    {
      view: "portal/exercise",
      label: "a picture rides with the question that needs one",
      locals: shell({
        questions: questions.map((q, i) =>
          i === 0 ? { ...q, image: "/img/homework/markt.jpg" } : q),
      }),
      expect: ["/img/homework/markt.jpg", 'loading="lazy"'],
    },
    {
      view: "portal/exercise",
      label: "it works with the script blocked: real forms, real buttons",
      locals: shell(),
      expect: [
        // Every question is a form that posts on its own, so a student
        // with JavaScript off gets a duller page rather than a broken
        // one.
        'method="post"', 'action="/portal/homework/12/check"',
        'name="attempt"', 'name="question"', 'name="given"',
        'type="submit"',
      ],
    }
  );
}

/* A chapter of the real workbook, in the real player.
 *
 * tools/import-workbook.js reads LangNation's own A1–B1 grammar book
 * and writes exercise sources from it. This renders one of them, so
 * that what the school actually teaches is what gets looked at rather
 * than a fixture invented to flatter the design.
 *
 * Written out here rather than read from the workbook directory,
 * because the suite has to run on a checkout that has no .docx in it —
 * but it is the importer's output, copied verbatim, not something
 * composed for the test.
 */
{
  const exFmt = require("../lib/exercise-format");
  const real = [
    "# A2 · Kapitel 16 — Reflexive Verben",
    "# Ergänze die passende Form.",
    "",
    "Ich ___ ___ für Musik. (interessieren)",
    "= interessiere",
    "= mich",
    "",
    "Du ___ ___ auf Freitag. (freuen)",
    "= freust",
    "= dich",
    "",
    "Er ___ ___ mit Freunden. (treffen)",
    "= trifft",
    "= sich",
    "",
    "Wir ___ ___ beeilen. (müssen)",
    "= müssen",
    "= uns",
    "",
    "Ihr ___ ___ an den Termin. (erinnern)",
    "= erinnert",
    "= euch",
    "",
    "Sie ___ ___ die Hände. (waschen)",
    "= wäscht",
    "= sich",
  ].join("\n");

  const parsed = exFmt.parse(real);

  cases.push(
    {
      view: "portal/exercise",
      label: "a real chapter of the LangNation workbook",
      locals: {
        site: require("../lib/site"),
        attemptId: 9,
        ex: {
          id: 16, title: parsed.title, intro: parsed.intro, passage: null,
          skill: "grammar", level: "A2", due_on: null,
          batch_code: "LNRKB02", course_title: "German Regular A2",
          questions: parsed.questions.map((q, i) => ({
            id: 200 + i, seq: i + 1, kind: q.kind, prompt: q.prompt, image: null,
          })),
        },
      },
      expect: ["Reflexive Verben", "für Musik", 'id="frage-6"', "hw-blank"],
      /* The answers, none of which may reach the browser.

         "interessiere" is deliberately not on this list and its
         absence is the point: the question shows the infinitive as a
         hint — „(interessieren)" — and the answer is a substring of
         it. A test that rejected it would fail on the hint the student
         is supposed to see. The other eleven answers share no stem
         with their own prompt, so they say what this needs to say. */
      reject: [
        "freust", "trifft", "erinnert", "wäscht", "müssen uns",
        "mich", "dich", "sich", "euch",
      ],
    },
    /* Every sentence in that chapter has TWO blanks, and the importer
       reads the answer "interessiere mich" as one per blank. A page
       that renders one box where the teacher wrote two is a question
       nobody can answer correctly, and it would look completely
       normal. */
    {
      view: "portal/exercise",
      label: "...and a sentence with two blanks gets two boxes",
      locals: {
        site: require("../lib/site"),
        attemptId: 9,
        ex: {
          id: 16, title: "Reflexive Verben", intro: "", passage: null,
          skill: "grammar", level: "A2", due_on: null,
          batch_code: "LNRKB02", course_title: "German Regular A2",
          questions: [{ id: 300, seq: 1, kind: "gap",
                        prompt: "Ich ___ ___ für Musik. (interessieren)", image: null }],
        },
      },
      // Both gaps rendered. A sentence with one box where the teacher
      // wrote two is a question nobody can answer correctly, and it
      // would look entirely normal.
      expect: ['aria-label="Answer 1, question 1"', 'aria-label="Answer 2, question 1"'],
    }
  );
}

/* The homework contents page.
 *
 * Its whole job is to say what is set and what has been done, so the
 * states worth asserting are the ones that differ: never opened,
 * opened and scored, and overdue. A list that shows all three the same
 * way is a list nobody can scan.
 */
{
  const hwShell = (items, over) => ({
    site: require("../lib/site"),
    student: { name: "Anita Sharma", student_ref: "LNS0007" },
    avatarUrl: null, initials: "AS", hue: 150, notice: null,
    items,
    standings: null,
    ...(over || {}),
  });

  // Built through the real rule rather than with a `mark` typed in, so
  // a fixture can never claim a state the library would not give it.
  const exLib = require("../lib/exercises");
  const row = (over) => {
    const r = {
      id: 16, title: "A2 · Kapitel 16 — Reflexive Verben",
      intro: "Ergänze die passende Form.", skill: "grammar", level: "A2",
      due_on: null, batch_code: "LNRKB02", course_title: "German Regular A2",
      questions: 6, best: null, tries: 0, started: 0,
      book: "regular-a2", bookTitle: "German Regular A2", ...over,
    };
    return { ...r, mark: exLib.markOf(r) };
  };

  cases.push(
    {
      view: "portal/homework",
      label: "what is set, what was scored, and what has not been opened",
      locals: hwShell([
        row({ id: 16, best: 6, tries: 2 }),
        row({ id: 31, title: "B1 · Kapitel 31 — Konjunktiv II", level: "B1" }),
      ]),
      expect: [
        "Reflexive Verben", "Konjunktiv II",
        "6 questions",
        // Scored, with the number of goes.
        "6/6", "2 tries",
        // Started once says Again; never opened says Start. Not
        // anchored on > and <: the button text sits on its own line in
        // the template, so the angle brackets are not next to it.
        "Again", "Start",
        "/portal/homework/16", "/portal/homework/31",
      ],
      /* No pass mark anywhere. This is practice with unlimited goes,
         and a pass mark turns a thing you do in order to learn into a
         thing you can fail at. */
      reject: ["Passed", "Failed", "pass mark"],
    },
    {
      view: "portal/homework",
      label: "two books, so the student can pick one",
      locals: hwShell([
        row({ id: 16 }),
        /* A Fast Track chapter. Its book runs A1 to B1, so it has no
           CEFR level of its own \u2014 which filed it under "Not graded",
           true and no use at all to somebody looking for it. The book
           is the thing the student was actually given. */
        row({
          id: 99, title: "Kapitel 09 \u2014 Negation", level: null,
          batch_code: "LNIKB02", course_title: "Fast Track A1\u2013B1",
          book: "intensive-a1-b1", bookTitle: "Fast Track A1\u2013B1",
        }),
      ]),
      expect: [
        "data-hw-book",
        /* Named by its book, which is what the student holds. */
        "German Regular A2", "Fast Track A1\u2013B1",
        // ...and every row says which book it is from, so the filter
        // has something to match on.
        'data-book="regular-a2"', 'data-book="intensive-a1-b1"',
      ],
    },
    {
      view: "portal/homework",
      label: "one book is not a choice, so there is no dropdown",
      locals: hwShell([row({ id: 16 }), row({ id: 31, title: "A2 \u00b7 Kapitel 17" })]),
      /* A dropdown with one answer in it is a label pretending to be
         a choice, and one more thing to read past on a phone. */
      reject: ["data-hw-book"],
    },
    {
      view: "portal/homework",
      label: "overdue and never opened is said, quietly",
      locals: hwShell([row({ due_on: "2020-01-06" })]),
      expect: ["was due", "hw-late"],
    },
    {
      view: "portal/homework",
      label: "...but not once it has been done",
      locals: hwShell([row({ due_on: "2020-01-06", best: 4, tries: 1 })]),
      expect: ["due", "4/6"],
      reject: ["hw-late"],
    },
    {
      view: "portal/homework",
      label: "nothing set says what will appear here, not just nothing",
      locals: hwShell([]),
      expect: ["Noch keine Aufgaben", "Antwort richtig ist"],
    },
    /* Level, then topic.
     *
     * A workbook is forty-one chapters and a list of forty-one
     * chapters is a wall, not a list. What is asserted here is that
     * every row carries what the dropdowns filter on — a row with no
     * data-level is a row the filter silently loses. */
    {
      view: "portal/homework",
      label: "level and topic narrow the list, and every row can be narrowed",
      locals: hwShell([
        row({ id: 16, best: 6, tries: 2 }),
        row({ id: 31, title: "B1 · Kapitel 31 — Konjunktiv II", level: "B1" }),
      ]),
      expect: [
        "data-hw-filter", "data-hw-level", "data-hw-topic",
        // Every row, filterable. The id is what the topic dropdown
        // matches on, so a title repeated across two levels still
        // picks out one chapter.
        'data-hw-item data-level="A2" data-id="16"',
        'data-hw-item data-level="B1" data-id="31"',
        // The whole ladder is offered, not only what is unlocked: a
        // student who can see A1 should be able to find out B1 exists
        // and ask for it.
        '<option value="C1"', "(locked)",
        // ...and the asking is on the page, addressed to the school.
        "data-hw-none", require("../lib/site").contact.email,
      ],
    },
    /* The tick is 80% on the best attempt.
       Two earlier rules both failed the same way, by asking one mark
       to carry two facts: full marks meant 5 of 6 looked untouched,
       and "handed in" meant 0 of 6 showed a green tick. */
    {
      view: "portal/homework",
      label: "the tick is the pass mark, not the fact of handing it in",
      locals: hwShell([
        row({ id: 16, best: 6, tries: 1, started: 1 }),                                     // 100%
        row({ id: 17, title: "A2 · Kapitel 17 — Dativ", best: 5, tries: 1, started: 1 }),   // 83%, just over
        row({ id: 18, title: "A2 · Kapitel 18 — Genitiv", best: 4, tries: 2, started: 2 }), // 67%, under
        row({ id: 19, title: "A2 · Kapitel 19 — Genus", best: 0, tries: 1, started: 1 }),   // handed in, nothing right
        row({ id: 20, title: "A2 · Kapitel 20 — Passiv", tries: 0, started: 1 }),           // opened, not handed in
        row({ id: 21, title: "A2 · Kapitel 21 — Futur", tries: 0, started: 0 }),            // never touched
      ]),
      expect: [
        'class="hw-tick is-done"', 'class="hw-tick is-part"', 'class="hw-tick "',
        // The score is still on the row, so the mark never stands in
        // for the number.
        "5/6", "4/6", "0/6",
        // Handed in is "Again", opened and left is "Continue", and
        // untouched is "Start" — three buttons for the three states.
        "Again", "Continue", "Start",
      ],
    },
    /* One button for the whole of what is showing. Picking a level and
       then hunting down the first chapter in it is two decisions for
       one intention. */
    {
      view: "portal/homework",
      label: "one button starts the level that is showing",
      locals: hwShell([row({ id: 16 }), row({ id: 31, level: "B1" })]),
      expect: ["data-hw-go", 'href="/portal/homework/16"'],
    },
    /* Where you stand, above the list.
     *
     * The ask was "a small progress bar with a rank system" out of a
     * reference dashboard that had a medal, five bars, a radar chart
     * and a row of stat tiles. What is asserted here is the small
     * part, and — harder and more important — what is NOT on it. */
    {
      view: "portal/homework",
      label: "the panel shows a bar, a position and how much is right",
      locals: hwShell([row({ id: 16, best: 6, tries: 1, started: 1 })], {
        standings: {
          passed: 8, done: 11, got: 60, asked: 70, accuracy: 86,
          classes: [{
            batch: { id: 12, code: "LNRKB02", course_title: "German Regular A2" },
            rank: 3, of: 12, top: 11,
          }],
        },
      }),
      expect: [
        // The place comes first and the bar after it, which is the
        // order it was asked for.
        // Rank on the left, progress in a box on the right.
        "hw-rank", "hw-rank-left", "hw-rank-box", "hw-rank-medal", "LNRKB02",
        // The denominator is never smaller than what has been passed:
        // a chapter taken back after being passed used to leave "8 of
        // 1 passed" and a bar eight times its own track.
        "<strong>8</strong> of 8 passed",
        "<strong>86%</strong> right", "<strong>3rd</strong> of 12",
        // The class's best, so somebody can see the room moving.
        "Best is 11",
        'role="progressbar"',
      ],
      /* The panel is a position, not a table of people. That nobody
         else's NAME can reach it is guaranteed where it matters — in
         lib/exercises, which never returns one; check-exercises
         asserts that. Here: no list of classmates on the page. */
      reject: ["leaderboard", "Top 10", "hw-rank-list"],
    },
    {
      view: "portal/homework",
      label: "...and 1st of 1 is not a rank, so no position is shown",
      locals: hwShell([row({ id: 16 })], {
        standings: {
          passed: 0, done: 0, got: 0, asked: 0, accuracy: null,
          classes: [{
            batch: { id: 12, code: "LNRKB02", course_title: null },
            rank: 1, of: 1, top: 0,
          }],
        },
      }),
      expect: ["hw-rank", "<strong>0</strong> of 1 passed"],
      // No accuracy either: "0% right" about a blank record is a lie.
      reject: ["% right", "Top "],
    },
    {
      view: "portal/homework",
      label: "three classes are three places on one card, not three cards",
      locals: hwShell([row({ id: 16 }), row({ id: 17, level: "B1" })], {
        standings: {
          passed: 1, done: 3, got: 8, asked: 21, accuracy: 38,
          classes: [
            { batch: { id: 1, code: "LNIKB01", course_title: "Fast Track" },
              rank: 1, of: 6, top: 1 },
            { batch: { id: 2, code: "LNIKB02", course_title: "Fast Track" },
              rank: 1, of: 4, top: 1 },
            { batch: { id: 3, code: "LNRKB02", course_title: "German Regular A2" },
              rank: 1, of: 3, top: 1 },
          ],
        },
      }),
      expect: [
        // The biggest class leads, because a place out of six says
        // something and a place out of three says less.
        "LNIKB01", "<strong>1st</strong> of 6",
        // The other two are a footnote on one line.
        "hw-rank-also", "LNIKB02", "LNRKB02",
        /* One bar, over everything they have. The figures are the
           student's own and do not change from class to class, so
           three cards used to mean three copies of the same bar — and
           one of them read "1 of 52 passed" because the denominator
           was per batch while the numerator was not. */
        "<strong>1</strong> of 2 passed",
      ],
      // One card. Three of them was the bug.
      check: (html) => (html.split('class="sp-card sp-wide hw-rank"').length - 1 === 1
        ? null : "there is more than one rank card"),
    },
    /* Gold, silver, bronze, and a plain disc after that.
     *
     * Drawn rather than 🥇🥈🥉: the emoji the reference uses are a
     * different picture on every platform — a ribbon on Windows, a
     * flat roundel on Android — and a rank that changes shape with the
     * student's phone is not one they can compare with anybody. */
    ...[[1, "is-gold"], [2, "is-silver"], [3, "is-bronze"], [4, "is-plain"]].map(
      ([rank, face]) => ({
        view: "portal/homework",
        label: `rank ${rank} wears ${face.replace("is-", "")}`,
        locals: hwShell([row({ id: 16 })], {
          standings: {
            passed: 1, done: 1, got: 5, asked: 6, accuracy: 83,
            classes: [{
              batch: { id: 1, code: "LNIKB01", course_title: "Fast Track" },
              rank, of: 9, top: 3,
            }],
          },
        }),
        expect: [`hw-rank-medal ${face}`, `<b>${rank}</b>`],
        // The ribbon is for the first three only. A medal everybody
        // gets is not a medal.
        reject: face === "is-plain" ? ["hw-medal-ribbon"] : [],
      })
    ),
    {
      view: "portal/homework",
      label: "the first three get a ribbon and fourth does not",
      locals: hwShell([row({ id: 16 })], {
        standings: {
          passed: 1, done: 1, got: 5, asked: 6, accuracy: 83,
          classes: [{
            batch: { id: 1, code: "LNIKB01", course_title: "Fast Track" },
            rank: 3, of: 9, top: 3,
          }],
        },
      }),
      expect: ["hw-medal-ribbon", "hw-medal-disc", "hw-medal-rim"],
      // No emoji anywhere: they are the thing this replaced.
      reject: ["🥇", "🥈", "🥉", "🏅"],
    },
    {
      view: "portal/homework",
      label: "...and no class at all means no panel",
      locals: hwShell([row({ id: 16 })], { standings: null }),
      reject: ["hw-rank"],
    },
    /* The course dropdown is always there.

       It used to be drawn only when there was more than one course, on
       the reasoning that one course is not a filter but a word taking
       up a row. Wrong in use: with it missing there is no way to tell
       "you are on one course" from "the course was never recorded on
       this homework", and those are very different problems to have. */
    {
      view: "portal/homework",
      label: "one batch still says which one it is",
      locals: hwShell([row({ id: 16 }), row({ id: 17, level: "B1" })]),
      expect: ["data-hw-course", "LNRKB02 — German Regular A2"],
    },
    {
      view: "portal/homework",
      label: "...and homework with no course says that, rather than nothing",
      locals: hwShell([row({ id: 16, course_title: null, batch_code: null })]),
      expect: ["data-hw-course", "Set for you"],
    },
    {
      view: "portal/homework",
      label: "two batches get two groups, even under one course name",
      locals: hwShell([
        row({ id: 16, batch_code: "LNIKB01", course_title: "Fast Track" }),
        // The SAME course, a different class. This is the case that
        // was broken: keyed on the title, these two merged into one
        // pile with the chapter numbers of both running through it.
        row({ id: 40, title: "A1 · Kapitel 01 — Personalpronomen", level: "A1",
              batch_code: "LNIKB02", course_title: "Fast Track" }),
      ]),
      expect: [
        "data-hw-course", "All my courses",
        // The code first, because it is what tells them apart.
        "LNIKB01 — Fast Track", "LNIKB02 — Fast Track",
        'data-course="LNIKB01"', 'data-course="LNIKB02"',
      ],
    },
    /* Homework given to chosen people has no course and no batch. The
       group key used to be `course_title || batch_code`, which was
       undefined for every one of them — so all forty-one landed in a
       single group under a blank heading. */
    {
      view: "portal/homework",
      label: "homework set for one person is grouped under a name, not a blank",
      locals: hwShell([row({ id: 16, course_title: null, batch_code: null })]),
      expect: ["Set for you", 'data-course="—"'],
    }
  );
}

/* The office's homework pages.
 *
 * The unlock is the part worth testing hardest, because getting it
 * wrong in the lenient direction hands one student's homework to
 * another and it would look like it was working. The page has to say
 * plainly who can see a thing, and "unlocked for one person" has to
 * read differently from "published to the batch" at a glance.
 */
{
  const adminShell = (extra) => ({
    site: require("../lib/site"),
    done: null,
    problem: null,
    ...extra,
  });

  /* The homework editor's locals.
   *
   * Every case below overrides only what it is about, so a new local on
   * the page is added here once rather than in nine fixtures — and a
   * case that forgets one fails on the template rather than on the
   * thing it meant to check. */
  const exShell = (over) => adminShell({
    ex: { id: 0, title: "", source: "", intake_id: null, due_on: null, published: 0 },
    picked: null,
    library: [
      { id: "regular-a2/A2-16.txt", book: "regular-a2",
        title: "A2 · Kapitel 16 — Reflexive Verben", level: "A2", questions: 6 },
      { id: "regular-a1/A1-01.txt", book: "regular-a1",
        title: "A1 · Kapitel 01 — Personalpronomen", level: "A1", questions: 6 },
    ],
    audience: "all",
    willGet: [],
    batches: [{ id: 12, code: "LNRKB02", course_title: "German Regular A2", heads: 8 }],
    people: [
      { id: 1, name: "Anita Sharma", email: "anita@example.com",
        student_ref: "LNS0007", created_at: "2026-09-01" },
    ],
    unlocked: [],
    hasUnlock: true,
    questionCount: 0,
    problems: [],
    ...over,
  });

  const exRow = (over) => ({
    id: 5, title: "A2 · Kapitel 16 — Reflexive Verben", skill: "grammar",
    level: "A2", due_on: null, published: 0, created_at: "2026-09-20",
    unlock_emails: null, questions: 6, students: 0, ...over,
  });

  cases.push(
    {
      view: "rootadmin/exercises",
      label: "who can see each one, said three different ways",
      locals: adminShell({
        groups: [{
          id: 12, code: "LNRKB02", course_title: "German Regular A2",
          rows: [
            exRow({ id: 5, unlock_emails: "herr@langnation.com" }),
            exRow({ id: 6, title: "B1 · Kapitel 31", published: 1, students: 4 }),
            exRow({ id: 7, title: "A1 · Kapitel 01", published: 0 }),
          ],
        }],
      }),
      expect: [
        // Unlocked beats everything else and names the person.
        "herr@langnation.com",
        // Published to the batch.
        "the batch",
        // Neither: a draft nobody can see.
        "draft — nobody",
        // The way in is giving one out, not writing one: forty are
        // already written.
        "Give out homework", "Write one from scratch",
      ],
    },
    {
      view: "rootadmin/exercises",
      label: "...and more than one person is a count, not a wall of addresses",
      locals: adminShell({
        groups: [{
          id: 12, code: "LNRKB02", course_title: "German Regular A2",
          rows: [exRow({ unlock_emails: "a@b.com,c@d.com,e@f.com" })],
        }],
      }),
      expect: ["3 people"],
      reject: ["a@b.com,c@d.com"],
    },
    /* Taking it back.
     *
     * There was no way to undo a mistake at all — and worse, homework
     * given to chosen people has no batch, this page walked the
     * batches, and so thirty-nine chapters sat in a student's portal
     * with no page in the back office admitting they existed.
     */
    {
      view: "rootadmin/exercises",
      label: "homework with no batch is listed, not hidden",
      locals: adminShell({
        groups: [{
          id: null, code: "Not tied to a batch", course_title: "",
          rows: [exRow({ id: 5, unlock_emails: "herr@langnation.com" })],
        }],
      }),
      expect: ["Not tied to a batch", "Reflexive Verben"],
    },
    {
      view: "rootadmin/exercises",
      label: "everything can be ticked and taken back in one go",
      locals: adminShell({
        groups: [{
          id: 12, code: "LNRKB02", course_title: "German Regular A2",
          rows: [exRow({ id: 5 }), exRow({ id: 6, title: "B1 · Kapitel 31" })],
        }],
      }),
      expect: [
        'name="id" value="5"', 'name="id" value="6"',
        'data-tick-all="ex"',
        "Remove ticked",
        'action="/rootadmin/exercises/remove"',
        // And the way to take it from one person instead, which is a
        // different thing and easy to reach for by mistake.
        "To take it away from",
      ],
    },
    {
      view: "rootadmin/exercises",
      label: "...and the confirmation says whose work goes with it",
      locals: adminShell({
        groups: [{
          id: 12, code: "LNRKB02", course_title: "German Regular A2",
          rows: [exRow({ id: 5, students: 9 }), exRow({ id: 6, students: 5 })],
        }],
      }),
      // 14 attempts across the two. A confirmation that does not say
      // this is a confirmation for a different decision.
      expect: ["14 student attempts"],
    },
    {
      view: "rootadmin/exercises",
      label: "...and says nothing about attempts when there are none",
      locals: adminShell({
        groups: [{
          id: 12, code: "LNRKB02", course_title: "German Regular A2",
          rows: [exRow({ id: 5, students: 0 })],
        }],
      }),
      expect: ["Remove ticked"],
      reject: ["student attempt"],
    },
    {
      view: "rootadmin/exercises",
      label: "no homework yet says what writing one would do",
      locals: adminShell({ groups: [] }),
      expect: ["No homework yet", "unlock it for yourself"],
    },
    /* The page opens on the chapters, not on an empty box.
     *
     * "I need automation and I don't want to type." Forty chapters are
     * already written and sitting in content/homework; a page that
     * opens on a blank textarea and instructions for writing German by
     * hand is asking for work that was already done.
     */
    {
      view: "rootadmin/exercise",
      label: "a new one offers the ready-made chapters first",
      locals: exShell(),
      expect: [
        "Use a ready-made chapter", "A2 · Kapitel 16 — Reflexive Verben",
        "6 questions", "Load it",
      ],
      // The chapters come before the box they fill in.
      order: ["Use a ready-made chapter", "The questions"],
    },
    {
      view: "rootadmin/exercise",
      label: "...and picking one fills the box in",
      locals: exShell({
        ex: { id: 0, title: "A2 · Kapitel 16", source: "Ich ___ Student.\n= bin",
              intake_id: null, due_on: null, published: 0 },
        picked: { id: "grammatik-a1-b1/A2-16.txt", title: "A2 · Kapitel 16", questions: 6 },
      }),
      expect: ["Ich ___ Student.", "6 questions loaded"],
    },
    {
      view: "rootadmin/exercise",
      label: "writing your own is offered second, and folded away",
      locals: exShell(),
      expect: ["only if you are writing your own", "* bin", "= kommt"],
      // The instructions must not come before the library.
      order: ["Use a ready-made chapter", "only if you are writing your own"],
    },

    /* Who gets it: three answers, not one required dropdown.
     *
     * "Which batch" as a required field made one group the only
     * possible answer, and a grammar chapter is not about one batch.
     */
    {
      view: "rootadmin/exercise",
      label: "three audiences, and everybody is the default for a new one",
      locals: exShell(),
      expect: [
        "Everybody studying", "One batch", "Only certain people",
        'value="all" data-aud',
        // Chosen, so the page is not asking a question it has already
        // answered.
        'value="all" data-aud\n                     checked',
      ],
    },
    {
      view: "rootadmin/exercise",
      label: "the batch dropdown says how many are on each",
      locals: exShell({ audience: "batch" }),
      expect: ["LNRKB02", "German Regular A2", "(8 students)"],
    },
    {
      view: "rootadmin/exercise",
      label: "who gets it is named, not counted",
      locals: exShell({
        audience: "batch",
        ex: { id: 5, title: "x", source: "x", intake_id: 12, due_on: null, published: 1 },
        willGet: [
          { id: 1, name: "Anita Sharma", email: "anita@example.com", student_ref: "LNS0007" },
          { id: 2, name: "Ravi Kumar", email: "ravi@example.com", student_ref: "LNS0008" },
        ],
      }),
      expect: ["2</strong>", "students get", "Anita Sharma", "LNS0007", "Ravi Kumar"],
    },
    {
      view: "rootadmin/exercise",
      label: "...and nobody to give it to says so rather than showing an empty list",
      locals: exShell({ audience: "all", willGet: [] }),
      expect: ["Nobody has an active enrolment yet"],
    },

    /* The unlock, which beats all three. */
    {
      view: "rootadmin/exercise",
      label: "somebody chosen is named, with a way to take it back",
      locals: exShell({
        ex: { id: 5, title: "x", source: "x", intake_id: 12, due_on: null, published: 0 },
        audience: "people",
        unlocked: [{ id: 1, name: "Anita Sharma", email: "anita@example.com", student_ref: "LNS0007" }],
      }),
      expect: ["Anita Sharma", "Remove", "this one person"],
      reject: ["Nobody chosen"],
    },
    {
      view: "rootadmin/exercise",
      label: "an address with no account is shown, not quietly dropped",
      locals: exShell({
        ex: { id: 5, title: "x", source: "x", intake_id: 12, due_on: null, published: 0 },
        audience: "people",
        unlocked: [{ id: null, name: null, email: "typo@langnation.com", student_ref: null }],
      }),
      expect: ["typo@langnation.com", "no account with this address"],
    },
    {
      view: "rootadmin/exercise",
      label: "a line the parser could not read is named with its number",
      locals: exShell({
        ex: { id: 5, title: "x", source: "Ich ___ Student.", intake_id: 12,
              due_on: null, published: 0 },
        problems: [{ line: 1, why: "no answer: put options under it with *, or a typed answer with =" }],
      }),
      expect: ["Line 1", "no answer"],
    },
    {
      view: "rootadmin/exercise",
      label: "before migration 29 the unlock says so instead of failing",
      locals: exShell({
        ex: { id: 5, title: "x", source: "x", intake_id: 12, due_on: null, published: 0 },
        hasUnlock: false,
      }),
      expect: ["migration 29"],
      // No picker at all rather than one that cannot work.
      reject: ["data-student-picker"],
    }
  );
}

/* How the class did.
 *
 * The page exists to answer one question — what do I go over on Monday
 * — so the ordering is the feature: worst first, and what people
 * actually wrote beside it. A results page sorted by question number
 * makes a teacher read all twenty to find the two that matter.
 */
{
  const resShell = (extra) => ({
    site: require("../lib/site"),
    ex: { id: 5, title: "A2 · Kapitel 16 — Reflexive Verben", intake_id: 12 },
    at: (v) => (v ? "21 Sept 19:04" : ""),
    ...extra,
  });

  const q = (over) => ({
    id: 1, seq: 1, kind: "gap", prompt: "Ich ___ ___ für Musik.",
    answer: "interessiere · mich", got: 6, missed: 0, seen: 6, rate: 100,
    wrong: [], ...over,
  });

  const who = (over) => ({
    id: 1, name: "Anita Sharma", ref: "LNS0007",
    tries: 1, best: 5, outOf: 6, lastAt: "2026-09-21T17:04:00Z", ...over,
  });

  cases.push(
    {
      view: "rootadmin/exercise-results",
      label: "hardest question first, with what people wrote instead",
      locals: resShell({
        classRate: 61,
        questions: [
          q({ id: 1, seq: 1, rate: 100, got: 6, missed: 0, seen: 6 }),
          q({ id: 2, seq: 2, prompt: "Du ___ ___ auf Freitag.", answer: "freust · dich",
              got: 1, missed: 5, seen: 6, rate: 17,
              wrong: [{ given: "freust", n: 4 }, { given: "freue", n: 1 }] }),
          q({ id: 3, seq: 3, prompt: "Er ___ ___ mit Freunden.", answer: "trifft · sich",
              got: 4, missed: 2, seen: 6, rate: 67 }),
        ],
        students: [who(), who({ id: 2, name: "Ravi Kumar", ref: "LNS0008" })],
      }),
      expect: [
        // The one to go over, and what they wrote.
        "Du ___ ___ auf Freitag", "freust", "×4",
        "Richtig:", "freust · dich",
        // The headline counts.
        "2</span>", "61%",
        "question to go over",
        // And the first-attempts caveat, said on the page and not only
        // in the code.
        "First attempts only",
      ],
      /* Worst first. The question everybody got right must come after
         the two that did not — this is the whole ordering, and sorted
         by seq it would come first. */
      order: ["auf Freitag", "mit Freunden", "für Musik"],
    },
    {
      view: "rootadmin/exercise-results",
      label: "nobody has done it yet, and it says how many could",
      locals: resShell({
        classRate: null,
        questions: [q({ got: 0, missed: 0, seen: 0, rate: null })],
        students: [who({ tries: 0, best: null, outOf: null, lastAt: null })],
      }),
      expect: ["Nobody has done this yet", "1 student is"],
      // No percentages at all: 0% right and nobody having tried are
      // different facts and only one is worth acting on.
      reject: ["0%", "right, first go"],
    },
    {
      view: "rootadmin/exercise-results",
      label: "a question nobody has reached is not counted as failed",
      locals: resShell({
        classRate: 100,
        questions: [
          q({ id: 1, got: 2, missed: 0, seen: 2, rate: 100 }),
          q({ id: 2, seq: 2, prompt: "Sie ___ ___ die Hände.",
              got: 0, missed: 0, seen: 0, rate: null }),
        ],
        students: [who()],
      }),
      // Not "1 question has": the count and the word sit on separate
      // lines in the template, so the rendered HTML has a newline
      // between them.
      expect: ["question has", "not been reached"],
      // It must not appear in the ranked list with a 0 beside it.
      reject: ["die Hände"],
    },
    {
      view: "rootadmin/exercise-results",
      label: "who has not started is named, not just counted",
      locals: resShell({
        classRate: 80,
        questions: [q({ got: 4, missed: 1, seen: 5, rate: 80 })],
        students: [who(), who({ id: 2, name: "Ravi Kumar", tries: 0, best: null, lastAt: null })],
      }),
      expect: ["not started: Ravi Kumar"],
    }
  );
}

/* Giving out homework.
 *
 * One screen, three questions, one button. The things worth asserting
 * are the ones that would look fine and be wrong: a scope that lists
 * nobody, a level with no chapters at it, and the tick boxes carrying
 * the names the form has to post.
 */
{
  const giveShell = (over) => ({
    site: require("../lib/site"),
    levels: ["A1", "A2", "B1"],
    batches: [
      { id: 12, code: "LNRKB02", course_title: "German Regular A2" },
      { id: 13, code: "LNIKB01", course_title: "Fast Track" },
    ],
    // Every person, once, tagged with the batches they are on — the
    // dropdown narrows them in the browser and the server sends the
    // lot.
    // `has` is the indices of the chapters below that this person has
    // already been given. Indices and not addresses: forty chapters
    // against a few hundred students is a hundred kilobytes of email
    // in the HTML, and the same fact fits in a list of small numbers.
    people: [
      { id: 1, name: "Anita Sharma", email: "anita@example.com",
        student_ref: "LNS0007", batches: [12], has: "12:0,1", hasAny: 2 },
      { id: 2, name: "Ravi Kumar", email: "ravi@example.com",
        student_ref: "LNS0008", batches: [13], has: "13:1", hasAny: 1 },
      { id: 3, name: "Noman Ahmed", email: "noman@example.com",
        student_ref: "LNS0010", batches: [], has: "", hasAny: 0 },
    ],
    /* Two books, because one was the whole problem: the only cut on
       this page was the CEFR level, and Regular A1 and Intensive A1
       are different chapters of different programmes. */
    books: [
      { slug: "regular-a2", title: "German Regular A2", track: "Regular", level: "A2", chapters: 13 },
      { slug: "intensive-a1-b1", title: "Fast Track A1–B1", track: "Intensive", level: "A1–B1", chapters: 1 },
    ],
    chapters: [
      { id: "regular-a2/A2-16.txt", book: "regular-a2", bookTitle: "Deutsch Regular A2",
        track: "Regular", title: "A2 · Kapitel 16 — Reflexive Verben",
        level: "A2", questions: 6, out: 0, outs: "12:1" },
      { id: "intensive-a1-b1/09-negation.txt", book: "intensive-a1-b1",
        bookTitle: "Fast Track A1–B1", track: "Intensive",
        title: "Kapitel 09 — Negation",
        /* No level of its own, and its book spans three -- so it has
           none, and sorts last rather than among the A1s. */
        level: null, questions: 23, out: 0, outs: "12:1|13:1" },
    ],
    due: "",
    done: null,
    problem: null,
    ...over,
  });

  cases.push(
    {
      view: "rootadmin/give",
      label: "who, what, when, and one button",
      locals: giveShell(),
      expect: [
        "Everybody studying", "Everyone with an account", "LNRKB02", "LNIKB01",
        'name="who" value="anita@example.com"', "Anita Sharma", "LNS0007",
        'name="what" value="regular-a2/A2-16.txt"', "Reflexive Verben", "6 questions",
        /* The book is a filter in its own right, and each row says
           which one it came from -- a row kept on screen because it is
           ticked is otherwise indistinguishable from the rest. */
        "data-filter-book", 'data-book="regular-a2"', "Deutsch Regular A2",
        // Keyed separately, so ticking every student does not tick
        // every chapter.
        'data-tick-all="who"', 'data-tick-all="what"',
        "Unlock",
      ],
    },
    /* Nothing is filtered on the server, and this is the assertion that
       says so.

       It used to be: choosing a level submitted a GET form, the page
       came back with the chapters narrowed, and every person already
       ticked came back unticked because the page was new. Tick a
       student, pick A1, student gone — which is exactly what happened
       the first time it was used.

       So every row is sent and the dropdowns only hide them. One form,
       and no GET form at all. */
    {
      view: "rootadmin/give",
      label: "every row is sent, and the filters only hide them",
      locals: giveShell(),
      expect: [
        // Both books present at once, whatever the dropdown says.
        "A2 · Kapitel 16", "Kapitel 09 — Negation",
        // Everybody present at once, tagged for the browser to filter.
        "Anita Sharma", "Ravi Kumar", "Noman Ahmed",
        'data-batches=",12,"', 'data-enrolled="1"',
        // Somebody on no batch is still listed — signed up, not
        // started, and homework is a reasonable thing to give them.
        'data-enrolled="0"',
        /* The levelled one and the one whose book spans three, which
           carries no level and so matches no level filter — it is
           reached by its book instead. */
        'data-level="A2"', 'data-level=""',
        'data-book="regular-a2"', 'data-book="intensive-a1-b1"',
      ],
      reject: [
        // No second form, and nothing that reloads to filter.
        'method="get"',
        "data-auto-submit",
      ],
    },
    {
      view: "rootadmin/give",
      label: "the running total is there before anything is ticked",
      locals: giveShell(),
      expect: ["Nothing ticked yet", "data-give-sum"],
    },
    {
      view: "rootadmin/give",
      label: "no accounts at all says so rather than showing an empty list",
      locals: giveShell({ people: [] }),
      expect: ["No student accounts yet"],
      reject: ['data-tick-all="who"'],
    },
    {
      view: "rootadmin/give",
      label: "no chapters at all points at where they come from",
      locals: giveShell({ chapters: [] }),
      expect: ["No chapters yet", "content/homework"],
      reject: ['data-tick-all="what"'],
    },
    {
      view: "rootadmin/give",
      label: "what was given out is reported back",
      locals: giveShell({ done: "3 chapters given out — to 8 people." }),
      expect: ["3 chapters given out", "8 people"],
    },
    {
      view: "rootadmin/give",
      label: "...and so is a refusal, in words rather than a 500",
      locals: giveShell({
        problem: "Homework for chosen people rather than a batch needs migration 30.",
      }),
      expect: ["needs migration 30", "notice-bad"],
    },
    /* The real thing, at the real size.
     *
     * Every other case here has two chapters in it, and "Select all"
     * went wrong at forty-one — so the fixture that matters is the one
     * built from the library the school actually ships. It is also
     * what gets dumped for driving in a browser. */
    {
      view: "rootadmin/give",
      label: "the whole workbook, at the size it really is",
      locals: giveShell({
        chapters: require("../lib/exercises").library()
          .map((c, i) => ({ ...c, out: i % 3 === 0 ? 2 : 0 })),
      }),
      expect: ['data-tick-all="what"', 'data-ix="40"'],
    },
    /* Who already has what.
     *
     * The screen used to open with every box blank however much had
     * been given out, so the only way to find out whether somebody
     * already had Kapitel 01 was to give it to them again and read the
     * confirmation. A screen whose whole job is "who gets what" has to
     * be able to say who has got what. */
    {
      view: "rootadmin/give",
      label: "the screen says who already has what",
      locals: giveShell(),
      expect: [
        /* Per batch, packed as "batch:indices". Counted on the title
           alone, a chapter given to LNIKB01 read "already given" for
           LNIKB02 as well, and the office was told a class had
           homework it had never been given. */
        'data-has="12:0,1"', "2 already",
        'data-has="13:1"', "1 already",
        // On the chapter: its index, and who holds it, per batch.
        'data-ix="0"', 'data-ix="1"',
        'data-outs="12:1"', 'data-outs="12:1|13:1"',
      ],
      // Somebody with none gets no pill rather than a "0 already".
      reject: ["0 already"],
    },
    /* Which course it is FOR — a label, not a permission. The unlock
       list still decides who can see it.

       Above the two lists, not below them: it was under a forty-one
       row list, and a decision at the bottom of a long list is a
       decision nobody makes. Homework meant for a course went out with
       no course on it because the field was never scrolled to. */
    {
      view: "rootadmin/give",
      label: "one dropdown both narrows the lists and names the course",
      locals: giveShell(),
      expect: [
        /* There were two of these, listing the same batches — so the
           screen asked the same question twice and could be given two
           different answers, which is how a class's homework went out
           with no course on it. One control, one answer. */
        'name="for_intake" data-filter-scope',
        "Everybody studying — no course on it",
        "LNRKB02 — German Regular A2",
      ],
      // The filter it replaced had no name, so it was never submitted.
      reject: ["<select data-filter-scope>", "Who to show"],
    },
    {
      view: "rootadmin/give",
      label: "...and that choice is above the lists, not under them",
      locals: giveShell(),
      order: ['name="for_intake"', 'data-list="who"', 'data-list="what"'],
    },
    /* Taking it back. The same two lists, the opposite verb — so
       nobody has to find the same five people on a second screen. */
    {
      view: "rootadmin/give",
      label: "there is a way to take homework back off people",
      locals: giveShell(),
      expect: [
        'name="lock" value="1"', ">Unlock", "Lock",
        // It asks first, because it is the one that removes something.
        "data-confirm-simple",
        // ...and says what it does and does not cost.
        "Work they have already", "closes itself",
      ],
    },
    /* Which of the two things the screen is doing, chosen at the top.
       Both buttons used to sit under two long lists — the same mistake
       the course field made: the decision is taken first and was
       offered last. */
    {
      view: "rootadmin/give",
      label: "unlock or lock is chosen before the lists, not after them",
      locals: giveShell(),
      expect: [
        "data-give-mode", 'data-mode-set="give"', 'data-mode-set="lock"',
        // The course and the due date belong to giving out only.
        "data-give-only", "data-lock-only",
      ],
      order: ["data-give-mode", 'data-list="who"'],
    },
    /* A third view: who has what, and take one back from there.
     *
     * The two lists answer "who should get this". This answers "who
     * HAS got what", which is the question you ask when a student says
     * they cannot see their homework — and the screen could only
     * answer it by counting pills. */
    {
      view: "rootadmin/give",
      label: "there is a view of who can open what",
      locals: giveShell(),
      expect: [
        'data-mode-set="access"', "Who has what",
        "data-access", "data-access-body",
        // Built from what is already on the page, so the names the
        // panel reads have to be findable.
        "ad-tick-name",
        // The two tick lists are for picking and go away while
        // reading; the panel is hidden until the script shows it.
        "data-pick-only", "data-access hidden",
      ],
    },
    {
      view: "rootadmin/give",
      label: "...and with no script the switch is hidden and both buttons remain",
      locals: giveShell(),
      expect: [
        // Hidden until the script unhides it — it does nothing without
        // one, and a control that does nothing is worse than none.
        "data-give-mode hidden",
        // Both submits are still in the form, so it is never a form
        // with no way to send it.
        'type="submit" data-give-only', 'name="lock" value="1" data-lock-only',
      ],
    }
  );
}

let pass = 0;
let fail = 0;

/* The teacher's own homework and progress pages.
 *
 * The same three things the office's screen does, with one difference
 * that runs through all of it: a teacher only ever reaches their own
 * class. That is enforced in the route — the batch is checked against
 * OWNS(), the course saved on the homework comes from that verified
 * row and never from the form, and any address not on the roster is
 * dropped. What is checked HERE is that the page cannot quietly ask
 * for anything wider: no course dropdown, no "every course", and the
 * batch carried in a hidden field rather than chosen again on submit.
 */
{
  const teachShell = (over) => ({
    site: require("../lib/site"),
    teacher: { id: 4, name: "Frau Weber", email: "weber@example.com" },
    avatarUrl: null, initials: "W", hue: 200,
    batches: [
      { id: 12, code: "LNRKB02", course_title: "German Regular A2", active_students: 3 },
      { id: 13, code: "LNIKB01", course_title: "Fast Track", active_students: 5 },
    ],
    chosen: { id: 12, code: "LNRKB02", course_title: "German Regular A2" },
    done: null,
    problem: null,
    // The attendance page's window and which of its three lists is
    // open. Harmless on the other two, and one shell beats three that
    // drift apart.
    weeks: 2,
    weekChoices: [2, 4, 6],
    show: "next",
    noteMax: require("../lib/lessons").NOTE_MAX,
    cancelReasons: require("../lib/lessons").CANCEL_REASONS,
    ...over,
  });

  const chapter = (i, over) => ({
    id: "grammatik-a1-b1/A" + i + ".txt",
    title: "A1 · Kapitel 0" + i + " — Etwas",
    level: "A1", questions: 6, outs: "", out: 0, ...over,
  });

  cases.push(
    /* Attendance: the term as a list of dates to tick off.
     *
     * Taking a register already existed, one date at a time. What did
     * not was the question a teacher actually asks — which dates have
     * I done and which do I still owe — so what is checked here is
     * that the page answers THAT, and answers it before it shows the
     * thirty dates that are fine. */
    /* Attendance: the term as a list of dates to tick off.
     *
     * Taking a register already existed, one date at a time. What did
     * not was the question a teacher actually asks — which dates have
     * I done and which do I still owe — so what is checked here is
     * that the page answers THAT, and answers it before it shows the
     * thirty dates that are fine.
     *
     * Three cases and not one, because the page now shows one list of
     * the three at a time. A single case would have exercised whichever
     * list the fixture happened to name and left the other two to be
     * checked by the eye of whoever last opened the page.
     */
    {
      view: "teach/attendance",
      label: "what is owed comes before the term that is already done",
      locals: (() => {
        /* Dates relative to now, not written down.

           The page windows the table to a few weeks either side of
           today, so a fixture with fixed dates passes until the day it
           silently stops exercising the thing it is about — a "To
           come" lesson dated December is simply outside the window by
           January, and the case goes on passing while checking less. */
        const at = (days, hours = 0) =>
          new Date(Date.now() + days * 86400000 + hours * 3600000)
            .toISOString().replace("T", " ").slice(0, 19);
        const on = (days) => at(days).slice(0, 10);

        const lesson = (n, days, over) => ({
          id: n, title: "Lesson " + n,
          starts_at: at(days), day: on(days),
          status: "scheduled", timezone: "Europe/Berlin",
          marked: 0, attended: 0, absent: 0, by_teacher: 0,
          certain: 1, gone: days < 0 ? 1 : 0, students: 4,
          state: days < 0 ? "pending" : "upcoming",
          ...over,
        });

        return teachShell({
          owed: 2,
          summary: [],
          lessons: [
            lesson(9, -2),                                     // pending
            lesson(8, -4, { marked: 4, attended: 3, absent: 1,
                            by_teacher: 4, state: "done" }),
            lesson(7, -6),                                     // pending
            lesson(6, -8, { status: "cancelled", state: "cancelled" }),
            lesson(10, 3),                                     // to come
            /* Somebody clicked join and nobody wrote it down. Four
               marks and no register: the people who did NOT turn up
               are not recorded, which is the one thing a register is
               for. */
            lesson(5, -10, { marked: 2, attended: 2, by_teacher: 2,
                             certain: 0, state: "marked" }),
          ],
        });
      })(),
      expect: [
        "2 registers still to take",
        // ...and links to the register screen that already exists,
        // rather than being a second way of recording anything.
        "/teach/batch/12/register?date=",
        /* Taking the register is not the only answer to an open row.
           When the class did not happen, the only honest register is
           none at all, so the row can be called off from here too --
           the same control and the same reasons as the schedule. */
        "It did not happen", "/teach/lesson/9/cancel",
        "At the students&#39; request", "Nobody turned up",
        /* One list of three, chosen from the same segmented control
           the homework screen uses. The count is on the segment
           because an empty list is worth knowing about before
           clicking it. */
        "ad-mode-btn", "att-mode-n",
        'aria-label="Which dates to show"', "Today", "Previous",
        // The one that is open is filled in, and goes nowhere.
        'ad-mode-btn is-on" aria-current="true"',
        // The chosen list says which window it is showing, and the
        // window is what keeps a term of sixty-four dates from being
        // a page nobody reads to the end.
        "Next 2 weeks", "tl-week", "4w", "6w",
        "Lesson 10", "To come",
        /* And the row somebody opens the page FOR: the class about to
           be taught. In a column of a dozen dates it otherwise looks
           like all the others. */
        "att-lead", "att-lead-tag", ">next<",
      ],
      reject: [
        // The other two lists are elsewhere, not hidden here.
        "Previous 2 weeks", "Marks only",
      ],
      order: ["2 registers still to take", "Next 2 weeks", "Lesson 10"],
    },
    {
      view: "teach/attendance",
      label: "...and the previous weeks run backwards from the last class taught",
      locals: (() => {
        const at = (days) => new Date(Date.now() + days * 86400000)
          .toISOString().replace("T", " ").slice(0, 19);
        const on = (days) => at(days).slice(0, 10);
        const lesson = (n, days, over) => ({
          id: n, title: "Lesson " + n,
          starts_at: at(days), day: on(days),
          status: "scheduled", timezone: "Europe/Berlin",
          marked: 0, attended: 0, absent: 0, by_teacher: 0,
          certain: 1, gone: 1, students: 4, state: "pending", ...over,
        });
        return teachShell({
          show: "past",
          owed: 2,
          summary: [],
          lessons: [
            lesson(9, -2),
            lesson(8, -4, { marked: 4, attended: 3, absent: 1,
                            by_teacher: 4, state: "done" }),
            lesson(7, -6),
            lesson(6, -8, { status: "cancelled", state: "cancelled" }),
            lesson(5, -10, { marked: 2, attended: 2, by_teacher: 2,
                             certain: 0, state: "marked" }),
          ],
        });
      })(),
      expect: [
        "Previous 2 weeks",
        // Every state says what it is, in one word.
        "Not taken", "Done", "Called off", "Marks only",
        // The tick box: a term to work through, not a report.
        "att-box is-done", "att-box is-off",
        // The counts read as a sentence under the date rather than as
        // two columns of their own — six columns wrapped every heading.
        "3 here", "1 missing",
        // The class just taught, marked rather than searched for.
        "att-lead-tag", ">latest<",
      ],
      reject: ["Next 2 weeks"],
      /* And no date goes backwards — the thing that was actually
         complained about. Read off the rendered page rather than
         asserted row by row: a fixture listing the dates in the
         expected order proves only that the fixture is in order. */
      check: (html) => {
        const days = [...html.matchAll(/register\?date=(\d{4}-\d\d-\d\d)/g)]
          .map((m) => m[1]);
        const body = html.slice(html.indexOf("Previous 2 weeks"));
        const inList = [...body.matchAll(/register\?date=(\d{4}-\d\d-\d\d)/g)]
          .map((m) => m[1]);
        if (!days.length || !inList.length) return "no register links at all";
        for (let k = 1; k < inList.length; k++) {
          if (inList[k] > inList[k - 1]) {
            return `previous list turns round at ${inList[k - 1]} \u2192 ${inList[k]}`;
          }
        }
        return null;
      },
    },
    {
      view: "teach/attendance",
      label: "...and today gets a place of its own rather than a row to find",
      locals: (() => {
        /* Today in the CLASS's zone, at nine in the morning, whatever
           hour the suite happens to be run at. The page decides what
           "today" means in Europe/Berlin and the suite runs in UTC, so
           a lesson placed a fixed number of hours from now lands on
           yesterday or tomorrow depending on the clock. */
        const berlin = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const soon = new Date(Date.now() + 3 * 86400000)
          .toISOString().replace("T", " ").slice(0, 19);
        return teachShell({
          show: "today",
          owed: 0,
          summary: [],
          lessons: [
            { id: 11, title: "Lesson 11", starts_at: berlin + " 09:00:00",
              day: berlin, status: "scheduled", timezone: "Europe/Berlin",
              marked: 0, attended: 0, absent: 0, by_teacher: 0, certain: 1,
              gone: 0, students: 4, state: "upcoming" },
            { id: 12, title: "Lesson 12", starts_at: soon, day: soon.slice(0, 10),
              status: "scheduled", timezone: "Europe/Berlin",
              marked: 0, attended: 0, absent: 0, by_teacher: 0, certain: 1,
              gone: 0, students: 4, state: "upcoming" },
          ],
        });
      })(),
      expect: ["<h2>Today</h2>", "Lesson 11", "att-lead-tag", ">today<"],
      reject: [
        // A window means nothing to a list of one day.
        "tl-week",
        // ...and the other days are on the other two segments.
        "Lesson 12", "Next 2 weeks", "Previous 2 weeks",
      ],
    },
    {
      view: "teach/attendance",
      label: "...and a day with no class says so and points at the next one",
      locals: teachShell({
        show: "today", owed: 0, summary: [],
        lessons: [
          { id: 2, title: "Lesson 8", starts_at: "2026-09-21T17:00:00Z", day: "2026-09-21",
            status: "scheduled", timezone: "Europe/Berlin", marked: 4, attended: 3,
            absent: 1, by_teacher: 4, certain: 1, gone: 1, students: 4, state: "done" },
        ],
      }),
      expect: ["No class today", "See what is coming", "show=next"],
    },
    {
      view: "teach/attendance",
      label: "...and nothing owed says so rather than showing an empty list",
      locals: teachShell({
        owed: 0,
        summary: [
          { id: 1, student_ref: "LNS0007", name: "Anita Sharma",
            present: 7, late: 1, absent: 0, excused: 0, last_seen: "2026-09-21" },
          { id: 2, student_ref: "LNS0008", name: "Ravi Kumar",
            present: 3, late: 0, absent: 5, excused: 0, last_seen: "2026-09-01" },
          // Nobody has taken a register with this one in it yet, which
          // is not the same as never turning up.
          { id: 3, student_ref: "LNS0009", name: "Neu Person",
            present: 0, late: 0, absent: 0, excused: 0, last_seen: null },
        ],
        lessons: [
          { id: 2, title: "Lesson 8", starts_at: "2026-09-21T17:00:00Z", day: "2026-09-21",
            status: "scheduled", timezone: "Europe/Berlin", marked: 4, attended: 3,
            absent: 1, by_teacher: 4, certain: 1, gone: 1, students: 4, state: "done" },
        ],
      }),
      expect: [
        "Nothing owed",
        // The register is the input; this is what it is for.
        "How the class is attending", "Anita Sharma", "100%", "38%",
        "no register yet",
      ],
      reject: ["registers still to take"],
    },
    {
      view: "teach/attendance",
      label: "...and a class with no timetable blames the pattern, not the teacher",
      locals: teachShell({ owed: 0, summary: [], lessons: [] }),
      expect: ["no lessons on the timetable yet", "The office sets the pattern"],
    },
    {
      view: "teach/attendance",
      label: "...and no class at all says so",
      locals: teachShell({ batches: [], chosen: null, owed: 0, summary: [], lessons: [] }),
      expect: ["No classes are assigned to you yet"],
    },
    {
      view: "teach/homework",
      label: "a teacher sets homework for their own class",
      locals: teachShell({
        people: [
          { id: 1, name: "Anita Sharma", email: "anita@example.com",
            student_ref: "LNS0007", has: "12:0", hasAny: 1 },
          { id: 2, name: "Ravi Kumar", email: "ravi@example.com",
            student_ref: "LNS0008", has: "", hasAny: 0 },
        ],
        chapters: [chapter(1, { outs: "12:1" }), chapter(2)],
        levels: ["A1"],
        due: "",
      }),
      expect: [
        'action="/teach/homework"',
        // The class travels in a hidden field, taken from the verified
        // row on the way back in rather than chosen again here.
        'name="batch" value="12"',
        // The same three modes as the office's screen.
        'data-mode-set="give"', 'data-mode-set="lock"', 'data-mode-set="access"',
        'name="who" value="anita@example.com"', "1 already",
        'data-tick-all="who"', 'data-tick-all="what"',
        "LNRKB02",
      ],
      reject: [
        /* No course dropdown and no "every course". A teacher sets
           homework for the class in front of them; being able to name
           a different one is the thing this page must not offer. */
        'name="for_intake"', "Every course", "Everyone with an account",
        // And no sight of the other class's students.
        "LNIKB01 — Fast Track (5",
      ],
    },
    {
      view: "teach/homework",
      label: "...and is told plainly when there is no class to set it for",
      locals: teachShell({ batches: [], chosen: null, people: [], chapters: [], levels: [], due: "" }),
      expect: ["No classes are assigned to you yet"],
      reject: ['data-tick-all="who"'],
    },
    {
      view: "teach/homework",
      label: "...and when the class is empty, says that rather than showing nothing",
      locals: teachShell({ people: [], chapters: [chapter(1)], levels: ["A1"], due: "" }),
      expect: ["Nobody is actively enrolled on LNRKB02"],
      reject: ['data-tick-all="who"'],
    },

    /* Class progress. Names on it, unlike the student's own card,
       because the point is to find the student who has stopped. */
    {
      view: "teach/progress",
      label: "the class list names who has stopped, not just who is winning",
      locals: teachShell({
        setCount: 6,
        board: [
          { id: 1, name: "Anita Sharma", ref: "LNS0007", passed: 5, done: 6,
            got: 30, asked: 34, accuracy: 88, rank: 1, lastAt: "2026-09-20", photo: null,
            initials: "AS", hue: 1 },
          { id: 2, name: "Ravi Kumar", ref: "LNS0008", passed: 2, done: 5,
            got: 18, asked: 30, accuracy: 60, rank: 2, lastAt: "2026-09-14", photo: null,
            initials: "RK", hue: 2 },
          { id: 3, name: "Stille Person", ref: "LNS0009", passed: 0, done: 0,
            got: 0, asked: 0, accuracy: null, rank: 3, lastAt: null, photo: null,
            initials: "SP", hue: 3 },
        ],
      }),
      expect: [
        "Anita Sharma", "Ravi Kumar", "Stille Person",
        // The one the page exists to surface, said in words rather
        // than left as a zero to notice.
        "not started",
        // Accuracy beside the count: eight chapters at 40% is a
        // different conversation from two at 95%.
        "88%", "60%",
        "2 of 3 have started", "6 chapters set",
      ],
    },
    {
      view: "teach/progress",
      label: "...and a class with no homework is pointed at setting some",
      locals: teachShell({
        setCount: 0,
        board: [{ id: 1, name: "Anita Sharma", ref: "LNS0007", passed: 0, done: 0,
                  got: 0, asked: 0, accuracy: null, rank: 1, lastAt: null,
                  photo: null, initials: "AS", hue: 1 }],
      }),
      expect: ["has not been given any homework yet", "/teach/homework?batch=12"],
    }
  );
}

for (const c of cases) {
  // Portal pages live under views/pages; the back office has its own
  // top-level directory. A view named with a leading directory that
  // exists at the top level is taken as-is.
  const top = c.view.split("/")[0];
  const rooted = fs.existsSync(path.join(VIEWS, top));
  const file = rooted
    ? path.join(VIEWS, `${c.view}.ejs`)
    : path.join(VIEWS, "pages", `${c.view}.ejs`);
  const name = `${c.view} — ${c.label}`;
  try {
    const out = ejs.render(fs.readFileSync(file, "utf8"), { ...base, ...c.locals }, {
      filename: file,
      views: [VIEWS],
    });

    // A template can render successfully while its form action contains a misplaced tag.
    for (const [, action] of out.matchAll(/\baction="([^"]*)"/g)) {
      if (/[<>\r\n]/.test(action)) throw Error('Malformed form action: '+action.slice(0,80));
    }
    if (/^(portal|teach)\//.test(c.view)) {
      for (const [, attributes, body] of out.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
        const label=body.replace(/<[^>]+>/g, '').trim();
        if (/^(Join(?: the class)?|Start the class|Course materials|Group chat|Exercise)(?:$| \()/.test(label)) {
          if (!attributes.includes('target="_blank"') || !attributes.includes('rel="noopener noreferrer"')) throw Error('Course action must open separately: '+label);
        }
        if (attributes.includes('data-class-action=')) {
          if (!/data-class-csrf="[a-f0-9]{64}"/.test(attributes)) throw Error('Class action needs a CSRF token');
          if (!/href="https?:\/\//.test(attributes)) throw Error('Class action needs a direct meeting URL');
        }
      }
    }
    if (DUMP) {
      const slug = `${c.view}--${c.label}`.replace(/[^a-z0-9]+/gi, "-").slice(0, 90);
      fs.writeFileSync(path.join(DUMP, `${slug}.html`), out);
      dumped.push({ slug, name });
    }

    if (!/<\/html>\s*$/.test(out.trim())) throw new Error("output is not a complete document");
    for (const needle of c.expect || []) {
      if (!out.includes(needle)) throw new Error(`missing from the page: ${JSON.stringify(needle)}`);
    }
    for (const needle of c.reject || []) {
      if (out.includes(needle)) throw new Error(`should not be on the page: ${JSON.stringify(needle)}`);
    }
    // `order` — the needles must appear in this sequence on the page.
    //
    // Worth having its own assertion rather than being eyeballed: the
    // order of a row of buttons is a thing somebody asked for
    // deliberately, and a later edit that reshuffles them would pass
    // every expect() in this file.
    if (c.order) {
      let at = -1;
      for (const needle of c.order) {
        const next = out.indexOf(needle, at + 1);
        if (next === -1) throw new Error(`out of order: ${JSON.stringify(needle)} is not after the one before it`);
        at = next;
      }
    }
    /* `check` — for what expect and reject cannot say.
     *
     * Both of those ask whether a string is on the page. Some things
     * are about HOW MANY: a student in three classes should get one
     * rank card and not three, and every expect() in this file passes
     * just as happily on three. A function gets the whole page and
     * returns the reason it is wrong, or nothing. */
    if (c.check) {
      const why = c.check(out);
      if (why) throw new Error(why);
    }
    /* An attribute that was escaped into nothing.
     *
     * `<%= ' class="x"' %>` renders class=&#34;x&#34;. The class name is
     * in the HTML, so an expect() looking for it passes; the attribute
     * applies to nothing whatever, so the page is unstyled and the
     * test says it is fine. Found by measuring a page in a browser and
     * noticing the rule had no effect — which is not a way of finding
     * things that scales.
     *
     * Any escaped quote directly after an attribute name is this
     * mistake. A quote inside a VALUE is ordinary and escaped
     * correctly, so the pattern is anchored on `name=`.
     */
    /* Containers that close the wrong thing.
     *
     * A stray </section> on a page whose cards are divs closes nothing:
     * the browser drops it and carries on, so the page looks right and
     * the DOM is not. That is how a card ended up nested inside the one
     * above it here, with every text assertion still passing — all the
     * words were present, in the wrong box.
     *
     * This walks the tags and keeps a stack, which is what it takes.
     * Counting opens against closes was the first attempt and it was
     * useless for exactly this: swapping a </div><div> pair for a
     * </section><section> pair leaves both totals balanced, and the
     * check reported nothing while looking green. Tried, watched it
     * miss, replaced.
     *
     * Only these tags are tracked. They carry the layout, none is void,
     * and none may be left open in HTML, so a mismatch is always a
     * mistake rather than a shorthand.
     */
    {
      const WATCH = new Set(["div", "section", "ul", "ol", "table", "form", "details"]);
      const stack = [];
      const tags = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
      let t;
      while ((t = tags.exec(out))) {
        const [, slash, rawName, selfShut] = t;
        const name = rawName.toLowerCase();
        if (!WATCH.has(name)) continue;
        if (selfShut) continue;
        if (!slash) {
          stack.push(name);
          continue;
        }
        const top = stack.pop();
        if (top !== name) {
          throw new Error(
            `</${name}> closes <${top || "nothing"}> — a tag that closes the ` +
            "wrong thing is dropped by the browser, and the page nests wrongly"
          );
        }
      }
      if (stack.length) {
        throw new Error(`<${stack[stack.length - 1]}> is never closed`);
      }
    }

    const escaped = out.match(/\s[a-zA-Z-]+=&#(?:34|39);/);
    if (escaped) {
      throw new Error(
        `an attribute was escaped into nothing: ${escaped[0].trim()} ` +
        "— use the unescaped output tag for markup"
      );
    }
    for (const artefact of ["[object Object]", "NaN"]) {
      if (out.includes(artefact)) throw new Error(`rendering artefact: ${artefact}`);
    }
    pass++;
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`);
  }
}

// ── The shape of the menu ────────────────────────────────────────────
//
// Rendering a page proves the header compiles; it does not prove the
// menu still says what it is meant to say. Tools spent a while as the
// last line of the Germany dropdown, where nobody converting an Indian
// percentage into a German grade would ever think to look, and the
// easiest way for it to go back there is a careless edit to navTree.
const logicChecks = [
  {
    area: "content",
    label: "a German page body is text, not a bag of characters",
    run: () => {
      // A page body is one HTML string; a course body is an object of
      // named sections. Merging a German override over the English
      // record used to spread both as objects, which turned every
      // translated page into {0:"<", 1:"p", ...} and rendered
      // "[object Object]" where the page should be. All thirty-four
      // of them, live.
      const content = require("../lib/content");
      const bad = content.pages("de").filter((p) => typeof p.body !== "string");
      if (bad.length) {
        throw new Error(`${bad.length} German page(s) lost their body, e.g. ${bad[0].slug}`);
      }
      const terms = content.page("student-terms-and-conditions", "de");
      if (!terms || !terms.body.startsWith("<p")) throw new Error("the German terms lost their body");
      if (terms.title !== "Allgemeine Geschäftsbedingungen") {
        throw new Error(`the German title did not come through: ${terms.title}`);
      }

      // No page carries a hand-typed contents list any more.
      //
      // All ten that did carried the same thing: the page's own
      // headings, typed out as plain text at the foot of the article,
      // written before the site had an "On this page" panel. The panel
      // links and sits beside the text, so the copy underneath was a
      // duplicate to scroll past -- and "Table of Contents" was
      // appearing IN the panel as though it were a section of the
      // article.
      //
      // Asserted rather than just deleted, because the next page
      // pasted in from the old site would bring one back and nothing
      // would say so.
      const withToc = content.pages("en")
        .concat(content.pages("de"))
        .filter((x) => /Table of Contents|Inhaltsverzeichnis/i.test(String(x.body || "")))
        .map((x) => x.slug);
      if (withToc.length) {
        throw new Error(
          withToc.length + " page(s) still carry a typed-out contents list: " +
            [...new Set(withToc)].join(", ")
        );
      }

      // Every key in the overlay has to be a slug the site actually
      // serves.
      //
      // Nine pages are renamed on load by lib/slug-fixes.js, and the
      // German is then looked up by the NEW name. An entry filed under
      // the old one is never read, and nothing complains: the page
      // renders, in English, looking merely untranslated. A whole
      // German page for the Gymnasium sat unreachable under "gymnasiam"
      // that way. There is no symptom to notice, so it needs a test.
      const overlay = require("../content/de/pages.json");
      const live = new Set(content.pages("en").map((x) => x.slug));
      const orphans = Object.keys(overlay).filter((k) => !live.has(k));
      if (orphans.length) {
        throw new Error(
          `${orphans.length} German page(s) filed under a slug the site does not serve: ` +
            orphans.join(", ")
        );
      }
    },
  },
  {
    area: "content",
    label: "a course body still merges section by section",
    run: () => {
      // The other half of the same fix. A course translated only as far
      // as its intro must keep its English sections rather than losing
      // them, so an object body still merges field by field.
      const content = require("../lib/content");
      const first = content.coursesByTrack("de")[0].items[0];
      if (!first.body || typeof first.body !== "object") {
        throw new Error("a course body is no longer an object of sections");
      }
      if (!first.body.description) throw new Error("a course lost its description");
    },
  },
  {
    label: "Tools is a top-level group, not a line inside Germany",
    run: () => {
      const nav = publicBase("en", "/").nav;
      const tools = nav.find((g) => g.label === "Tools");
      if (!tools) throw new Error("no Tools group in the top row");
      const germany = nav.find((g) => g.label === "Germany");
      if (germany.children.some((c) => c.href.endsWith("/tools"))) {
        throw new Error("Tools is still listed under Germany");
      }
      const hrefs = tools.children.map((c) => c.href);
      for (const want of ["/tools", "/tools#grade", "/tools#ects", "/tools#ielts", "/tools#toefl"]) {
        if (!hrefs.includes(want)) throw new Error(`Tools menu is missing ${want}`);
      }
    },
  },
  {
    label: "the German menu is six groups and every label is translated",
    run: () => {
      // Six is the number the header CSS is sized for. A seventh needs a
      // measurement at 1100px before it goes in, not just a push.
      const nav = publicBase("de", "/").nav;
      if (nav.length !== 6) throw new Error(`${nav.length} groups, expected 6`);
      const labels = nav.map((g) => g.label);
      for (const want of ["Kurse", "Prüfungen", "Deutschland", "Rechner", "Wörterbuch"]) {
        if (!labels.includes(want)) throw new Error(`no "${want}" in ${labels.join(", ")}`);
      }
      // A missing key falls back to English, which reads as a bug in the
      // German header rather than as a missing translation.
      const tools = nav.find((g) => g.label === "Rechner");
      const english = ["All calculators", "Grade converter", "ECTS calculator", "IELTS band score"];
      const leaked = tools.children.find((c) => english.includes(c.label));
      if (leaked) throw new Error(`"${leaked.label}" fell through to English`);
      if (tools.children.every((c) => c.href.startsWith("/de/")) === false) {
        throw new Error("a German menu item lost its /de prefix");
      }
    },
  },
  {
    label: "a fragment link is never the current page",
    run: () => {
      // Standing on /tools, all four anchors point at the page you are
      // already on. Marking every one of them aria-current lit the whole
      // dropdown at once and told a screen reader there were five
      // current pages.
      const nav = publicBase("en", "/tools").nav;
      const tools = nav.find((g) => g.label === "Tools");
      if (!tools.current) throw new Error("the Tools group is not marked current on /tools");
      const marked = tools.children.filter((c) => c.current).map((c) => c.href);
      if (marked.length !== 1 || marked[0] !== "/tools") {
        throw new Error(`current children: ${marked.join(", ") || "none"}`);
      }
    },
  },
];

// ── Middleware that runs before the routers ──────────────────────────
//
// Express runs middleware in the order it is added, so anything
// registered after app.use("/admin", ...) never runs for a request a
// router has already answered.
//
// res.locals.dbState sat below the routers for a release and did
// nothing whatsoever. The symptom was the panel simply not appearing --
// indistinguishable from the feature not having shipped, and invisible
// to every render test in this file, because those call the template
// directly and never go near Express.
//
// A source-order check is crude. It is also the only thing here that
// would have caught it.
logicChecks.push({
  area: "server",
  label: "res.locals.dbState is set before any router is mounted",
  run() {
    const fs = require("fs");
    const path = require("path");
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

    const firstRouter = server.search(/^app\.use\("\/[a-z]*",/m);
    const dbStateAt = server.indexOf("res.locals.dbState =");

    if (dbStateAt === -1) throw new Error("res.locals.dbState is never set in server.js");
    if (firstRouter === -1) throw new Error("no router mount found in server.js");
    if (dbStateAt > firstRouter) {
      throw new Error(
        "dbState is set after the first router, so it never runs for a page"
      );
    }
  },
});

// ── Start-up work must not live in app.listen's callback ────────────
//
// That callback only fires when this process binds the port itself.
// Under LiteSpeed's lsnode, which is what runs this on the live host,
// the platform owns the socket and the callback never fires. The site
// serves every request perfectly well while none of its start-up runs:
// no migrations, no schema probe, no batch sweep.
//
// The symptom is every optional column reading as absent, which
// switches off the timetable and blames a migration for it. Nothing in
// the logs, nothing in the tests, and days spent looking at the
// database. Only the shape of the file gives it away.
logicChecks.push({
  area: "server",
  label: "probeColumns and the sweep run outside app.listen's callback",
  run() {
    const fs = require("fs");
    const path = require("path");
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

    // The CALL SITE, not where the function is written. boot() is
    // declared above app.listen either way, so a position check on
    // "db.probeColumns(" passes happily while the call sits inside the
    // callback -- which is the bug. Asked the first time and it proved
    // nothing.
    const listenAt = server.indexOf("app.listen(");
    if (listenAt === -1) throw new Error("no app.listen in server.js");

    if (!/\.then\(boot\)/.test(server)) {
      throw new Error("boot() is not called from the promise chain before listening");
    }
    if (server.slice(listenAt).includes("boot()")) {
      throw new Error(
        "boot() is called inside app.listen's callback — on a host that owns the socket it never runs"
      );
    }
    for (const needed of ["db.probeColumns(", "migrate.run()", "sweep()"]) {
      if (!server.includes(needed)) throw new Error(needed + " is not in server.js at all");
    }
  },
});

for (const c of logicChecks) {
  try {
    c.run();
    pass++;
  } catch (e) {
    fail++;
    console.log(`  ✗ ${c.area || "navigation"} — ${c.label}\n      ${e.message.split("\n")[0]}`);
  }
}

if (DUMP) {
  const rows = dumped
    .map((d) => `<li><a href="/_preview/${d.slug}.html">${d.name}</a></li>`)
    .join(String.fromCharCode(10));
  fs.writeFileSync(
    path.join(DUMP, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Rendered views</title>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    // Versioned like every other page here. Without it the browser
    // served a cached stylesheet, and two rounds of measurements taken
    // through this page were of CSS that had already been replaced.
    `<link rel="stylesheet" href="/css/site.css?v=${Date.now()}">` +
    `<main style="max-width:60rem;margin:2rem auto;padding:0 1rem">` +
    `<h1>Rendered views</h1><p>${dumped.length} pages, from the fixtures in tools/check-views.js.</p>` +
    `<ul>${rows}</ul></main>`
  );
  console.log(`\n  ${dumped.length} page(s) written to public/_preview — open /_preview/`);
}
console.log(`\n  ${pricePass} price rule(s) checked, ${priceFail} failed`);
console.log(`\n  ${pass} rendered, ${fail} failed`);
process.exitCode = fail || priceFail ? 1 : 0;
