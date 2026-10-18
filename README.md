# LangNation Cloud Platform

I built this platform step by step as part of my **AWS Cloud Computing with AI Bootcamp** capstone.

The project started with a VPC and network isolation, then moved the application to ECS Fargate. After that I added load balancing, Auto Scaling, CI/CD, persistent storage, edge security, persistent DNS and Cognito authentication.

**Current implementation:** Milestones 1–6 complete
**AWS Region:** `us-east-1`
**Infrastructure:** Terraform + HCP Terraform
**Application deployment:** GitHub Actions + AWS OIDC

## Live Interactive Architecture

[▶ Open the Interactive M1–M6 Architecture](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m06.html)

Explore the implemented architecture milestone by milestone, or follow the end-to-end Web, CI/CD, Authentication, Data, Terraform and Morning Recovery flows.

---

## Architecture

![LangNation Cloud Platform — Milestones 1–6](docs/architecture/master/current-platform-m01-m06.png)

Current request path:

```text
User
  ↓
Route 53
  ↓
CloudFront + ACM
  ↓
AWS WAF
  ↓
Application Load Balancer
  ↓
ECS Fargate
  ↓
RDS MySQL / S3
```

The application runs across two Availability Zones. ECS tasks and the database stay in private subnets, while the public entry path is controlled through CloudFront and the ALB.

The ALB accepts origin traffic only from the AWS-managed CloudFront origin-facing prefix list, so users cannot bypass CloudFront/WAF by calling the ALB directly.

---

## What Is Implemented

### Foundation & Networking

- custom VPC `10.0.0.0/16`
- two Availability Zones
- two public subnets
- two private application subnets
- two isolated private database subnets
- Internet Gateway
- one NAT Gateway per AZ
- layered security groups
- Terraform modules and remote state

### Containers & Compute

- Node.js / Express application
- Docker
- private Amazon ECR repository
- Amazon ECS
- AWS Fargate
- CloudWatch Logs
- ECS desired-state recovery

### Load Balancing & Scaling

- internet-facing Application Load Balancer
- IP target group
- `/health` checks
- two baseline ECS tasks across two AZs
- ECS Service Auto Scaling
- minimum 2 / maximum 4 tasks
- CPU target tracking at 50%
- controlled scale-out test from 2 to 4 tasks

### CI/CD

- GitHub Actions
- GitHub OIDC → AWS STS
- no long-lived AWS deployment keys in GitHub
- repository- and branch-restricted IAM trust
- Git-SHA Docker image tags
- automated ECR push
- automated ECS task-definition revisions
- rolling ECS deployments
- independent ECS stability checks
- exact deployed-image verification
- public health verification after deployment

### Database & Storage

- Amazon RDS for MySQL
- Multi-AZ database
- private DB subnet group
- no public database access
- ECS SG → DB SG on TCP 3306 only
- storage encryption enabled
- RDS-managed master password in AWS Secrets Manager
- 7-day backup retention
- private Amazon S3 bucket
- Block Public Access
- `BucketOwnerEnforced`
- versioning
- SSE-S3 / AES256 encryption
- HTTPS-only bucket policy
- lifecycle cleanup

### Edge, DNS & Authentication

- persistent Route 53 DNS outside the disposable sandbox
- ACM certificate
- CloudFront
- HTTP → HTTPS redirect
- TLS 1.2 minimum
- AWS WAF managed common rules
- per-IP rate rule
- CloudFront-only ALB ingress
- Amazon Cognito User Pool
- Cognito public web client
- JWT verification with `aws-jwt-verify`
- public `/health`
- protected `/protected`
- verified `401` without JWT
- verified `200` with a valid Cognito access token

---

## Milestones

| Milestone | Implementation | Status |
|---|---|---|
| [M01](docs/milestones/M01-foundation-networking.md) | Foundation & Networking | ✅ Complete |
| [M02](docs/milestones/M02-docker-ecr-ecs-fargate.md) | Docker, ECR & ECS Fargate | ✅ Complete |
| [M03](docs/milestones/M03-alb-multiaz-autoscaling.md) | ALB, Multi-AZ & Auto Scaling | ✅ Complete |
| [M04](docs/milestones/M04-automated-deployment.md) | Automated Deployment | ✅ Complete |
| [M05](docs/milestones/M05-database-storage.md) | Database & Storage | ✅ Complete |
| [M06](docs/milestones/M06-edge-dns-security-authentication.md) | Edge, DNS, Security & Authentication | ✅ Complete |

Each milestone includes the design reasoning, my Excalidraw architecture sketch, the final documentation diagram, implementation decisions, validation and lessons learned.

---

## Automated Sandbox Recovery

The AWS training sandbox removes resources regularly, so I designed the environment to be reproducible rather than dependent on manually preserved infrastructure.

**Operational prerequisite:** the neue-fische training sandbox must be activated manually before AWS API access is available. The recovery workflow cannot activate the educational sandbox itself. Once an active sandbox session exists, the workflow automates the infrastructure rebuild, application deployment, DNS synchronization and public health validation.

The successful recovery flow is:

```text
Manual: activate training sandbox
        ↓
active AWS session available
        ↓
Scheduled or manually triggered GitHub workflow
        ↓
HCP Terraform rebuild
        ↓
AWS infrastructure recreated
        ↓
GitHub Actions restores the application
        ↓
new CloudFront endpoint discovered
        ↓
persistent Route 53 record updated
        ↓
public HTTPS /health verified
```

This uses two GitHub OIDC trust paths:

```text
GitHub Actions
→ training AWS account
→ application deployment

GitHub Actions
→ personal AWS account
→ restricted Route 53 update
```

No long-lived personal AWS access keys are stored in GitHub.

See [OP01 — Automated Morning Sandbox Recovery](docs/operations/OP01-automated-morning-sandbox-recovery.md).

---

## Infrastructure and Deployment Ownership

I intentionally separated responsibilities so multiple automation systems do not fight over the same runtime state.

```text
HCP Terraform
→ infrastructure
→ authoritative Terraform plan/apply/state

GitHub Actions
→ application images
→ ECS task-definition revisions
→ application releases

Application Auto Scaling
→ live ECS desired task count
```

The ECS service lifecycle ignores runtime `task_definition` and `desired_count` changes that are owned by CI/CD and Auto Scaling.

---

## Repository Structure

```text
.
├── .github/
│   └── workflows/
│
├── application/
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── terraform/
│   ├── environments/
│   │   └── dev/
│   │
│   └── modules/
│       ├── networking/
│       ├── security/
│       ├── container/
│       ├── load_balancing/
│       ├── cicd/
│       ├── database/
│       ├── storage/
│       ├── edge/
│       └── authentication/
│
└── docs/
    ├── architecture/
    ├── evidence/
    ├── interactive/
    ├── milestones/
    ├── operations/
    └── presentation/
```

Local research, drafts and working files are intentionally kept outside the public project structure.

---

## Documentation

Start here:

**[Project Documentation](docs/README.md)**

Useful sections:

- [Live Interactive Architecture](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m06.html)
- [Interactive architecture source](docs/interactive/langnation-architecture-m01-m06.html)
- [Operations / recovery](docs/operations/OP01-automated-morning-sandbox-recovery.md)
- [Milestone 6 validation evidence](docs/evidence/M06-validation-evidence-checklist.md)
- [Progress presentation — PDF](docs/presentation/LangNation_M1-M6_Monday_Presentation.pdf)
- [Progress presentation — PowerPoint](docs/presentation/LangNation_M1-M6_Monday_Presentation.pptx)

---

## Validation Highlights

Some of the tests completed so far include:

```text
CloudFront /health                  → 200
HTTP → HTTPS                        → 301
WAF controlled XSS-style request   → 403
Direct ALB request                  → blocked / timeout
/protected without JWT             → 401
/protected with valid JWT          → 200

ECS baseline                       → 2 desired / 2 running
Auto Scaling test                  → 2 → 4 running tasks
CI/CD                              → Git SHA image deployed and verified
Morning recovery                   → full end-to-end run passed after sandbox activation
```

These checks are documented in the individual milestone files rather than treating a successful Terraform apply as the only proof of completion.

---

## Current Security Model

```text
Internet
   ↓
Route 53
   ↓
CloudFront + ACM + WAF
   ↓
ALB
   │ ingress only from CloudFront origin-facing addresses
   ↓
ECS Fargate
   │ port 3000 only from ALB SG
   ↓
RDS MySQL
     port 3306 only from ECS SG
```

Viewer HTTPS terminates at CloudFront. CloudFront currently communicates with the ALB over HTTP port 80; this repository does not claim end-to-end TLS to the origin.

---

## Planned Next Phases

The following work is planned and is **not yet presented as completed functionality**:

- **Milestone 7** — Serverless & Event-Driven Architecture
- **Milestone 8** — RAG Knowledge Pipeline
- **Milestone 9** — Lina AI Tutor / RAG Runtime
- **Milestone 10** — Security, Monitoring, CI/CD Quality Gates, Resilience & Final Architecture

These later phases are intentionally separated from the implemented M1–M6 platform.

---

## Author

**Seraj Ahmad Siddiqui**

AWS Cloud Computing with AI Bootcamp — Capstone Project
