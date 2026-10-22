// ─────────────────────────────────────────────────────────────────────
//  Cleans the HTML that the old CKEditor / Microsoft-Word pipeline left
//  behind, and pulls base64-embedded images out into real image files.
//
//  Why this matters: the old `tbl_cms` rows were up to 4.4 MB each,
//  almost entirely `<img src="data:image/jpeg;base64,...">` pasted
//  straight from Word. Those can't be cached, can't be lazy-loaded and
//  can't be resized. We extract them once, here, and reference real files.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  /* Optional: without it we still extract, just without re-encoding. */
}

/** Attributes that only ever carried Word/CKEditor noise. */
const DROP_ATTRS = [
  "style", "class", "lang", "dir", "align", "bgcolor", "border",
  "cellpadding", "cellspacing", "valign", "face", "color", "size",
  "data-.*?", "aria-.*?", "role", "id", "name", "xmlns.*?", "v:.*?", "o:.*?",
];

function stripAttributes(html) {
  let out = html;
  for (const attr of DROP_ATTRS) {
    // attr="..." | attr='...' | attr=bare
    out = out.replace(
      new RegExp("\\s" + attr + '\\s*=\\s*"[^"]*"', "gi"),
      ""
    );
    out = out.replace(
      new RegExp("\\s" + attr + "\\s*=\\s*'[^']*'", "gi"),
      ""
    );
    out = out.replace(
      new RegExp("\\s" + attr + "\\s*=\\s*[^\\s>]+", "gi"),
      ""
    );
  }
  return out;
}

function cleanHtml(html) {
  if (!html) return "";
  let out = String(html);

  // Word's conditional comments and namespace tags.
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\/?o:p[^>]*>/gi, "");
  out = out.replace(/<\/?[ovwxm]:[a-z]+[^>]*>/gi, "");

  // Anything script-ish has no business in migrated body copy.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi, (m, attrs) => {
    // Keep YouTube/Vimeo embeds, drop everything else.
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (src && /(youtube|youtu\.be|vimeo)/i.test(src[1])) {
      return `<div class="embed"><iframe src="${src[1]}" loading="lazy" allowfullscreen title="Video"></iframe></div>`;
    }
    return "";
  });

  out = stripAttributes(out);

  // <font> only ever wrapped colour/size that we now control in CSS.
  out = out.replace(/<\/?font[^>]*>/gi, "");

  // Spans carried nothing once their style attribute is gone.
  out = out.replace(/<span\s*>/gi, "").replace(/<\/span>/gi, "");

  // Word emits runs of non-breaking spaces for indentation.
  out = out.replace(/(&nbsp;\s*)+/gi, " ");

  // Drop paragraphs / headings that are now empty.
  for (let i = 0; i < 3; i++) {
    out = out.replace(/<(p|h[1-6]|div|li|td|strong|b|em|i)\s*>\s*<\/\1>/gi, "");
  }
  out = out.replace(/<br\s*\/?>\s*(<br\s*\/?>\s*)+/gi, "<br>");

  // Tables need a scroll wrapper on phones.
  out = out.replace(/<table\s*>/gi, '<div class="table-scroll"><table>');
  out = out.replace(/<\/table>/gi, "</table></div>");

  // Images should always be lazy and self-sizing, and must carry an alt —
  // without one, screen readers fall back to reading the file name aloud.
  // The old editor never set alt text and we have no description to invent,
  // so these are marked decorative. Add real alt text in content/*.json if
  // any of them actually carry meaning.
  out = out.replace(/<img([^>]*?)\/?>/gi, (m, attrs) => {
    let a = attrs;
    if (!/\salt\s*=/i.test(a)) a += ' alt=""';
    if (!/loading\s*=/i.test(a)) a += ' loading="lazy" decoding="async"';
    return `<img${a}>`;
  });

  // A link that opens a new tab must carry rel="noopener", or the page it
  // opens can reach back through window.opener. Browsers now imply this for
  // target="_blank", but older ones do not and the attribute costs nothing.
  out = out.replace(/<a\b([^>]*target="_blank"[^>]*)>/gi, (m, attrs) => {
    if (/\brel\s*=/i.test(attrs)) {
      // Keep whatever rel is there, just make sure noopener is among it.
      const fixed = attrs.replace(/\brel="([^"]*)"/i, (r, value) =>
        /noopener/i.test(value) ? r : `rel="${value.trim()} noopener"`
      );
      return `<a${fixed}>`;
    }
    return `<a${attrs} rel="noopener">`;
  });

  // A link with no visible text is unusable by anyone — invisible to a
  // sighted reader and nameless to a screen reader. The old content has a
  // few, all pointing at real files, so name them from the file instead of
  // dropping the link.
  out = out.replace(/<a\b([^>]*href="([^"]+)"[^>]*)>(\s|&nbsp;)*<\/a>/gi, (m, attrs, href) => {
    let name = href.split("/").pop().split("?")[0];
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep the encoded form */
    }
    name = name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_-]+/g, " ").trim();
    return name ? `<a${attrs}>${name}</a>` : "";
  });

  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Find every base64 `data:` image in `html`, write it to `outDir` as a real
 * file, and rewrite the `src` to point at `publicPrefix/<name>`.
 * Returns { html, extracted, bytesSaved }.
 */
async function extractDataImages(html, { outDir, publicPrefix, maxWidth = 1200 }) {
  if (!html) return { html: "", extracted: 0, bytesSaved: 0 };

  const pattern = /data:image\/(png|jpe?g|gif|webp|bmp);base64,([A-Za-z0-9+/=\s]+)/gi;
  const matches = [...String(html).matchAll(pattern)];
  if (!matches.length) return { html, extracted: 0, bytesSaved: 0 };

  fs.mkdirSync(outDir, { recursive: true });

  let out = String(html);
  let extracted = 0;
  let bytesSaved = 0;

  for (const m of matches) {
    const [full, , b64raw] = m;
    const b64 = b64raw.replace(/\s+/g, "");
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (buf.length < 1024) continue; // tiny spacer gifs — just drop them later

    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
    const name = `${hash}.webp`;
    const dest = path.join(outDir, name);

    if (!fs.existsSync(dest)) {
      if (sharp) {
        try {
          await sharp(buf)
            .rotate()
            .resize({ width: maxWidth, withoutEnlargement: true })
            .webp({ quality: 78 })
            .toFile(dest);
        } catch {
          continue; // not a real image — leave the src alone
        }
      } else {
        fs.writeFileSync(dest, buf);
      }
    }

    const finalSize = fs.existsSync(dest) ? fs.statSync(dest).size : buf.length;
    bytesSaved += full.length - (publicPrefix + name).length - finalSize;
    extracted++;
    out = out.split(full).join(`${publicPrefix}${name}`);
  }

  return { html: out, extracted, bytesSaved };
}

/**
 * Repoint every link that still addresses the old site.
 *
 * The migrated copy is full of absolute links back to langnation.com —
 * download files, course pages, CMS pages. All of them break the moment the
 * old site is switched off, so they are rewritten here:
 *
 *   /assets/question-papper|Resources|Mix/…  →  /downloads/…
 *   /assets/Event/…                          →  /downloads/Resources/Event/…
 *   /site/course_details/course_detail/<id>  →  /courses/<slug>
 *   /site/cms/<page>?id=<id>                 →  /<slug>
 *   /contact-us                              →  /contact
 *   anything else on the same host           →  the same path, relative
 *
 * `maps` carries { courseById, pageById } built from the dump.
 * Returns { html, rewritten, unresolved }.
 */
function rewriteLegacyLinks(html, maps = {}) {
  if (!html) return { html: "", rewritten: 0, unresolved: [] };

  const courseById = maps.courseById || {};
  const pageById = maps.pageById || {};

  let rewritten = 0;
  const unresolved = [];

  // Matches the host with or without scheme, www, and a stray "public_html".
  const HOST = "(?:https?:)?(?:\\/\\/)?(?:www\\.)?langnation\\.com\\/(?:public_html\\/)?";
  const at = (tail, flags = "gi") => new RegExp(HOST + tail, flags);
  const hit = (replacement) => { rewritten++; return replacement; };

  let out = String(html);

  // 1. Downloadable files. Event lives inside Resources on disk.
  out = out.replace(at("assets\\/Event\\/"), () => hit("/downloads/Resources/Event/"));
  out = out.replace(at("assets\\/(question-papper|Resources|Mix)\\/"), (_, folder) =>
    hit(`/downloads/${folder}/`)
  );

  // 2. Old course-detail URLs, by numeric id.
  out = out.replace(at("site\\/course_details\\/course_detail\\/(\\d+)"), (whole, id) => {
    const slug = courseById[id];
    if (slug) return hit(`/courses/${slug}`);
    unresolved.push(whole);
    return "/courses";
  });

  // 3. Old CMS URLs, by ?id=. Keep any #fragment.
  out = out.replace(at("site\\/cms\\/[a-z_]+\\?id=(\\d+)(#[\\w-]+)?"), (whole, id, hash) => {
    const slug = pageById[id];
    if (slug) return hit(`/${slug}${hash || ""}`);
    unresolved.push(whole);
    return "/";
  });

  // 4. Pages that were renamed in the rebuild.
  out = out.replace(at("contact[-_]us"), () => hit("/contact"));

  // 5. Anything else still pointing at the old host becomes a relative path,
  //    so it resolves against whichever domain is serving the page.
  out = out.replace(at("([\\w./?=&#-]*)"), (whole, rest) => {
    if (String(rest || "").startsWith("downloads/")) return whole; // already done
    return hit("/" + (rest || ""));
  });

  return { html: out, rewritten, unresolved };
}

/** Plain-text summary for meta descriptions and card excerpts. */
function toText(html, limit = 0) {
  if (!html) return "";
  let t = String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (limit && t.length > limit) {
    t = t.slice(0, limit).replace(/\s+\S*$/, "") + "…";
  }
  return t;
}

module.exports = { cleanHtml, extractDataImages, rewriteLegacyLinks, toText };
