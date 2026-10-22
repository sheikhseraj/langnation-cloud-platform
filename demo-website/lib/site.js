// Everything about *this* deployment that a template might need.
// All of it is overridable from .env so the same code runs locally,
// on staging and on Hostinger without edits.
"use strict";

const fs = require("fs");
const path = require("path");
const { env } = require("./env");

/**
 * Which brand mark is active, and the box its lockup renders into.
 *
 * Written by tools/brand.js. The eagle crest is a 2.5:1 lockup and the
 * circular seal is nearer 4:1, so the img width/height attributes cannot be
 * typed into the templates — wrong ones cost a layout shift while the logo
 * loads. The fallback below matches the crest, which is what ships in
 * public/icons before anyone switches.
 */
let brand = { variant: "crest", logo: { w: 112, h: 44 }, footer: { w: 140, h: 55 } };
try {
  brand = {
    ...brand,
    ...JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "brand.json"), "utf8")),
  };
} catch {
  /* never switched — the defaults above describe what is already on disk */
}

const imprintCompany = env("IMPRINT_COMPANY", "");
// .env values are single-line, so multi-line addresses are written with a
// literal "\n" that has to be turned back into a real newline here.
const imprintAddress = env("IMPRINT_ADDRESS", "").split("\\n").join("\n");

const origin = (env("SITE_ORIGIN", "https://www.langnation.com") || "").replace(/\/$/, "");

/**
 * Is this the real site, or a test copy?
 *
 * Derived rather than declared, because a flag you have to remember to set is
 * a flag that gets forgotten — and forgetting this one means Google indexes
 * the staging subdomain and it competes with the live site for your own
 * rankings. Anything not on a production host is treated as staging and is
 * told not to index.
 */
const PRODUCTION_HOSTS = env("PRODUCTION_HOSTS", "langnation.com,www.langnation.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

let hostname = "";
try {
  hostname = new URL(origin).hostname.toLowerCase();
} catch {
  /* malformed SITE_ORIGIN — treated as staging, which is the safe way to be wrong */
}

const isStaging = !hostname || !PRODUCTION_HOSTS.includes(hostname);

/**
 * Pages switched off without deleting them.
 *
 * A hidden page disappears from the menu, the footer and the sitemap, and
 * its URL returns 404 — but the code and the content stay put, so turning
 * it back on is one word in .env rather than a job for me.
 *
 * Comma-separated slugs, e.g. HIDDEN_PAGES=team,gallery
 */
const hidden = new Set(
  env("HIDDEN_PAGES", "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\//, ""))
    .filter(Boolean)
);

/**
 * The page ground: the cool blue the site launched with, or the warm cream
 * from the brand sheet. PAGE_GROUND=cream in .env.
 *
 * Unknown values fall back to cool rather than throwing, so a typo softens
 * the site's appearance instead of taking it down.
 */
/**
 * Which commit is actually running, read once at boot.
 *
 * Added because "is it deployed?" kept being answered by squinting at a
 * screenshot. Four separate times, a change was reported as missing when
 * it was on the remote and the server had simply not pulled — and the
 * only way to tell was to spot that some label further down the page
 * still said the old thing. That is not a diagnosis, it is a guess.
 *
 * Read from .git directly rather than by running `git`: a child process
 * per boot for seven characters is a poor trade, and shared hosting is
 * not guaranteed to have git on PATH even when the checkout is there.
 *
 * Falls back to BUILD_REF from the environment, for a deploy that copies
 * files without .git. Empty when neither is available — nothing depends
 * on this, it is only ever shown to an administrator.
 */
function buildRef() {
  const fromEnv = env("BUILD_REF", "").trim();
  if (fromEnv) return fromEnv.slice(0, 12);

  try {
    const gitDir = path.join(__dirname, "..", ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();

    // Detached HEAD holds the sha itself; normally it points at a ref.
    if (!head.startsWith("ref:")) return head.slice(0, 7);

    const ref = head.slice(4).trim();
    try {
      return fs.readFileSync(path.join(gitDir, ref), "utf8").trim().slice(0, 7);
    } catch {
      // A freshly cloned checkout keeps its refs packed rather than as
      // loose files, so the read above finds nothing.
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      for (const line of packed.split("\n")) {
        const [sha, name] = line.trim().split(/\s+/);
        if (name === ref) return sha.slice(0, 7);
      }
      return "";
    }
  } catch {
    return "";
  }
}

const GROUNDS = { cool: "#f4f6fb", cream: "#F8F1E3" };
const requestedGround = env("PAGE_GROUND", "cool").trim().toLowerCase();
/**
 * A short hash of the files browsers cache, used as their version.
 *
 * Read once at boot: these files do not change while the process runs,
 * and hashing them per request would be waste. A file that cannot be
 * read simply contributes nothing, so a missing asset degrades the hash
 * rather than crashing the server.
 */
/* Which files went into the hash.
 *
 * Recorded rather than re-derived, so the suite can check the thing that
 * actually happened: every asset a page asks for with ?v= has to be one
 * of these, or its URL never changes when its content does. /js/editor.js
 * was served that way and was not hashed, and the browser went on serving
 * the copy it had.
 */
const HASHED = new Set();

function assetHash() {
  const crypto = require("crypto");
  const h = crypto.createHash("sha1");
  /* Every stylesheet and every script, found rather than listed.

     This named site.css and app.js. Both were the only two that existed
     when it was written, and the list stopped being the truth the moment
     a third arrived: /js/editor.js is served with ?v= from this hash and
     was not in it, so editing the editor changed its bytes, left its URL
     alone, and every browser that had loaded it once kept the old one.

     A list of files that must be kept in step with a directory is a list
     that will not be. Read the directory.

     Sorted, because readdir order is not guaranteed stable across
     filesystems, and an unstable hash busts every cache on every boot —
     the opposite failure, and the more expensive one. */
  for (const dir of ["public/css", "public/js"]) {
    try {
      const abs = path.join(__dirname, "..", dir);
      for (const name of fs.readdirSync(abs).sort()) {
        if (!/\.(css|js)$/i.test(name)) continue;
        h.update(name);
        h.update(fs.readFileSync(path.join(abs, name)));
        HASHED.add(dir.replace("public/", "") + "/" + name);
      }
    } catch {
      /* not present in this checkout — the other files still version it */
    }
  }

  // The icons too, or a new logo ships invisibly.
  //
  // This hashed the stylesheet and the script only, which is exactly the
  // set of files whose URLs already carried ?v=. The icons did not, and
  // they are served with a 30-day max-age in production, so a rebuilt
  // crest reached nobody who had ever loaded the old one: same URL, still
  // fresh, for a month. The first report was a phone still showing the
  // previous mark after a deploy.
  //
  // Sorted, because readdir order is not guaranteed to be stable across
  // filesystems and an unstable hash would bust every cache on every boot
  // — the opposite failure, and a more expensive one.
  try {
    const dir = path.join(__dirname, "..", "public", "icons");
    for (const name of fs.readdirSync(dir).sort()) {
      h.update(name);
      h.update(fs.readFileSync(path.join(dir, name)));
    }
  } catch {
    /* no icons in this checkout — CSS and JS still version it */
  }
  const stamp = env("ASSET_VERSION", "");
  return (stamp ? stamp + "-" : "") + h.digest("hex").slice(0, 8);
}

const ground = GROUNDS[requestedGround] ? requestedGround : "cool";

const site = {
  origin,
  hostname,
  /* Whether the assistant has a key to answer with.
   *
   * Read per access rather than captured at boot, so adding the key and
   * restarting is all it takes -- and so the views, the health check
   * and the route cannot disagree about whether it is on. */
  get chat() {
    return { on: require("./chat").configured() };
  },
  isStaging,
  brand,
  ground,
  // Drives the theme-color meta, which paints the browser's own chrome on
  // phones. Left behind, it shows a strip of the old colour above the page.
  groundColor: GROUNDS[ground],
  hidden,
  isHidden: (slug) => hidden.has(String(slug || "").toLowerCase().replace(/^\//, "")),
  dictionaryUrl: env("DICTIONARY_URL", "https://www.langnation.de/"),

  /* Whether an invoice may actually be sent.
   *
   * Derived, never configured: a flag somebody can switch on is a flag
   * that gets switched on to make a warning go away, and the warning
   * is the only thing standing between a half-configured install and
   * an invoice that is not legally valid. */
  get invoiceReady() {
    const i = this.invoice.issuer;
    return Boolean(i.legal && i.street && i.postcode && i.city && i.taxNumber);
  },

  /* Bank details are a separate question: an invoice can be valid
     without them if nobody is being asked to transfer anything. */
  get bankReady() {
    const b = this.invoice.bank;
    return Boolean(b.name && b.iban);
  },

  // Cache-buster for CSS and JS, derived from the content of those files.
  //
  // It used to be ASSET_VERSION alone, set by hand in the hosting panel.
  // That fails the moment someone edits the stylesheet without also
  // bumping the variable: every returning visitor keeps the stylesheet
  // their browser cached under the unchanged URL, so new markup arrives
  // with old rules and the page renders unstyled. That is exactly what
  // happened when the back-office shell shipped.
  //
  // A hash of the files cannot drift from the files. ASSET_VERSION is
  // still honoured as a prefix, so a deploy stamp stays readable in the
  // URL, but the hash is what actually guarantees the change.
  assetVersion: assetHash(),
  // Populated by the line above, which has to have run first.
  assetFiles: HASHED,
  // The photographs' own version, so a URL written into a template can
  // be stamped the same way the ones read from JSON are. Required here
  // rather than at the top of the file: lib/content is the heavier
  // module and nothing else in site.js needs it.
  imageVersion: require("./content").imageVersion,
  // Shown in the back office so "is it deployed?" is a glance, not a guess.
  build: buildRef(),
  startedAt: new Date().toISOString(),

  /* ── What goes on an invoice ───────────────────────────────────────
   *
   * Every one of these is empty until somebody supplies it, and that
   * is deliberate. A German invoice is required by §14 UStG to carry
   * the supplier's name, address and tax number; an IBAN typed in by
   * guesswork sends money to a stranger; and whether language teaching
   * here is exempt under §4 Nr. 21 or small-business under §19 is the
   * school's tax adviser's call, not something to assume in a config
   * file.
   *
   * So nothing here has a plausible-looking default. `ready` says
   * whether the document can legally be sent, and the invoice page
   * refuses to pretend when it cannot.
   */
  invoice: {
    /* LN-2026-000001. The series and the width are settings because
       an accountant may already have a convention; the counter behind
       them is gapless whatever they are. */
    prefix: env("INVOICE_PREFIX", "LN"),
    digits: Math.min(10, Math.max(3, Number(env("INVOICE_DIGITS", "6")) || 6)),
    /* How long after issue an invoice is due, when nothing else says. */
    termDays: Math.max(0, Number(env("INVOICE_TERM_DAYS", "14")) || 14),

    issuer: {
      /* The trading name is safe to default: it is on the building. */
      name: env("INVOICE_ISSUER_NAME", "LangNation Sprachschule"),
      legal: env("INVOICE_LEGAL_NAME", ""),
      street: env("INVOICE_STREET", ""),
      postcode: env("INVOICE_POSTCODE", ""),
      city: env("INVOICE_CITY", ""),
      country: env("INVOICE_COUNTRY", "Germany"),
      taxNumber: env("INVOICE_TAX_NUMBER", ""),
      vatId: env("INVOICE_VAT_ID", ""),
    },

    bank: {
      name: env("INVOICE_BANK_NAME", ""),
      iban: env("INVOICE_IBAN", ""),
      bic: env("INVOICE_BIC", ""),
    },

    /* Printed verbatim under the totals. Not a rate and not a guess:
       the wording is whatever the school's adviser says it is. */
    taxNote: env("INVOICE_TAX_NOTE", ""),
    taxPercent: Number(env("INVOICE_TAX_PERCENT", "0")) || 0,
  },

  contact: {
    email: env("CONTACT_EMAIL", "info@langnation.com"),
    phoneDe: env("CONTACT_PHONE_DE", "+49 176 55241842"),
    whatsapp: env("CONTACT_WHATSAPP", "+91 8375939748"),
    address: env("CONTACT_ADDRESS", "LangNation Education Pvt. Ltd."),
  },

  social: {
    facebook: env("SOCIAL_FACEBOOK", "https://www.facebook.com/langnation"),
    instagram: env("SOCIAL_INSTAGRAM", "https://www.instagram.com/langnation"),
    linkedin: env("SOCIAL_LINKEDIN", "https://www.linkedin.com/company/langnation"),
    youtube: env("SOCIAL_YOUTUBE", "https://www.youtube.com/@langnation"),
  },

  // German law requires a complete Impressum. The page says so loudly
  // until these are filled in, rather than quietly publishing a stub.
  imprint: {
    company: imprintCompany,
    address: imprintAddress || "— address not yet configured —",
    representative: env("IMPRINT_REPRESENTATIVE", "— not yet configured —"),
    responsible: env("IMPRINT_RESPONSIBLE", env("IMPRINT_REPRESENTATIVE", "— not yet configured —")),
    register: env("IMPRINT_REGISTER", ""),
    // Set IMPRINT_REGISTRATION=pending while the company is being
    // formed. §5 DDG still requires a provider statement in the
    // meantime — it is simply the operator as a natural person rather
    // than the company, and saying the registration is under way is
    // more honest than naming a company that does not yet exist.
    registrationPending: env("IMPRINT_REGISTRATION", "").toLowerCase() === "pending",
    vatId: env("IMPRINT_VAT_ID", ""),
    // What §5 DDG will not do without: someone identifiable, and an
    // address that reaches them. A missing register entry is fine while
    // registration is pending; a missing name and address never is.
    incomplete: !imprintAddress || !env("IMPRINT_REPRESENTATIVE", ""),
  },
};

module.exports = site;
