# ============================================================
# Milestone 10
# Governance & Audit
# ============================================================

locals {

  trail_name = "${var.project_name}-${var.environment}-audit"

  audit_bucket_name = lower(
    "${var.project_name}-${var.environment}-${var.aws_account_id}-cloudtrail"
  )

  # CloudTrail ARN is derived from stable configuration rather
  # than from a disposable AWS-generated identifier.
  trail_arn = "arn:aws:cloudtrail:${var.aws_region}:${var.aws_account_id}:trail/${local.trail_name}"
}


# ============================================================
# Dedicated CloudTrail Audit Bucket
# ============================================================

resource "aws_s3_bucket" "audit" {

  bucket = local.audit_bucket_name

  # The training sandbox is regularly destroyed and rebuilt.
  # A production audit bucket would normally be retained.
  force_destroy = var.force_destroy

  tags = {
    Name        = local.audit_bucket_name
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "CloudTrail audit logs"
  }
}


# ============================================================
# Block All Public Access
# ============================================================

resource "aws_s3_bucket_public_access_block" "audit" {

  bucket = aws_s3_bucket.audit.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


# ============================================================
# S3 Versioning
# ============================================================

resource "aws_s3_bucket_versioning" "audit" {

  bucket = aws_s3_bucket.audit.id

  versioning_configuration {
    status = "Enabled"
  }
}


# ============================================================
# Server-Side Encryption
# ============================================================

resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {

  bucket = aws_s3_bucket.audit.id

  rule {

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}


# ============================================================
# Audit Log Lifecycle
# ============================================================

resource "aws_s3_bucket_lifecycle_configuration" "audit" {

  bucket = aws_s3_bucket.audit.id

  depends_on = [
    aws_s3_bucket_versioning.audit
  ]

  rule {

    id     = "expire-cloudtrail-audit-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.log_retention_days
    }
  }
}


# ============================================================
# CloudTrail S3 Bucket Policy
# ============================================================
#
# CloudTrail requires:
#
# 1. s3:GetBucketAcl
# 2. s3:PutObject
#
# aws:SourceArn restricts delivery to this specific trail.
# ============================================================

data "aws_iam_policy_document" "cloudtrail_bucket" {

  statement {

    sid = "AWSCloudTrailAclCheck20150319"

    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions = [
      "s3:GetBucketAcl"
    ]

    resources = [
      aws_s3_bucket.audit.arn
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"

      values = [
        local.trail_arn
      ]
    }
  }


  statement {

    sid = "AWSCloudTrailWrite20150319"

    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions = [
      "s3:PutObject"
    ]

    resources = [
      "${aws_s3_bucket.audit.arn}/AWSLogs/${var.aws_account_id}/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"

      values = [
        "bucket-owner-full-control"
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"

      values = [
        local.trail_arn
      ]
    }
  }
}


resource "aws_s3_bucket_policy" "audit" {

  bucket = aws_s3_bucket.audit.id

  policy = data.aws_iam_policy_document.cloudtrail_bucket.json
}


# ============================================================
# AWS CloudTrail
# ============================================================

resource "aws_cloudtrail" "audit" {

  name = local.trail_name

  s3_bucket_name = aws_s3_bucket.audit.id


  # ----------------------------------------------------------
  # Governance Scope
  # ----------------------------------------------------------

  include_global_service_events = true

  is_multi_region_trail = true

  enable_logging = true


  # ----------------------------------------------------------
  # Integrity Protection
  # ----------------------------------------------------------

  enable_log_file_validation = true


  # ----------------------------------------------------------
  # Management Plane Audit
  # ----------------------------------------------------------
  #
  # Records actions such as:
  #
  # - IAM changes
  # - ECS updates
  # - RDS configuration
  # - Security Group changes
  # - CloudFront updates
  # - Terraform/API activity
  #
  # Data events are intentionally excluded from this
  # educational environment to control event volume/cost.
  # ----------------------------------------------------------

  event_selector {

    read_write_type = "All"

    include_management_events = true
  }


  depends_on = [
    aws_s3_bucket_policy.audit,
    aws_s3_bucket_public_access_block.audit,
    aws_s3_bucket_server_side_encryption_configuration.audit,
    aws_s3_bucket_versioning.audit
  ]

  tags = {
    Name        = local.trail_name
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Governance and audit"
  }
}