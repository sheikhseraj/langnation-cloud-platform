-- A teacher's name on a batch, without needing an admin_users row.
--
-- intakes.teacher_id points at admin_users, which is empty and will stay
-- empty for a while: teachers here do not log in, they teach. Making the
-- office create a login account for somebody just to write their name on
-- a batch is the kind of friction that ends with every batch unassigned.
--
-- teacher_id stays exactly as it is, for when teachers do get accounts.
-- This is the name shown until then.

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `teacher_name` VARCHAR(120) DEFAULT NULL AFTER `teacher_id`',
  'SELECT "intakes.teacher_name already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'teacher_name');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
