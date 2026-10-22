-- A fourth link on a batch: exercises.
--
-- The batch already carries the three links a class runs on — the room,
-- the materials folder and the group chat. Practice work was the one
-- thing still being sent round by hand, which means whoever joins in
-- week three never gets it and a changed link has to be posted again.
--
-- Same shape as the other three: a URL the office sets once, shown only
-- to students on that batch, and shown only when it has actually been
-- filled in. A button that opens nothing is worse than no button.
--
-- Pure schema: it adds a column and changes no row. lib/migrate.js will
-- therefore apply it at boot without anybody opening phpMyAdmin.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `exercise_url` VARCHAR(500) DEFAULT NULL AFTER `whatsapp_url`',
  'SELECT "intakes.exercise_url already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'exercise_url');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
