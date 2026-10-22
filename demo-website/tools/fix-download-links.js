// ─────────────────────────────────────────────────────────────────────
//  Repair the /downloads/… links in migrated content against the files
//  that actually exist on disk.
//
//  Roughly half of the exam-paper links in the old database were already
//  broken before this rebuild: the database says "Telc-Deutsch-A1-
//  Übungstest-1.pdf" while the file is named "…-Uebungstest-1.pdf". There
//  are also a few doubled extensions ("….pdf.pdf") and stray %20 vs space
//  differences.
//
//  Rather than hand-correct 30 links, this matches each link to a real
//  file by a normalised key: lowercase, umlauts transliterated, anything
//  that is not a letter or digit removed.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

// Whoever uploaded these files handled umlauts three different ways, and the
// database links use a fourth. "Übungstest" appears on disk as "Uebungstest"
// (transliterated), "Ubungstest" (accent stripped) and "bungstest" (character
// dropped entirely). So a name is indexed under every spelling, and a link is
// looked up under every spelling too — a match on any of them is a match.
const STRIP = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const SPELLINGS = [
  // ü → ue  (the correct German transliteration)
  (s) => s.replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ß/g, "ss"),
  // ü → u   (accent simply dropped)
  (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss"),
  // ü → ""  (character lost altogether)
  (s) => s.replace(/[üäöÜÄÖ]/g, "").replace(/ß/g, "ss"),
];

/** Every normalised key a name could plausibly be filed under. */
function keysFor(s) {
  const base = String(s).toLowerCase();
  const keys = new Set();

  for (const spell of SPELLINGS) {
    const k = STRIP(spell(base));
    if (k) keys.add(k);
    // Some names carry a stray "1_" folder prefix that the file does not.
    keys.add(k.replace(/^\d+/, ""));
  }
  return [...keys].filter(Boolean);
}

/** The primary key, used when we only need one. */
const normalise = (s) => keysFor(s)[0] || "";

/** Index every file under `root`, keyed by normalised path and by basename. */
function indexFiles(root, prefix = "") {
  const byPath = new Map();
  const byName = new Map();

  if (!fs.existsSync(root)) return { byPath, byName, count: 0 };

  let count = 0;
  (function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, relPath);
        continue;
      }
      const url = `${prefix}/${relPath}`;
      for (const key of keysFor(relPath)) byPath.set(key, url);

      // A basename can repeat across level folders; keep the first and
      // record the clash so we never guess between two real candidates.
      for (const key of keysFor(entry.name)) {
        if (byName.has(key) && byName.get(key) !== url) byName.set(key, null);
        else byName.set(key, url);
      }
      count++;
    }
  })(root, "");

  return { byPath, byName, count };
}

/**
 * Repair every /downloads/ link in `html`.
 * Returns { html, fixed, broken:[…] }.
 */
function repairLinks(html, index) {
  if (!html) return { html: "", fixed: 0, broken: [] };

  let fixed = 0;
  const broken = [];

  const out = String(html).replace(/(href|src)="(\/downloads\/[^"]+)"/gi, (whole, attr, rawUrl) => {
    let url;
    try {
      url = decodeURI(rawUrl);
    } catch {
      url = rawUrl;
    }

    const rel = url.replace(/^\/downloads\//, "");

    // Full path first — it disambiguates names that repeat across levels.
    let match = null;
    for (const key of keysFor(rel)) {
      if (index.byPath.has(key)) { match = index.byPath.get(key); break; }
    }

    // Then the file name on its own, with a doubled extension dropped
    // ("x.pdf.pdf" → "x.pdf"), which a few rows carry.
    if (!match) {
      const base = rel.split("/").pop();
      const deduped = base.replace(/(\.[a-z0-9]{2,4})\1$/i, "$1");
      for (const key of [...keysFor(deduped), ...keysFor(base)]) {
        const hit = index.byName.get(key);
        if (hit) { match = hit; break; }
      }
    }

    if (match) {
      fixed++;
      return `${attr}="${encodeURI(match)}"`;
    }

    broken.push(url);
    return whole;
  });

  return { html: out, fixed, broken };
}

module.exports = { indexFiles, repairLinks, normalise };
