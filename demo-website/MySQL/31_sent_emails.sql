-- A record of what the office sent.
--
-- The admin could reply to an enquiry and write to a student, and
-- neither left anything behind. The enquiry was marked "replied", which
-- says that A reply happened and nothing about what it said; an email
-- written from the compose box left no trace at all. "Did we send Ravi
-- the terms, and when?" had no answer but somebody's memory.
--
-- So every message the office sends is written down here: who it went
-- to, what it said, what was attached, and when. It is the Sent folder,
-- and it is the only copy — the mailbox the mail goes out through is a
-- relay, not an archive.
--
-- ── What is stored, and what is not ─────────────────────────────────
--
-- The body is kept as it was composed, which is the small HTML this
-- site's editor writes, not the finished email. The wrapper around it
-- is generated per send and can be regenerated; what cannot be got back
-- is the sentence somebody wrote.
--
-- Attachments are stored by NAME only. Keeping the files would turn a
-- log into a file store, with everything that implies about size,
-- backups and somebody's documents sitting in a database; the names
-- answer the question that gets asked, which is whether the terms went.
--
-- enquiry_id is nullable on purpose and is deliberately NOT a foreign
-- key. A sent email is a record of something that happened, and it must
-- survive the enquiry being deleted — a cascade here would erase the
-- evidence along with the thing it was evidence about.
--
-- Pure schema: it creates a table and rewrites no row, so
-- lib/migrate.js applies it at boot.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS is a no-op the second
-- time, and the index check below reads information_schema first.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sent_emails (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Which enquiry this answered, when it answered one.
  enquiry_id    INT UNSIGNED NULL,
  to_email      VARCHAR(190) NOT NULL,
  to_name       VARCHAR(190) NULL,
  subject       VARCHAR(255) NOT NULL,
  -- As composed, not as sent. MEDIUMTEXT because a long reply with a
  -- few links is comfortably past what TEXT holds once it is HTML.
  body          MEDIUMTEXT NULL,
  -- Filenames, tab-separated. A name may contain a comma; it cannot
  -- contain a tab, because lib/attachments.js strips control characters
  -- out of every name before the file is ever attached.
  attachments   VARCHAR(600) NULL,
  -- Who in the office sent it, when there is more than one of them.
  sent_by       VARCHAR(190) NULL,
  sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Newest first is the only way this is ever read.
SET @ix := (SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = 'sent_emails'
               AND index_name = 'idx_sent_emails_sent_at');
SET @sql := IF(@ix = 0,
  'CREATE INDEX idx_sent_emails_sent_at ON sent_emails (sent_at DESC)',
  'SELECT "idx_sent_emails_sent_at already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ...and "everything we ever sent this person", which is the other
-- question somebody asks of a Sent folder.
SET @ix2 := (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE()
                AND table_name = 'sent_emails'
                AND index_name = 'idx_sent_emails_to');
SET @sql2 := IF(@ix2 = 0,
  'CREATE INDEX idx_sent_emails_to ON sent_emails (to_email)',
  'SELECT "idx_sent_emails_to already exists" AS note');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
