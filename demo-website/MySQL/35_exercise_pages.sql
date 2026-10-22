-- Pages in a chapter, and tasks that are not marked.
--
-- ── Pages ───────────────────────────────────────────────────────────
--
-- A chapter is seven Übungen and a reading text, and until now it was
-- one scroll of forty-odd questions with nothing to say where one
-- Übung ended and the next began. On paper they are separate pages
-- under their own headings; on screen they were a single list, and a
-- student working through "Übung 5 – noch nicht / nicht mehr" had no
-- way to see that they were in it.
--
-- So each question carries the page it belongs to and that page's
-- heading. Denormalised on purpose: a pages table would be a join on
-- every read of every chapter to fetch one short string, and the
-- heading is written once by the importer and never edited apart from
-- the chapter it is in. `page` defaults to 1, so every chapter that
-- already exists is a one-page chapter and reads exactly as it did.
--
-- ── Tasks with no single right answer ───────────────────────────────
--
-- "Beginne mit dem Ort", "Korrigiere den Fehler", "Verbinde mit weder
-- … noch" — about a third of the school's material is this, and all
-- of it was being thrown away at import. The reason was sound: the
-- workbook prints one model answer, and marking a typed sentence
-- against it fails a student who wrote a different correct German
-- sentence.
--
-- The answer is not to mark them. `open` is a task the student writes
-- into and asks to see the teacher's version of, shown as ONE correct
-- version rather than the correct one. `shown` holds those versions.
--
-- It is a separate column from `accept` deliberately, and that is the
-- whole safety of this: `accept` is what the marker compares against,
-- and anything in it will one day be compared against. A model answer
-- that found its way into that column would silently turn an unmarked
-- task back into a marked one, which is the exact failure this exists
-- to prevent. Nothing reads `shown` except the view that reveals it.
--
-- An open question is also left out of `out_of` when an attempt
-- starts — see startAttempt in lib/exercises.js. A chapter is not 60%
-- because a third of it could not be marked either way.

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND column_name = 'page');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercise_questions` ADD COLUMN `page` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `seq`',
  'SELECT "exercise_questions.page is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND column_name = 'page_title');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercise_questions` ADD COLUMN `page_title` VARCHAR(200) DEFAULT NULL AFTER `page`',
  'SELECT "exercise_questions.page_title is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND column_name = 'shown');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercise_questions` ADD COLUMN `shown` JSON DEFAULT NULL AFTER `accept`',
  'SELECT "exercise_questions.shown is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The enum gains 'open'. Written as the full list because MODIFY
-- replaces the definition rather than adding to it, and read from
-- information_schema first so re-running is a no-op.
SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND column_name = 'kind' AND column_type LIKE '%open%');
SET @sql := IF(@has = 0,
  'ALTER TABLE `exercise_questions` MODIFY `kind` ENUM(''choice'',''gap'',''dropdown'',''open'') NOT NULL',
  'SELECT "exercise_questions.kind already allows open" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Every read of a chapter is "its questions, in order", and the page
-- is now part of that order.
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND index_name = 'idx_exercise_page');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `exercise_questions` ADD KEY `idx_exercise_page` (`exercise_id`, `page`, `seq`)',
  'SELECT "idx_exercise_page is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- And what the page tells the student to do. "Ergänze die richtige
-- Negation" belongs over Übung 1 and says the wrong thing over
-- Übung 7, so it is per page and not per chapter.
SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercise_questions'
                AND column_name = 'page_intro');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercise_questions` ADD COLUMN `page_intro` VARCHAR(300) DEFAULT NULL AFTER `page_title`',
  'SELECT "exercise_questions.page_intro is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Which page the reading text is on.
--
-- A reading page has no questions, and the page list is derived from
-- the questions — so without this the Lesetext would be page eight of
-- a chapter that believes it has seven. Nullable and unset means the
-- old behaviour: the text sits above everything, which is where it
-- was when a chapter was one page.
SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercises'
                AND column_name = 'passage_page');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercises` ADD COLUMN `passage_page` SMALLINT UNSIGNED DEFAULT NULL AFTER `passage`',
  'SELECT "exercises.passage_page is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ...and what that page is called.
--
-- Every other page heading is stored on the questions of that page.
-- A reading page has none, so its heading had nowhere to live and the
-- last page of the chapter came out untitled.
SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'exercises'
                AND column_name = 'passage_title');
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercises` ADD COLUMN `passage_title` VARCHAR(200) DEFAULT NULL AFTER `passage_page`',
  'SELECT "exercises.passage_title is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'a chapter has pages, and tasks that are not marked' AS note;
