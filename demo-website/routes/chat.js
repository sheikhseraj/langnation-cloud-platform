// ─────────────────────────────────────────────────────────────────────
//  The assistant's one endpoint.
//
//  Cache first, model second. A language school is asked the same dozen
//  things, and an answer already given is instant and free where the
//  model is neither.
//
//  ── Why this is rate limited when nothing else is ───────────────────
//
//  Every other form on this site costs a row. This one costs money, to
//  somebody else, per request. A script pointed at it overnight is a
//  bill rather than a nuisance, so there is a ceiling per address and
//  the answer to hitting it is the office's email — which is what the
//  page would have said anyway.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");

const chat = require("../lib/chat");
const cache = require("../lib/chat-cache");
const links = require("../lib/chat-links");
const nextUp = require("../lib/chat-next");
const site = require("../lib/site");

/* Generous for a person, nowhere near enough for a script. Somebody
   genuinely choosing a course asks five or six things. */
const PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;

const seen = new Map();

function tooMany(ip, now) {
  if (!ip) return false;
  // Swept on use rather than on a timer, so an idle process holds
  // nothing and there is no interval to leak.
  for (const [who, times] of seen) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length) seen.set(who, live);
    else seen.delete(who);
  }
  const mine = seen.get(ip) || [];
  if (mine.length >= PER_WINDOW) return true;
  mine.push(now);
  seen.set(ip, mine);
  return false;
}

const ipOf = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();

/**
 * One answer, ready to show.
 *
 * `answer` is the words with the link syntax removed — what the
 * visitor reads, and what is handed back as conversation context.
 * `parts` is the same answer split into words and links, each link
 * already checked against a real page. The browser builds the bubble
 * from the parts and falls back to the words if there are none, so an
 * answer never depends on this having worked.
 *
 * `suggest` is what to offer underneath. The model writes the first
 * two or three on the end of its own reply, where it has just read the
 * question and knows what it answered; this cuts that line off before
 * anybody sees it, checks what it says, and appends the office button,
 * which is the application's and never the model's.
 *
 * Both the cached answers and the fresh ones come through here — the
 * stored text keeps its SUGGEST line, so a question answered a second
 * time comes back with its buttons and costs nothing at all.
 */
const reply = (raw, lang, said, extra) => {
  const { text, labels } = nextUp.split(raw);
  const parts = links.parts(text, lang);
  return Object.assign(
    { answer: links.plain(text), parts, suggest: nextUp.next(labels, said, lang) },
    extra
  );
};

/** What the page says when it cannot answer. Never a blank reply. */
const fallback = (lang) =>
  lang === "de"
    ? `Das kann ich gerade nicht beantworten. Schreiben Sie uns bitte an ${site.contact.email} — das Büro meldet sich.`
    : `I can't answer that just now. Write to ${site.contact.email} and the office will come back to you.`;

function build() {
  const router = express.Router();

  // Small on purpose: a question is a sentence. The default elsewhere
  // is 64kb and there is no reason for this to reach it.
  router.use(express.json({ limit: "8kb" }));

  router.post("/", async (req, res) => {
    const lang = req.body && req.body.lang === "de" ? "de" : "en";

    if (!chat.configured()) {
      return res.status(503).json({ error: "off", answer: fallback(lang), suggest: [nextUp.only(lang)] });
    }

    const messages = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
    const asked = [...messages].reverse().find((m) => m && m.role === "user");
    const question = asked && typeof asked.content === "string" ? asked.content.trim() : "";
    if (!question) return res.status(400).json({ error: "empty" });

    /* Everything the visitor has typed, so a suggestion for something
       they have already raised is not offered back to them. */
    const said = messages
      .filter((m) => m && m.role === "user" && typeof m.content === "string")
      .map((m) => m.content);

    if (tooMany(ipOf(req), Date.now())) {
      return res.status(429).json({
        error: "slow down",
        answer: fallback(lang),
        suggest: [nextUp.only(lang)],
      });
    }

    /* Only a standalone question is served from, or added to, the
       cache. A follow-up — "and how much is that?" — means nothing
       without the turn before it, and answering the next visitor with
       it would be answering a conversation they never had. */
    const firstTurn = messages.filter((m) => m && m.role === "user").length === 1;

    if (firstTurn) {
      const known = await cache.find(question, lang);
      if (known) {
        return res.json(reply(known.answer, lang, said, { source: known.how }));
      }
    }

    const out = await chat.ask(messages, lang);
    if (!out.ok) {
      /* The office ALONE here. Both providers are down, so there is
         nothing to ask a follow-up of — offering "What does it cost?"
         under "I can't answer that just now" would send somebody
         straight back into the same wall. The only thing left that
         works is a person. */
      return res
        .status(502)
        .json({ error: out.reason, answer: fallback(lang), suggest: [nextUp.only(lang)] });
    }

    /* A truncated answer is shown but never remembered. Caching it
       would make half a sentence the school's permanent answer to that
       question. */
    if (firstTurn && out.whole) {
      await cache.remember(question, out.text, lang);
    }

    return res.json(reply(out.text, lang, said, { source: "model" }));
  });

  return router;
}

module.exports = { build, PER_WINDOW, WINDOW_MS };
