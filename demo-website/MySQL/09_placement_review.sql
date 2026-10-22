-- Everything a teacher needs to review a placement, in the attempt row.
--
-- The result used to live only inside the text of an enquiry, which
-- meant nobody could see which questions were missed, the written task
-- could not be read except in an email, and there was nowhere to record
-- the level a teacher actually decided on. The automatic level was the
-- final word by default, which is exactly backwards.

SET @add := (SELECT GROUP_CONCAT(c) FROM (
  SELECT 'ADD COLUMN `writing` MEDIUMTEXT DEFAULT NULL' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='writing')
  UNION ALL
  SELECT 'ADD COLUMN `writing_words` SMALLINT UNSIGNED NOT NULL DEFAULT 0'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='writing_words')
  UNION ALL
  -- The blocks and every question missed, as JSON. Kept whole rather
  -- than in a second table: it is only ever read back for one attempt,
  -- and never queried across attempts.
  SELECT 'ADD COLUMN `detail` MEDIUMTEXT DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='detail')
  UNION ALL
  -- What a teacher decided, which may differ from what the questions said.
  SELECT 'ADD COLUMN `final_level` VARCHAR(4) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='final_level')
  UNION ALL
  SELECT 'ADD COLUMN `teacher_note` VARCHAR(1000) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='teacher_note')
  UNION ALL
  -- Set when the final result has been emailed, so nobody is told twice
  -- and the list can show what is still waiting.
  SELECT 'ADD COLUMN `confirmed_at` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='confirmed_at')
  UNION ALL
  SELECT 'ADD COLUMN `lang` CHAR(2) NOT NULL DEFAULT ''en'''
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND column_name='lang')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "placement_attempts already has the review columns" AS note',
  CONCAT('ALTER TABLE `placement_attempts` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The admin list is "waiting for review, newest first".
SET @idx := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE `placement_attempts` ADD KEY `idx_review` (`confirmed_at`, `created_at`)',
  'SELECT "index exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='placement_attempts' AND index_name='idx_review');
PREPARE s FROM @idx; EXECUTE s; DEALLOCATE PREPARE s;
