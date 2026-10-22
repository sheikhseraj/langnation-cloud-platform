// Build the seal used in email headers.
//
//   node tools/build-email-logo.js
//
// PNG, not WebP: Outlook on Windows renders mail through Word, which has
// never supported WebP, and a broken image in the header is worse than
// no image at all.
//
// Drawn at twice its display size so it stays sharp on a high-density
// screen, and taken from the light-on-dark seal because it sits on the
// navy bar.

const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "brand", "seal", "seal-light.png");
const OUT = path.join(__dirname, "..", "public", "icons", "email-seal.png");

const DISPLAY = 56; // what the email asks for
const SCALE = 2; // what is actually drawn

sharp(SRC)
  .resize(DISPLAY * SCALE, DISPLAY * SCALE, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9 })
  .toFile(OUT)
  .then((info) =>
    console.log(
      `  public/icons/email-seal.png — ${info.width}x${info.height}, ` +
        `${Math.round(info.size / 1024)}kB, shown at ${DISPLAY}px`
    )
  )
  .catch((e) => {
    console.error("  failed:", e.message);
    process.exit(1);
  });
