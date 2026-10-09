output "vpc_id" {
  description = "ID of the LangNation VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the LangNation VPC"
  value       = aws_vpc.main.cidr_block
}