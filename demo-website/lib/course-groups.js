// Courses, grouped the way the school talks about them.
//
// Nine published courses is a short list, and as a flat list it hid the
// only thing worth knowing about it: six of those nine are the same
// course at six levels, and the other three are two different kinds of
// one-to-one plus the intensive. Grouped by track, that reads at a
// glance; ungrouped it is nine similar titles.
//
// Used by the course list and by the batch picker, which must agree —
// somebody who has just read the list in one order should not have to
// re-find their course in a different one.

"use strict";

/** Teaching order, not alphabetical: the way the school lists them. */
const TRACK_ORDER = ["Regular", "Intensive", "Individual", "Speaking", "Weekend", "Other"];

/** How each track is written where a person reads it. */
const TRACK_LABEL = {
  Regular: "Regular German",
  Intensive: "Intensive",
  Individual: "One-to-one",
  Speaking: "Speaking",
  Weekend: "Weekend",
  Other: "Not yet grouped",
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const trackOf = (c) => {
  const t = String(c.track || "").trim();
  return t || "Other";
};

/** Sorts A1 → C2, with unlevelled courses after them rather than first. */
function levelRank(level) {
  const i = LEVELS.indexOf(String(level || "").toUpperCase());
  return i === -1 ? LEVELS.length : i;
}

function compare(a, b) {
  const byLevel = levelRank(a.level) - levelRank(b.level);
  if (byLevel) return byLevel;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

/**
 * [{ track, label, courses }], in teaching order, empty groups dropped.
 *
 * Works on both shapes the codebase has: the camelCase objects from
 * coursesDb and the raw rows from a plain SELECT. Only track, level and
 * title are read, and those are spelled the same in both.
 */
function group(courses = []) {
  const buckets = new Map();
  for (const c of courses) {
    const t = trackOf(c);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(c);
  }

  // Known tracks first in teaching order, then anything the editor has
  // invented since, alphabetically — a new track should appear rather
  // than vanish because this list has not caught up with it.
  const known = TRACK_ORDER.filter((t) => buckets.has(t));
  const extra = [...buckets.keys()].filter((t) => !TRACK_ORDER.includes(t)).sort();

  return [...known, ...extra].map((track) => ({
    track,
    label: TRACK_LABEL[track] || track,
    courses: buckets.get(track).slice().sort(compare),
  }));
}

/**
 * What to call a course inside its own group.
 *
 * "German Regular A1" under a heading that already says Regular German
 * is three words of repetition on every row. The level alone is what
 * distinguishes the six of them, so that is what the row shows — and
 * where a course has no level, the title has to carry it.
 */
function shortLabel(course, track) {
  const level = String(course.level || "").trim();
  if (!level) return course.title;
  const title = String(course.title || "");
  // Only when the title really is the track plus the level — "German
  // Regular A1" under a heading that already says Regular German. A
  // course named anything else keeps its own name, because then the
  // name is the part carrying the meaning.
  const lower = title.toLowerCase();
  const looksGeneric =
    lower.includes(String(track).toLowerCase()) && lower.includes(level.toLowerCase());
  return looksGeneric ? level : `${level} — ${title}`;
}

module.exports = { TRACK_ORDER, TRACK_LABEL, LEVELS, group, shortLabel, levelRank };
