// ─────────────────────────────────────────────────────────────────────
//  Copy the downloadable exam papers and study PDFs out of the old site.
//
//    node tools/copy-downloads.js
//    node tools/copy-downloads.js --from <path-to-old-assets> --dry
//
//  These are the files behind the 61 download links in the migrated FAQ,
//  Model and Resources content. They are NOT in git — 400 MB of MP3 has
//  no business in a repository — so this script puts them in place
//  locally, and DEPLOYMENT.md covers uploading them to Hostinger once.
//
//  Skips the .zip bundles: A2.zip and B2.zip are 315 MB between them and
//  contain the same PDFs and MP3s that sit beside them as loose files.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const FROM = arg("--from", "D:/Project_All/langnation-22-01-2025/assets");
const TO = path.join(__dirname, "..", "public", "downloads");
const DRY = process.argv.includes("--dry");

// question-papper — telc/Goethe practice exams (PDF + listening audio)
// Resources      — vocabulary and speaking PDFs
// Mix            — the "Exam Pattern" one-pagers linked from course pages
const FOLDERS = ["question-papper", "Resources", "Mix"];
const SKIP_EXT = new Set([".zip"]);

let copied = 0;
let skipped = 0;
let bytes = 0;
let skippedBytes = 0;

function walk(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      walk(from, to);
      continue;
    }

    const size = fs.statSync(from).size;

    if (SKIP_EXT.has(path.extname(entry.name).toLowerCase())) {
      skipped++;
      skippedBytes += size;
      console.log(`  skip  ${entry.name}  (${(size / 1024 / 1024).toFixed(0)} MB — duplicate archive)`);
      continue;
    }

    // Already there and the same size? Leave it alone, so re-runs are cheap.
    if (fs.existsSync(to) && fs.statSync(to).size === size) {
      copied++;
      bytes += size;
      continue;
    }

    if (!DRY) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
    copied++;
    bytes += size;
    console.log(`  copy  ${path.relative(TO, to)}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

console.log(DRY ? "Dry run — nothing will be written.\n" : `Copying into ${TO}\n`);

let missing = 0;
for (const folder of FOLDERS) {
  const src = path.join(FROM, folder);
  if (!fs.existsSync(src)) {
    console.log(`  !  ${folder} not found under ${FROM}`);
    missing++;
    continue;
  }
  walk(src, path.join(TO, folder));
}

const mb = (b) => (b / 1024 / 1024).toFixed(0);
console.log(`
─────────────────────────────────────────────
  Files in place   ${copied}   (${mb(bytes)} MB)
  Archives skipped ${skipped}   (${mb(skippedBytes)} MB not copied)
─────────────────────────────────────────────`);

if (missing) {
  console.log(`\n  ${missing} source folder(s) missing — pass --from <path to the old assets folder>.`);
  process.exit(1);
}

console.log(`
  These files are excluded from git on purpose. To put them on the
  server, upload public/downloads/ once via hPanel File Manager or FTP.
  See DEPLOYMENT.md step 3a.
`);
