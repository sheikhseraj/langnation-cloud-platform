// Einbürgerungstest progress, against an account.
//
// The practice page works signed-out and keeps everything in the
// browser; that stays. This is for people who have an account and want
// their progress to outlive the device.
//
// Stored as one row of JSON per student, the same shape the browser
// holds, so syncing is a merge of two objects rather than a
// reconciliation of two tables.
//
// Merging matters more than it looks. Somebody practises on the train
// on a phone and at home on a laptop; last-write-wins would silently
// throw away a morning's work. So the two histories are combined
// question by question, taking the higher counts and trusting whichever
// side last actually answered.

"use strict";

const db = require("./db");

const MAX_EXAMS = 50;        // enough for a long history, bounded
const MAX_JSON = 400 * 1024; // a full history is ~40KB; this is a ceiling

function parse(value, fallback) {
  if (!value) return fallback;
  try {
    const out = JSON.parse(value);
    return out && typeof out === "object" ? out : fallback;
  } catch {
    return fallback;
  }
}

const blank = () => ({
  bundesland: null,
  examDate: null,
  history: {},
  saved: [],
  exams: [],
  updatedAt: null,
});

/** One student's progress, or an empty record. */
async function read(studentId) {
  if (!db.isEnabled()) return blank();
  try {
    const row = await db.queryOne(
      "SELECT * FROM et_progress WHERE student_id = ?",
      [Number(studentId)]
    );
    if (!row) return blank();
    return {
      bundesland: row.bundesland || null,
      examDate: row.exam_date ? new Date(row.exam_date).toISOString().slice(0, 10) : null,
      history: parse(row.history, {}),
      saved: Array.isArray(parse(row.saved, [])) ? parse(row.saved, []) : [],
      exams: Array.isArray(parse(row.exams, [])) ? parse(row.exams, []) : [],
      updatedAt: row.updated_at || null,
    };
  } catch (e) {
    console.error("Einbürgerungstest progress could not be read:", e.message);
    return blank();
  }
}

/**
 * Combine two histories without losing either.
 *
 * Counts are summed rather than maxed: two devices that each answered
 * a question twice really did answer it four times. `lastWrong` comes
 * from whichever side has the higher `seen`, because that is the one
 * that answered more recently; a tie keeps the incoming value, since
 * it is the side that just did something.
 */
function mergeHistory(mine, theirs) {
  const out = {};
  const ids = new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})]);

  for (const id of ids) {
    const a = (mine || {})[id];
    const b = (theirs || {})[id];
    if (!a) { out[id] = b; continue; }
    if (!b) { out[id] = a; continue; }

    const aSeen = Number(a.seen) || 0;
    const bSeen = Number(b.seen) || 0;
    out[id] = {
      right: (Number(a.right) || 0) + (Number(b.right) || 0),
      wrong: (Number(a.wrong) || 0) + (Number(b.wrong) || 0),
      seen: aSeen + bSeen,
      lastWrong: bSeen >= aSeen ? !!b.lastWrong : !!a.lastWrong,
    };
  }
  return out;
}

/** Two lists of bookmarks, without duplicates. */
function mergeSaved(mine, theirs) {
  return [...new Set([...(mine || []), ...(theirs || [])])].filter(
    (x) => typeof x === "string"
  );
}

/** Exam attempts from both sides, newest first, de-duplicated by date. */
function mergeExams(mine, theirs) {
  const all = [...(mine || []), ...(theirs || [])].filter(
    (e) => e && typeof e.correct === "number"
  );
  const seen = new Set();
  return all
    .filter((e) => {
      const key = String(e.date) + ":" + e.correct + ":" + e.total;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, MAX_EXAMS);
}

/**
 * Merge an incoming snapshot into what is stored, and return the
 * result so the browser can adopt it.
 *
 * The incoming side wins only on the two fields a person sets by hand
 * — their Bundesland and their exam date — and only when it actually
 * says something. Everything else is combined.
 */
async function sync(studentId, incoming) {
  if (!db.isEnabled()) return { ok: false, reason: "Die Datenbank ist nicht erreichbar." };

  const given = incoming && typeof incoming === "object" ? incoming : {};
  const current = await read(studentId);

  const merged = {
    bundesland: given.bundesland || current.bundesland || null,
    examDate: given.examDate !== undefined
      ? (given.examDate || null)
      : current.examDate,
    history: mergeHistory(current.history, given.history || {}),
    saved: mergeSaved(current.saved, given.saved || []),
    exams: mergeExams(current.exams, given.exams || []),
  };

  const historyJson = JSON.stringify(merged.history);
  if (historyJson.length > MAX_JSON) {
    return { ok: false, reason: "Der Lernfortschritt ist zu groß zum Speichern." };
  }

  try {
    await db.query(
      `INSERT INTO et_progress
         (student_id, bundesland, exam_date, history, saved, exams)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bundesland = VALUES(bundesland),
         exam_date  = VALUES(exam_date),
         history    = VALUES(history),
         saved      = VALUES(saved),
         exams      = VALUES(exams)`,
      [
        Number(studentId),
        merged.bundesland,
        merged.examDate,
        historyJson,
        JSON.stringify(merged.saved),
        JSON.stringify(merged.exams),
      ]
    );
  } catch (e) {
    console.error("Einbürgerungstest progress could not be saved:", e.message);
    return { ok: false, reason: "Der Fortschritt konnte nicht gespeichert werden." };
  }

  return { ok: true, progress: merged };
}

/** Set or clear the exam date on its own. */
async function setExamDate(studentId, date) {
  if (!db.isEnabled()) return { ok: false, reason: "Die Datenbank ist nicht erreichbar." };

  // One value, whatever the form sent.
  //
  // A body key can arrive as an array when two controls share a name,
  // and a regex tested against an array tests its join — "2026-09-30,"
  // matches nothing and reads as a malformed date rather than as the
  // two values it is. Taking the last is what a browser means by a
  // repeated field: the one submitted latest wins.
  const raw = Array.isArray(date) ? date[date.length - 1] : date;
  const value = typeof raw === "string" ? raw.trim() : raw ? String(raw) : "";

  const clean = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (value && !clean) return { ok: false, reason: "Bitte ein gültiges Datum wählen." };

  // A date in the past is almost always a typo, and a countdown of
  // "-40 days" helps nobody.
  if (clean) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(clean) < today) {
      return { ok: false, reason: "Das Prüfungsdatum liegt in der Vergangenheit." };
    }
  }

  try {
    await db.query(
      `INSERT INTO et_progress (student_id, exam_date) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE exam_date = VALUES(exam_date)`,
      [Number(studentId), clean]
    );
  } catch (e) {
    console.error("Exam date could not be saved:", e.message);
    return { ok: false, reason: "Das Datum konnte nicht gespeichert werden." };
  }
  return { ok: true, examDate: clean };
}

module.exports = { read, sync, setExamDate, mergeHistory, mergeSaved, mergeExams, blank };
