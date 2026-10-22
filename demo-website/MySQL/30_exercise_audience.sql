-- Homework that is not tied to one batch.
--
-- `exercises.intake_id` was NOT NULL, which made "which batch" the
-- first question about a piece of homework and the only answer it could
-- have. Two answers were missing and both are ordinary:
--
--   everybody   — a grammar chapter is not about one batch. The same
--                 Reflexive Verben goes to A2 on Tuesday and to the
--                 intensive group on Thursday, and copying it per batch
--                 means fixing a typo in it four times.
--
--   these three — a student who missed a week, or the teacher trying it
--                 before anybody else sees it. Already possible through
--                 unlock_emails, but only on homework that belonged to
--                 a batch they might not be on.
--
-- So the column becomes nullable and the three states read off what is
-- filled in, with no fourth column to keep in step:
--
--   intake_id set                  → that batch
--   intake_id NULL                 → everybody with an active enrolment
--   unlock_emails set (either way) → only those addresses, and for them
--                                    the batch and the published flag
--                                    are both ignored
--
-- Existing rows keep their batch and so keep behaving exactly as they
-- did. Nothing is rewritten.
--
-- Pure schema: it changes a column definition and no row, so
-- lib/migrate.js applies it at boot.
--
-- Safe to re-run: MODIFY to the same definition is a no-op.

SET NAMES utf8mb4;

-- The foreign key has to come off before the column can be relaxed,
-- and go back on after — MySQL will not modify a column an FK sits on
-- in some versions, and the constraint is what keeps a batch's
-- homework tidy when the batch is deleted.
SET @fk := (SELECT COUNT(*) FROM information_schema.table_constraints
             WHERE table_schema = DATABASE() AND table_name = 'exercises'
               AND constraint_name = 'fk_ex_intake');
SET @sql := IF(@fk > 0,
  'ALTER TABLE `exercises` DROP FOREIGN KEY `fk_ex_intake`',
  'SELECT "fk_ex_intake is already off" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE `exercises` MODIFY `intake_id` INT UNSIGNED DEFAULT NULL;

-- ON DELETE CASCADE stays: homework written for one batch goes when the
-- batch does. Homework for everybody has no batch to be deleted with.
SET @fk := (SELECT COUNT(*) FROM information_schema.table_constraints
             WHERE table_schema = DATABASE() AND table_name = 'exercises'
               AND constraint_name = 'fk_ex_intake');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `exercises` ADD CONSTRAINT `fk_ex_intake` FOREIGN KEY (`intake_id`) REFERENCES `intakes` (`id`) ON DELETE CASCADE',
  'SELECT "fk_ex_intake is already back" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'exercises.intake_id is nullable' AS note;
