# ============================================================
# Milestone 10
# Monitoring, Observability & Operational Alarms
# ============================================================

locals {

  # ----------------------------------------------------------
  # CloudWatch dimensions required by AWS/ApplicationELB
  # ----------------------------------------------------------

  alb_dimension = split(
    "loadbalancer/",
    var.alb_arn
  )[1]

  target_group_dimension = split(
    ":",
    var.target_group_arn
  )[5]


  # ----------------------------------------------------------
  # Queue names extracted dynamically from their ARNs
  # ----------------------------------------------------------

  document_queue_name = split(
    ":",
    var.document_queue_arn
  )[5]

  document_dlq_name = split(
    ":",
    var.document_dlq_arn
  )[5]


  dashboard_name = "${var.project_name}-${var.environment}-operations"
}


# ============================================================
# CloudWatch Operations Dashboard
# ============================================================

resource "aws_cloudwatch_dashboard" "operations" {

  dashboard_name = local.dashboard_name

  dashboard_body = jsonencode({

    widgets = [

      # ======================================================
      # Dashboard Header
      # ======================================================

      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2

        properties = {
          markdown = <<-EOT
          # LangNation Cloud Platform — Operations Dashboard

          **Environment:** ${var.environment}  
          **Region:** ${var.aws_region}

          ECS • ALB • RDS • Lambda • SQS • CloudFront
          EOT
        }
      },


      # ======================================================
      # ECS Fargate
      # ======================================================

      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6

        properties = {

          title  = "ECS Fargate — CPU & Memory"
          region = var.aws_region

          view    = "timeSeries"
          stacked = false
          period  = 300

          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }

          metrics = [

            [
              "AWS/ECS",
              "CPUUtilization",
              "ClusterName",
              var.ecs_cluster_name,
              "ServiceName",
              var.ecs_service_name,
              {
                stat  = "Average"
                label = "CPU Utilization"
              }
            ],

            [
              "AWS/ECS",
              "MemoryUtilization",
              "ClusterName",
              var.ecs_cluster_name,
              "ServiceName",
              var.ecs_service_name,
              {
                stat  = "Average"
                label = "Memory Utilization"
              }
            ]
          ]
        }
      },


      # ======================================================
      # Application Load Balancer
      # ======================================================

      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6

        properties = {

          title  = "Application Load Balancer"
          region = var.aws_region

          view    = "timeSeries"
          stacked = false
          period  = 300

          metrics = [

            [
              "AWS/ApplicationELB",
              "RequestCount",
              "LoadBalancer",
              local.alb_dimension,
              {
                stat  = "Sum"
                label = "Requests"
              }
            ],

            [
              "AWS/ApplicationELB",
              "HTTPCode_Target_5XX_Count",
              "TargetGroup",
              local.target_group_dimension,
              "LoadBalancer",
              local.alb_dimension,
              {
                stat  = "Sum"
                label = "Target 5XX"
              }
            ],

            [
              "AWS/ApplicationELB",
              "UnHealthyHostCount",
              "TargetGroup",
              local.target_group_dimension,
              "LoadBalancer",
              local.alb_dimension,
              {
                stat  = "Maximum"
                label = "Unhealthy Targets"
              }
            ]
          ]
        }
      },


      # ======================================================
      # RDS Performance
      # ======================================================

      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6

        properties = {

          title  = "RDS MariaDB — Performance"
          region = var.aws_region

          view    = "timeSeries"
          stacked = false
          period  = 300

          metrics = [

            [
              "AWS/RDS",
              "CPUUtilization",
              "DBInstanceIdentifier",
              var.db_instance_id,
              {
                stat  = "Average"
                label = "CPU Utilization"
              }
            ],

            [
              "AWS/RDS",
              "DatabaseConnections",
              "DBInstanceIdentifier",
              var.db_instance_id,
              {
                stat  = "Average"
                label = "DB Connections"
              }
            ]
          ]
        }
      },


      # ======================================================
      # RDS Free Storage
      # ======================================================

      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6

        properties = {

          title  = "RDS MariaDB — Free Storage"
          region = var.aws_region

          view   = "timeSeries"
          period = 300

          metrics = [

            [
              "AWS/RDS",
              "FreeStorageSpace",
              "DBInstanceIdentifier",
              var.db_instance_id,
              {
                stat  = "Average"
                label = "Free Storage (Bytes)"
              }
            ]
          ]
        }
      },


      # ======================================================
      # Lambda
      # ======================================================

      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6

        properties = {

          title  = "Document Processor Lambda"
          region = var.aws_region

          view    = "timeSeries"
          stacked = false
          period  = 300

          metrics = [

            [
              "AWS/Lambda",
              "Invocations",
              "FunctionName",
              var.lambda_function_name,
              {
                stat  = "Sum"
                label = "Invocations"
              }
            ],

            [
              "AWS/Lambda",
              "Errors",
              "FunctionName",
              var.lambda_function_name,
              {
                stat  = "Sum"
                label = "Errors"
              }
            ],

            [
              "AWS/Lambda",
              "Duration",
              "FunctionName",
              var.lambda_function_name,
              {
                stat  = "Average"
                label = "Average Duration"
              }
            ]
          ]
        }
      },


      # ======================================================
      # SQS / DLQ
      # ======================================================

      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6

        properties = {

          title  = "Document Processing Queues"
          region = var.aws_region

          view    = "timeSeries"
          stacked = false
          period  = 300

          metrics = [

            [
              "AWS/SQS",
              "ApproximateNumberOfMessagesVisible",
              "QueueName",
              local.document_queue_name,
              {
                stat  = "Average"
                label = "Processing Queue"
              }
            ],

            [
              "AWS/SQS",
              "ApproximateNumberOfMessagesVisible",
              "QueueName",
              local.document_dlq_name,
              {
                stat  = "Average"
                label = "Dead Letter Queue"
              }
            ]
          ]
        }
      },


      # ======================================================
      # CloudFront
      # ======================================================

      {
        type   = "metric"
        x      = 0
        y      = 20
        width  = 24
        height = 6

        properties = {

          title  = "CloudFront — Public Edge"
          region = "us-east-1"

          view    = "timeSeries"
          stacked = false
          period  = 300

          metrics = [

            [
              "AWS/CloudFront",
              "Requests",
              "DistributionId",
              var.cloudfront_distribution_id,
              "Region",
              "Global",
              {
                stat  = "Sum"
                label = "Requests"
              }
            ],

            [
              "AWS/CloudFront",
              "4xxErrorRate",
              "DistributionId",
              var.cloudfront_distribution_id,
              "Region",
              "Global",
              {
                stat  = "Average"
                label = "4XX Error Rate"
              }
            ],

            [
              "AWS/CloudFront",
              "5xxErrorRate",
              "DistributionId",
              var.cloudfront_distribution_id,
              "Region",
              "Global",
              {
                stat  = "Average"
                label = "5XX Error Rate"
              }
            ]
          ]
        }
      }
    ]
  })
}


# ============================================================
# ECS CPU Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {

  alarm_name = "${var.project_name}-${var.environment}-ecs-cpu-high"

  alarm_description = "ECS service CPU utilization is above 80 percent"

  namespace   = "AWS/ECS"
  metric_name = "CPUUtilization"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  statistic = "Average"
  period    = 300

  evaluation_periods  = 2
  datapoints_to_alarm = 2

  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# ECS Memory Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {

  alarm_name = "${var.project_name}-${var.environment}-ecs-memory-high"

  alarm_description = "ECS service memory utilization is above 80 percent"

  namespace   = "AWS/ECS"
  metric_name = "MemoryUtilization"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  statistic = "Average"
  period    = 300

  evaluation_periods  = 2
  datapoints_to_alarm = 2

  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# ALB Unhealthy Target Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_targets" {

  alarm_name = "${var.project_name}-${var.environment}-alb-unhealthy-targets"

  alarm_description = "One or more ECS targets remain unhealthy"

  namespace   = "AWS/ApplicationELB"
  metric_name = "UnHealthyHostCount"

  dimensions = {
    LoadBalancer = local.alb_dimension
    TargetGroup  = local.target_group_dimension
  }

  statistic = "Maximum"
  period    = 60

  evaluation_periods  = 2
  datapoints_to_alarm = 2

  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# ALB Target 5XX Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {

  alarm_name = "${var.project_name}-${var.environment}-alb-target-5xx"

  alarm_description = "Application targets returned elevated HTTP 5XX responses"

  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_Target_5XX_Count"

  dimensions = {
    LoadBalancer = local.alb_dimension
    TargetGroup  = local.target_group_dimension
  }

  statistic = "Sum"
  period    = 300

  evaluation_periods  = 1
  datapoints_to_alarm = 1

  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# RDS CPU Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {

  alarm_name = "${var.project_name}-${var.environment}-rds-cpu-high"

  alarm_description = "RDS MariaDB CPU utilization is above 80 percent"

  namespace   = "AWS/RDS"
  metric_name = "CPUUtilization"

  dimensions = {
    DBInstanceIdentifier = var.db_instance_id
  }

  statistic = "Average"
  period    = 300

  evaluation_periods  = 2
  datapoints_to_alarm = 2

  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# RDS Low Storage Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "rds_low_storage" {

  alarm_name = "${var.project_name}-${var.environment}-rds-low-storage"

  alarm_description = "RDS MariaDB has less than 2 GiB free storage"

  namespace   = "AWS/RDS"
  metric_name = "FreeStorageSpace"

  dimensions = {
    DBInstanceIdentifier = var.db_instance_id
  }

  statistic = "Average"
  period    = 300

  evaluation_periods  = 2
  datapoints_to_alarm = 2

  # 2 GiB expressed in bytes
  threshold = 2147483648

  comparison_operator = "LessThanThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# Lambda Error Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {

  alarm_name = "${var.project_name}-${var.environment}-lambda-errors"

  alarm_description = "Document processor Lambda returned one or more errors"

  namespace   = "AWS/Lambda"
  metric_name = "Errors"

  dimensions = {
    FunctionName = var.lambda_function_name
  }

  statistic = "Sum"
  period    = 300

  evaluation_periods  = 1
  datapoints_to_alarm = 1

  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# Dead Letter Queue Alarm
# ============================================================

resource "aws_cloudwatch_metric_alarm" "document_dlq_messages" {

  alarm_name = "${var.project_name}-${var.environment}-document-dlq-messages"

  alarm_description = "Document processing dead-letter queue contains messages"

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"

  dimensions = {
    QueueName = local.document_dlq_name
  }

  statistic = "Average"
  period    = 300

  evaluation_periods  = 1
  datapoints_to_alarm = 1

  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}


# ============================================================
# CloudFront 5XX Alarm
# ============================================================
#
# CloudFront metrics are published in us-east-1 because
# CloudFront is a global AWS service.
# ============================================================

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {

  alarm_name = "${var.project_name}-${var.environment}-cloudfront-5xx"

  alarm_description = "CloudFront 5XX error rate is at least 5 percent"

  namespace   = "AWS/CloudFront"
  metric_name = "5xxErrorRate"

  dimensions = {
    DistributionId = var.cloudfront_distribution_id
    Region         = "Global"
  }

  statistic = "Average"
  period    = 60

  evaluation_periods  = 5
  datapoints_to_alarm = 5

  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"

  treat_missing_data = "notBreaching"
}