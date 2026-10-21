output "ecr_repository_name" {
  description = "Name of the database restore ECR repository"
  value       = aws_ecr_repository.restore.name
}

output "ecr_repository_url" {
  description = "URL of the database restore ECR repository"
  value       = aws_ecr_repository.restore.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the database restore ECR repository"
  value       = aws_ecr_repository.restore.arn
}

output "task_definition_arn" {
  description = "ARN of the database restore ECS task definition"
  value       = aws_ecs_task_definition.restore.arn
}

output "task_definition_family" {
  description = "Family name of the database restore ECS task definition"
  value       = aws_ecs_task_definition.restore.family
}

output "execution_role_arn" {
  description = "ARN of the database restore ECS task execution role"
  value       = aws_iam_role.execution.arn
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group used by database restore tasks"
  value       = aws_cloudwatch_log_group.restore.name
}
