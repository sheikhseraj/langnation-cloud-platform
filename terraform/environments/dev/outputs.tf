
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