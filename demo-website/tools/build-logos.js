// ─────────────────────────────────────────────────────────────────────
//  Build the header/footer logos from the brand originals.
//
//    node tools/build-logos.js
//
//  Reads   brand/LNS_Logo.png        navy lockup, for light backgrounds
//          brand/LNS_Logo_Dark.png   cream lockup, for dark backgrounds
//                                    (falls back to LNS_Logo_White.png)
//  Writes  public/icons/logo-{h}.webp
//          public/icons/logo-white-{h}.webp
//
//  Only the crest is kept. The delivered artwork stacks three things beside
//  it — the name, "Language Institute" and the motto — and at the 60px the
//  header gives it, the motto lands at 6.9px and the tagline at 13px.
//  Measured, not guessed: scan the artwork's alpha and the bands fall out.
//  6.9px is not small type, it is no type at all.
//
//  All three are now live text set in Nunito, which leaves the crest as the
//  only thing that has to be a picture. That buys a lot: the name is
//  selectable and searchable, it scales with the reader's font size, it is
//  German on the German site, and a correction is a string rather than a
//  rebuild of five image files. It also fixes a width problem that had no
//  other answer — see the note on .brand in site.css.
//
//  Some originals arrive with the editor's transparency checkerboard
//  flattened into them as real dark pixels, so they cannot simply be
//  resized — they would show as a grey slab on the navy footer. Where that
//  artwork is pure white on dark, its own brightness is exactly the alpha
//  channel we want. Artwork that already carries a real alpha channel is
//  used as delivered: keying it by brightness would erase the navy field of
//  the shield along with the background.
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

// These originals are large, and sharp's default thread pool plus its image
// cache was enough to segfault the native library on this machine. One
// operation at a time is plenty for a build step that runs in a second.
sharp.cache(false);
sharp.concurrency(1);

const ROOT = path.join(__dirname, "..");
const BRAND = path.join(ROOT, "brand");
const OUT = path.join(ROOT, "public", "icons");

// The header shows the logo about 40 CSS pixels tall; 2× and 3× cover
// retina and the footer, where it sits a little larger.
const HEIGHTS = [48, 96, 144];

// The flattened checkerboard sits around brightness 20–50. Everything at or
// below this becomes fully transparent; brighter values are rescaled across
// the full range so antialiased edges keep their softness instead of being
// left as a faint grey haze over the whole rectangle.
const FLOOR = 64;

/**
 * Does this file already carry a usable alpha channel?
 *
 * The keying below assumes "bright = ink, dark = background", which is true
 * of a white-on-black original and catastrophically false of artwork whose
 * crest is a navy shield: the shield is dark, so keying would cut it out and
 * leave the gold border floating around a hole. Artwork that already has
 * transparency does not need keying at all, so ask first.
 */
async function hasRealAlpha(file) {
  const m = await sharp(file).metadata();
  if (!m.hasAlpha) return false;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * info.channels + 3] < 8) clear++;
  }
  // A real cut-out is mostly empty space. An opaque image with an alpha
  // channel bolted on is not, and that is the one that needs keying.
  return clear / (info.width * info.height) > 0.15;
}

/** Turn a white-on-dark image into white-on-transparent. */
async function keyOutDarkBackground(file) {
  const { width, height } = await sharp(file).metadata();

  // Brightness becomes the alpha channel…
  const alpha = await sharp(file).removeAlpha().greyscale().toColourspace("b-w").raw().toBuffer();

  const pixels = width * height;
  const out = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const a = alpha[i] <= FLOOR ? 0 : Math.round(((alpha[i] - FLOOR) * 255) / (255 - FLOOR));
    // …over a solid white fill, so the artwork stays white at every opacity.
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = a;
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Height of the crest within a lockup.
 *
 * The two originals lay out differently — in the navy one the crest is the
 * tallest element, in the white one the three-line text block is. Sizing both
 * by overall height would render the white crest a quarter smaller. The crest
 * is what the eye recognises, so it is what we measure and match.
 */
async function crestHeight(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Count ink per column. A threshold rather than "any pixel at all", because
  // keying the white original leaves a few stray specks along the edge — and a
  // 2px speck read as the crest is how this produced a 370350×153450 canvas
  // and segfaulted the first time.
  const minInkPerColumn = Math.max(2, Math.round(height * 0.02));
  const inked = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    let ink = 0;
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3] > 25 && ++ink >= minInkPerColumn) {
        inked[x] = true;
        break;
      }
    }
  }

  // Walk the columns and collect blocks of ink separated by blank gutters.
  const minGap = Math.max(4, Math.round(width * 0.01));
  const minBlock = Math.round(width * 0.05); // a crest is never a sliver
  const blocks = [];
  let x = 0;
  while (x < width) {
    while (x < width && !inked[x]) x++;
    if (x >= width) break;
    const start = x;
    let gap = 0;
    let end = x;
    while (x < width && gap < minGap) {
      if (inked[x]) {
        end = x;
        gap = 0;
      } else gap++;
      x++;
    }
    if (end - start + 1 >= minBlock) blocks.push([start, end]);
  }

  if (!blocks.length) return height;

  // The crest is the first real block; if the lockup is one solid run, the
  // whole height is the honest answer.
  const [start, end] = blocks[0];
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let cx = start; cx <= end; cx++) {
      if (data[(y * width + cx) * 4 + 3] > 25) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }

  const measured = bottom < 0 ? height : bottom - top + 1;

  // A crest smaller than a third of the image is not a crest — it means the
  // block detection latched onto something else. Fall back rather than scale
  // the artwork by an absurd factor.
  return measured < height * 0.33 ? height : measured;
}

/**
 * Keep the crest; drop the text block beside it.
 *
 * Measured off the artwork rather than typed in as pixel offsets, because
 * the two themed files are not aligned to each other — the light crest sits
 * at y47 and the dark one at y60 — and a number typed for one silently
 * mangles the other. Both are found the same way:
 *
 *   1. Scan columns for the gutter between the crest and the text. The
 *      crest is a solid block; the gap after it is the first run of empty
 *      columns wide enough not to be the space inside a letter.
 *   2. Everything left of that gutter is the crest. Take its bounding box.
 *
 * Returns the original buffer untouched if the shape is not what we expect,
 * so an unfamiliar file degrades to the whole lockup rather than being
 * cropped to nothing.
 */
async function cropToCrest(buffer, name) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const alpha = (x, y) => data[(y * W + x) * C + 3];

  // Ink per column, thresholded so a few stray specks along a keyed edge do
  // not read as a column of artwork.
  const minInk = Math.max(2, Math.round(H * 0.02));
  const inked = new Array(W).fill(false);
  for (let x = 0; x < W; x++) {
    let ink = 0;
    for (let y = 0; y < H; y++) {
      if (alpha(x, y) > 25 && ++ink >= minInk) {
        inked[x] = true;
        break;
      }
    }
  }

  // The gutter: the first empty run wide enough to be a gap between
  // elements rather than the counter of an "a".
  const minGap = Math.round(W * 0.01);
  const start = inked.indexOf(true);
  if (start < 0) return buffer;
  let gutter = -1;
  for (let x = start; x < W; x++) {
    if (inked[x]) continue;
    let end = x;
    while (end < W && !inked[end]) end++;
    if (end - x >= minGap && end < W) {
      gutter = x;
      break;
    }
    x = end;
  }
  if (gutter < 0) {
    console.log(`  ! ${name}: no gutter after the crest — using the lockup as delivered.`);
    return buffer;
  }

  const box = (xa, xb, ya, yb) => {
    let l = W;
    let r = -1;
    let t = H;
    let b = -1;
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        if (alpha(x, y) > 40) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
    }
    return r < 0 ? null : { l, t, w: r - l + 1, h: b - t + 1 };
  };

  const crest = box(0, gutter, 0, H);
  if (!crest) {
    console.log(`  ! ${name}: no crest left of the gutter — using it as delivered.`);
    return buffer;
  }

  console.log(`  ${name.padEnd(12)} crest ${crest.w}x${crest.h}, text block dropped`);

  return sharp(buffer)
    .extract({ left: crest.l, top: crest.t, width: crest.w, height: crest.h })
    .png()
    .toBuffer();
}

/** Trim transparent margin and report the artwork's geometry. */
async function prepare(buffer, name) {
  const trimmed = await sharp(buffer).trim({ threshold: 2 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const crest = await crestHeight(trimmed);
  return { name, buffer: trimmed, width: meta.width, height: meta.height, crest };
}

/**
 * Write both logos onto one shared canvas size, scaled so their crests match.
 * A single `height` in CSS then renders both identically, and the header does
 * not change width when the theme is switched.
 */
async function emitPair(logos) {
  // Scale everything so the largest crest keeps its detail.
  const crestTarget = Math.max(...logos.map((l) => l.crest));

  const scaled = [];
  for (const l of logos) {
    let factor = crestTarget / l.crest;

    // Belt and braces: a correct pair never needs more than a modest nudge.
    // Anything wilder means the crest was mis-measured, and acting on it would
    // ask sharp for a canvas of billions of pixels.
    if (!Number.isFinite(factor) || factor < 0.5 || factor > 2) {
      console.log(
        `  ! ${l.name}: implausible scale ×${factor.toFixed(2)} from crest ${l.crest}px ` +
          `in a ${l.width}×${l.height} image — using the image as-is.`
      );
      factor = 1;
    }

    scaled.push({
      ...l,
      outWidth: Math.round(l.width * factor),
      outHeight: Math.round(l.height * factor),
    });
  }

  const canvasW = Math.max(...scaled.map((s) => s.outWidth));
  const canvasH = Math.max(...scaled.map((s) => s.outHeight));

  for (const s of scaled) {
    // Left-aligned and vertically centred inside the shared canvas.
    const art = await sharp(s.buffer)
      .resize({ width: s.outWidth, height: s.outHeight, fit: "fill" })
      .toBuffer();

    const padded = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: art, left: 0, top: Math.round((canvasH - s.outHeight) / 2) }])
      .png()
      .toBuffer();

    const written = [];
    for (const h of HEIGHTS) {
      const dest = path.join(OUT, `${s.name}-${h}.webp`);
      await sharp(padded)
        .resize({ height: h, withoutEnlargement: true })
        .webp({ quality: 92, alphaQuality: 100 })
        .toFile(dest);
      written.push({ h, size: fs.statSync(dest).size });
    }

    console.log(
      `  ${s.name.padEnd(12)} crest ${s.crest}px → scaled ×${(crestTarget / s.crest).toFixed(2)} → ` +
        written.map((w) => `${w.h}px ${(w.size / 1024).toFixed(1)}KB`).join(", ")
    );
  }

  return { canvasW, canvasH, ratio: canvasW / canvasH };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const navySrc = path.join(BRAND, "LNS_Logo.png");

  // The dark lockup, newest first. LNS_Logo_Dark.png is the cream-and-gold
  // artwork; LNS_Logo_White.png is the older pure-white one, kept as a
  // fallback so a checkout without the new file still builds.
  const darkSrc = [path.join(BRAND, "LNS_Logo_Dark.png"), path.join(BRAND, "LNS_Logo_White.png")].find(
    (f) => fs.existsSync(f)
  );

  if (!fs.existsSync(navySrc) || !darkSrc) {
    console.error(`Missing brand source in ${BRAND}`);
    process.exit(1);
  }

  console.log("Logos:");

  // Artwork delivered with its own transparency is used as delivered; only
  // the flattened kind gets keyed. Asked rather than assumed, because the
  // answer changes when new artwork arrives — and getting it wrong cuts the
  // navy shield out of its own gold border.
  const darkBuf = (await hasRealAlpha(darkSrc))
    ? await sharp(darkSrc).ensureAlpha().png().toBuffer()
    : await keyOutDarkBackground(darkSrc);
  console.log(`  source       ${path.basename(darkSrc)} for dark grounds`);

  const navy = await prepare(
    await cropToCrest(await sharp(navySrc).ensureAlpha().png().toBuffer(), "logo"),
    "logo"
  );
  const white = await prepare(await cropToCrest(darkBuf, "logo-white"), "logo-white");

  const { canvasW, canvasH, ratio } = await emitPair([navy, white]);

  console.log(`
  Shared canvas ${canvasW}×${canvasH} (${ratio.toFixed(2)}:1) — both files are the
  same shape, so the header keeps its width when the theme changes.

  In CSS:  .brand img { height: 40px; width: ${Math.round(40 * ratio)}px; }
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
