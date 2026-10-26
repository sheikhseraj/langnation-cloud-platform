# LangNation Cloud Platform — Project Documentation
## Final AWS Cloud Computing with AI Capstone — Milestones M01–M12

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`) — educational AWS training sandbox  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform  
**Remote State / Authoritative Plan & Apply:** HCP Terraform (`cloudforge-capstone` / `langnation-capstone-dev`)  
**Application Delivery:** GitHub Actions + OIDC + ECR + ECS Fargate  
**Documentation Status:** M01–M12 implementation and validation documented; final report, presentation and guides are published as PDFs

---

## 1. Documentation Overview

This directory is the **technical documentation and submission index** for the LangNation Cloud Platform capstone. The root [project README](../README.md) introduces the complete solution. This file provides direct access to the architecture, implementation milestones, evidence, operations, learning resources, presentation and formal report.

The platform demonstrates six engineering goals:

- **Secure infrastructure:** private ECS/RDS tiers, restricted security groups, CloudFront, WAF and Cognito authentication.
- **High availability:** two Availability Zones, ECS service replacement, Auto Scaling and Multi-AZ MariaDB.
- **Reproducible deployment:** Terraform, authoritative HCP Terraform state, and GitHub Actions with OIDC.
- **Event-driven AI:** S3/EventBridge/SQS/Lambda ingestion, Titan text embeddings, S3 Vectors and grounded Lina responses.
- **Observability and governance:** CloudWatch dashboard, nine alarms and Multi-Region CloudTrail.
- **Recoverable sandbox:** OP01 rebuilds infrastructure, restores 58 sanitized database tables, deploys the application and synchronizes persistent DNS after manual lab activation.

### 1.1 Where to Start

| Goal | Recommended document |
|---|---|
| Understand the whole project | [Root project README](../README.md) |
| See the AWS design | [Final master architecture](architecture/master/final-platform-m01-m12.png) |
| Explore animated service connections | [Live interactive M01–M12 walkthrough](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-master.html) |
| Review technical implementation | [Milestone documents](#3-implementation-milestones-m01m12) |
| Inspect measured validation | [Evidence index](evidence/README.md) |
| Understand daily rebuild operations | [OP01 recovery runbook](operations/OP01-automated-morning-sandbox-recovery.md) |
| Submit the written capstone | [Final report — PDF](report/LangNation_Cloud_Platform_Final_Capstone_Report.pdf) |
| Deliver the presentation | [Final presentation — PDF](presentation/LangNation_Final_Capstone.pdf) |

---

## 2. Final Platform Architecture

![LangNation Cloud Platform — Final M01–M12 Master Architecture](architecture/master/final-platform-m01-m12.png)

**[Open the full-resolution architecture image](architecture/master/final-platform-m01-m12.png)** · [Architecture catalog and conventions](architecture/README.md)

The completed architecture includes:

| Layer | Implemented components |
|---|---|
| Network | VPC `10.0.0.0/16`, six subnets, 2 AZs, 2 NAT Gateways, route tables, security groups |
| Public edge | Persistent Route 53 (personal AWS account), CloudFront, ACM, AWS WAF |
| Application | ALB, private ECS Fargate, ECR, ECS Auto Scaling, Node.js LangNation application |
| Data | Private Multi-AZ RDS MariaDB 11.8.9, Secrets Manager, encrypted and versioned S3 |
| Identity | Amazon Cognito user pool, access JWT verification |
| Asynchronous processing | S3 events, EventBridge, SQS, Python Lambda, dead-letter queue |
| AI / RAG | Bedrock Titan Text Embeddings V2, Amazon S3 Vectors, Claude Haiku 4.5, Lina API |
| Operations | CloudWatch Logs, dashboard, 9 alarms, Multi-Region CloudTrail and private audit S3 |
| Delivery and recovery | GitHub Actions, OIDC/STS, Terraform/HCP, quality gates, Trivy, OP01 |

### 2.1 Public Application Request

```text
User / student
    ↓ HTTPS
Route 53 DNS (persistent personal AWS account)
    ↓
CloudFront + ACM + AWS WAF
    ↓ HTTP port 80; ALB restricted to CloudFront origin-facing addresses
Application Load Balancer
    ↓ Target Group TCP 3000
ECS Fargate tasks in two private app subnets
    ├── RDS MariaDB (private DB tier; verified TLS)
    ├── Amazon S3
    ├── Cognito JWT validation
    └── Lina AI question-answering runtime
```

The ALB is internet-facing but **not directly open to arbitrary public sources**. ECS tasks have no public IPs. The database is not publicly accessible. Viewer-side HTTPS terminates at CloudFront; this design does **not** claim TLS on the CloudFront-to-ALB HTTP origin connection.

### 2.2 RAG Knowledge and Question Answering

```text
S3 document → EventBridge → SQS → Lambda
            → Titan embeddings (1024 dimensions) → S3 Vectors

Student question → POST /api/lina/ask
                 → Titan query embedding → S3 Vectors similarity search
                 → retrieved German-learning content
                 → Claude Haiku 4.5 → grounded response + source
```

The application runs with a sanitized **58-table MariaDB dataset**. The ingestion pipeline has retry handling and a DLQ.

---

## 3. Implementation Milestones M01–M12

| Milestone | Scope | Documentation status |
|---|---|---|
| [M01 — Foundation & Networking](milestones/M01-foundation-networking.md) | VPC, six subnets, gateways, routing, SGs | ✅ Implemented / validated |
| [M02 — Docker, ECR & ECS Fargate](milestones/M02-docker-ecr-ecs-fargate.md) | Docker image, ECR, private Fargate runtime | ✅ Implemented / validated |
| [M03 — ALB, Multi-AZ & Auto Scaling](milestones/M03-alb-multiaz-autoscaling.md) | Health checks, 2-AZ tasks, scaling 2–4 | ✅ Implemented / validated |
| [M04 — Automated Deployment](milestones/M04-automated-deployment.md) | GitHub Actions, OIDC, rolling deployments | ✅ Implemented / validated |
| [M05 — Database & Storage](milestones/M05-database-storage.md) | Private RDS/S3 foundations and encryption | ✅ Implemented / validated |
| [M06 — Edge, DNS, Security & Authentication](milestones/M06-edge-dns-security-authentication.md) | CloudFront, WAF, ACM, Route 53, Cognito | ✅ Implemented / validated |
| [M07 — Serverless Event Processing](milestones/M07-serverless-event-driven-processing.md) | EventBridge, SQS, Lambda, DLQ | ✅ Implemented / validated |
| [M08 — RAG Knowledge Pipeline](milestones/M08-rag-knowledge-pipeline.md) | Titan embeddings, chunking, S3 Vectors | ✅ Implemented / validated |
| [M09 — App Integration & Lina RAG](milestones/M09-application-integration-rag-runtime.md) | Real app, 58-table MariaDB restore, grounded answers | ✅ Implemented / validated |
| [M10 — Monitoring & Governance](milestones/M10-security-monitoring-governance.md) | CloudWatch dashboard/alarms and CloudTrail | ✅ Implemented / validated |
| [M11 — CI/CD Quality Gates](milestones/M11-cicd-quality-gates-release-hardening.md) | App checks, Terraform, Docker smoke, Trivy | ✅ Implemented / validated |
| [M12 — Resilience, Cost & Final Validation](milestones/M12-resilience-cost-final-validation.md) | Self-healing test, Cost Explorer and evidence | ✅ Implemented / validated |

Each document records the objective, architecture decisions, implementation process, important services and configuration, test evidence, troubleshooting and lessons learned. **M05 originally introduced MySQL; the final M09+ database implementation is MariaDB 11.8.9.** Historical milestone descriptions and the final platform state should be distinguished.

---

## 4. Architecture Diagrams and Visual Learning

[Architecture README](architecture/README.md)

### 4.1 Master and Workflow Diagrams

- [Final M01–M12 architecture](architecture/master/final-platform-m01-m12.png)
- [CI/CD deployment flow](architecture/flows/cicd-deployment-pipeline.png)
- [Morning sandbox recovery flow](architecture/flows/morning-sandbox-recovery.png)

### 4.2 Milestone Diagram Organization

```text
architecture/
├── README.md
├── master/
│   └── final-platform-m01-m12.png
├── flows/
│   ├── cicd-deployment-pipeline.png
│   └── morning-sandbox-recovery.png
└── milestones/
    ├── m01/ ... m06/    # Lowercase directories in the current repository
    └── M07/ ... M12/    # Uppercase directories in the current repository
```

**GitHub case-sensitivity note:** Paths in milestone Markdown are corrected to match the actual folder case. Do not rename folders by changing only capitalization without checking the resulting Git history and all image references.

### 4.3 Interactive Architecture

**[▶ Open the final M01–M12 live interactive walkthrough](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-master.html)**

[Read the usage guide](interactive/README.md) · [Open HTML source](interactive/langnation-architecture-master.html)

The live overview displays animated service connections together. **Pause / Play** freezes or resumes those connections. A separate Auto Presentation mode tours M01–M12 and selected end-to-end workflows. Light/dark theme, speed controls and fullscreen are included.

---

## 5. Testing, Validation and Evidence

[Open the evidence index](evidence/README.md) · [Screenshots](evidence/screenshots/)

| Validation | Recorded outcome | Evidence |
|---|---|---|
| Public HTTPS health, WAF, Cognito, ALB restrictions | HTTP 200 / 403 / 401→200; bypass blocked | [M06](evidence/M06-validation-evidence.md) |
| Event processing / retries / DLQ | Controlled event failures delivered to DLQ | [M07](evidence/M07-validation-evidence.md) |
| Document embedding / semantic retrieval | Titan vectors and S3 Vectors query validated | [M08](evidence/M08-validation-evidence.md) |
| Lina application and MariaDB | Grounded response + source, TLS DB access, 58 tables | [M09](milestones/M09-application-integration-rag-runtime.md) |
| Monitoring and governance | 9 alarms; DLQ ALARM → OK; CloudTrail S3 audit logs | [M10](milestones/M10-security-monitoring-governance.md) |
| CI/CD release hardening | Mandatory gates green; CRITICAL image vulnerability fixed | [M11](evidence/M11-quality-gates-validation-evidence.md) |
| ECS self-healing | 2/2/0 → 2/1/1 → 2/2/0 in ~44 seconds; HTTP 200 throughout | [M12](evidence/M12-validation-evidence.md) |
| AWS operating cost | $23.78 usage before tax; $28.07 including recorded tax | [M12 cost](evidence/M12-cost-analysis-evidence.md) |

### 5.1 Evidence Interpretation

These results reflect **controlled validation in a temporary AWS training sandbox**. They demonstrate configured behavior and tested recovery under the tested conditions, not guaranteed production uptime, a penetration-test certification or a performance SLA.

### 5.2 Cost Observation

The Cost Explorer snapshot covers **1–23 October 2026**. NAT Gateway hourly charges were a material contributor. Lower-cost development alternatives were considered, but the final capstone retained two NAT Gateways and Multi-AZ MariaDB to preserve its high-availability design.

---

## 6. Operations — OP01 Morning Sandbox Recovery

[OP01 — Automated Morning Sandbox Recovery](operations/OP01-automated-morning-sandbox-recovery.md) · [Operations index](operations/README.md)

The training sandbox is cleaned periodically. **The educational lab must be activated manually before the workflow can use AWS credentials**; GitHub Actions does not activate the external lab portal.

After activation, the OP01 workflow performs:

1. HCP Terraform rebuild of disposable sandbox infrastructure.
2. One-off ECS Fargate database restore, followed by verification of 58 sanitized MariaDB tables.
3. Application image build/deployment and ECS stability checks.
4. Discovery of the new CloudFront distribution domain.
5. Restricted OIDC role assumption into the persistent personal AWS account.
6. Route 53 CNAME update and wait for `INSYNC`.
7. Public HTTPS `/health` validation.

**Current trigger: manual only.** Select **Actions → Morning Sandbox Rebuild (Manual Only) → Run workflow** after starting the lab. The original 07:37/08:17 schedules, automatic lab startup, and deployment on application pushes were disabled after submission.

### 6.1 Ownership Model

```text
Terraform + HCP Terraform  → infrastructure, remote state, authoritative plan/apply
GitHub Actions              → application build, quality gates and releases
ECS Application Auto Scaling→ runtime desired-count changes
OP01 recovery               → infrastructure + database + application + DNS restoration
```

---

## 7. Learning Guides and Submission Materials

| Material | Available versions |
|---|---|
| **Final capstone thesis-style report** | [PDF](report/LangNation_Cloud_Platform_Final_Capstone_Report.pdf) |
| **Final M01–M12 presentation** | [PDF](presentation/LangNation_Final_Capstone.pdf) |
| **AWS Tools Guide M01–M12** | [PDF](guides/LangNation_AWS_Tools_Guide.pdf) |
| **Cloud Project Study Guide M01–M12** | [PDF](guides/LangNation_Cloud_Project_Study_Guide.pdf) |

The report, presentation and guides are **PDF submission documents**; source drafts are maintained outside the public documentation folder. The technical implementation and recorded tests are documented separately under `milestones/`, `operations/` and `evidence/`.

---

## 8. Documentation Folder Structure

```text
docs/
├── README.md
├── architecture/
│   ├── README.md
│   ├── master/              # Final integrated architecture
│   ├── milestones/          # Milestone-specific diagrams
│   └── flows/               # CI/CD and morning recovery
├── milestones/              # M01–M12 Markdown reports
├── evidence/
│   ├── README.md
│   └── screenshots/         # Captured validation
├── operations/              # OP01 runbooks
├── interactive/             # Live HTML + usage README
├── guides/                  # Tools and study guides
├── presentation/            # Final slides (PDF)
└── report/                  # Final written submission (PDF)
```

All paths in this document are relative to `docs/README.md`. The root `README.md` is one directory above (`../README.md`). Keep the separate local `Research/` folder excluded from public Git commits.

---

## 9. Documentation Principles and Final Summary

The project’s main operational constraint is a **disposable sandbox**, while Git, Terraform configuration, HCP Terraform state and persistent DNS remain the durable control plane. This is why recovery and validation are treated as architecture requirements, not optional administrative tasks.

The final submission is organized around three complementary forms of evidence:

- **Implementation:** twelve milestone documents describing what was built and why.
- **Validation:** reproducible tests, operational measurements, screenshots and failure-recovery observations.
- **Communication:** final architecture diagrams, interactive walkthrough, formal report, guides and slides.

**Author:** Seraj Ahmad Siddiqui  
**Project:** AWS Cloud Computing with AI — Final Capstone
