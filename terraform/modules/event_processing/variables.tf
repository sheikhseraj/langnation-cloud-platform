# Variables for the event processing module
variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment such as dev, staging, or prod"
  type        = string
}

variable "tags" {
  description = "Common tags applied to event-processing resources"
  type        = map(string)
  default     = {}
}

variable "sqs_visibility_timeout_seconds" {
  description = "Time an SQS message remains invisible while Lambda processes it"
  type        = number
  default     = 180
}

variable "sqs_message_retention_seconds" {
  description = "Retention period for messages in the main SQS queue"
  type        = number
  default     = 345600
}

variable "dlq_message_retention_seconds" {
  description = "Retention period for messages in the dead-letter queue"
  type        = number
  default     = 1209600
}

variable "max_receive_count" {
  description = "Number of failed processing attempts before a message moves to the DLQ"
  type        = number
  default     = 3
}

# Lambda function settings
variable "lambda_timeout_seconds" {
  description = "Maximum execution time for the document processor Lambda"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Memory allocated to the document processor Lambda in MB"
  type        = number
  default     = 256
}

variable "lambda_log_retention_days" {
  description = "CloudWatch Logs retention period for the document processor Lambda"
  type        = number
  default     = 7
}

# S3 bucket settings
variable "storage_bucket_name" {
  description = "Name of the S3 bucket that produces document events"
  type        = string
}