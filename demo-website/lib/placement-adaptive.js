// The adaptive placement test.
//
// What was wrong with the linear one:
//
//   · The candidate chose A1–B1 or B2–C2 before starting — deciding the
//     very thing the test exists to find out. Choose wrong and the
//     whole paper is at the wrong difficulty and the score means little.
//   · Everyone answered 30 questions, most of them far from their level
//     and therefore telling us nothing.
//   · Seven items per level at four options is roughly 1.75 correct by
//     luck alone, against a threshold of five. Two lucky guesses moved
//     somebody up a level.
//
// This asks blocks of five at one level, then moves. Up if the block
// was comfortable, down if it was not, and stop once the level is
// bracketed between one the candidate handled and one they did not.
// Typically fifteen to twenty questions instead of thirty, and every
// one of them near the boundary that actually matters.
//
// State lives in a signed token rather than a session: the test must
// survive a server restart mid-paper, and there is nothing here worth
// a table until it is finished.
//
// Recognition only, even so. Multiple choice cannot tell you whether
// somebody can produce German, which is why the writing task at the end
// is not decoration — see WRITING_PROMPTS.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { env } = require("./env");

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Where everybody starts.
 *
 * A2 rather than the midpoint B1: most people arriving at a language
 * school are nearer the bottom of the range, and starting too high
 * means a beginner's first impression of the school is five questions
 * they cannot read. Starting slightly low costs at most one extra
 * block for an advanced candidate, who will not mind.
 */
const START = "A2";

/** Questions per block. */
const BLOCK = 5;

/** Blocks before we stop and answer with what we have. */
const MAX_BLOCKS = 5;

/** Comfortable at this level — move up. */
const UP = 0.8;

/** Struggled — move down. */
const DOWN = 0.45;

const SECRET = env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");

function load() {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "content", "placement-questions.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      passages: Array.isArray(parsed.passages) ? parsed.passages : [],
    };
  } catch {
    return { questions: [], passages: [] };
  }
}

const BANK = load();
const BY_ID = new Map(BANK.questions.map((q) => [q.id, q]));
const PASSAGE_BY_ID = new Map(BANK.passages.map((p) => [p.id, p]));

/**
 * Reading questions are excluded from the adaptive blocks.
 *
 * Three of them share one passage, so drawing one or two would mean
 * reading four paragraphs to answer a single question — and drawing all
 * three would make a five-question block mostly one text. They belong
 * in a longer paper, not this one.
 */
const POOL = BANK.questions.filter((q) => !q.passage);

function poolFor(level) {
  return POOL.filter((q) => q.level === level);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── State ─────────────────────────────────────────────────────────────
//
// Carried between requests as `<base64 payload>.<hmac>`. The candidate
// can read it — it holds nothing secret — but cannot change it, which
// is what stops anybody editing their way to C2.

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 32);

function encode(state) {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Sign a small object — the consent marker, and the candidate's
 * details once given.
 *
 * The old module's signCandidate cannot be reused: it only validates a
 * token that names one of the two legacy tracks, and this test has no
 * tracks. Same construction, no track.
 */
function signData(data) {
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readData(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── The test ──────────────────────────────────────────────────────────

/**
 * A fresh test.
 *
 * `asked` holds every question seen, with the order its options were
 * shown in, so a reload cannot reshuffle them, and the same question
 * cannot come round twice.
 */
function begin() {
  return {
    v: 1,
    level: START,
    /** Blocks completed, as { level, correct, total }. */
    blocks: [],
    /** Ids already used, so nothing repeats. */
    seen: [],
    /** The block in progress: [{ id, order }]. */
    current: [],
    /** Answers within the current block, index-aligned with `current`. */
    given: [],
    /** Levels already tested, so we do not loop between two. */
    visited: [],
    startedAt: Date.now(),
  };
}

/** Draw the next block at the current level. Mutates and returns state. */
function drawBlock(state) {
  const available = poolFor(state.level).filter((q) => !state.seen.includes(q.id));
  const picked = shuffle(available).slice(0, BLOCK);

  state.current = picked.map((q) => ({
    id: q.id,
    order: shuffle(q.options.map((_, i) => i)),
  }));
  state.given = [];
  for (const p of state.current) state.seen.push(p.id);
  if (!state.visited.includes(state.level)) state.visited.push(state.level);
  return state;
}

/** The question to show now, shaped for the page. Null when the block is done. */
function currentQuestion(state) {
  const i = state.given.length;
  if (i >= state.current.length) return null;

  const pick = state.current[i];
  const q = BY_ID.get(pick.id);
  if (!q) return null;

  return {
    id: q.id,
    level: q.level,
    skill: q.skill,
    prompt: q.prompt,
    passage: q.passage ? PASSAGE_BY_ID.get(q.passage) : null,
    /** In the order this candidate sees them. */
    options: pick.order.map((sourceIndex) => q.options[sourceIndex]),
    /** Which of the shown positions is correct — never sent to the page. */
    correctShown: pick.order.indexOf(q.answer),
    explain: q.explain,
    numberInBlock: i + 1,
    blockSize: state.current.length,
  };
}

/**
 * Record one answer.
 *
 * `shown` is the position the candidate clicked, not the source index —
 * the options are shuffled per candidate, so the two differ.
 */
function answer(state, shown) {
  const q = currentQuestion(state);
  if (!q) return null;

  const picked = Number.isInteger(shown) && shown >= 0 && shown < q.options.length ? shown : -1;
  const correct = picked === q.correctShown;
  state.given.push(picked);

  return {
    correct,
    // The right answer is only ever revealed after the choice is made.
    correctIndex: q.correctShown,
    explain: q.explain,
  };
}

/** True once every question in the block has an answer. */
const blockComplete = (state) => state.given.length >= state.current.length;

/** Score the finished block and decide where to go next. */
function closeBlock(state) {
  let correct = 0;
  state.wrong = state.wrong || [];
  state.current.forEach((pick, i) => {
    const q = BY_ID.get(pick.id);
    if (!q) return;
    if (pick.order[state.given[i]] === q.answer) {
      correct++;
      return;
    }
    // Recorded in full: a teacher looking at a borderline result wants
    // to see whether the misses were careless or a real gap, and "3/5"
    // cannot tell them that.
    const chosen = state.given[i];
    state.wrong.push({
      id: q.id,
      level: q.level,
      skill: q.skill,
      prompt: q.prompt,
      gave: chosen >= 0 && chosen < pick.order.length ? q.options[pick.order[chosen]] : null,
      right: q.options[q.answer],
      explain: q.explain,
    });
  });

  const total = state.current.length;
  state.blocks.push({ level: state.level, correct, total });

  // Stop only once the level is bracketed: one level handled, and the
  // one above it not.
  //
  // Deciding purely on the block just finished was wrong. A middling
  // first block — three out of five, neither up nor down — ended the
  // test after five questions, so an unlucky C2 candidate was placed at
  // A2 and never asked another thing. Whether to continue depends on
  // what is known overall, not on the last block alone.
  const passedIndexes = state.blocks
    .filter((b) => b.total && b.correct / b.total >= DOWN)
    .map((b) => LEVELS.indexOf(b.level));
  const failedIndexes = state.blocks
    .filter((b) => b.total && b.correct / b.total < DOWN)
    .map((b) => LEVELS.indexOf(b.level));

  const highestPassed = passedIndexes.length ? Math.max(...passedIndexes) : -1;
  const lowestFailed = failedIndexes.length ? Math.min(...failedIndexes) : LEVELS.length;

  let nextIndex = null;
  if (highestPassed === -1) {
    // Nothing handled yet — work downwards to find the floor.
    nextIndex = Math.min(...state.visited.map((l) => LEVELS.indexOf(l))) - 1;
  } else if (lowestFailed > highestPassed + 1) {
    // A level handled, nothing above it failed yet: confirm the ceiling.
    nextIndex = highestPassed + 1;
  }

  let next = nextIndex !== null && nextIndex >= 0 && nextIndex < LEVELS.length
    ? LEVELS[nextIndex]
    : null;

  // Never ask a level twice, and never one with nothing left to ask.
  if (next && state.visited.includes(next)) next = null;
  if (next && !poolFor(next).some((q) => !state.seen.includes(q.id))) next = null;

  if (next && state.blocks.length < MAX_BLOCKS) {
    state.level = next;
    return { done: false };
  }
  return { done: true };
}

/**
 * The level the blocks point to.
 *
 * The highest level the candidate actually handled, rather than the
 * last one tested — somebody who managed B1 and then failed B2 is a B1,
 * and the failed block is the evidence for that, not against it.
 *
 * With no block passed at all, the answer is A1: the floor, not a
 * failure, and the class where they will actually learn something.
 */
function conclude(state) {
  let best = null;
  for (const b of state.blocks) {
    if (b.total && b.correct / b.total >= DOWN) {
      if (!best || LEVELS.indexOf(b.level) > LEVELS.indexOf(best)) best = b.level;
    }
  }

  const totals = state.blocks.reduce(
    (acc, b) => ({ correct: acc.correct + b.correct, total: acc.total + b.total }),
    { correct: 0, total: 0 }
  );

  return {
    placement: best || "A1",
    blocks: state.blocks,
    wrong: state.wrong || [],
    correct: totals.correct,
    total: totals.total,
    percent: totals.total ? Math.round((totals.correct / totals.total) * 100) : 0,
    minutes: Math.max(1, Math.round((Date.now() - state.startedAt) / 60000)),
  };
}

// ── Writing ───────────────────────────────────────────────────────────
//
// The part multiple choice cannot reach. Nothing here is scored
// automatically: a teacher reads it, and that is the point. It is also
// the only place the candidate has to produce German rather than
// recognise it, which is why a placement without it is provisional in a
// way one with it is not.

const WRITING_PROMPTS = {
  A1: {
    en: "Write about yourself: your name, where you are from, what you do, and why you are learning German.",
    de: "Schreiben Sie über sich: Ihr Name, woher Sie kommen, was Sie machen und warum Sie Deutsch lernen.",
  },
  A2: {
    en: "Describe a normal day in your life — when you get up, what you do, who you meet, what you like about it.",
    de: "Beschreiben Sie einen normalen Tag in Ihrem Leben — wann Sie aufstehen, was Sie tun, wen Sie treffen, was Ihnen daran gefällt.",
  },
  B1: {
    en: "Tell us about a journey or a move that changed something for you. What happened, and what was different afterwards?",
    de: "Erzählen Sie von einer Reise oder einem Umzug, der etwas verändert hat. Was ist passiert, und was war danach anders?",
  },
  B2: {
    en: "Many people learn a language for work rather than pleasure. What do you think is gained and lost by that? Give reasons.",
    de: "Viele Menschen lernen eine Sprache für den Beruf und nicht zum Vergnügen. Was gewinnt und was verliert man dabei? Begründen Sie Ihre Meinung.",
  },
  C1: {
    en: "“You only really understand a country once you can argue in its language.” Discuss, with examples from your own experience.",
    de: "„Ein Land versteht man erst, wenn man in seiner Sprache streiten kann.“ Diskutieren Sie diese Aussage mit Beispielen aus Ihrer Erfahrung.",
  },
  C2: {
    en: "Choose a change in your field over the last ten years and explain, for a reader who does not share your background, why it matters.",
    de: "Wählen Sie eine Veränderung in Ihrem Fachgebiet der letzten zehn Jahre und erklären Sie einer fachfremden Leserschaft, warum sie von Bedeutung ist.",
  },
};

/** The minimum that can usefully be read. Their rules promise 8–14 sentences. */
const WRITING_MIN_WORDS = 40;

function writingPrompt(level, lang = "en") {
  const p = WRITING_PROMPTS[level] || WRITING_PROMPTS.A2;
  return p[lang] || p.en;
}

/** Word count, forgiving about punctuation and multiple spaces. */
function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

module.exports = {
  LEVELS,
  START,
  BLOCK,
  MAX_BLOCKS,
  WRITING_MIN_WORDS,
  begin,
  drawBlock,
  currentQuestion,
  answer,
  blockComplete,
  closeBlock,
  conclude,
  encode,
  decode,
  signData,
  readData,
  writingPrompt,
  wordCount,
  poolFor,
};
