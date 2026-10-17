# Define the authentication module outputs
output "user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_endpoint" {
  description = "Endpoint of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.endpoint
}

# Outputs for the Cognito App Client used by the LangNation web application
output "user_pool_client_id" {
  description = "Client ID used by the LangNation web application"
  value       = aws_cognito_user_pool_client.web.id
}