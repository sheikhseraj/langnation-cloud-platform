
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

  # Pass the Target Group from dev
  target_group_arn = module.load_balancing.target_group_arn

  # Set the desired count of ECS Fargate tasks to 2 for the development environment
  desired_count = 2

  # Temporary Controlled Auto Scaling Test
  autoscaling_cpu_target = 1

  # Add Explicit Module Dependency
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