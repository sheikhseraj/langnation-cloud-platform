-- One placement attempt per address per day.
--
-- The test could be taken again and again with the same address, which
-- is worth stopping for two reasons. A second attempt straight after
-- the first measures memory of the questions rather than German, so the
-- level it reports is wrong. And a person retaking it until they get
-- the answer they wanted ends up in a class they cannot follow, which
-- costs them weeks and costs the school a refund.
--
-- Attempts are recorded rather than deleted, so the office can see the
-- history and reset a genuine case — somebody whose connection dropped
-- halfway, most often.

CREATE TABLE IF NOT EXISTS `placement_attempts` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(180) NOT NULL,
  `name`       VARCHAR(120) DEFAULT NULL,
  `track`      VARCHAR(20)  NOT NULL,
  -- Null while the test is open: a row is written when the paper is
  -- issued, so abandoning halfway still counts as an attempt. Otherwise
  -- the limit is escaped by never pressing submit.
  `placement`  VARCHAR(4)   DEFAULT NULL,
  `score`      TINYINT UNSIGNED DEFAULT NULL,
  -- Set by the office to let somebody sit it again before the day is up.
  `reset_at`   DATETIME     DEFAULT NULL,
  `ip`         VARCHAR(45)  DEFAULT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The question asked on every attempt: has this address sat one
  -- recently, ignoring any the office has reset.
  KEY `idx_email_created` (`email`, `created_at`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
