# Outputs for the RDS database subnet group
output "db_subnet_group_name" {
  description = "Name of the RDS database subnet group"
  value       = aws_db_subnet_group.main.name
}

output "db_subnet_group_arn" {
  description = "ARN of the RDS database subnet group"
  value       = aws_db_subnet_group.main.arn
}

# Outputs for the RDS database instance
output "db_instance_id" {
  description = "RDS database instance identifier"
  value       = aws_db_instance.main.id
}

output "db_endpoint" {
  description = "RDS database endpoint"
  value       = aws_db_instance.main.address
}

output "db_port" {
  description = "RDS database port"
  value       = aws_db_instance.main.port
}

output "db_master_secret_arn" {
  description = "ARN of the AWS-managed RDS master credential secret"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}