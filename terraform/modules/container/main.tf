# ============================================================
# ECR Repository
# ============================================================

# Create the ECR repository
resource "aws_ecr_repository" "app" {
  name         = "${var.project_name}-${var.environment}-app"
  force_delete = var.force_delete

  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-app"
  }
}


# ============================================================
# ECS Cluster
# ============================================================

# Add the ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cluster"
  }
}


# ============================================================
# ECS Task Execution Role
# ============================================================
#
# This role is used by ECS itself.
#
# Responsibilities:
# - Pull container image from ECR
# - Send container logs to CloudWatch
# - Start the ECS/Fargate task
#
# The application does NOT use this role to access Bedrock
# or S3 Vectors.
# ============================================================

resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-task-execution-role"

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
    Name = "${var.project_name}-${var.environment}-ecs-task-execution-role"
  }
}


# Attach AWS ECS Task Execution Role policy
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role = aws_iam_role.ecs_task_execution.name

  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}


# ============================================================
# Milestone 9 - ECS Application Task Role
# ============================================================
#
# This role is assumed by the Node.js application running
# inside the Fargate container.
#
# Lina uses this role to:
#
# 1. Invoke Amazon Bedrock Titan Text Embeddings V2
# 2. Query the LangNation S3 Vector index
# 3. Retrieve vector metadata such as source_text
#
# This is intentionally separate from the ECS execution role.
# ============================================================

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"

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
    Name = "${var.project_name}-${var.environment}-ecs-task-role"
  }
}


# ============================================================
# Milestone 9 - Lina RAG Runtime IAM Policy
# ============================================================

resource "aws_iam_role_policy" "ecs_task_rag" {
  name = "${var.project_name}-${var.environment}-lina-rag-runtime"

  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [

      # --------------------------------------------------------
      # Generate embeddings using Amazon Bedrock
      # --------------------------------------------------------
      {
        Sid    = "InvokeTitanEmbeddingModel"
        Effect = "Allow"

        Action = [
          "bedrock:InvokeModel"
        ]

        Resource = [
          "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_embedding_model_id}"
        ]
      },

      # --------------------------------------------------------
      # Query the LangNation S3 Vector knowledge index
      # --------------------------------------------------------
      {
        Sid    = "QueryLangNationVectorIndex"
        Effect = "Allow"

        Action = [
          "s3vectors:QueryVectors",
          "s3vectors:GetVectors"
        ]

        Resource = [
          var.vector_index_arn
        ]
      }
    ]
  })
}


# ============================================================
# CloudWatch Logs
# ============================================================

# Create a CloudWatch Log Group for ECS tasks
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project_name}-${var.environment}-app"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-app-logs"
  }
}


# ============================================================
# ECS Fargate Task Definition
# ============================================================

resource "aws_ecs_task_definition" "app" {
  family = "${var.project_name}-${var.environment}-app"

  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"

  cpu    = var.task_cpu
  memory = var.task_memory

  # ----------------------------------------------------------
  # ECS infrastructure role
  # ----------------------------------------------------------

  execution_role_arn = aws_iam_role.ecs_task_execution.arn

  # ----------------------------------------------------------
  # Milestone 9
  #
  # Application runtime role.
  #
  # Node.js AWS SDK automatically receives temporary
  # credentials for this role through the ECS task metadata
  # endpoint.
  # ----------------------------------------------------------

  task_role_arn = aws_iam_role.ecs_task.arn


  # ==========================================================
  # Container Definition
  # ==========================================================

  container_definitions = jsonencode([
    {
      name      = "langnation-app"
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true


      # ======================================================
      # Application Environment Variables
      # ======================================================

      environment = [

        # ----------------------------------------------------
        # Cognito Authentication
        # ----------------------------------------------------

        {
          name  = "COGNITO_USER_POOL_ID"
          value = var.cognito_user_pool_id
        },

        {
          name  = "COGNITO_CLIENT_ID"
          value = var.cognito_client_id
        },


        # ----------------------------------------------------
        # Milestone 9 - AWS Runtime Configuration
        # ----------------------------------------------------

        {
          name  = "AWS_REGION"
          value = var.aws_region
        },


        # ----------------------------------------------------
        # Milestone 9 - Bedrock Embedding Configuration
        # ----------------------------------------------------

        {
          name  = "BEDROCK_EMBEDDING_MODEL_ID"
          value = var.bedrock_embedding_model_id
        },


        # ----------------------------------------------------
        # Milestone 9 - S3 Vector Knowledge Configuration
        # ----------------------------------------------------

        {
          name  = "VECTOR_BUCKET_NAME"
          value = var.vector_bucket_name
        },

        {
          name  = "VECTOR_INDEX_NAME"
          value = var.vector_index_name
        }
      ]


      # ======================================================
      # Container Port
      # ======================================================

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]


      # ======================================================
      # CloudWatch Logging
      # ======================================================

      logConfiguration = {
        logDriver = "awslogs"

        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])


  tags = {
    Name = "${var.project_name}-${var.environment}-app-task"
  }
}


# ============================================================
# ECS Fargate Service
# ============================================================

resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-${var.environment}-app-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn

  launch_type   = "FARGATE"
  desired_count = var.desired_count


  # ==========================================================
  # Application Load Balancer
  # ==========================================================

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "langnation-app"
    container_port   = var.container_port
  }


  # ==========================================================
  # Private Application Network
  # ==========================================================

  network_configuration {
    subnets         = var.private_app_subnet_ids
    security_groups = [var.ecs_security_group_id]

    assign_public_ip = false
  }


  # ==========================================================
  # Dependencies
  # ==========================================================

  depends_on = [
    aws_iam_role_policy_attachment.ecs_task_execution,
    aws_iam_role_policy.ecs_task_rag
  ]


  # ==========================================================
  # Deployment Ownership
  # ==========================================================
  #
  # Auto Scaling controls desired count.
  #
  # GitHub Actions controls deployed task-definition revisions.
  #
  # Terraform still defines the baseline task definition.
  # ==========================================================

  lifecycle {
    ignore_changes = [
      desired_count,
      task_definition
    ]
  }


  tags = {
    Name = "${var.project_name}-${var.environment}-app-service"
  }
}


# ============================================================
# ECS Auto Scaling Target
# ============================================================

resource "aws_appautoscaling_target" "ecs_service" {
  max_capacity = var.autoscaling_max_capacity
  min_capacity = var.autoscaling_min_capacity

  resource_id = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"

  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}


# ============================================================
# ECS CPU Auto Scaling Policy
# ============================================================

resource "aws_appautoscaling_policy" "ecs_cpu" {
  name        = "${var.project_name}-${var.environment}-cpu-target"
  policy_type = "TargetTrackingScaling"

  resource_id = aws_appautoscaling_target.ecs_service.resource_id

  scalable_dimension = aws_appautoscaling_target.ecs_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service.service_namespace


  target_tracking_scaling_policy_configuration {

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = var.autoscaling_cpu_target

    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}