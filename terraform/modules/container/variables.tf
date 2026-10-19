variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

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

variable "target_group_arn" {
  description = "ARN of the ALB target group used by the ECS service"
  type        = string
}

variable "autoscaling_min_capacity" {
  description = "Minimum number of ECS tasks maintained by Service Auto Scaling"
  type        = number
  default     = 2
}

variable "autoscaling_max_capacity" {
  description = "Maximum number of ECS tasks allowed by Service Auto Scaling"
  type        = number
  default     = 4
}

variable "autoscaling_cpu_target" {
  description = "Target average ECS service CPU utilization percentage"
  type        = number
  default     = 50
}

# Cognito authentication configuration
variable "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool used by the application"
  type        = string
}

variable "cognito_client_id" {
  description = "ID of the Cognito App Client used by the application"
  type        = string
}

# ECR repository configuration
variable "force_delete" {
  description = "Allow Terraform to delete the ECR repository even when it contains images"
  type        = bool
  default     = false
}
