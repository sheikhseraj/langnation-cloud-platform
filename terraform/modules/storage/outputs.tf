# Storage module outputs
output "bucket_id" {
  description = "ID/name of the private LangNation storage bucket"
  value       = aws_s3_bucket.storage.id
}

output "bucket_arn" {
  description = "ARN of the private LangNation storage bucket"
  value       = aws_s3_bucket.storage.arn
}

output "bucket_name" {
  description = "Name of the private LangNation storage bucket"
  value       = aws_s3_bucket.storage.bucket
}