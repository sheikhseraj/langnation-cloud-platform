// ─────────────────────────────────────────────────────────────────────
//  Documents attached to an email the office sends.
//
//  ── Why there is still no multipart parser ──────────────────────────
//
//  The same choice lib/avatar.js makes, for the same reason. The browser
//  reads the file and posts it as a data: URL through the ordinary form
//  encoding, so the server needs no new dependency, and on shared
//  hosting a dependency is a thing somebody has to remember to install
//  after every deploy.
//
//  The cost is base64: 4 bytes on the wire for every 3 in the file, and
//  the whole thing held in memory while it is parsed. That is why the
//  cap below is small. It is a cap on what the office can attach to one
//  email, not a storage system, and mail servers refuse large messages
//  anyway — most stop somewhere between 10 and 25MB including the
//  encoding.
//
//  ── What is trusted ─────────────────────────────────────────────────
//
//  Nothing. The name, the type and the length all arrive from the page
//  and are all re-checked here, and the bytes have to begin the way the
//  extension says they should. Somebody posting by hand gets the same
//  treatment as somebody using the form.
// ─────────────────────────────────────────────────────────────────────
"use strict";

/** Everything one message may carry, after decoding. */
const MAX_TOTAL = 5 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_NAME = 120;

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, pptx, odt, zip
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // doc, xls, ppt

/* Judged by EXTENSION, not by the type the browser declares.
 *
 * The declared type was the first cut and it was wrong twice over. A
 * browser hands back an empty type for plenty of ordinary files — .odt
 * and .csv on Windows both do it — and the whole thing was refused for
 * a file nobody could see anything wrong with. And an extension is what
 * the person attaching it is actually thinking in: they have a .docx,
 * not an
 * application/vnd.openxmlformats-officedocument.wordprocessingml.document.
 *
 * So the extension decides what it is, the MIME type is what we tell
 * the recipient it is, and the signature is checked where the format
 * has one worth checking.
 *
 * `sig: null` means there is nothing to check. Those are text formats:
 * no header to verify, and nothing a mail client will execute.
 */
const KINDS = {
  pdf: { type: "application/pdf", sig: [[0x25, 0x50, 0x44, 0x46]] },

  doc: { type: "application/msword", sig: [OLE] },
  xls: { type: "application/vnd.ms-excel", sig: [OLE] },
  ppt: { type: "application/vnd.ms-powerpoint", sig: [OLE] },

  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sig: [ZIP] },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sig: [ZIP] },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sig: [ZIP] },

  odt: { type: "application/vnd.oasis.opendocument.text", sig: [ZIP] },
  ods: { type: "application/vnd.oasis.opendocument.spreadsheet", sig: [ZIP] },
  odp: { type: "application/vnd.oasis.opendocument.presentation", sig: [ZIP] },

  zip: { type: "application/zip", sig: [ZIP] },

  rtf: { type: "application/rtf", sig: [[0x7b, 0x5c, 0x72, 0x74, 0x66]] }, // {\rtf
  txt: { type: "text/plain", sig: null },
  csv: { type: "text/csv", sig: null },
  md: { type: "text/markdown", sig: null },

  png: { type: "image/png", sig: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  jpg: { type: "image/jpeg", sig: [[0xff, 0xd8, 0xff]] },
  jpeg: { type: "image/jpeg", sig: [[0xff, 0xd8, 0xff]] },
  gif: { type: "image/gif", sig: [[0x47, 0x49, 0x46, 0x38]] },
  webp: { type: "image/webp", sig: [[0x52, 0x49, 0x46, 0x46]] },
  heic: { type: "image/heic", sig: null }, // ftyp box, too variable to pin
};

/* Never, whatever the extension claims or the bytes say.
 *
 * Listed separately from "not on the allowlist" because the message
 * should be different: one is "we do not send those", the other is "we
 * will not send that". A school emailing a student an executable is how
 * its address ends up on a blocklist, and .html and .svg are here
 * because both carry script and both open in a browser when clicked.
 */
const NEVER = new Set([
  "exe", "dll", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "cpl",
  "js", "mjs", "vbs", "vbe", "wsf", "ps1", "sh", "bash", "jar", "apk",
  "app", "dmg", "iso", "lnk", "reg", "hta", "chm",
  "html", "htm", "xhtml", "svg", "swf",
]);

/** A short, human list for the message when something is refused. */
const KIND_WORDS =
  "PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text, CSV, a zip or an image";

const extensionOf = (name) => {
  const dot = String(name || "").lastIndexOf(".");
  return dot > 0 ? String(name).slice(dot + 1).toLowerCase() : "";
};

const startsWith = (buf, sig) => sig.every((b, i) => buf[i] === b);

/** Does the file begin the way its extension says it should? */
function bytesMatchKind(buf, ext) {
  const kind = KINDS[ext];
  if (!kind || kind.sig === null) return true; // nothing to check
  if (!kind.sig.some((sig) => startsWith(buf, sig))) return false;
  // RIFF alone is also AVI and WAV. Bytes 8–11 say which.
  if (ext === "webp") {
    return buf.length > 12 && buf.slice(8, 12).toString("ascii") === "WEBP";
  }
  return true;
}

/**
 * A filename that cannot escape anywhere.
 *
 * Only the last segment, and only characters that mean nothing to a
 * filesystem or a header. The name travels in a MIME header and is
 * written to disk by whoever receives it, and neither of those is our
 * machine — which is exactly why it is cleaned here rather than trusted
 * to be cleaned there.
 */
function safeName(raw) {
  const base = String(raw == null ? "" : raw).split(/[\\/]/).pop().trim();
  const clean = base.replace(/[\u0000-\u001f\u007f"\r\n]/g, "").replace(/^\.+/, "");
  return clean.slice(0, MAX_NAME) || "attachment";
}

/**
 * Turn what the page posted into what nodemailer wants.
 *
 * Takes whatever `attach` arrived as — express gives a string for one
 * field and an array for several — and returns
 * `{ ok, files, reason }`. One bad file fails the whole send rather than
 * being dropped quietly: an email that goes without the document it was
 * written to carry is worse than one that does not go.
 */
function parse(input) {
  const raw = input == null ? [] : Array.isArray(input) ? input : [input];
  const posted = raw.filter((x) => String(x || "").trim());
  if (!posted.length) return { ok: true, files: [] };

  if (posted.length > MAX_FILES) {
    return { ok: false, files: [], reason: `Too many files — ${MAX_FILES} at a time.` };
  }

  const files = [];
  let total = 0;

  for (const entry of posted) {
    let meta;
    try {
      meta = JSON.parse(entry);
    } catch {
      return { ok: false, files: [], reason: "One of the files did not arrive properly." };
    }

    /* The media type is allowed to be empty and is thrown away either
       way. A browser hands back no type at all for plenty of
       ordinary files -- .docx, .csv and .odt on Windows all do it --
       and FileReader then writes "data:;base64," or
       "data:application/octet-stream;base64,". Insisting on a type
       here refused exactly the files the office was trying to send.
       The extension decides what it is. */
    const m = /^data:([^;,]*);base64,([\s\S]+)$/.exec(String(meta && meta.data));
    if (!m) return { ok: false, files: [], reason: "One of the files did not arrive properly." };

    const name = safeName(meta.name);
    const ext = extensionOf(name);

    if (NEVER.has(ext)) {
      return { ok: false, files: [], reason: `"${name}" is a program, not a document. That one cannot be sent.` };
    }
    if (!KINDS[ext]) {
      return {
        ok: false,
        files: [],
        reason: ext
          ? `"${name}" is a .${ext}, which is not a kind of file we send. Use ${KIND_WORDS}.`
          : `"${name}" has no file extension, so there is no telling what it is.`,
      };
    }
    // What the recipient will be told it is. Taken from the extension
    // rather than from the browser, which returns nothing at all for
    // plenty of ordinary files.
    const type = KINDS[ext].type;

    let content;
    try {
      content = Buffer.from(m[2], "base64");
    } catch {
      return { ok: false, files: [], reason: `"${name}" did not arrive properly.` };
    }
    if (!content.length) return { ok: false, files: [], reason: `"${name}" is empty.` };

    if (!bytesMatchKind(content, ext)) {
      return { ok: false, files: [], reason: `"${name}" is not really a .${ext} file.` };
    }

    total += content.length;
    if (total > MAX_TOTAL) {
      return {
        ok: false,
        files: [],
        reason: `That is more than ${Math.round(MAX_TOTAL / (1024 * 1024))}MB of attachments — send fewer, or a link.`,
      };
    }

    files.push({ filename: name, content, contentType: type });
  }

  return { ok: true, files };
}

module.exports = { parse, safeName, KINDS, NEVER, MAX_TOTAL, MAX_FILES, KIND_WORDS };
