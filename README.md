# LangNation Cloud Platform

**AWS Cloud Computing with AI Bootcamp — Final Capstone (M01–M12)**  
**Author:** Seraj Ahmad Siddiqui  
**Region:** `us-east-1` · **Environment:** disposable training sandbox (`dev`)

An infrastructure-as-code AWS learning platform for LangNation. It combines highly available private ECS Fargate workloads, encrypted Multi-AZ MariaDB, a protected public edge, event-driven knowledge ingestion, grounded Lina RAG, quality-gated CI/CD, monitoring, governance, and reproducible morning recovery.

## Interactive Architecture

[▶ Explore the complete M01–M12 interactive architecture](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m12.html) · [HTML source](docs/interactive/langnation-architecture-m01-m12.html)

The interactive walkthrough supports animated live overview, Pause/Play, individual milestones, focused flows, and an automatic presentation sequence.

## Final Architecture

![LangNation Cloud Platform — final M01–M12 architecture](docs/architecture/master/final-platform-m01-m12.png)

### Public application path

```text
User → Route 53 (persistent personal AWS account)
     → CloudFront + ACM + AWS WAF
     → ALB (HTTP :80, CloudFront-only ingress)
     → IP target group (:3000)
     → private ECS Fargate (2 Availability Zones)
     → private RDS MariaDB / S3 / Lina RAG
```

**Database:** RDS MariaDB 11.8.9, Multi-AZ, encrypted, private, backed up, with Secrets Manager-managed credentials.  
**Compute:** ECS Fargate baseline 2 tasks; Auto Scaling minimum 2, maximum 4, target CPU 50%.  
**Networking:** VPC `10.0.0.0/16`, six subnets across two AZs, two NAT Gateways, layered security groups.

### Event-driven RAG

```text
S3 document → EventBridge → SQS → Lambda (Python)
            → Titan Text Embeddings V2 → Amazon S3 Vectors

Lina API → Titan query embedding → S3 Vectors retrieval
         → retrieved LangNation context → Claude Haiku → grounded answer
```

Failures retry through SQS and can reach a dead-letter queue. The real application uses verified MariaDB TLS and the recovery workflow restores a sanitized 58-table dataset.

### Delivery, security and observability

GitHub Actions uses OIDC/STS temporary AWS credentials, immutable Git-SHA container images, and mandatory application, dependency, Terraform, Docker smoke-test, and Trivy quality gates. Terraform configuration and HCP Terraform own infrastructure/state; GitHub Actions manages application releases; ECS Auto Scaling manages the live desired task count.

CloudWatch provides the operations dashboard and **nine alarms**; Multi-Region CloudTrail delivers management-event audit logs to a dedicated private S3 bucket.

## Milestone Documentation

| Milestone | Topic | Status |
|---|---|---|
| [M01](docs/milestones/M01-foundation-networking.md) | Foundation and Networking | Complete |
| [M02](docs/milestones/M02-docker-ecr-ecs-fargate.md) | Docker, ECR, ECS Fargate | Complete |
| [M03](docs/milestones/M03-alb-multiaz-autoscaling.md) | ALB, Multi-AZ, Auto Scaling | Complete |
| [M04](docs/milestones/M04-automated-deployment.md) | Automated Deployment | Complete |
| [M05](docs/milestones/M05-database-storage.md) | Database and Storage | Complete |
| [M06](docs/milestones/M06-edge-dns-security-authentication.md) | Edge, DNS, Security, Authentication | Complete |
| [M07](docs/milestones/M07-serverless-event-driven-processing.md) | Event-Driven Processing | Complete |
| [M08](docs/milestones/M08-rag-knowledge-pipeline.md) | RAG Knowledge Pipeline | Complete |
| [M09](docs/milestones/M09-application-integration-rag-runtime.md) | Real Application, DB Restore, Lina RAG | Complete |
| [M10](docs/milestones/M10-security-monitoring-governance.md) | Monitoring, Security and Governance | Complete |
| [M11](docs/milestones/M11-cicd-quality-gates-release-hardening.md) | CI/CD Quality Gates | Complete |
| [M12](docs/milestones/M12-resilience-cost-final-validation.md) | Resilience, Cost and Final Validation | Complete |

## Tested Results

- Public `/health`: HTTP 200; WAF controlled request blocked (403); direct ALB bypass blocked.
- Cognito protected endpoint: 401 without valid access token, 200 with a valid token.
- Controlled ECS scaling from 2 to 4 tasks.
- SQS retries and DLQ handling validated; CloudWatch DLQ alarm observed ALARM → OK.
- S3 document embedding and S3 Vectors semantic retrieval verified.
- Sanitized MariaDB restore validated at 58 tables; Lina returned a grounded answer and source.
- M11 GitHub Actions quality gates passed after fixing a real critical base-image vulnerability.
- M12 controlled task stop: public `/health` remained 200; ECS restored the 2-task baseline in approximately 44 seconds.
- AWS Cost Explorer period 1–23 October 2026: about **USD 23.78 usage before tax**, **USD 28.07 including shown tax**. Two NAT Gateways are a material cost driver; the resilient architecture was intentionally retained.

These are validation observations in the training environment, **not** claims of production uptime or load-test certification.

## Automated Morning Recovery (OP01)

The educational sandbox must be activated **manually**. Once AWS access is available, GitHub Actions coordinates HCP Terraform infrastructure recreation, one-off ECS Fargate MariaDB restore (58-table validation), application redeployment, current CloudFront domain discovery, cross-account Route 53 UPSERT/INSYNC and public HTTPS health validation. Primary schedule: **07:37 Europe/Berlin**; fallback: **08:17** with a prior health check.

[Read the operations runbook](docs/operations/OP01-automated-morning-sandbox-recovery.md).

## Documentation and Submission

- [Documentation index](docs/README.md)
- [Architecture guide](docs/architecture/README.md)
- [Evidence and screenshots](docs/evidence/README.md)
- [Interactive walkthrough](docs/interactive/README.md)
- [Operations](docs/operations/README.md)
- [Final report (PDF)](docs/report/LangNation_Cloud_Platform_Final_Capstone_Report.pdf) · [Word](docs/report/LangNation_Cloud_Platform_Final_Capstone_Report.docx)
- [Final presentation (PDF)](docs/presentation/LangNation_Final_Capstone_M1-M12.pdf) · [PowerPoint](docs/presentation/LangNation_Final_Capstone_M1-M12.pptx)
- [AWS tools guide (Word)](docs/guides/LangNation_AWS_Tools_Guide_M1-M12.docx)
- [Project study guide (Word)](docs/guides/LangNation_Cloud_Project_Study_Guide_M1-M12.docx)

`Research/` contains local-only drafts/working material and is excluded from Git.

## Technical Ownership

```text
HCP Terraform: authoritative infrastructure state, plan and apply
GitHub Actions: application build, image and deployment revisions
ECS Auto Scaling: live desired task count
OP01 recovery: restore infrastructure, DB, application and DNS
```

**Project author:** Seraj Ahmad Siddiqui
