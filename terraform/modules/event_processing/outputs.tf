# Outputs for the event processing module
output "document_queue_arn" {
  description = "ARN of the main document-processing SQS queue"
  value       = aws_sqs_queue.document_events.arn
}

output "document_queue_url" {
  description = "URL of the main document-processing SQS queue"
  value       = aws_sqs_queue.document_events.url
}

output "document_dlq_arn" {
  description = "ARN of the document-processing dead-letter queue"
  value       = aws_sqs_queue.document_dlq.arn
}

output "document_dlq_url" {
  description = "URL of the document-processing dead-letter queue"
  value       = aws_sqs_queue.document_dlq.url
}

# Outputs for the Lambda document processor
output "document_processor_role_arn" {
  description = "ARN of the Lambda document processor execution role"
  value       = aws_iam_role.document_processor.arn
}

output "document_processor_log_group_name" {
  description = "CloudWatch log group used by the document processor Lambda"
  value       = aws_cloudwatch_log_group.document_processor.name
}

# Outputs for the Lambda function itself
output "document_processor_function_name" {
  description = "Name of the document processor Lambda function"
  value       = aws_lambda_function.document_processor.function_name
}

output "document_processor_function_arn" {
  description = "ARN of the document processor Lambda function"
  value       = aws_lambda_function.document_processor.arn
}

# Outputs for the SQS to Lambda event source mapping
output "document_event_source_mapping_uuid" {
  description = "UUID of the SQS to Lambda event source mapping"
  value       = aws_lambda_event_source_mapping.document_events.uuid
}

# Outputs for the EventBridge rule that triggers the Lambda on S3 object-created events
output "s3_object_created_rule_name" {
  description = "Name of the EventBridge rule for S3 object-created events"
  value       = aws_cloudwatch_event_rule.s3_object_created.name
}

output "s3_object_created_rule_arn" {
  description = "ARN of the EventBridge rule for S3 object-created events"
  value       = aws_cloudwatch_event_rule.s3_object_created.arn
}