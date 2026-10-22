// ─────────────────────────────────────────────────────────────────────
//  Minimal, dependency-free reader for phpMyAdmin / mysqldump files.
//
//  It pulls the rows back out of `INSERT INTO ... VALUES (...),(...);`
//  statements and hands them back as plain objects keyed by column name.
//  Only what we need to lift the old CodeIgniter content across — this is
//  not a general-purpose SQL parser.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");

// MySQL escapes strings with backslashes, so "\n" in the file is a real
// newline in the data and \' is a literal quote.
const ESCAPES = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
  "\\": "\\",
  "'": "'",
  '"': '"',
};

/** Read one quoted string starting at `i` (which points at the opening quote). */
function readString(sql, i) {
  const quote = sql[i];
  let out = "";
  i++;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "\\") {
      const next = sql[i + 1];
      out += next in ESCAPES ? ESCAPES[next] : next;
      i += 2;
      continue;
    }
    // A doubled quote inside a string is an escaped quote.
    if (ch === quote) {
      if (sql[i + 1] === quote) {
        out += quote;
        i += 2;
        continue;
      }
      return [out, i + 1];
    }
    out += ch;
    i++;
  }
  throw new Error("Unterminated string in dump");
}

/** Read one `( ... )` tuple starting at `i` (which points at the paren). */
function readTuple(sql, i) {
  const values = [];
  let buf = "";
  let quoted = false;
  i++; // step past "("

  const flush = () => {
    if (!quoted) {
      const raw = buf.trim();
      values.push(raw.toUpperCase() === "NULL" || raw === "" ? null : raw);
    }
    buf = "";
    quoted = false;
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'" || ch === '"') {
      const [str, next] = readString(sql, i);
      values.push(str);
      quoted = true;
      i = next;
      continue;
    }
    if (ch === ",") {
      flush();
      i++;
      continue;
    }
    if (ch === ")") {
      flush();
      return [values, i + 1];
    }
    buf += ch;
    i++;
  }
  throw new Error("Unterminated tuple in dump");
}

/**
 * Extract every row of `table` from the dump.
 * Returns an array of objects keyed by the dump's own column names.
 */
function extractTable(sql, table) {
  const header = new RegExp(
    "INSERT\\s+INTO\\s+`" + table + "`\\s*\\(([^)]*)\\)\\s*VALUES",
    "gi"
  );
  const rows = [];
  let m;

  while ((m = header.exec(sql)) !== null) {
    const columns = m[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    let i = m.index + m[0].length;

    // Walk the tuple list until the statement's closing semicolon.
    while (i < sql.length) {
      while (i < sql.length && /[\s,]/.test(sql[i])) i++;
      if (sql[i] !== "(") break;

      const [values, next] = readTuple(sql, i);
      i = next;

      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx] === undefined ? null : values[idx];
      });
      rows.push(row);

      while (i < sql.length && /\s/.test(sql[i])) i++;
      if (sql[i] === ";") {
        i++;
        break;
      }
    }
    header.lastIndex = i;
  }
  return rows;
}

/** Convenience: read the dump once, then pull several tables out of it. */
function readDump(dumpPath) {
  const sql = fs.readFileSync(dumpPath, "utf8");
  return { sql, table: (name) => extractTable(sql, name) };
}

module.exports = { extractTable, readDump };
