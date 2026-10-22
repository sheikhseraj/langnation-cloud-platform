# LangNation Cloud Platform — Project Documentation

**AWS Cloud Computing with AI Bootcamp · Complete M01–M12 capstone**  
**Author:** Seraj Ahmad Siddiqui · **AWS Region:** `us-east-1`

This index connects the final architecture, milestone implementation notes, evidence, operations runbook, interactive walkthrough, learning guides, presentation and thesis-style submission report.

## Complete Platform Architecture

![Final M01–M12 AWS architecture](architecture/master/final-platform-m01-m12.png)

[Architecture guide and image catalog](architecture/README.md) · [Interactive M01–M12 live walkthrough](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m12.html)

The platform includes a two-AZ VPC, private ECS Fargate application, ALB, CloudFront/ACM/WAF, persistent Route 53, Cognito, private Multi-AZ MariaDB, encrypted S3, EventBridge/SQS/Lambda ingestion, Titan embeddings, S3 Vectors, Claude-powered Lina, CloudWatch, CloudTrail and GitHub Actions quality-gated deployments.

## Milestones

| Milestone | Implementation |
|---|---|
| [M01](milestones/M01-foundation-networking.md) | Foundation & Networking |
| [M02](milestones/M02-docker-ecr-ecs-fargate.md) | Docker / ECR / ECS Fargate |
| [M03](milestones/M03-alb-multiaz-autoscaling.md) | ALB, Multi-AZ, Auto Scaling |
| [M04](milestones/M04-automated-deployment.md) | Automated Deployment |
| [M05](milestones/M05-database-storage.md) | Database & Storage |
| [M06](milestones/M06-edge-dns-security-authentication.md) | Edge, DNS, Security & Authentication |
| [M07](milestones/M07-serverless-event-driven-processing.md) | Serverless Event Processing |
| [M08](milestones/M08-rag-knowledge-pipeline.md) | RAG Knowledge Pipeline |
| [M09](milestones/M09-application-integration-rag-runtime.md) | Real Application, DB Restore, Lina RAG |
| [M10](milestones/M10-security-monitoring-governance.md) | Monitoring, Security & Governance |
| [M11](milestones/M11-cicd-quality-gates-release-hardening.md) | Quality Gates & Release Hardening |
| [M12](milestones/M12-resilience-cost-final-validation.md) | Resilience, Cost & Final Validation |

All twelve technical milestones were completed in the training sandbox. The corresponding milestone documents describe their chronology, architecture, implementation, troubleshooting and validation.

## Evidence

[Evidence index](evidence/README.md)

- [M06](evidence/M06-validation-evidence.md): public HTTPS, WAF, Cognito, origin restriction and recovery.
- [M07](evidence/M07-validation-evidence.md): event ingestion, retries and DLQ.
- [M08](evidence/M08-validation-evidence.md): document embeddings and semantic retrieval.
- [M11](evidence/M11-quality-gates-validation-evidence.md): pre-deployment quality gates and successful release.
- [M12](evidence/M12-validation-evidence.md): controlled ECS self-healing and final validation.
- [M12 cost review](evidence/M12-cost-analysis-evidence.md): observed October Cost Explorer data.
- [Evidence screenshots](evidence/screenshots/): screenshots and presentation graphics.

### Selected outcomes

| Check | Observed result |
|---|---|
| Public application health | HTTP 200 |
| WAF controlled test | HTTP 403 |
| Authenticated API | 401 without token; 200 with valid Cognito JWT |
| Database restore | Sanitized 58-table MariaDB dataset validated |
| RAG | Ingestion and grounded Lina answer/source verified |
| Monitoring | Nine CloudWatch alarms; DLQ ALARM → OK confirmed |
| Governance | CloudTrail management log delivered to private audit S3 |
| CI/CD | Mandatory tests, Terraform check, smoke test and Trivy gate passed |
| ECS resilience | 2/2/0 → 2/1/1 → 2/2/0 in approximately 44 seconds; public HTTP 200 throughout |
| Cost Explorer | Approximately USD 23.78 usage before tax (1–23 October 2026) |

## Interactive Architecture

[▶ Open complete M01–M12 live interactive architecture](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m12.html)

[Interactive source and instructions](interactive/README.md) · [HTML file](interactive/langnation-architecture-m01-m12.html)

Use the live overview to watch all connections simultaneously, or select individual milestones and end-to-end workflows.

## Operations

[OP01 — Automated Morning Sandbox Recovery](operations/OP01-automated-morning-sandbox-recovery.md) · [Operations index](operations/README.md)

Manual training-sandbox activation is a prerequisite. OP01 then runs the HCP Terraform rebuild, one-off MariaDB data restore with 58-table validation, application redeployment, CloudFront-domain discovery, persistent Route 53 synchronization and public HTTPS validation.

## Guides, Report and Presentation

- [AWS Tools Guide — M01–M12 (Word)](guides/LangNation_AWS_Tools_Guide_M1-M12.docx)
- [Project Study Guide — M01–M12 (Word)](guides/LangNation_Cloud_Project_Study_Guide_M1-M12.docx)
- [Final Capstone Report (PDF)](report/LangNation_Cloud_Platform_Final_Capstone_Report.pdf) · [Word](report/LangNation_Cloud_Platform_Final_Capstone_Report.docx)
- [Final M01–M12 Presentation (PDF)](presentation/LangNation_Final_Capstone_M1-M12.pdf) · [PowerPoint](presentation/LangNation_Final_Capstone_M1-M12.pptx)

## Documentation Structure

```text
docs/
├── README.md
├── architecture/
│   ├── master/
│   ├── milestones/
│   └── flows/
├── evidence/
│   └── screenshots/
├── milestones/          # M01–M12 documents
├── operations/          # OP01 recovery runbook
├── interactive/         # live M01–M12 HTML
├── guides/
├── presentation/
└── report/
```

The milestone architecture image directories `m01`–`m06` and `M07`–`M12` currently use different case. Links in each milestone document match the actual directory names. A future filename-normalization pass can standardize the directories if needed; avoid case-only folder renames without validating GitHub links.

## Architecture and Recovery Principle

Infrastructure is disposable, while Git history, Terraform configuration, HCP Terraform state and the persistent Route 53 zone provide the reproducible control plane.

**Terraform owns infrastructure; GitHub Actions owns application releases; ECS Auto Scaling owns live desired capacity; OP01 coordinates recovery.**
