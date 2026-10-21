# ============================================================
# General Project Configuration
# ============================================================

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


# ============================================================
# ECS Container Configuration
# ============================================================

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

variable "desired_count" {
  description = "Number of ECS Fargate tasks the service should maintain"
  type        = number
  default     = 1
}


# ============================================================
# ECS Networking
# ============================================================

variable "private_app_subnet_ids" {
  description = "IDs of the private application subnets used by ECS Fargate"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "ID of the security group attached to ECS Fargate tasks"
  type        = string
}

variable "target_group_arn" {
  description = "ARN of the ALB target group used by the ECS service"
  type        = string
}


# ============================================================
# ECS Auto Scaling
# ============================================================

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


# ============================================================
# Cognito Authentication
# ============================================================

variable "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool used by the application"
  type        = string
}

variable "cognito_client_id" {
  description = "ID of the Cognito App Client used by the application"
  type        = string
}


# ============================================================
# ECR Repository Configuration
# ============================================================

variable "force_delete" {
  description = "Allow Terraform to delete the ECR repository even when it contains images"
  type        = bool
  default     = false
}


# ============================================================
# Milestone 9 - Lina AI / RAG Runtime
# ============================================================

# Titan Text Embeddings V2 model used to convert
# student questions into 1024-dimensional vectors.
variable "bedrock_embedding_model_id" {
  description = "Amazon Bedrock embedding model used by Lina for semantic search"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}


# Name of the S3 Vector bucket created in Milestone 8.
variable "vector_bucket_name" {
  description = "Name of the Amazon S3 Vector bucket containing LangNation knowledge vectors"
  type        = string
}


# Name of the vector index inside the S3 Vector bucket.
variable "vector_index_name" {
  description = "Name of the Amazon S3 Vector index queried by Lina"
  type        = string
}


# ARN of the vector index.
#
# Used by the ECS task IAM policy so Lina receives
# least-privilege access only to the LangNation knowledge index.
variable "vector_index_arn" {
  description = "ARN of the Amazon S3 Vector index queried by the Lina RAG runtime"
  type        = string
}