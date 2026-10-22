-- Separate reusable addresses, immutable invoice address versions and student-requested corrections.
-- Schema only; existing invoice amounts and recorded recipients remain unchanged.
SET @ln_address_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='invoice_personal_address'), 'SELECT 1', 'ALTER TABLE students ADD COLUMN invoice_personal_address VARCHAR(400) DEFAULT NULL');
PREPARE ln_address_stmt FROM @ln_address_sql;
EXECUTE ln_address_stmt;
DEALLOCATE PREPARE ln_address_stmt;
SET @ln_address_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='invoice_company_address'), 'SELECT 1', 'ALTER TABLE students ADD COLUMN invoice_company_address VARCHAR(400) DEFAULT NULL');
PREPARE ln_address_stmt FROM @ln_address_sql;
EXECUTE ln_address_stmt;
DEALLOCATE PREPARE ln_address_stmt;
CREATE TABLE IF NOT EXISTS `invoice_address_versions` (
 `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `invoice_id` INT UNSIGNED NOT NULL,
 `revision` INT UNSIGNED NOT NULL,
 `recipient` ENUM('student','company') NOT NULL,
 `billing_name` VARCHAR(200) NOT NULL,
 `billing_address` VARCHAR(400) NOT NULL,
 `source` ENUM('issued','settings','office') NOT NULL,
 `request_id` INT UNSIGNED DEFAULT NULL,
 `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY invoice_revision (invoice_id, revision),
 UNIQUE KEY correction_request (request_id),
 FOREIGN KEY (invoice_id) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `invoice_address_requests` (
 `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `invoice_id` INT UNSIGNED NOT NULL,
 `student_id` INT UNSIGNED NOT NULL,
 `base_revision` INT UNSIGNED NOT NULL,
 `current_recipient` ENUM('student','company') NOT NULL,
 `current_name` VARCHAR(200) NOT NULL,
 `current_address` VARCHAR(400) NOT NULL,
 `wanted_recipient` ENUM('student','company') NOT NULL,
 `wanted_name` VARCHAR(200) NOT NULL,
 `wanted_address` VARCHAR(400) NOT NULL,
 `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 `pending_invoice_id` INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='pending' THEN invoice_id ELSE NULL END) STORED,
 `review_note` VARCHAR(500) DEFAULT NULL,
 `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `reviewed_at` DATETIME DEFAULT NULL,
 UNIQUE KEY one_pending_request (pending_invoice_id),
 KEY request_status (status, created_at),
 KEY request_student (student_id, invoice_id),
 FOREIGN KEY (invoice_id) REFERENCES `invoices` (`id`),
 FOREIGN KEY (student_id) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `invoice_address_notifications` (
 `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `request_id` INT UNSIGNED NOT NULL,
 `event` ENUM('requested','approved','rejected') NOT NULL,
 `to_email` VARCHAR(190) NOT NULL,
 `to_name` VARCHAR(200) NOT NULL,
 `payload` JSON NOT NULL,
 `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
 `next_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `lease_until` DATETIME DEFAULT NULL,
 `lease_token` VARCHAR(64) DEFAULT NULL,
 `sent_at` DATETIME DEFAULT NULL,
 `last_error` VARCHAR(255) DEFAULT NULL,
 UNIQUE KEY request_event (request_id,event),
 KEY pending_mail (sent_at,next_attempt_at,lease_until),
 FOREIGN KEY (request_id) REFERENCES `invoice_address_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
