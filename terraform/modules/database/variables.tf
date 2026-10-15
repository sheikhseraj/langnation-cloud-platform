# Create the Database Module
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "private_db_subnet_ids" {
  description = "Private subnet IDs used by the RDS database subnet group"
  type        = list(string)
}

variable "db_security_group_id" {
  description = "Security group ID assigned to the RDS database"
  type        = string
}

# RDS database configuration
variable "db_instance_class" {
  description = "RDS database instance class"
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
  description = "Initial MySQL database name"
  type        = string
  default     = "langnation"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "langnation_admin"
}