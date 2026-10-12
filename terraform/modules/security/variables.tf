# Define the security module inputs
variable "vpc_id" {
  description = "ID of the VPC where security groups will be created"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "app_port" {
  description = "Application port used by the ECS service"
  type        = number
  default     = 3000
}

variable "db_port" {
  description = "Database port used by the application"
  type        = number
  default     = 3306
}