-- Three things: the intensive course's name, a reference for every
-- student, and the counters that hand out the next code.

-- ── 1. The intensive course is not an Individual Session ────────────
--
-- It has been called "Individual Session" since the import, which is
-- the title of a different course entirely — there are two genuine
-- one-to-one courses with that name. Grouping the back office by
-- track put all three under headings that contradicted each other,
-- which is how it finally became obvious.

UPDATE `courses`
   SET `title` = 'Fast Track',
       `seo_title` = NULLIF(CONCAT('Fast Track — ', COALESCE(`level_label`, 'A1 to B1'), ' | LangNation'), '')
 WHERE `slug` = 'intensive-courses' AND `lang` = 'en';

-- The German row, where one exists. Left flagged as untranslated if it
-- already was: renaming it does not make the body German.
UPDATE `courses`
   SET `title` = 'Fast Track'
 WHERE `slug` = 'intensive-courses' AND `lang` = 'de';

-- ── 2. A reference for every student ────────────────────────────────
--
-- student_ref was only ever set by the email-verification path.
-- Accounts created from an approved invitation — which is now the only
-- way an account is made — skipped it entirely, so students had no
-- reference at all. It goes on invoices and certificates, so every
-- student needs one and no two may share it.
--
-- Numbered by when the account was created, so the oldest student is
-- LN-S0001 and the sequence tells a true story.

SET @n := 0;
UPDATE `students`
   SET `student_ref` = CONCAT('LN-S', LPAD((@n := @n + 1), 4, '0'))
 WHERE `deleted_at` IS NULL
 ORDER BY `created_at`, `id`;

-- ── 3. The counters ─────────────────────────────────────────────────
--
-- Year 0 marks a series that does not restart each January: a student
-- reference follows a person for as long as they study here, and a
-- batch code identifies one run of a course forever.
--
-- The student counter is set to however many students now exist, so
-- the next one allocated continues the sequence rather than colliding
-- with the numbers just written above.

INSERT INTO `invoice_counters` (`series`, `year`, `last_number`)
SELECT 'student', 0, COUNT(*) FROM `students` WHERE `deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `last_number` = GREATEST(`last_number`, VALUES(`last_number`));

-- Any batch code already entered by hand, so a generated one cannot
-- land on top of it. Reads the number out of LN-XX-Bnn and keeps the
-- highest per track.
INSERT INTO `invoice_counters` (`series`, `year`, `last_number`)
SELECT CONCAT('batch:', SUBSTRING(`code`, 4, 2)), 0,
       MAX(CAST(SUBSTRING(`code`, 8) AS UNSIGNED))
  FROM `intakes`
 WHERE `code` REGEXP '^LN-[A-Z]{2}-B[0-9]+$'
 GROUP BY SUBSTRING(`code`, 4, 2)
ON DUPLICATE KEY UPDATE `last_number` = GREATEST(`last_number`, VALUES(`last_number`));

SELECT 'students' AS what, COUNT(*) AS n, MIN(`student_ref`) AS first_ref, MAX(`student_ref`) AS last_ref
  FROM `students` WHERE `deleted_at` IS NULL
UNION ALL
SELECT CONCAT('counter ', `series`), `last_number`, NULL, NULL FROM `invoice_counters`;
