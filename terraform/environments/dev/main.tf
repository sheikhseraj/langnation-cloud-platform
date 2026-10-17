module "networking" {
  source = "../../modules/networking"

  vpc_cidr                 = var.vpc_cidr
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_app_subnet_cidrs = var.private_app_subnet_cidrs
  private_db_subnet_cidrs  = var.private_db_subnet_cidrs
  project_name             = var.project_name
  environment              = var.environment
}

# Connect the Security module
module "security" {
  source = "../../modules/security"

  vpc_id       = module.networking.vpc_id
  project_name = var.project_name
  environment  = var.environment
}

# Connect the Container module
module "container" {
  source = "../../modules/container"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  # Pass networking and security into the container module
  private_app_subnet_ids = module.networking.private_app_subnet_ids
  ecs_security_group_id  = module.security.ecs_security_group_id

  # Pass the Target Group from the load balancing module
  target_group_arn = module.load_balancing.target_group_arn

  # Pass Cognito authentication configuration to ECS
  cognito_user_pool_id = module.authentication.user_pool_id
  cognito_client_id    = module.authentication.user_pool_client_id

  # Development environment runs two ECS tasks
  desired_count = 2

  # Temporary Controlled Auto Scaling Test
  # autoscaling_cpu_target = 1

  depends_on = [
    module.load_balancing
  ]
}

# Connect the Load Balancing module
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

# Connect the CI/CD module
module "cicd" {
  source = "../../modules/cicd"

  project_name = var.project_name
  environment  = var.environment

  github_owner         = var.github_owner
  github_owner_id      = var.github_owner_id
  github_repository    = var.github_repository
  github_repository_id = var.github_repository_id
  github_branch        = var.github_branch

  ecr_repository_arn          = module.container.ecr_repository_arn
  ecs_cluster_arn             = module.container.ecs_cluster_arn
  ecs_service_name            = module.container.ecs_service_name
  ecs_task_execution_role_arn = module.container.ecs_task_execution_role_arn
}

# Database
module "database" {
  source = "../../modules/database"

  project_name = var.project_name
  environment  = var.environment

  private_db_subnet_ids = module.networking.private_db_subnet_ids
  db_security_group_id  = module.security.db_security_group_id
}

# Storage
module "storage" {
  source = "../../modules/storage"

  project_name = var.project_name
  environment  = var.environment
}

# Edge / HTTPS
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

# Authentication / Cognito
module "authentication" {
  source = "../../modules/authentication"

  project_name = var.project_name
  environment  = var.environment
}