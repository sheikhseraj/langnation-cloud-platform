// ─────────────────────────────────────────────────────────────────────
//  LangNation Language Institute — website server.
//
//  Start:   npm install   then   npm start
//  Config:  copy .env.example to .env and fill it in
//
//  This file is deliberately thin. It wires up middleware, mounts the
//  routers and starts listening; the actual work lives in routes/ and
//  lib/. Nothing here touches the database directly and no HTML is
//  generated here.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const linaRag = require("./services/rag");

const path = require("path");

const express = require("express");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const { loadEnv, env, bool } = require("./lib/env");
loadEnv();

const db = require("./lib/db");
const mailer = require("./lib/mailer");
const site = require("./lib/site");
const content = require("./lib/content");
// Batch statuses follow their dates; see the sweep below.
const intakes = require("./lib/intakes");
const lessons = require("./lib/lessons");
const migrate = require("./lib/migrate");
const analytics = require("./lib/analytics");
const pages = require("./routes/pages");
const placementRoutes = require("./routes/placement");
const admin = require("./routes/admin");
const rootadmin = require("./routes/rootadmin");
const coursesDb = require("./lib/courses-db");
const student = require("./routes/student");
const teacher = require("./routes/teacher");
const chatRoutes = require("./routes/chat");
const { LANGS, localePath, translator, LOCALE_TAG } = require("./lib/i18n");

const app = express();
const PORT = Number(env("PORT", 3000));
const PRODUCTION = env("NODE_ENV") === "production";

// Hostinger (and any reverse proxy) terminates TLS in front of us, so trust
// its forwarding headers for correct protocol and client IP.
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("x-powered-by", false);

app.use(compression());
// Group logos follow the existing resized-avatar data URL pattern. Keep the
// larger parser scoped to this exact protected upload route.
app.use('/admin/community/api/groups/:id/image',express.json({limit:'600kb'}));
app.use(express.json({ limit: "64kb" }));
// `extended: true` so that bracket names group into an object — the
// placement test posts `answers[a1-3]=2` for each question, and with the
// plain parser those arrive as flat keys literally called "answers[a1-3]",
// which scored every paper as zero. parameterLimit is capped because the
// nesting parser is the one worth bounding.
/* The one route that carries attachments, parsed before the global
 * limit can refuse it.
 *
 * This has to be here and not in routes/admin.js, and that cost an
 * "Internal Server Error" to learn. Express's body parsers run in the
 * order they are mounted and skip a request whose body has already been
 * read — so the 64kb parser below was reaching an 8MB form first and
 * throwing PayloadTooLargeError, hundreds of lines before the admin
 * router existed. A limit set on the route never got a say.
 *
 * 12mb for a 5MB cap on the files: base64 is four bytes on the wire for
 * every three in the file, and the message and its fields ride along in
 * the same body. lib/attachments.js is what actually enforces the cap;
 * this only has to be roomy enough to let a legal one through.
 *
 * Everything else on the site keeps 64kb.
 */
app.use(
  "/admin/reply",
  express.urlencoded({ extended: false, limit: "12mb", parameterLimit: 40 })
);

app.use(express.urlencoded({ extended: true, limit: "64kb", parameterLimit: 400 }));
app.use(cookieParser());

// ── Security headers ─────────────────────────────────────────────────
app.use((req, res, next) => {
  if (site.isStaging) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), interest-cohort=()");
  if (PRODUCTION && site.origin.startsWith("https://")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // The theme picker and the font loader are small inline scripts.
      // challenges.cloudflare.com is Turnstile, the bot check on the
      // enquiry form. It loads a script and renders inside an iframe,
      // so it needs both script-src and frame-src.
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://challenges.cloudflare.com",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join("; ")
  );
  next();
});

// ── Canonical host + trailing slash ──────────────────────────────────
app.use((req, res, next) => {
  // Strip a trailing slash so "/courses/" and "/courses" are not two pages.
  if (req.path.length > 1 && req.path.endsWith("/")) {
    const qs = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + qs);
  }
  next();
});

// ── Static files ─────────────────────────────────────────────────────
// Content-hashed images and versioned CSS/JS can be cached hard; HTML never is.
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: PRODUCTION ? "30d" : 0,
    etag: true,
    setHeaders(res, filePath) {
      if (/\.(webmanifest|json)$/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
      if (filePath.endsWith("sw.js")) {
        // The service worker itself must never be served stale, or a deploy
        // can be pinned in place for weeks.
        res.setHeader("Cache-Control", "no-cache");
      }
      // Brand artwork, which the 30-day default was wrong for.
      //
      // The <img> and <link> tags now carry ?v=<assetVersion>, so a deploy
      // changes their URLs and those are free to cache hard. But nothing
      // can version /favicon.ico — browsers request that exact path
      // themselves — and the manifest's icon URLs are baked into a static
      // JSON file. Those two would have sat on the old mark for a month.
      //
      // A day, then revalidate. The files are a few KB and they are
      // ETagged, so a revalidation that finds nothing new is a 304 with no
      // body — far cheaper than being wrong for four weeks.
      if (/\.ico$/.test(filePath) || /[\\/]icons[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
      }
    },
  })
);

// ── 301s from the old CodeIgniter URLs ───────────────────────────────
const REDIRECTS = content.redirectMap();
app.use((req, res, next) => {
  const path = req.path.toLowerCase().replace(/\/$/, "");
  // Path plus query first: the old site put eighteen different study
  // pages behind one route, separated only by ?id=. Falling back to the
  // bare path then covers everything else, and gives those eighteen a
  // sensible home if the id is one we have no mapping for.
  const query = req.originalUrl.includes("?")
    ? path + "?" + req.originalUrl.split("?")[1].toLowerCase()
    : null;
  const target = (query && REDIRECTS.get(query)) || REDIRECTS.get(path);
  if (target) return res.redirect(301, target);
  next();
});

// ── robots.txt & sitemap.xml ─────────────────────────────────────────
app.get("/robots.txt", (req, res) => {
  // On anything that is not the live domain, refuse the whole site. A test
  // copy that gets indexed competes with the real one for its own rankings.
  const lines = site.isStaging
    ? ["User-agent: *", "Disallow: /", ""]
    : [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /portal",
        "Disallow: /teach",
        "Disallow: /api/",
        "",
        `Sitemap: ${site.origin}/sitemap.xml`,
        "",
      ];
  res.type("text/plain").send(lines.join("\n"));
});

app.get("/sitemap.xml", (req, res) => {
  const paths = ["/", "/courses", "/exam-papers", "/study-material", "/faq",
                 "/germany", "/tools", "/blog", "/contact", "/about",
                 "/team", "/events", "/gallery", "/placement-test",
                 "/einbuergerungstest"]
                 .filter((p) => !site.isHidden(p));
  for (const c of content.courses("en")) paths.push(`/courses/${c.slug}`);
  for (const p of content.posts("en")) paths.push(`/blog/${p.slug}`);
  for (const p of content.pages("en")) {
    if (!paths.includes(`/${p.slug}`)) paths.push(`/${p.slug}`);
  }

  const urls = paths
    .map((p) => {
      const alts = LANGS.map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${site.origin}${localePath(l, p)}"/>`
      ).join("\n");
      return `  <url>
    <loc>${site.origin}${p}</loc>
${alts}
    <changefreq>weekly</changefreq>
    <priority>${p === "/" ? "1.0" : p.startsWith("/courses") ? "0.9" : "0.6"}</priority>
  </url>`;
    })
    .join("\n");

  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
    );
});

// ── Health check ─────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    origin: site.origin,
    staging: site.isStaging,
    content: content.stats(),
    database: db.isEnabled() ? (await db.healthy()) : "not configured",
    email: (() => {
      if (!mailer.isConfigured()) return "not configured";
      const v = mailer.lastVerification();
      if (!v) return "configured, not yet checked";
      return v.ok ? "working" : "REFUSED: " + v.reason;
    })(),
  });
});

// ── Application routes ───────────────────────────────────────────────
// The placement test, before the language routers: those are
// catch-alls and would answer /placement-test/exam with a 404 page.
for (const l of LANGS) {
  const base = l === "en" ? "/placement-test" : `/${l}/placement-test`;
  app.use(base, pages.context(l), placementRoutes.build(l));
}

/* The schema state, on every render.
 *
 * res.locals rather than a per-route local: the sidebar that shows it
 * is included by a dozen admin pages, and adding it to a dozen render
 * calls is a dozen chances to forget one — which would make the panel
 * disappear on exactly the page somebody was looking at.
 *
 * ABOVE the routers, and that is not a style choice. Express runs
 * middleware in the order it is added, so anything registered after
 * app.use("/admin", ...) never runs for a request that a router has
 * already answered. This sat below them for one release and did
 * nothing at all — the panel simply was not there, which looked
 * exactly like the feature not having shipped.
 *
 * db.state() is read per request rather than captured here, so a probe
 * that has not finished at start-up is not frozen into every page.
 */
app.use((req, res, next) => {
  // The schema the site found, and the migrations it would not run
  // unattended — together, because both answer "why is this feature
  // off" and separating them would mean looking in two places.
  res.locals.dbState = Object.assign({}, db.state(), { migrations: migrate.lastRun() });
  next();
});

app.use('/api/community', require('./lib/community/public-router').createPublicRouter());
app.use('/admin/community', require('./routes/community-admin').build());
app.use("/admin", admin.build());
// The content editor. Closed unless ROOT_PASSWORD is set; see routes/rootadmin.js.
app.use("/rootadmin/vocabulary-catalogue", require("./routes/vocabulary-catalogue-admin").build());
app.use("/rootadmin/lesen", rootadmin.build({module:"reading"}));
// ============================================================
// AWS ECS / ALB Health Check
// ============================================================
//
// Used by:
// - Application Load Balancer
// - CloudFront validation
// - GitHub Actions deployment workflow
//
// Keep this endpoint lightweight and independent of page routing.
// ============================================================

app.get("/health", (_req, res) => {
  res
    .status(200)
    .set("Cache-Control", "no-store")
    .json({
      status: "healthy",
      service: "langnation-demo"
    });
});

// ============================================================
// Milestone 9 - Lina AI Tutor API
// ============================================================
//
// POST /api/lina/ask
//
// Request:
// {
//   "question": "Wann benutze ich der, die oder das?"
// }
//
// Response:
// {
//   "question": "...",
//   "answer": "...",
//   "grounded": true,
//   "sources": [...]
// }
// ============================================================

app.post("/api/lina/ask", async (req, res) => {
  try {
    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "question_required",
        message: "Please provide a question."
      });
    }

    if (question.length > 2000) {
      return res.status(400).json({
        error: "question_too_long",
        message: "Please keep the question under 2000 characters."
      });
    }

    const result = await linaRag.answerQuestion(question);

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      "Lina RAG request failed:",
      error?.message || error
    );

    return res.status(500).json({
      error: "lina_unavailable",
      message: "Lina could not answer the question right now."
    });
  }
});
app.use("/rootadmin", rootadmin.build());
// Mounted before the language routers: those are catch-alls, and "/" would
// otherwise answer /portal/* with a 404 page.
app.use("/portal", student.build());
// The teacher portal. Same reason for the position, and mounted next to
// the student one because they are the same kind of thing seen from
// opposite sides of a classroom.
app.use("/teach", teacher.build());

/* The assistant. Above the language routers, which are catch-alls, and
   on one path for both languages — the question carries the language
   it wants answering in, so there is nothing for /de to own. */
app.use("/chat", chatRoutes.build());
app.use("/de", analytics.middleware("de"), pages.build("de"));
app.use("/", analytics.middleware("en"), pages.build("en"));

// ── 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  const lang = req.path.startsWith("/de/") || req.path === "/de" ? "de" : "en";
  const t = translator(lang);
  res.status(404).render("pages/error", {
    status: 404,
    lang,
    localeTag: LOCALE_TAG[lang],
    t,
    lp: (p) => localePath(lang, p),
    site,
    year: new Date().getFullYear(),
    canonicalPath: req.path,
    altLang: lang === "de" ? "en" : "de",
    altLangPath: localePath(lang === "de" ? "en" : "de", "/"),
    alternates: [
      { hreflang: "en", path: "/" },
      { hreflang: "de", path: "/de" },
    ],
    nav: [],
    footerCourses: content.courses(lang).filter((c) => c.track === "Regular").slice(0, 6),
    seo: { title: `${t("error.404.title")} | LangNation`, description: t("error.404.lead"), noindex: true },
    jsonLd: null,
    pageScript: null,
  });
});

// ── Errors ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  const lang = req.path.startsWith("/de") ? "de" : "en";
  const t = translator(lang);
  res.status(500).render("pages/error", {
    status: 500,
    lang,
    localeTag: LOCALE_TAG[lang],
    t,
    lp: (p) => localePath(lang, p),
    site,
    year: new Date().getFullYear(),
    canonicalPath: req.path,
    altLang: lang === "de" ? "en" : "de",
    altLangPath: "/",
    alternates: [
      { hreflang: "en", path: "/" },
      { hreflang: "de", path: "/de" },
    ],
    nav: [],
    footerCourses: [],
    seo: { title: "Error | LangNation", description: "", noindex: true },
    jsonLd: null,
    pageScript: null,
  });
});

// ── Boot ─────────────────────────────────────────────────────────────
db.init();

mailer.init();
// Ask the mail server whether the credentials work, rather than assuming
// that filled-in variables mean working email. A rejected password used
// to fail silently on every enquiry and every student registration.
mailer.verify().then((r) => {
  if (!r.ok && mailer.isConfigured()) {
    console.error(`!  SMTP is configured but the login was refused: ${r.reason}`);
    console.error("   Enquiry notifications and student verification emails will not send.");
  }
});
analytics.start();

// Load courses from MySQL before accepting traffic, so the first visitor
// is not served the shipped JSON while the cache is still filling. If the
// read fails, or the table is empty because the migration has not run,
// lib/content.js keeps using that JSON and the site comes up regardless.
// refresh() never rejects, so a database problem cannot stop the server.
let server;
// Start-up work, and NOT inside app.listen's callback.
//
// That callback only fires when this process binds the port itself.
// Under LiteSpeed's lsnode — which is what runs this on Hostinger —
// the platform owns the socket, so the callback never fires at all.
// The site serves every request perfectly well and none of its
// start-up ever runs: no migrations, no schema probe, and no batch
// sweep. Every optional column then reads as absent, which switches
// off the timetable and blames a migration for it.
//
// It cost days. Nothing that must happen at boot belongs in a
// callback that is the platform's to call.
async function boot() {

  // Which optional columns this database has, asked once before the
  // first request. The queries that use them are built from the
  // answer, so shipping code ahead of its migration switches a
  // feature off rather than emptying a student's account.
  // Schema first, then ask what the schema has.
  //
  // This order is the whole point: probeColumns caches its answer for
  // the life of the process, so a migration applied after it would be
  // invisible until the next restart -- which is precisely the trap
  // that made a missing column look like a broken feature.
  // Each step in its own try/catch, and this is not belt-and-braces.
  //
  // This whole callback is one async function. A throw anywhere in it
  // skips everything after, silently — there is no catch, and an
  // unhandled rejection in a listen callback does not always take the
  // process down, so the site comes up looking fine with half its
  // start-up missing.
  //
  // That is not hypothetical. migrate.run() was added directly above
  // probeColumns, and when it failed on the server, probeColumns never
  // ran: every optional column read as absent, the timetable switched
  // itself off, and the batch page blamed a migration that had
  // actually been applied. Days went into that.
  let migrated = { applied: [], adopted: [], skipped: [], failed: [], already: 0 };
  try {
    migrated = await migrate.run();
  } catch (e) {
    console.error("  ! migrations threw — continuing without them:", e.message);
  }

  if (migrated.applied.length) {
    console.log(`  migrations applied: ${migrated.applied.join(", ")}`);
  }
  // Said once, on the boot that records them, and never again. This is
  // a database that was already in the state the file would have put it
  // in — usually because somebody ran it by hand a year ago.
  if ((migrated.adopted || []).length) {
    console.log(
      `  ${migrated.adopted.length} migration(s) recorded as already done:\n` +
        migrated.adopted.map((a) => `      ${a.name} — ${a.says}`).join("\n")
    );
  }
  if (migrated.failed.length) {
    for (const f of migrated.failed) {
      console.warn(`  ! migration ${f.name} FAILED — ${f.error}`);
    }
  }
  if (migrated.skipped.length) {
    console.warn(
      `\n  ! ${migrated.skipped.length} migration(s) change existing rows and are NOT run\n` +
        `    automatically, and this database does not show their result yet:\n` +
        migrated.skipped.map((n) => `      MySQL/${n}`).join("\n") +
        `\n`
    );
  }

  // Must run whatever happened above it. Every optional feature in
  // the site is switched on or off by the answer, so skipping it does
  // not degrade one thing — it degrades all of them at once, and says
  // nothing.
  try {
    await db.probeColumns([
      // intakes.teacher2_id and teacher2_name are deliberately absent:
      // nothing asks about them any more. See lib/owns.js.
      "intakes.status_auto",
      "intakes.meets_days",
      "intakes.exercise_url",
      "lessons.generated",
      "lessons.teacher_id",
      "attendance.source",
      // Migration 28. Without this the homework pages would switch
      // themselves off on a database that has them, which is the exact
      // shape of the bug lessons.teacher_id already caused.
      "exercises.published",
      // Migration 29: the per-email unlock, for trying homework out
      // before a class gets it.
      "exercises.unlock_emails",
      // Migration 31: the Sent folder. Without this the office would
      // send emails that were never written down, and the folder would
      // sit there empty saying nothing about why.
      "sent_emails.sent_at",
      // Migration 32: the assistant's answer cache. Without this every
      // question would go to the API, including the twelve it is asked
      // every day — which is a bill rather than a broken page, and so
      // the kind of thing nobody notices.
      "chat_answers.norm_hash",
      // Migration 12 added it, but nothing had needed to know whether
      // it was there until an invoice wanted the student's address.
      // An invoice is a legal document and a missing column must make
      // the address short, not the query throw.
      "students.city",
      "students.invoice_recipient",
      "students.invoice_company",
      "students.invoice_address",
      "students.invoice_personal_address", "students.invoice_company_address",
      "invoice_address_versions.id", "invoice_address_requests.id", "invoice_address_notifications.id",
      // Migration 35: pages in a chapter, and tasks nothing marks.
      // Without this a database that has not run it would be asked
      // for a column it does not have on every read of every piece of
      // homework.
      "exercise_questions.page",
      "exercises.module", "exercises.content_key", "exercises.available_from",
      "exercises.available_until", "exercises.is_required", "exercise_attempts.last_opened_at",
      "student_vocabulary.dictionary_key",
      ...require("./lib/vocabulary-learning").columns,
      "exercises.learning_config",
      "exercise_attempts.learning_state",
      // Migration 33: which instalment an invoice is.
      "invoices.instalment_no",
      // Migration 34: the payment that put another one back.
      "payments.reverses_id",
    ]);
  } catch (e) {
    console.error("  ! could not read the schema:", e.message);
  }

  require("./lib/invoice-address-mail").start();

  // Batches whose dates have arrived, moved on.
  //
  // In-process on an interval rather than a cron entry: shared hosting
  // does not reliably give you cron, and a feature that silently does
  // not run on the server it ships to is worse than one that is not
  // there. Hourly is generous for something that changes once a day —
  // the point is that a batch starting on the 16th is running on the
  // 16th without anybody remembering to say so.
  //
  // Both UPDATEs are idempotent and scoped to status_auto rows, so two
  // processes running it at once is a no-op, not a race.
  const sweep = () =>
    intakes
      .sweepStatuses()
      .then((n) => {
        if (n.started || n.finished) {
          console.log(
            `  batch statuses: ${n.started} started, ${n.finished} finished`
          );
        }
      })
      // And the lessons those batches meet for. Here rather than on
      // its own timer because the two belong together: a batch that
      // has just started is a batch whose timetable someone is about
      // to look at. Both are idempotent, so running them repeatedly
      // costs two indexed queries and changes nothing.
      .then(() => lessons.generateAll())
      .then((n) => {
        if (n.created || n.removed) {
          console.log(
            `  lessons: ${n.created} added, ${n.removed} withdrawn across ${n.batches} batch(es)`
          );
        }
      })
      .catch(() => {});

  sweep();
  // Every ten minutes, not every hour. The status changes at midnight
  // in the school's timezone, and an hourly timer anchored to whenever
  // the server happened to boot can be fifty-nine minutes late to it —
  // on the morning a course starts, that is the difference between a
  // student finding "Join the class" and not.
  //
  // Two indexed UPDATEs against a table of batches; ten minutes is not
  // a cost worth worrying about.
  const timer = setInterval(sweep, 10 * 60 * 1000);
  // Do not hold the process open on this alone: without unref a clean
  // shutdown waits up to an hour for a timer nobody is waiting for.
  if (timer.unref) timer.unref();
}

coursesDb.refresh()
  .then(boot)
  .catch((e) => console.error("  ! start-up failed:", e.message))
  .then(() => {
    // Listening last, so the first request meets a site that has
    // finished waking up.
    server = app.listen(PORT, () => {
      const c = content.stats();
      console.log(`
    LangNation website
    ──────────────────────────────────────────
    http://localhost:${PORT}
    ${c.courses} courses · ${c.posts} posts · ${c.pages} pages  (courses from ${coursesDb.isReady() ? "database" : "shipped JSON"})
    ${REDIRECTS.size} legacy redirects active
    mode: ${PRODUCTION ? "production" : "development"}${site.isStaging ? "  ·  STAGING — search engines blocked" : ""}
    origin: ${site.origin}
    `);
    });
  });

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    // A signal can arrive while the courses cache is still loading, before
    // there is a server to close.
    if (!server) process.exit(0);
    server.close(async () => {
      // Write out any counts still buffered in memory before exiting.
      await analytics.stop().catch(() => {});
      await db.close().catch(() => {});
      process.exit(0);
    });
  });
}

module.exports = app;
