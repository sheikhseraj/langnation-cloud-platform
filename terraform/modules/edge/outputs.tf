# Outputs for the edge module
output "certificate_arn" {
  description = "ARN of the ACM certificate used by the edge layer"
  value       = aws_acm_certificate.edge.arn
}

output "domain_validation_options" {
  description = "DNS records required to validate the ACM certificate"
  value       = aws_acm_certificate.edge.domain_validation_options
}

# Outputs for the AWS WAF Web ACL protecting the CloudFront distribution
output "web_acl_arn" {
  description = "ARN of the AWS WAF Web ACL protecting CloudFront"
  value       = aws_wafv2_web_acl.edge.arn
}

# Outputs for the CloudFront distribution
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID"
  value       = aws_cloudfront_distribution.app.hosted_zone_id
}