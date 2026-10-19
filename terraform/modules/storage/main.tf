# Current AWS account information
# Used to make the S3 bucket name globally unique
data "aws_caller_identity" "current" {}

locals {
  storage_bucket_name = "${var.project_name}-${var.environment}-${data.aws_caller_identity.current.account_id}-storage"
}

# Private application storage bucket
resource "aws_s3_bucket" "storage" {
  bucket        = local.storage_bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name        = local.storage_bucket_name
    Environment = var.environment
  }
}

# Block all forms of public access
resource "aws_s3_bucket_public_access_block" "storage" {
  bucket = aws_s3_bucket.storage.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# Bucket owner controls object ownership
resource "aws_s3_bucket_ownership_controls" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypt all stored objects by default
resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle management
# Keep current objects, clean older object versions, and remove abandoned uploads
resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "storage-maintenance"
    status = "Enabled"

    filter {}

    # Delete incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Keep old versions for 30 days before removing them
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Bucket policy that denies requests made without HTTPS
data "aws_iam_policy_document" "storage" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = [
      "s3:*"
    ]

    resources = [
      aws_s3_bucket.storage.arn,
      "${aws_s3_bucket.storage.arn}/*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "storage" {
  bucket = aws_s3_bucket.storage.id
  policy = data.aws_iam_policy_document.storage.json
}