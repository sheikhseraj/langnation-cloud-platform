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

variable "vpc_cidr" {
  description = "CIDR block for the development VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets in the development environment"
  type        = list(string)

  default = [
    "10.0.1.0/24",
    "10.0.2.0/24"
  ]
}

variable "private_app_subnet_cidrs" {
  description = "CIDR blocks for private application subnets in the development environment"
  type        = list(string)

  default = [
    "10.0.11.0/24",
    "10.0.12.0/24"
  ]
}

variable "private_db_subnet_cidrs" {
  description = "CIDR blocks for private database subnets in the development environment"
  type        = list(string)

  default = [
    "10.0.21.0/24",
    "10.0.22.0/24"
  ]
}

# Add GitHub variables to the dev environment
variable "github_owner" {
  description = "GitHub account or organization that owns the repository"
  type        = string
  default     = "sheikhseraj"
}

variable "github_repository" {
  description = "GitHub repository used for CI/CD"
  type        = string
  default     = "langnation-cloud-platform"
}

variable "github_branch" {
  description = "GitHub branch allowed to deploy to the dev environment"
  type        = string
  default     = "main"
}

# Add immutable GitHub identifiers to the dev environment
variable "github_owner_id" {
  description = "Immutable GitHub repository owner ID"
  type        = string
  default     = "242254883"
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID"
  type        = string
  default     = "1407282665"
}