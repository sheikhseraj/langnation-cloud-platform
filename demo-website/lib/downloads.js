// ─────────────────────────────────────────────────────────────────────
//  Turn the migrated "Model" and "Resources" rows into structured lists.
//
//  Those rows are link dumps written in the old WYSIWYG editor, and the
//  markup is genuinely invalid — nested <a> tags like
//
//    <a href="X"><a href="X">Telc … - </a><b><a href="X">Audio</a></b></a>
//
//  Browsers un-nest that unpredictably, so rather than print it as HTML we
//  parse out the real (name, file) pairs and render our own list.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const { toText } = require("./text");

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Work out what kind of file a link points at. */
function fileKind(href) {
  const clean = href.split("?")[0].toLowerCase();
  if (clean.endsWith(".mp3") || clean.endsWith(".m4a")) return "Audio";
  if (clean.endsWith(".pdf")) return "PDF";
  if (clean.endsWith(".zip")) return "ZIP";
  return "Open";
}

/**
 * Strip the call-to-action off a label.
 *
 * The old markup put the verb in its own anchor, so the extracted text reads
 * "Tagesschau Watch" or "German Expressions View / Download" — with or
 * without a separating dash. Everything after the last real word goes.
 */
const ACTIONS = "pdf|audio|zip|watch|read|view|download|listen";

function cleanName(text) {
  let out = String(text).replace(/\s{2,}/g, " ").trim();

  // Remove one or more trailing action words, with or without separators,
  // e.g. " - PDF", " View / Download", " Watch / Read", " Audio".
  const trailing = new RegExp(
    `(?:\\s*[-–—:]\\s*|\\s+)(?:${ACTIONS})(?:\\s*[/|]\\s*(?:${ACTIONS}))*\\s*$`,
    "i"
  );
  let previous;
  do {
    previous = out;
    out = out.replace(trailing, "");
  } while (out !== previous && out.length);

  return out.replace(/\s*[-–—/:]\s*$/, "").trim();
}

/**
 * Parse one link-dump answer into { publisher, papers: [{ name, files }] }.
 *
 * Each <p> block is treated as one entry: the block's text is the label and
 * its (possibly repeated) href is the target. Entries that share a name are
 * merged, so a PDF block and an Audio block become one paper with two files.
 */
function parseLinkList(html) {
  if (!html) return [];

  const sections = [];
  let current = { publisher: "", entries: new Map() };
  sections.push(current);

  // Walk the markup block by block, starting a new section at each heading.
  const blocks = String(html).split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/i);

  for (const block of blocks) {
    if (!block || !block.trim()) continue;

    if (/^<h[1-6]/i.test(block)) {
      const publisher = toText(block);
      if (publisher) {
        current = { publisher, entries: new Map() };
        sections.push(current);
      }
      continue;
    }

    for (const para of block.split(/<\/p>|<br\s*\/?>/i)) {
      const hrefs = [...para.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
      if (!hrefs.length) continue;

      const text = toText(para);
      if (!text) continue;

      // Nested anchors repeat the same href; one entry is what we want.
      for (const href of [...new Set(hrefs)]) {
        const kind = fileKind(href);
        const name = cleanName(text) || cleanName(decodeURI(href.split("/").pop()));
        if (!name) continue;

        const key = name.toLowerCase();
        if (!current.entries.has(key)) current.entries.set(key, { name, files: [] });

        const entry = current.entries.get(key);
        if (!entry.files.some((f) => f.href === href)) {
          entry.files.push({
            label: kind,
            href,
            external: /^https?:\/\//i.test(href),
          });
        }
      }
    }
  }

  return sections
    .map((s) => ({ publisher: s.publisher, papers: [...s.entries.values()] }))
    .filter((s) => s.papers.length);
}

/**
 * The practice-exam pages, one per CEFR level.
 * `faqs` is the raw list from lib/content.
 */
function examLevels(faqs) {
  const byLevel = new Map();
  for (const f of faqs) {
    if (f.group !== "Model") continue;
    const level = String(f.question || "").trim().toUpperCase();
    if (!LEVELS.includes(level)) continue;
    byLevel.set(level, parseLinkList(f.answer));
  }

  return LEVELS.filter((l) => byLevel.has(l)).map((level) => {
    const sections = byLevel.get(level);
    // Flatten, but keep the publisher visible in the paper name.
    const papers = [];
    for (const s of sections) {
      for (const p of s.papers) {
        papers.push({ ...p, publisher: s.publisher });
      }
    }
    return { level, sections, papers };
  });
}

/** The study-material page: one block per topic. */
function resourceGroups(faqs) {
  return faqs
    .filter((f) => f.group === "Resources")
    .map((f) => ({ title: f.question, sections: parseLinkList(f.answer) }))
    .filter((g) => g.sections.length);
}

module.exports = { parseLinkList, examLevels, resourceGroups, LEVELS };
