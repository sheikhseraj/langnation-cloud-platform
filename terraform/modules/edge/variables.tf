# Variables for the edge module
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name used by the AWS edge layer"
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional domain names covered by the ACM certificate"
  type        = list(string)
  default     = []
}