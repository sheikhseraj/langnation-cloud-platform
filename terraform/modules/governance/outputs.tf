# ============================================================
# CloudTrail
# ============================================================

output "trail_name" {
  description = "Name of the CloudTrail governance trail"
  value       = aws_cloudtrail.audit.name
}

output "trail_arn" {
  description = "ARN of the CloudTrail governance trail"
  value       = aws_cloudtrail.audit.arn
}


# ============================================================
# Audit S3 Bucket
# ============================================================

output "audit_bucket_name" {
  description = "S3 bucket containing CloudTrail audit logs"
  value       = aws_s3_bucket.audit.bucket
}

output "audit_bucket_arn" {
  description = "ARN of the CloudTrail audit bucket"
  value       = aws_s3_bucket.audit.arn
}