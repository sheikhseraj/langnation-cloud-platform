// Deciding whether an enquiry is real.
//
// The form had one defence: a hidden "website" field that naive bots fill
// in. Modern form spammers parse the page and skip hidden inputs, so
// three of the first four enquiries were spam — two link-stuffed bot
// submissions and one cold sales pitch.
//
// No single check catches all of that, so this scores several signals and
// acts on the total. Layers, in rough order of how much they catch:
//
//   1. Turnstile   — a real bot check, when TURNSTILE_SECRET is set
//   2. Honeypot    — free, still catches the laziest bots
//   3. Time trap   — nobody reads and completes a form in three seconds
//   4. Rate limit  — one address cannot send six enquiries in an hour
//   5. Content     — links and sales vocabulary from a stranger
//
// A score at or above BLOCK is not saved at all. Between FLAG and BLOCK it
// is saved and marked spam, so it is visible in the admin but sends no
// email. Below FLAG it is a normal enquiry.
//
// Deliberately biased toward letting things through: a missed spam is an
// annoyance, a blocked student is lost business. Anything uncertain is
// flagged for a human rather than discarded.

const { env } = require("./env");

const BLOCK = 6;
const FLAG = 3;

/** Fastest a person could plausibly fill the form in, in seconds. */
const MIN_SECONDS = 3;

/** How many enquiries one IP may send per hour before it looks automated. */
const MAX_PER_HOUR = 5;

/**
 * Phrases that belong to cold sales outreach, not to someone asking about
 * a German course. Matched case-insensitively as whole phrases, so
 * ordinary questions are unaffected — a student writing "I want to rank
 * up my German" does not contain "rank your website".
 */
const SALES_PHRASES = [
  "seo", "search engine optimi", "rank your website", "first page of google",
  "google ads", "digital marketing", "web design services", "backlink",
  "guest post", "increase your traffic", "lead generation", "cold email",
  "crypto", "bitcoin", "forex", "casino", "jackpot", "lottery", "viagra",
  "loan offer", "investment opportunity", "make money", "work from home",
  "b2b data", "email list", "outsourcing", "hire developers", "app development",
];

/** In-memory record of recent submissions per IP. */
const recent = new Map();

/** Drop anything older than an hour so the map cannot grow without bound. */
function prune(now) {
  const cutoff = now - 3600000;
  for (const [ip, times] of recent) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length) recent.set(ip, kept);
    else recent.delete(ip);
  }
}

function countRecent(ip, now) {
  if (!ip) return 0;
  prune(now);
  return (recent.get(ip) || []).length;
}

function remember(ip, now) {
  if (!ip) return;
  const list = recent.get(ip) || [];
  list.push(now);
  recent.set(ip, list);
}

const turnstileEnabled = () => Boolean(env("TURNSTILE_SECRET", ""));

/**
 * Ask Cloudflare whether the visitor passed the widget.
 *
 * Returns true when there is no secret configured: the widget cannot have
 * been shown, so its absence proves nothing and must not block anyone.
 * A network failure also returns true — Cloudflare being unreachable is
 * not a reason to refuse enquiries.
 */
async function passedTurnstile(token, ip) {
  const secret = env("TURNSTILE_SECRET", "");
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    const json = await res.json();
    return json.success === true;
  } catch {
    return true;
  }
}

/** Count links in a message. */
function linkCount(text) {
  const m = String(text || "").match(/https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/gi);
  return m ? m.length : 0;
}

/**
 * Score one submission. Higher is more suspicious.
 *
 * `reasons` is for the log and the admin, not the visitor: telling a bot
 * which check it failed is telling it how to pass next time.
 */
function score(body = {}, ctx = {}) {
  const reasons = [];
  let n = 0;

  // 1. Honeypot. A person never sees this field.
  if (String(body.website || "").trim()) {
    n += 10;
    reasons.push("honeypot filled");
  }

  // 2. Time trap. The form stamps when it was rendered.
  const started = Number(body.started_at || 0);
  if (started > 0) {
    const seconds = (Date.now() - started) / 1000;
    if (seconds < MIN_SECONDS) {
      n += 4;
      reasons.push(`submitted in ${seconds.toFixed(1)}s`);
    }
    // A form open for over a day is a stale tab or a replayed token.
    if (seconds > 86400) {
      n += 2;
      reasons.push("form older than a day");
    }
  }

  // 3. Rate limit.
  const seen = countRecent(ctx.ip, Date.now());
  if (seen >= MAX_PER_HOUR) {
    n += 5;
    reasons.push(`${seen} from this address within the hour`);
  } else if (seen >= 2) {
    n += 1;
    reasons.push(`${seen} recent from this address`);
  }

  // 4. Links. One can be innocent — a student linking their certificate
  //    or a school they attended — so one alone never reaches the flag
  //    threshold. Two is already unusual in a course enquiry, and three
  //    is an advertisement.
  const links = linkCount(body.message);
  if (links >= 3) n += 5;
  else if (links === 2) n += 3;
  else if (links === 1) n += 2;
  if (links) reasons.push(`${links} link${links > 1 ? "s" : ""}`);

  // 5. Sales vocabulary.
  const haystack = `${body.name || ""} ${body.message || ""}`.toLowerCase();
  const hits = SALES_PHRASES.filter((p) => haystack.includes(p));
  if (hits.length) {
    n += Math.min(4, hits.length * 2);
    reasons.push(`sales wording: ${hits.slice(0, 3).join(", ")}`);
  }

  // 6. Shouting. Bots love capitals; students rarely write in them.
  const msg = String(body.message || "");
  const letters = msg.replace(/[^A-Za-z]/g, "");
  if (letters.length > 25) {
    const upper = (msg.match(/[A-Z]/g) || []).length / letters.length;
    if (upper > 0.6) {
      n += 3;
      reasons.push("mostly capitals");
    }
  }

  // 7. A message with no spaces, or barely any, is not prose.
  if (msg.length > 40 && (msg.match(/\s/g) || []).length < msg.length / 25) {
    n += 3;
    reasons.push("not prose");
  }

  return { score: n, reasons };
}

/**
 * The full decision, including the Turnstile round trip.
 *
 * verdict is "allow", "flag" or "block".
 */
async function assess(body = {}, ctx = {}) {
  const { score: n, reasons } = score(body, ctx);
  let total = n;

  if (turnstileEnabled()) {
    const ok = await passedTurnstile(body["cf-turnstile-response"], ctx.ip);
    if (!ok) {
      total += 10;
      reasons.push("failed the bot check");
    }
  }

  remember(ctx.ip, Date.now());

  const verdict = total >= BLOCK ? "block" : total >= FLAG ? "flag" : "allow";
  return { verdict, score: total, reasons };
}

module.exports = {
  assess,
  score,
  turnstileEnabled,
  siteKey: () => env("TURNSTILE_SITE_KEY", ""),
  BLOCK,
  FLAG,
};
