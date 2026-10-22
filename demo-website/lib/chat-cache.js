// ─────────────────────────────────────────────────────────────────────
//  Answering from what has already been answered.
//
//  A language school gets asked the same dozen things. Sending every one
//  of them to an API is money spent recomputing an answer nobody has
//  changed, and it is slower than reading a row.
//
//  ── What is matched, and what deliberately is not ───────────────────
//
//  The question is normalised — case, punctuation and filler words
//  removed — and looked up by a hash of that. Miss, and near-matches are
//  scored against the most-asked rows.
//
//  The bar for a near-match is high on purpose. A cache that answers a
//  DIFFERENT question is worse than no cache: nobody can tell it has
//  happened, the visitor is confidently told the wrong thing, and the
//  office never finds out. An API call costs a fraction of a cent, so
//  anything uncertain goes to the model.
//
//  Only first questions are cached. A follow-up — "and how much is
//  that?" — means nothing without the turn before it, and storing it
//  would hand the next person an answer to a conversation they never
//  had.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const crypto = require("crypto");
const db = require("./db");

/** Whether migration 32 has run. Everything here is off until it has. */
const ready = () => db.hasColumn("chat_answers.norm_hash");

/* Words that carry no meaning in a question and only get in the way of
   matching one. Deliberately short: strip too much and "what is a1"
   and "what is b1" become the same question. Numbers and level codes
   are never touched. */
const FILLER = new Set([
  "a", "an", "the", "is", "are", "do", "does", "did", "can", "could",
  "would", "will", "i", "you", "we", "me", "my", "your", "please",
  "hi", "hello", "hey", "tell", "about", "there", "to", "of", "for",
  "und", "der", "die", "das", "ein", "eine", "ich", "du", "sie", "bitte",
  "ist", "sind", "kann", "koennen", "können", "mir", "mich",
]);

/**
 * A question reduced to what it is asking.
 *
 * Lower-cased, punctuation gone, filler gone, words in their original
 * order. German umlauts are folded so "fuer" and "für" agree.
 */
function normalise(text) {
  const words = String(text == null ? "" : text)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  return words.join(" ").slice(0, 500);
}

const hash = (norm) => crypto.createHash("sha256").update(norm, "utf8").digest("hex");

/** How alike two normalised questions are, 0 to 1. */
function overlap(a, b) {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((w) => { if (right.has(w)) shared += 1; });
  return shared / (left.size + right.size - shared);
}

/* Both have to hold for a near-match to be used.
 *
 * NEAR alone lets "what does a1 cost" match "what does b1 cost" once
 * the filler is gone — two words of three shared is 0.5, and a school
 * telling somebody the wrong course's price is the whole problem. The
 * second rule is that nothing may be MISSING from the stored question
 * that the visitor asked about, which is what keeps a level, a number or
 * a course name from being quietly dropped. */
const NEAR = 0.84;
const SCAN = 300;

/**
 * An answer already given to this question, or null.
 *
 * Never throws. A cache that takes the page down is worse than no cache,
 * and a miss costs an API call rather than an error.
 */
async function find(question, lang = "en") {
  if (!ready() || !db.isEnabled()) return null;
  const norm = normalise(question);
  if (!norm) return null;
  const l = lang === "de" ? "de" : "en";

  try {
    const exact = await db.queryOne(
      "SELECT id, answer FROM chat_answers WHERE lang = ? AND norm_hash = ? LIMIT 1",
      [l, hash(norm)]
    );
    if (exact) {
      await touch(exact.id);
      return { answer: exact.answer, how: "exact" };
    }

    const rows = await db.query(
      `SELECT id, norm, answer FROM chat_answers
        WHERE lang = ? ORDER BY hits DESC LIMIT ${SCAN}`,
      [l]
    );

    const asked = new Set(norm.split(" ").filter(Boolean));
    let best = null;
    for (const row of rows || []) {
      const score = overlap(norm, String(row.norm || ""));
      if (score < NEAR) continue;
      // Nothing the visitor asked about may be missing from the stored
      // question: that is what stops a1 matching b1.
      const stored = new Set(String(row.norm || "").split(" ").filter(Boolean));
      let complete = true;
      asked.forEach((w) => { if (!stored.has(w)) complete = false; });
      if (!complete) continue;
      if (!best || score > best.score) best = { score, row };
    }

    if (best) {
      await touch(best.row.id);
      return { answer: best.row.answer, how: "near" };
    }
  } catch (e) {
    console.error("Chat cache lookup failed:", e.message);
  }
  return null;
}

async function touch(id) {
  try {
    await db.query(
      "UPDATE chat_answers SET hits = hits + 1, last_used_at = NOW() WHERE id = ?",
      [id]
    );
  } catch (e) {
    /* A counter that did not increment is not worth an error. */
  }
}

/**
 * Write down an answer so the next person does not cost an API call.
 *
 * ON DUPLICATE KEY rather than a check-then-insert: two visitors can ask
 * the same new question in the same second, and the second insert should
 * be a no-op rather than an error in the log.
 */
async function remember(question, answer, lang = "en") {
  if (!ready() || !db.isEnabled()) return { ok: false };
  const norm = normalise(question);
  const text = String(answer || "").trim();
  if (!norm || !text) return { ok: false };

  try {
    await db.query(
      `INSERT INTO chat_answers (lang, question, norm, norm_hash, answer)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hits = hits + 1, last_used_at = NOW()`,
      [
        lang === "de" ? "de" : "en",
        String(question).slice(0, 500),
        norm,
        hash(norm),
        text,
      ]
    );
    return { ok: true };
  } catch (e) {
    console.error("Chat cache write failed:", e.message);
    return { ok: false };
  }
}

/** Everything learned so far, for the office to read and prune. */
async function list({ limit = 100 } = {}) {
  if (!ready() || !db.isEnabled()) return [];
  const n = Math.min(500, Math.max(1, Math.round(Number(limit) || 100)));
  try {
    return await db.query(
      `SELECT id, lang, question, answer, hits, created_at, last_used_at
         FROM chat_answers ORDER BY hits DESC, last_used_at DESC LIMIT ${n}`
    );
  } catch (e) {
    console.error("Chat cache list failed:", e.message);
    return [];
  }
}

/** Forget one answer, when it is wrong or out of date. */
async function forget(id) {
  if (!ready() || !db.isEnabled()) return false;
  try {
    await db.query("DELETE FROM chat_answers WHERE id = ?", [Number(id) || 0]);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { find, remember, list, forget, normalise, overlap, ready, NEAR };
