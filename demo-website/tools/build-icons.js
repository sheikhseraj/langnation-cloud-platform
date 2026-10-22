// ─────────────────────────────────────────────────────────────────────
//  Generate the PWA icon set from one source crest.
//
//    node tools/build-icons.js [--source <path-to-png>]
//
//  Produces everything PWABuilder and the app stores ask for, the site
//  header's crest, and the Open Graph card. Re-run whenever the logo
//  changes.
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
const { writeFavicons } = require("./favicon.js");
sharp.cache(false);
sharp.concurrency(1);

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const SOURCE = arg(
  "--source",
  path.join(__dirname, "..", "brand", "LNS_Crest.png")
);
const OUT = path.join(__dirname, "..", "public", "icons");
const IMG = path.join(__dirname, "..", "public", "img");

// Matches --paper / --paper2 in site.css, so the icon sits on the same ground
// as the site itself rather than on a hard white square.
const LIGHT = { r: 244, g: 246, b: 251, alpha: 1 };
const NAVY = { r: 27, g: 52, b: 100, alpha: 1 };

/**
 * Where the circle in a round portrait actually is.
 *
 * These portraits arrive as a disc drawn on a white square, and the
 * disc is not reliably centred in it. Rather than measuring each new
 * one by hand, the edge is read off the image: walking rows and
 * columns to find where the white stops, then fitting one circle
 * through all of those points at once.
 *
 * A row the circle runs off the side of is thrown away rather than
 * fitted — its endpoint is the edge of the canvas, not the edge of the
 * circle, and a handful of those would drag the answer sideways.
 *
 * The fit is the ordinary algebraic one: x² + y² + Dx + Ey + F = 0 is
 * linear in D, E and F, so three normal equations and a small
 * elimination give the centre and the radius with no iteration.
 */
async function findDisc(file) {
  const WHITE = 235; // anything brighter than this is the paper around it
  const STEP = 7; // every seventh line is plenty of points and quick
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const ink = (x, y) => {
    const i = (y * width + x) * channels;
    return !(data[i] > WHITE && data[i + 1] > WHITE && data[i + 2] > WHITE);
  };

  const pts = [];
  const scan = (n, len, at) => {
    let a = -1;
    let b = -1;
    for (let i = 0; i < len; i += 1) if (at(n, i)) { a = i; break; }
    for (let i = len - 1; i >= 0; i -= 1) if (at(n, i)) { b = i; break; }
    // Clipped at either end, or too short to be a chord of the circle.
    return a > 0 && b < len - 1 && b - a > 40 ? [a, b] : null;
  };
  for (let y = STEP; y < height - STEP; y += STEP) {
    const e = scan(y, width, (row, x) => ink(x, row));
    if (e) pts.push([e[0], y], [e[1], y]);
  }
  for (let x = STEP; x < width - STEP; x += STEP) {
    const e = scan(x, height, (col, y) => ink(col, y));
    if (e) pts.push([x, e[0]], [x, e[1]]);
  }
  if (pts.length < 12) {
    // Nothing circle-shaped in it. The inscribed circle is the only
    // honest guess left, and saying so beats a silent wrong crop.
    console.log("   (no disc edge found — falling back to the inscribed circle)");
    return { cx: width / 2, cy: height / 2, r: Math.min(width, height) / 2, width, height };
  }

  let n = 0;
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    Sxx += x * x; Sxy += x * y; Syy += y * y;
    Sx += x; Sy += y;
    Sxz += x * z; Syz += y * z; Sz += z;
    n += 1;
  }
  const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]];
  const B = [-Sxz, -Syz, -Sz];
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [B[i], B[p]] = [B[p], B[i]];
    for (let r = i + 1; r < 3; r += 1) {
      const m = A[r][i] / A[i][i];
      for (let c = i; c < 3; c += 1) A[r][c] -= m * A[i][c];
      B[r] -= m * B[i];
    }
  }
  const s = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) {
    let t = B[i];
    for (let c = i + 1; c < 3; c += 1) t -= A[i][c] * s[c];
    s[i] = t / A[i][i];
  }
  const cx = -s[0] / 2;
  const cy = -s[1] / 2;
  return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - s[2]), width, height };
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    console.error("Pass one with --source <file.png>");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(IMG, { recursive: true });

  const crest = await sharp(SOURCE).trim().toBuffer();

  /** Crest centred on a square canvas, with `padRatio` of breathing room. */
  async function square(size, padRatio, background, file) {
    const inner = Math.round(size * (1 - padRatio * 2));
    const logo = await sharp(crest)
      .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: logo, gravity: "center" }])
      .png()
      .toFile(path.join(OUT, file));

    console.log(`   ${file.padEnd(28)} ${size}×${size}`);
  }

  console.log("Icons:");
  // The header crest keeps its transparency.
  await sharp(crest).resize({ width: 96, height: 96, fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT, "crest.png"));
  console.log(`   crest.png                    96×96`);

  await square(180, 0.1, LIGHT, "apple-touch-icon.png");
  await square(192, 0.1, LIGHT, "icon-192.png");
  await square(512, 0.1, LIGHT, "icon-512.png");
  // Maskable icons get cropped to a circle by Android: keep 20% safe padding.
  await square(512, 0.2, NAVY, "icon-maskable-512.png");

  // Monochrome variant for Android's themed icons.
  const mono = await sharp(crest)
    .resize({ width: 307, height: 307, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .greyscale()
    .normalise()
    .toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mono, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, "icon-monochrome-512.png"));
  console.log(`   icon-monochrome-512.png      512×512`);

  // The favicon is the crest itself; tools/favicon.js explains what that
  // costs at 16px and what is done to soften it.
  await writeFavicons(OUT, SOURCE, path.dirname(OUT));
  console.log(`   favicon-16 … -128 + .ico     crest`);

  /* The crest in the site header, at the sizes the markup asks for.
   *
   * These used to come from tools/build-logos.js, which cuts them out of
   * the wide lockups in brand/. That is why the header and the favicon
   * were allowed to drift apart: the lockups carried one crest and
   * brand/LNS_Crest.png carried another, and for a while the header was
   * gold while the tab was still silver. Nobody had done anything wrong;
   * there were simply two sources of the same picture.
   *
   * One source now. build-logos.js still exists for the wide lockups it
   * is actually for, and it needs a PAIR of them — light and dark —
   * which is more than a new crest on its own can supply.
   *
   * Both names get the same artwork. The markup picks between them by
   * theme, and this crest carries a gold border that holds its edge
   * against the cream page and the navy one alike, so there is nothing
   * for a second version to fix. They stay as two files because the
   * markup asks for two, and a 404 in a <picture> is a missing logo.
   */
  for (const h of [48, 96, 144]) {
    const art = await sharp(crest)
      .resize({ height: h })
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer();
    for (const name of [`logo-${h}.webp`, `logo-white-${h}.webp`]) {
      fs.writeFileSync(path.join(OUT, name), art);
    }
  }
  console.log(`   logo-48 … -144 (+ -white)     header crest`);

  /* ── Lina's portrait, for the head of the panel ─────────────────────
   *
   * A second photograph, already composed as a disc: her head and
   * shoulders on the school's own blurred navy-and-gold background,
   * inside a circle drawn on a white square. The white has to go, or a
   * round portrait on a navy band arrives inside a white box.
   *
   * The circle is MEASURED rather than assumed to be the inscribed one,
   * because it is not. Two portraits have been through here now and
   * neither was centred the same way: this one's centre is about four
   * pixels left and eight up, and a mask drawn at the middle of the
   * square clips her shoulder on one side and leaves a white crescent
   * on the other. findDisc() reads the edge off the image itself, so
   * the next photograph needs no new numbers.
   */
  const PORTRAIT = path.join(__dirname, "..", "brand", "LNS_Assistant_Portrait.png");
  if (fs.existsSync(PORTRAIT)) {
    const disc = await findDisc(PORTRAIT);

    /* Two pixels inside the edge that was found, so the original's own
       anti-aliased rim goes with the white instead of surviving as a
       pale fringe. Then cropped to the circle's bounding square, which
       is what re-centres her: the photograph is off-centre, the disc
       cut out of it is not. */
    const r = Math.floor(disc.r) - 2;
    const left = Math.max(0, Math.round(disc.cx - r));
    const top = Math.max(0, Math.round(disc.cy - r));
    const side = Math.min(2 * r, disc.width - left, disc.height - top);
    const half = side / 2;

    const mask = Buffer.from(
      `<svg width="${side}" height="${side}">` +
        `<circle cx="${half}" cy="${half}" r="${half}" fill="#fff"/>` +
        `</svg>`
    );
    const round = await sharp(PORTRAIT)
      .extract({ left, top, width: side, height: side })
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();

    /* Four, for two display sizes at one and two times: 56 in the
       panel's header and 64 for the launcher in the corner. Each is a
       couple of kilobytes, and a disc resized by the browser from the
       wrong one loses its edge before anything else. */
    for (const w of [56, 64, 112, 128]) {
      await sharp(round)
        .resize({ width: w })
        .webp({ quality: 88, alphaQuality: 100 })
        .toFile(path.join(OUT, `assistant-face-${w}.webp`));
    }
    console.log(
      `   assistant-face-*.webp         portrait, disc found at ` +
        `${Math.round(disc.cx)},${Math.round(disc.cy)} r${Math.round(disc.r)}`
    );
  } else {
    console.log("   assistant-face-*.webp         skipped (no brand/LNS_Assistant_Portrait.png)");
  }

  // ── Open Graph card ────────────────────────────────────────────────
  const ogLogo = await sharp(crest)
    .resize({ width: 300, height: 300, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const wordmark = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
       <text x="600" y="470" font-family="Georgia, serif" font-size="72" font-weight="600"
             fill="#ffffff" text-anchor="middle">LangNation</text>
       <text x="600" y="524" font-family="system-ui, sans-serif" font-size="26"
             letter-spacing="6" fill="#c08b25" text-anchor="middle">LANGUAGE INSTITUTE</text>
       <text x="600" y="580" font-family="system-ui, sans-serif" font-size="24"
             fill="#9fb3d4" text-anchor="middle">Learn German online · A1 to C2</text>
     </svg>`
  );

  await sharp({ create: { width: 1200, height: 630, channels: 4, background: NAVY } })
    .composite([
      { input: ogLogo, top: 70, left: 450 },
      { input: wordmark, top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(IMG, "og-default.png"));
  console.log(`\n   img/og-default.png           1200×630`);

  await require("./build-app-icons").buildAppIcons();

  const total = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\n   ${(total / 1024).toFixed(0)} KB of icons written to public/icons/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
