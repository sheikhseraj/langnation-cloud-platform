
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