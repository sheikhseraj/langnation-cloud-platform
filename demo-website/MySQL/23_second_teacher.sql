-- A second teacher on a batch, for the day the first one cannot make it.
--
-- A batch has carried exactly one teacher since migration 03, which is
-- true of who normally teaches it and false of who is standing in front
-- of the class on any given Tuesday. When the usual teacher is ill the
-- cover teacher cannot start the lesson, cannot open the register and
-- cannot see the roster — lib/teaching.js puts `teacher_id = ?` in the
-- WHERE clause of every query, which is the right way to do access
-- control and exactly why there is no way round it from the outside.
--
-- So: a second slot, mirroring the first exactly. `teacher2_id` is the
-- account, `teacher2_name` the typed-in name for somebody without one —
-- the same pair, for the same reason, as migration 10 explains.
--
-- Deliberately two columns rather than a join table. A join table is the
-- better shape for "many teachers", but that is not what this is: it is
-- primary and cover, a fixed pair with different meanings, and the
-- ordering matters. Modelling it as a set would lose which one is the
-- fallback, and every query would have to sort the rows to find out.
-- If a batch ever genuinely needs five teachers, that is a join table
-- and a different migration.
--
-- Safe to re-run: every step is added only if it is missing.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `teacher2_id` INT UNSIGNED DEFAULT NULL AFTER `teacher_name`',
  'SELECT "intakes.teacher2_id already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'teacher2_id');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `teacher2_name` VARCHAR(120) DEFAULT NULL AFTER `teacher2_id`',
  'SELECT "intakes.teacher2_name already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'teacher2_name');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The teacher portal filters batches by this column on every request, so
-- it is worth an index for the same reason idx_teacher is.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD KEY `idx_teacher2` (`teacher2_id`)',
  'SELECT "idx_teacher2 already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND index_name = 'idx_teacher2');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ON DELETE SET NULL, matching fk_intakes_teacher: removing a staff
-- account must not take the batch with it. The batch still happened.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD CONSTRAINT `fk_intakes_teacher2` FOREIGN KEY (`teacher2_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL',
  'SELECT "fk_intakes_teacher2 already exists" AS note')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'intakes'
    AND constraint_name = 'fk_intakes_teacher2');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
