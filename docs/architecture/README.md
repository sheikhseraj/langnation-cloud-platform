# LangNation Cloud Platform — Architecture Documentation

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Status:** Architecture structure standardized; M07–M12 diagrams pending final creation

---

## 1. Purpose

This folder contains the architecture diagrams for the LangNation Cloud Platform capstone.

The architecture documentation has three goals:

1. show the architecture introduced by each milestone
2. show how the complete platform evolves cumulatively
3. provide a small number of cross-cutting flow diagrams for CI/CD and recovery

The final repository should avoid duplicate diagrams that communicate the same information with different filenames.

The rule is:

> **Every architecture file must have a clear and unique purpose.**

---

## 2. Final Folder Structure

The canonical structure is:

```text
docs/
└── architecture/
    ├── README.md
    │
    ├── milestones/
    │   ├── m01/
    │   ├── m02/
    │   ├── m03/
    │   ├── m04/
    │   ├── m05/
    │   ├── m06/
    │   ├── m07/
    │   ├── m08/
    │   ├── m09/
    │   ├── m10/
    │   ├── m11/
    │   └── m12/
    │
    ├── flows/
    │   ├── cicd-deployment-pipeline-design-sketch.png
    │   ├── cicd-deployment-pipeline.png
    │   ├── morning-sandbox-recovery-design-sketch.png
    │   └── morning-sandbox-recovery.png
    │
    └── master/
        ├── final-platform-m01-m12.excalidraw
        └── final-platform-m01-m12.png
```

The editable `.excalidraw` master source is recommended where available.

The PNG is the presentation and Markdown-friendly export.

---

## 3. Milestone Diagram Standard

### Milestone 1

Milestone 1 is the foundation and has no previous cumulative platform.

Use only:

```text
docs/architecture/milestones/m01/
├── design-sketch.png
└── milestone-architecture.png
```

### Milestones 2–12

Use exactly four diagram roles:

```text
docs/architecture/milestones/mNN/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-mNN.png
```

Do not add alternate names such as:

```text
final.png
final-2.png
master.png
new-master.png
architecture-new.png
architecture-final-final.png
```

---

## 4. Meaning of Each Milestone Diagram

### `design-sketch.png`

Purpose:

```text
learning / design thinking
```

Shows only the architecture introduced or changed in that milestone.

This is the student's own design-oriented view and may be simpler or more conceptual than the polished architecture.

Example for M07:

```text
S3
→ EventBridge
→ SQS
→ Lambda
→ CloudWatch

failure
→ retry
→ DLQ
```

---

### `milestone-architecture.png`

Purpose:

```text
polished technical milestone view
```

Shows only the important services, relationships and controls introduced in that milestone.

This is the diagram used when explaining:

> “What did you build in Milestone N?”

It should not redraw the entire platform unless the existing platform context is necessary to understand the milestone.

---

### `design-sketch-platform.png`

Purpose:

```text
cumulative learning/design view
```

Shows the full platform as understood after completing the milestone.

It can retain the Excalidraw-style learning feel.

This file should demonstrate architecture evolution rather than polished presentation design.

---

### `platform-after-mNN.png`

Purpose:

```text
polished cumulative architecture
```

Shows the complete platform after that milestone.

This is the clean cumulative version used in milestone documentation.

Example:

```text
platform-after-m08.png
```

shows everything through M08, including the RAG knowledge-ingestion layer.

---

## 5. Why Four Files Are Kept

The four-file model is intentional, not duplication.

They answer four different questions:

| File | Question Answered |
|---|---|
| `design-sketch.png` | How did I design/understand this milestone? |
| `milestone-architecture.png` | What exactly did this milestone add? |
| `design-sketch-platform.png` | How did I understand the whole platform at this point? |
| `platform-after-mNN.png` | What did the complete polished architecture look like after this milestone? |

No additional diagram variants should be created unless they represent a truly different cross-cutting flow.

---

## 6. Existing M01–M06 Structure

The existing M01–M06 architecture should remain in the standardized milestone folders.

Expected structure:

```text
milestones/
├── m01/
│   ├── design-sketch.png
│   └── milestone-architecture.png
│
├── m02/
│   ├── design-sketch.png
│   ├── milestone-architecture.png
│   ├── design-sketch-platform.png
│   └── platform-after-m02.png
│
├── m03/
│   ├── design-sketch.png
│   ├── milestone-architecture.png
│   ├── design-sketch-platform.png
│   └── platform-after-m03.png
│
├── m04/
│   ├── design-sketch.png
│   ├── milestone-architecture.png
│   ├── design-sketch-platform.png
│   └── platform-after-m04.png
│
├── m05/
│   ├── design-sketch.png
│   ├── milestone-architecture.png
│   ├── design-sketch-platform.png
│   └── platform-after-m05.png
│
└── m06/
    ├── design-sketch.png
    ├── milestone-architecture.png
    ├── design-sketch-platform.png
    └── platform-after-m06.png
```

Do not rename these again if they already match this convention.

---

## 7. M07–M12 Diagram Gap

M07–M12 milestone documentation already references the canonical architecture filenames.

The missing architecture work is therefore clear.

### M07 — Serverless & Event-Driven Processing

Create:

```text
milestones/m07/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m07.png
```

Key milestone content:

```text
S3
→ EventBridge
→ SQS
→ Lambda
→ CloudWatch

failure
→ retry
→ DLQ
```

---

### M08 — RAG Knowledge Pipeline

Create:

```text
milestones/m08/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m08.png
```

Key milestone content:

```text
S3 document
→ EventBridge
→ SQS
→ Lambda
→ S3 GetObject
→ chunking
→ Titan Text Embeddings V2
→ S3 Vectors
```

Include semantic-query validation as a retrieval path.

---

### M09 — Real Application Integration & Lina RAG Runtime

Create/standardize:

```text
milestones/m09/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m09.png
```

Existing assets such as:

```text
LangNation-AWS-M9.png
LangNation-AWS-M9-Master.png
```

should be reviewed and renamed into the canonical roles if they correspond to these diagrams.

Do not keep both the old and new filenames after the mapping is verified.

Key milestone content:

```text
real LangNation application
→ ECS Fargate
→ private MariaDB over verified TLS

Lina
→ Titan query embedding
→ S3 Vectors
→ Claude Haiku
→ grounded answer
```

---

### M10 — Security, Monitoring & Governance

Create/standardize:

```text
milestones/m10/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m10.png
```

Existing:

```text
LangNation-M10-Detailed-Architecture.png
```

is a likely candidate for:

```text
milestone-architecture.png
```

after visual verification.

Key milestone content:

```text
CloudWatch
→ dashboard
→ 9 alarms

AWS management activity
→ CloudTrail
→ private audit S3 bucket
```

---

### M11 — CI/CD Quality Gates & Release Hardening

Create/standardize:

```text
milestones/m11/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m11.png
```

Existing:

```text
LangNation-M11-Detailed-CICD-Architecture.png
```

is a likely candidate for:

```text
milestone-architecture.png
```

after visual verification.

Key milestone content:

```text
Git push
→ application tests
→ dependency audit
→ Terraform validation
→ Docker build
→ /health smoke test
→ Trivy scan
→ quality gate
→ ECR
→ ECS deployment
```

---

### M12 — Resilience, Cost Optimization & Final Validation

Create:

```text
milestones/m12/
├── design-sketch.png
├── milestone-architecture.png
├── design-sketch-platform.png
└── platform-after-m12.png
```

Key milestone content:

```text
ALB
→ ECS service
→ Task A in AZ-a
→ Task B in AZ-b

controlled task stop
→ 2/1/1
→ automatic replacement
→ 2/2/0
```

The milestone architecture may also include a small cost-analysis callout, but the diagram should remain architecture-first rather than becoming a billing dashboard.

---

## 8. Flow Diagrams

Flow diagrams are reserved for architecture that spans multiple milestones or is easier to explain sequentially.

The final canonical flow set should remain small.

### CI/CD Deployment

Keep:

```text
flows/cicd-deployment-pipeline-design-sketch.png
flows/cicd-deployment-pipeline.png
```

These represent:

```text
learning/design version
+
polished final version
```

The polished CI/CD flow should ultimately reflect the M11 release gates.

It should include:

```text
Git push
→ quality gates
→ GitHub OIDC
→ ECR
→ ECS
→ deployment validation
```

### Morning Sandbox Recovery

Keep:

```text
flows/morning-sandbox-recovery-design-sketch.png
flows/morning-sandbox-recovery.png
```

The flow should show:

```text
manual sandbox activation
→ HCP Terraform rebuild
→ database restore
→ application deployment
→ CloudFront discovery
→ Route 53 synchronization
→ public health verification
```

---

## 9. Flow Files to Review for Duplication

Existing flow files previously identified include:

```text
cicd-architecture.png
cicd-deployment-pipeline-design-sketch.png
cicd-deployment-pipeline.png
cicd-overview.png
morning-sandbox-recovery-design-sketch.png
morning-sandbox-recovery.png
```

The canonical final set is:

```text
cicd-deployment-pipeline-design-sketch.png
cicd-deployment-pipeline.png
morning-sandbox-recovery-design-sketch.png
morning-sandbox-recovery.png
```

Therefore these are **review candidates**:

```text
cicd-architecture.png
cicd-overview.png
```

If they communicate the same architecture as `cicd-deployment-pipeline.png`, move them to:

```text
Research/Architecture-History/
```

rather than keeping duplicates in `docs/architecture/flows/`.

Do not delete a file until its content has been visually compared.

---

## 10. Master Architecture Standard

The final repository should have one authoritative master architecture.

Use:

```text
docs/architecture/master/
├── final-platform-m01-m12.excalidraw
└── final-platform-m01-m12.png
```

The final master should represent the complete platform after M12.

It should include the major architecture layers without reproducing every low-level Terraform resource.

Recommended logical layers:

```text
Users / DNS / Edge
        ↓
CloudFront + WAF + ACM
        ↓
ALB
        ↓
Private ECS Fargate
        ├── MariaDB
        └── Lina RAG
              ├── Bedrock
              └── S3 Vectors

S3 knowledge
→ EventBridge
→ SQS
→ Lambda
→ embeddings/vector ingestion

GitHub
→ quality gates
→ OIDC
→ ECR/ECS deployment

CloudWatch
→ dashboard + alarms

CloudTrail
→ private audit S3

HCP Terraform
→ infrastructure state + rebuild
```

The final master should remain readable on one presentation slide.

---

## 11. Interim Master Diagrams

Interim masters were useful during implementation, for example:

```text
current-platform-m01-m06.png
LangNation-M1-M10-Master-Architecture.png
LangNation-M1-M11-Master-Architecture.png
design-sketch-platform-Master.png
```

These are valuable project history but should not compete with the final M1–M12 master in the submitted architecture folder.

Recommended action:

```text
move historical/interim masters
→ Research/Architecture-History/
```

`Research/` remains local-only and is not part of the final GitHub submission.

The final repository should not contain multiple files all presenting themselves as the current master architecture.

---

## 12. Naming Rules

Use lowercase directory names:

```text
m01
m02
...
m12
```

Use consistent filenames:

```text
design-sketch.png
milestone-architecture.png
design-sketch-platform.png
platform-after-mNN.png
```

Use descriptive cross-cutting flow names:

```text
cicd-deployment-pipeline.png
morning-sandbox-recovery.png
```

Use exactly one final master name:

```text
final-platform-m01-m12.png
```

Avoid spaces and inconsistent capitalization in repository architecture filenames.

---

## 13. Diagram Content Rules

### Use AWS Service Names Consistently

Examples:

```text
Amazon ECS
AWS Fargate
Amazon RDS
Amazon S3
Amazon CloudFront
AWS WAF
Amazon Cognito
Amazon Bedrock
Amazon SQS
Amazon EventBridge
AWS Lambda
Amazon CloudWatch
AWS CloudTrail
```

### Show Important Trust Boundaries

Where relevant, diagrams should clearly distinguish:

```text
Internet
public subnets
private application subnets
private database subnets
persistent personal AWS account
disposable training sandbox
GitHub / external CI/CD
```

### Show Security Relationships

Examples:

```text
CloudFront-only ALB ingress
ECS SG → DB SG
Secrets Manager → ECS
GitHub OIDC → temporary AWS credentials
```

### Avoid Hard-Coded Disposable IDs

Do not place values such as:

```text
subnet-...
sg-...
task-definition revision numbers
CloudFront distribution IDs
temporary ACM ARNs
```

inside final architecture diagrams.

Stable architecture values such as:

```text
VPC 10.0.0.0/16
us-east-1
cloud.namienterprises.in
```

may be shown where useful.

---

## 14. Visual Standard

Final polished diagrams should use:

- white or very light background
- consistent AWS service icons where appropriate
- readable service labels
- clear directional arrows
- logical grouping by architecture layer
- enough whitespace to avoid visual crowding
- consistent typography
- minimal decorative elements

The goal is:

```text
technical clarity
+
presentation readability
```

not maximum icon density.

Design-sketch diagrams may retain an Excalidraw-style learning appearance.

---

## 15. What Not to Put in Architecture Diagrams

Avoid turning architecture diagrams into documentation pages.

Do not overload diagrams with:

- long paragraphs
- troubleshooting logs
- full IAM policy statements
- full Terraform blocks
- complete CLI commands
- cost tables
- every CloudWatch metric
- every individual security-group rule
- every Terraform resource name

Those belong in the milestone Markdown documentation.

---

## 16. Cleanup Actions

### Keep

```text
milestones/m01–m06 canonical files
cicd-deployment-pipeline-design-sketch.png
cicd-deployment-pipeline.png
morning-sandbox-recovery-design-sketch.png
morning-sandbox-recovery.png
```

### Create / Standardize

```text
milestones/m07/
milestones/m08/
milestones/m09/
milestones/m10/
milestones/m11/
milestones/m12/

master/final-platform-m01-m12.excalidraw
master/final-platform-m01-m12.png
```

### Review and Rename

```text
LangNation-AWS-M9.png
LangNation-AWS-M9-Master.png
LangNation-M10-Detailed-Architecture.png
LangNation-M11-Detailed-CICD-Architecture.png
```

Map them to canonical filenames only after verifying their actual visual role.

### Review as Potential Duplicates

```text
cicd-architecture.png
cicd-overview.png
```

If redundant, move them to:

```text
Research/Architecture-History/
```

### Move Interim Masters Out of Final Docs

Examples:

```text
current-platform-m01-m06.png
LangNation-M1-M10-Master-Architecture.png
LangNation-M1-M11-Master-Architecture.png
```

Move to:

```text
Research/Architecture-History/
```

after confirming the final M1–M12 master has been created.

---

## 17. Current Architecture Completion Matrix

| Milestone | Canonical documentation | Diagram status |
|---|---|---|
| M01 | ✅ | ✅ Existing |
| M02 | ✅ | ✅ Existing |
| M03 | ✅ | ✅ Existing |
| M04 | ✅ | ✅ Existing |
| M05 | ✅ | ✅ Existing |
| M06 | ✅ | ✅ Existing |
| M07 | ✅ | ⏳ Create |
| M08 | ✅ | ⏳ Create |
| M09 | ✅ | 🔄 Existing assets need canonical mapping |
| M10 | ✅ | 🔄 Existing detailed asset + remaining diagrams |
| M11 | ✅ | 🔄 Existing detailed asset + remaining diagrams |
| M12 | ✅ | ⏳ Create |
| Final M1–M12 Master | — | ⏳ Create last |

---

## 18. Creation Order

Do not create the final master first.

Use this order:

```text
1. standardize M09 existing assets
2. standardize M10 existing asset
3. standardize M11 existing asset
4. create M07 diagrams
5. create M08 diagrams
6. complete M09 diagram set
7. complete M10 diagram set
8. complete M11 diagram set
9. create M12 diagrams
10. update CI/CD flow if required
11. verify recovery flow
12. create final M1–M12 master architecture
```

This avoids repeatedly rebuilding the master diagram while milestone architecture is still changing.

---

## 19. Final Architecture Validation Checklist

Before the final Git push:

- [ ] M01 contains exactly the two expected diagrams
- [ ] M02–M12 use the canonical four-file naming pattern
- [ ] every architecture link in M01–M12 Markdown resolves
- [ ] M07 diagrams exist
- [ ] M08 diagrams exist
- [ ] M09 existing diagrams are mapped to canonical names
- [ ] M10 diagrams are complete
- [ ] M11 diagrams are complete
- [ ] M12 diagrams exist
- [ ] CI/CD flow has one design sketch and one polished diagram
- [ ] recovery flow has one design sketch and one polished diagram
- [ ] duplicate CI/CD overview files removed from final docs
- [ ] interim master diagrams moved to local Research
- [ ] one final M1–M12 master exists
- [ ] no disposable AWS IDs appear unnecessarily
- [ ] diagrams contain no secrets or sensitive values
- [ ] final diagrams remain readable at presentation size

---

## 20. Final Principle

The final architecture folder should tell a clear story:

```text
milestones/
→ how the architecture evolved

flows/
→ how important cross-cutting processes work

master/
→ what the complete final platform looks like
```

If two files tell the same story, only the clearest canonical version should remain in the submitted repository.
