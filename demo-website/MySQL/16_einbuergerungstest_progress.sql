-- Einbürgerungstest progress, kept against an account.
--
-- The practice page works signed-out and keeps everything in the
-- browser. That is deliberate and stays: no account should be needed
-- to revise. This table is for people who do have one and want their
-- progress to survive a new phone.
--
-- One row per student, with the per-question history as JSON rather
-- than 310 rows each. Three reasons: it is written as a whole every
-- time, it is read as a whole every time, and it is the same shape the
-- browser already holds — which makes syncing a merge of two objects
-- rather than a reconciliation of two tables.
--
-- The exam date is the one field the learner sets rather than earns.
-- It is optional, and null means "no date yet", not "today".

CREATE TABLE IF NOT EXISTS `et_progress` (
  `student_id`   INT UNSIGNED NOT NULL,
  -- Which Bundesland's ten questions count for them.
  `bundesland`   VARCHAR(40)  DEFAULT NULL,
  -- Optional target. Drives the countdown and how hard the portal
  -- pushes for practice; never used to lock anything.
  `exam_date`    DATE         DEFAULT NULL,
  -- { "general-1": { "right": 2, "wrong": 0, "seen": 2, "lastWrong": false }, … }
  `history`      MEDIUMTEXT   DEFAULT NULL,
  -- Bookmarked question ids, as a JSON array.
  `saved`        MEDIUMTEXT   DEFAULT NULL,
  -- Finished mock exams: [{ date, correct, total, passed }, …]
  `exams`        MEDIUMTEXT   DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`),
  KEY `idx_exam_date` (`exam_date`),
  CONSTRAINT `fk_et_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
