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

variable "aws_account_id" {
  description = "AWS account ID discovered dynamically by Terraform"
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
# Milestone 9 - LangNation MariaDB Runtime
# ============================================================
#
# These values are supplied dynamically from the database
# Terraform module.
#
# No RDS endpoint, username, password, or Secret ARN is
# hard-coded in the container module.
# ============================================================

variable "db_host" {
  description = "RDS MariaDB hostname used by the LangNation application"
  type        = string
}

variable "db_port" {
  description = "RDS MariaDB port"
  type        = number
}

variable "db_name" {
  description = "LangNation application database name"
  type        = string
}

variable "db_master_secret_arn" {
  description = "Secrets Manager ARN containing the RDS master username and password"
  type        = string
}


# ============================================================
# Milestone 9 - Lina AI / RAG Runtime
# ============================================================

# ------------------------------------------------------------
# Titan Text Embeddings V2
# ------------------------------------------------------------

variable "bedrock_embedding_model_id" {
  description = "Amazon Bedrock embedding model used by Lina for semantic search"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}


# ------------------------------------------------------------
# Lina Grounded Answer Generation
# ------------------------------------------------------------

variable "bedrock_chat_model_id" {
  description = "Amazon Bedrock inference profile used by Lina for grounded answer generation"
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "bedrock_chat_foundation_model_id" {
  description = "Underlying Bedrock foundation model used by the Lina inference profile"
  type        = string
  default     = "anthropic.claude-haiku-4-5-20251001-v1:0"
}


# ------------------------------------------------------------
# S3 Vector Knowledge Store
# ------------------------------------------------------------

variable "vector_bucket_name" {
  description = "Name of the Amazon S3 Vector bucket containing LangNation knowledge vectors"
  type        = string
}

variable "vector_index_name" {
  description = "Name of the Amazon S3 Vector index queried by Lina"
  type        = string
}

variable "vector_index_arn" {
  description = "ARN of the Amazon S3 Vector index queried by the Lina RAG runtime"
  type        = string
}