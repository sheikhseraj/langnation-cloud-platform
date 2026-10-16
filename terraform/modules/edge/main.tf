# TLS certificate used by the CloudFront distribution
resource "aws_acm_certificate" "edge" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-edge-certificate"
    Environment = var.environment
  }
}