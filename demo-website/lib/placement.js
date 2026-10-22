// ─────────────────────────────────────────────────────────────────────
//  Automated CEFR placement test.
//
//  The old site's test was free-text with no answer key — a teacher read
//  every submission and replied with a level by hand. This one marks
//  itself and returns the level immediately.
//
//  Three things matter about how it is built:
//
//  1. THE ANSWER KEY NEVER LEAVES THE SERVER. `createPaper()` returns
//     prompts and options only; marking happens in `gradePaper()`.
//     Otherwise anyone could read the answers from the page source.
//
//  2. EVERY ATTEMPT IS DIFFERENT. Questions are drawn at random from a
//     larger pool per level, the order is shuffled, and so are the four
//     options. Sitting it twice gives a different paper.
//
//  3. THE PAPER IS SIGNED. Because the selection is random, the server
//     has to know which paper this person actually saw in order to mark
//     it. Rather than keep server-side session state, the paper — the
//     question ids and each one's option order — is encoded into a token
//     that is HMAC-signed and carried in the form. Tampering with it
//     invalidates the signature, and it cannot be read as an answer key
//     because it holds no answers, only the shuffle.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { env } = require("./env");

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Splitting the test in two means a beginner never has to sit twenty
// questions of C1 grammar just to be told they are A2.
const TRACKS = {
  "a1-b1": { id: "a1-b1", levels: ["A1", "A2", "B1"], from: "A1", to: "B1" },
  "b2-c2": { id: "b2-c2", levels: ["B2", "C1", "C2"], from: "B2", to: "C2" },
};

// How many questions per level appear on one paper, drawn from the pool.
const PER_LEVEL = Number(env("PLACEMENT_PER_LEVEL", 7));

// Papers are signed so they cannot be edited in the browser. Falls back to
// a per-boot random key, which only means a test left open across a server
// restart has to be started again.
const SECRET = env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");

function load() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "content", "placement-questions.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      threshold: Number(parsed._threshold) || 0.7,
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      passages: Array.isArray(parsed.passages) ? parsed.passages : [],
    };
  } catch {
    return { threshold: 0.7, questions: [], passages: [] };
  }
}

const BANK = load();
const BY_ID = new Map(BANK.questions.map((q) => [q.id, q]));
const PASSAGE_BY_ID = new Map((BANK.passages || []).map((p) => [p.id, p]));

const trackFor = (id) => TRACKS[String(id || "").toLowerCase()] || null;
const tracks = () => Object.values(TRACKS);

/** Cryptographically-seeded shuffle, in place. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 32);

/**
 * Encode the paper as `<payload>.<signature>`.
 * Payload is `track|id:perm,id:perm,…` where perm is the option order.
 */
function encodePaper(trackId, picks) {
  const body = trackId + "|" + picks.map((p) => `${p.id}:${p.order.join("")}`).join(",");
  const payload = Buffer.from(body, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Decode and verify. Returns null if missing, malformed or tampered with. */
function decodePaper(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const [trackId, list] = body.split("|");
  if (!trackFor(trackId) || !list) return null;

  const picks = [];
  for (const part of list.split(",")) {
    const [id, perm] = part.split(":");
    const question = BY_ID.get(id);
    if (!question || !perm) return null;

    const order = perm.split("").map(Number);
    if (order.length !== question.options.length || order.some((n) => Number.isNaN(n))) return null;
    picks.push({ id, order });
  }

  return { trackId, picks };
}

// ── Candidate, carried across the three steps ────────────────────────
//  Terms → details → exam. Each step posts forward, and who the candidate
//  is rides along in a signed field rather than in server-side session
//  state. Signed, not secret: it is the person's own details going back
//  and forth through their own browser, and the signature is what stops
//  someone skipping the terms or the details and jumping to the exam.

const CANDIDATE_FIELDS = ["name", "email", "phone", "country", "address"];

function signCandidate(data) {
  const payload = Buffer.from(
    JSON.stringify({
      t: data.track,
      c: data.consentAt || new Date().toISOString(),
      ...Object.fromEntries(CANDIDATE_FIELDS.map((f) => [f[0] + f.slice(1, 2), data[f] || ""])),
    }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readCandidate(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const out = { track: raw.t, consentAt: raw.c };
    for (const f of CANDIDATE_FIELDS) out[f] = raw[f[0] + f.slice(1, 2)] || "";
    return trackFor(out.track) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Build a fresh paper for one track.
 * Returns { track, questions, token, perLevel } — no answers anywhere.
 */
function createPaper(trackId) {
  const track = trackFor(trackId);
  if (!track) return null;

  const picks = [];

  for (const level of track.levels) {
    // Reading comprehension always appears in full: the three questions
    // share one passage, so drawing only some of them would leave the
    // candidate reading a text for a single question.
    const readingPool = BANK.questions.filter((q) => q.level === level && q.passage);
    const itemPool = BANK.questions.filter((q) => q.level === level && !q.passage);
    const chosen = [
      ...shuffle(itemPool.slice()).slice(0, Math.min(PER_LEVEL, itemPool.length)),
      ...readingPool,
    ];

    for (const q of chosen) {
      const order = shuffle(q.options.map((_, i) => i));
      picks.push({ id: q.id, order });
    }
  }

  // Keep levels in ascending order so the paper eases the person in, and
  // shuffle the single items within each level so two people never see the
  // same sequence. Reading questions stay together after them, in their
  // written order, because they follow one text.
  const byLevel = new Map(track.levels.map((l) => [l, { items: [], reading: [] }]));
  for (const p of picks) {
    const q = BY_ID.get(p.id);
    byLevel.get(q.level)[q.passage ? "reading" : "items"].push(p);
  }
  const ordered = track.levels.flatMap((l) => {
    const g = byLevel.get(l);
    return [...shuffle(g.items), ...g.reading];
  });

  const questions = ordered.map((p, i) => {
    const q = BY_ID.get(p.id);
    return {
      n: i + 1,
      id: q.id,
      level: q.level,
      skill: q.skill,
      prompt: q.prompt,
      // The view prints the text once, above the first question that uses it.
      passage: q.passage ? PASSAGE_BY_ID.get(q.passage) || null : null,
      options: p.order.map((sourceIndex) => q.options[sourceIndex]),
    };
  });

  // Mark where a new passage begins, so the template knows when to print it.
  let lastPassage = null;
  for (const q of questions) {
    q.startsPassage = Boolean(q.passage) && (!lastPassage || q.passage.id !== lastPassage);
    if (q.passage) lastPassage = q.passage.id;
  }

  return { track, token: encodePaper(track.id, ordered), questions };
}

/**
 * Mark a submitted paper.
 *
 * `answers` maps question id → the index of the option the person picked,
 * in the order it was shown to them.
 *
 * Placement rule: a level counts as mastered when at least `threshold` of
 * its questions are right, and the result is the first level NOT mastered
 * — that is the level they still need to learn. Someone who masters A1
 * and A2 but not B1 should enrol in B1, not repeat A2. Mastery has to be
 * consecutive, so a lucky guess higher up cannot skip a level they have
 * not actually got.
 */
function gradePaper(token, answers = {}) {
  const paper = decodePaper(token);
  if (!paper) return { error: "invalid-paper" };

  const track = trackFor(paper.trackId);
  const perLevel = new Map(track.levels.map((l) => [l, { correct: 0, total: 0, wrong: [] }]));
  let answered = 0;

  for (const pick of paper.picks) {
    const q = BY_ID.get(pick.id);
    const bucket = perLevel.get(q.level);
    if (!bucket) continue;
    bucket.total++;

    const picked = answers[q.id];
    if (picked === undefined || picked === null || picked === "") continue;

    const shown = Number(picked);
    if (!Number.isInteger(shown) || shown < 0 || shown >= pick.order.length) continue;
    answered++;

    // Translate the displayed position back to the source option.
    if (pick.order[shown] === q.answer) {
      bucket.correct++;
    } else {
      bucket.wrong.push({
        level: q.level,
        prompt: q.prompt,
        correct: q.options[q.answer],
        explain: q.explain || "",
      });
    }
  }

  const breakdown = [];
  let masteredThrough = null;
  let consecutive = true;

  for (const level of track.levels) {
    const b = perLevel.get(level);
    const ratio = b.total ? b.correct / b.total : 0;
    const mastered = ratio >= BANK.threshold;

    if (consecutive && mastered) masteredThrough = level;
    else consecutive = false;

    breakdown.push({
      level,
      correct: b.correct,
      total: b.total,
      percent: Math.round(ratio * 100),
      mastered,
      wrong: b.wrong,
    });
  }

  const totals = breakdown.reduce(
    (a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total }),
    { correct: 0, total: 0 }
  );

  let placement;
  let toppedOut = false;
  let bottomedOut = false;

  if (!masteredThrough) {
    placement = track.from;
    // On the advanced paper this means they are below B2 and the A1–B1
    // paper will place them properly.
    bottomedOut = track.id !== "a1-b1";
  } else {
    const next = LEVELS[LEVELS.indexOf(masteredThrough) + 1];
    if (!next) {
      placement = "C2";
      toppedOut = true;
    } else {
      placement = next;
      toppedOut = !track.levels.includes(next);
    }
  }

  return {
    track: track.id,
    trackFrom: track.from,
    trackTo: track.to,
    masteredThrough,
    placement,
    toppedOut,
    bottomedOut,
    answered,
    asked: paper.picks.length,
    correct: totals.correct,
    total: totals.total,
    percent: totals.total ? Math.round((totals.correct / totals.total) * 100) : 0,
    breakdown,
  };
}

/** Plain-text summary for the notification email and the stored record. */
function transcript(result) {
  if (!result || result.error) return "";

  const lines = [
    `Placement test — ${result.trackFrom}–${result.trackTo}`,
    ``,
    `RESULT: place at ${result.placement}`,
    `Mastered through: ${result.masteredThrough || "(none — below " + result.trackFrom + ")"}`,
    `Score: ${result.correct}/${result.total} (${result.percent}%)`,
    `Answered: ${result.answered} of ${result.asked}`,
    ``,
    `Per level:`,
  ];
  for (const b of result.breakdown) {
    lines.push(`  ${b.level}: ${b.correct}/${b.total} (${b.percent}%) ${b.mastered ? "mastered" : "not yet"}`);
  }
  if (result.toppedOut) lines.push(``, `Topped out this paper — may be above ${result.trackTo}.`);
  if (result.bottomedOut) lines.push(``, `Below ${result.trackFrom} — should sit the A1–B1 paper.`);
  return lines.join("\n");
}

/** Pool sizes, for the chooser page and for `npm run check`. */
function poolSizes() {
  const out = {};
  for (const l of LEVELS) {
    out[l] = {
      items: BANK.questions.filter((q) => q.level === l && !q.passage).length,
      reading: BANK.questions.filter((q) => q.level === l && q.passage).length,
    };
  }
  return out;
}

/** How many questions one paper holds per level: drawn items plus reading. */
function paperSize(trackId) {
  const track = trackFor(trackId);
  if (!track) return 0;
  const sizes = poolSizes();
  return track.levels.reduce(
    (n, l) => n + Math.min(PER_LEVEL, sizes[l].items) + sizes[l].reading,
    0
  );
}

const perPaper = () => PER_LEVEL;

module.exports = {
  LEVELS, tracks, trackFor,
  createPaper, gradePaper, transcript,
  signCandidate, readCandidate, CANDIDATE_FIELDS,
  poolSizes, perPaper, paperSize,
};
