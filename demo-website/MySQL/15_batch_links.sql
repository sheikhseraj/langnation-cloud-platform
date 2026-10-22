-- The other two links a batch runs on.
--
-- intakes.meeting_url already held the class link. In practice a batch
-- also has a folder of materials and a group chat, and both were being
-- pasted into emails one student at a time — which means a student who
-- joins in week three never gets them, and a link that changes has to
-- be sent round again.
--
-- Kept as plain URLs rather than a links table. There are exactly
-- three, they are named, and each means something specific to the
-- page that shows it; a generic table would make the portal guess
-- which is which.

SET @add := (SELECT GROUP_CONCAT(c) FROM (
  -- Course materials: Drive, Dropbox, OneDrive, whatever the school uses.
  SELECT 'ADD COLUMN `drive_url` VARCHAR(500) DEFAULT NULL AFTER `meeting_url`' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='intakes' AND column_name='drive_url')
  UNION ALL
  -- The class group chat.
  SELECT 'ADD COLUMN `whatsapp_url` VARCHAR(500) DEFAULT NULL AFTER `drive_url`'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='intakes' AND column_name='whatsapp_url')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "intakes already has the link columns" AS note',
  CONCAT('ALTER TABLE `intakes` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
