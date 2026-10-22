-- Drop the separators: LN-S0001 becomes LNS0001, LN-IK-B01 becomes
-- LNIKB01.
--
-- These are quoted on bank transfers and typed into search boxes,
-- where a stray hyphen is the difference between a payment that
-- matches an account and one the office has to chase.
--
-- Safe to run whether or not 13_codes_and_fast_track.sql has been:
-- the student references are rebuilt from scratch either way, and the
-- batch codes are rewritten only where they match the old shape.
--
-- Renumbering references is a one-time liberty. It is only safe while
-- no invoice or certificate has been issued carrying the old ones —
-- true today, and not true again after the first invoice goes out.

-- ── 1. Student references ───────────────────────────────────────────
-- Numbered by when the account was created, so the oldest student is
-- LNS0001 and the sequence tells a true story.

SET @n := 0;
UPDATE `students`
   SET `student_ref` = CONCAT('LNS', LPAD((@n := @n + 1), 4, '0'))
 WHERE `deleted_at` IS NULL
 ORDER BY `created_at`, `id`;

-- ── 2. Batch codes ──────────────────────────────────────────────────
-- Only codes in the old generated shape. Anything the office typed by
-- hand is left exactly as it is: it may already be printed somewhere.

UPDATE `intakes`
   SET `code` = REPLACE(`code`, '-', '')
 WHERE `code` REGEXP '^LN-[A-Z]{2}-B[0-9]+$';

-- ── 3. The counters ─────────────────────────────────────────────────
-- Kept level with what now exists, so the next code allocated
-- continues the sequence rather than colliding with it.

INSERT INTO `invoice_counters` (`series`, `year`, `last_number`)
SELECT 'student', 0, COUNT(*) FROM `students` WHERE `deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `last_number` = GREATEST(`last_number`, VALUES(`last_number`));

-- Reads the track and the number out of LNXXBnn, keeping the highest
-- per track.
INSERT INTO `invoice_counters` (`series`, `year`, `last_number`)
SELECT CONCAT('batch:', SUBSTRING(`code`, 3, 2)), 0,
       MAX(CAST(SUBSTRING(`code`, 6) AS UNSIGNED))
  FROM `intakes`
 WHERE `code` REGEXP '^LN[A-Z]{2}B[0-9]+$'
 GROUP BY SUBSTRING(`code`, 3, 2)
ON DUPLICATE KEY UPDATE `last_number` = GREATEST(`last_number`, VALUES(`last_number`));

SELECT 'students' AS what, COUNT(*) AS n,
       MIN(`student_ref`) AS lowest, MAX(`student_ref`) AS highest
  FROM `students` WHERE `deleted_at` IS NULL
UNION ALL
SELECT 'batches', COUNT(*), MIN(`code`), MAX(`code`) FROM `intakes`
UNION ALL
SELECT CONCAT('counter ', `series`), `last_number`, NULL, NULL FROM `invoice_counters`;
