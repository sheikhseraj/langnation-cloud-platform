// ─────────────────────────────────────────────────────────────────────
//  Page-view counting, without a third-party script.
//
//  Answers one question — "which pages do people actually look at?" — so
//  you can decide what to write more of. It stores a count per (path,
//  language, day) and nothing else: no cookie, no visitor id, no IP, no
//  cross-site anything. There is nothing here to put in a cookie banner.
//
//  Counts are buffered in memory and flushed on a timer, so a busy page
//  costs one database write per flush rather than one per visitor.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");

const FLUSH_MS = 30_000;
const MAX_BUFFER = 500; // flush early rather than grow without bound

// key: "path\tlang\tday" → count
let buffer = new Map();
let timer = null;
let flushing = false;

// Anything that is not a person reading a page.
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python-requests|axios|node-fetch/i;

const SKIP_PREFIX = ["/admin", "/api", "/downloads", "/img", "/icons", "/css", "/js", "/.well-known"];

function shouldCount(req, res) {
  if (req.method !== "GET") return false;
  if (res.statusCode !== 200) return false;

  const type = String(res.getHeader("content-type") || "");
  if (!type.includes("text/html")) return false;

  if (SKIP_PREFIX.some((p) => req.path.startsWith(p))) return false;
  if (BOT.test(req.get("user-agent") || "")) return false;

  // Respect the browser's own "do not track me" signal.
  if (req.get("dnt") === "1" || req.get("sec-gpc") === "1") return false;

  return true;
}

/** Express middleware. Safe to mount even with no database. */
function middleware(lang) {
  return function (req, res, next) {
    res.on("finish", () => {
      try {
        if (!db.isEnabled() || !shouldCount(req, res)) return;

        const path = req.path.length > 255 ? req.path.slice(0, 255) : req.path;
        const day = new Date().toISOString().slice(0, 10);
        const key = `${path}\t${lang}\t${day}`;

        buffer.set(key, (buffer.get(key) || 0) + 1);
        if (buffer.size >= MAX_BUFFER) flush();
      } catch {
        /* Counting must never break a page render. */
      }
    });
    next();
  };
}

/** Write the buffer out. Never throws; a failed flush is dropped, not retried. */
async function flush() {
  if (flushing || !buffer.size || !db.isEnabled()) return;

  flushing = true;
  const pending = buffer;
  buffer = new Map();

  try {
    for (const [key, views] of pending) {
      const [path, lang, day] = key.split("\t");
      await db.query(
        `INSERT INTO page_views (path, lang, day, views)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE views = views + VALUES(views)`,
        [path, lang, day, views]
      );
    }
  } catch (e) {
    console.error("Page-view flush failed (counts dropped):", e.message);
  } finally {
    flushing = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_MS);
  if (timer.unref) timer.unref(); // never hold the process open
}

async function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  await flush();
}

/**
 * Coerce to a positive integer within bounds.
 *
 * `LIMIT ?` and `INTERVAL ? DAY` are accepted by some MySQL/MariaDB versions
 * as prepared-statement placeholders and rejected by others. Rather than
 * depend on which one the host runs, these two values — never user input,
 * always our own numbers — are forced to integers and inlined. Everything
 * that is actual data still goes through a placeholder.
 */
function positiveInt(value, fallback, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** Most-viewed pages over the last `days` days. */
async function topPages({ days = 30, limit = 15 } = {}) {
  if (!db.isEnabled()) return [];
  const d = positiveInt(days, 30, 3650);
  const n = positiveInt(limit, 15, 500);
  try {
    return await db.query(
      `SELECT path, lang, SUM(views) AS views
         FROM page_views
        WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
        GROUP BY path, lang
        ORDER BY views DESC
        LIMIT ${n}`
    );
  } catch (e) {
    console.error("topPages failed:", e.message);
    return [];
  }
}

/** Total views per day, for a sparkline. */
async function dailyTotals({ days = 30 } = {}) {
  if (!db.isEnabled()) return [];
  const d = positiveInt(days, 30, 3650);
  try {
    return await db.query(
      `SELECT day, SUM(views) AS views
         FROM page_views
        WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
        GROUP BY day
        ORDER BY day ASC`
    );
  } catch {
    return [];
  }
}

module.exports = { middleware, flush, start, stop, topPages, dailyTotals };
