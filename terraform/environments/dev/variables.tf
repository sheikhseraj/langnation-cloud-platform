variable "aws_region" {
  description = "AWS region used for the LangNation Capstone environment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for naming and tagging AWS resources"
  type        = string
  default     = "langnation-cloud-platform"
}