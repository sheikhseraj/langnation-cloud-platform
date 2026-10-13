# Define the Load Balancer Module Inputs
variable "vpc_id" {
  description = "ID of the VPC where the Application Load Balancer will be deployed"
  type        = string
}

variable "public_subnet_ids" {
  description = "IDs of the public subnets used by the Application Load Balancer"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "ID of the security group attached to the Application Load Balancer"
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

variable "health_check_path" {
  description = "HTTP path used by the target group health check"
  type        = string
  default     = "/health"
}