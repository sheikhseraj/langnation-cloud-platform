# LangNation Cloud Platform
## Milestone 6 — Edge, DNS, Security & Authentication

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Public Capstone Endpoint:** `cloud.namienterprises.in`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Amazon Route 53, Amazon CloudFront, AWS Certificate Manager, AWS WAF, Application Load Balancer, Amazon Cognito, AWS IAM, AWS STS, GitHub OIDC  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 6 added the secure public edge, persistent DNS and authentication layer to the LangNation Cloud Platform.

The main goals were to:

- keep the existing LangNation production domain untouched
- use a separate experimental hostname for the capstone
- keep authoritative DNS persistent outside the disposable training sandbox
- terminate public HTTPS at CloudFront
- protect the public edge with AWS WAF
- prevent direct ALB bypass
- add Cognito authentication
- validate JWT-protected application access
- extend recovery automation so DNS follows recreated CloudFront infrastructure

The public application path became:

```text
User
  ↓
Persistent Route 53
  ↓
CloudFront + ACM
  ↓
AWS WAF
  ↓
Application Load Balancer
  ↓
Private ECS Fargate
  ↓
Node.js application
```

Authentication adds:

```text
Client
  ↓
Amazon Cognito
  ↓
access token
  ↓
GET /protected
  ↓
JWT verification
  ↓
authorized response
```

This milestone transformed the application from a publicly reachable ALB-backed service into a protected edge architecture with persistent DNS and authenticated API access.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

I recreated the Milestone 6 architecture in Excalidraw to understand the relationship between persistent DNS, CloudFront, WAF, ACM, the ALB, ECS and Cognito.

![Milestone 6 design sketch](../architecture/milestones/m06/design-sketch.png)

### Final Milestone Architecture

The final milestone architecture shows the secure public edge, origin protection and authentication components introduced in Milestone 6.

![Milestone 6 final architecture](../architecture/milestones/m06/milestone-architecture.png)

### Platform Design After Milestone 6

This cumulative view shows the platform after networking, containerization, load balancing, Auto Scaling, CI/CD, persistent data, secure edge services and authentication had been combined.

![Milestone 6 cumulative design sketch](../architecture/milestones/m06/design-sketch-platform.png)

![Platform after Milestone 6](../architecture/milestones/m06/platform-after-m06.png)

---

## 3. Public Edge Architecture

The final public request path is:

```text
User
  ↓
Route 53
  ↓
CloudFront
  ├── ACM certificate
  └── AWS WAF
  ↓
Application Load Balancer
  ↓
Target Group
  ↓
Private ECS Fargate tasks
  ↓
Node.js application
```

The platform still retains the capabilities introduced in earlier milestones:

- Multi-AZ VPC
- public, private-app and private-DB subnets
- NAT Gateways
- ECS Fargate
- Application Load Balancer
- Auto Scaling
- Amazon ECR
- RDS MySQL Multi-AZ
- private S3 storage
- GitHub Actions CI/CD
- HCP Terraform remote plan/apply/state

---

## 4. Persistent DNS Strategy

The training sandbox is disposable, but public DNS must remain stable.

The design therefore separates:

```text
Personal AWS account
→ persistent Route 53 hosted zone

Training sandbox AWS account
→ disposable CloudFront, WAF, ACM, ALB, ECS, RDS, S3, etc.
```

This created an important architecture principle:

> **Persistent DNS + disposable infrastructure**

The capstone hostname is:

```text
cloud.namienterprises.in
```

The existing root website and email DNS records were preserved when authoritative DNS moved to Route 53.

This means the public hostname stays stable even when the underlying sandbox infrastructure is recreated.

---

## 5. ACM and HTTPS

The CloudFront certificate covers:

```text
cloud.namienterprises.in
*.cloud.namienterprises.in
```

DNS validation is stored in the persistent Route 53 zone.

A useful recovery behavior was observed after sandbox cleanup:

```text
old sandbox ACM certificate removed
        ↓
Terraform creates a new certificate
        ↓
same DNS validation record is reused
        ↓
persistent Route 53 record already exists
        ↓
new certificate reaches ISSUED
```

Terraform uses an explicit certificate-validation dependency so CloudFront waits for ACM validation before using the certificate.

### Viewer Security

```text
HTTP
  ↓
301 redirect
  ↓
HTTPS
```

Minimum TLS policy:

```text
TLSv1.2_2021
```

Public viewer traffic is therefore encrypted before reaching the application edge.

---

## 6. Amazon CloudFront

CloudFront sits in front of the Application Load Balancer.

Key settings:

```text
Alias: cloud.namienterprises.in
IPv6: enabled
Viewer protocol: redirect HTTP to HTTPS
Minimum TLS: TLSv1.2_2021
Price class: PriceClass_100
Origin: Application Load Balancer
Origin protocol: HTTP :80
Cache policy: CachingDisabled
Origin request policy: AllViewerExceptHostHeader
```

Caching is disabled because the current application behaves primarily as a dynamic API and `/health` should reflect current runtime state.

### TLS Boundary

Public viewer traffic is encrypted to CloudFront.

The current origin path is:

```text
CloudFront
   ↓ HTTP :80
ALB
```

The project therefore does **not** claim end-to-end TLS between CloudFront and the ALB.

A future production-hardening option is HTTPS between CloudFront and the ALB.

---

## 7. AWS WAF

A CloudFront-scoped AWS WAF Web ACL protects the public edge.

Rules include:

```text
AWSManagedRulesCommonRuleSet
RateLimitPerIP
```

The per-IP rate rule uses a limit of:

```text
1000 requests
```

### Functional Validation

Normal request:

```text
GET /health
→ HTTP 200
```

Controlled suspicious / XSS-style request:

```text
GET /health?test=<script>...</script>
→ HTTP 403
```

This proved that WAF was actively filtering traffic rather than being attached without functional validation.

---

## 8. Blocking Direct ALB Bypass

Before hardening, the ALB could be called directly from the internet.

That would allow a user to bypass:

```text
CloudFront
+
AWS WAF
```

The ALB security group was therefore restricted to the AWS-managed CloudFront origin-facing prefix list:

```text
com.amazonaws.global.cloudfront.origin-facing
```

Validated prefix list during the milestone:

```text
pl-3b927c52
```

Final ALB ingress:

```text
Protocol: TCP
Port: 80
Source: CloudFront origin-facing managed prefix list
Public CIDR: none
```

The previous public HTTPS rule was removed because CloudFront currently reaches the ALB over HTTP port 80.

### Validation

Protected public path:

```text
https://cloud.namienterprises.in/health
→ 200
```

Direct ALB path:

```text
http://<alb-dns>/health
→ timeout / blocked
```

This proved that users could no longer bypass CloudFront and WAF by calling the ALB DNS name directly.

---

## 9. Amazon Cognito Authentication

Milestone 6 introduced a dedicated authentication module.

### User Pool

Configuration includes:

- email-based sign-in
- automatic email verification
- account recovery through verified email
- minimum password length 8
- uppercase required
- lowercase required
- number required
- symbol required
- MFA off for the initial implementation
- deletion protection inactive in the disposable sandbox

### App Client

The browser-style app client uses:

```text
generate_secret = false
```

Supported authentication flows include:

```text
ALLOW_USER_SRP_AUTH
ALLOW_USER_PASSWORD_AUTH
ALLOW_REFRESH_TOKEN_AUTH
```

Security setting:

```text
prevent_user_existence_errors = ENABLED
```

Token lifetimes:

```text
Access token: 60 minutes
ID token: 60 minutes
Refresh token: 30 days
```

The app client does not use a client secret because a browser-style public client cannot safely protect one.

---

## 10. Cognito Integration with ECS

Terraform passes these identifiers into the ECS task definition:

```text
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
```

Dependency path:

```text
authentication module
        ↓
Cognito IDs
        ↓
container module
        ↓
ECS task definition
        ↓
Node.js application
```

These values identify AWS resources but are not secret credentials, so normal ECS environment variables are appropriate.

Passwords, access tokens and refresh tokens are not stored in Terraform.

---

## 11. JWT-Protected API

The Node.js application uses:

```text
aws-jwt-verify
```

Public endpoints remain:

```text
GET /
GET /health
```

Protected endpoint:

```text
GET /protected
Authorization: Bearer <access-token>
```

JWT validation checks include:

- Cognito JWT signature
- expected user pool
- token use = `access`
- expected app client ID
- token expiration

### Functional Tests

Public health:

```text
GET /health
→ HTTP 200
```

Protected endpoint without a token:

```text
GET /protected
→ HTTP 401
```

Protected endpoint with a valid Cognito access token:

```text
GET /protected
→ HTTP 200
```

This demonstrated authenticated access through the complete public path:

```text
Route 53
  ↓
CloudFront
  ↓
WAF
  ↓
ALB
  ↓
ECS
  ↓
JWT verification
```

---

## 12. Deployment Verification Hardening

Milestone 6 also strengthened the GitHub Actions deployment checks.

The earlier pipeline could report a transient ECS deployment failure even though ECS later converged to the correct healthy state.

The hardened sequence is:

```text
Build Docker image
        ↓
Push Git-SHA image to ECR
        ↓
Register task-definition revision
        ↓
Update ECS service
        ↓
aws ecs wait services-stable
        ↓
verify running task image = triggering Git SHA
        ↓
verify desired == running
        ↓
verify pending == 0
        ↓
discover CloudFront distribution
        ↓
GET /health through CloudFront
```

This validates the final service state rather than relying only on one transient deployment indicator.

Public health verification now occurs through CloudFront instead of directly through the ALB because the ALB is intentionally no longer publicly bypassable.

---

## 13. Automated Morning Recovery

The nightly sandbox cleanup means edge resources such as CloudFront and ACM can be recreated.

The recovery workflow therefore also handles public DNS.

**Operational prerequisite:** the neue-fische training sandbox must be activated manually before AWS API access is available.

The scheduled workflow can trigger automatically, but it cannot activate the educational sandbox itself.

Once the sandbox session is active, the remaining recovery sequence is automated.

### Schedule

```text
07:37 Europe/Berlin — primary
08:17 Europe/Berlin — fallback
```

The fallback skips the rebuild when the endpoint is already healthy.

### Recovery Flow

```text
Manual: activate training sandbox
        ↓
active AWS session available
        ↓
Scheduled or manually triggered GitHub workflow
        ↓
HCP Terraform rebuild
        ↓
application deployment
        ↓
read new CloudFront domain
        ↓
assume restricted personal-AWS Route 53 role
        ↓
UPSERT cloud.namienterprises.in
        ↓
wait for Route 53 INSYNC
        ↓
verify public HTTPS /health
```

A dedicated cross-account GitHub OIDC role is restricted to the Route 53 operations needed for the hosted zone.

No long-lived personal AWS access keys are stored in GitHub.

### Validation Status

Before activation, recovery attempts produced explicit-deny errors because the training sandbox session was inactive.

After manually activating the sandbox, a complete `workflow_dispatch` run was validated successfully:

```text
Check Whether Recovery Is Needed   PASS
Rebuild AWS Infrastructure         PASS
Restore LangNation Application     PASS
Sync Persistent Route 53 DNS       PASS
```

The primary/fallback schedule is implemented.

Both schedules still depend on an active training-sandbox session; sandbox activation itself remains manual.

For the complete operational recovery design, see:

[OP01 — Automated Morning Sandbox Recovery](../operations/OP01-automated-morning-sandbox-recovery.md)

---

## 14. Terraform Structure

Milestone 6 introduced or extended infrastructure for:

```text
edge
→ ACM
→ CloudFront
→ WAF

authentication
→ Cognito User Pool
→ Cognito App Client

security
→ CloudFront-only ALB ingress

container
→ Cognito environment values

CI/CD / recovery
→ CloudFront health verification
→ cross-account Route 53 update
```

The resulting architecture remains reproducible through Terraform and GitHub Actions rather than depending on manual console configuration.

The modules exchange identifiers and outputs rather than depending on hard-coded disposable AWS resource IDs.

---

## 15. Implementation Summary

1. selected a separate capstone hostname
2. preserved the existing production-domain and email DNS records
3. kept authoritative DNS in a persistent Route 53 hosted zone
4. created the ACM certificate for the capstone hostname
5. configured DNS-based ACM validation
6. created the CloudFront distribution
7. configured HTTP-to-HTTPS redirect
8. configured `TLSv1.2_2021`
9. used the ALB as the CloudFront origin
10. disabled caching for the dynamic application
11. created the CloudFront-scoped AWS WAF Web ACL
12. attached the AWS managed common rule set
13. configured the per-IP rate rule
14. validated WAF with a controlled suspicious request
15. restricted ALB ingress to the CloudFront origin-facing managed prefix list
16. verified that direct public ALB access was blocked
17. created the Cognito User Pool
18. created the browser-style Cognito App Client
19. passed Cognito identifiers into ECS
20. added JWT verification to the Node.js application
21. validated public `/health`
22. validated unauthorized `/protected` access
23. validated authorized `/protected` access with a Cognito token
24. hardened deployment verification through CloudFront
25. extended morning recovery to discover recreated CloudFront infrastructure
26. added cross-account Route 53 synchronization through OIDC
27. validated complete recovery after manually activating the sandbox

---

## 16. Useful Commands and Validation Checks

### Public Health Check

```text
GET https://cloud.namienterprises.in/health
```

Expected result:

```text
HTTP 200
```

### Direct ALB Validation

```text
GET http://<alb-dns>/health
```

Expected after origin hardening:

```text
blocked / timeout
```

### Protected Endpoint Without Token

```text
GET /protected
```

Expected result:

```text
HTTP 401
```

### Protected Endpoint With Valid Cognito Access Token

```text
GET /protected
Authorization: Bearer <access-token>
```

Expected result:

```text
HTTP 200
```

### ECS Stability Check Used by CI/CD

```text
aws ecs wait services-stable
```

### Recovery DNS Operation

The recovery workflow performs a Route 53 UPSERT for:

```text
cloud.namienterprises.in
```

and waits until the Route 53 change reaches:

```text
INSYNC
```

---

## 17. Validation

### DNS / HTTPS

- [x] Route 53 is authoritative for the capstone domain
- [x] public DNS delegation verified
- [x] ACM certificate issued
- [x] recreated ACM certificate validates using persistent DNS
- [x] CloudFront distribution deployed
- [x] custom hostname resolves to CloudFront
- [x] HTTPS `/health` returns 200
- [x] HTTP redirects to HTTPS

### WAF / Origin Protection

- [x] AWS managed common rules attached
- [x] per-IP rate rule attached
- [x] normal request returns 200
- [x] controlled suspicious request returns 403
- [x] ALB ingress restricted to CloudFront origin-facing prefix list
- [x] direct public ALB request blocked

### Authentication

- [x] Cognito User Pool created
- [x] Cognito public app client created
- [x] test authentication returns tokens
- [x] `/health` remains public
- [x] `/protected` without JWT returns 401
- [x] `/protected` with valid access token returns 200

### CI/CD / Recovery

- [x] GitHub deployment verifies CloudFront health
- [x] cross-account Route 53 OIDC role works
- [x] recovery workflow reads recreated CloudFront domain
- [x] Route 53 update reaches `INSYNC`
- [x] manually triggered full recovery completed successfully after sandbox activation

---

## 18. Controlled Security Tests

### WAF Functional Test

Normal request:

```text
GET /health
→ HTTP 200
```

Controlled suspicious request:

```text
GET /health?test=<script>...</script>
→ HTTP 403
```

Observed result:

```text
Normal traffic
→ allowed

Controlled suspicious traffic
→ blocked by WAF
```

### Direct-Origin Bypass Test

CloudFront path:

```text
https://cloud.namienterprises.in/health
→ HTTP 200
```

Direct ALB path:

```text
http://<alb-dns>/health
→ blocked / timeout
```

This proved that the public edge controls could not be bypassed by calling the ALB directly.

### Authentication Test

```text
/protected without access token
→ HTTP 401

/protected with valid Cognito access token
→ HTTP 200
```

This proved that the application enforced JWT authorization rather than merely creating Cognito resources.

---

## 19. Problems and Solutions

### Problem 1 — DNS Delegation Took Time to Propagate

After changing nameservers, some public resolvers continued returning the previous nameservers for several hours.

**Cause:**  
Normal DNS delegation propagation and resolver caching.

**Resolution:**  
Allow propagation to complete instead of repeatedly changing delegation settings.

**Lesson:**  
DNS changes should be validated patiently across authoritative and recursive resolution paths before making additional changes.

---

### Problem 2 — ACM ARN Changed After Sandbox Cleanup

A hard-coded ACM ARN became invalid when the sandbox removed the certificate.

**Cause:**  
ACM certificates inside the sandbox are disposable resources and receive new identifiers after recreation.

**Fix:**  
Use Terraform-managed dependencies and outputs instead of treating disposable ARNs as persistent configuration.

**Lesson:**  
Persistent automation should reference recreated infrastructure dynamically.

---

### Problem 3 — ECS Deployment Action Reported a False Failure

One deployment action reported a failure even though ECS later converged to the correct Git SHA and healthy state.

**Fix:**  
Use independent ECS stability waiting plus exact image, task-count and public-health verification.

**Lesson:**  
The final AWS state is a stronger deployment signal than a single transient action result.

---

### Problem 4 — PowerShell AWS CLI Shorthand Parsing

Compound AWS CLI arguments containing commas were initially parsed incorrectly.

**Fix:**  
Quote compound shorthand values carefully in PowerShell or construct the complete argument in a variable before passing it to the AWS CLI.

**Lesson:**  
Shell parsing behavior is part of reliable infrastructure automation and should be considered when translating AWS CLI examples between shells.

---

### Problem 5 — Recovery Failed While the Training Sandbox Was Inactive

Automated recovery attempts received explicit-deny errors before the neue-fische training sandbox had been activated.

**Cause:**  
AWS API access for the educational sandbox is not available until the sandbox session is manually started.

**Resolution:**  
Treat sandbox activation as an external prerequisite. Once active, the automated recovery workflow handles the remaining infrastructure, deployment and DNS recovery steps.

**Lesson:**  
Automation boundaries should be documented clearly when an external system cannot be controlled programmatically.

---

## 20. Security Decisions

### Why Persistent Route 53?

DNS must survive nightly cleanup even when the workload does not.

Separating persistent DNS from the disposable sandbox keeps the public hostname stable.

### Why CloudFront in Front of the ALB?

CloudFront provides:

- HTTPS termination
- AWS WAF integration
- a controlled public entry point
- future caching possibilities for static content

### Why Block Direct ALB Access?

Leaving the ALB publicly accessible would allow users to bypass CloudFront and WAF.

The ALB therefore accepts origin traffic only from the AWS-managed CloudFront origin-facing prefix list.

### Why Keep `/health` Public?

Infrastructure health checks and deployment validation require a non-authenticated health endpoint.

### Why No Cognito Client Secret?

A browser/public client cannot safely store a long-lived client secret.

### Why Cognito IDs Are Normal Environment Variables

The User Pool ID and Client ID identify resources but are not credentials.

Passwords and tokens remain outside Terraform configuration.

### Why Origin Traffic Remains HTTP

Viewer traffic is encrypted to CloudFront, and the ALB accepts origin traffic only from CloudFront addresses.

For this milestone, that provided a simpler edge design without claiming end-to-end TLS.

---

## 21. Cost and Operational Decisions

### CloudFront Price Class

CloudFront uses:

```text
PriceClass_100
```

This limits the edge footprint and reduces cost for the capstone environment.

### AWS WAF

Milestone 6 adds costs for:

- Web ACL
- managed rules
- rate-based rule processing
- requests

The WAF cost is accepted because the milestone demonstrates an actively protected public edge.

### Route 53

The persistent hosted zone remains outside the disposable sandbox.

This introduces a small continuing DNS cost, but it prevents nightly infrastructure cleanup from breaking the public hostname.

### Cognito

Cognito adds authentication capability without requiring the application to implement a complete identity store itself.

### Dynamic Application Caching

Caching is disabled because the current workload is dynamic and operational validation should observe live application behavior.

### Manual Sandbox Activation

Morning recovery is largely automated, but the training sandbox itself must still be activated manually.

This is an operational limitation of the educational environment, not a missing step in the AWS recovery workflow.

---

## 22. What I Learned

Milestone 6 gave me practical experience with:

- Route 53 authoritative DNS
- cross-account architecture
- persistent vs disposable infrastructure
- ACM DNS validation
- CloudFront aliases and TLS
- WAF managed rules
- WAF rate-based rules
- CloudFront origin hardening
- AWS-managed prefix lists
- Cognito User Pools
- Cognito App Clients
- JWT verification in Node.js
- cross-account OIDC
- deployment final-state validation
- automated DNS synchronization
- recovery design for recreated edge infrastructure

The most important architecture lesson was that recoverability is not only about recreating AWS resources.

External dependencies such as DNS must also be designed so they remain stable while disposable infrastructure changes underneath them.

Another important lesson was that a security service should be functionally tested. WAF, origin restrictions and Cognito were validated through actual allow/deny behavior rather than only through resource existence.

---

## 23. Result

Milestone 6 completed the secure public-access layer:

```text
Persistent Route 53
        ↓
CloudFront + ACM
        ↓
AWS WAF
        ↓
CloudFront-only ALB
        ↓
Private ECS Fargate
        ↓
Cognito JWT authorization
```

Final milestone state:

```text
Persistent Route 53 DNS              ✅
Custom capstone hostname              ✅
ACM certificate                       ✅
HTTPS through CloudFront              ✅
HTTP → HTTPS redirect                 ✅
AWS WAF                               ✅
Controlled WAF block test             ✅
CloudFront-only ALB ingress           ✅
Direct ALB bypass blocked             ✅
Cognito User Pool                     ✅
Cognito public app client             ✅
JWT-protected API                     ✅
401 without access token              ✅
200 with valid access token           ✅
CloudFront deployment verification    ✅
Cross-account DNS synchronization     ✅
Morning recovery integration          ✅
```

The platform now had:

- persistent DNS
- HTTPS
- WAF protection
- direct-ALB bypass prevention
- automated DNS recovery
- Cognito authentication
- JWT-protected API access
- hardened deployment verification

This prepared the platform for **Milestone 7 — Serverless & Event-Driven Processing**.

---

## Presentation Summary

> In Milestone 6 I added the secure edge, persistent DNS and authentication layer to the LangNation platform. I kept authoritative DNS in a persistent Route 53 hosted zone outside the disposable training sandbox, then placed CloudFront, ACM and AWS WAF in front of the existing ALB. I hardened the origin by allowing ALB port 80 only from the AWS-managed CloudFront origin-facing prefix list, which prevents users from bypassing WAF through the ALB DNS name. I also added Amazon Cognito and implemented JWT verification in the Node.js API, where `/health` remains public while `/protected` returns 401 without a token and 200 with a valid access token. Finally, I extended the recovery workflow so that after the sandbox is manually activated, Terraform can recreate disposable edge resources, GitHub Actions can redeploy the application, and a restricted cross-account OIDC role can update persistent Route 53 to the recreated CloudFront distribution. The key lesson was that a recoverable cloud platform must treat persistent external dependencies such as DNS differently from disposable runtime infrastructure.
