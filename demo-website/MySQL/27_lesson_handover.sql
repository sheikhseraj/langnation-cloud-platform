-- One lesson taught by somebody else.
--
-- A batch already has a standing cover teacher (migration 23), which is
-- the right answer for "who backs this class up all term" and the wrong
-- one for "I cannot take Thursday". Handing over a single date needed
-- somewhere to record it, and the lesson is the only row that knows
-- about one date.
--
-- `teacher_id` NULL means what it has always meant: the batch's own
-- teacher takes it. Set, it means this ONE lesson is somebody else's —
-- and that is also the whole of their access. They can see that lesson
-- and take that register; they cannot open the batch, its other
-- registers, its class list or its materials. The permission is the
-- row, not the course.
--
-- `handover_by` is who arranged it. A teacher can now grant another
-- teacher sight of a class list, which is a decision worth being able
-- to trace back to a person — the office is emailed at the time, and
-- this is the copy that is still here in March.
--
-- `handover_note` is why, shown to the students beside the new name. A
-- different teacher arriving with no explanation reads as a mistake.
--
-- Pure schema: it adds three columns and changes no row, so
-- lib/migrate.js applies it at boot.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `teacher_id` INT UNSIGNED DEFAULT NULL AFTER `intake_id`',
  'SELECT "lessons.teacher_id already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'teacher_id');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `handover_by` INT UNSIGNED DEFAULT NULL AFTER `teacher_id`',
  'SELECT "lessons.handover_by already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'handover_by');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `handover_note` VARCHAR(300) DEFAULT NULL AFTER `handover_by`',
  'SELECT "lessons.handover_note already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'handover_note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- "Which lessons am I standing in for" is asked on every load of a
-- teacher's schedule, by a teacher who owns none of the batches.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD KEY `idx_lesson_teacher` (`teacher_id`, `starts_at`)',
  'SELECT "idx_lesson_teacher already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND index_name = 'idx_lesson_teacher');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- No foreign key to admin_users on purpose. A teacher account that is
-- later closed must not take a lesson's history with it, and ON DELETE
-- SET NULL would quietly erase who taught a class. The name is resolved
-- by a LEFT JOIN, and an id with no account behind it reads as
-- "somebody who has since left" rather than as nothing at all.
