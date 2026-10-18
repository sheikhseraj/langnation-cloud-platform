# Milestone 6 — Validation Evidence Checklist

Use this file when collecting screenshots and final-report evidence.

## DNS / Route 53

- [x] `Resolve-DnsName namienterprises.in -Type NS` returns the four Route 53 nameservers.
- [x] `Resolve-DnsName cloud.namienterprises.in -Type CNAME` resolves to the active CloudFront distribution.
- [x] Existing website/mail DNS records were preserved.
- [ ] Capture Route 53 hosted-zone screenshot showing `cloud` and ACM validation CNAME.

## ACM

- [x] Certificate covers `cloud.namienterprises.in`.
- [x] Certificate covers `*.cloud.namienterprises.in`.
- [x] Validation status = `SUCCESS`.
- [x] Certificate status = `ISSUED`.
- [x] Recreated certificate auto-validates because persistent DNS validation CNAME survives sandbox cleanup.
- [ ] Capture ACM certificate screenshot.

## CloudFront

- [x] Distribution status = `Deployed`.
- [x] Alias = `cloud.namienterprises.in`.
- [x] HTTPS works.
- [x] HTTP redirects to HTTPS with 301.
- [x] `/health` returns `{"status":"healthy"}`.
- [x] Response includes CloudFront headers (`Via`, `X-Amz-Cf-Pop`, `X-Cache`).
- [ ] Capture CloudFront distribution screenshot.

## AWS WAF

- [x] WAF Web ACL attached to CloudFront.
- [x] AWSManagedRulesCommonRuleSet enabled.
- [x] RateLimitPerIP enabled.
- [x] Normal `/health` request returns 200.
- [x] Controlled XSS-like request returns 403.
- [ ] Capture WAF rules screenshot.
- [ ] Capture blocked-request metrics/sample if available.

## ALB Origin Protection

- [x] Public HTTP ALB ingress removed.
- [x] Public HTTPS ALB ingress removed.
- [x] ALB port 80 accepts only AWS CloudFront origin-facing prefix list.
- [x] Managed prefix list validated as `com.amazonaws.global.cloudfront.origin-facing`.
- [x] Direct ALB `/health` request times out.
- [x] CloudFront `/health` continues to work.
- [ ] Capture ALB security-group screenshot.

## GitHub CI/CD

- [x] Deployment role uses GitHub OIDC.
- [x] Deployment workflow waits for ECS service stability.
- [x] Active ECS task-definition image is compared with `GITHUB_SHA`.
- [x] Desired/running/pending task counts validated.
- [x] Final health check is performed through CloudFront.
- [x] Latest deployment workflow is green.
- [ ] Capture latest green deployment workflow screenshot.

## Morning Recovery

- [x] Primary schedule changed to 07:37 Europe/Berlin.
- [x] Fallback schedule added at 08:17 Europe/Berlin.
- [x] Fallback skips rebuild when public endpoint is already healthy.
- [x] HCP Terraform auto-apply run created via API.
- [x] Application deployment called after Terraform rebuild.
- [x] CloudFront domain read from HCP Terraform outputs.
- [x] Personal AWS Route 53 updated through OIDC role.
- [x] DNS change waits for `INSYNC`.
- [x] Public HTTPS endpoint verified after DNS sync.
- [x] Full manual workflow-dispatch recovery run succeeded.
- [ ] Observe and capture the next real 07:37 scheduled execution.
- [ ] Observe 08:17 fallback behavior (skip when already healthy).

## Cognito

- [x] User Pool created.
- [x] Email sign-in enabled.
- [x] Email verification enabled.
- [x] Strong password policy enabled.
- [x] App Client created without client secret.
- [x] Test user status = `CONFIRMED`.
- [x] Access token returned.
- [x] ID token returned.
- [x] Refresh token returned.
- [x] Test password rotated after CLI exposure.
- [x] Previous session globally signed out.
- [ ] Capture Cognito User Pool screenshot.
- [ ] Capture App Client screenshot without exposing sensitive user data.

## Application Authentication

- [x] `aws-jwt-verify` added to Node.js application.
- [x] `COGNITO_USER_POOL_ID` passed through ECS task definition.
- [x] `COGNITO_CLIENT_ID` passed through ECS task definition.
- [x] `/health` remains public and returns 200.
- [x] `/protected` without JWT returns 401.
- [x] `/protected` with valid Cognito access token returns 200.
- [x] JWT payload is made available to the request handler after verification.

## Milestone 6 Completion

- [x] Persistent DNS
- [x] HTTPS
- [x] CloudFront
- [x] WAF
- [x] Origin hardening
- [x] Cognito authentication
- [x] JWT application integration
- [x] Automated cross-account DNS recovery
- [x] Manual end-to-end validation
- [ ] Real scheduled morning-run evidence
