-- Website database: read-only verification after migration 42.
SELECT DATABASE() AS website_database;
SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()
 AND table_name IN ('student_vocabulary_progress','student_vocabulary_settings');
SELECT COUNT(*) AS progress_records FROM student_vocabulary_progress;
SELECT COUNT(*) AS invalid_mastery FROM student_vocabulary_progress WHERE mastery > 100;
SELECT COUNT(*) AS settings_records FROM student_vocabulary_settings;
