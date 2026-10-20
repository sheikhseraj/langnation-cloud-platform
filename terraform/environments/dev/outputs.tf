
output "aws_account_id" {
  description = "AWS account ID used by Terraform Cloud"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_caller_arn" {
  description = "AWS identity used by Terraform Cloud"
  value       = data.aws_caller_identity.current.arn
}

output "vpc_id" {
  description = "ID of the LangNation development VPC"
  value       = module.networking.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the LangNation development VPC"
  value       = module.networking.vpc_cidr
}

output "public_subnet_ids" {
  description = "Public subnet IDs for the development environment"
  value       = module.networking.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "Private application subnet IDs for the development environment"
  value       = module.networking.private_app_subnet_ids
}

output "private_db_subnet_ids" {
  description = "Private database subnet IDs for the development environment"
  value       = module.networking.private_db_subnet_ids
}

output "internet_gateway_id" {
  description = "Internet Gateway ID for the development environment"
  value       = module.networking.internet_gateway_id
}

output "public_route_table_id" {
  description = "Public route table ID for the development environment"
  value       = module.networking.public_route_table_id
}

# NAT and private route outputs
output "nat_gateway_ids" {
  description = "NAT Gateway IDs for the development environment"
  value       = module.networking.nat_gateway_ids
}

output "nat_eip_ids" {
  description = "NAT Elastic IP allocation IDs for the development environment"
  value       = module.networking.nat_eip_ids
}

output "private_app_route_table_ids" {
  description = "Private application route table IDs for the development environment"
  value       = module.networking.private_app_route_table_ids
}

output "private_db_route_table_ids" {
  description = "Private database route table IDs for the development environment"
  value       = module.networking.private_db_route_table_ids
}

# Security group outputs
output "alb_security_group_id" {
  description = "ALB security group ID for the development environment"
  value       = module.security.alb_security_group_id
}

output "ecs_security_group_id" {
  description = "ECS security group ID for the development environment"
  value       = module.security.ecs_security_group_id
}

output "db_security_group_id" {
  description = "Database security group ID for the development environment"
  value       = module.security.db_security_group_id
}

# ECS cluster and service outputs / Expose the ECR Outputs
output "ecr_repository_url" {
  description = "ECR repository URL for the development environment"
  value       = module.container.ecr_repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name for the development environment"
  value       = module.container.ecr_repository_name
}

# Expose them from dev
output "ecs_cluster_id" {
  description = "ECS cluster ID for the development environment"
  value       = module.container.ecs_cluster_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name for the development environment"
  value       = module.container.ecs_cluster_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN for the development environment"
  value       = module.container.ecs_cluster_arn
}

# Expose the ECS task execution role ARN
output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN for the development environment"
  value       = module.container.ecs_task_execution_role_arn
}

# Exposing the CloudWatch Log Group name
output "cloudwatch_log_group_name" {
  description = "CloudWatch Log Group name for the development environment"
  value       = module.container.cloudwatch_log_group_name
}

# Exposing the ECS task definition ARN and family name
output "ecs_task_definition_arn" {
  description = "ECS task definition ARN for the development environment"
  value       = module.container.ecs_task_definition_arn
}

output "ecs_task_definition_family" {
  description = "ECS task definition family for the development environment"
  value       = module.container.ecs_task_definition_family
}

# Exposing the ECS service name and ID
output "ecs_service_name" {
  description = "ECS Fargate service name for the development environment"
  value       = module.container.ecs_service_name
}

output "ecs_service_id" {
  description = "ECS Fargate service ID for the development environment"
  value       = module.container.ecs_service_id
}

# Exposing the ALB outputs from the load_balancing module
output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = module.load_balancing.alb_dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = module.load_balancing.alb_arn
}

output "target_group_arn" {
  description = "ARN of the ALB target group"
  value       = module.load_balancing.target_group_arn
}

# Exposing the GitHub Actions OIDC provider and role outputs from the cicd module
output "github_actions_role_arn" {
  description = "ARN of the IAM role used by GitHub Actions deployments"
  value       = module.cicd.github_actions_role_arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = module.cicd.github_oidc_provider_arn
}

# Exposing the RDS database subnet group outputs from the database module
output "db_subnet_group_name" {
  description = "Name of the RDS database subnet group"
  value       = module.database.db_subnet_group_name
}

output "db_subnet_group_arn" {
  description = "ARN of the RDS database subnet group"
  value       = module.database.db_subnet_group_arn
}

# Exposing the RDS database instance outputs from the database module
output "db_endpoint" {
  description = "RDS MySQL endpoint"
  value       = module.database.db_endpoint
}

output "db_port" {
  description = "RDS MySQL port"
  value       = module.database.db_port
}

output "db_master_secret_arn" {
  description = "ARN of the RDS master credential secret"
  value       = module.database.db_master_secret_arn
}

# Exposing the S3 storage bucket outputs from the storage module
output "storage_bucket_name" {
  description = "Name of the private LangNation S3 storage bucket"
  value       = module.storage.bucket_name
}

output "storage_bucket_arn" {
  description = "ARN of the private LangNation S3 storage bucket"
  value       = module.storage.bucket_arn
}

# Exposing the ACM certificate outputs from the edge module
output "edge_certificate_arn" {
  description = "ARN of the ACM edge certificate"
  value       = module.edge.certificate_arn
}

output "edge_certificate_validation_options" {
  description = "DNS validation records for the ACM edge certificate"
  value       = module.edge.domain_validation_options
}

# Exposing the AWS WAF Web ACL outputs from the edge module
output "edge_waf_arn" {
  description = "ARN of the CloudFront WAF Web ACL"
  value       = module.edge.web_acl_arn
}

# Exposing the CloudFront distribution outputs from the edge module
output "cloudfront_distribution_id" {
  description = "ID of the LangNation CloudFront distribution"
  value       = module.edge.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.edge.cloudfront_domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID"
  value       = module.edge.cloudfront_hosted_zone_id
}

# Exposing the Cognito User Pool outputs from the authentication module
output "cognito_user_pool_id" {
  description = "ID of the LangNation Cognito User Pool"
  value       = module.authentication.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "ARN of the LangNation Cognito User Pool"
  value       = module.authentication.user_pool_arn
}

output "cognito_user_pool_endpoint" {
  description = "Endpoint of the LangNation Cognito User Pool"
  value       = module.authentication.user_pool_endpoint
}

output "cognito_user_pool_client_id" {
  description = "Client ID used by the LangNation web application"
  value       = module.authentication.user_pool_client_id
}

# ============================================================
# Milestone 7 - Event-Driven Document Processing Outputs
# ============================================================

output "document_queue_arn" {
  description = "ARN of the main document-processing SQS queue"
  value       = module.event_processing.document_queue_arn
}

output "document_queue_url" {
  description = "URL of the main document-processing SQS queue"
  value       = module.event_processing.document_queue_url
}

output "document_dlq_arn" {
  description = "ARN of the document-processing dead-letter queue"
  value       = module.event_processing.document_dlq_arn
}

output "document_dlq_url" {
  description = "URL of the document-processing dead-letter queue"
  value       = module.event_processing.document_dlq_url
}

output "document_processor_function_name" {
  description = "Name of the document processor Lambda function"
  value       = module.event_processing.document_processor_function_name
}

output "document_processor_function_arn" {
  description = "ARN of the document processor Lambda function"
  value       = module.event_processing.document_processor_function_arn
}

output "document_processor_role_arn" {
  description = "ARN of the document processor Lambda execution role"
  value       = module.event_processing.document_processor_role_arn
}

output "document_processor_log_group_name" {
  description = "CloudWatch log group for the document processor Lambda"
  value       = module.event_processing.document_processor_log_group_name
}

output "document_event_source_mapping_uuid" {
  description = "UUID of the SQS to Lambda event source mapping"
  value       = module.event_processing.document_event_source_mapping_uuid
}

output "s3_object_created_rule_name" {
  description = "Name of the EventBridge rule for S3 object-created events"
  value       = module.event_processing.s3_object_created_rule_name
}

output "s3_object_created_rule_arn" {
  description = "ARN of the EventBridge rule for S3 object-created events"
  value       = module.event_processing.s3_object_created_rule_arn
}

# ============================================================
# Milestone 8 - RAG Knowledge Vector Storage Outputs
# ============================================================

output "rag_vector_bucket_name" {
  description = "Name of the S3 Vectors bucket used by the RAG pipeline"
  value       = module.rag_knowledge.vector_bucket_name
}

output "rag_vector_bucket_arn" {
  description = "ARN of the S3 Vectors bucket used by the RAG pipeline"
  value       = module.rag_knowledge.vector_bucket_arn
}

output "rag_vector_index_name" {
  description = "Name of the LangNation RAG vector index"
  value       = module.rag_knowledge.vector_index_name
}

output "rag_vector_index_arn" {
  description = "ARN of the LangNation RAG vector index"
  value       = module.rag_knowledge.vector_index_arn
}