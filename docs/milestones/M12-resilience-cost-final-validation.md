# LangNation Cloud Platform
## Milestone 12 — Resilience, Cost Optimization & Final Validation

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Public Capstone Endpoint:** `cloud.namienterprises.in`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Amazon ECS Fargate, Application Load Balancer, Application Auto Scaling, Amazon RDS for MariaDB, Amazon CloudFront, AWS WAF, Amazon CloudWatch, AWS Cost Explorer, HCP Terraform, GitHub Actions  
**Primary Focus:** Resilience testing, cost analysis, final platform validation  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 12 completed the LangNation Cloud Platform by validating resilience, reviewing real AWS cost data and confirming that the final architecture remained operational after controlled failure.

The main goals were to:

- prove that the ECS application can recover automatically after a running task is terminated
- confirm that the service remains available while ECS restores desired capacity
- verify that the application baseline remains distributed across two Availability Zones
- observe the replacement task and final service state
- review actual AWS Cost Explorer data for the capstone environment
- identify the largest cost drivers
- distinguish production-style resilience costs from development-only optimization opportunities
- avoid making last-minute architecture changes that would weaken the final resilience evidence
- confirm that the platform built in Milestones 1–11 operates as one integrated system

The final platform combines:

```text
Networking
+ private container runtime
+ load balancing
+ Auto Scaling
+ CI/CD
+ database + storage
+ secure public edge
+ authentication
+ event processing
+ RAG
+ real application integration
+ monitoring
+ governance
+ quality gates
+ resilience validation
+ cost analysis
```

Milestone 12 therefore serves as the technical closing milestone of the capstone.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

The Milestone 12 design sketch should highlight the final resilience model, including two ECS tasks across two Availability Zones, ALB routing and automatic task replacement.

![Milestone 12 design sketch](../architecture/milestones/m12/design-sketch.png)

### Final Milestone Architecture

The final milestone architecture should show the completed production-style platform and the controlled-failure / recovery path.

![Milestone 12 final architecture](../architecture/milestones/m12/milestone-architecture.png)

### Platform Design After Milestone 12

This is the final cumulative architecture for the complete capstone.

![Milestone 12 cumulative design sketch](../architecture/milestones/m12/design-sketch-platform.png)

![Platform after Milestone 12](../architecture/milestones/m12/platform-after-m12.png)

A separate final master architecture can later be maintained under:

```text
docs/architecture/master/
```

to present the complete M1–M12 platform in one presentation-ready diagram.

---

## 3. Final Platform Resilience Model

The final application baseline uses:

```text
Application Load Balancer
        ↓
ECS Service
Desired count: 2
        ↓
┌─────────────────────┬─────────────────────┐
│                     │                     │
│ Fargate Task A      │ Fargate Task B      │
│ us-east-1a          │ us-east-1b          │
│ private app subnet  │ private app subnet  │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

Application Auto Scaling remains configured with:

```text
Minimum capacity: 2
Maximum capacity: 4
CPU target:       50%
```

The service therefore maintains a redundant two-task baseline while retaining the ability to scale out under load.

The resilience test focuses on ECS desired-state recovery rather than Auto Scaling load behavior.

---

## 4. Resilience Baseline Validation

Before introducing failure, the service was validated in a healthy steady state.

Observed ECS state:

```text
Desired: 2
Running: 2
Pending: 0
```

Task placement confirmed:

```text
Task A → us-east-1a
Task B → us-east-1b
```

Public application validation:

```text
GET https://cloud.namienterprises.in/health
→ HTTP 200
```

This established the baseline:

```text
two running tasks
+
two Availability Zones
+
healthy public endpoint
```

before the controlled failure was introduced.

Recommended evidence screenshot:

```text
docs/evidence/screenshots/m12/
M12-resilience-baseline-2tasks-2az-http200.png
```

---

## 5. Controlled ECS Task Failure Test

One running ECS service task was intentionally stopped.

The purpose was to verify:

```text
task failure
→ running capacity drops
→ ECS detects desired-state mismatch
→ replacement task starts
→ service returns to desired state
```

Immediately after the controlled stop, the service was observed as:

```text
Desired: 2
Running: 1
Pending: 1
```

At the same time, the public endpoint remained available:

```text
GET /health
→ HTTP 200
```

This demonstrated that the surviving task and Application Load Balancer continued serving traffic while ECS created the replacement.

Recommended evidence screenshot:

```text
docs/evidence/screenshots/m12/
M12-resilience-self-healing-live-monitor.png
```

---

## 6. Self-Healing Recovery

ECS automatically created a replacement task without manual task launch.

The observed recovery completed in approximately:

```text
44 seconds
```

Final service state:

```text
Desired: 2
Running: 2
Pending: 0
```

The replacement task reached a healthy running state and the service returned to its original redundant baseline.

Final placement again confirmed application capacity across both Availability Zones.

The observed flow was:

```text
Healthy service
Desired 2 / Running 2
        ↓
one task intentionally stopped
        ↓
Desired 2 / Running 1 / Pending 1
        ↓
public /health remains HTTP 200
        ↓
ECS launches replacement task
        ↓
replacement becomes healthy
        ↓
Desired 2 / Running 2 / Pending 0
```

Recommended final-state evidence:

```text
docs/evidence/screenshots/m12/
M12-resilience-replacement-task-final-state.png
```

This is the final practical resilience test for the capstone.

---

## 7. What the Resilience Test Proved

The test demonstrated several independent resilience mechanisms.

### ECS Desired-State Management

ECS continuously attempts to maintain:

```text
running tasks = desired tasks
```

When a service task stopped, ECS created a replacement automatically.

### Multi-AZ Application Layer

The service baseline was already distributed across:

```text
us-east-1a
us-east-1b
```

The application therefore did not depend on a single task or single Availability Zone.

### ALB Health-Aware Routing

The Application Load Balancer routes traffic only to healthy registered targets.

While one task was replaced, healthy capacity remained available.

### Public Availability During Recovery

The public health endpoint continued returning:

```text
HTTP 200
```

during the replacement process.

This is important because recovery alone is less valuable if the service is unavailable throughout the recovery period.

---

## 8. Relationship to Earlier Resilience Features

Milestone 12 validates capabilities introduced incrementally across earlier milestones.

```text
M1
→ Multi-AZ network foundation

M2
→ ECS desired-state replacement

M3
→ two-task baseline + ALB + Auto Scaling

M6
→ protected public CloudFront path

M10
→ operational monitoring and alarms

M11
→ gated deployment

M12
→ final controlled resilience proof
```

The final test therefore validates the combined platform rather than introducing an isolated resilience mechanism at the end.

---

## 9. AWS Cost Explorer Analysis

AWS Cost Explorer was reviewed for:

```text
2026-10-01 to 2026-10-23
```

Usage subtotal before tax:

```text
approximately $23.78
```

Tax shown separately:

```text
$4.29
```

Total including shown tax:

```text
approximately $28.07
```

The detailed evidence is kept separately in:

```text
docs/evidence/M12-cost-analysis-evidence.md
```

Recommended screenshot:

```text
docs/evidence/screenshots/m12/
M12-cost-explorer-service-breakdown-october.png
```

---

## 10. Cost Breakdown

The Cost Explorer service breakdown showed:

| Service | Cost (USD) |
|---|---:|
| EC2 - Other | 12.2177053311 |
| Amazon RDS | 3.1456372965 |
| Amazon ECS | 2.3248060197 |
| Elastic Load Balancing | 2.228246535 |
| Amazon VPC | 2.156584765 |
| AWS WAF | 0.8738488541 |
| Amazon CloudWatch | 0.612077321 |
| AWS Service Catalog | 0.168 |
| AWS Secrets Manager | 0.0422199075 |
| Amazon S3 | 0.0113097274 |
| Amazon ECR | 0.0008852405 |
| AWS KMS | 0.000531 |
| CloudWatch Events | 0.000012 |
| Amazon Bedrock | 0.0000115 |
| Amazon CloudFront | 0.0000009408 |
| AWS Step Functions | 0.0000001386 |
| Amazon Glacier | 0.0000001134 |

Largest service categories before tax:

```text
EC2 - Other        ~51.4%
Amazon RDS         ~13.2%
Amazon ECS          ~9.8%
Elastic Load Balancing
                    ~9.4%
Amazon VPC          ~9.1%
AWS WAF             ~3.7%
CloudWatch          ~2.6%
```

The high `EC2 - Other` category was investigated further instead of assuming that EC2 instances were running.

---

## 11. NAT Gateway and Public IPv4 Cost Driver

Detailed usage analysis showed that a major contributor inside the networking-related cost was NAT Gateway hourly usage.

Observed usage included approximately:

```text
NatGateway-Hours: 12.105
NatGateway-Bytes: 0.11249
```

The important finding was:

```text
NAT cost
≈ dominated by hourly gateway availability

not by
large data-transfer volume
```

The architecture uses two NAT Gateways:

```text
NAT Gateway A → us-east-1a
NAT Gateway B → us-east-1b
```

This matches the project's multi-AZ design and avoids routing private application egress through a NAT Gateway in another Availability Zone.

Public IPv4 usage also contributed to cost.

Observed categories included:

```text
PublicIPv4 InUse
PublicIPv4 Idle
```

This reinforces that even small development platforms can accumulate fixed networking costs.

---

## 12. RDS Cost Trade-Off

RDS was another major contributor.

The final database design uses:

```text
MariaDB 11.8.9
db.t3.micro
Multi-AZ
20 GiB gp3
maximum storage 100 GiB
7-day backup retention
```

The cost analysis confirmed that Multi-AZ database availability has a visible cost even with a small instance class.

This is expected because the architecture intentionally prioritizes availability and production-style design over the cheapest possible development setup.

A lower-cost development environment could use:

```text
Single-AZ RDS
```

but changing the final capstone architecture to Single-AZ would weaken the high-availability story established in earlier milestones.

---

## 13. ECS and Load Balancer Cost Trade-Off

The ECS service maintains:

```text
minimum 2 Fargate tasks
```

instead of a one-task development baseline.

This costs more than running only one task, but it provides:

- redundant application capacity
- multi-AZ placement
- rolling deployment headroom
- controlled task-failure recovery
- meaningful resilience validation

The Application Load Balancer also creates a continuing fixed and usage-based cost.

These costs are part of the architecture being demonstrated rather than accidental waste.

---

## 14. Cost Optimization Opportunities

Several lower-cost alternatives were identified for a future development-only environment.

### Option 1 — Single NAT Gateway

Development-only architecture could use:

```text
1 NAT Gateway
```

instead of two.

Benefit:

```text
lower hourly NAT cost
```

Trade-off:

```text
reduced AZ independence
+
possible cross-AZ dependency
```

### Option 2 — Single-AZ RDS

A development database could use:

```text
Multi-AZ = false
```

Benefit:

```text
lower database cost
```

Trade-off:

```text
reduced database resilience
```

### Option 3 — Scheduled Non-Production Runtime

Development resources could be stopped or recreated only during working hours where service capabilities allow it.

Potential targets include:

- non-production ECS runtime
- development database
- temporary testing resources

The current training sandbox already has its own cleanup/rebuild behavior, so this option would need to be aligned with that lifecycle.

### Option 4 — Reduce Unnecessary Public IPv4 Usage

Public IPv4 allocation should be reviewed because IPv4 addresses carry cost.

Only resources that truly require public addressing should receive it.

The current ECS tasks already follow this principle:

```text
Public IP: disabled
```

### Option 5 — Evaluate VPC Endpoints or Alternative Egress Design

For larger or longer-lived environments, VPC endpoints or other egress designs could reduce some NAT data-processing dependency.

However, endpoints also have their own costs.

They should be introduced only after comparing:

```text
NAT hourly + data-processing cost
vs
endpoint hourly + data-processing cost
```

for the real traffic pattern.

---

## 15. Final Cost Decision

The final capstone infrastructure was **not changed** after the cost review.

This was intentional.

Removing one NAT Gateway, disabling Multi-AZ RDS or reducing ECS baseline capacity would lower cost but would also weaken:

- Multi-AZ design
- resilience evidence
- task-recovery demonstration
- final architecture consistency

The final decision was:

```text
Keep production-style architecture
        +
document development optimization options
```

rather than:

```text
change architecture only to produce a lower final bill
```

This separates:

```text
architecture requirement
from
environment optimization
```

and is a more defensible final capstone decision.

---

## 16. Final Validation of Core Platform

Milestone 12 confirms that the major platform layers remain integrated.

### Public Edge

```text
Route 53                 ✅
CloudFront               ✅
ACM / HTTPS              ✅
AWS WAF                  ✅
Direct ALB bypass block  ✅
```

### Application Runtime

```text
ALB                       ✅
ECS Fargate               ✅
Two-task baseline         ✅
Two-AZ placement          ✅
Auto Scaling 2–4          ✅
Self-healing              ✅
```

### Data Layer

```text
Private MariaDB           ✅
Multi-AZ                  ✅
Secrets Manager           ✅
Verified TLS              ✅
Sanitized DB restore      ✅
58-table validation       ✅
```

### Storage and Event Processing

```text
Private S3                ✅
EventBridge               ✅
SQS                       ✅
Lambda                    ✅
DLQ                       ✅
```

### RAG

```text
Titan embeddings          ✅
S3 Vectors                ✅
Semantic retrieval        ✅
Claude Haiku generation   ✅
grounded=true             ✅
Source returned           ✅
```

### Identity and Security

```text
Cognito                   ✅
JWT protected endpoint    ✅
GitHub OIDC               ✅
Least-privilege IAM       ✅
```

### Operations and Governance

```text
CloudWatch dashboard      ✅
9 operational alarms      ✅
CloudTrail                ✅
Private audit bucket      ✅
Real audit-log delivery   ✅
```

### Release Quality

```text
Application checks        ✅
Dependency audit          ✅
Terraform validation      ✅
Container smoke test      ✅
Trivy scan                ✅
Quality-gated deployment  ✅
```

---

## 17. Terraform and Automation Model

The final project continues to use the ownership model established in earlier milestones.

```text
Local workstation
→ terraform init
→ terraform fmt
→ terraform validate

HCP Terraform
→ authoritative state
→ plan
→ apply
→ rebuild

GitHub Actions
→ quality gates
→ application build
→ ECR push
→ ECS deployment
→ database restore
→ recovery orchestration

Application Auto Scaling
→ live ECS desired count

Persistent Route 53
→ stable public DNS outside disposable sandbox
```

This ownership model is important because the AWS sandbox is regularly recreated.

The project does not depend on manually preserving individual AWS resources.

---

## 18. Implementation Summary

### Resilience

1. confirmed ECS desired count = 2
2. confirmed running count = 2
3. confirmed pending count = 0
4. verified task placement across `us-east-1a` and `us-east-1b`
5. verified public `/health` returned HTTP 200
6. intentionally stopped one ECS service task
7. observed running capacity fall to one task
8. observed a replacement task enter pending state
9. confirmed public `/health` remained HTTP 200 during recovery
10. observed ECS automatically launch the replacement
11. observed recovery complete in approximately 44 seconds
12. confirmed final desired/running/pending = `2 / 2 / 0`
13. confirmed restored two-AZ application capacity

### Cost Analysis

14. opened AWS Cost Explorer for October 2026
15. captured service-level spend
16. calculated the approximately $23.78 usage subtotal before tax
17. recorded the $4.29 tax
18. recorded approximately $28.07 including shown tax
19. identified `EC2 - Other` as the largest service category
20. inspected detailed networking usage
21. identified NAT Gateway hourly usage as a major fixed-cost driver
22. reviewed RDS Multi-AZ cost
23. reviewed ECS two-task baseline cost
24. reviewed ALB, VPC, WAF and CloudWatch cost
25. documented lower-cost development alternatives
26. intentionally retained the final high-availability architecture

### Final Validation

27. confirmed the secure public application remained available
28. confirmed database integration remained healthy
29. confirmed RAG functionality remained part of the runtime
30. confirmed monitoring and governance remained active
31. confirmed quality-gated deployment remained the release path
32. confirmed HCP Terraform remained the authoritative infrastructure state

---

## 19. Useful Commands and Operational Checks

### ECS Service State

The resilience test monitored:

```text
desiredCount
runningCount
pendingCount
```

Expected baseline:

```text
2 / 2 / 0
```

Expected temporary recovery state:

```text
2 / 1 / 1
```

Expected final state:

```text
2 / 2 / 0
```

### Public Health

```text
GET https://cloud.namienterprises.in/health
```

Expected during both baseline and recovery:

```text
HTTP 200
```

### Terraform Local Validation

```powershell
terraform fmt -recursive
terraform validate
```

### Authoritative Infrastructure Operations

```text
HCP Terraform
→ plan / apply / rebuild / state
```

### Cost Review

AWS Cost Explorer was used for the service-level and usage-level breakdown.

No infrastructure was changed solely for the purpose of reducing the final measured cost.

---

## 20. Evidence

### Resilience Evidence

Recommended files:

```text
docs/evidence/screenshots/m12/
├── M12-resilience-baseline-2tasks-2az-http200.png
├── M12-resilience-self-healing-live-monitor.png
└── M12-resilience-replacement-task-final-state.png
```

These screenshots document:

```text
baseline
→ failure
→ live replacement
→ final recovery
```

### Cost Evidence

Detailed cost evidence:

```text
docs/evidence/M12-cost-analysis-evidence.md
```

Recommended screenshot:

```text
docs/evidence/screenshots/m12/
M12-cost-explorer-service-breakdown-october.png
```

A separate overall M12 validation evidence document can reference both the resilience and cost evidence without duplicating the milestone narrative.

---

## 21. Problems and Solutions

### Problem 1 — Cost Optimization Could Weaken the Final Architecture

The cost review showed that NAT Gateways, Multi-AZ RDS, ECS baseline capacity and load balancing contributed meaningfully to cost.

The simplest cost reduction would have been to remove redundancy.

**Risk:**  
Changing to a single NAT Gateway, Single-AZ RDS or one ECS task would weaken the final resilience design and contradict earlier architectural decisions.

**Decision:**  
Keep the final architecture unchanged and document lower-cost development alternatives separately.

**Lesson:**  
Optimization should be evaluated against architecture requirements, not only the monthly bill.

---

### Problem 2 — `EC2 - Other` Looked Larger Than Expected

Cost Explorer showed:

```text
EC2 - Other
→ largest cost category
```

even though the application uses ECS Fargate rather than EC2 worker instances.

**Resolution:**  
Inspect usage categories rather than assuming the label means running EC2 application servers.

Detailed analysis showed NAT Gateway and networking-related hourly usage as important contributors.

**Lesson:**  
AWS billing categories do not always map one-to-one with the architecture diagram. Cost investigation should continue to the usage-type level.

---

### Problem 3 — Resilience Must Be Proven, Not Assumed

The architecture already had:

```text
two tasks
two AZs
ALB
ECS Service
```

but those resources alone do not prove recovery.

**Solution:**  
Intentionally terminate one running ECS task and observe the real service behavior.

**Result:**

```text
public health remained available
+
replacement task launched automatically
+
service returned to 2 / 2 / 0
```

**Lesson:**  
A resilience claim is stronger when it is supported by a controlled failure test.

---

## 22. Security Decisions

### No Security Controls Removed for Cost

The cost review did not result in removing:

- WAF
- private networking
- Secrets Manager
- CloudTrail
- CloudWatch monitoring
- quality gates
- private RDS
- verified database TLS

Cost optimization should not bypass established security controls.

### Private ECS Tasks Remain Private

The application continues to use:

```text
assign_public_ip = false
```

### RDS Remains Private and Encrypted

Database availability and transport-security decisions remain unchanged.

### Public Traffic Remains on the Protected Edge

The public path remains:

```text
Route 53
→ CloudFront
→ WAF
→ ALB
→ private ECS
```

### Release Security Remains Enforced

M11 quality gates remain mandatory before deployment.

The final milestone does not weaken the release process for convenience.

---

## 23. Cost and Operational Decisions

### Production-Style Final Architecture

The final capstone deliberately retains:

```text
2 NAT Gateways
2 ECS baseline tasks
Multi-AZ RDS
Application Load Balancer
CloudFront
AWS WAF
CloudWatch
CloudTrail
```

because the objective is to demonstrate a secure and resilient production-style architecture.

### Development Optimization Is a Separate Concern

For a long-lived development account, a lower-cost profile could be created separately using:

```text
single NAT
Single-AZ RDS
scheduled runtime
reduced always-on capacity
careful public IPv4 reduction
```

This should be implemented through environment-specific Terraform variables rather than manually changing production-style infrastructure.

### Evidence Preservation

No last-minute architecture simplification was performed after the resilience test.

This keeps the final documentation, diagrams, screenshots and deployed design consistent with one another.

---

## 24. What I Learned

Milestone 12 gave me practical experience with:

- controlled resilience testing
- ECS desired-state recovery
- measuring recovery time
- validating availability during task replacement
- interpreting Cost Explorer service categories
- investigating AWS usage types
- NAT Gateway cost behavior
- public IPv4 cost awareness
- Multi-AZ database cost trade-offs
- balancing cost with resilience
- distinguishing development optimization from production architecture
- final end-to-end platform validation

The most important resilience lesson was that architecture diagrams are not enough.

A platform should be tested through a real controlled failure:

```text
remove capacity
→ observe behavior
→ verify availability
→ measure recovery
→ confirm final state
```

The most important cost lesson was that the cheapest architecture is not automatically the correct architecture.

For this capstone, the right final decision was to preserve the resilience design and document where a separate development environment could be optimized.

---

## 25. Result

Milestone 12 completed the technical capstone.

### Resilience Result

```text
Baseline: 2 / 2 / 0                    ✅
Two-AZ task placement                  ✅
Controlled task termination            ✅
Public /health remained HTTP 200        ✅
Automatic ECS replacement              ✅
~44-second recovery observed            ✅
Final state: 2 / 2 / 0                 ✅
```

### Cost Result

```text
Cost Explorer reviewed                  ✅
Usage subtotal ≈ $23.78                ✅
Tax = $4.29                            ✅
Total ≈ $28.07                         ✅
Largest cost categories identified      ✅
NAT hourly cost driver identified       ✅
RDS Multi-AZ trade-off documented       ✅
Development optimizations documented    ✅
Final architecture preserved            ✅
```

### Final Platform Result

```text
Multi-AZ networking                     ✅
Private ECS Fargate                     ✅
ALB + Auto Scaling                      ✅
GitHub OIDC CI/CD                       ✅
Private MariaDB                         ✅
Private S3                              ✅
CloudFront + WAF + HTTPS                ✅
Cognito + JWT                           ✅
EventBridge + SQS + Lambda              ✅
RAG ingestion                           ✅
Lina grounded RAG runtime               ✅
Monitoring + alarms                     ✅
CloudTrail governance                   ✅
CI/CD quality gates                     ✅
Controlled resilience validation        ✅
Cost analysis                           ✅
```

The LangNation Cloud Platform is now technically complete from **Milestone 1 through Milestone 12**.

The remaining project work is documentation and presentation packaging:

```text
final evidence organization
→ final architecture diagrams
→ master M1–M12 architecture
→ final capstone validation document
→ presentation / PDF
→ repository cleanup
→ final Git push
```

---

## Presentation Summary

> In Milestone 12 I completed the capstone by validating resilience and analyzing the real AWS cost profile. I first confirmed the ECS baseline at two running tasks across two Availability Zones with the public health endpoint returning HTTP 200. I then intentionally stopped one service task and observed ECS move through a `2 desired / 1 running / 1 pending` recovery state while the application remained available. ECS automatically launched a replacement and returned the service to `2 / 2 / 0` in approximately 44 seconds. I also reviewed AWS Cost Explorer for October 2026: usage before tax was approximately $23.78, with the largest costs coming from EC2-Other/networking, RDS, ECS, load balancing and VPC services. NAT Gateway hourly usage was an important fixed-cost driver. I documented lower-cost development options such as a single NAT Gateway, Single-AZ RDS and scheduled non-production runtime, but I intentionally kept the final architecture unchanged because removing redundancy would weaken the resilience design. The key lesson was that a strong cloud architecture must balance security, availability, operational evidence and cost rather than optimizing any one dimension in isolation.
