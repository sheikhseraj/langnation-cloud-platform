-- Website only: student learning activity, no Dictionary lexical content.
CREATE TABLE IF NOT EXISTS student_vocabulary_activity (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id INT UNSIGNED NOT NULL,
 dictionary_entry_id VARCHAR(160) NOT NULL,
 event_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 action ENUM('again','difficult','known') NOT NULL,
 mode ENUM('flashcard','quiz') NOT NULL DEFAULT 'flashcard',
 is_new TINYINT(1) NOT NULL DEFAULT 0,
 quiz_correct TINYINT(1) DEFAULT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_student_vocabulary_event (student_id,event_key),
 INDEX idx_student_vocabulary_activity (student_id,created_at),
 FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Short-lived assessment state: Dictionary references/hashes, not lexical content.
CREATE TABLE IF NOT EXISTS student_vocabulary_quiz_sessions (
 quiz_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 student_id INT UNSIGNED NOT NULL,
 state_json JSON NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_student_vocabulary_quiz_expiry (student_id,expires_at),
 FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
