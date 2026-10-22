# LangNation Cloud Platform — Operations

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`

---

## Purpose

This folder contains operational runbooks for procedures that span multiple parts of the LangNation Cloud Platform and need a repeatable recovery or administration sequence.

Operational runbooks are intentionally kept separate from milestone documentation:

```text
docs/milestones/
→ explains what was built and why

docs/evidence/
→ proves that important behavior worked

docs/operations/
→ explains how to operate or recover the platform
```

The operations folder is intentionally small. A new `OPxx` document should be added only when a procedure is genuinely operational, repeatable and cross-cutting.

---

## Current Runbooks

### OP01 — Automated Morning Sandbox Recovery

```text
OP01-automated-morning-sandbox-recovery.md
```

Purpose:

```text
Manual neue-fische sandbox activation
        ↓
HCP Terraform infrastructure rebuild
        ↓
sanitized MariaDB restore
        ↓
58-table validation
        ↓
LangNation application redeployment
        ↓
CloudFront discovery
        ↓
persistent Route 53 synchronization
        ↓
public HTTPS health validation
```

The runbook documents:

- 07:37 Europe/Berlin primary schedule
- 08:17 Europe/Berlin fallback schedule
- manual sandbox-activation prerequisite
- dedicated HCP Terraform recovery run
- database-restore image and one-off ECS Fargate restore task
- AWS Secrets Manager credential retrieval
- sanitized 58-table MariaDB restore
- reusable application deployment workflow
- Git-SHA deployment traceability
- dynamic CloudFront output discovery
- cross-account GitHub OIDC
- restricted Route 53 update
- `INSYNC` DNS validation
- final `https://cloud.namienterprises.in/health` verification

Related architecture:

```text
../architecture/flows/morning-sandbox-recovery.png
```

---

## Why There Is Only One Runbook

The capstone does not need an operations document for every AWS service.

Topics such as:

```text
CI/CD quality gates
RAG ingestion
CloudWatch alarms
ECS self-healing
database architecture
```

are already documented sufficiently in their milestone and evidence files.

OP01 is maintained separately because recovery crosses:

```text
GitHub Actions
HCP Terraform
AWS infrastructure
Amazon ECR
Amazon ECS
Amazon RDS
AWS Secrets Manager
Amazon CloudFront
Amazon Route 53
```

and represents a real operational procedure that may need to be executed repeatedly.

---

## Optional Future Runbooks

These are not required for the current capstone, but could be added in a production environment if operational complexity increases:

```text
OP02 — ECS Deployment Rollback
OP03 — DLQ Investigation and Reprocessing
OP04 — End-to-End Service Health Troubleshooting
```

They should not be added simply to increase documentation volume.

---

## Final Operations Structure

```text
docs/
└── operations/
    ├── README.md
    └── OP01-automated-morning-sandbox-recovery.md
```

This is the recommended final structure for the capstone repository.
