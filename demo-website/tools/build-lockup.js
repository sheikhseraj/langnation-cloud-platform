// ─────────────────────────────────────────────────────────────────────
//  Build the horizontal lockup used on the invoice.
//
//    node tools/build-lockup.js
//
//  Reads   brand/Logo/Logo_Lockup.png   crest + wordmark + tagline,
//                                       navy and gold on transparent
//  Writes  public/icons/lockup-{w}.webp
//
//  Why a picture here when the header deliberately uses live text.
//
//  The header's reasoning was about SIZE: at the 60px it gives the
//  mark, the delivered artwork's tagline lands at 13px and its motto at
//  6.9px, which is not small type but no type at all. None of that
//  applies to an invoice. The lockup sits about 55mm wide on A4 — the
//  tagline is then roughly 7pt, which is a footnote and perfectly
//  legible on paper — and the document is printed, so the artwork's own
//  typography is what comes out rather than whatever Fraunces does or
//  does not do inside somebody's print-to-PDF.
//
//  The invoice is also the one page in this application that leaves it.
//  A web font that fails to load on screen is a different typeface; on
//  a document going to a bank or a Jobcenter it is a different letter.
//
//  Only the light version is built. The invoice is a white page in both
//  themes for the same reason — see .inv in site.css — and the
//  white-on-navy mark would print as nothing at all.
// ─────────────────────────────────────────────────────────────────────
"use strict";

// Icons are committed to the repository and are not rebuilt on deploy.
// A production install omits devDependencies, so sharp is absent there —
// exit quietly rather than failing the build.
try {
  require.resolve("sharp");
} catch {
  console.log("sharp is not installed — skipping (icons are committed, nothing to rebuild)");
  process.exit(0);
}

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// The seal panels are large PNGs and sharp's default thread pool plus
// its image cache was enough to segfault the native library here.
sharp.cache(false);
sharp.concurrency(1);

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "brand", "Logo", "Logo_Lockup.png");
const OUT = path.join(ROOT, "public", "icons");

/* 560 covers the 55mm it occupies on A4 at 2x for screen; 1120 covers
   it at roughly 500dpi, which is past what any printer resolves. There
   is no third size because there is one place it is used. */
const WIDTHS = [560, 1120];

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`missing ${path.relative(ROOT, SRC)}`);
    process.exit(1);
  }

  /* Trimmed first. The delivered file carries a band of transparent
     pixels down two sides, and without this the lockup is centred
     inside its own padding — which reads as a crooked left margin
     against the issuer block directly below it. */
  const base = await sharp(SRC).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const ratio = base.info.width / base.info.height;
  console.log(`source ${base.info.width}x${base.info.height} (${ratio.toFixed(3)}:1)`);

  for (const w of WIDTHS) {
    const h = Math.round(w / ratio);
    const file = path.join(OUT, `lockup-${w}.webp`);
    await sharp(base.data)
      .resize({ width: w, height: h, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      /* Lossless: the artwork is flat navy and gold with hard edges,
         and lossy WebP puts a halo on exactly that. It is still small
         because flat colour compresses. */
      .webp({ lossless: true, effort: 6 })
      .toFile(file);
    const kb = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`  lockup-${w}.webp  ${w}x${h}  ${kb} kB`);
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
