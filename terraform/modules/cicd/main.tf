# ============================================================
# GitHub Actions OpenID Connect Provider
# ============================================================
#
# GitHub Actions authenticates to AWS using OpenID Connect.
#
# This avoids storing permanent AWS access keys in GitHub.
# GitHub receives short-lived AWS credentials after assuming
# the deployment IAM role below.
# ============================================================

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-github-oidc"
  }
}


# ============================================================
# GitHub Actions Deployment Role
# ============================================================
#
# GitHub Actions assumes this role through OIDC.
#
# The trust policy restricts access to:
#
# - the configured GitHub owner
# - the configured GitHub repository
# - the configured GitHub branch
#
# No permanent AWS access keys are stored in GitHub.
# ============================================================

resource "aws_iam_role" "github_actions_deploy" {
  name = "${var.project_name}-${var.environment}-github-deploy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }

        Action = "sts:AssumeRoleWithWebIdentity"

        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"

            "token.actions.githubusercontent.com:sub" = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repository}@${var.github_repository_id}:ref:refs/heads/${var.github_branch}"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-github-deploy-role"
    Environment = var.environment
  }
}


# ============================================================
# GitHub Actions Least-Privilege Deployment Policy
# ============================================================
#
# This policy supports two deployment responsibilities:
#
# 1. LangNation application deployment
# 2. Milestone 9 automated MariaDB restore
#
# GitHub is intentionally NOT given:
#
# - direct Secrets Manager read access
# - direct database credentials
# - broad ECS permissions
# - broad IAM permissions
#
# Database credentials are retrieved by ECS using the
# dedicated database restore execution role.
# ============================================================

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${var.project_name}-${var.environment}-github-deploy-policy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [

      # ======================================================
      # ECR Authentication
      # ======================================================
      #
      # Required by:
      #
      # aws-actions/amazon-ecr-login
      #
      # GetAuthorizationToken cannot be restricted to a
      # particular ECR repository, therefore Resource="*".
      # ======================================================

      {
        Sid    = "ECRAuthentication"
        Effect = "Allow"

        Action = [
          "ecr:GetAuthorizationToken"
        ]

        Resource = "*"
      },


      # ======================================================
      # Application ECR Repository
      # ======================================================
      #
      # Allows GitHub Actions to push the LangNation
      # application Docker image.
      #
      # Access is restricted to the application repository
      # created by the container Terraform module.
      # ======================================================

      {
        Sid    = "PushImageToApplicationECR"
        Effect = "Allow"

        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]

        Resource = var.ecr_repository_arn
      },


      # ======================================================
      # Milestone 9 - Database Restore ECR Repository
      # ======================================================
      #
      # Allows GitHub Actions to build and push the dedicated
      # database restore image.
      #
      # The image contains only the sanitized demo database.
      #
      # The original production database backup is NOT stored
      # in this repository or image.
      # ======================================================

      {
        Sid    = "PushImageToDatabaseRestoreECR"
        Effect = "Allow"

        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]

        Resource = var.db_restore_ecr_repository_arn
      },


      # ======================================================
      # ECS Task Definition Management
      # ======================================================
      #
      # deploy.yml downloads the current task definition and
      # registers a new revision containing the new image.
      #
      # DescribeTaskDefinition and RegisterTaskDefinition do not
      # support the same useful repository-style resource
      # restriction as our other permissions, therefore these
      # operations use Resource="*".
      # ======================================================

      {
        Sid    = "RegisterAndReadECSTaskDefinition"
        Effect = "Allow"

        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition"
        ]

        Resource = "*"
      },


      # ======================================================
      # Application ECS Service Deployment
      # ======================================================
      #
      # GitHub may update and inspect only the LangNation ECS
      # application service belonging to this cluster.
      # ======================================================

      {
        Sid    = "DeployECSService"
        Effect = "Allow"

        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService"
        ]

        Resource = "${replace(var.ecs_cluster_arn, ":cluster/", ":service/")}/${var.ecs_service_name}"
      },


      # ======================================================
      # Milestone 9 - Run One-Off Database Restore Task
      # ======================================================
      #
      # The morning workflow launches the Terraform-managed
      # restore task after the AWS sandbox infrastructure has
      # been recreated.
      #
      # Restrictions:
      #
      # - only the DB restore task definition
      # - only the current LangNation ECS cluster
      #
      # GitHub therefore cannot use this permission to launch
      # arbitrary ECS task definitions.
      # ======================================================

      {
        Sid    = "RunDatabaseRestoreTask"
        Effect = "Allow"

        Action = [
          "ecs:RunTask"
        ]

        Resource = var.db_restore_task_definition_arn

        Condition = {
          ArnEquals = {
            "ecs:cluster" = var.ecs_cluster_arn
          }
        }
      },


      # ======================================================
      # Milestone 9 - Observe Database Restore Task
      # ======================================================
      #
      # After RunTask, GitHub must monitor the one-off Fargate
      # task until it reaches STOPPED.
      #
      # The workflow will then inspect:
      #
      # - stop reason
      # - container exit code
      #
      # Exit code 0 means the restore and 58-table validation
      # succeeded.
      #
      # The task ARN does not exist until runtime, therefore
      # Resource="*" is used while ecs:cluster restricts access
      # to the current LangNation cluster.
      # ======================================================

      {
        Sid    = "DescribeDatabaseRestoreTask"
        Effect = "Allow"

        Action = [
          "ecs:DescribeTasks"
        ]

        Resource = "*"

        Condition = {
          ArnEquals = {
            "ecs:cluster" = var.ecs_cluster_arn
          }
        }
      },


      # ======================================================
      # CloudFront Read Access
      # ======================================================
      #
      # deploy.yml discovers the dynamically recreated
      # CloudFront distribution and performs the application
      # health check through it.
      #
      # ListDistributions requires Resource="*".
      # ======================================================

      {
        Sid    = "ReadCloudFrontDistribution"
        Effect = "Allow"

        Action = [
          "cloudfront:ListDistributions"
        ]

        Resource = "*"
      },


      # ======================================================
      # ECS PassRole Permissions
      # ======================================================
      #
      # ECS requires iam:PassRole when GitHub registers or runs
      # task definitions containing IAM roles.
      #
      # GitHub may pass ONLY these three roles:
      #
      # 1. Main application ECS execution role
      #
      #    Used by ECS/Fargate for:
      #    - ECR image pull
      #    - CloudWatch logging
      #
      # 2. Main application task role
      #
      #    Used by the LangNation application for:
      #    - Amazon Bedrock
      #    - S3 Vectors
      #
      # 3. Database restore execution role
      #
      #    Used by ECS/Fargate for:
      #    - restore image pull from ECR
      #    - CloudWatch logging
      #    - retrieval of RDS credentials from Secrets Manager
      #
      # GitHub cannot pass arbitrary IAM roles.
      # ======================================================

      {
        Sid    = "PassECSTaskRoles"
        Effect = "Allow"

        Action = [
          "iam:PassRole"
        ]

        Resource = [
          var.ecs_task_execution_role_arn,
          var.ecs_task_role_arn,
          var.db_restore_execution_role_arn
        ]

        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}