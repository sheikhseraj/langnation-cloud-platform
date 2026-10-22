# ============================================================
# CloudWatch Dashboard
# ============================================================

output "dashboard_name" {
  description = "Name of the LangNation operations CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.operations.dashboard_name
}


# ============================================================
# Operational Alarm Names
# ============================================================

output "alarm_names" {

  description = "CloudWatch operational alarm names"

  value = {

    ecs_cpu_high = aws_cloudwatch_metric_alarm.ecs_cpu_high.alarm_name

    ecs_memory_high = aws_cloudwatch_metric_alarm.ecs_memory_high.alarm_name

    alb_unhealthy_targets = aws_cloudwatch_metric_alarm.alb_unhealthy_targets.alarm_name

    alb_target_5xx = aws_cloudwatch_metric_alarm.alb_target_5xx.alarm_name

    rds_cpu_high = aws_cloudwatch_metric_alarm.rds_cpu_high.alarm_name

    rds_low_storage = aws_cloudwatch_metric_alarm.rds_low_storage.alarm_name

    lambda_errors = aws_cloudwatch_metric_alarm.lambda_errors.alarm_name

    document_dlq_messages = aws_cloudwatch_metric_alarm.document_dlq_messages.alarm_name

    cloudfront_5xx = aws_cloudwatch_metric_alarm.cloudfront_5xx.alarm_name
  }
}