-- Mark enquiries the spam check was unsure about.
--
-- Three of the first four enquiries were spam. The form's only defence
-- was a hidden field that modern spammers skip, so lib/spam.js now scores
-- several signals instead.
--
-- Anything clearly automated is refused outright and never reaches this
-- table. The uncertain middle is stored with spam_score set and status
-- 'spam', so it is visible in the admin and can be recovered if the
-- check was wrong — a blocked student costs more than a stored advert.

SET @add_status := (
  SELECT IF(LOCATE('spam', COLUMN_TYPE) = 0,
    "ALTER TABLE `enquiries` MODIFY COLUMN `status` ENUM('new','replied','closed','spam') NOT NULL DEFAULT 'new'",
    'SELECT "status already has spam" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'enquiries' AND column_name = 'status'
);
PREPARE s FROM @add_status; EXECUTE s; DEALLOCATE PREPARE s;

SET @add_score := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `enquiries` ADD COLUMN `spam_score` TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `status`',
    'SELECT "spam_score exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'enquiries' AND column_name = 'spam_score'
);
PREPARE s FROM @add_score; EXECUTE s; DEALLOCATE PREPARE s;

-- Why it was flagged, for whoever reviews it.
SET @add_why := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `enquiries` ADD COLUMN `spam_reasons` VARCHAR(255) DEFAULT NULL AFTER `spam_score`',
    'SELECT "spam_reasons exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'enquiries' AND column_name = 'spam_reasons'
);
PREPARE s FROM @add_why; EXECUTE s; DEALLOCATE PREPARE s;
