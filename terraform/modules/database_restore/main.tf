# ============================================================
# LangNation Capstone - Database Restore Infrastructure
# ============================================================
#
# This module creates the infrastructure required for a one-off
# ECS Fargate task that restores the sanitized LangNation demo
# database after the AWS training sandbox is rebuilt.
#
# Important:
# - No subnet IDs, security-group IDs, DB endpoints or secret
#   ARNs are hard-coded here.
# - The restore SQL is baked into the restore Docker image.
# - The task receives DB connection values dynamically from
#   Terraform and AWS Secrets Manager.
# ============================================================

# ------------------------------------------------------------
# Dedicated ECR repository for the database restore image
# ------------------------------------------------------------
resource "aws_ecr_repository" "restore" {
  name                 = "${var.project_name}-${var.environment}-db-restore"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-restore"
    Environment = var.environment
  }
}


# ------------------------------------------------------------
# CloudWatch log group for one-off restore tasks
# ------------------------------------------------------------
resource "aws_cloudwatch_log_group" "restore" {
  name              = "/ecs/${var.project_name}-${var.environment}-db-restore"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-restore"
    Environment = var.environment
  }
}


# ------------------------------------------------------------
# ECS task execution role
#
# This is intentionally separate from the application task
# execution role. It is used only by the database restore task.
# ------------------------------------------------------------
resource "aws_iam_role" "execution" {
  name = "${var.project_name}-${var.environment}-db-restore-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-restore-execution-role"
    Environment = var.environment
  }
}


# Standard ECS permissions:
# - pull container images from ECR
# - write container logs to CloudWatch
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}


# Allow ECS to inject only the RDS-managed master credentials
# from the specific Secrets Manager secret created by RDS.
resource "aws_iam_role_policy" "read_db_secret" {
  name = "${var.project_name}-${var.environment}-db-restore-secret-policy"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "ReadRDSMasterSecret"
        Effect = "Allow"

        Action = [
          "secretsmanager:GetSecretValue"
        ]

        Resource = var.db_master_secret_arn
      }
    ]
  })
}


# ------------------------------------------------------------
# One-off Fargate task definition
#
# Terraform defines the baseline task definition. The workflow
# pushes the restore image to the :latest tag after every
# sandbox rebuild, then runs this task definition once.
# ------------------------------------------------------------
resource "aws_ecs_task_definition" "restore" {
  family                   = "${var.project_name}-${var.environment}-db-restore"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"

  cpu    = "256"
  memory = "512"

  execution_role_arn = aws_iam_role.execution.arn

  container_definitions = jsonencode([
    {
      name      = "database-restore"
      image     = "${aws_ecr_repository.restore.repository_url}:latest"
      essential = true

      environment = [
        {
          name  = "DB_HOST"
          value = var.db_endpoint
        },
        {
          name  = "DB_PORT"
          value = tostring(var.db_port)
        },
        {
          name  = "DB_NAME"
          value = var.db_name
        },
        {
          name  = "EXPECTED_TABLE_COUNT"
          value = tostring(var.expected_table_count)
        }
      ]

      secrets = [
        {
          name      = "DB_USERNAME"
          valueFrom = "${var.db_master_secret_arn}:username::"
        },
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.db_master_secret_arn}:password::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"

        options = {
          awslogs-group         = aws_cloudwatch_log_group.restore.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "restore"
        }
      }
    }
  ])

  depends_on = [
    aws_iam_role_policy_attachment.execution,
    aws_iam_role_policy.read_db_secret
  ]

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-restore"
    Environment = var.environment
  }
}
