# Amazon Cognito User Pool for LangNation authentication
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-users"

  # Users sign in with their email address
  username_attributes = [
    "email"
  ]

  # Automatically verify email addresses
  auto_verified_attributes = [
    "email"
  ]

  # Password security policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # Allow users to recover their account using verified email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # MFA can be introduced later when required
  mfa_configuration = "OFF"

  # Sandbox resources are recreated regularly,
  # therefore deletion protection must remain disabled
  deletion_protection = "INACTIVE"

  tags = {
    Name        = "${var.project_name}-${var.environment}-users"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Cognito App Client used by the LangNation web application
resource "aws_cognito_user_pool_client" "web" {
  name = "${var.project_name}-${var.environment}-web-client"

  user_pool_id = aws_cognito_user_pool.main.id

  # Browser-based applications must not store a client secret
  generate_secret = false

  # Supported authentication flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Prevent Cognito from revealing whether a user account exists
  prevent_user_existence_errors = "ENABLED"

  # Allow refresh tokens to be revoked
  enable_token_revocation = true

  # Token lifetime configuration
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}