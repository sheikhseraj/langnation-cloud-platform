// Cut the designer's brand sheet (brand/LNS_Seal.png) into separate assets.
//
// The sheet is 1536x1024 with a fully transparent background, so each panel is
// isolated by taking a deliberately loose box that contains the panel and none
// of the faint grey captions, then shrinking that box to the panel's real
// bounds by scanning the alpha channel. sharp's own `trim` was tried first and
// would not shrink these boxes at all, so the bounds are measured here where
// the threshold is visible and adjustable.
//
// Nothing already in brand/ is touched: everything lands in brand/seal/.
//
//   node tools/crop-brand-sheet.js
// Icons are committed to the repository and are not rebuilt on deploy.
// A production install omits devDependencies, so sharp is absent there —
// exit quietly rather than failing the build.
try {
  require.resolve("sharp");
} catch {
  console.log("sharp is not installed — skipping (icons are committed, nothing to rebuild)");
  process.exit(0);
}

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
sharp.cache(false);
sharp.concurrency(1);

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "brand", "LNS_Seal.png");
const DEST = path.join(ROOT, "brand", "seal");

// Captions on the sheet are drawn at very low alpha; panel art is opaque. 40
// sits well clear of both.
const ALPHA_MIN = 40;

// Loose boxes in sheet pixels: [left, top, width, height]. They were derived by
// running a connected-component pass over the sheet's alpha channel, so each
// box contains exactly one panel and no part of its neighbour — the four app
// icons in particular sit in 18px gutters and would otherwise merge into one
// blob. `min` raises the threshold for the panels that carry a soft drop
// shadow, so the crop is the tile and not the shadow around it.
const PANELS = [
  { name: "seal-light", box: [0, 45, 518, 516] },
  { name: "seal-dark", box: [522, 45, 500, 516] },
  { name: "app-tile", box: [1030, 45, 506, 516] },
  { name: "mark", box: [370, 662, 200, 180] },
  { name: "icon-dark", box: [694, 620, 186, 198], min: 200, tight: true },
  { name: "icon-light", box: [899, 620, 187, 198], min: 200, tight: true },
  { name: "icon-blue", box: [1105, 620, 189, 198], min: 200, tight: true },
  { name: "icon-mono", box: [1313, 620, 188, 198], min: 200, tight: true },
  { name: "wordmark", box: [660, 885, 350, 120] },
  { name: "tagline", box: [1180, 890, 320, 95] },
];

// Tightest box inside `box` whose every discarded row/column is fully below
// ALPHA_MIN. Returns null when the region holds no panel art at all, which
// means the loose box is in the wrong place.
function alphaBounds(raw, info, box, min = ALPHA_MIN) {
  const [bx, by, bw, bh] = box;
  const c = info.channels;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = by; y < by + bh; y++) {
    const row = y * info.width;
    for (let x = bx; x < bx + bw; x++) {
      if (raw[(row + x) * c + 3] < min) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

(async () => {
  fs.mkdirSync(DEST, { recursive: true });

  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`sheet ${info.width}x${info.height}\n`);

  let failed = 0;
  for (const p of PANELS) {
    const box = alphaBounds(data, info, p.box, p.min);
    if (!box) {
      console.log(`  ${p.name.padEnd(11)} NO ART in ${p.box.join(",")}`);
      failed++;
      continue;
    }
    await sharp(SRC)
      .extract(box)
      .png({ compressionLevel: 9 })
      .toFile(path.join(DEST, p.name + ".png"));

    // Flag a panel that reaches the edge of its loose box: the art is probably
    // being cut off and the box needs widening. `tight` panels sit in an 18px
    // gutter between their neighbours, so their box is deliberately set to the
    // panel's own left and right edges and touching them means nothing.
    const [bx, by, bw, bh] = p.box;
    const clipped = [
      box.left === bx && !p.tight ? "L" : "",
      box.top === by ? "T" : "",
      box.left + box.width === bx + bw && !p.tight ? "R" : "",
      box.top + box.height === by + bh ? "B" : "",
    ].join("");
    console.log(
      `  ${p.name.padEnd(11)} ${box.left},${box.top}  ${box.width}x${box.height}` +
        (clipped ? `   CLIPPED:${clipped}` : "")
    );
  }

  console.log(`\n${PANELS.length - failed}/${PANELS.length} panels -> brand/seal/`);
  if (failed) process.exitCode = 1;
})();
