-- Additive group-rule extensions and administrator-verified post classification.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'custom_rules');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN custom_rules TEXT DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_groups' AND column_name = 'custom_rules_version');
SET @sql := IF(@col = 0, 'ALTER TABLE community_groups ADD COLUMN custom_rules_version VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_reports' AND column_name = 'approved_admin_post');
SET @sql := IF(@col = 0, 'ALTER TABLE community_reports ADD COLUMN approved_admin_post BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'community_reports' AND column_name = 'admin_post_type');
SET @sql := IF(@col = 0, 'ALTER TABLE community_reports ADD COLUMN admin_post_type VARCHAR(24) DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
