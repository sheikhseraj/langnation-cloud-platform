-- Let a batch's status follow its own dates, unless somebody says not to.
--
-- `status` is typed in by hand today, which means it is right on the day
-- it is set and drifts from then on. A batch starting the 16th sits on
-- "planned" until somebody remembers to change it — and the student
-- portal keys "Join the class" off `status = 'running'`, so the class
-- starts and the join button is not there. That is the bug this came
-- from: two courses enrolled, one joinable, and nothing on the page
-- explaining why.
--
-- The obvious fix is to derive the status from the dates and stop
-- storing it. Not done, for two reasons: every query in the portal, the
-- teacher portal and the office reads `i.status`, and some batches
-- genuinely need a status the dates do not imply — a course cancelled
-- before it starts, or one held open a week longer than advertised.
--
-- So the column stays and a flag says who owns it. `status_auto = 1`
-- (the default, and what every existing row gets) means a sweep moves
-- it: planned to running on the start date, running to finished after
-- the end date. Setting the status by hand in the editor clears the
-- flag, and the sweep then leaves that row alone for good.
--
-- The sweep never touches 'cancelled'. A cancelled batch whose dates
-- have arrived is still cancelled, and there is no date at which that
-- stops being true.
--
-- Safe to re-run.

SET NAMES utf8mb4;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD COLUMN `status_auto` TINYINT(1) NOT NULL DEFAULT 1 AFTER `status`',
  'SELECT "intakes.status_auto already exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'status_auto');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The sweep filters on it, so it is worth having beside the status.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `intakes` ADD KEY `idx_status_auto` (`status_auto`, `status`)',
  'SELECT "idx_status_auto already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'intakes' AND index_name = 'idx_status_auto');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- One thing to know before running this: the flag defaults to 1, so
-- every EXISTING batch starts out automatic. If any of them carry a
-- status that disagrees with their dates — a batch marked "planned"
-- whose start date passed months ago — the first sweep will correct it.
-- That is the intended behaviour and is why this migration exists, but
-- it means the correction happens all at once on the first restart
-- rather than gradually.
--
-- To hold a particular batch where it is, open it in the editor and
-- untick "Follow the dates" before restarting. Cancelled batches need
-- nothing: the sweep never touches them.
