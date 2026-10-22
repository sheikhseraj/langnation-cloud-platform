// ─────────────────────────────────────────────────────────────────────
//  A batch's weekly pattern, and the dates it produces.
//
//  A batch says "Monday to Friday, 09:00, two hours" once. Every lesson
//  between its start and end dates follows from that, so nobody types a
//  timetable in by hand and nothing drifts out of step with the dates
//  above it.
//
//  All of it is pure: dates in, dates out, no database. The awkward part
//  is the timezone, and it is awkward enough to be worth its own file.
//
//  `lessons.starts_at` is a DATETIME and the pool runs in UTC, so a class
//  at 09:00 Berlin is stored as 07:00 in summer and 08:00 in winter. Get
//  that wrong and a timetable is an hour out for half the year — the same
//  class of mistake that had a batch starting at 02:00 instead of
//  midnight, which is why the conversion is written once, here, with the
//  tests beside it.
// ─────────────────────────────────────────────────────────────────────
"use strict";

// ISO weekday numbers: Monday is 1, Sunday is 7. Matching ISO rather
// than JavaScript's getDay(), where Sunday is 0 and Monday is 1, because
// a schedule is written about a working week and "1 = Monday" is how
// everybody says it.
const DAY_NAMES = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const DAY_SHORT = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

/**
 * "1,2,3,4,5" or ["1","3"] into a sorted, deduplicated [1..7].
 *
 * Anything that is not a weekday is dropped rather than rejected: a
 * stray value in the column should cost that day, not the timetable.
 */
function parseDays(value) {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[^0-9]+/);
  const out = new Set();
  for (const p of parts) {
    const n = Number(p);
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Back to the stored form. */
function formatDays(days) {
  return parseDays(days).join(",");
}

/** "Mon, Wed and Fri" — for a page, not for a column. */
function describeDays(days, { short = false } = {}) {
  const list = parseDays(days).map((d) => (short ? DAY_SHORT[d] : DAY_NAMES[d]));
  if (!list.length) return "";
  if (list.length === 1) return list[0];

  // Monday to Friday is five names where three words will do, and it is
  // by far the most common pattern here.
  const run = parseDays(days);
  const consecutive = run.every((d, i) => i === 0 || d === run[i - 1] + 1);
  if (consecutive && run.length > 2) {
    return `${short ? DAY_SHORT[run[0]] : DAY_NAMES[run[0]]} to ${
      short ? DAY_SHORT[run[run.length - 1]] : DAY_NAMES[run[run.length - 1]]
    }`;
  }

  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
}

/** "09:00" from "09:00", "09:00:00" or "9:00". Null if it is not a time. */
function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

/** "09:00" and 120 minutes gives "11:00". */
function endTime(start, minutes) {
  const from = parseTime(start);
  if (!from) return null;
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const [h, m] = from.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

/**
 * Minutes from one wall time to the next, within the same day.
 *
 * The office types a start and an end, because "09:00 until 11:00" is
 * how a timetable is said; the database stores a length, because that
 * is what survives a class being moved to another hour.
 *
 * An end before the start returns null rather than wrapping past
 * midnight. No batch here teaches through the small hours, so a wrap is
 * a typo — and guessing otherwise would turn a two-hour class into a
 * twenty-two hour one without a word.
 */
function minutesBetween(from, to) {
  const a = parseTime(from);
  const b = parseTime(to);
  if (!a || !b) return null;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const mins = bh * 60 + bm - (ah * 60 + am);
  return mins > 0 ? mins : null;
}

/** The ISO weekday of a YYYY-MM-DD, read as a plain calendar date. */
function weekdayOf(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  // UTC on purpose: this is a calendar date with no time in it, and
  // building it locally would shift the day for anybody west of London.
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** One day later, still as YYYY-MM-DD. */
function nextDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/**
 * Every date in [from, to] that falls on one of `days`.
 *
 * Capped, because a batch with a typo for an end date — 2206 rather than
 * 2026 — should produce a short timetable and a puzzled look, not two
 * hundred thousand rows.
 */
function datesBetween(from, to, days, { limit = 400 } = {}) {
  const wanted = parseDays(days);
  if (!wanted.length || !from || !to || to < from) return [];

  const set = new Set(wanted);
  const out = [];
  let cursor = from;
  while (cursor <= to && out.length < limit) {
    if (set.has(weekdayOf(cursor))) out.push(cursor);
    cursor = nextDay(cursor);
  }
  return out;
}

/**
 * A wall-clock time in a named zone, as the UTC instant it happens at.
 *
 * There is no built-in for this. The reliable way is to guess, ask what
 * that guess looks like in the target zone, and correct by the
 * difference — which lands exactly, including across a daylight-saving
 * change, because the correction is measured in the zone itself rather
 * than assumed from an offset table.
 *
 * Returns a Date. An unparseable time or unknown zone returns null
 * rather than a wrong answer: a lesson with no time is a thing the
 * caller can notice, and one at the wrong time is not.
 */
function utcFor(iso, time, tz) {
  const hhmm = parseTime(time);
  if (!iso || !hhmm) return null;

  const [y, mo, d] = String(iso).split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;

  // The wall time we want, read as though it were UTC. This never
  // moves — every pass below measures against it.
  const target = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = target;

  try {
    // Measure the zone's offset AT the guess, then place the answer that
    // far from the target. Twice, because the first move can cross a
    // daylight-saving boundary into a different offset; the second pass
    // settles it and a third has never been needed.
    //
    // Subtracting the drift from the guess each time, rather than
    // recomputing from the fixed target, was the first version of this
    // and it is wrong in a way that looks right: the offset comes out
    // the same on every pass, so two passes subtract it twice and 09:00
    // Berlin lands at 05:00 UTC instead of 07:00. Caught by round-
    // tripping the answer back through the zone, which is the only test
    // that actually proves this function.
    for (let i = 0; i < 2; i++) {
      const seen = partsIn(new Date(guess), tz);
      const offset = Date.UTC(seen.y, seen.mo - 1, seen.d, seen.h, seen.mi, 0) - guess;
      const next = target - offset;
      if (next === guess) break;
      guess = next;
    }
  } catch {
    return null; // unknown timezone
  }

  return new Date(guess);
}

/** What an instant reads as on a clock in that zone. */
function partsIn(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const got = {};
  for (const part of fmt.formatToParts(date)) got[part.type] = part.value;
  return {
    y: Number(got.year),
    mo: Number(got.month),
    d: Number(got.day),
    // Midnight can come back as "24" in some environments.
    h: Number(got.hour) % 24,
    mi: Number(got.minute),
  };
}

/**
 * The whole timetable for a batch: one entry per date it meets.
 *
 * Each carries the calendar date, the UTC instant it starts at, and how
 * long it runs, which is everything a lesson row needs.
 */
function plan({ startsOn, endsOn, days, time, minutes, timezone = "Europe/Berlin" }, opts = {}) {
  const mins = Number(minutes) > 0 ? Number(minutes) : 120;
  return datesBetween(startsOn, endsOn, days, opts)
    .map((date) => ({ date, startsAt: utcFor(date, time, timezone), minutes: mins }))
    .filter((x) => x.startsAt);
}

module.exports = {
  DAY_NAMES,
  DAY_SHORT,
  parseDays,
  formatDays,
  describeDays,
  parseTime,
  endTime,
  minutesBetween,
  weekdayOf,
  nextDay,
  datesBetween,
  utcFor,
  plan,
};
