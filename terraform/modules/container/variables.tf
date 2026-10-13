# Add container module variables
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

# Add Task Definition variables
variable "aws_region" {
  description = "AWS region where container resources are deployed"
  type        = string
}

variable "container_port" {
  description = "Port exposed by the application container"
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "CPU units allocated to the Fargate task"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory allocated to the Fargate task in MiB"
  type        = number
  default     = 512
}

variable "image_tag" {
  description = "Docker image tag deployed by ECS"
  type        = string
  default     = "dev"
}

# Add ECS Service variables
variable "private_app_subnet_ids" {
  description = "IDs of the private application subnets used by ECS Fargate"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "ID of the security group attached to ECS Fargate tasks"
  type        = string
}

variable "desired_count" {
  description = "Number of ECS Fargate tasks the service should maintain"
  type        = number
  default     = 1
}