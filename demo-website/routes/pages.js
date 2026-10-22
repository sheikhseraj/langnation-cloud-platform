// ─────────────────────────────────────────────────────────────────────
//  Every public page.
//
//  One router, mounted twice: at "/" for English and at "/de" for German.
//  Express strips the mount path, so a single set of route definitions
//  serves both languages and the two can never drift apart.
//
//  No SQL in this file and none in the templates — content comes from
//  lib/content.js, which read it once at boot.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");

const content = require("../lib/content");
// Headings out of a body, and ids to link to them by.
const toc = require("../lib/toc");
const db = require("../lib/db");
const downloads = require("../lib/downloads");
const enquiries = require("../lib/enquiries");
const placement = require("../lib/placement");
const einbuergerungstest = require("../lib/einbuergerungstest");
const etReports = require("../lib/et-reports");
const attempts = require("../lib/placement-attempts");
const mailer = require("../lib/mailer");
const site = require("../lib/site");
const spam = require("../lib/spam");
const countries = require("../content/countries.json");
const { toText, metaTitle, metaDescription } = require("../lib/text");
const { LOCALE_TAG, translator, localePath } = require("../lib/i18n");

/* The languages the dictionary will give a meaning in, in its own
   order. Read off langnation.de on 12 September 2026.

   Here rather than fetched: the home page must not depend on another
   site being up to render, and a list of sixteen language names does
   not change often enough to be worth a request. If the dictionary
   adds one, add it here. */
const DICTIONARY_LANGUAGES = [
  "हिन्दी", "తెలుగు", "தமிழ்", "ಕನ್ನಡ", "മലയാളം", "मराठी",
  "ગુજરાતી", "ਪੰਜਾਬੀ", "বাংলা", "ଓଡ଼ିଆ", "অসমীয়া",
  "اردو", "فارسی", "دری", "پښتو", "العربية",
];

const GERMANY_GROUPS = [
  "Study-in-Germany",
  "School-System-Germany",
  "First-Step-in-Germany",
  "Working-in-Germany",
];

// Pages that have their own route and must not be caught by /:slug.
// "about" is deliberately absent: it is a migrated CMS page (the old
// `langnation` row, renamed) and is served by the catch-all below.
const RESERVED = new Set([
  "courses", "blog", "germany", "tools", "contact", "imprint",
  "exam-papers", "study-material", "faq", "downloads",
  "team", "events", "gallery", "placement-test", "verify",
  "einbuergerungstest",
  "admin", "api", "de", "sitemap.xml", "robots.txt", "manifest.webmanifest", "sw.js",
]);

/** Per-request context shared by every template. */
function context(lang) {
  return function (req, res, next) {
    const t = translator(lang);
    const lp = (p) => localePath(lang, p);
    const currentPath = req.path === "/" ? "/" : req.path.replace(/\/$/, "");

    // The old site had eight top-level menus, several of them duplicated or
    // pointing at "#". Six groups cover everything it had, with each page
    // reachable in one hop.
    /* Five groups, down from seven.

       Seven top-level items plus a language switch, a theme button, an
       account button and an Enquire button is more than a header can
       hold on a laptop, and the two that went were the two that were
       already covered somewhere else.

       Tools folded into Germany: every one of those calculators
       converts a grade or a test score for a German university, which
       is what the Germany guide is about — and they all live on one
       page, so listing four anchors into it was menu for the sake of
       menu.

       Contact folded into About: the Enquire button sits three
       centimetres away and goes to the same page. It is still in the
       menu, under About, and it is still in the footer. */
    const navTree = [
      {
        label: t("nav.short.courses"),
        href: "/courses",
        children: [
          { label: t("cta.viewCourses"), href: "/courses" },
          // Derived from the catalogue rather than listed here, so retiring
          // a track in the editor removes it from the menu too. The list
          // used to be hard-coded, which left Weekend and Speaking in the
          // menu pointing at an empty page after both were archived.
          ...content.coursesByTrack(lang).map((g) => ({
            label: t("courses.track." + g.track),
            href: "/courses?track=" + g.track,
          })),
          { label: t("nav.placement"), href: "/placement-test", divider: true },
        ],
      },
      {
        label: t("nav.short.exams"),
        href: "/exam-papers",
        children: [
          // First, not last: it is the thing people are searching for
          // right now, and it was at the bottom behind a divider.
          // Named in German in both locales because it is the German
          // exam, and "Citizenship test" is not what anybody types.
          { label: "Einbürgerungstest", href: "/einbuergerungstest" },
          { label: t("nav.exams"), href: "/exam-papers", divider: true },
          { label: t("nav.resources"), href: "/study-material" },
        ],
      },
      {
        label: t("nav.short.germany"),
        href: "/germany",
        children: [
          { label: t("germany.title"), href: "/germany" },
          { label: lang === "de" ? "WhatsApp-Community" : "WhatsApp Community", href: "/community" },
          ...GERMANY_GROUPS.map((g) => ({ label: t("germany.group." + g), href: "/germany#" + g.toLowerCase() })),
        ],
      },
      {
        // Its own item rather than a line at the bottom of Germany.
        // Buried there it was three clicks and a guess away: nobody
        // looking to convert an Indian percentage into a German grade
        // thinks to open a menu called "Deutschland" first. The four
        // calculators are listed individually because each one is a
        // separate errand — people arrive wanting one of them, not
        // "tools".
        label: t("nav.tools"),
        href: "/tools",
        children: [
          { label: t("nav.tools.all"), href: "/tools" },
          { label: t("nav.tools.grade"), href: "/tools#grade", divider: true },
          { label: t("nav.tools.ects"), href: "/tools#ects" },
          { label: t("nav.tools.ielts"), href: "/tools#ielts" },
          { label: t("nav.tools.toefl"), href: "/tools#toefl" },
        ],
      },
      {
        // Our own dictionary, and a separate site. It earns a place of
        // its own in the menu rather than a line in a submenu: it is a
        // real product — conjugation tables, declensions, synonyms,
        // example sentences, audio — and until recently the only way to
        // find it was the bottom of the footer.
        label: t("nav.dictionary"),
        href: site.dictionaryUrl,
        external: true,
        children: [],
      },
      {
        label: t("nav.about.group"),
        href: "/about",
        children: [
          { label: t("nav.about"), href: "/about" },
          { label: t("nav.team"), href: "/team" },
          { label: t("nav.events"), href: "/events" },
          { label: t("nav.gallery"), href: "/gallery" },
          { label: t("nav.blog"), href: "/blog" },
          { label: t("nav.faq"), href: "/faq" },
          { label: t("nav.contact"), href: "/contact", divider: true },
        ],
      },
    ];

    const isCurrent = (href) => {
      // A fragment points inside a page, not at a different one. Without
      // this, standing on /tools marked all four calculator links
      // "current" at once and the whole submenu lit up — same for the
      // five anchors under Germany.
      if (href.includes("#")) return false;
      const base = href.split(/[?#]/)[0];
      return currentPath === base || (base !== "/" && currentPath.startsWith(base + "/"));
    };

    res.locals.lang = lang;
    res.locals.localeTag = LOCALE_TAG[lang];
    res.locals.t = t;
    res.locals.lp = lp;
    res.locals.site = site;
    res.locals.year = new Date().getFullYear();

    res.locals.canonicalPath = localePath(lang, currentPath);
    res.locals.altLang = lang === "de" ? "en" : "de";
    res.locals.altLangPath = localePath(lang === "de" ? "en" : "de", currentPath);
    res.locals.alternates = [
      { hreflang: "en", path: localePath("en", currentPath) },
      { hreflang: "de", path: localePath("de", currentPath) },
    ];

    // A page switched off in HIDDEN_PAGES leaves the menu entirely.
    const visible = (href) => !site.isHidden(href.split(/[?#]/)[0]);

    res.locals.nav = navTree
      .filter((item) =>
        // An external item is another site: there is no page of ours
        // to hide, and no locale prefix to add.
        item.external || visible(item.href) || (item.children || []).some((c) => visible(c.href)))
      .map((item) => ({
        label: item.label,
        external: Boolean(item.external),
        href: item.external ? item.href : lp(item.href),
        // A group is highlighted when the visitor is on any page inside it.
        current: isCurrent(item.href) || (item.children || []).some((c) => isCurrent(c.href)),
        children: (item.children || []).filter((c) => visible(c.href)).map((c) => ({
          label: c.label,
          href: lp(c.href),
          divider: Boolean(c.divider),
          current: isCurrent(c.href),
        })),
      }));

    // The footer lists the three TRACKS, not six levels of one course.
    // "German Regular A1" through "C2" is the same course six times,
    // and it was most of the footer's height.
    res.locals.footerTracks = content.coursesByTrack(lang).map((g) => g.track);

    // Sensible SEO defaults; each route overrides what it needs.
    res.locals.seo = {
      title: t("meta.home"),
      description: t("site.description"),
      keywords: "",
      image: "/img/og-default.png",
      type: "website",
    };
    res.locals.jsonLd = null;
    res.locals.pageScript = null;

    // Titles and descriptions arrive from the old database at every length.
    // Trimming them here means no route has to remember to do it, and the
    // <head> template stays free of logic.
    const render = res.render.bind(res);
    res.render = (view, locals, cb) => {
      const seo = res.locals.seo || {};
      res.locals.seo = {
        ...seo,
        title: metaTitle(seo.title, "LangNation"),
        description: metaDescription(seo.description, t("site.description")),
      };
      return render(view, locals, cb);
    };

    next();
  };
}

function build(lang) {
  const router = express.Router();
  router.use(context(lang));

  router.get('/community/join/:slug', require('../lib/community/public-join-link').joinPageHandler({lang,countries}));

  router.get('/community', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.locals.seo = { ...res.locals.seo, title: (lang === 'de' ? 'Community beitreten' : 'Join the Community') + ' | LangNation' };
    res.render('pages/community', { countries, communityCsrf: require('../lib/csrf').token(req, res) });
  });

  // ── Home ───────────────────────────────────────────────────────
  router.get("/", (req, res) => {
    const t = res.locals.t;
    const all = content.courses(lang);

    res.locals.seo = {
      ...res.locals.seo,
      title: t("meta.home"),
      description: t("site.description"),
    };
    res.locals.jsonLd = {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: "LangNation Language Institute",
      url: site.origin,
      logo: `${site.origin}/icons/icon-512.png`,
      description: t("site.description"),
      email: site.contact.email,
      telephone: site.contact.phoneDe,
      sameAs: Object.values(site.social),
    };

    res.render("pages/home", {
      dictionaryLanguages: DICTIONARY_LANGUAGES,
      // A real screenshot of the dictionary, once there is one. Until
      // then the band shows the sixteen languages instead, which is
      // the part worth showing anyway.
      dictionaryImage: content.image("dictionary"),
      // One card per kind of course, not six Regular courses in a
      // row. The home page was showing German Regular A1 through C2
      // and nothing else, which made three tracks look like one.
      //
      // The picture is chosen here rather than in the template because
      // the choice has a rule to it. Every Regular course photo has
      // its own level painted into the corner — a big "A1" — and that
      // photo on a card labelled "A1 – C2" is simply wrong. So:
      //   1. a media item named track-<track>, if somebody has
      //      uploaded one for exactly this purpose;
      //   2. otherwise a course photo from the track that carries no
      //      level, which is what One-to-one has;
      //   3. otherwise nothing, and the card draws its own cover.
      featured: content.coursesByTrack(lang).map((g) => {
        const key = "track-" + String(g.track).toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const plain = g.items.find((c) => c.image && !c.level);
        return { ...g, image: content.image(key) || (plain && plain.image) || null };
      }),
      testimonials: content.testimonials().slice(0, 6),
      // Twelve, not three. Three was the right number for a grid, where
      // a fourth post meant a second row and a taller page; on a rail they
      // sit side by side and cost nothing but a scroll. A cap stays,
      // because a rail of forty is one nobody reaches the end of, and the
      // button underneath goes to the full list.
      posts: content.posts(lang).slice(0, 12),
      stats: content.stats(),
      heroImage: content.image("hero") || all.find((c) => c.image)?.image || null,
      // Null until a picture is imported, and the band falls back to the
      // drawn grid it has always had.
      etImage: content.image("einbuergerungstest"),
    });
  });

  // ── Course catalogue ───────────────────────────────────────────
  router.get("/courses", (req, res) => {
    const t = res.locals.t;
    const groups = content.coursesByTrack(lang);

    res.locals.seo = {
      ...res.locals.seo,
      title: t("meta.courses"),
      description: t("courses.lead"),
    };

    res.render("pages/courses", {
      groups,
      levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
      tracks: groups.map((g) => g.track),
    });
  });

  // ── Course detail ──────────────────────────────────────────────
  router.get("/courses/:slug", (req, res, next) => {
    const course = content.course(req.params.slug, lang);
    if (!course) return next();

    const t = res.locals.t;

    const tabs = [
      ["overview", "course.overview", course.body.description],
      ["curriculum", "course.curriculum", course.body.curriculum],
      ["requirements", "course.requirements", course.body.requirements],
      ["exam", "course.exam", course.body.examPattern],
    ]
      .filter(([, , html]) => html && html.trim())
      .map(([key, labelKey, html]) => ({ key, label: t(labelKey), html }));

    res.locals.seo = {
      title: course.seo.title || `${course.title} | LangNation`,
      description: course.seo.description || course.summary || t("site.description"),
      keywords: course.seo.keywords,
      image: course.image ? course.image.src : "/img/og-default.png",
      type: "article",
    };
    res.locals.jsonLd = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: course.title,
      description: course.summary,
      provider: {
        "@type": "EducationalOrganization",
        name: "LangNation Language Institute",
        sameAs: site.origin,
      },
      // priceNow, so a course on offer is not advertised in search
      // results at a price its own page does not charge.
      ...(course.priceNow
        ? {
            offers: {
              "@type": "Offer",
              price: course.priceNow,
              priceCurrency: "EUR",
              category: "Paid",
              url: `${site.origin}${localePath(lang, "/courses/" + course.slug)}`,
            },
          }
        : {}),
    };

    res.render("pages/course", {
      course,
      tabs,
      related: content
        .courses(lang)
        .filter((c) => c.track === course.track && c.slug !== course.slug)
        .slice(0, 6),
    });
  });

  // ── Blog ───────────────────────────────────────────────────────
  router.get("/blog", (req, res) => {
    res.locals.seo = {
      ...res.locals.seo,
      title: res.locals.t("meta.blog"),
      description: res.locals.t("blog.lead"),
    };
    res.render("pages/blog", { posts: content.posts(lang) });
  });

  router.get("/blog/:slug", (req, res, next) => {
    const post = content.post(req.params.slug, lang);
    if (!post) return next();

    res.locals.seo = {
      title: post.seo.title || post.title,
      description: post.seo.description || post.excerpt,
      keywords: post.seo.keywords,
      image: post.image ? post.image.src : "/img/og-default.png",
      type: "article",
    };
    res.locals.jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.date,
      image: post.image ? `${site.origin}${post.image.src}` : undefined,
      author: { "@type": "Organization", name: "LangNation" },
    };

    // The article's own sections, for the panel on the right. Built from
    // the body rather than stored, so it cannot fall out of step with
    // the text it describes, and it gives the headings the ids the
    // panel links to.
    const outline = toc.build(post.body);

    res.render("pages/blog-post", {
      post: Object.assign({}, post, { body: outline.html }),
      toc: outline.items,
      // Every post, this one included, for the contents panel — it has
      // to be in the list to be marked as where you are. Capped, because
      // a panel is a contents list and not an archive; the page it links
      // to is the archive.
      more: content.posts(lang).slice(0, 15),
    });
  });

  // ── Germany guide ──────────────────────────────────────────────
  router.get("/germany", (req, res) => {
    const t = res.locals.t;

    const groups = GERMANY_GROUPS.map((group) => ({
      label: t("germany.group." + group),
      items: content.pagesInGroup(group, lang).map((p) => ({ ...p, excerpt: toText(p.body, 130) })),
    })).filter((g) => g.items.length);

    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("germany.title")} | LangNation`,
      description: t("germany.lead"),
    };

    res.render("pages/germany", { groups });
  });

  // ── Calculators ────────────────────────────────────────────────
  // ── Einbürgerungstest ───────────────────────────────────────────
  //
  // The page itself is German whichever locale it is reached through:
  // it teaches the official German-language exam, and translating the
  // questions would make it a different test. Only the surrounding
  // chrome follows the site's language.

  router.get("/einbuergerungstest", (req, res) => {
    const t = res.locals.t;
    const summary = einbuergerungstest.summary();
    res.locals.seo = {
      ...res.locals.seo,
      title: t("et.metaTitle"),
      description: t("et.metaDescription"),
      type: "website",
    };
    res.locals.jsonLd = {
        "@context": "https://schema.org",
        "@type": "LearningResource",
        name: t("et.title"),
        // The page is in the reader's language; what it teaches is in
        // German either way, which is what teaches/inLanguage are
        // each saying here.
        inLanguage: lang,
        educationalLevel: "Einbürgerungstest / Leben in Deutschland",
        learningResourceType: "Übungstest",
        isAccessibleForFree: true,
        teaches: "Leben in Deutschland, Politik, Geschichte und Gesellschaft",
        url: site.origin + localePath(lang, "/einbuergerungstest"),
        provider: { "@type": "Organization", name: "LangNation Language Institute" },
    };
    res.render("pages/einbuergerungstest", { et: summary });
  });

  /**
   * The whole catalogue, to read rather than to be tested on.
   *
   * Every question with its answer marked, thirty to a page, chosen by
   * area — Deutschland for the 300 general ones, or a Bundesland for
   * its ten. It exists so the catalogue can be checked: a wrong answer
   * in a practice run is one card seen once, and ten of the picture
   * questions were wrong until somebody sat and read them.
   *
   * Server-rendered on purpose. It is the one part of this feature
   * that search engines should see, and thirty questions of static
   * text need no JavaScript at all.
   */
  router.get("/einbuergerungstest/fragen", (req, res, next) => {
    const view = einbuergerungstest.overview({
      area: req.query.land,
      page: req.query.seite,
    });
    // Falls through to the app's own 404 rather than rendering one
    // here: that page needs a dozen locals the layout expects, and
    // half-building them produced a 500 where a 404 belonged.
    if (!view) return next();

    const areaName = view.area.name;
    const range = view.pages > 1
      ? ` — Fragen ${view.from}–${view.to}`
      : "";
    res.locals.seo = {
      ...res.locals.seo,
      title: `Alle Fragen: ${areaName}${range} | Einbürgerungstest | LangNation`,
      description:
        `Alle offiziellen Fragen des Einbürgerungstests für ${areaName} mit den ` +
        "richtigen Antworten — kostenlos zum Nachlesen und Üben.",
      type: "article",
      // Paged lists: only the first page is worth indexing as the
      // canonical entry, the rest are the same list further down.
      noindex: view.page > 1,
    };
    res.render("pages/einbuergerungstest-fragen", { view: view });
  });

  /**
   * The questions for one Bundesland: the 300 general plus their ten.
   *
   * A static, public catalogue that only changes when the site is
   * redeployed, so it is cached hard and keyed by the catalogue date —
   * a learner who comes back next week re-uses what they already have.
   */
  router.get("/einbuergerungstest/fragen/:state.json", (req, res) => {
    const payload = einbuergerungstest.payloadFor(req.params.state);
    if (!payload) return res.status(404).json({ error: "Unbekanntes Bundesland." });
    res.set("Cache-Control", "public, max-age=86400");
    res.json(payload);
  });

  /**
   * The English wording and the explanatory notes, fetched separately.
   *
   * Not folded into the questions above on purpose. They are roughly
   * as many bytes again, most people never press either button, and
   * most people are on a phone — so this is fetched the first time
   * somebody actually asks for help, and then cached like the
   * catalogue itself.
   */
  router.get("/einbuergerungstest/hilfe/:state.json", (req, res) => {
    const payload = einbuergerungstest.payloadFor(req.params.state);
    if (!payload) return res.status(404).json({ error: "Unbekanntes Bundesland." });
    const extras = einbuergerungstest.extrasFor(
      payload.general.concat(payload.stateQuestions)
    );
    res.set("Cache-Control", "public, max-age=86400");
    res.json(extras);
  });

  /**
   * "Fehler melden" — a learner saying a question is wrong.
   *
   * Ten picture answers were wrong for weeks and no test we had would
   * ever have caught them; a person reading the catalogue did. So the
   * report costs a sentence and nothing else: no account, no name,
   * and an email only if they want an answer back.
   *
   * Answers 200 even when the database is off. The learner has done
   * their part either way, and an error page for our missing
   * configuration teaches them not to bother next time — the failure
   * is logged where we can see it instead.
   */
  router.post("/einbuergerungstest/melden", async (req, res) => {
    const t = res.locals.t;
    const body = req.body || {};

    // A hidden field no person can fill in. Bots fill everything.
    if (String(body.website || "").trim() !== "") {
      return res.json({ ok: true });
    }

    const bad = etReports.problems(body);
    if (bad.length) {
      return res.status(400).json({ ok: false, fields: bad, error: t("et.reportInvalid") });
    }

    if (!db.isEnabled()) {
      console.warn("Einbürgerungstest report dropped — no database:", body.questionId);
      return res.json({ ok: true, stored: false });
    }

    try {
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
        || req.ip || null;
      if (await etReports.recentCount(ip) >= etReports.PER_HOUR) {
        return res.status(429).json({ ok: false, error: t("et.reportTooMany") });
      }
      // The form posts to the unprefixed path from both locales, so
      // the router's own `lang` is always "en" here. The page says
      // which language it was being read in, and that is the one a
      // reply should go back in.
      const readIn = body.lang === "de" || body.lang === "en" ? body.lang : lang;
      await etReports.create({ ...body, lang: readIn }, { ip });
      res.json({ ok: true, stored: true });
    } catch (e) {
      // Same reasoning as above: the learner is not the one who can
      // fix a broken INSERT, so they are thanked and we get the log.
      console.error("Einbürgerungstest report failed:", e.message);
      res.json({ ok: true, stored: false });
    }
  });

  router.get("/tools", (req, res) => {
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: t("meta.tools"),
      description: t("tools.lead"),
    };
    res.render("pages/tools", {
      notes: ["grade-converter", "ects-converter"]
        .map((slug) => content.page(slug, lang))
        .filter(Boolean),
    });
  });

  // ── Practice exams ─────────────────────────────────────────────
  router.get("/exam-papers", (req, res) => {
    const t = res.locals.t;
    const levels = downloads.examLevels(content.faqs());

    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("exams.title")} — telc & Goethe A1–C2 | LangNation`,
      description: t("exams.lead"),
    };
    res.locals.jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: t("exams.title"),
      itemListElement: levels.map((lv, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t("exams.levelTitle", { level: lv.level }),
        url: `${site.origin}${localePath(lang, "/exam-papers")}#level-${lv.level.toLowerCase()}`,
      })),
    };

    res.render("pages/exams", { levels });
  });

  // ── Study material ─────────────────────────────────────────────
  router.get("/study-material", (req, res) => {
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("resources.title")} | LangNation`,
      description: t("resources.lead"),
    };
    res.render("pages/resources", { groups: downloads.resourceGroups(content.faqs()) });
  });

  // ── FAQ ────────────────────────────────────────────────────────
  router.get("/faq", (req, res) => {
    const t = res.locals.t;
    const list = content.faqs("FAQ");

    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("faq.title")} | LangNation`,
      description: t("faq.lead"),
    };
    res.locals.jsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: list.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: toText(f.answer) },
      })),
    };

    res.render("pages/faq", { faqs: list });
  });

  // ── Team ───────────────────────────────────────────────────────
  router.get("/team", (req, res, next) => {
    if (site.isHidden("team")) return next();
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("team.title")} | LangNation`,
      description: t("team.lead"),
    };
    res.render("pages/team", { team: content.team() });
  });

  // ── Events ─────────────────────────────────────────────────────
  router.get("/events", (req, res, next) => {
    if (site.isHidden("events")) return next();
    const t = res.locals.t;
    const { upcoming, past } = content.events(lang);

    // Short month name in the visitor's language, for the date block.
    const withMonth = (list) =>
      list.map((e) => ({
        ...e,
        monthLabel: e.date
          ? new Date(e.date + "T00:00:00Z").toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
              month: "short",
              timeZone: "UTC",
            })
          : "",
      }));

    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("events.title")} | LangNation`,
      description: t("events.lead"),
    };
    res.render("pages/events", { upcoming: withMonth(upcoming), past: withMonth(past) });
  });

  // ── Gallery ────────────────────────────────────────────────────
  router.get("/gallery", (req, res, next) => {
    if (site.isHidden("gallery")) return next();
    const t = res.locals.t;
    const items = content.gallery();
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("gallery.title")} | LangNation`,
      description: t("gallery.lead"),
      image: items[0] ? items[0].image.src : "/img/og-default.png",
    };
    res.render("pages/gallery", { gallery: items });
  });

  // ── Placement test (Einstufungstest) ───────────────────────────
  //  Three steps before the exam, each carrying a signed token forward:
  //    1  GET  /placement-test/:track          accept the terms
  //    2  POST /placement-test/:track/details  who is taking it
  //    3  POST /placement-test/:track/exam     the questions
  //       POST /placement-test/:track          marking
  //
  //  Steps 2 and 3 are POST-rendered on purpose: the exam cannot be reached
  //  by typing a URL without having accepted the terms and left contact
  //  details. The answer key stays on the server throughout — see
  //  lib/placement.js.
  router.get("/placement-test", (req, res) => {
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("placement.title")} A1–C2 | LangNation`,
      description: t("placement.lead"),
    };
    res.render("pages/placement-choose", {
      tracks: placement.tracks().map((tr) => {
        const count = placement.paperSize(tr.id);
        return { ...tr, count, minutes: Math.max(10, Math.round(count * 0.75)) };
      }),
    });
  });

  // Step 1 — the terms.
  router.get("/placement-test/:track", (req, res, next) => {
    const track = placement.trackFor(req.params.track);
    if (!track) return next();

    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("placement.title")} ${track.from}–${track.to} | LangNation`,
      description: t("placement.lead"),
    };
    res.render("pages/placement-terms", {
      track,
      // The rules for taking the test, not the school's general terms.
      // Somebody about to sit a placement test needs to know they may
      // not use a dictionary or an AI; the contract terms are not what
      // this step is for and burying the rules behind them meant nobody
      // read either.
      terms:
        content.page("placement-test-rules", lang) ||
        content.page("student-terms-and-conditions", lang),
      error: req.query.accept === "0",
    });
  });

  // Step 2 — contact details. Reached only by accepting the terms.
  router.post("/placement-test/:track/details", (req, res, next) => {
    const track = placement.trackFor(req.params.track);
    if (!track) return next();

    if (!req.body.accept) {
      return res.redirect(localePath(lang, `/placement-test/${track.id}?accept=0`));
    }

    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("placement.detailsTitle")} | LangNation`,
      noindex: true,
    };
    res.render("pages/placement-details", {
      countries,
      track,
      // Consent is signed, so this step cannot be forged by posting here.
      consentToken: placement.signCandidate({ track: track.id }),
      values: {},
      errors: null,
    });
  });

  // Step 3 — the exam. Reached only with valid details.
  router.post("/placement-test/:track/exam", async (req, res, next) => {
    const track = placement.trackFor(req.params.track);
    if (!track) return next();

    const t = res.locals.t;
    const consent = placement.readCandidate(req.body.consent);
    if (!consent || consent.track !== track.id) {
      return res.redirect(localePath(lang, `/placement-test/${track.id}?accept=0`));
    }
    if (enquiries.looksLikeSpam(req.body)) {
      return res.redirect(localePath(lang, "/placement-test"));
    }

    const values = {};
    for (const f of placement.CANDIDATE_FIELDS) {
      values[f] = String(req.body[f] || "").trim().slice(0, 300);
    }

    // The dialling code and the number arrive separately so the number
    // field can refuse anything but digits — the same arrangement as the
    // account request form, and joined the same way.
    if (req.body.phone_number || req.body.phone_cc) {
      const cc = String(req.body.phone_cc || "").replace(/[^0-9]/g, "");
      const num = String(req.body.phone_number || "").replace(/[^0-9]/g, "");
      values.phone = num ? (cc ? `+${cc} ${num}` : num) : "";
    }

    // Name and email are the two we cannot do without.
    const errors = {};
    if (!values.name) errors.name = "required";
    if (!values.email) errors.email = "required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = "invalid";

    if (Object.keys(errors).length) {
      res.locals.seo = {
        ...res.locals.seo,
        title: `${t("placement.detailsTitle")} | LangNation`,
        noindex: true,
      };
      return res.status(400).render("pages/placement-details", {
        countries,
        track,
        consentToken: req.body.consent,
        values,
        errors,
      });
    }

    // One attempt per address per day. Checked here, where the paper is
    // about to be issued: an issued paper is an attempt, or the limit is
    // escaped simply by never pressing submit.
    const recent = await attempts.recentFor(values.email);
    if (recent) {
      res.locals.seo = { ...res.locals.seo, noindex: true };
      return res.status(429).render("pages/placement-taken", {
        track,
        attempt: recent,
        hours: attempts.WINDOW_HOURS,
      });
    }

    const candidate = { ...values, track: track.id, consentAt: consent.consentAt };

    // Recorded now, before a single question is shown, so an abandoned
    // paper still counts. Not awaited: the test should not wait on a
    // write that only matters to the limit.
    attempts
      .start({
        email: values.email,
        name: values.name,
        track: track.id,
        ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
          .toString()
          .split(",")[0]
          .trim(),
      })
      .catch(() => {});

    // Capture the lead now, before they see a single question. Someone who
    // starts the test and gives up is still worth calling.
    const started = enquiries.validate(
      {
        ...values,
        lang,
        consent: 1,
        course: "placement-started",
        sourcePage: localePath(lang, `/placement-test/${track.id}`),
        message: [
          `Started the ${track.from}–${track.to} placement test.`,
          values.address ? `Address: ${values.address}` : "",
          `Terms accepted: ${candidate.consentAt}`,
          "",
          "No result yet — they had not finished when this was recorded.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { messageMax: 2000 }
    );
    if (started.ok) {
      await enquiries.save(started.value, {
        ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
          .toString()
          .split(",")[0]
          .trim(),
        userAgent: req.get("user-agent"),
      });
    }

    const paper = placement.createPaper(track.id);
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("placement.examTitle")} | LangNation`,
      noindex: true,
    };
    res.render("pages/placement-quiz", {
      paper,
      candidate,
      candidateToken: placement.signCandidate(candidate),
    });
  });

  // Marking.
  router.post("/placement-test/:track", async (req, res, next) => {
    const wantsJson = (req.get("accept") || "").includes("application/json");
    const track = placement.trackFor(req.params.track);
    if (!track) return next();

    const candidate = placement.readCandidate(req.body.candidate);

    // Reported by the page. Trivially forged by anyone who cares to —
    // which is fine, because these inform a conversation rather than a
    // decision.
    const pastes = Math.max(0, Math.min(999, Number(req.body.pastes) || 0));
    const away = Math.max(0, Math.min(999, Number(req.body.away) || 0));
    const integrity =
      pastes || away
        ? `Noted during the test: ${pastes} paste attempt${pastes === 1 ? "" : "s"}, ` +
          `left the tab ${away} time${away === 1 ? "" : "s"}.`
        : "Noted during the test: nothing unusual.";
    const result = placement.gradePaper(req.body.paper, req.body.answers || {});

    if (!candidate || !result || result.error) {
      if (wantsJson) return res.status(400).json({ ok: false, error: "expired" });
      return res.redirect(localePath(lang, `/placement-test/${track.id}`));
    }

    let emailed = false;
    const { ok, value } = enquiries.validate(
      {
        ...candidate,
        lang,
        consent: 1,
        course: `placement-${result.placement}`,
        sourcePage: localePath(lang, `/placement-test/${track.id}`),
        message: [
          placement.transcript(result),
          "",
          candidate.address ? `Address: ${candidate.address}` : "",
          `Terms accepted: ${candidate.consentAt}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { messageMax: 20000 }
    );

    if (ok) {
      // Completes the row written when the paper was issued, so the
      // "already taken" page can show the person their level.
      attempts.finish(candidate.email, result.placement, Math.round(result.percent || 0)).catch(() => {});

      await enquiries.save(value, {
        ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
          .toString()
          .split(",")[0]
          .trim(),
        userAgent: req.get("user-agent"),
      });
      mailer
        .sendEnquiry({ ...value, subjectPrefix: `Placement result — ${result.placement}` })
        .catch(() => {});
      emailed = true;
    }

    const recommended = content
      .courses(lang)
      .filter((c) => c.level === result.placement)
      .slice(0, 3);

    // Only review what they did not master — a slip at a level they passed
    // is noise.
    const review = result.breakdown
      .filter((b) => !b.mastered)
      .flatMap((b) => b.wrong)
      .slice(0, 12);

    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: `${t("placement.resultTitle")}: ${result.placement} | LangNation`,
      description: t("placement.lead"),
      noindex: true,
    };

    if (wantsJson) {
      return res.json({ ok: true, result, recommended: recommended.map((c) => c.slug) });
    }
    res.render("pages/placement-result", { result, recommended, review, emailed, candidate });
  });

  // ── Contact ────────────────────────────────────────────────────
  router.get("/contact", (req, res) => {
    const t = res.locals.t;
    res.locals.seo = {
      ...res.locals.seo,
      title: t("meta.contact"),
      description: t("contact.lead"),
    };
    res.render("pages/contact", {
      countries,
      turnstileKey: spam.siteKey(),
      courses: content.courses(lang),
      selectedCourse: String(req.query.course || ""),
      sent: false,
    });
  });

  router.post("/contact", async (req, res) => {
    const wantsJson = (req.get("accept") || "").includes("application/json");
    const t = res.locals.t;

    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
      .toString()
      .split(",")[0]
      .trim();

    // Scored across several signals rather than the single hidden field
    // this used to rely on: three of the first four enquiries were spam
    // that skipped the honeypot entirely.
    const check = await spam.assess(req.body, { ip });

    if (check.verdict === "block") {
      // Answered exactly like a success. A bot told it failed learns what
      // to change; a bot told it succeeded goes away.
      console.warn(`Enquiry blocked (${check.score}): ${check.reasons.join(" · ")}`);
      return wantsJson ? res.json({ ok: true }) : res.redirect(localePath(lang, "/contact?sent=1"));
    }

    // Dialling code and number arrive separately, so the number field
    // can refuse anything but digits. Joined here the same way the
    // account request and placement forms do it.
    const body = { ...req.body };
    if (body.phone_number || body.phone_cc) {
      const cc = String(body.phone_cc || "").replace(/[^0-9]/g, "");
      const num = String(body.phone_number || "").replace(/[^0-9]/g, "");
      body.phone = num ? (cc ? `+${cc} ${num}` : num) : "";
    }

    const { ok, value, errors } = enquiries.validate({ ...body, lang });
    if (!ok) {
      if (wantsJson) return res.status(400).json({ ok: false, errors });
      res.locals.seo = { ...res.locals.seo, title: t("meta.contact") };
      return res.status(400).render("pages/contact", {
        countries,
        turnstileKey: spam.siteKey(),
        courses: content.courses(lang),
        selectedCourse: value.course,
        sent: false,
      });
    }

    /* Marked spam once, refused from then on.
     *
     * The address is checked here rather than beside the other spam
     * signals because it is only known once validate() has run — before
     * that it is whatever arrived in the body.
     *
     * Answered exactly like a success, the same way a blocked score is.
     * A sender told they were rejected learns which address to stop
     * using; one told it worked keeps sending into a hole.
     */
    if (await enquiries.isBlocked(value.email)) {
      console.warn(`Enquiry refused: ${value.email} is in the spam folder`);
      return wantsJson ? res.json({ ok: true }) : res.redirect(localePath(lang, "/contact?sent=1"));
    }

    const flagged = check.verdict === "flag";

    await enquiries.save(value, {
      ip,
      userAgent: req.get("user-agent"),
      spam: flagged,
      spamScore: check.score,
      spamReasons: check.reasons.join(" · "),
    });

    // A flagged enquiry is stored and visible in the admin but sends no
    // email, so the inbox stays clean without anything being destroyed.
    if (!flagged) {
      // Fire-and-forget: the enquiry is already stored, so the visitor
      // should never wait on an SMTP handshake.
      // Fire-and-forget so the visitor never waits on SMTP, but a failure
      // is logged rather than discarded: an empty recipient silently
      // dropped every notification for weeks and nothing said so.
      mailer
        .sendEnquiry(value)
        .then((r) => {
          if (r && r.sent === false) {
            console.error(`!  Enquiry notification not sent: ${r.reason}`);
          }
        })
        .catch((e) => console.error("!  Enquiry notification failed:", e.message));
    }

    if (wantsJson) return res.json({ ok: true });
    return res.redirect(localePath(lang, "/contact?sent=1"));
  });

  // ── Imprint ────────────────────────────────────────────────────
  router.get("/imprint", (req, res) => {
    res.locals.seo = {
      ...res.locals.seo,
      title: lang === "de" ? "Impressum | LangNation" : "Imprint | LangNation",
      description:
        lang === "de"
          ? "Impressum der LangNation Education Pvt. Ltd. — Anbieterkennzeichnung nach § 5 DDG mit Anschrift, Vertretungsberechtigten und Kontaktdaten des Sprachinstituts."
          : "Provider identification for LangNation Education Pvt. Ltd. under German law (§ 5 DDG): registered address, authorised representative and contact details.",
      noindex: true,
    };
    res.render("pages/imprint", {});
  });

  // ── Any other migrated CMS page ────────────────────────────────
  router.get("/:slug", (req, res, next) => {
    const slug = req.params.slug;
    if (RESERVED.has(slug)) return next();

    const page = content.page(slug, lang);
    if (!page) return next();

    const t = res.locals.t;
    const inGermany = GERMANY_GROUPS.includes(page.group);

    res.locals.seo = {
      title: page.seo.title || `${page.title} | LangNation`,
      description: page.seo.description || toText(page.body, 155),
      keywords: page.seo.keywords,
      image: page.image ? page.image.src : "/img/og-default.png",
      type: "article",
    };

    // Both halves of the body go through together: a heading in body2
    // belongs in the same list as one in body, and numbering the ids
    // separately would give two sections the same anchor.
    const joined = (page.body || "") + (page.body2 ? page.body2 : "");
    const outline = toc.build(joined);

    res.render("pages/page", {
      // body2 is folded into body — the template prints them one after
      // the other anyway, and splitting the transformed markup back in
      // two would mean guessing where the seam was.
      page: Object.assign({}, page, { body: outline.html, body2: null }),
      toc: outline.items,
      parent: inGermany ? { href: localePath(lang, "/germany"), label: t("nav.germany") } : null,
      // The whole group, this page included, so the panel can mark where
      // you are. Filtering the current one out is right for a list of
      // "read next" cards and wrong for a contents list: a set of five
      // that shows four is a set you cannot place yourself in.
      siblings: inGermany ? content.pagesInGroup(page.group, lang) : [],
      groupLabel: inGermany ? t("germany.group." + page.group) : null,
    });
  });

  return router;
}

module.exports = { build, context };
