-- Add a neutral study event without changing existing ratings or student results.
-- The normal website boot migration runner applies this after deployment.
-- Fail visibly if the prerequisite table is missing; do not mark this migration applied.
SELECT action FROM student_vocabulary_activity LIMIT 0;
SET @ln_study_action_type = (SELECT COLUMN_TYPE FROM information_schema.columns
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_vocabulary_activity' AND COLUMN_NAME = 'action');
SET @ln_study_action_sql = IF(@ln_study_action_type IS NOT NULL AND LOCATE('studied', @ln_study_action_type) = 0,
 'ALTER TABLE student_vocabulary_activity MODIFY COLUMN action ENUM(''again'',''difficult'',''known'',''studied'') NOT NULL',
 'SELECT ''study event already supported'' AS migration_status');
PREPARE ln_study_action_stmt FROM @ln_study_action_sql;
EXECUTE ln_study_action_stmt;
DEALLOCATE PREPARE ln_study_action_stmt;
