# ============================================================
# RDS Database Subnet Group
# ============================================================
#
# Restricts database placement to the dedicated private
# database subnets across multiple Availability Zones.
# ============================================================

resource "aws_db_subnet_group" "main" {
  name = "${var.project_name}-${var.environment}-db-subnet-group"

  subnet_ids = var.private_db_subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-subnet-group"
    Environment = var.environment
  }
}


# ============================================================
# Milestone 9 - RDS MariaDB
# ============================================================
#
# The Capstone demo database matches the production database
# engine family as closely as possible:
#
# Source: MariaDB 11.8.9
# AWS:    Amazon RDS for MariaDB 11.8.9
#
# The database remains:
# - private
# - encrypted
# - Multi-AZ
# - backed up
# - password-managed by AWS Secrets Manager
# ============================================================

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-mariadb"

  # ----------------------------------------------------------
  # Database Engine
  # ----------------------------------------------------------

  engine         = "mariadb"
  engine_version = var.db_engine_version

  instance_class = var.db_instance_class

  # ----------------------------------------------------------
  # Storage
  # ----------------------------------------------------------

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage

  storage_type      = "gp3"
  storage_encrypted = true

  # ----------------------------------------------------------
  # Database Configuration
  # ----------------------------------------------------------

  db_name  = var.db_name
  username = var.db_username
  port     = 3306

  # AWS generates and securely stores the master password
  # inside AWS Secrets Manager.
  manage_master_user_password = true

  # ----------------------------------------------------------
  # Networking
  # ----------------------------------------------------------

  db_subnet_group_name = aws_db_subnet_group.main.name

  vpc_security_group_ids = [
    var.db_security_group_id
  ]

  publicly_accessible = false

  # ----------------------------------------------------------
  # Availability / Resilience
  # ----------------------------------------------------------

  multi_az = true

  # ----------------------------------------------------------
  # Backup
  # ----------------------------------------------------------

  backup_retention_period = 7
  copy_tags_to_snapshot    = true

  # ----------------------------------------------------------
  # Maintenance
  # ----------------------------------------------------------

  auto_minor_version_upgrade = true

  # ----------------------------------------------------------
  # Development / Training Sandbox
  # ----------------------------------------------------------
  #
  # This AWS environment is disposable and rebuilt regularly.
  # Therefore deletion protection and final snapshots are
  # intentionally disabled.
  # ----------------------------------------------------------

  deletion_protection = false
  skip_final_snapshot = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-mariadb"
    Environment = var.environment
  }
}