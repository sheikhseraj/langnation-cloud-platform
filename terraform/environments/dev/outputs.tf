
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