variable "vpc_cidr" {
  description = "CIDR block for the LangNation VPC"
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