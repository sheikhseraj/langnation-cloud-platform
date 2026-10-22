-- Website database ONLY. No canonical vocabulary content is stored here.
CREATE TABLE IF NOT EXISTS student_vocabulary_progress (
 student_id INT UNSIGNED NOT NULL,
 dictionary_entry_id VARCHAR(160) NOT NULL,
 saved TINYINT(1) NOT NULL DEFAULT 0,
 learning_status ENUM('new','learning','learned','review') NOT NULL DEFAULT 'new',
 correct_count INT UNSIGNED NOT NULL DEFAULT 0,
 incorrect_count INT UNSIGNED NOT NULL DEFAULT 0,
 mastery TINYINT UNSIGNED NOT NULL DEFAULT 0,
 difficult TINYINT(1) NOT NULL DEFAULT 0,
 source VARCHAR(30) NOT NULL DEFAULT 'vocabulary',
 first_seen_at DATETIME DEFAULT NULL,
 last_seen_at DATETIME DEFAULT NULL,
 last_review_at DATETIME DEFAULT NULL,
 next_review_at DATETIME DEFAULT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (student_id,dictionary_entry_id),
 INDEX idx_student_due (student_id,next_review_at),
 INDEX idx_student_collection (student_id,saved,difficult),
 FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS student_vocabulary_settings (
 student_id INT UNSIGNED NOT NULL PRIMARY KEY,
 daily_target TINYINT UNSIGNED NOT NULL DEFAULT 10,
 FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
