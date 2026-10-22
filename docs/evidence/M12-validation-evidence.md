# Milestone 12 — Final Validation Evidence

**Project:** LangNation Cloud Platform  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Milestone:** M12 — Resilience, Cost Optimization & Final Validation  
**Environment:** `dev`  
**AWS Region:** `us-east-1`  
**Status:** ✅ Complete

---

## 1. Purpose

This document is the overall validation record for Milestone 12.

It brings together the final resilience test, service recovery, availability validation, cost-review completion and final architecture decision.

Detailed Cost Explorer data is kept separately in:

```text
M12-cost-analysis-evidence.md
```

The main milestone narrative is:

```text
../milestones/M12-resilience-cost-final-validation.md
```

---

## 2. Resilience Baseline

Before the controlled failure test, the ECS service was healthy.

Observed state:

```text
Desired: 2
Running: 2
Pending: 0
```

Task placement:

```text
Task A → us-east-1a
Task B → us-east-1b
```

Public validation:

```text
GET https://cloud.namienterprises.in/health
→ HTTP 200
```

Validation:

- [x] ECS desired count = 2
- [x] ECS running count = 2
- [x] ECS pending count = 0
- [x] application tasks distributed across two Availability Zones
- [x] public health endpoint returned HTTP 200

Result:

```text
Resilience baseline: PASS
```

Evidence screenshot:

```text
screenshots/m12/M12-resilience-baseline-2tasks-2az-http200.png
```

---

## 3. Controlled Task Failure

One running ECS service task was intentionally stopped.

Expected behavior:

```text
Desired capacity remains 2
        ↓
Running capacity temporarily drops
        ↓
ECS launches replacement
```

Observed live state:

```text
Desired: 2
Running: 1
Pending: 1
```

At the same time:

```text
GET /health
→ HTTP 200
```

Validation:

- [x] one ECS service task intentionally terminated
- [x] service desired count remained 2
- [x] running count temporarily dropped to 1
- [x] replacement task entered pending state
- [x] public application remained available
- [x] no manual replacement task was launched

Result:

```text
Controlled failure handling: PASS
```

Evidence screenshot:

```text
screenshots/m12/M12-resilience-self-healing-live-monitor.png
```

---

## 4. Automatic Recovery

ECS automatically restored the service to the desired state.

Observed recovery time:

```text
approximately 44 seconds
```

Final state:

```text
Desired: 2
Running: 2
Pending: 0
```

Validation:

- [x] ECS detected desired-state mismatch
- [x] replacement task launched automatically
- [x] replacement task reached running state
- [x] service returned to desired capacity
- [x] final pending count returned to 0
- [x] redundant two-task baseline restored
- [x] two-AZ application capacity restored
- [x] public application remained healthy

Result:

```text
ECS self-healing: PASS
```

Evidence screenshot:

```text
screenshots/m12/M12-resilience-replacement-task-final-state.png
```

---

## 5. Resilience Flow Proven

The complete controlled test proved:

```text
Healthy state
2 desired / 2 running / 0 pending
        ↓
one running task terminated
        ↓
2 desired / 1 running / 1 pending
        ↓
public endpoint remains HTTP 200
        ↓
ECS launches replacement
        ↓
replacement becomes healthy
        ↓
2 desired / 2 running / 0 pending
```

Validated capabilities:

| Validation Area | Result |
|---|---|
| Two-task baseline | ✅ PASS |
| Multi-AZ application placement | ✅ PASS |
| Controlled ECS task failure | ✅ PASS |
| Desired-state enforcement | ✅ PASS |
| Automatic task replacement | ✅ PASS |
| Availability during recovery | ✅ PASS |
| Final service recovery | ✅ PASS |

---

## 6. Cost Analysis Validation

AWS Cost Explorer was reviewed for:

```text
2026-10-01 to 2026-10-23
```

Validated totals:

```text
Usage subtotal before tax: ~ $23.78
Tax:                       $4.29
Total including shown tax: ~ $28.07
```

Major service categories were identified and reviewed.

Validation:

- [x] Cost Explorer period captured
- [x] service-level cost breakdown captured
- [x] subtotal before tax recorded
- [x] tax recorded
- [x] total including shown tax recorded
- [x] major cost contributors identified
- [x] networking/NAT cost investigated
- [x] RDS Multi-AZ cost trade-off reviewed
- [x] ECS baseline-capacity trade-off reviewed
- [x] load-balancing cost reviewed
- [x] development optimization options documented

Detailed evidence:

```text
M12-cost-analysis-evidence.md
```

Evidence screenshot:

```text
screenshots/m12/M12-cost-explorer-service-breakdown-october.png
```

Result:

```text
Cost analysis: PASS
```

---

## 7. Cost Optimization Decision

The cost review identified lower-cost development alternatives such as:

```text
single NAT Gateway
Single-AZ RDS
scheduled non-production runtime
lower always-on capacity
reduced public IPv4 usage
```

The final capstone architecture was intentionally **not** changed.

Reason:

```text
cost reduction
must not invalidate
resilience evidence
```

The final project therefore retains:

```text
2 NAT Gateways
2 baseline ECS tasks
Multi-AZ RDS
Application Load Balancer
CloudFront
AWS WAF
CloudWatch
CloudTrail
```

Validation:

- [x] cost optimizations identified
- [x] resilience implications evaluated
- [x] final architecture intentionally retained
- [x] development-only optimization path documented separately

Result:

```text
Architecture decision: PASS
```

---

## 8. Final Platform Validation

### Networking

- [x] Multi-AZ VPC
- [x] public subnets
- [x] private application subnets
- [x] private database subnets
- [x] NAT egress
- [x] private ECS runtime

### Application Runtime

- [x] ECS Fargate
- [x] two-task baseline
- [x] two-AZ placement
- [x] Application Load Balancer
- [x] Application Auto Scaling
- [x] automatic task replacement

### Public Edge

- [x] persistent Route 53
- [x] CloudFront
- [x] ACM HTTPS
- [x] AWS WAF
- [x] direct ALB bypass protection

### Data Layer

- [x] private MariaDB
- [x] Multi-AZ RDS
- [x] Secrets Manager credentials
- [x] verified RDS TLS
- [x] sanitized database restore
- [x] 58-table restore validation

### Event Processing

- [x] EventBridge
- [x] SQS
- [x] Lambda
- [x] retry behavior
- [x] Dead Letter Queue

### RAG

- [x] Titan Text Embeddings V2
- [x] S3 Vectors
- [x] semantic retrieval
- [x] Claude Haiku answer generation
- [x] grounded result
- [x] LangNation source returned

### Security and Identity

- [x] Cognito
- [x] JWT-protected endpoint
- [x] GitHub OIDC
- [x] least-privilege IAM
- [x] private database access
- [x] private application runtime

### Monitoring and Governance

- [x] CloudWatch operations dashboard
- [x] 9 operational alarms
- [x] DLQ alarm detection
- [x] DLQ alarm recovery
- [x] multi-Region CloudTrail
- [x] private audit S3 bucket
- [x] real CloudTrail log delivery

### Release Quality

- [x] application validation
- [x] dependency audit
- [x] Terraform format gate
- [x] Terraform validation gate
- [x] Docker smoke test
- [x] Trivy container scan
- [x] quality-gated deployment

---

## 9. Final M12 Evidence Files

Canonical M12 evidence:

```text
docs/evidence/
├── M12-validation-evidence.md
├── M12-cost-analysis-evidence.md
└── screenshots/
    └── m12/
        ├── M12-resilience-baseline-2tasks-2az-http200.png
        ├── M12-resilience-self-healing-live-monitor.png
        ├── M12-resilience-replacement-task-final-state.png
        └── M12-cost-explorer-service-breakdown-october.png
```

---

## 10. Final Status

| Validation Area | Result |
|---|---|
| Resilience baseline | ✅ PASS |
| Two-AZ ECS placement | ✅ PASS |
| Controlled task failure | ✅ PASS |
| Public availability during failure | ✅ PASS |
| ECS automatic replacement | ✅ PASS |
| ~44-second recovery observed | ✅ PASS |
| Final `2 / 2 / 0` service state | ✅ PASS |
| Cost Explorer analysis | ✅ PASS |
| Major cost drivers identified | ✅ PASS |
| Development optimization options documented | ✅ PASS |
| Final architecture retained intentionally | ✅ PASS |
| Overall M1–M12 platform validation | ✅ PASS |

**M12 — Resilience, Cost Optimization & Final Validation: ✅ COMPLETE**
