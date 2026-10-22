-- Preserve the exact notices accepted with new submissions; historical requests remain untouched.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_join_requests' AND column_name = 'rules_text_snapshot');
SET @sql := IF(@col = 0, 'ALTER TABLE community_join_requests ADD COLUMN rules_text_snapshot TEXT DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_join_requests' AND column_name = 'privacy_text_snapshot');
SET @sql := IF(@col = 0, 'ALTER TABLE community_join_requests ADD COLUMN privacy_text_snapshot TEXT DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
