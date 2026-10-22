/* The tools and tests run in UTC, because the server does. */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Turn one LangNation chapter worksheet (.docx) into an exercise source.
//
//      node tools/import-chapter.js <9_Negation_Übung.docx> [--out dir]
//
//  The school's newer material is one document per chapter rather than
//  one book, and it is laid out to a fixed pattern:
//
//      KAPITEL 9: Übung
//      Negation
//      Übungen                        (Heading 1)
//        Übung 1 – nicht oder kein?   (Heading 2)
//        <the instruction>
//        <one numbered item per paragraph>
//        Übung 2 – …
//      Lesetext – …                   (Heading 1)
//      Lösungen                       (Heading 1)
//        Übung 1: kein; nicht; keinen; …
//
//  This reads that pattern and only that pattern. A document laid out
//  differently comes back with nothing converted and says so, which is
//  the right failure: silently importing half a chapter is worse than
//  importing none of it.
//
//  ── What it will not do ─────────────────────────────────────────────
//
//  It never writes an answer. Every answer comes from the Lösungen
//  section, matched to its item BY POSITION, and anything that does not
//  line up is reported and left out:
//
//    · an item with no gap in it — "Korrigiere." and "Setze nicht an
//      eine natürliche Stelle" are rewriting tasks, and the model
//      answer in the key is one of several right ones. Marking a
//      student wrong for writing a different correct sentence is the
//      one failure this whole format exists to avoid.
//    · an Übung whose answer count does not match its item count,
//      which means the key and the questions have drifted apart and
//      NOTHING in that Übung can be trusted to line up.
//    · an answer offering alternatives ("x / y") or spanning more than
//      one gap ("keinen … mehr") where the sentence has one.
//
//  ── The one thing it rewrites, and why that is not guessing ─────────
//
//  A key sometimes repeats the word after the gap for readability:
//
//      Er spricht mit ___ Kolleginnen.   →   "keinen Kolleginnen"
//
//  Where the answer ENDS with the exact text that already follows the
//  gap, that tail is dropped. It is a string comparison against the
//  sentence, not an opinion about German, and the run prints every one
//  it did so you can read them back.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ── The smallest zip reader that works ──────────────────────────── */

function unzip(file, want) {
  const buf = fs.readFileSync(file);

  // End of central directory: signature 0x06054b50, within the last
  // 64KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("not a zip file");

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(at + 10);
    const compSize = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);

    if (name === want) {
      // The local header's own name and extra lengths, which are not
      // required to match the central directory's.
      const lnName = buf.readUInt16LE(local + 26);
      const lnExtra = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnName + lnExtra;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${want} inside the document`);
}

const unescape = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function textOf(chunk) {
  const out = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
  let m;
  while ((m = re.exec(chunk))) {
    if (m[1] === undefined) { out.push(" "); continue; }
    out.push(unescape(m[1]));
  }
  return out.join("").replace(/[ \t]+/g, " ").trim();
}

/** The document as a flat list of { text, style }, tables dropped. */
function paragraphs(file) {
  const xml = unzip(file, "word/document.xml").toString("utf8");
  const body = xml.split("<w:body>")[1].split("</w:body>")[0];
  const out = [];
  const re = /(<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>)/g;
  let m;
  while ((m = re.exec(body))) {
    const chunk = m[1];
    if (chunk.startsWith("<w:tbl>")) continue;
    const style = (chunk.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
    const text = textOf(chunk);
    if (text) out.push({ text, style });
  }
  return out;
}

/* ── Reading the pattern ─────────────────────────────────────────── */

const KAPITEL = /^KAPITEL\s+(\d+)\s*:/i;
const UEBUNG = /^Übung\s+(\d+)\s*[–—-]\s*(.*)$/i;
const ANSWERS = /^Übung\s+(\d+)\s*:\s*(.+)$/i;
const GAP = /_{3,}/;

/* A long rule is a line to write a whole sentence on, not a gap.
 *
 * The worksheets use three underscores for a cloze and twenty for
 * "→ ____________________". Both match the gap pattern, so without
 * this an Übung asking for four rewritten sentences looked like four
 * fill-ins whose key had gone missing — reported as a count mismatch,
 * which is the wrong reason and would have been the wrong fix. */
const WRITE_LINE = /_{8,}/;

/* A table of contents repeats every heading in the document, which
   would otherwise be read as a chapter of nothing but headings. Word
   styles them, so they are recognised rather than guessed at. */
const IS_TOC = (p) => /^TOC/i.test(p.style);

function read(file) {
  const ps = paragraphs(file).filter((p) => !IS_TOC(p));

  /* The title: "KAPITEL 9: Übung" and the topic on the line after it.
     Taken from the FIRST occurrence — the heading is repeated where
     the document has a title block as well as a body. */
  let number = null;
  let topic = "";
  for (let i = 0; i < ps.length; i++) {
    const m = KAPITEL.exec(ps[i].text);
    if (!m) continue;
    number = Number(m[1]);
    topic = (ps[i + 1] || {}).text || "";
    break;
  }

  const sections = [];      // { no, name, instruction, items[] }
  const keys = new Map();   // Übung number -> the raw answer line
  let current = null;
  let inAnswers = false;

  /* The reading text, and only the text. What follows it — mark the
     negation words, sort them, write eight sentences — is open work
     with no key in the document, so none of it becomes a question.
     The passage itself is worth carrying: it is the chapter's grammar
     in continuous prose, and a student reading it is the point of it
     being there. */
  let reading = null;       // { title, lines[] }
  let inReading = false;

  for (const p of ps) {
    const heading1 = /^Heading1$/i.test(p.style);

    if (heading1 && /^Lösung/i.test(p.text)) { inAnswers = true; current = null; continue; }
    /* Everything from the reading text onwards is open work — mark it,
       sort it, talk about it, write about it. None of it has a single
       right answer and none of it is imported. */
    if (heading1 && /^Lesetext/i.test(p.text)) {
      inAnswers = false;
      current = null;
      inReading = true;
      reading = { title: p.text.trim(), lines: [] };
      continue;
    }
    if (heading1) { current = null; inReading = false; continue; }

    /* The prose runs until the first Heading 2 under it, which is
       "Aufgaben zum Text" and the start of the open work. */
    if (inReading) {
      if (/^Heading2$/i.test(p.style)) { inReading = false; continue; }
      reading.lines.push(p.text);
      continue;
    }

    if (inAnswers) {
      const m = ANSWERS.exec(p.text);
      if (m) keys.set(Number(m[1]), m[2].trim().replace(/\.\s*$/, ""));
      continue;
    }

    const m = UEBUNG.exec(p.text);
    if (m) {
      current = { no: Number(m[1]), name: m[2].trim(), instruction: "", items: [] };
      sections.push(current);
      continue;
    }

    if (!current) continue;
    // The first paragraph under the heading is the instruction.
    if (!current.instruction) { current.instruction = p.text; continue; }
    current.items.push(p.text);
  }

  return { number, topic, sections, keys, reading };
}

/* ── Matching answers to gaps ────────────────────────────────────── */

/**
 * Split an answer line into one answer per item.
 *
 * Semicolons, because that is what the keys use between short answers.
 * Slashes separate whole rewritten sentences, and those belong to the
 * tasks this does not import — so a line split on slashes is left for
 * the caller to reject rather than carved up here.
 */
const splitKey = (line) => String(line).split(";").map((s) => s.trim()).filter(Boolean);

/**
 * The same line, when the answers are whole sentences.
 *
 * Those keys use " / " between them, because the sentences contain
 * commas and semicolons of their own. Split on the slash and nothing
 * else: splitting on both would cut a sentence in half at its first
 * comma and pair the halves with the wrong tasks.
 */
const splitModels = (line) => String(line).split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * What goes in the gap, given the sentence and the key's answer.
 *
 * Returns { answer } or { skip: why }. The only rewriting is dropping
 * a tail the sentence already contains; everything else is reported.
 */
function fit(sentence, raw) {
  const answer = String(raw).trim();
  if (!answer) return { skip: "no answer in the key" };

  /* An ellipsis means the answer spans more than one place in the
     sentence ("keinen … mehr") and the sentence has one gap. */
  if (/…|\.\.\./.test(answer)) return { skip: `the key spans two places: "${answer}"` };

  /* A slash in a short answer is the key offering alternatives, often
     with a note in brackets. Which one is meant is the teacher's call
     and not this program's. */
  if (/\//.test(answer)) return { skip: `the key gives alternatives: "${answer}"` };

  /* The key sometimes repeats the words after the gap. Compared as
     strings against the sentence, not inferred.
     The grammar hint goes first — "(Dat., Pl.)" is addressed to the
     student and is not part of the sentence, and leaving it on meant
     the comparison never matched anything. */
  const after = sentence.slice(sentence.search(GAP)).replace(GAP, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[.?!;,]+\s*$/, "").trim();
  if (after && answer.toLowerCase().endsWith(" " + after.toLowerCase())) {
    const trimmed = answer.slice(0, answer.length - after.length).trim();
    if (trimmed) return { answer: trimmed, trimmed: answer };
  }

  return { answer };
}

/* ── Writing it out ──────────────────────────────────────────────── */

function build(doc, picture) {
  const lines = [];
  const notes = [];
  let kept = 0;
  let open = 0;

  const pad = String(doc.number == null ? 0 : doc.number).padStart(2, "0");
  lines.push(`# Kapitel ${pad} — ${doc.topic}`);
  /* No chapter-wide instruction. Each Übung carries its own, which
     is what the worksheet does: "Ergänze die richtige Negation" is
     about Übung 1 and says the wrong thing over Übung 7. */

  /* Fenced, which is how the format marks a reading text: it is shown
     above the questions rather than treated as one. */
  for (const s of doc.sections) {
    const key = doc.keys.get(s.no);
    const label = `Übung ${s.no} – ${s.name}`;

    if (!key) { notes.push(`${label}: no answers in the Lösungen section — left out.`); continue; }

    /* A rewriting task: a line to write a sentence on, or no gap in
       any item. Several right answers, so it is not marked -- it goes
       in with the teacher's version behind a button instead.

       This used to be dropped, and dropping it was throwing away a
       third of the workbook. Marking it against the one model answer
       would have been worse: it fails a student who wrote different,
       correct German. */
    const writing = s.items.some((t) => WRITE_LINE.test(t));
    const gaps = s.items.filter((t) => GAP.test(t) && !WRITE_LINE.test(t));

    if (writing || !gaps.length) {
      const models = splitModels(key);
      if (models.length !== s.items.length) {
        notes.push(`${label}: ${s.items.length} tasks but ${models.length} model answers — left out rather than paired up wrongly.`);
        continue;
      }
      lines.push("");
      lines.push(`## ${label}`);
      if (s.instruction) lines.push(`# ${s.instruction}`);
      lines.push("");
      for (let i = 0; i < s.items.length; i++) {
        /* The writing rule comes off: it is a line to write on, and
           on screen there is a box under the task instead. */
        lines.push(s.items[i].replace(/\s*→?\s*_{8,}\s*$/, "").trim());
        lines.push(`~ ${models[i]}`);
        lines.push("");
        open++;
      }
      continue;
    }

    if (gaps.length !== s.items.length) {
      notes.push(`${label}: ${s.items.length} items but only ${gaps.length} have a gap — left out.`);
      continue;
    }

    const answers = splitKey(key);
    /* The count has to match exactly. One short and every answer after
       the missing one is attached to the wrong sentence, which is a
       worse outcome than importing nothing: it marks students wrong
       for being right and looks completely fine on the page. */
    if (answers.length !== s.items.length) {
      notes.push(`${label}: ${s.items.length} items but ${answers.length} answers — left out rather than lined up wrongly.`);
      continue;
    }

    lines.push("");
    lines.push(`## ${label}`);
    if (s.instruction) lines.push(`# ${s.instruction}`);
    lines.push("");

    for (let i = 0; i < s.items.length; i++) {
      const got = fit(s.items[i], answers[i]);
      if (got.skip) {
        notes.push(`${label}, item ${i + 1}: ${got.skip} — left out.`);
        continue;
      }
      if (got.trimmed) {
        notes.push(`${label}, item ${i + 1}: key says "${got.trimmed}", the gap takes "${got.answer}".`);
      }
      lines.push(s.items[i]);
      lines.push(`= ${got.answer}`);
      lines.push("");
      kept++;
    }
  }

  if (doc.reading && doc.reading.lines.length) {
    lines.push("");
    lines.push(`## ${doc.reading.title}`);
    lines.push("");
    lines.push("~~~");
    /* --image is the one thing not read out of the document. The
       pictures Word embeds are the school's letterhead as often as
       they are an illustration, and picking one by guesswork would
       put the eagle crest above a reading text. */
    if (picture) lines.push(`! ${picture}`);
    for (const l of doc.reading.lines) lines.push(l);
    lines.push("~~~");
    lines.push("");
    notes.push(`${doc.reading.title}: carried as reading${picture ? ", with its picture" : ""}. Its tasks have no answers in the Lösungen section, so none of them became questions.`);
  }


  return { source: lines.join("\n").trim() + "\n", notes, kept, open };
}

/* ── Run it ──────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt !== -1 ? args[outAt + 1] : null;
/* Everything that is not a flag or a flag's value. Guarded on the
   index being found: with no --out at all, outAt is -1 and
   "i !== outAt + 1" quietly discards argument zero, which is the
   file. */
const file = args.filter((a, i) =>
  a !== "--out" && a !== "--image" &&
  (args.indexOf("--out") === -1 || i !== args.indexOf("--out") + 1) &&
  (args.indexOf("--image") === -1 || i !== args.indexOf("--image") + 1))[0];

if (!file) {
  console.error("usage: node tools/import-chapter.js <chapter.docx> [--out content/homework/<book>] [--image /img/homework/x.webp]");
  process.exit(1);
}

const doc = read(file);
if (doc.number == null) {
  console.error('No "KAPITEL n:" heading found. This reads the school\'s chapter worksheets and nothing else.');
  process.exit(1);
}

/**
 * Where the illustration lives, as the page will ask for it.
 *
 * Git Bash rewrites an argument beginning with a slash into a Windows
 * path, so "--image /img/homework/x.webp" arrives as
 * "C:/Program Files/Git/img/homework/x.webp" and that is what went
 * into the file. Taking the string from "/img/" onwards undoes it,
 * and a value given without the leading slash is accepted too.
 */
const picAt = args.indexOf("--image");
const picture = (() => {
  if (picAt === -1) return null;
  const raw = String(args[picAt + 1] || "").trim();
  if (!raw) return null;
  const at = raw.indexOf("/img/");
  if (at > 0) return raw.slice(at);
  return raw.startsWith("/") ? raw : "/" + raw.replace(/^\.?\//, "");
})();

const { source, notes, kept, open } = build(doc, picture);

console.log(`\n  Kapitel ${doc.number} — ${doc.topic}`);
console.log(`  ${doc.sections.length} Übung(en), ${doc.keys.size} answer line(s)\n`);
for (const n of notes) console.log(`    · ${n}`);
console.log(`\n  ${kept} marked question(s), ${open} task(s) to write\n`);

if (!kept && !open) {
  console.error("  Nothing converted, so nothing written.");
  process.exit(1);
}

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const slug = String(doc.topic).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = `${String(doc.number).padStart(2, "0")}-${slug}.txt`;
  fs.writeFileSync(path.join(outDir, name), source, "utf8");
  console.log(`  written to ${path.join(outDir, name)}\n`);
} else {
  console.log(source);
  console.log("  (no --out, so nothing was written)\n");
}
