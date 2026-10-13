# Add ECR outputs
output "ecr_repository_url" {
  description = "URL of the ECR repository used for the application image"
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_name" {
  description = "Name of the application ECR repository"
  value       = aws_ecr_repository.app.name
}

# Add cluster outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

# Add ECS task execution role outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution IAM role"
  value       = aws_iam_role.ecs_task_execution.arn
}

# Add CloudWatch Log Group output
output "cloudwatch_log_group_name" {
  description = "CloudWatch Log Group used by the ECS application"
  value       = aws_cloudwatch_log_group.app.name
}

# Add ECS task definition outputs
output "ecs_task_definition_arn" {
  description = "ARN of the ECS Fargate task definition"
  value       = aws_ecs_task_definition.app.arn
}

output "ecs_task_definition_family" {
  description = "Family name of the ECS Fargate task definition"
  value       = aws_ecs_task_definition.app.family
}

# Add ECS service outputs
output "ecs_service_name" {
  description = "Name of the ECS Fargate application service"
  value       = aws_ecs_service.app.name
}

output "ecs_service_id" {
  description = "ID of the ECS Fargate application service"
  value       = aws_ecs_service.app.id
}