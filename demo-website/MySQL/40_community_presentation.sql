-- Optional community logos reuse existing avatar BLOB storage; parent label is manually maintained.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'community_name');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN community_name VARCHAR(160) DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'image');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN image MEDIUMBLOB DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'image_type');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN image_type VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'image_updated_at');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN image_updated_at DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
