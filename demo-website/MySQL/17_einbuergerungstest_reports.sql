-- "Fehler melden" — a learner telling us a question is wrong.
--
-- Ten of the picture answers were wrong for weeks and it took a person
-- sitting down with the catalogue to notice. The people best placed to
-- catch the next one are the ones reading the questions every day, so
-- this is the path from noticing to us hearing about it.
--
-- No account needed, and none recorded. The learner may leave an email
-- if they want an answer; the field is optional and the form says so.
-- Everything else is what is needed to find the question again.

CREATE TABLE IF NOT EXISTS `et_reports` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- The question as the catalogue knows it: "general-226", "bayern-3".
  `question_id` VARCHAR(64)  NOT NULL,
  -- Copied at report time, not looked up later. If we fix the question
  -- the report must still say what it looked like when it was wrong,
  -- otherwise the report reads as nonsense the moment it is acted on.
  `question_no` INT UNSIGNED DEFAULT NULL,
  `question`    TEXT         DEFAULT NULL,
  -- One of: wrong_answer, typo, image, translation, other.
  `kind`        VARCHAR(24)  NOT NULL DEFAULT 'other',
  `message`     TEXT         DEFAULT NULL,
  -- Optional. Null means "they did not want a reply", not "unknown".
  `email`       VARCHAR(190) DEFAULT NULL,
  -- Which language the page was in when they reported it, so a reply
  -- goes back in the language they were reading.
  `lang`        VARCHAR(5)   NOT NULL DEFAULT 'de',
  `ip`          VARCHAR(64)  DEFAULT NULL,
  -- open → the queue. done → dealt with. dismissed → not a fault.
  `status`      VARCHAR(16)  NOT NULL DEFAULT 'open',
  `admin_note`  TEXT         DEFAULT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`, `created_at`),
  -- Several reports about one question is the strongest signal there
  -- is, so grouping by question has to be cheap.
  KEY `idx_question` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
