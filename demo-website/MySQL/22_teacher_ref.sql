-- A reference number for a teacher, the way a student has one.
--
--   LNS0001   a student, for life
--   LNT0001   a teacher, likewise
--
-- One letter apart on purpose. They are read side by side on a batch
-- and in the office's own notes, and a reference that has to be
-- explained is one that gets written down wrong. Their own counters
-- mean LNT0001 and LNS0001 both exist without either being a mistake.
--
-- Unique, and NULL until the invitation is claimed — the same rule as
-- `students.student_ref`. An invitation nobody ever opens would
-- otherwise burn a number and leave a gap in the sequence that reads
-- like a teacher who was deleted. MySQL allows any number of NULLs in
-- a unique index, which is exactly the behaviour wanted here.
--
-- Nothing depends on it yet. It exists because it will be on the
-- timetable, on a payslip and on whatever the school issues next, and
-- because adding it to a table with rows in it later is a migration
-- with a backfill in it rather than one line.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `admin_users` ADD COLUMN `teacher_ref` VARCHAR(20) DEFAULT NULL AFTER `id`',
  'SELECT "admin_users.teacher_ref already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND column_name = 'teacher_ref');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `admin_users` ADD UNIQUE KEY `uniq_teacher_ref` (`teacher_ref`)',
  'SELECT "uniq_teacher_ref already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND index_name = 'uniq_teacher_ref');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ── Anybody who is already active ────────────────────────────────────
--  A teacher who claimed their account before this migration has no
--  reference and would never be given one, because the code only
--  issues them at the moment an invitation is claimed. They are
--  numbered here, oldest first, so the sequence follows the order
--  people actually joined.
--
--  The counter is then moved past whatever was issued, so the next
--  teacher to claim an invitation does not collide with them.
SET @seq := (SELECT COALESCE(MAX(CAST(SUBSTRING(teacher_ref, 4) AS UNSIGNED)), 0)
               FROM `admin_users` WHERE teacher_ref REGEXP '^LNT[0-9]+$');

UPDATE `admin_users`
   SET `teacher_ref` = CONCAT('LNT', LPAD((@seq := @seq + 1), 4, '0'))
 WHERE `teacher_ref` IS NULL
   AND `status` = 'active'
   AND `password_hash` IS NOT NULL
 ORDER BY `created_at`, `id`;

--  invoice_counters is where every code in the school is allocated
--  from; year 0 is the row that says "this series has no year".
INSERT INTO `invoice_counters` (`series`, `year`, `last_number`)
VALUES ('teacher', 0, @seq)
ON DUPLICATE KEY UPDATE `last_number` = GREATEST(`last_number`, @seq);

SELECT CONCAT(COUNT(*), ' teacher(s) have a reference; next is LNT',
              LPAD((SELECT last_number + 1 FROM invoice_counters
                     WHERE series = 'teacher' AND year = 0), 4, '0')) AS note
  FROM `admin_users` WHERE `teacher_ref` IS NOT NULL;
