# Define the CI/CD Module Inputs
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "github_owner" {
  description = "GitHub repository owner"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name"
  type        = string
}

variable "ecr_repository_arn" {
  description = "ARN of the ECR repository used by the deployment workflow"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster deployed by the container module"
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS service deployed by the container module"
  type        = string
}

variable "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role used by the task definition"
  type        = string
}

# Define the GitHub Actions OpenID Connect Provider Inputs
# Add the GitHub branch variable
variable "github_branch" {
  description = "GitHub branch allowed to assume the AWS deployment role"
  type        = string
  default     = "main"
}

# Define the GitHub Actions OpenID Connect Provider Inputs
variable "github_owner_id" {
  description = "Immutable GitHub repository owner ID"
  type        = string
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID"
  type        = string
}