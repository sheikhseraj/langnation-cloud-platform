# AWS-managed prefix list containing CloudFront origin-facing servers.
# This allows the ALB to accept traffic only from CloudFront.
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for the Application Load Balancer"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# Allow HTTP traffic to the ALB only from CloudFront origin-facing servers
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id

  prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id

  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"

  description = "Allow HTTP only from CloudFront origin-facing servers"
}

# ECS Security Group
resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-${var.environment}-ecs-sg"
  description = "Security group for ECS Fargate tasks"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-sg"
  }
}

# Allow inbound traffic from the ALB to the ECS tasks on the application port
resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id = aws_security_group.ecs.id

  referenced_security_group_id = aws_security_group.alb.id

  from_port   = var.app_port
  to_port     = var.app_port
  ip_protocol = "tcp"

  description = "Allow application traffic from the ALB"
}

# Allow outbound traffic from ECS tasks to the internet
resource "aws_vpc_security_group_egress_rule" "ecs_outbound" {
  security_group_id = aws_security_group.ecs.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

  description = "Allow ECS tasks outbound access"
}

# Allow ALB outbound traffic only to ECS tasks on the application port
resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id = aws_security_group.alb.id

  referenced_security_group_id = aws_security_group.ecs.id

  from_port   = var.app_port
  to_port     = var.app_port
  ip_protocol = "tcp"

  description = "Allow ALB traffic to ECS tasks"
}

# Database Security Group
resource "aws_security_group" "db" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Security group for the application database"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-db-sg"
  }
}

# Allow database traffic only from ECS tasks
resource "aws_vpc_security_group_ingress_rule" "db_from_ecs" {
  security_group_id = aws_security_group.db.id

  referenced_security_group_id = aws_security_group.ecs.id

  from_port   = var.db_port
  to_port     = var.db_port
  ip_protocol = "tcp"

  description = "Allow database traffic from ECS tasks"
}