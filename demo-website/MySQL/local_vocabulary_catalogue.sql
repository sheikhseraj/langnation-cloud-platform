-- Website database only. Vocabulary IDs stay identical to the Dictionary.
-- Data publication is separate, versioned and atomic; student tables are untouched.
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_revisions (
 revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 entry_count INT UNSIGNED NOT NULL, enabled_count INT UNSIGNED NOT NULL,
 metadata JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_state (
 singleton TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 current_revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 FOREIGN KEY (current_revision) REFERENCES vocabulary_catalogue_revisions(revision)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_entries (
 revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dictionary_entry_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_id INT NOT NULL, primary_level CHAR(2) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 learning_enabled TINYINT(1) NOT NULL DEFAULT 0,
 headword VARCHAR(255) NOT NULL, lemma VARCHAR(255) NOT NULL,
 search_text MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, payload JSON NOT NULL,
 PRIMARY KEY (revision,dictionary_entry_id), UNIQUE KEY uq_catalogue_source (revision,source_id),
 INDEX idx_catalogue_level (revision,learning_enabled,primary_level,source_id),
 INDEX idx_catalogue_lemma (revision,lemma(150)),
 FOREIGN KEY (revision) REFERENCES vocabulary_catalogue_revisions(revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_themes (
 revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dictionary_entry_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (revision,dictionary_entry_id,code), INDEX idx_catalogue_theme (revision,code,dictionary_entry_id),
 FOREIGN KEY (revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_grammar (
 revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dictionary_entry_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (revision,dictionary_entry_id,code), INDEX idx_catalogue_grammar (revision,code,dictionary_entry_id),
 FOREIGN KEY (revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vocabulary_catalogue_types (
 revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dictionary_entry_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (revision,dictionary_entry_id,code), INDEX idx_catalogue_type (revision,code,dictionary_entry_id),
 FOREIGN KEY (revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id)
) ENGINE=InnoDB;
