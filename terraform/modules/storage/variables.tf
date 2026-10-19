# Storage configuration variables
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

# S3 bucket configuration variables
variable "force_destroy" {
  description = "Allow Terraform to delete the S3 bucket even when it contains objects"
  type        = bool
  default     = false
}
