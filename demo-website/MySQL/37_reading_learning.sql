-- Additive Lesen extensions to the existing Homework system.
SET NAMES utf8mb4;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'module');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN module VARCHAR(16) NOT NULL DEFAULT ''homework''', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'content_key');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN content_key VARCHAR(120) DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'available_from');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN available_from DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'available_until');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN available_until DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'is_required');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercise_attempts' AND column_name = 'last_opened_at');
SET @sql := IF(@col = 0, 'ALTER TABLE exercise_attempts ADD COLUMN last_opened_at DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
CREATE TABLE IF NOT EXISTS student_vocabulary (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id INT UNSIGNED NOT NULL,
 dictionary_key VARCHAR(160) NOT NULL,
 headword VARCHAR(250) NOT NULL,
 meaning VARCHAR(500) DEFAULT NULL,
 target_language VARCHAR(8) NOT NULL DEFAULT 'en',
 source_exercise_id INT UNSIGNED DEFAULT NULL,
 source_selection VARCHAR(250) DEFAULT NULL,
 source_context VARCHAR(1000) DEFAULT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY unique_student_word (student_id,dictionary_key,target_language),
 CONSTRAINT fk_vocab_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
 CONSTRAINT fk_vocab_exercise FOREIGN KEY (source_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
