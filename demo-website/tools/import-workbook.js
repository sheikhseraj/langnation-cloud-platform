/* The tests and tools run in UTC, because the server does. */
process.env.TZ = "UTC";

// ─────────────────────────────────────────────────────────────────────
//  Turn a LangNation grammar workbook (.docx) into exercise sources.
//
//      node tools/import-workbook.js <file.docx> [--out dir]
//
//  The workbooks are laid out to a fixed pattern — chapter, rule,
//  examples, Übung A, Übung B, and one Lösungen table per chapter at
//  the back — and this reads that pattern. It reads ONLY that pattern.
//
//  ── What it will not do ─────────────────────────────────────────────
//
//  It never writes an answer. Every answer here comes out of the
//  Lösungen table in the document; a question whose answer cannot be
//  found, or whose answer does not fit the gaps in the sentence, is
//  REPORTED AND LEFT OUT. There is no fallback that guesses, because a
//  guessed answer in a piece of homework marks a student wrong for
//  being right, and nobody would ever find out why.
//
//  Übung B is deliberately not imported. Those are transformation
//  tasks — "Aktiv → Passiv", "Beginne mit dem Ort" — and the workbook
//  says so itself: „Freie Aufgaben haben bewusst mehrere mögliche
//  Lösungen." A single model answer marked as THE answer would fail a
//  student who wrote a different correct sentence. The count is
//  printed so nobody imagines those tasks were imported.
//
//  ── Reading a .docx without a library ───────────────────────────────
//
//  A .docx is a zip of XML. Node has inflateRaw, which is the whole of
//  what a stored-or-deflated zip entry needs, so the reader below is
//  thirty lines and the project gains no dependency. It reads the
//  central directory rather than scanning for local headers, because a
//  local header can lie about the size when a data descriptor is used.
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
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);

    if (name === want) {
      // The local header's own name and extra lengths, which need not
      // match the central directory's.
      const lNameLen = buf.readUInt16LE(localAt + 26);
      const lExtraLen = buf.readUInt16LE(localAt + 28);
      const from = localAt + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(from, from + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${want} not found in ${path.basename(file)}`);
}

/* ── The document, as ordered blocks ─────────────────────────────── */

const unescape = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

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

function blocks(file) {
  const xml = unzip(file, "word/document.xml").toString("utf8");
  const body = xml.split("<w:body>")[1].split("</w:body>")[0];
  const out = [];
  const re = /(<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>)/g;
  let m;
  while ((m = re.exec(body))) {
    const chunk = m[1];
    if (chunk.startsWith("<w:tbl>")) {
      const rows = (chunk.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []).map((r) =>
        (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(textOf)
      );
      out.push({ kind: "table", rows });
    } else {
      const style = (chunk.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
      out.push({ kind: "p", text: textOf(chunk), style });
    }
  }
  return out;
}

/* ── Reading the pattern ─────────────────────────────────────────── */

const CHAPTER = /^(A1|A2|B1|B2|C1|C2)\s*·\s*KAPITEL\s*(\d+)/i;
const UEBUNG = /^Übung\s+([AB])\b\s*·?\s*(.*)$/i;
const NUMBERED = /^(\d+)\.\s*(.+)$/;
const ANSWER_KEY = /^([AB])(\d+)\s*:\s*(.+)$/;
const GAPS = /_{2,}/g;

function read(file) {
  const bl = blocks(file);

  const chapters = [];       // { level, no, title, lead, questions: [] }
  const answers = new Map(); // "01" -> Map("A1" -> "bin")

  let ch = null;
  let uebung = null;
  let lead = "";
  let inSolutions = false;
  let solChapter = null;

  for (const b of bl) {
    if (b.kind === "p" && /^LÖSUNGEN$/i.test(b.text)) { inSolutions = true; ch = null; continue; }

    if (inSolutions) {
      if (b.kind === "p") {
        const m = b.text.match(/^Kapitel\s*(\d+)\s*·/i);
        if (m) { solChapter = m[1].padStart(2, "0"); answers.set(solChapter, new Map()); }
        continue;
      }
      if (b.kind === "table" && solChapter) {
        const into = answers.get(solChapter);
        for (const row of b.rows) {
          for (const cell of row) {
            const m = cell.match(ANSWER_KEY);
            if (m) into.set(m[1].toUpperCase() + Number(m[2]), m[3].trim());
          }
        }
      }
      continue;
    }

    if (b.kind !== "p" || !b.text) continue;

    const c = b.text.match(CHAPTER);
    if (c) {
      ch = { level: c[1].toUpperCase(), no: c[2].padStart(2, "0"), title: "", lead: "", questions: [] };
      chapters.push(ch);
      uebung = null;
      continue;
    }
    if (!ch) continue;

    if (b.style === "Heading1" && !ch.title) { ch.title = b.text; continue; }

    if (b.style === "ExerciseTitle") {
      const u = b.text.match(UEBUNG);
      uebung = u ? u[1].toUpperCase() : null;
      lead = "";
      continue;
    }

    if (b.style === "SmallText") { if (uebung) lead = b.text; else if (!ch.lead) ch.lead = b.text; continue; }

    const q = b.text.match(NUMBERED);
    if (q && uebung) {
      ch.questions.push({ uebung, n: Number(q[1]), text: q[2].trim(), lead });
    }
  }

  return { chapters, answers };
}

/* ── Turning one chapter into an exercise source ─────────────────── */

function convert(ch, keys, report) {
  const lines = [];
  lines.push(`# ${ch.level} · Kapitel ${ch.no} — ${ch.title}`);

  const a = ch.questions.filter((q) => q.uebung === "A");
  if (a.length && a[0].lead) lines.push(`# ${a[0].lead}`);

  let made = 0;

  for (const q of a) {
    const key = keys ? keys.get("A" + q.n) : null;
    if (!key) {
      report.skip(ch, q, "no answer for it in the Lösungen table");
      continue;
    }

    // The sentence has to have somewhere to type. A question with no
    // gap is a transformation task — "Ordne: heute / ich / arbeite" —
    // and those are not auto-markable. See the note at the top.
    const gaps = (q.text.match(GAPS) || []).length;
    if (!gaps) {
      report.skip(ch, q, "no gap in the sentence — it is a rewrite task, not a fill-in");
      continue;
    }

    /* " / " separates one gap's answer from the next.

       A space does not, usually: "verschoben worden" is one answer of
       two words for one gap. But the workbook is not consistent — the
       reflexive chapter writes two gaps as "interessiere mich" with a
       space, and the Plusquamperfekt one as "gefrühstückt hatten".

       So a space is tried only when the slash gives the wrong number
       of parts AND the words give exactly the right number. That is
       reading the same answer with a different separator, not guessing
       at one: three words for two gaps is still reported and left out,
       because which two of the three go where is not something this
       can know. Every question read this way is counted, so they can
       be spot-checked against the book. */
    let parts = key.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    let bySpace = false;
    if (parts.length !== gaps && parts.length === 1) {
      const words = key.split(/\s+/).filter(Boolean);
      if (words.length === gaps) { parts = words; bySpace = true; }
    }
    if (parts.length !== gaps) {
      report.skip(
        ch, q,
        `the sentence has ${gaps} gap(s) and the answer "${key}" has ${parts.length} part(s)`
      );
      continue;
    }
    if (bySpace) report.spaced(ch, q, key);

    /* A capital that is only there because the sentence starts here.

       „___ er müde ist, arbeitet er weiter." has the answer „Obwohl",
       capitalised for position and nothing else — and the marking
       rules test capitals whenever the expected answer has one,
       because a noun without its capital is wrong. Left alone, a
       student who types „obwohl" is marked wrong for punctuation.

       So where the gap opens the sentence, both cases are accepted:
       the book's form stays first, so it is what the student is shown
       as the right answer, and the lower-case form is accepted beside
       it.

       This is NOT applied blindly. Kapitel 41 is about nominalisation
       — „___ macht mir Spaß. (kochen)" answers „Kochen", and there the
       capital IS the grammar being tested. Those are left strict and
       every one of them is listed, because the distinction is a
       teaching judgement and not something this can read off a page. */
    const NOMINAL = /nominalisierung|nomen/i;
    const strict = NOMINAL.test(ch.title);
    parts = parts.map(function (ans, gapNo) {
      const first = gapNo === 0 && /^\s*_{2,}/.test(q.text);
      if (!first || strict) return ans;
      const lower = ans.charAt(0).toLowerCase() + ans.slice(1);
      if (lower === ans) return ans;           // already lower case
      report.eitherCase(ch, q, ans);
      return ans + "|" + lower;
    });
    if (strict && /^\s*_{2,}/.test(q.text) && /^[A-ZÄÖÜ]/.test(parts[0] || "")) {
      report.strictCase(ch, q, parts[0]);
    }

    lines.push("");
    lines.push(q.text.replace(GAPS, "___"));
    for (const p of parts) lines.push(`= ${p}`);
    made++;
  }

  return { source: lines.join("\n"), made, of: a.length };
}

/* ── Run it ──────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outAt = args.indexOf("--out");
const outDir = outAt !== -1 ? args[outAt + 1] : null;

if (!file) {
  console.error("usage: node tools/import-workbook.js <file.docx> [--out dir]");
  process.exit(2);
}

const { chapters, answers } = read(file);

const skipped = [];
const spaced = [];
const eased = [];
const strictly = [];
const report = {
  skip(ch, q, why) {
    skipped.push(`${ch.level} K${ch.no} A${q.n}: ${why}\n      ${q.text}`);
  },
  spaced(ch, q, key) {
    spaced.push(`${ch.level} K${ch.no} A${q.n}: "${key}" read as ${q.text.match(GAPS).length} answers`);
  },
  eitherCase(ch, q, ans) {
    eased.push(`${ch.level} K${ch.no} A${q.n}: "${ans}" — lower case also accepted (${ch.title})`);
  },
  strictCase(ch, q, ans) {
    strictly.push(`${ch.level} K${ch.no} A${q.n}: "${ans}" — capital REQUIRED (${ch.title})`);
  },
};

let totalMade = 0;
let totalA = 0;
let totalB = 0;
const done = [];

for (const ch of chapters) {
  totalB += ch.questions.filter((q) => q.uebung === "B").length;
  const keys = answers.get(ch.no);
  if (!keys) {
    console.log(`  ! Kapitel ${ch.no} has no Lösungen table — every question in it is left out`);
    totalA += ch.questions.filter((q) => q.uebung === "A").length;
    continue;
  }
  const res = convert(ch, keys, report);
  totalMade += res.made;
  totalA += res.of;
  if (res.made) done.push({ ch, source: res.source, made: res.made });
}

console.log(`\n${path.basename(file)}`);
console.log(`  ${chapters.length} chapters read`);
console.log(`  Übung A: ${totalMade} of ${totalA} questions converted`);
console.log(`  Übung B: ${totalB} questions NOT converted — transformation tasks,`);
console.log(`           which the workbook itself says have several right answers.`);

if (eased.length) {
  console.log(`\n  ${eased.length} answer(s) start the sentence, so the capital is position`);
  console.log("  rather than grammar and both cases are accepted:");
  for (const t of eased) console.log("    - " + t);
}

if (strictly.length) {
  console.log(`\n  ${strictly.length} answer(s) left STRICT about the capital, because the`);
  console.log("  chapter is about nominalisation and the capital is the lesson:");
  for (const t of strictly) console.log("    - " + t);
}

if (spaced.length) {
  console.log(`\n  ${spaced.length} answer(s) split on a space rather than a slash,`);
  console.log("  because the slash gave the wrong number of parts. Worth a look:");
  for (const t of spaced) console.log("    - " + t);
}

if (skipped.length) {
  console.log(`\n  ${skipped.length} question(s) left out, each for a stated reason:`);
  for (const s of skipped) console.log("    - " + s);
}

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const d of done) {
    const name = `${d.ch.level}-${d.ch.no}-${slug(d.ch.title)}.txt`;
    fs.writeFileSync(path.join(outDir, name), d.source + "\n", "utf8");
  }
  console.log(`\n  ${done.length} exercise file(s) written to ${outDir}`);
} else {
  console.log("\n  (nothing written — pass --out <dir> to save the exercise sources)");
}

function slug(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
