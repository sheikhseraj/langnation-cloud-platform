-- Give courses somewhere to keep their image.
--
-- The table shipped with `image_id`, a foreign key into `media`, which is
-- the right shape for images uploaded through the editor later. But the
-- images this site actually has are static files under /img/courses with
-- a src and a responsive srcset, and there is no media row to point at.
--
-- So the migration had nothing to write and toCourse() had nothing to
-- read, and every course image disappeared the moment the site started
-- reading courses from MySQL. These two columns hold what the JSON held.
--
-- image_id stays. When uploads arrive it becomes the preferred source and
-- these two remain the fallback for the images already on disk.

SET @add_src := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `courses` ADD COLUMN `image_src` VARCHAR(255) DEFAULT NULL AFTER `image_id`',
    'SELECT "image_src exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'image_src'
);
PREPARE s FROM @add_src; EXECUTE s; DEALLOCATE PREPARE s;

SET @add_set := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `courses` ADD COLUMN `image_srcset` VARCHAR(600) DEFAULT NULL AFTER `image_src`',
    'SELECT "image_srcset exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'image_srcset'
);
PREPARE s FROM @add_set; EXECUTE s; DEALLOCATE PREPARE s;

-- Whether this row's text is really in its own language.
--
-- The JSON layer set `translated: true` for English and worked it out for
-- German from whether an override existed. Coming from MySQL there was no
-- equivalent, so the flag was undefined, and every course page — English
-- ones included — displayed "not translated into German yet".
--
-- A German row starts as a copy of the English text, so it must not claim
-- to be German until something actually translates it. English rows are
-- translated by definition.

SET @add_tr := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `courses` ADD COLUMN `translated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`',
    'SELECT "translated exists" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'translated'
);
PREPARE s FROM @add_tr; EXECUTE s; DEALLOCATE PREPARE s;

-- English is its own language.
UPDATE `courses` SET `translated` = 1 WHERE `lang` = 'en';
