-- A batch's weekly pattern, and lessons that can move.
--
-- Until now `lessons` rows were created one at a time, by saveRegister,
-- on the day a teacher happened to take the register. That is enough to
-- record attendance and no use at all as a timetable: nobody can see
-- next Tuesday until next Tuesday, the student portal has nothing to
-- show, and the "when does it meet" question has no answer in the
-- database at all — which is why the dashboard could only ever sort
-- classes by start date.
--
-- So a batch says its pattern once — Monday to Friday, 09:00, two hours
-- — and every lesson between its start and end dates follows from it.
-- Generated, not typed: a pattern that produces sixty rows is one thing
-- to get right instead of sixty.
--
-- ── the pattern ──────────────────────────────────────────────────────
--
-- `meets_days` is a comma list of ISO weekday numbers, Monday = 1. A SET
-- column was the obvious alternative and was not used: SET's ordering is
-- by declaration, its values come back as a comma string anyway, and
-- every query that wanted "does this batch meet on a Tuesday" would be
-- doing FIND_IN_SET either way. A VARCHAR the application parses is the
-- same work with none of the surprise.
--
-- `meets_from` is a TIME and is read as a WALL CLOCK in the batch's own
-- timezone, which it already carries. 09:00 means nine in the morning
-- where the class is, and lib/schedule.js converts that to the instant
-- stored in lessons.starts_at — 07:00 UTC in summer, 08:00 in winter.
-- Storing an offset here instead would be wrong for half the year.
--
-- ── lessons that move ────────────────────────────────────────────────
--
-- `moved_from` remembers where a rescheduled lesson used to be, because
-- "Thursday's class is now Friday" is a different message from "there is
-- a class on Friday", and a student who wrote the old time down needs
-- the first one.
--
-- `change_note` is why — "teacher ill", "public holiday" — shown to
-- students beside the change. A cancellation with no reason reads as a
-- mistake.
--
-- `generated` marks a row this pattern created, so regenerating can
-- replace its own work without touching a lesson somebody scheduled,
-- moved or cancelled by hand. That flag is the whole safety of running
-- the generator repeatedly.
--
-- Safe to re-run.

SET NAMES utf8mb4;

-- ── intakes: the pattern ─────────────────────────────────────────────

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `meets_days` VARCHAR(20) DEFAULT NULL AFTER `timezone`',
  'SELECT "intakes.meets_days already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'meets_days');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `meets_from` TIME DEFAULT NULL AFTER `meets_days`',
  'SELECT "intakes.meets_from already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'meets_from');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `meets_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 120 AFTER `meets_from`',
  'SELECT "intakes.meets_minutes already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'meets_minutes');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── lessons: moved, cancelled, generated ─────────────────────────────

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `moved_from` DATETIME DEFAULT NULL AFTER `starts_at`',
  'SELECT "lessons.moved_from already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'moved_from');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `change_note` VARCHAR(300) DEFAULT NULL AFTER `notes`',
  'SELECT "lessons.change_note already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'change_note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `generated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`',
  'SELECT "lessons.generated already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'generated');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The generator asks "is there already a lesson for this batch on this
-- date", once per date, every time it runs.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD KEY `idx_intake_generated` (`intake_id`, `generated`, `starts_at`)',
  'SELECT "idx_intake_generated already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND index_name = 'idx_intake_generated');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Lessons that already exist were made by saveRegister, one per day a
-- register was taken. They are real history and must never be treated as
-- the generator's own work — `generated` defaults to 0, which is exactly
-- that, so there is nothing to backfill. Said out loud because the
-- opposite would be silent and would delete somebody's attendance.
