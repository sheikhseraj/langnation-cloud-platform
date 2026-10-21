variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region used by the restore task"
  type        = string
}

variable "db_endpoint" {
  description = "Current RDS MariaDB endpoint"
  type        = string
}

variable "db_port" {
  description = "Current RDS MariaDB port"
  type        = number
}

variable "db_name" {
  description = "MariaDB database name to restore"
  type        = string
}

variable "db_master_secret_arn" {
  description = "ARN of the RDS-managed master credential secret"
  type        = string
}

variable "expected_table_count" {
  description = "Expected number of tables after a successful restore"
  type        = number
  default     = 58
}

variable "force_delete" {
  description = "Allow deletion of the restore ECR repository even when it contains images"
  type        = bool
  default     = true
}
