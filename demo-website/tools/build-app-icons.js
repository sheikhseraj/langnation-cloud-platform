"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "icons");

// These are installation icons, independent of the website header brand.
// Keep opaque square canvases; iOS and Android apply their own masks.
async function squareArtwork(source, background) {
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = background.match(/\w\w/g).map(value => parseInt(value, 16));
  const seen = new Uint8Array(info.width * info.height);
  const pending = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const index = y * info.width + x;
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * info.channels;
    if (data[offset] > 24 || data[offset + 1] > 24 || data[offset + 2] > 24) return;
    pending.push(index);
  };
  for (let x = 0; x < info.width; x++) { visit(x, 0); visit(x, info.height - 1); }
  for (let y = 0; y < info.height; y++) { visit(0, y); visit(info.width - 1, y); }
  // Flood only black pixels connected to the canvas edge, protecting the art.
  while (pending.length) {
    const index = pending.pop();
    const offset = index * info.channels;
    for (let c = 0; c < 3; c++) data[offset + c] = rgb[c];
    const x = index % info.width, y = Math.floor(index / info.width);
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  return sharp(data, { raw: info }).resize(1024, 1024, { fit: "contain", background: "#" + background }).png().toBuffer();
}

async function buildAppIcons() {
  fs.mkdirSync(OUT, { recursive: true });
  const variants = [
    { name: "dark", file: "Icon_Dark_Defult.png", background: "043555", suffix: "" },
    { name: "white", file: "Icon_White.png", background: "fffdf2", suffix: "-white" },
  ];
  let version;
  for (const variant of variants) {
    const source = path.join(ROOT, "brand", "app-icons", variant.file);
    const artwork = await squareArtwork(source, variant.background);
    if (variant.name === "dark") version = crypto.createHash("sha256").update(artwork).digest("hex").slice(0, 12);
    for (const size of [192, 512, 1024]) {
      await sharp(artwork).resize(size, size).png().toFile(path.join(OUT, `icon${variant.suffix}-${size}.png`));
    }
    for (const size of [120, 152, 167, 180]) {
      const name = size === 180 ? `apple-touch-icon${variant.suffix}.png` : `apple-touch-icon${variant.suffix}-${size}.png`;
      await sharp(artwork).resize(size, size).png().toFile(path.join(OUT, name));
    }
    // A centred square of side 56% fits wholly in the Android safe circle
    // (diameter 80%). The complete crest, name and border survive any mask.
    const inner = await sharp(artwork).resize(286, 286).toBuffer();
    await sharp({ create: { width: 512, height: 512, channels: 3, background: "#" + variant.background } })
      .composite([{ input: inner, gravity: "center" }]).removeAlpha().png()
      .toFile(path.join(OUT, `icon-maskable${variant.suffix}-512.png`));
    console.log(`App icons: ${variant.name} (Android, iOS and 1024px master)`);
  }
  const file = path.join(ROOT, "public", "manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.icons = [
    { src: `/icons/icon-192.png?v=${version}`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/icons/icon-512.png?v=${version}`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/icons/icon-maskable-512.png?v=${version}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  for (const shortcut of manifest.shortcuts || []) shortcut.icons = [manifest.icons[0]];
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}

module.exports = { buildAppIcons };
if (require.main === module) buildAppIcons().catch(error => { console.error(error); process.exitCode = 1; });
