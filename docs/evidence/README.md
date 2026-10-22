# LangNation Cloud Platform — Validation Evidence

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Status:** ✅ Evidence structure established

---

## 1. Purpose

This folder contains validation evidence for the LangNation Cloud Platform capstone.

The project uses two complementary documentation layers:

```text
docs/milestones/
→ explains what was built
→ explains architecture and implementation
→ records technical decisions
→ records problems, solutions and lessons learned

docs/evidence/
→ proves that important capabilities worked
→ records PASS / FAIL validation
→ references screenshots
→ records controlled failure tests
→ preserves selected operational evidence
```

The evidence folder is intentionally selective.

Not every milestone requires a separate evidence document. Dedicated evidence files are used where a milestone contains controlled tests, complex validation, security proof, operational proof or final submission evidence that is useful to review independently.

---

## 2. Evidence Files

### Milestone 6 — Edge, DNS, Security & Authentication

```text
M06-validation-evidence.md
```

Contains validation and screenshot tracking for:

- Route 53
- ACM
- CloudFront
- AWS WAF
- ALB origin protection
- GitHub OIDC deployment
- morning recovery
- Cognito
- JWT-protected application access

Related milestone:

```text
../milestones/M06-edge-dns-security-authentication.md
```

---

### Milestone 7 — Serverless & Event-Driven Processing

```text
M07-validation-evidence.md
```

Contains detailed proof for:

- Terraform validation
- S3 event generation
- EventBridge routing
- SQS buffering
- Lambda execution
- controlled failure
- 180-second retry behavior
- Dead Letter Queue delivery
- least-privilege IAM
- CloudWatch logging

Related milestone:

```text
../milestones/M07-serverless-event-driven-processing.md
```

---

### Milestone 8 — RAG Knowledge Pipeline

```text
M08-validation-evidence.md
```

Contains detailed proof for:

- Titan Text Embeddings V2
- 1024-dimensional embeddings
- S3 Vectors
- vector metadata
- document ingestion
- chunking
- semantic query
- semantic ranking
- least-privilege IAM
- retained M7 retry and DLQ behavior

Related milestone:

```text
../milestones/M08-rag-knowledge-pipeline.md
```

---

### Milestone 11 — CI/CD Quality Gates & Release Hardening

```text
M11-quality-gates-validation-evidence.md
```

Contains release evidence for:

- application tests
- dependency audit
- Terraform format and validation
- Docker build
- container smoke test
- Trivy security scan
- CRITICAL vulnerability detection
- Node 24 remediation
- final successful quality-gated deployment

Related milestone:

```text
../milestones/M11-cicd-quality-gates-release-hardening.md
```

---

### Milestone 12 — Final Validation

```text
M12-validation-evidence.md
```

Provides the overall final validation record for:

- two-task ECS baseline
- two-AZ task placement
- controlled task termination
- public availability during failure
- ECS automatic replacement
- approximately 44-second recovery
- final `2 / 2 / 0` service state
- cost-analysis completion
- final architecture decision

Related milestone:

```text
../milestones/M12-resilience-cost-final-validation.md
```

---

### Milestone 12 — Cost Analysis

```text
M12-cost-analysis-evidence.md
```

Contains the detailed AWS Cost Explorer evidence for:

- October 2026 service-level cost breakdown
- subtotal before tax
- tax
- total including tax
- major cost categories
- cost interpretation

This remains separate from the overall M12 validation file because the detailed cost table is evidence rather than milestone narrative.

---

## 3. Screenshot Structure

Recommended screenshot organization:

```text
docs/evidence/
└── screenshots/
    ├── m06/
    ├── m07/
    ├── m08/
    ├── m09/
    ├── m10/
    ├── m11/
    └── m12/
```

Use milestone prefixes in screenshot filenames.

Example:

```text
M11-quality-gates-deployment-success.png
```

For Milestone 12:

```text
M12-resilience-baseline-2tasks-2az-http200.png
M12-resilience-self-healing-live-monitor.png
M12-resilience-replacement-task-final-state.png
M12-cost-explorer-service-breakdown-october.png
```

---

## 4. Evidence Naming Convention

Use:

```text
MNN-<topic>-evidence.md
```

Examples:

```text
M06-validation-evidence.md
M07-validation-evidence.md
M08-validation-evidence.md
M11-quality-gates-validation-evidence.md
M12-validation-evidence.md
M12-cost-analysis-evidence.md
```

Screenshot convention:

```text
MNN-<short-description>.png
```

This keeps the repository easy to scan and avoids duplicate files such as:

```text
(1)
(2)
-copy
-final-final
```

---

## 5. Evidence Principles

### Evidence Should Prove Behavior

Prefer evidence such as:

```text
HTTP 200
ALARM → OK
2 / 1 / 1 → 2 / 2 / 0
grounded=true
DLQ message count
successful GitHub workflow
real CloudTrail object
```

rather than screenshots that only prove a resource exists.

### Controlled Tests Are Valuable

Where possible, evidence should show:

```text
expected failure
→ system response
→ recovery
```

Examples in this project include:

- M7 controlled Lambda failure
- M10 DLQ alarm detection and recovery
- M11 Trivy release block
- M12 ECS task-failure self-healing

### Secrets Must Not Appear

Evidence must never expose:

- passwords
- access tokens
- refresh tokens
- private keys
- AWS secret values
- production credentials
- personal user data

Crop or redact sensitive information before committing screenshots.

### Evidence Should Match the Final Architecture

Do not retain screenshots that represent abandoned architecture if they could confuse the final project story.

Historical troubleshooting evidence can remain in milestone documentation when it explains an important lesson.

---

## 6. Final Evidence Set

Current canonical Markdown evidence set:

```text
docs/evidence/
├── README.md
├── M06-validation-evidence.md
├── M07-validation-evidence.md
├── M08-validation-evidence.md
├── M11-quality-gates-validation-evidence.md
├── M12-validation-evidence.md
└── M12-cost-analysis-evidence.md
```

This structure is intentionally compact.

Additional milestone-specific evidence files should only be added when they provide clear value and do not duplicate the milestone documentation.

---

## 7. Final Submission Rule

Before the final repository push:

```text
1. confirm all evidence links resolve
2. confirm referenced screenshots exist
3. remove duplicate evidence files
4. remove screenshots containing sensitive information
5. verify filenames follow the milestone naming convention
6. verify milestone docs reference the correct evidence files
7. run git diff --check
```

The evidence layer should make the capstone easier to verify, not harder to navigate.
