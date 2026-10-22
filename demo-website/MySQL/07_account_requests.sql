-- Asking for a student account, rather than simply taking one.
--
-- Registration used to create an account immediately, with email
-- verification as the only gate. That stops nobody: a working email
-- address is free and endless, so anyone could fill the students table.
--
-- Now a person states who they are and why they want an account, the
-- office is emailed, and a human decides. Only after approval does an
-- account exist at all — so the students table holds people who were
-- actually let in.
--
-- Refused requests are kept, not deleted. Someone refused by mistake can
-- be found and reversed, and a stream of requests from one address is
-- evidence rather than a mystery.

CREATE TABLE IF NOT EXISTS `account_requests` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)  NOT NULL,
  `email`         VARCHAR(180)  NOT NULL,
  `phone`         VARCHAR(40)   DEFAULT NULL,
  `country`       VARCHAR(80)   DEFAULT NULL,
  -- Why they want an account, in their own words. The main thing the
  -- person deciding actually reads.
  `purpose`       TEXT          NOT NULL,
  `lang`          CHAR(2)       NOT NULL DEFAULT 'en',

  `status`        ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  -- Set when approved: the one-time secret behind the "create your
  -- account" link. Hashed, never stored in the clear, so a database leak
  -- does not hand out accounts.
  `invite_hash`   CHAR(64)      DEFAULT NULL,
  `invite_expires_at` DATETIME  DEFAULT NULL,
  -- Set once the person has actually used the invitation.
  `used_at`       DATETIME      DEFAULT NULL,

  -- Why it was refused, if it was. Sent to the applicant, so it is
  -- written for them to read rather than as an internal note.
  `decision_note` VARCHAR(500)  DEFAULT NULL,
  `decided_at`    DATETIME      DEFAULT NULL,

  -- Kept for the same reasons as on enquiries: recognising a flood.
  `ip`            VARCHAR(45)   DEFAULT NULL,
  `user_agent`    VARCHAR(255)  DEFAULT NULL,
  `spam_score`    TINYINT UNSIGNED NOT NULL DEFAULT 0,

  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  -- The admin list is "pending first, newest first".
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_email` (`email`),
  -- An invitation is looked up by its hash when the link is followed.
  KEY `idx_invite` (`invite_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
