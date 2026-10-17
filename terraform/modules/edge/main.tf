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

# AWS WAF Web ACL protecting the CloudFront distribution
resource "aws_wafv2_web_acl" "edge" {
  name        = "${var.project_name}-${var.environment}-edge-waf"
  description = "WAF protection for the LangNation CloudFront edge layer"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # AWS managed protection against common web attacks
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # Basic protection against abusive request rates
  rule {
    name     = "RateLimitPerIP"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-edge-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-edge-waf"
    Environment = var.environment
  }
}

# AWS managed cache policy that disables caching.
# This is appropriate for the current dynamic Node.js API.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forward viewer request information to the ALB,
# but let CloudFront generate the correct Host header for the ALB origin.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# CloudFront distribution providing HTTPS, edge delivery and WAF protection.
resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name}-${var.environment} edge distribution"
  price_class     = "PriceClass_100"

  aliases = [
    var.domain_name
  ]

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"

      origin_ssl_protocols = [
        "TLSv1.2"
      ]
    }
  }

  default_cache_behavior {
    target_origin_id = "alb-origin"

    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = [
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT"
    ]

    cached_methods = [
      "GET",
      "HEAD"
    ]

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_disabled.id

    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.edge.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.edge.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-cloudfront"
    Environment = var.environment
  }

  depends_on = [
    aws_acm_certificate_validation.edge,
    aws_wafv2_web_acl.edge
  ]
}

# Wait until ACM has successfully validated the certificate.
# The required DNS validation CNAME already exists persistently
# in the personal AWS Route 53 hosted zone.
resource "aws_acm_certificate_validation" "edge" {
  certificate_arn = aws_acm_certificate.edge.arn

  validation_record_fqdns = distinct([
    for option in aws_acm_certificate.edge.domain_validation_options :
    option.resource_record_name
  ])
}