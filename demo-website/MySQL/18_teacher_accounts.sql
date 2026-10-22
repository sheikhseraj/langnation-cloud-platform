-- Staff accounts somebody can actually sign into.
--
-- `admin_users` has existed since migration 02 and has never held a
-- single row. /admin is one shared password out of .env, and migration
-- 10 said the quiet part out loud — "teachers here do not log in, they
-- teach" — which is why a batch carries `teacher_name` as free text
-- next to a `teacher_id` that is always NULL.
--
-- The teacher portal is what changes that, and it cannot be done with
-- the shared password: eight teachers holding the office password is
-- not eight accounts, it is one account and no way to take it back
-- from somebody who leaves.
--
-- So this widens admin_users into the shape `students` already has,
-- because it is the same problem and it was solved once already:
--
--   an invitation they claim      invite_token_hash / invite_expires_at
--   a password only they know     password_hash, now nullable until then
--   a session that can be killed  token_version, carried in the cookie
--   a lock after five guesses     failed_logins / locked_until
--   a face and a phone number     avatar / phone, for the class list
--
-- `status` is the authority on whether somebody may sign in. The older
-- `active` flag stays and is written in step with it, so anything added
-- later that reaches for the obvious column still gets the truth.
--
-- Safe to re-run. Every column is added only if it is missing, and the
-- MODIFYs restate the whole definition rather than changing it.

SET NAMES utf8mb4;

-- ── Teachers are a role, and a role can be taught by nobody yet ──────
--  Restated from 03 so this migration stands on its own: a database
--  restored from an older dump still gets the enum it needs.
ALTER TABLE `admin_users`
  MODIFY `role` ENUM('owner','editor','teacher') NOT NULL DEFAULT 'editor';

--  NULL until the invitation is claimed. The row has to exist first —
--  the office creates it, the teacher chooses the password — and a NOT
--  NULL column would force a placeholder hash, which is a password that
--  somebody eventually guesses.
ALTER TABLE `admin_users`
  MODIFY `password_hash` VARCHAR(100) DEFAULT NULL;


-- ── The columns that make it an account ──────────────────────────────
SET @add := (SELECT GROUP_CONCAT(c) FROM (
  --  Where somebody is in the life of an account, as one column.
  --  'invited'   created by the office, password not chosen yet
  --  'active'    signs in normally
  --  'suspended' kept for the record, refused at the door
  SELECT 'ADD COLUMN `status` ENUM(''invited'',''active'',''suspended'') NOT NULL DEFAULT ''invited'' AFTER `role`' AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='status')
  UNION ALL
  --  Carried inside the signed session cookie and compared on every
  --  request. Bumping it signs that person out of every device at once,
  --  which is what suspending an account has to mean to be worth having.
  SELECT 'ADD COLUMN `token_version` INT UNSIGNED NOT NULL DEFAULT 1'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='token_version')
  UNION ALL
  --  Only the SHA-256 of the link token is stored, so a leaked table
  --  cannot be used to claim anybody's account. The plaintext exists
  --  only in the email that was sent.
  SELECT 'ADD COLUMN `invite_token_hash` CHAR(64) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='invite_token_hash')
  UNION ALL
  SELECT 'ADD COLUMN `invite_expires_at` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='invite_expires_at')
  UNION ALL
  SELECT 'ADD COLUMN `reset_token_hash` CHAR(64) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='reset_token_hash')
  UNION ALL
  SELECT 'ADD COLUMN `reset_expires_at` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='reset_expires_at')
  UNION ALL
  --  Online guessing is what actually gets tried against a login form.
  --  Five wrong answers buys a quarter of an hour.
  SELECT 'ADD COLUMN `failed_logins` SMALLINT UNSIGNED NOT NULL DEFAULT 0'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='failed_logins')
  UNION ALL
  SELECT 'ADD COLUMN `locked_until` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='locked_until')
  UNION ALL
  --  A class needs to be able to reach its teacher, and the office
  --  needs to be able to reach them faster than that.
  SELECT 'ADD COLUMN `phone` VARCHAR(40) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='phone')
  UNION ALL
  --  IANA name. A teacher in Bengaluru and a batch in Europe/Berlin is
  --  the normal case here, not the exception.
  SELECT 'ADD COLUMN `timezone` VARCHAR(64) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='timezone')
  UNION ALL
  --  A sentence about themselves, for the day the team page is fed
  --  from here instead of from a JSON file.
  SELECT 'ADD COLUMN `bio` VARCHAR(400) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='bio')
  UNION ALL
  --  The photo as a column, for the same three reasons as the student
  --  one in migration 12: it is small, it must survive a deploy that
  --  replaces the whole directory, and it must not be reachable by
  --  guessing a URL.
  SELECT 'ADD COLUMN `avatar` MEDIUMBLOB DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='avatar')
  UNION ALL
  SELECT 'ADD COLUMN `avatar_type` VARCHAR(32) DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='avatar_type')
  UNION ALL
  --  Doubles as the cache key: the photo URL carries it, so a new
  --  photo appears at once and an unchanged one is not re-fetched.
  SELECT 'ADD COLUMN `avatar_updated_at` DATETIME DEFAULT NULL'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='avatar_updated_at')
  UNION ALL
  SELECT 'ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='admin_users' AND column_name='updated_at')
) AS t);

SET @sql := IF(@add IS NULL,
  'SELECT "admin_users already has the account columns" AS note',
  CONCAT('ALTER TABLE `admin_users` ', @add));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ── Indexes ──────────────────────────────────────────────────────────
--  A token is looked up by its hash on a page load, and the status
--  filter is every list of teachers the office asks for.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `admin_users` ADD KEY `idx_admin_invite` (`invite_token_hash`)',
  'SELECT "idx_admin_invite already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND index_name = 'idx_admin_invite');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `admin_users` ADD KEY `idx_admin_reset` (`reset_token_hash`)',
  'SELECT "idx_admin_reset already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND index_name = 'idx_admin_reset');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `admin_users` ADD KEY `idx_admin_role_status` (`role`, `status`)',
  'SELECT "idx_admin_role_status already exists" AS note')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND index_name = 'idx_admin_role_status');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ── Anything that was already here ───────────────────────────────────
--  There should be nothing: the table has never been written to. This
--  is for a database restored from a dump where somebody did use it —
--  a row with a password is an account that works, and it should not
--  find itself marked 'invited' and locked out by this migration.
UPDATE `admin_users`
   SET `status` = IF(`active` = 1, 'active', 'suspended')
 WHERE `password_hash` IS NOT NULL AND `status` = 'invited';

SELECT CONCAT(COUNT(*), ' staff account(s), of which ',
              SUM(role = 'teacher'), ' teacher(s)') AS note
  FROM `admin_users`;
