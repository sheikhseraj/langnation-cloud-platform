# RDS subnet group
# Restricts database placement to the dedicated private DB subnets
resource "aws_db_subnet_group" "main" {
  name = "${var.project_name}-${var.environment}-db-subnet-group"

  subnet_ids = var.private_db_subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-subnet-group"
    Environment = var.environment
  }
}

# RDS MySQL database
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-mysql"

  engine         = "mysql"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  port     = 3306

  # AWS manages the master password securely in Secrets Manager
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]

  publicly_accessible = false
  multi_az            = true

  backup_retention_period = 7
  copy_tags_to_snapshot    = true

  auto_minor_version_upgrade = true

  # Development / training sandbox settings
  deletion_protection = false
  skip_final_snapshot = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-mysql"
    Environment = var.environment
  }
}