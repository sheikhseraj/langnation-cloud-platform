# ============================================================
# General
# ============================================================

variable "project_name" {
  description = "Project name used for governance resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID discovered dynamically"
  type        = string
}


# ============================================================
# Audit Log Retention
# ============================================================

variable "log_retention_days" {
  description = "Number of days CloudTrail audit logs are retained in S3"
  type        = number
  default     = 30
}


# ============================================================
# Disposable Training Sandbox
# ============================================================

variable "force_destroy" {
  description = "Allow the audit bucket to be destroyed in the disposable sandbox"
  type        = bool
  default     = true
}