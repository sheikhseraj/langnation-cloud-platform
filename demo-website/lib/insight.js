// ─────────────────────────────────────────────────────────────────────
//  What the school looks like from the office.
//
//  Every number here is counted from the rows the other pages list —
//  enrolments, batches, courses — and never from a total kept
//  separately. A figure that counts on its own eventually disagrees
//  with the list it claims to summarise, and the figure is the one
//  people believe.
//
//  ── On the money ────────────────────────────────────────────────────
//
//  "Expected" is not income and this file never calls it that. Nothing
//  in the site writes to `invoices` or `payments`: they have a schema
//  and a student-portal page that reads them, and no way to raise one.
//  So there is no record anywhere of money having arrived.
//
//  What there is: an active enrolment, and the price of the course that
//  batch runs. Multiply and you get what the term is worth if everybody
//  pays — useful for planning, and a lie if it were labelled income.
//  Every caller here gets the word "expected" attached to it, and the
//  page says so under the figure.
//
//  When invoicing exists, `received` becomes a real column beside this
//  one and the shape of the page does not change.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");
const { offer } = require("./courses-db");

/** Reads must never take a page down; an empty panel is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Insight: ${label} failed:`, e.message);
    return fallback;
  }
}

/* What one seat on this course is worth.

   offer() rather than price_eur, so the dashboard charges what the
   course page charges. A discount the site is showing and the office's
   own figures ignore is two answers to "what is this term worth", and
   the one on the invoice is the one that counts. */
const seatPrice = (row) => {
  const o = offer(row.price_eur, row.discount_eur);
  return o.priceNow == null ? 0 : o.priceNow;
};

/**
 * The headline figures.
 *
 * Active enrolments only. A withdrawn student is not expected money and
 * a completed one has already been and gone; counting either would make
 * the total climb forever and mean nothing by March.
 */
function summary() {
  return safe("summary", async () => {
    const rows = await db.query(
      `SELECT i.id AS intake_id, i.status AS batch_status, i.seats,
              c.price_eur, c.discount_eur,
              (SELECT COUNT(*) FROM enrolments e
                WHERE e.intake_id = i.id AND e.status = 'active') AS heads
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'`
    );

    const running = rows.filter((r) => r.batch_status === "running");
    const planned = rows.filter((r) => r.batch_status === "planned");
    const live = [...running, ...planned];

    const students = live.reduce((n, r) => n + Number(r.heads || 0), 0);
    const expected = live.reduce((n, r) => n + Number(r.heads || 0) * seatPrice(r), 0);

    // Empty seats, and only across batches that set a limit. A school
    // with no limits anywhere is not "0 seats left", it is a question
    // that does not apply.
    const capped = live.filter((r) => r.seats != null && Number(r.seats) > 0);
    const seatsLeft = capped.length
      ? capped.reduce((n, r) => n + Math.max(0, Number(r.seats) - Number(r.heads || 0)), 0)
      : null;

    return {
      expected,
      students,
      batches: rows.length,
      running: running.length,
      planned: planned.length,
      seatsLeft,
      // What one student is worth on average, which is the number that
      // says whether the mix has shifted towards the cheaper courses.
      perStudent: students ? Math.round(expected / students) : 0,
    };
  }, {
    expected: 0, students: 0, batches: 0, running: 0, planned: 0,
    seatsLeft: null, perStudent: 0,
  });
}

/**
 * Enrolments and what they are worth, month by month.
 *
 * By the date somebody enrolled, not by the batch's start: the question
 * is when the school won the work. Two batches of the same course
 * starting in September were sold across four different months and the
 * shape of that is the thing worth seeing.
 *
 * Months with nothing in them are filled in rather than skipped. A gap
 * that closes up turns a quiet August into a straight line and hides
 * exactly the thing somebody opened the page to find.
 */
function byMonth({ months = 12 } = {}) {
  // Clamped and interpolated: INTERVAL takes a unit keyword, and the
  // window is a number this code chooses rather than anything a request
  // supplies.
  const window = Math.min(60, Math.max(1, Math.round(Number(months) || 12)));

  return safe("by month", async () => {
    const rows = await db.query(
      `SELECT DATE_FORMAT(e.enrolled_on, '%Y-%m') AS ym,
              COUNT(*) AS heads,
              c.price_eur, c.discount_eur
         FROM enrolments e
         JOIN intakes i ON i.id = e.intake_id
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE e.status IN ('active', 'completed')
          AND e.enrolled_on >= DATE_SUB(CURDATE(), INTERVAL ${window} MONTH)
        GROUP BY ym, c.price_eur, c.discount_eur
        ORDER BY ym`
    );

    const totals = new Map();
    for (const r of rows) {
      const cur = totals.get(r.ym) || { heads: 0, expected: 0 };
      cur.heads += Number(r.heads || 0);
      cur.expected += Number(r.heads || 0) * seatPrice(r);
      totals.set(r.ym, cur);
    }

    // Every month in the window, in order, whether or not anybody
    // enrolled in it.
    const out = [];
    const now = new Date();
    for (let back = window - 1; back >= 0; back--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const got = totals.get(ym) || { heads: 0, expected: 0 };
      out.push({
        ym,
        label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
        year: d.getUTCFullYear(),
        heads: got.heads,
        expected: got.expected,
      });
    }
    return out;
  }, []);
}

/**
 * Every course that has ever had a batch, with what it is carrying now.
 *
 * Ordered by what it is worth, because the question this answers is
 * which courses are holding the school up — and that is not the same
 * list as which ones have the most students on them.
 */
function byCourse() {
  return safe("by course", async () => {
    const rows = await db.query(
      `SELECT c.id, c.title, c.slug, c.level, c.track, c.status,
              c.price_eur, c.discount_eur,
              COUNT(DISTINCT i.id) AS batches,
              COUNT(DISTINCT CASE WHEN i.status = 'running' THEN i.id END) AS running,
              COALESCE(SUM(CASE WHEN i.status IN ('running','planned') THEN
                (SELECT COUNT(*) FROM enrolments e
                  WHERE e.intake_id = i.id AND e.status = 'active') END), 0) AS heads
         FROM courses c
         LEFT JOIN intakes i ON i.course_id = c.id
        WHERE c.lang = 'en'
        GROUP BY c.id
        ORDER BY c.title`
    );

    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        level: r.level,
        track: r.track,
        status: r.status,
        price: seatPrice(r),
        batches: Number(r.batches || 0),
        running: Number(r.running || 0),
        heads: Number(r.heads || 0),
        expected: Number(r.heads || 0) * seatPrice(r),
      }))
      .sort((a, b) => b.expected - a.expected || b.heads - a.heads || a.title.localeCompare(b.title));
  }, []);
}

/**
 * Things worth looking at, each with what to do about it.
 *
 * Not a count. "3 problems" on a dashboard is a number somebody learns
 * to ignore within a week, because clearing it means finding out what
 * the three are. Each one names the thing and links to the page where
 * it gets fixed.
 */
function attention() {
  return safe("attention", async () => {
    const out = [];

    // A course anybody can find and nobody can join.
    const orphans = await db.query(
      `SELECT c.title, c.slug
         FROM courses c
         LEFT JOIN intakes i ON i.course_id = c.id
        WHERE c.lang = 'en' AND c.status = 'published'
        GROUP BY c.id
       HAVING COUNT(i.id) = 0
        ORDER BY c.title`
    );
    for (const c of orphans) {
      out.push({
        kind: "no batch",
        what: `${c.title} is published but has no batch`,
        why: "Somebody can read the page and there is nothing to enrol on.",
        href: "/rootadmin/batches",
        cta: "Add a batch",
      });
    }

    // A batch running with nobody on it, and a batch starting soon with
    // nobody on it. The second is the one there is still time to fix.
    const empty = await db.query(
      `SELECT i.id, i.code, i.status, i.starts_on, c.title
         FROM intakes i
         LEFT JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE i.status IN ('running', 'planned')
          AND NOT EXISTS (SELECT 1 FROM enrolments e
                           WHERE e.intake_id = i.id AND e.status = 'active')
        ORDER BY i.starts_on`
    );
    for (const b of empty) {
      out.push({
        kind: "empty",
        what: `${b.code}${b.title ? " — " + b.title : ""} has nobody on it`,
        why: b.status === "running"
          ? "It is running, so a teacher is being paid to teach an empty room."
          : "It has not started yet, so there is still time.",
        href: "/rootadmin/batch/" + b.id,
        cta: "Open the batch",
      });
    }

    // A course with no price is a course nobody can be billed for.
    const unpriced = await db.query(
      `SELECT DISTINCT c.title, c.slug
         FROM intakes i
         JOIN courses c ON c.id = i.course_id AND c.lang = 'en'
        WHERE i.status IN ('running', 'planned')
          AND (c.price_eur IS NULL OR c.price_eur = 0)
        ORDER BY c.title`
    );
    for (const c of unpriced) {
      out.push({
        kind: "no price",
        what: `${c.title} is being taught and has no price`,
        why: "Its students count for nothing in the figures above.",
        href: "/rootadmin/prices",
        cta: "Set the price",
      });
    }

    // The rule the Prices page enforces, for rows that predate it.
    const badDiscount = await db.query(
      `SELECT title, price_eur, discount_eur FROM courses
        WHERE lang = 'en' AND discount_eur IS NOT NULL
          AND price_eur IS NOT NULL AND discount_eur >= price_eur
        ORDER BY title`
    );
    for (const c of badDiscount) {
      out.push({
        kind: "bad discount",
        what: `${c.title} has a discount of €${c.discount_eur} against a price of €${c.price_eur}`,
        why: "A discount has to be lower than the price, so the site is ignoring it.",
        href: "/rootadmin/prices",
        cta: "Fix the price",
      });
    }

    return out;
  }, []);
}

/**
 * Bars, as geometry.
 *
 * The SVG is worked out here rather than in the template for the reason
 * lib/attendance.js gives: arithmetic in EJS is arithmetic nobody can
 * test. The template places what this returns and decides nothing.
 *
 * `value` picks which of the two numbers a month carries, because
 * enrolments and euros are different scales and must never share an
 * axis — two charts, one measure each.
 */
function toBars(rows = [], value = (r) => r.heads, { width = 520, height = 200 } = {}) {
  const padX = 8;
  const padBottom = 22;
  const padTop = 18;

  const values = rows.map((r) => Number(value(r) || 0));
  const peak = Math.max(1, ...values);
  const plot = height - padTop - padBottom;

  /* The slot each month gets, and the bar inside it.

     Capped at 24 so a short window does not produce slabs, and the
     leftover is air rather than a wider bar.

     The cap is in viewBox units, and the only reason that is also
     roughly 24 rendered pixels is that `width` is set near the width
     the card actually is. A 720-unit viewBox in a 340-pixel card
     renders a 24-unit bar at 11px and 10px axis labels at 5px, which
     is how the first version of this came out: correct arithmetic,
     unreadable chart. */
  const slot = rows.length ? (width - padX * 2) / rows.length : width;
  //  2px of that gap is the separator between neighbours; the rest is
  //  breathing room.
  const barW = Math.max(2, Math.min(24, slot - 6));

  const bars = rows.map((r, i) => {
    const v = Number(value(r) || 0);
    const h = v === 0 ? 0 : Math.max(2, (v / peak) * plot);
    return {
      ...r,
      value: v,
      x: round(padX + slot * i + (slot - barW) / 2),
      y: round(padTop + plot - h),
      w: round(barW),
      h: round(h),
      // The whole slot, for hovering: a 2px bar is not a hit target.
      hitX: round(padX + slot * i),
      hitW: round(slot),
      peak: v === peak && v > 0,
    };
  });

  return {
    width, height, padTop, padBottom, plot, peak,
    baseline: round(padTop + plot),
    bars,
    // Nothing to draw is a real answer and the page says so rather than
    // drawing an empty grid.
    any: values.some((v) => v > 0),
  };
}

const round = (n) => Math.round(n * 100) / 100;

/** €1,234 — grouped, no decimals. Fees here are whole euros. */
const euros = (n) => "€" + Math.round(Number(n) || 0).toLocaleString("en-GB");

module.exports = { summary, byMonth, byCourse, attention, toBars, euros, seatPrice };
