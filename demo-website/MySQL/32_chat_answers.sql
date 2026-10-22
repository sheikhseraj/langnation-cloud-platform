-- Answers the assistant has already given.
--
-- A language school gets asked the same dozen things: what does B1
-- cost, do you do the Einbürgerungstest, is there a free trial, where
-- are you. Sending every one of those to an API is money spent to
-- recompute an answer nobody has changed, and it is slower than reading
-- a row.
--
-- So an answer is written down the first time and read back after that.
-- The visitor gets it instantly, and the API is only asked something it
-- has not been asked before.
--
-- ── What is matched ─────────────────────────────────────────────────
--
-- Not the question as typed. `norm` is the question with its case,
-- punctuation and filler stripped, so "What does B1 cost?" and "what
-- does b1 cost" are one row rather than two. `norm_hash` is a sha256 of
-- that, and it is what carries the unique index: a normalised question
-- can be longer than an index on utf8mb4 is allowed to be, and a hash
-- is a fixed 64 characters whatever somebody types.
--
-- `norm` itself is kept, unindexed, because near-matches are scored
-- against it in JavaScript. Two questions that are not identical but
-- mean the same thing should not cost two API calls.
--
-- ── Why lang is part of the key ─────────────────────────────────────
--
-- "Was kostet B1" and "What does B1 cost" normalise differently, so in
-- practice they would not collide -- but a German visitor must never be
-- handed an English answer because the normalising happened to agree.
-- The pair is the key.
--
-- Pure schema: it creates a table and rewrites no row, so
-- lib/migrate.js applies it at boot.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS is a no-op the second
-- time, and the index check reads information_schema first.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS chat_answers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lang          CHAR(2) NOT NULL DEFAULT 'en',
  -- As typed, for the office to read when it wants to know what people
  -- are actually asking.
  question      VARCHAR(500) NOT NULL,
  -- Stripped down, for matching. Not indexed: it is scanned in JS when
  -- the exact lookup misses.
  norm          VARCHAR(500) NOT NULL,
  -- sha256 of `norm`. Fixed length, so the unique index has no limit to
  -- run into whatever somebody types.
  norm_hash     CHAR(64) NOT NULL,
  answer        MEDIUMTEXT NOT NULL,
  hits          INT UNSIGNED NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_chat_answers_q (lang, norm_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The near-match scan reads the most-asked rows first and stops. Without
-- this it is a filesort over the whole table on every cache miss.
SET @ix := (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = 'chat_answers'
               AND index_name = 'idx_chat_answers_popular');
SET @sql := IF(@ix = 0,
  'CREATE INDEX idx_chat_answers_popular ON chat_answers (lang, hits DESC)',
  'SELECT "idx_chat_answers_popular already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
