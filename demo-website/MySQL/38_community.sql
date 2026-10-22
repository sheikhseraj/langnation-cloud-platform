-- Additive community schema. Shared office actors have NULL admin_users IDs.
CREATE TABLE IF NOT EXISTS community_groups (
 id INT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, city VARCHAR(120) NOT NULL,
 description TEXT NOT NULL, platform VARCHAR(16) NOT NULL DEFAULT 'WHATSAPP',
 status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', is_public BOOLEAN NOT NULL DEFAULT FALSE,
 accepting_applications BOOLEAN NOT NULL DEFAULT FALSE, approximate_capacity INT NULL,
 current_member_count INT NULL, invite_link_encrypted TEXT NULL, instructions TEXT NULL,
 invite_delivery_mode VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_members (
 id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(160) NULL,
 normalized_phone VARCHAR(16) NULL UNIQUE, display_phone VARCHAR(40) NULL, city VARCHAR(120) NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING', first_joined_at DATETIME NULL,
 last_activity_at DATETIME NULL, anonymized_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_memberships (
 id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, group_id INT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING', approved_at DATETIME NULL,
 joined_at DATETIME NULL, ended_at DATETIME NULL, verified_by_user_id INT UNSIGNED NULL, verified_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_member_group (member_id, group_id), KEY idx_group_status (group_id, status),
 FOREIGN KEY (member_id) REFERENCES community_members(id),
 FOREIGN KEY (group_id) REFERENCES community_groups(id),
 FOREIGN KEY (verified_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_join_requests (
 id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, group_id INT NOT NULL,
 full_name VARCHAR(160) NULL, normalized_phone VARCHAR(16) NULL, city VARCHAR(120) NULL,
 reason TEXT NULL, referral_source VARCHAR(200) NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
 rules_version VARCHAR(64) NOT NULL, privacy_version VARCHAR(64) NOT NULL,
 rules_accepted_at DATETIME NOT NULL, privacy_accepted_at DATETIME NOT NULL,
 duplicate_of_request_id INT NULL, decided_by_user_id INT UNSIGNED NULL, decision_actor_kind VARCHAR(24) NULL,
 decision_reason TEXT NULL, decided_at DATETIME NULL,
 handoff_status VARCHAR(16) NOT NULL DEFAULT 'NOT_READY', handoff_completed_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_status_date (status, created_at), KEY idx_group_date (group_id, created_at),
 KEY idx_member_date (member_id, created_at),
 FOREIGN KEY (member_id) REFERENCES community_members(id), FOREIGN KEY (group_id) REFERENCES community_groups(id),
 FOREIGN KEY (duplicate_of_request_id) REFERENCES community_join_requests(id),
 FOREIGN KEY (decided_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_screening_results (
 id INT AUTO_INCREMENT PRIMARY KEY, join_request_id INT NOT NULL,
 assessment_type VARCHAR(16) NOT NULL DEFAULT 'RULES', risk_score INT NOT NULL,
 recommendation VARCHAR(16) NOT NULL, reasons JSON NOT NULL, signals JSON NOT NULL,
 screening_version VARCHAR(64) NOT NULL, provider VARCHAR(40) NULL, model VARCHAR(120) NULL,
 assessment_status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED', screened_at DATETIME NOT NULL,
 KEY idx_request (join_request_id, id),
 FOREIGN KEY (join_request_id) REFERENCES community_join_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_reports (
 id INT AUTO_INCREMENT PRIMARY KEY, reporter_member_id INT NULL, reporter_contact VARCHAR(200) NULL,
 reported_member_id INT NULL, group_id INT NOT NULL, category VARCHAR(40) NOT NULL,
 description TEXT NULL, quoted_text TEXT NULL, status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
 severity VARCHAR(16) NOT NULL DEFAULT 'NORMAL', assigned_user_id INT UNSIGNED NULL,
 resolution TEXT NULL, resolved_at DATETIME NULL, privacy_version VARCHAR(64) NULL, privacy_accepted_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_status_date (status, created_at), KEY idx_member (reported_member_id), KEY idx_group (group_id),
 FOREIGN KEY (reporter_member_id) REFERENCES community_members(id),
 FOREIGN KEY (reported_member_id) REFERENCES community_members(id), FOREIGN KEY (group_id) REFERENCES community_groups(id),
 FOREIGN KEY (assigned_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_warnings (
 id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, group_id INT NULL, report_id INT NULL,
 level VARCHAR(24) NOT NULL, reason TEXT NULL, issued_by_user_id INT UNSIGNED NULL,
 actor_kind VARCHAR(24) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', issued_at DATETIME NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_member_status (member_id, status),
 FOREIGN KEY (member_id) REFERENCES community_members(id), FOREIGN KEY (group_id) REFERENCES community_groups(id),
 FOREIGN KEY (report_id) REFERENCES community_reports(id), FOREIGN KEY (issued_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_blocks (
 id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, originating_group_id INT NULL, report_id INT NULL,
 reason TEXT NULL, blocked_by_user_id INT UNSIGNED NULL, actor_kind VARCHAR(24) NOT NULL,
 blocked_at DATETIME NOT NULL, unblocked_at DATETIME NULL, unblocked_by_user_id INT UNSIGNED NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_member_active (member_id, unblocked_at),
 FOREIGN KEY (member_id) REFERENCES community_members(id), FOREIGN KEY (originating_group_id) REFERENCES community_groups(id),
 FOREIGN KEY (report_id) REFERENCES community_reports(id),
 FOREIGN KEY (blocked_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL,
 FOREIGN KEY (unblocked_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_admin_notes (
 id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NULL, join_request_id INT NULL, report_id INT NULL, group_id INT NULL,
 body TEXT NULL, author_user_id INT UNSIGNED NULL, actor_kind VARCHAR(24) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (member_id) REFERENCES community_members(id), FOREIGN KEY (join_request_id) REFERENCES community_join_requests(id),
 FOREIGN KEY (report_id) REFERENCES community_reports(id), FOREIGN KEY (group_id) REFERENCES community_groups(id),
 FOREIGN KEY (author_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_audit_logs (
 id INT AUTO_INCREMENT PRIMARY KEY, actor_user_id INT UNSIGNED NULL, actor_kind VARCHAR(24) NOT NULL,
 action VARCHAR(64) NOT NULL, target_type VARCHAR(32) NOT NULL, target_id INT NOT NULL,
 metadata JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 KEY idx_target_date (target_type, target_id, created_at), KEY idx_actor_date (actor_user_id, created_at),
 FOREIGN KEY (actor_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_settings (
 id INT PRIMARY KEY, feature_enabled BOOLEAN NOT NULL DEFAULT FALSE, applications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 rules_text TEXT NOT NULL, rules_version VARCHAR(64) NOT NULL, privacy_text TEXT NOT NULL, privacy_version VARCHAR(64) NOT NULL,
 low_risk_threshold INT NOT NULL DEFAULT 30, high_risk_threshold INT NOT NULL DEFAULT 60,
 ai_enabled BOOLEAN NOT NULL DEFAULT FALSE, notification_preferences JSON NOT NULL,
 public_reporting_enabled BOOLEAN NOT NULL DEFAULT FALSE, warning_policy JSON NOT NULL,
 screening_patterns JSON NOT NULL, retention_days INT NOT NULL DEFAULT 180, default_handoff_mode VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
