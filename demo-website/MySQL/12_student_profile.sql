-- What the student portal shows about a student, and their photo.
--
-- The old portal displayed Location, Time Zone, Date of Birth and
-- Gender on the profile page. Only date_of_birth existed here, which is
-- why the old page printed a date under "Time Zone" — it was reaching
-- for columns that were never there.
--
-- The photo is a column rather than a file on disk. It is one small
-- square per student, it must survive a deploy that replaces the whole
-- directory, and it must never be reachable by guessing a URL — all of
-- which a row gives for free and a file in public/ does not. Held to
-- 256x256 by the browser before it is sent, so these are tens of
-- kilobytes, not megabytes.

SET @add := (SELECT GROUP_CONCAT(c) FROM (
  SELECT 'ADD COLUMN `city` VARCHAR(120) DEFAULT NULL' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='city')
  UNION ALL
  -- IANA name. Classes run online across time zones and a bare local
  -- time is what gets somebody to class an hour late.
  SELECT 'ADD COLUMN `timezone` VARCHAR(64) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='timezone')
  UNION ALL
  -- Free text, not an enum: an enum here would be a list of the genders
  -- we thought of, and the field is optional anyway.
  SELECT 'ADD COLUMN `gender` VARCHAR(40) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='gender')
  UNION ALL
  SELECT 'ADD COLUMN `avatar` MEDIUMBLOB DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='avatar')
  UNION ALL
  SELECT 'ADD COLUMN `avatar_type` VARCHAR(32) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='avatar_type')
  UNION ALL
  -- Doubles as the cache key: the photo URL carries this, so a new
  -- photo appears at once and an unchanged one is not re-fetched.
  SELECT 'ADD COLUMN `avatar_updated_at` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='students' AND column_name='avatar_updated_at')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "students already has the profile columns" AS note',
  CONCAT('ALTER TABLE `students` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
