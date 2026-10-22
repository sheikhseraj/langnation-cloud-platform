-- Who put the mark there.
--
-- Attendance can now arrive two ways: a student pressing "Join the
-- class" in their portal, and a teacher taking the register. They are
-- not the same claim and must not be stored as though they were.
--
-- A join says "this person opened the class link". A register says "this
-- person was in my lesson". The first is a useful default and the
-- second is the truth, so the teacher's mark always wins and an
-- automatic one never overwrites it — which is a rule you can only
-- enforce if the row remembers which kind it is.
--
-- `joined_at` is kept separately from `marked_at` for the same reason.
-- One is when they clicked; the other is when the record was last
-- touched, by anybody.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @add := (SELECT GROUP_CONCAT(c) FROM (
  --  'teacher' is the default, because every row that existed before
  --  this migration was put there by a teacher taking a register.
  SELECT 'ADD COLUMN `source` ENUM(''teacher'',''self'') NOT NULL DEFAULT ''teacher'' AFTER `status`' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='attendance' AND column_name='source')
  UNION ALL
  SELECT 'ADD COLUMN `joined_at` DATETIME DEFAULT NULL AFTER `minutes_late`'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='attendance' AND column_name='joined_at')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "attendance already records its source" AS note',
  CONCAT('ALTER TABLE `attendance` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ── When the class actually started ──────────────────────────────────
--  The teacher pressing "Start the class" is what opens the room, so it
--  is the only honest answer to "when did this lesson begin" — and
--  without an answer, "joined within five minutes of the start" has
--  nothing to be five minutes after.
--
--  A register that creates its own lesson still writes midday as a
--  marker for the day. `started_at` stays NULL there, and the portal
--  knows the difference between "the class began at 18:03" and "a
--  register exists for that Tuesday".
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD COLUMN `started_at` DATETIME DEFAULT NULL AFTER `starts_at`',
  'SELECT "lessons.started_at already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'started_at');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT CONCAT(SUM(source = 'self'), ' self-marked of ', COUNT(*), ' attendance row(s)') AS note
  FROM `attendance`;
