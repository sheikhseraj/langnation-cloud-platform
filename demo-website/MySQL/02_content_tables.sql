-- ─────────────────────────────────────────────────────────────────────
--  LangNation website — editable content
--
--  Run this ONCE, after 01_create_tables.sql:
--    hPanel → Databases → phpMyAdmin → SQL tab → paste → Go
--
--  Then seed it from the migrated files:
--    npm run content:seed
--
--  Why content moved out of content/*.json and into here: an admin panel
--  that writes files inside the application folder collides with the next
--  `git pull` on the server, and a routine deploy would silently discard
--  edits. Content people edit belongs in the database; code belongs in git.
--
--  The version history that living in git used to provide is replaced by
--  the `revisions` table below — every save keeps the previous version.
--
--  Shape: one row per (slug, lang). English rows are the base; a German row
--  with the same slug overrides it on /de/ pages, and where none exists the
--  English text shows with a "not translated yet" note. That is exactly how
--  the file-based version behaved, so nothing about the public site changes.
-- ─────────────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ── Who can sign in ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`         VARCHAR(180) NOT NULL,
  `name`          VARCHAR(120) NOT NULL,
  -- bcrypt. The plaintext is never stored, never logged, never emailed.
  `password_hash` VARCHAR(100) NOT NULL,
  `role`          ENUM('owner','editor') NOT NULL DEFAULT 'editor',
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at` TIMESTAMP    NULL DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Uploaded images ──────────────────────────────────────────────────
--  One row per upload. `variants` holds the generated WebP widths as JSON,
--  so a template can build a srcset without another query.
CREATE TABLE IF NOT EXISTS `media` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `basename`      VARCHAR(160) NOT NULL,
  `original_name` VARCHAR(255) DEFAULT NULL,
  `alt`           VARCHAR(255) NOT NULL DEFAULT '',
  `width`         INT UNSIGNED DEFAULT NULL,
  `height`        INT UNSIGNED DEFAULT NULL,
  `bytes`         INT UNSIGNED DEFAULT NULL,
  `variants`      TEXT         DEFAULT NULL,
  `folder`        VARCHAR(40)  NOT NULL DEFAULT 'uploads',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by`    INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_basename` (`folder`, `basename`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Courses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `courses` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`              VARCHAR(120) NOT NULL,
  `lang`              CHAR(2)      NOT NULL DEFAULT 'en',
  `title`             VARCHAR(200) NOT NULL,
  `track`             VARCHAR(40)  NOT NULL DEFAULT 'Regular',
  `level`             VARCHAR(4)   DEFAULT NULL,
  `level_label`       VARCHAR(80)  DEFAULT NULL,
  `category`          VARCHAR(120) DEFAULT NULL,
  `code`              VARCHAR(40)  DEFAULT NULL,
  `duration`          VARCHAR(80)  DEFAULT NULL,
  `lectures`          VARCHAR(80)  DEFAULT NULL,
  `quizzes`           INT          DEFAULT NULL,
  `seats`             INT          DEFAULT NULL,
  `price_eur`         DECIMAL(10,2) DEFAULT NULL,
  `price_inr`         DECIMAL(10,2) DEFAULT NULL,
  `discount_eur`      DECIMAL(10,2) DEFAULT NULL,
  `discount_inr`      DECIMAL(10,2) DEFAULT NULL,
  `sticker`           VARCHAR(60)  DEFAULT NULL,
  `upcoming`          TINYINT(1)   NOT NULL DEFAULT 0,
  `summary`           VARCHAR(400) DEFAULT NULL,
  `image_id`          INT UNSIGNED DEFAULT NULL,
  `body_description`  MEDIUMTEXT   DEFAULT NULL,
  `body_curriculum`   MEDIUMTEXT   DEFAULT NULL,
  `body_requirements` MEDIUMTEXT   DEFAULT NULL,
  `body_exam`         MEDIUMTEXT   DEFAULT NULL,
  `seo_title`         VARCHAR(255) DEFAULT NULL,
  `seo_description`   VARCHAR(500) DEFAULT NULL,
  `seo_keywords`      VARCHAR(500) DEFAULT NULL,
  `legacy_url`        VARCHAR(160) DEFAULT NULL,
  `status`            ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  `sort_order`        INT          NOT NULL DEFAULT 0,
  `updated_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`        INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug_lang` (`slug`, `lang`),
  KEY `idx_lang_status` (`lang`, `status`),
  KEY `idx_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Blog posts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `posts` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`            VARCHAR(160) NOT NULL,
  `lang`            CHAR(2)      NOT NULL DEFAULT 'en',
  `title`           VARCHAR(255) NOT NULL,
  `category`        VARCHAR(120) DEFAULT NULL,
  `published_on`    DATE         DEFAULT NULL,
  `excerpt`         VARCHAR(400) DEFAULT NULL,
  `image_id`        INT UNSIGNED DEFAULT NULL,
  `body`            MEDIUMTEXT   DEFAULT NULL,
  `youtube`         VARCHAR(255) DEFAULT NULL,
  `seo_title`       VARCHAR(255) DEFAULT NULL,
  `seo_description` VARCHAR(500) DEFAULT NULL,
  `seo_keywords`    VARCHAR(500) DEFAULT NULL,
  `status`          ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`      INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug_lang` (`slug`, `lang`),
  KEY `idx_lang_status_date` (`lang`, `status`, `published_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Content pages (About, privacy, the Germany guide, …) ─────────────
CREATE TABLE IF NOT EXISTS `pages` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`            VARCHAR(160) NOT NULL,
  `lang`            CHAR(2)      NOT NULL DEFAULT 'en',
  `title`           VARCHAR(255) NOT NULL,
  `page_group`      VARCHAR(60)  DEFAULT NULL,
  `image_id`        INT UNSIGNED DEFAULT NULL,
  `body`            MEDIUMTEXT   DEFAULT NULL,
  `body2`           MEDIUMTEXT   DEFAULT NULL,
  `seo_title`       VARCHAR(255) DEFAULT NULL,
  `seo_description` VARCHAR(500) DEFAULT NULL,
  `seo_keywords`    VARCHAR(500) DEFAULT NULL,
  `legacy_slug`     VARCHAR(160) DEFAULT NULL,
  `status`          ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  `sort_order`      INT          NOT NULL DEFAULT 0,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`      INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug_lang` (`slug`, `lang`),
  KEY `idx_group` (`page_group`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Testimonials ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `testimonials` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ref`        VARCHAR(120) NOT NULL,
  `lang`       CHAR(2)      NOT NULL DEFAULT 'en',
  `name`       VARCHAR(160) NOT NULL,
  `role`       VARCHAR(200) DEFAULT NULL,
  `quote`      TEXT         NOT NULL,
  `image_id`   INT UNSIGNED DEFAULT NULL,
  `status`     ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  `sort_order` INT          NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ref_lang` (`ref`, `lang`),
  KEY `idx_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── FAQs, practice exams and study material ──────────────────────────
--  `faq_group` keeps the three sets apart, exactly as the migration found
--  them: 'FAQ' answers questions, 'Model' holds the telc/Goethe practice
--  papers, 'Resources' the study material.
CREATE TABLE IF NOT EXISTS `faqs` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ref`        VARCHAR(160) NOT NULL,
  `lang`       CHAR(2)      NOT NULL DEFAULT 'en',
  `faq_group`  VARCHAR(40)  NOT NULL DEFAULT 'FAQ',
  `question`   VARCHAR(400) NOT NULL,
  `answer`     MEDIUMTEXT   DEFAULT NULL,
  `status`     ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  `sort_order` INT          NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ref_lang` (`ref`, `lang`),
  KEY `idx_group_order` (`faq_group`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Site settings ────────────────────────────────────────────────────
--  Contact details, social links, the numbers on the homepage. Anything
--  missing here falls back to the matching .env value, so an empty table
--  behaves exactly like the site does today.
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(80)  NOT NULL,
  `value`       TEXT         DEFAULT NULL,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Revision history ─────────────────────────────────────────────────
--  A full snapshot of the row as it was BEFORE each save. This is what
--  replaces the git history that content used to have: it answers "what
--  did this say last week", "who changed it", and "put it back".
CREATE TABLE IF NOT EXISTS `revisions` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity`      VARCHAR(40)  NOT NULL,
  `entity_id`   INT UNSIGNED NOT NULL,
  `lang`        CHAR(2)      NOT NULL DEFAULT 'en',
  `label`       VARCHAR(255) DEFAULT NULL,
  `snapshot`    MEDIUMTEXT   NOT NULL,
  `changed_by`  INT UNSIGNED DEFAULT NULL,
  `changed_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity`, `entity_id`, `changed_at`),
  KEY `idx_when` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
