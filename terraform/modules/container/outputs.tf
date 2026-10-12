# Add ECR outputs
output "ecr_repository_url" {
  description = "URL of the ECR repository used for the application image"
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_name" {
  description = "Name of the application ECR repository"
  value       = aws_ecr_repository.app.name
}