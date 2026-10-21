# ============================================================
# General Database Module Configuration
# ============================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}


# ============================================================
# Database Networking
# ============================================================

variable "private_db_subnet_ids" {
  description = "Private subnet IDs used by the RDS database subnet group"
  type        = list(string)
}

variable "db_security_group_id" {
  description = "Security group ID assigned to the RDS database"
  type        = string
}


# ============================================================
# RDS MariaDB Configuration
# ============================================================

variable "db_engine_version" {
  description = "MariaDB engine version used by Amazon RDS"
  type        = string
  default     = "11.8.9"
}

variable "db_instance_class" {
  description = "RDS MariaDB database instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage allocation in GiB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum RDS storage autoscaling limit in GiB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Initial MariaDB database name"
  type        = string
  default     = "langnation"
}

variable "db_username" {
  description = "RDS MariaDB master username"
  type        = string
  default     = "langnation_admin"
}