// ─────────────────────────────────────────────────────────────────────
//  Switch the site between brand marks, and build the seal set.
//
//    node tools/brand.js seal       use the circular seal
//    node tools/brand.js crest      use the original eagle crest
//    node tools/brand.js            show which one is active
//    node tools/brand.js --rebuild  regenerate both sets from brand/,
//                                   keeping the active one active
//
//  Why a build-time switch rather than a .env flag: the icon paths are
//  referenced from the manifest, the service worker's precache list, the
//  head, the header, the footer and the admin shell. Making every one of
//  those variant-aware would spread the decision over six files. Instead
//  both complete sets live under brand/dist/<variant>/ using the *same*
//  filenames the site already asks for, and activating one is a copy. A
//  logo does not need to change per request, so build time is the right
//  granularity, and reverting is one word on the command line.
//
//  Nothing in brand/ is ever written. LNS_Logo.png is read, for its
//  lettering only (see WORDMARK below); the crest icon set is snapshotted
//  from the already-built files in public/icons rather than regenerated, so
//  the crest originals stay exactly as they are.
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
const { writeFavicons, buildIco, FAVICONS, ICO_SIZES } = require("./favicon.js");

// The seal panels are large PNGs and sharp's default thread pool plus its
// image cache was enough to segfault the native library on this machine.
sharp.cache(false);
sharp.concurrency(1);

const ROOT = path.join(__dirname, "..");
const LOGO = path.join(ROOT, "brand", "Logo");

// The seal artwork, as delivered. All three are 1254x1254 with the seal
// filling the square edge to edge, so at a given height the seal is that
// many pixels across with no padding to allow for.
//
// Two files in brand/Logo/ are deliberately unused:
//   Logo_main_new.png              has a white square baked in, no alpha,
//                                  so it would show a white box on any
//                                  coloured ground. Print only.
//   LangNation_EST_2020_...svg     is not vector — it is one base64 PNG
//                                  inside an <svg> wrapper, so it scales
//                                  no better than the PNGs and weighs 8 MB.
const ART = {
  light: "Logo png.png",          // navy on cream, for light grounds
  dark: "Logo png_Darkmode.png",  // gold on near-black, for dark grounds
  mono: "Logo png_white.png",     // black line art on white, for the silhouette
};
const DIST = path.join(ROOT, "brand", "dist");
const ICONS = path.join(ROOT, "public", "icons");
const PUBLIC = path.dirname(ICONS);
const IMG = path.join(ROOT, "public", "img");
const STATE = path.join(ROOT, "content", "brand.json");

// The site's own surfaces, so an icon sits on the same ground as the page
// rather than on a hard white square. PAPER is the cream from the brand
// sheet, matching --paper under PAGE_GROUND=cream.
const PAPER = { r: 248, g: 241, b: 227, alpha: 1 };
const NAVY = { r: 11, g: 45, b: 82, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// From the palette printed on the designer's sheet.
const INK = { r: 11, g: 45, b: 82 };   // #0B2D52, --navy
const GOLD = { r: 212, g: 175, b: 55 }; // #D4AF37, --gold

// Raster heights of the built files. Deliberately unchanged from the
// original set: they are only pixel sizes, they appear in the service
// worker's precache list and in two srcsets, and the displayed size is a
// CSS concern. 96 covers the 60px header at 1.6x, 144 the 68px footer.
const HEIGHTS = [48, 96, 144];

// Displayed sizes, recorded into content/brand.json for the img attributes.
// The seal carries a whole engraved cityscape and two rings of lettering,
// so it needs more room than a flat mark would: at 44px it was unreadable,
// and 60 is where the rim and the LN start to register.
const DISPLAY_H = 60;
const FOOTER_H = 68;

// The wordmark is cut from the old crest lockup rather than set in a
// webfont. That artwork already carries the name in the exact geometric
// sans the school has always used, including the ®, so cropping it is both
// faithful and free — no font file to load for two words.
//
// Bands measured off brand/LNS_Logo.png (1551x450) by scanning its alpha:
// "LangNation®" and "Language Institute" together, excluding the smaller
// "Where Language Signify Nation" tagline below them, which is too fine to
// survive being shrunk into a header.
const WORDMARK = { src: "LNS_Logo.png", left: 436, top: 4, width: 1091, height: 371 };

const VARIANTS = ["crest", "seal"];

// The seal is detailed, near-photographic artwork, so a plain PNG of it is
// enormous — icon-512 came out at 525 KB. Palette quantisation takes that to
// ~160 KB with no visible difference at icon sizes, and the PWA icons have to
// stay PNG, so this is where the saving has to come from.
const PNG = { palette: true, quality: 90, effort: 8 };
const WEBP = { quality: 86, effort: 6 };

// Everything the site asks for by name. Used to check a set is complete
// before it is activated, so a half-built variant cannot go live.
const ICON_FILES = [
  ...HEIGHTS.map((h) => `logo-${h}.webp`),
  ...HEIGHTS.map((h) => `logo-white-${h}.webp`),
  "crest.png",
  ...FAVICONS,
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "icon-monochrome-512.png",
];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/**
 * Record a set's rendered box, measured from its own built logo.
 *
 * The CSS height is global — both variants render at DISPLAY_H — so the
 * width has to come from each variant's own aspect ratio. Deriving it from
 * the built file rather than typing it in means the two cannot disagree,
 * which is what a wrong width/height pair costs: a layout shift while the
 * logo loads.
 */
async function writeBox(dir, variant) {
  const file = path.join(dir, "icons", "logo-96.webp");
  const m = await sharp(file).metadata();
  const w = (h) => Math.round((h * m.width) / m.height);
  const indent = await crestIndent(file, DISPLAY_H);
  fs.writeFileSync(
    path.join(dir, "brand.json"),
    JSON.stringify(
      {
        variant,
        logo: { w: w(DISPLAY_H), h: DISPLAY_H, indent },
        footer: { w: w(FOOTER_H), h: FOOTER_H },
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * Where the name starts, in rendered pixels — the width of the crest plus
 * the gap after it.
 *
 * The header tagline is live text sitting under the lockup, and under the
 * shield is the wrong place for it: the eye reads the tagline as belonging
 * to the name above it, so it has to start where the name starts. That
 * offset is a property of the artwork, not of the stylesheet, and the two
 * marks differ — so it is measured here and handed to CSS rather than typed
 * into a rule that one new logo would quietly falsify.
 *
 * A seal has no gutter at all (it is one round block), and 0 is the honest
 * answer there: the tagline lines up with the mark's left edge.
 */
async function crestIndent(file, displayH) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const C = info.channels;

  const minInk = Math.max(2, Math.round(height * 0.02));
  const inked = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    let ink = 0;
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * C + 3] > 25 && ++ink >= minInk) {
        inked[x] = true;
        break;
      }
    }
  }

  const start = inked.indexOf(true);
  if (start < 0) return 0;
  const minGap = Math.max(2, Math.round(width * 0.01));
  for (let x = start; x < width; x++) {
    if (inked[x]) continue;
    let end = x;
    while (end < width && !inked[end]) end++;
    if (end - x >= minGap && end < width) {
      return Math.round((end * displayH) / height);
    }
    x = end;
  }
  return 0;
}

// ── seal set ──────────────────────────────────────────────────────────

/**
 * The wordmark at `height`, optionally refilled with one flat colour.
 *
 * Recolouring keeps the letter shapes and replaces only the pixel colour, by
 * using the artwork's own alpha channel as the mask.
 */
async function wordmark(height, colour) {
  const cropped = await sharp(path.join(ROOT, "brand", WORDMARK.src))
    .extract({ left: WORDMARK.left, top: WORDMARK.top, width: WORDMARK.width, height: WORDMARK.height })
    .png()
    .toBuffer();
  const resized = sharp(cropped).resize({ height, fit: "inside" });

  if (!colour) {
    const buf = await resized.png().toBuffer();
    const m = await sharp(buf).metadata();
    return { buf, width: m.width, height: m.height };
  }

  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    px[i * 4] = colour.r;
    px[i * 4 + 1] = colour.g;
    px[i * 4 + 2] = colour.b;
    px[i * 4 + 3] = data[i * info.channels + 3];
  }
  const buf = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();  // intermediate, never written to disk
  return { buf, width: info.width, height: info.height };
}

/**
 * Seal + wordmark side by side, on transparency.
 *
 * The seal alone cannot be the header logo: at 44px its two rings of text
 * are illegible, so the name has to be set beside it. That makes the lockup
 * about 4:1 rather than the crest's 2.5:1, which is why the rendered width
 * is recorded in content/brand.json instead of being hard-coded in the
 * templates — wrong width/height attributes cost a layout shift on load.
 */
async function lockup(height, sealFile, wordmarkColour, out) {
  // The seal takes the full height and the two-line text block sits at 76%
  // of it, which is what stops the seal reading as a tiny bead next to the
  // name — the complaint that prompted this shape.
  const gap = Math.round(height * 0.15);
  const wmHeight = Math.round(height * 0.76);

  const seal = await sharp(path.join(LOGO, sealFile))
    .resize({ width: height, height, fit: "contain", background: CLEAR })
    .toBuffer();

  const wm = await wordmark(wmHeight, wordmarkColour);
  const width = height + gap + wm.width;

  await sharp({ create: { width, height, channels: 4, background: CLEAR } })
    .composite([
      { input: seal, left: 0, top: 0 },
      { input: wm.buf, left: height + gap, top: Math.round((height - wm.height) / 2) },
    ])
    .webp(WEBP)
    .toFile(out);

  return { width, height };
}

/** One source centred on a square canvas with `pad` of breathing room. */
async function square(src, size, pad, background, out) {
  const inner = Math.round(size * (1 - pad * 2));
  const art = await sharp(src)
    .resize({ width: inner, height: inner, fit: "contain", background: CLEAR })
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: "center" }])
    .png(PNG)
    .toFile(out);
}

async function buildSeal() {
  const missing = Object.values(ART).filter((f) => !fs.existsSync(path.join(LOGO, f)));
  if (missing.length) {
    throw new Error(`brand/Logo/ is missing ${missing.join(", ")}`);
  }

  const dir = path.join(DIST, "seal");
  fs.mkdirSync(path.join(dir, "icons"), { recursive: true });
  const icon = (f) => path.join(dir, "icons", f);

  console.log("Seal set:");

  for (const h of HEIGHTS) {
    // The full seal, not a cropped-down version of it. Its ring of
    // lettering is illegible at header size either way, but the rim is what
    // makes it read as a seal at a glance — cutting it off leaves something
    // that looks like a cropped photograph. The name is carried by the
    // wordmark beside it, which is how seal-based marks work small.
    //
    // Light theme: navy lettering, matching --navy and the seal's own ink.
    const m = await lockup(h, ART.light, INK, icon(`logo-${h}.webp`));
    // Dark theme and the navy footer. The lettering is cut from the old
    // logo and so arrives navy; it MUST be retinted or it disappears into
    // the navy footer it sits on.
    await lockup(h, ART.dark, GOLD, icon(`logo-white-${h}.webp`));
    console.log(`   logo-${h}.webp / logo-white-${h}.webp`.padEnd(38) + `${m.width}×${m.height}`);
  }

  // The standalone emblem, used inline on a few pages at 48-64px.
  await sharp(path.join(LOGO, ART.light))
    .resize({ width: 96, height: 96, fit: "contain", background: CLEAR })
    .png(PNG)
    .toFile(icon("crest.png"));

  // The favicon is the one place the full seal genuinely cannot work: at
  // 32px it is a featureless disc. Cropping to the middle 30% keeps the open
  // book and the LN — the only parts that survive a browser tab — with a
  // little of the globe above them, on navy so it holds up against both
  // light and dark browser chrome. Wider crops were tried; at 58% the LN was
  // still unreadable.
  // The favicon is the light seal: navy on cream reads against both a
  // light and a dark browser tab, where the dark seal would not.
  // favicon.ico must sit at the site root, one level up from icons/.
  const iconDir = path.dirname(icon("favicon-32.png"));
  await writeFavicons(iconDir, path.join(LOGO, ART.light), path.dirname(iconDir));
  console.log("   crest.png".padEnd(38) + "seal");
  console.log("   favicon-16 … -128 + .ico".padEnd(38) + "seal, contrast-lifted");

  // App icons: the dark seal on navy. iOS and Android round the icon
  // themselves, so it must be opaque to the corners — a transparent corner
  // shows through as a pale notch. The dark seal is used rather than the
  // light one because a cream icon reads as washed out on a home screen.
  for (const [size, file] of [[180, "apple-touch-icon.png"], [192, "icon-192.png"], [512, "icon-512.png"]]) {
    await square(path.join(LOGO, ART.dark), size, 0.04, NAVY, icon(file));
  }
  console.log("   apple-touch / icon-192 / icon-512".padEnd(38) + "dark seal on navy");

  // Android crops maskable icons to a circle: 20% padding keeps the art in
  // the safe zone whatever shape the launcher uses. The seal being circular
  // already, it lands exactly inside that circle.
  await square(path.join(LOGO, ART.dark), 512, 0.2, NAVY, icon("icon-maskable-512.png"));

  // Themed icons are recoloured by the launcher, so what it needs is a
  // silhouette in the alpha channel.
  //
  // The mono artwork is black line work on a white disc, so the ink is the
  // DARK pixels — alpha is inverted brightness, not brightness. It is also
  // multiplied by the source's own alpha, or everything outside the disc
  // (transparent, and therefore black once flattened) would come back as a
  // solid opaque square.
  const { data, info } = await sharp(path.join(LOGO, ART.mono))
    .resize({ width: 410, height: 410, fit: "contain", background: CLEAR })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const mono = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * c];
    const g = data[i * c + 1];
    const b = data[i * c + 2];
    const a = data[i * c + 3];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    mono[i * 4] = 0;
    mono[i * 4 + 1] = 0;
    mono[i * 4 + 2] = 0;
    mono[i * 4 + 3] = Math.round(((255 - lum) * a) / 255);
  }
  await sharp({ create: { width: 512, height: 512, channels: 4, background: CLEAR } })
    .composite([
      { input: mono, raw: { width: info.width, height: info.height, channels: 4 }, gravity: "center" },
    ])
    .png(PNG)
    .toFile(icon("icon-monochrome-512.png"));
  console.log("   maskable-512 / monochrome-512".padEnd(38) + "512×512");

  // ── Open Graph card ──────────────────────────────────────────────
  const ogSeal = await sharp(path.join(LOGO, ART.dark))
    .resize({ width: 300, height: 300, fit: "contain", background: CLEAR })
    .toBuffer();
  const ogText = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
       <text x="600" y="470" font-family="Georgia, serif" font-size="72" font-weight="600"
             fill="#ffffff" text-anchor="middle">LangNation</text>
       <text x="600" y="524" font-family="system-ui, sans-serif" font-size="26"
             letter-spacing="6" fill="#d4af37" text-anchor="middle">SPRACHSCHULE, DEUTSCHLAND</text>
       <text x="600" y="580" font-family="system-ui, sans-serif" font-size="24"
             fill="#9fb3d4" text-anchor="middle">Learn German online · A1 to C2</text>
     </svg>`
  );
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: NAVY } })
    .composite([{ input: ogSeal, top: 70, left: 450 }, { input: ogText, top: 0, left: 0 }])
    .png(PNG)
    .toFile(path.join(dir, "og-default.png"));
  console.log("   og-default.png".padEnd(38) + "1200×630");

  await writeBox(dir, "seal");
  return dir;
}

// ── crest set ─────────────────────────────────────────────────────────

/**
 * Assemble a set's favicon.ico from the PNGs already in that set.
 *
 * Built from the set's own snapshotted PNGs rather than re-rendered from
 * the source artwork, so the .ico cannot drift from the favicon-*.png
 * files beside it — the whole point of a snapshot is that it is a copy of
 * what was live, not a fresh render that might differ.
 *
 * activate() requires this file, so a set without one cannot be switched
 * to at all. The original crest snapshot predated that check and was
 * written without it, which left `brand.js crest` refusing to run.
 */
function writeIco(dir) {
  const images = ICO_SIZES.map((size) => ({
    size,
    data: fs.readFileSync(path.join(dir, "icons", `favicon-${size}.png`)),
  }));
  fs.writeFileSync(path.join(dir, "favicon.ico"), buildIco(images));
}

/**
 * Keep the current, already-built crest icons as the revert target.
 *
 * They are copied rather than regenerated so this cannot change what the
 * live site looks like today: whatever is in public/icons right now is
 * exactly what `node tools/brand.js crest` will put back.
 */
function snapshotCrest({ force = false } = {}) {
  const dir = path.join(DIST, "crest");
  if (!force && fs.existsSync(path.join(dir, "brand.json"))) return dir;

  // public/icons is the source for this snapshot, so it must actually hold
  // the crest. If another variant is live, snapshotting would file that
  // variant's art under "crest" and quietly destroy the revert target.
  //
  // Not checked when forced: --rebuild regenerates the crest into
  // public/icons immediately before snapshotting, so the icons are the crest
  // even though the recorded state still names the outgoing variant.
  if (!force && fs.existsSync(STATE) && current() !== "crest") {
    throw new Error(
      `Refusing to snapshot the crest set: public/icons currently holds the ` +
        `"${current()}" set. Switch to crest first, or restore ${rel(dir)} from git.`
    );
  }

  const absent = ICON_FILES.filter((f) => !fs.existsSync(path.join(ICONS, f)));
  if (absent.length) {
    throw new Error(
      `Cannot snapshot the crest set — public/icons is missing ${absent.join(", ")}\n` +
        `Run: node tools/build-logos.js && node tools/build-icons.js`
    );
  }

  fs.mkdirSync(path.join(dir, "icons"), { recursive: true });
  for (const f of ICON_FILES) fs.copyFileSync(path.join(ICONS, f), path.join(dir, "icons", f));
  fs.copyFileSync(path.join(IMG, "og-default.png"), path.join(dir, "og-default.png"));
  writeIco(dir);
  console.log(`Snapshotted the current crest icons to ${rel(dir)}`);
  return dir;
}

// ── activate ──────────────────────────────────────────────────────────

/**
 * Bump the service worker's cache name.
 *
 * The worker precaches /icons/logo-96.webp and friends and serves icons
 * cache-first. A brand switch changes the bytes behind those exact URLs
 * without changing the URL list, so without this every returning visitor —
 * and every installed copy of the app — would keep showing the old mark.
 */
function bumpServiceWorkerCache() {
  const file = path.join(ROOT, "public", "sw.js");
  const src = fs.readFileSync(file, "utf8");
  const re = /(const CACHE = "langnation-web-v)(\d+)(")/;
  const m = src.match(re);
  if (!m) {
    console.warn("   ! could not find the CACHE constant in public/sw.js — bump it by hand");
    return null;
  }
  const next = Number(m[2]) + 1;
  fs.writeFileSync(file, src.replace(re, `$1${next}$3`));
  return next;
}

async function activate(variant) {
  const dir = path.join(DIST, variant);
  const absent = ICON_FILES.filter((f) => !fs.existsSync(path.join(dir, "icons", f)));
  if (!fs.existsSync(path.join(dir, "favicon.ico"))) absent.push("favicon.ico");
  if (absent.length) throw new Error(`${rel(dir)} is incomplete — missing ${absent.join(", ")}`);

  // Refreshed on every activation, so a set built before DISPLAY_H changed
  // cannot go live carrying a stale box.
  await writeBox(dir, variant);
  for (const f of ICON_FILES) fs.copyFileSync(path.join(dir, "icons", f), path.join(ICONS, f));
  fs.copyFileSync(path.join(dir, "og-default.png"), path.join(IMG, "og-default.png"));
  // favicon.ico lives at the site root, not under icons/ — browsers and
  // Google request /favicon.ico directly. Without this copy the root .ico
  // stays on whichever variant build-icons.js last wrote, which is not
  // necessarily the active one.
  fs.copyFileSync(path.join(dir, "favicon.ico"), path.join(PUBLIC, "favicon.ico"));
  fs.copyFileSync(path.join(dir, "brand.json"), STATE);

  // Installation artwork is independent of crest/seal header branding.
  await require("./build-app-icons").buildAppIcons();

  const v = bumpServiceWorkerCache();

  console.log(`\nActive brand mark: ${variant}`);
  console.log(`   ${ICON_FILES.length + 1} files copied into public/icons and public/img`);
  const box = JSON.parse(fs.readFileSync(STATE, "utf8")).logo;
  console.log(`   logo box ${box.w}×${box.h}`);
  if (v) console.log(`   service worker cache -> langnation-web-v${v}`);
}

function current() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8")).variant;
  } catch {
    return "crest";
  }
}

// ── main ──────────────────────────────────────────────────────────────

/**
 * Regenerate both sets from the originals in brand/.
 *
 * build-logos.js and build-icons.js write the crest straight into
 * public/icons — they predate the two-variant layout and know nothing about
 * it. So they are run first, their output is snapshotted as the crest set,
 * and the wanted variant is activated last. Without that ordering, running
 * them while the seal is active would half-replace the live icons with the
 * crest and leave the site showing a mixture of the two.
 */
function rebuild() {
  const { execFileSync } = require("child_process");
  for (const script of ["build-logos.js", "build-icons.js"]) {
    // stdin is "ignore" rather than inherited: inheriting it hangs forever
    // when this runs anywhere without a terminal — a CI step, or a shell
    // whose stdin has been closed.
    execFileSync(process.execPath, [path.join(__dirname, script)], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  }
  snapshotCrest({ force: true });
}

(async () => {
  const args = process.argv.slice(2);
  const wantsRebuild = args.includes("--rebuild");
  const want = args.find((a) => !a.startsWith("--"));

  if (!want && !wantsRebuild) {
    console.log(`Active brand mark: ${current()}`);
    console.log(`Switch with: node tools/brand.js <${VARIANTS.join("|")}>`);
    return;
  }
  if (want && !VARIANTS.includes(want)) {
    console.error(`Unknown variant "${want}". Use one of: ${VARIANTS.join(", ")}`);
    process.exit(1);
  }

  // Without an explicit variant, --rebuild leaves active whatever is active.
  const target = want || current();

  if (wantsRebuild) rebuild();
  // Snapshot before anything is overwritten, so the revert target exists
  // even on the very first switch.
  else snapshotCrest();

  if (target === "seal") await buildSeal();
  await activate(target);
})().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
