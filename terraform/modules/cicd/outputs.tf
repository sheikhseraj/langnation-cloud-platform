# Define the CI/CD Module Outputs
output "github_actions_role_arn" {
  description = "ARN of the IAM role assumed by GitHub Actions for deployments"
  value       = aws_iam_role.github_actions_deploy.arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}