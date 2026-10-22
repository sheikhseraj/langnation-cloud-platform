-- Who was in class.
--
-- One row per student per lesson. The unique key is what makes taking
-- the register twice safe: the second save updates the first rather
-- than adding a second opinion about the same morning.
--
-- `lesson_id`, not a date. A date column here would be a second,
-- worse copy of `lessons`, which has existed since migration 03 and
-- has never had a row written to it because nothing in the system
-- creates one. Taking a register is what finally does — see
-- lib/attendance.js, which finds or creates the lesson for the day.
--
-- Four states rather than a present/absent flag, because the
-- difference between them is the whole value of the record. "Absent"
-- is a student to ring; "excused" is one who told you; "late" is
-- neither, and counting it as absent is how a register stops being
-- trusted by the people filling it in.
--
-- Safe to re-run.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `attendance` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lesson_id`    INT UNSIGNED NOT NULL,
  `student_id`   INT UNSIGNED NOT NULL,
  `status`       ENUM('present','late','absent','excused') NOT NULL DEFAULT 'present',
  -- Only meaningful with status 'late'. Nullable because most people
  -- taking a register will not stop to count minutes, and a column
  -- that forces them to would get zeroes typed into it.
  `minutes_late` SMALLINT UNSIGNED DEFAULT NULL,
  -- "Told me beforehand, hospital appointment." The reason a mark is
  -- what it is, in the teacher's own words.
  `note`         VARCHAR(300) DEFAULT NULL,
  `marked_by`    INT UNSIGNED DEFAULT NULL,
  `marked_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One mark per student per lesson. Re-saving corrects it.
  UNIQUE KEY `uniq_lesson_student` (`lesson_id`, `student_id`),
  -- "How has this student attended?" is the second question anybody
  -- asks of this table, right after "who was in today".
  KEY `idx_student_status` (`student_id`, `status`),
  CONSTRAINT `fk_att_lesson` FOREIGN KEY (`lesson_id`)
    REFERENCES `lessons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_marker` FOREIGN KEY (`marked_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Finding the day's lesson ─────────────────────────────────────────
--  A register is taken for a batch on a date, and has to land on the
--  one lesson row for that batch that day — whether the office put it
--  there in advance or the teacher's own register created it.
--
--  `starts_at` is a DATETIME and there is no date-only index on it, so
--  without this every register does a range scan over the batch's
--  lessons. Small today; not small after a year of daily classes.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `lessons` ADD KEY `idx_intake_day` (`intake_id`, `starts_at`, `status`)',
  'SELECT "idx_intake_day already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'lessons' AND index_name = 'idx_intake_day');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT CONCAT(COUNT(*), ' attendance mark(s) recorded') AS note FROM `attendance`;
