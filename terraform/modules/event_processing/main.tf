# ============================================================
# SQS Queues for Document Processing
# ============================================================
locals {
  document_queue_name     = "${var.project_name}-${var.environment}-document-events"
  document_dlq_name       = "${var.project_name}-${var.environment}-document-events-dlq"
  document_processor_name = "${var.project_name}-${var.environment}-document-processor"
}

# ============================================================
# Dead Letter Queue
# ============================================================

resource "aws_sqs_queue" "document_dlq" {
  name = local.document_dlq_name

  message_retention_seconds = var.dlq_message_retention_seconds

  sqs_managed_sse_enabled = true

  tags = merge(
    var.tags,
    {
      Name    = local.document_dlq_name
      Purpose = "Document processing dead-letter queue"
    }
  )
}

# ============================================================
# Main Document Event Queue
# ============================================================

resource "aws_sqs_queue" "document_events" {
  name = local.document_queue_name

  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  message_retention_seconds  = var.sqs_message_retention_seconds

  sqs_managed_sse_enabled = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.document_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = merge(
    var.tags,
    {
      Name    = local.document_queue_name
      Purpose = "Document processing event queue"
    }
  )
}

# ============================================================
# Restrict DLQ usage to the main document queue
# ============================================================

resource "aws_sqs_queue_redrive_allow_policy" "document_dlq" {
  queue_url = aws_sqs_queue.document_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns = [
      aws_sqs_queue.document_events.arn
    ]
  })
}

# ============================================================
# Lambda CloudWatch Log Group
# ============================================================

resource "aws_cloudwatch_log_group" "document_processor" {
  name              = "/aws/lambda/${local.document_processor_name}"
  retention_in_days = var.lambda_log_retention_days

  tags = merge(
    var.tags,
    {
      Name    = local.document_processor_name
      Purpose = "Document processor Lambda logs"
    }
  )
}

# ============================================================
# Lambda Execution Role
# ============================================================

resource "aws_iam_role" "document_processor" {
  name = "${local.document_processor_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "lambda.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name    = "${local.document_processor_name}-role"
      Purpose = "Lambda execution role for document processing"
    }
  )
}

# ============================================================
# Lambda Least-Privilege Permissions
# ============================================================

resource "aws_iam_role_policy" "document_processor" {
  name = "${local.document_processor_name}-policy"
  role = aws_iam_role.document_processor.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "ReadAndDeleteSQSMessages"
        Effect = "Allow"

        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]

        Resource = aws_sqs_queue.document_events.arn
      },

      {
        Sid    = "WriteLambdaLogs"
        Effect = "Allow"

        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]

        Resource = "${aws_cloudwatch_log_group.document_processor.arn}:*"
      }
    ]
  })
}

# ============================================================
# Package Lambda Source Code
# ============================================================

data "archive_file" "document_processor" {
  type = "zip"

  source_file = "${path.module}/../../../lambda/document_processor/handler.py"
  output_path = "${path.module}/document_processor.zip"
}

# ============================================================
# Document Processor Lambda
# ============================================================

resource "aws_lambda_function" "document_processor" {
  function_name = local.document_processor_name

  role = aws_iam_role.document_processor.arn

  runtime = "python3.12"
  handler = "handler.lambda_handler"

  filename         = data.archive_file.document_processor.output_path
  source_code_hash = data.archive_file.document_processor.output_base64sha256

  timeout     = var.lambda_timeout_seconds
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      FAILURE_TEST_PREFIX = "fail/"
    }
  }

  depends_on = [
    aws_iam_role_policy.document_processor,
    aws_cloudwatch_log_group.document_processor
  ]

  tags = merge(
    var.tags,
    {
      Name    = local.document_processor_name
      Purpose = "Process LangNation document events"
    }
  )
}

# ============================================================
# SQS -> Lambda Event Source Mapping
# ============================================================

resource "aws_lambda_event_source_mapping" "document_events" {
  event_source_arn = aws_sqs_queue.document_events.arn
  function_name    = aws_lambda_function.document_processor.arn

  enabled = true

  batch_size                         = 1
  maximum_batching_window_in_seconds = 0

  depends_on = [
    aws_iam_role_policy.document_processor
  ]
}

# ============================================================
# Enable S3 Events on EventBridge
# ============================================================

resource "aws_s3_bucket_notification" "eventbridge" {
  bucket      = var.storage_bucket_name
  eventbridge = true
}

# ============================================================
# EventBridge Rule - S3 Object Created
# ============================================================

resource "aws_cloudwatch_event_rule" "s3_object_created" {
  name        = "${var.project_name}-${var.environment}-s3-object-created"
  description = "Capture new objects created in the LangNation storage bucket"

  event_pattern = jsonencode({
    source = [
      "aws.s3"
    ]

    detail-type = [
      "Object Created"
    ]

    detail = {
      bucket = {
        name = [
          var.storage_bucket_name
        ]
      }
    }
  })

  tags = merge(
    var.tags,
    {
      Name    = "${var.project_name}-${var.environment}-s3-object-created"
      Purpose = "Route S3 document creation events"
    }
  )
}

# ============================================================
# Allow EventBridge to Send Messages to SQS
# ============================================================

data "aws_iam_policy_document" "eventbridge_to_sqs" {
  statement {
    sid    = "AllowEventBridgeToSendMessages"
    effect = "Allow"

    principals {
      type = "Service"

      identifiers = [
        "events.amazonaws.com"
      ]
    }

    actions = [
      "sqs:SendMessage"
    ]

    resources = [
      aws_sqs_queue.document_events.arn
    ]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"

      values = [
        aws_cloudwatch_event_rule.s3_object_created.arn
      ]
    }
  }
}

resource "aws_sqs_queue_policy" "document_events" {
  queue_url = aws_sqs_queue.document_events.id
  policy    = data.aws_iam_policy_document.eventbridge_to_sqs.json
}

# ============================================================
# EventBridge -> SQS Target
# ============================================================

resource "aws_cloudwatch_event_target" "document_queue" {
  rule      = aws_cloudwatch_event_rule.s3_object_created.name
  target_id = "SendToDocumentQueue"
  arn       = aws_sqs_queue.document_events.arn

  depends_on = [
    aws_sqs_queue_policy.document_events
  ]
}