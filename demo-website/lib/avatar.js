// Profile photos.
//
// The browser resizes the picture to 256x256 on a canvas and posts it
// as a data: URL through the ordinary form encoding. That is a
// deliberate choice over a real file upload: no multipart parser, no
// image library on the server, and nothing arrives that the browser
// has not already shrunk to a known size. A phone photo is 4MB before
// the canvas and about 20KB after it.
//
// None of that is trusted. The client does the resizing for the
// server's convenience, not for its safety, so everything below
// re-checks: the declared type, the real bytes behind it, and the
// length. A person who bypasses the page and posts by hand gets the
// same treatment as anyone else.

"use strict";

/** Types a browser canvas can produce, and that every browser renders. */
const ALLOWED = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF; the WEBP tag is checked below
};

/** Generous for a 256px square, far below anything worth storing. */
const MAX_BYTES = 400 * 1024;

const startsWith = (buf, sig) => sig.every((b, i) => buf[i] === b);

/** Does the file actually begin the way its declared type requires? */
function bytesMatchType(buf, type) {
  const signatures = ALLOWED[type];
  if (!signatures) return false;
  if (!signatures.some((sig) => startsWith(buf, sig))) return false;
  // RIFF alone is also AVI and WAV. Bytes 8-11 say which.
  if (type === "image/webp") {
    return buf.length > 12 && buf.slice(8, 12).toString("ascii") === "WEBP";
  }
  return true;
}

/**
 * Turn a posted data: URL into bytes, or explain why not.
 *
 * Returns { ok: true, buffer, type } or { ok: false, reason } — the
 * reason is written to be shown to the person who chose the file.
 */
function fromDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, reason: "No image was chosen." };

  const match = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match) return { ok: false, reason: "That does not look like an image file." };

  const [, type, b64] = match;
  if (!ALLOWED[type]) {
    return { ok: false, reason: "Photos must be a PNG, JPEG or WebP image." };
  }

  // Checked before decoding: base64 is 4 characters per 3 bytes, so
  // this rejects an oversized payload without allocating it first.
  if (b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) {
    return { ok: false, reason: "That image is too large. Try a smaller one." };
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, reason: "That image could not be read." };
  }

  if (!buffer.length) return { ok: false, reason: "That image is empty." };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, reason: "That image is too large. Try a smaller one." };
  }
  if (!bytesMatchType(buffer, type)) {
    return {
      ok: false,
      reason: "That file is not the kind of image it claims to be, so it was not saved.",
    };
  }

  return { ok: true, buffer, type };
}

/**
 * Initials for the fallback avatar. Two letters at most: three is a
 * monogram, and monograms stop being readable at 40 pixels.
 */
function initials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * A stable hue per person, so the fallback avatar is recognisably
 * theirs rather than a different colour on every page.
 */
function hue(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

module.exports = { ALLOWED, MAX_BYTES, fromDataUrl, bytesMatchType, initials, hue };
