// ─────────────────────────────────────────────────────────────────────
//  MySQL access. Every query in this application goes through this file.
//
//  RULE: SQL lives here and in routes that require it — never in a view,
//  and every value is passed as a `?` placeholder, never concatenated
//  into the string. The old site had 432 queries inside its HTML
//  templates and 167 built by string concatenation; that is what made it
//  both slow and unsafe. Keeping the boundary here is what prevents it
//  coming back.
//
//  The database is OPTIONAL. If DB_* env vars are absent the site still
//  serves every page from the JSON content files — only the enquiry form
//  and admin page need MySQL.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const mysql = require("mysql2/promise");
const awsCaBundle = require("aws-ssl-profiles");
const { env, bool } = require("./env");

let pool = null;
let enabled = false;
let lastError = null;

function init() {
  const host = env("DB_HOST");
  const user = env("DB_USER");
  const database = env("DB_NAME");

  const useTls = bool(
  "DB_SSL",
  /\.rds\.amazonaws\.com$/i.test(host || "")
);

  if (!host || !user || !database) {
    console.log("i  MySQL not configured (DB_HOST/DB_USER/DB_NAME) — enquiries will be logged to disk instead.");
    return false;
  }

  pool = mysql.createPool({
  host,
  port: Number(env("DB_PORT", 3306)),
  user,
  password: env("DB_PASSWORD", ""),
  database,

  // Amazon RDS MariaDB 11.8 requires encrypted transport.
  //
  // RDS endpoints automatically use the AWS CA bundle.
  // Local MariaDB remains unchanged unless DB_SSL=true is set.
  ssl: useTls
    ? {
        ...awsCaBundle,
        rejectUnauthorized: true,
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: Number(env("DB_POOL", 5)),
  queueLimit: 0,
  charset: "utf8mb4_general_ci",
  timezone: "Z",
});
  enabled = true;
  return true;
}

/** Run a query. Values are ALWAYS bound, never interpolated. */
async function query(sql, params = []) {
  if (!enabled) throw new Error("Database is not configured");
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return the first row, or null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** True if MySQL is configured and answering. */
async function healthy() {
  if (!enabled) return false;
  try {
    await pool.query("SELECT 1");
    lastError = null;
    return true;
  } catch (e) {
    lastError = e.message;
    return false;
  }
}

/**
 * Run several statements as one all-or-nothing unit.
 *
 * Needed wherever a half-finished write would be worse than no write. The
 * clearest case is confirming a payment: it claims the next invoice number
 * from `invoice_counters`, writes the invoice, and writes the payment. If
 * that is not atomic then two staff confirming at once can be handed the
 * same invoice number, and a crash half way leaves either a numbered
 * invoice nobody paid or a payment against no invoice. German invoicing
 * requires a gapless sequence, so neither is recoverable by hand.
 *
 * The callback receives a dedicated connection and must use it for every
 * query inside the transaction — using the pool instead would silently run
 * outside it.
 */
async function transaction(fn) {
  if (!enabled) throw new Error("Database is not configured");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({
      query: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      queryOne: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows.length ? rows[0] : null;
      },
    });
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* the connection is already broken; the original error is the useful one */
    }
    throw e;
  } finally {
    conn.release();
  }
}

const isEnabled = () => enabled;
const getLastError = () => lastError;

async function close() {
  if (pool) await pool.end();
}

/**
 * Which optional columns this database actually has.
 *
 * Written after a deploy shipped code that selected intakes.teacher2_id
 * before the migration adding it had been run. Every read in the portal
 * and the teacher portal goes through a safe() wrapper that logs the
 * error and returns an empty list, because a failed panel should not
 * take a page down — so the query failed, the fallback was returned, and
 * a student who was on two courses was shown "0 enrolled courses". The
 * page looked deliberate. Nothing said a column was missing.
 *
 * A missing column is not the same kind of failure as a slow query, and
 * it must not be able to present itself as an empty account. So the
 * columns that arrive in a migration are asked about once, at boot, and
 * the queries that use them are built to match what is actually there.
 *
 * Checked in one query rather than one per column: this runs before the
 * first request and a round trip per column is a round trip wasted.
 */
const optional = new Map();

/* Remembered from the last probe so an administrator can be shown it.
   Both are answers the site has always had and never said out loud. */
let databaseName = null;
let lastMissing = [];
let probed = false;

async function probeColumns(wanted = []) {
  optional.clear();
  lastMissing = [];
  if (!enabled || !wanted.length) return optional;

  for (const key of wanted) optional.set(key, false);

  // Which database this connection actually landed in.
  //
  // Worth recording rather than trusting DB_NAME: an account with eight
  // domains on it can easily have a migration run against the
  // right-looking name on the wrong database, and that looks exactly
  // like a migration that did not work. Nothing else in the system
  // could tell those two apart.
  try {
    const where = await queryOne("SELECT DATABASE() AS db");
    databaseName = where ? where.db : null;
  } catch {
    databaseName = null;
  }
  probed = true;

  try {
    const rows = await query(
      `SELECT CONCAT(table_name, '.', column_name) AS key_name
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND CONCAT(table_name, '.', column_name) IN (${wanted.map(() => "?").join(", ")})`,
      wanted
    );
    for (const r of rows || []) optional.set(String(r.key_name), true);
  } catch (e) {
    unprobed.clear();
    // Unknowable is treated as absent. The queries then run in their
    // older, narrower form, which works against every schema this has
    // ever had — the safe direction to be wrong in.
    console.warn("  ! could not read the schema:", e.message);
  }

  const missing = wanted.filter((k) => !optional.get(k));
  lastMissing = missing;
  if (missing.length) {
    console.warn(
      `\n  ! MIGRATION PENDING — these columns are missing:\n` +
        missing.map((m) => `      ${m}`).join("\n") +
        `\n    The site runs without them, but the features that need them\n` +
        `    are switched off until the migration in MySQL/ is run.\n`
    );
  }
  return optional;
}

/* Keys asked about that nobody probed. Reported once each, loudly.

   hasColumn() answering false for a key that was never asked about is
   indistinguishable from answering false for a column that is missing,
   and the two need opposite fixes: run the migration, or add the column
   to the probe list at boot.

   That cost a feature. lessons.teacher_id was missing from the list, so
   handing a class to another teacher was switched off on a database
   that had the column all along — and the only symptom was a control
   that never appeared. */
const unprobed = new Set();

/** Does this database have that column? False until probeColumns runs. */
function hasColumn(key) {
  if (probed && !optional.has(key) && !unprobed.has(key)) {
    unprobed.add(key);
    console.warn(
      `  ! hasColumn(${JSON.stringify(key)}) was never probed — the feature that ` +
        `needs it is switched off whatever the database says. Add it to ` +
        `probeColumns() in server.js.`
    );
  }
  return optional.get(key) === true;
}

/**
 * What the last probe found, for showing to an administrator.
 *
 * The site knows this at boot and had no way of saying it. Everything
 * downstream of a missing column degrades politely and silently, which
 * is right for a visitor and useless for whoever has to work out why a
 * feature will not switch on — they were left restarting the site and
 * re-running migrations with no way to see which of the two was
 * needed, or whether either was.
 */
function state() {
  return {
    enabled,
    database: databaseName,
    checked: [...optional.keys()],
    missing: [...lastMissing],
    // "Asked and found nothing" and "never asked" look identical from
    // the outside and mean opposite things: the first is a migration to
    // run, the second is a start-up that did not finish. Telling them
    // apart is the difference between fixing the database and fixing
    // the server.
    probed,
  };
}

module.exports = {
  init, query, queryOne, transaction, healthy, isEnabled, getLastError, close,
  probeColumns, hasColumn, state,
};
