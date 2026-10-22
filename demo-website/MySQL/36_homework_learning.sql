-- Reuse the existing chapter and attempt identities; preserve all historical answers.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercises' AND column_name = 'learning_config');
SET @sql := IF(@col = 0, 'ALTER TABLE exercises ADD COLUMN learning_config JSON DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exercise_attempts' AND column_name = 'learning_state');
SET @sql := IF(@col = 0, 'ALTER TABLE exercise_attempts ADD COLUMN learning_state JSON DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
