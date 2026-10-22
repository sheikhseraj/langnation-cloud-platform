// ─────────────────────────────────────────────────────────────────────
//  Crawl the running site and check the things that quietly rot:
//  accessibility basics, SEO essentials, and broken internal links.
//
//    npm start          (in one terminal)
//    npm run audit      (in another)
//    npm run audit -- --url https://www.langnation.com
//
//  Exit code 1 if anything fails, so it can gate a deploy.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = (arg("--url", "http://localhost:3000") || "").replace(/\/$/, "");

const PAGES = [
  "/", "/courses", "/courses/german-regular-b1", "/exam-papers", "/study-material",
  "/faq", "/blog", "/germany", "/bachelor", "/tools", "/contact", "/about",
  "/privacy-policy", "/imprint",
  "/events", "/gallery", "/placement-test", "/placement-test/a1-b1", "/placement-test/b2-c2",
  "/de", "/de/courses", "/de/exam-papers", "/de/study-material", "/de/faq",
  "/de/blog", "/de/germany", "/de/tools", "/de/contact",
  "/de/events", "/de/gallery", "/de/placement-test",
];

const problems = [];
const note = (page, msg) => problems.push(`${page}  ${msg}`);

/** Decode the handful of entities that appear in our URLs. */
const unentity = (s) => String(s).replace(/&amp;/g, "&");

function auditHtml(page, html) {
  // ── Headings ───────────────────────────────────────────────────────
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) note(page, `${h1s} <h1> elements (want exactly 1)`);

  // ── Images ─────────────────────────────────────────────────────────
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => !/\salt\s*=/i.test(t));
  if (noAlt.length) note(page, `${noAlt.length} <img> without an alt attribute`);

  // ── Links ──────────────────────────────────────────────────────────
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const [whole, attrs, inner] = m;
    if (!/href\s*=/i.test(attrs)) continue; // a named anchor is not a link

    const text = inner.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const hasIcon = /<svg/i.test(inner);
    const hasImgAlt = /<img[^>]*\salt="[^"]+"/i.test(inner);
    const labelled = /aria-label\s*=/i.test(attrs) || /title\s*=/i.test(attrs);

    if (!text && !hasImgAlt && !labelled && !hasIcon) {
      note(page, `link with no accessible name: ${whole.slice(0, 90)}`);
    }
    // A new tab is a surprise unless the link says so.
    if (/target="_blank"/i.test(attrs) && !/rel="[^"]*noopener/i.test(attrs)) {
      note(page, `target="_blank" without rel="noopener": ${whole.slice(0, 70)}`);
    }
  }

  // ── Form controls ──────────────────────────────────────────────────
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const [whole, , attrs] = m;
    if (/type="(hidden|submit|button|reset)"/i.test(attrs)) continue;

    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      /aria-label\s*=/i.test(attrs) ||
      /aria-labelledby\s*=/i.test(attrs) ||
      (id && html.includes(`for="${id}"`));

    if (!labelled) note(page, `form control with no label: ${whole.slice(0, 70)}`);
  }

  // ── Head essentials ────────────────────────────────────────────────
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  if (title.length < 15) note(page, `title too short: "${title}"`);
  if (title.length > 70) note(page, `title ${title.length} chars — Google will truncate it`);

  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  if (desc.length < 50) note(page, `meta description too short (${desc.length} chars)`);
  if (desc.length > 165) note(page, `meta description ${desc.length} chars — will be truncated`);

  if (!/<link rel="canonical"/.test(html)) note(page, "no canonical link");
  if (!/hreflang="de"/.test(html)) note(page, "no German hreflang alternate");

  const lang = (html.match(/<html lang="([^"]+)"/) || [])[1];
  const wantLang = page.startsWith("/de") ? "de-DE" : "en";
  if (lang !== wantLang) note(page, `html lang="${lang}" (want "${wantLang}")`);

  if (!/<meta name="viewport"[^>]*width=device-width/.test(html)) {
    note(page, "no responsive viewport meta");
  }
}

async function main() {
  console.log(`Auditing ${BASE}\n`);

  const internalLinks = new Map();
  let pagesChecked = 0;

  for (const page of PAGES) {
    let res;
    try {
      res = await fetch(BASE + page);
    } catch (e) {
      note(page, `request failed: ${e.message} — is the server running?`);
      continue;
    }
    if (!res.ok) {
      note(page, `HTTP ${res.status}`);
      continue;
    }

    const html = await res.text();
    auditHtml(page, html);
    pagesChecked++;

    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const url = unentity(m[1]);
      if (!url || url.startsWith("//")) continue;
      if (!internalLinks.has(url)) internalLinks.set(url, page);
    }
  }

  // ── Every internal link resolves ─────────────────────────────────
  let broken = 0;
  for (const [url, from] of internalLinks) {
    try {
      const r = await fetch(BASE + url, { method: "HEAD", redirect: "manual" });
      if (r.status >= 400) {
        broken++;
        note(from, `broken link → ${url} (HTTP ${r.status})`);
      }
    } catch (e) {
      broken++;
      note(from, `broken link → ${url} (${e.message})`);
    }
  }

  // ── Report ───────────────────────────────────────────────────────
  console.log(`  ${pagesChecked} pages checked`);
  console.log(`  ${internalLinks.size} distinct internal links checked, ${broken} broken\n`);

  if (!problems.length) {
    console.log("  ✓ No problems found.\n");
    return;
  }

  console.log(`  ${problems.length} problem(s):\n`);
  for (const p of problems) console.log(`    ${p}`);
  console.log("");
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
