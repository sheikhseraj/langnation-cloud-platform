-- ─────────────────────────────────────────────────────────────────────
--  LangNation website — database schema
--
--  Run this ONCE against your Hostinger MySQL database:
--    hPanel → Databases → phpMyAdmin → SQL tab → paste → Go
--
--  Only visitor-generated data lives in MySQL. Course, page and blog
--  content is versioned in content/*.json in the repository, so the site
--  keeps serving every page even if the database is unreachable.
--
--  The old site had 44 tables. This one has two.
-- ─────────────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ── Enquiries from the contact form ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(120)  NOT NULL,
  `email`       VARCHAR(180)  NOT NULL,
  `phone`       VARCHAR(40)   DEFAULT NULL,
  `country`     VARCHAR(80)   DEFAULT NULL,
  `course_slug` VARCHAR(120)  DEFAULT NULL,
  `message`     TEXT          NOT NULL,
  `lang`        CHAR(2)       NOT NULL DEFAULT 'en',
  `source_page` VARCHAR(255)  DEFAULT NULL,
  `ip`          VARCHAR(45)   DEFAULT NULL,
  `user_agent`  VARCHAR(255)  DEFAULT NULL,
  `status`      ENUM('new','replied','closed') NOT NULL DEFAULT 'new',
  `created_at`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The admin list is always "newest first, optionally filtered by status".
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_created` (`created_at`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Lightweight page-view counter (optional) ─────────────────────────
--  Enough to answer "which courses do people actually look at?" without
--  loading a third-party analytics script on every page.
CREATE TABLE IF NOT EXISTS `page_views` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `path`       VARCHAR(255) NOT NULL,
  `lang`       CHAR(2)      NOT NULL DEFAULT 'en',
  `day`        DATE         NOT NULL,
  `views`      INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_path_day` (`path`, `lang`, `day`),
  KEY `idx_day` (`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
