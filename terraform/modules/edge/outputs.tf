# Outputs for the edge module
output "certificate_arn" {
  description = "ARN of the ACM certificate used by the edge layer"
  value       = aws_acm_certificate.edge.arn
}

output "domain_validation_options" {
  description = "DNS records required to validate the ACM certificate"
  value       = aws_acm_certificate.edge.domain_validation_options
}