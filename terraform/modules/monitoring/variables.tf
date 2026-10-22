# ============================================================
# General
# ============================================================

variable "project_name" {
  description = "Project name used for monitoring resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region used by the LangNation platform"
  type        = string
}


# ============================================================
# ECS Fargate
# ============================================================

variable "ecs_cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "ecs_service_name" {
  description = "ECS application service name"
  type        = string
}


# ============================================================
# Application Load Balancer
# ============================================================

variable "alb_arn" {
  description = "Application Load Balancer ARN"
  type        = string
}

variable "target_group_arn" {
  description = "Application target group ARN"
  type        = string
}


# ============================================================
# Amazon RDS
# ============================================================

variable "db_instance_id" {
  description = "RDS DB instance identifier"
  type        = string
}


# ============================================================
# Lambda
# ============================================================

variable "lambda_function_name" {
  description = "Document processing Lambda function name"
  type        = string
}


# ============================================================
# Amazon SQS
# ============================================================

variable "document_queue_arn" {
  description = "ARN of the document processing queue"
  type        = string
}

variable "document_dlq_arn" {
  description = "ARN of the document processing dead-letter queue"
  type        = string
}


# ============================================================
# Amazon CloudFront
# ============================================================

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  type        = string
}