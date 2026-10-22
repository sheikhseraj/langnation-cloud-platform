-- A record of which teacher accepted which terms, and when.
--
-- A tick box that is checked and then forgotten proves nothing. The
-- clauses that matter here are the ones about materials — that they
-- stay the school's property, that they may not be sold or used for
-- private teaching, that they come back when somebody leaves — and a
-- clause is only worth having if you can show it was agreed to.
--
-- The version is stored alongside the date rather than derived from
-- it. Terms get amended; "she accepted the terms" is not an answer
-- unless you can say which terms, and looking that up from a date
-- means keeping a separate table of when each version took effect.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @add := (SELECT GROUP_CONCAT(c) FROM (
  SELECT 'ADD COLUMN `terms_accepted_at` DATETIME DEFAULT NULL' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='terms_accepted_at')
  UNION ALL
  -- The dated version of the teacher terms, e.g. '2026-09-13'.
  SELECT 'ADD COLUMN `terms_version` VARCHAR(20) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='terms_version')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "admin_users already records terms acceptance" AS note',
  CONCAT('ALTER TABLE `admin_users` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT CONCAT(SUM(terms_accepted_at IS NOT NULL), ' of ', COUNT(*),
              ' staff account(s) have accepted the teacher terms') AS note
  FROM `admin_users`;
