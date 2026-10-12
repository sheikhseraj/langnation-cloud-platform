# Create the ECR repository
resource "aws_ecr_repository" "app" {
  name = "${var.project_name}-${var.environment}-app"

  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-app"
  }
}