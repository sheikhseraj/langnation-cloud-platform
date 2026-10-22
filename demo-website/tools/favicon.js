"use strict";

/**
 * The favicon: the LangNation seal itself.
 *
 * The seal is a dense piece of artwork — a ring of lettering, a cityscape,
 * a globe, a book and the LN monogram. None of that detail survives a
 * 16px browser tab, and at 32px only the circular form and the crest
 * read. That is an accepted trade-off: the brand asks for the seal in the
 * tab, so the tab gets the seal.
 *
 * Three things are done to get the most out of it:
 *
 *  - Transparency is kept. The seal's disc is already an opaque cream, so
 *    it reads against both light and dark browser chrome. Flattening it
 *    onto a square of cream was tried and looked worse — the corners show
 *    as a pale block on a dark tab.
 *
 *  - Below 48px the art gets a contrast lift and a light sharpen.
 *    Downscaling this much line work washes it into mid-grey; the lift
 *    pulls the navy back so the rim and crest stay distinguishable at
 *    32px. Larger sizes are left alone — sharpening them only adds
 *    crunch.
 *
 *  - Sizes run to 128px, well past the 48px a tab nominally needs,
 *    because a HiDPI screen renders a 32px slot at 64 real pixels and a
 *    48px slot at 96. Offering only up to 48 forced the browser to
 *    upscale, which is what made the icon look soft on a high-density
 *    display.
 *
 * A favicon.ico is written as well as the PNGs. Browsers request
 * /favicon.ico from the site root on their own, whatever the <link> tags
 * say, and Google fetches it for the icon beside a search result — so a
 * site without one has a 404 in a place several tools look first.
 *
 * No vector favicon is written. The source is a raster: the two files
 * supplied as SVG ("favicon_icon.svg", "LangNation-favicon.svg") each
 * turned out to be a single PNG base64-encoded twice inside an <svg>,
 * with no paths at all. Wrapping a bitmap only inflates it. A genuinely
 * vector seal would be worth adding here for the large sizes, though it
 * would not help at 16px — that limit is the amount of detail, not the
 * file format.
 */

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

/** Tab, bookmark and HiDPI sizes. */
const SIZES = [16, 32, 48, 64, 96, 128];

/** The sizes packed into favicon.ico. Anything larger belongs in a PNG. */
const ICO_SIZES = [16, 32, 48];

const FAVICONS = SIZES.map((s) => `favicon-${s}.png`);

/** One square PNG of the seal at `size`, as a buffer. */
function render(src, size) {
  let img = sharp(src).resize(size, size, {
    kernel: "lanczos3",
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  // See the note above: only the small sizes need the contrast back.
  if (size < 48) img = img.linear(1.25, -22).sharpen({ sigma: 0.5, m1: 1, m2: 2 });
  return img.png().toBuffer();
}

/**
 * Pack PNGs into an .ico.
 *
 * The format is a 6-byte header, then one 16-byte directory entry per
 * image, then the image data. Entries may hold PNG data directly rather
 * than the old BMP form, which every browser has understood for years and
 * which keeps the alpha channel intact. A side of 256 is written as 0.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colours
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/**
 * Write favicon-*.png into `outDir`, and favicon.ico into `rootDir` if
 * given — the .ico has to sit at the site root to be found.
 */
async function writeFavicons(outDir, src, rootDir) {
  const rendered = new Map();
  for (const size of SIZES) {
    const data = await render(src, size);
    rendered.set(size, data);
    fs.writeFileSync(path.join(outDir, `favicon-${size}.png`), data);
  }
  if (rootDir) {
    const ico = buildIco(ICO_SIZES.map((size) => ({ size, data: rendered.get(size) })));
    fs.writeFileSync(path.join(rootDir, "favicon.ico"), ico);
  }
}

module.exports = { writeFavicons, buildIco, FAVICONS, SIZES, ICO_SIZES };
