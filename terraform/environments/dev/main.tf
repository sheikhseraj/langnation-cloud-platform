# ============================================================
# Networking
# ============================================================

module "networking" {
  source = "../../modules/networking"

  vpc_cidr                 = var.vpc_cidr
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_app_subnet_cidrs = var.private_app_subnet_cidrs
  private_db_subnet_cidrs  = var.private_db_subnet_cidrs

  project_name = var.project_name
  environment  = var.environment
}


# ============================================================
# Security
# ============================================================

module "security" {
  source = "../../modules/security"

  vpc_id = module.networking.vpc_id

  project_name = var.project_name
  environment  = var.environment
}


# ============================================================
# Container Platform
# ============================================================

module "container" {
  source = "../../modules/container"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  # AWS account identity is discovered dynamically.
  # No AWS account ID is hard-coded.
  aws_account_id = data.aws_caller_identity.current.account_id


  # ==========================================================
  # Disposable Development Environment
  # ==========================================================
  #
  # The training sandbox is destroyed/recreated regularly.
  # Allow Terraform to clean up the ECR repository.
  # ==========================================================

  force_delete = true


  # ==========================================================
  # Networking
  # ==========================================================

  private_app_subnet_ids = module.networking.private_app_subnet_ids
  ecs_security_group_id  = module.security.ecs_security_group_id

  target_group_arn = module.load_balancing.target_group_arn


  # ==========================================================
  # Authentication
  # ==========================================================

  cognito_user_pool_id = module.authentication.user_pool_id
  cognito_client_id    = module.authentication.user_pool_client_id


  # ==========================================================
  # Milestone 9 - LangNation MariaDB Runtime
  # ==========================================================
  #
  # All database connection information comes dynamically
  # from the RDS Terraform module.
  #
  # No RDS hostname, port, database credentials, or secret ARN
  # is hard-coded.
  # ==========================================================

  db_host = module.database.db_endpoint
  db_port = module.database.db_port
  db_name = module.database.db_name

  # The RDS master credentials are managed by AWS Secrets
  # Manager and injected into ECS at task startup.
  db_master_secret_arn = module.database.db_master_secret_arn


  # ==========================================================
  # Milestone 9 - Lina AI / RAG Runtime
  # ==========================================================
  #
  # Flow:
  #
  # Student question
  #      |
  #      v
  # Titan Text Embeddings V2
  #      |
  #      v
  # S3 Vectors similarity search
  #      |
  #      v
  # Relevant LangNation context
  #      |
  #      v
  # Claude Haiku 4.5
  #      |
  #      v
  # Grounded Lina response
  #
  # ==========================================================


  # ----------------------------------------------------------
  # Query Embedding Model
  # ----------------------------------------------------------

  bedrock_embedding_model_id = "amazon.titan-embed-text-v2:0"


  # ----------------------------------------------------------
  # Lina Answer Generation Model
  # ----------------------------------------------------------
  #
  # The application invokes Claude Haiku 4.5 through the
  # Bedrock US inference profile.
  # ----------------------------------------------------------

  bedrock_chat_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

  bedrock_chat_foundation_model_id = "anthropic.claude-haiku-4-5-20251001-v1:0"


  # ----------------------------------------------------------
  # Milestone 8 S3 Vector Knowledge Store
  # ----------------------------------------------------------

  vector_bucket_name = module.rag_knowledge.vector_bucket_name
  vector_index_name  = module.rag_knowledge.vector_index_name
  vector_index_arn   = module.rag_knowledge.vector_index_arn


  # ==========================================================
  # ECS Capacity
  # ==========================================================

  # Development environment runs two ECS tasks.
  desired_count = 2

  # Temporary Controlled Auto Scaling Test
  # autoscaling_cpu_target = 1


  # ==========================================================
  # Dependencies
  # ==========================================================
  #
  # The application task requires:
  #
  # - ALB target group
  # - MariaDB RDS
  # - RAG vector infrastructure
  #
  # before ECS can be fully configured.
  # ==========================================================

  depends_on = [
    module.load_balancing,
    module.database,
    module.rag_knowledge
  ]
}


# ============================================================
# Load Balancing
# ============================================================

module "load_balancing" {
  source = "../../modules/load_balancing"

  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.security.alb_security_group_id

  project_name = var.project_name
  environment  = var.environment

  app_port          = 3000
  health_check_path = "/health"
}


# ============================================================
# CI/CD
# ============================================================

module "cicd" {
  source = "../../modules/cicd"

  project_name = var.project_name
  environment  = var.environment

  github_owner         = var.github_owner
  github_owner_id      = var.github_owner_id
  github_repository    = var.github_repository
  github_repository_id = var.github_repository_id
  github_branch        = var.github_branch


  # ==========================================================
  # Application Deployment
  # ==========================================================

  ecr_repository_arn          = module.container.ecr_repository_arn
  ecs_cluster_arn             = module.container.ecs_cluster_arn
  ecs_service_name            = module.container.ecs_service_name
  ecs_task_role_arn           = module.container.ecs_task_role_arn
  ecs_task_execution_role_arn = module.container.ecs_task_execution_role_arn


  # ==========================================================
  # Milestone 9 - Reproducible Database Restore
  # ==========================================================

  db_restore_ecr_repository_arn  = module.database_restore.ecr_repository_arn
  db_restore_task_definition_arn = module.database_restore.task_definition_arn
  db_restore_execution_role_arn  = module.database_restore.execution_role_arn
}


# ============================================================
# Database
# ============================================================

module "database" {
  source = "../../modules/database"

  project_name = var.project_name
  environment  = var.environment

  private_db_subnet_ids = module.networking.private_db_subnet_ids
  db_security_group_id  = module.security.db_security_group_id
}


# ============================================================
# Milestone 9 - Reproducible Database Restore
# ============================================================
#
# Creates:
#
# - Dedicated restore ECR repository
# - CloudWatch log group
# - ECS execution role
# - One-off Fargate restore task definition
#
# The restore task imports the sanitized LangNation database
# after every disposable sandbox rebuild.
#
# No AWS resource IDs are hard-coded.
# ============================================================

module "database_restore" {
  source = "../../modules/database_restore"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region


  # ----------------------------------------------------------
  # Dynamic RDS Configuration
  # ----------------------------------------------------------

  db_endpoint          = module.database.db_endpoint
  db_port              = module.database.db_port
  db_name              = module.database.db_name
  db_master_secret_arn = module.database.db_master_secret_arn


  # ----------------------------------------------------------
  # Restore Validation
  # ----------------------------------------------------------

  expected_table_count = 58


  # ----------------------------------------------------------
  # Disposable Sandbox
  # ----------------------------------------------------------

  force_delete = true


  # ----------------------------------------------------------
  # Dependency
  # ----------------------------------------------------------

  depends_on = [
    module.database
  ]
}


# ============================================================
# Storage
# ============================================================

module "storage" {
  source = "../../modules/storage"

  project_name = var.project_name
  environment  = var.environment

  # Disposable development environment:
  # allow S3 cleanup during destroy.
  force_destroy = true
}


# ============================================================
# Milestone 8 - RAG Knowledge Vector Storage
# ============================================================

module "rag_knowledge" {
  source = "../../modules/rag_knowledge"

  project_name   = var.project_name
  environment    = var.environment
  aws_account_id = data.aws_caller_identity.current.account_id
}


# ============================================================
# Milestone 7 + Milestone 8
# Event-Driven Document Processing
# ============================================================
#
# Flow:
#
# S3 document upload
#      |
#      v
# EventBridge
#      |
#      v
# SQS
#      |
#      v
# Lambda
#      |
#      v
# Titan Embeddings
#      |
#      v
# S3 Vectors
#
# ============================================================

module "event_processing" {
  source = "../../modules/event_processing"

  project_name = var.project_name
  environment  = var.environment


  # ----------------------------------------------------------
  # Source Documents
  # ----------------------------------------------------------

  storage_bucket_name = module.storage.bucket_name
  storage_bucket_arn  = module.storage.bucket_arn


  # ----------------------------------------------------------
  # RAG Vector Storage
  # ----------------------------------------------------------

  vector_bucket_name = module.rag_knowledge.vector_bucket_name
  vector_index_name  = module.rag_knowledge.vector_index_name
  vector_index_arn   = module.rag_knowledge.vector_index_arn


  # ----------------------------------------------------------
  # Embedding Model
  # ----------------------------------------------------------

  bedrock_embedding_model_id = "amazon.titan-embed-text-v2:0"
}


# ============================================================
# Edge / HTTPS
# ============================================================

module "edge" {
  source = "../../modules/edge"

  project_name = var.project_name
  environment  = var.environment

  domain_name = var.cloud_domain_name

  subject_alternative_names = [
    "*.${var.cloud_domain_name}"
  ]

  alb_dns_name = module.load_balancing.alb_dns_name
}


# ============================================================
# Authentication / Cognito
# ============================================================

module "authentication" {
  source = "../../modules/authentication"

  project_name = var.project_name
  environment  = var.environment
}

# ============================================================
# Milestone 10
# Monitoring & Operational Observability
# ============================================================

module "monitoring" {

  source = "../../modules/monitoring"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region


  # ----------------------------------------------------------
  # ECS
  # ----------------------------------------------------------

  ecs_cluster_name = module.container.ecs_cluster_name
  ecs_service_name = module.container.ecs_service_name


  # ----------------------------------------------------------
  # Application Load Balancer
  # ----------------------------------------------------------

  alb_arn          = module.load_balancing.alb_arn
  target_group_arn = module.load_balancing.target_group_arn


  # ----------------------------------------------------------
  # RDS MariaDB
  # ----------------------------------------------------------

  db_instance_id = module.database.db_instance_id


  # ----------------------------------------------------------
  # Lambda Document Processor
  # ----------------------------------------------------------

  lambda_function_name = module.event_processing.document_processor_function_name


  # ----------------------------------------------------------
  # SQS / DLQ
  # ----------------------------------------------------------

  document_queue_arn = module.event_processing.document_queue_arn
  document_dlq_arn   = module.event_processing.document_dlq_arn


  # ----------------------------------------------------------
  # CloudFront
  # ----------------------------------------------------------

  cloudfront_distribution_id = module.edge.cloudfront_distribution_id
}

# ============================================================
# Milestone 10
# Governance & Audit
# ============================================================

module "governance" {

  source = "../../modules/governance"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  # AWS identity is discovered dynamically.
  aws_account_id = data.aws_caller_identity.current.account_id


  # ----------------------------------------------------------
  # Training Sandbox Retention
  # ----------------------------------------------------------

  log_retention_days = 30

  # The training sandbox is disposable.
  # Production audit storage should normally be retained.
  force_destroy = true
}