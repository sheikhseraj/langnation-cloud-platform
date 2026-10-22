-- Unlock one exercise for named people, by email.
--
-- For trying homework out before a class gets it. Put an email address
-- on an exercise and that person sees it in their portal and nobody
-- else does — including on a batch they are not enrolled on, and
-- including while the exercise is still a draft. That is the whole
-- point: the teacher wants to sit their own homework the way a student
-- will, before twelve people are looking at it.
--
-- The rule, spelt out because a visibility rule that is only in code
-- is a visibility rule nobody can check:
--
--   empty  → the ordinary rule. Published, and you are enrolled on the
--            batch it belongs to.
--   set    → ONLY the addresses listed. Enrolment and published are
--            both bypassed for them, and everybody else sees nothing,
--            whether they are enrolled or not.
--
-- So filling this in makes an exercise MORE private, never less. An
-- address that is not in the list is an address that cannot see it.
--
-- One address per line, or separated by commas. Compared after
-- trimming and lower-casing, because an address typed into a textarea
-- arrives with whatever spacing and capitals somebody used.
--
-- Pure schema: it adds a column and changes no row, so lib/migrate.js
-- applies it at boot.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `exercises` ADD COLUMN `unlock_emails` TEXT DEFAULT NULL AFTER `published`',
  'SELECT "exercises.unlock_emails already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'unlock_emails');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
