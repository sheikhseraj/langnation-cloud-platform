# LangNation Cloud Platform
## Milestone 3 — Application Load Balancer, Multi-AZ & Auto Scaling

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Application Load Balancer, Target Groups, Amazon ECS, AWS Fargate, Application Auto Scaling, CloudWatch health checks, Terraform lifecycle rules  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 3 made the private ECS/Fargate application reachable through an Application Load Balancer while keeping the application tasks themselves private.

The milestone added:

- an internet-facing Application Load Balancer
- one ALB deployment spanning both public subnets
- an HTTP listener on port 80
- an IP-based target group on port 3000
- `/health` target-group checks
- ECS Service integration with the target group
- two Fargate tasks across two Availability Zones
- health-aware request routing
- ECS Service Auto Scaling
- minimum capacity 2
- maximum capacity 4
- normal CPU target 50%
- a controlled scale-out test from 2 to 4 tasks

The resulting application path became:

```text
Internet
   ↓
Application Load Balancer
   ↓
HTTP Listener :80
   ↓
Target Group
   ↓
Healthy private ECS Fargate tasks
   ↓
Node.js application
```

This was the first milestone where the platform became publicly reachable while preserving private compute and multi-AZ redundancy.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

I first recreated the Milestone 3 architecture in Excalidraw to understand how the load balancer, target group, private ECS tasks and Auto Scaling fit together.

![Milestone 3 design sketch](../architecture/milestones/m03/design-sketch.png)

### Final Milestone Architecture

The final milestone architecture shows the load-balancing, health-check and Auto Scaling components introduced in Milestone 3.

![Milestone 3 final architecture](../architecture/milestones/m03/milestone-architecture.png)

### Platform Design After Milestone 3

This cumulative view shows the platform after networking, containers, load balancing and Auto Scaling had been combined.

![Milestone 3 cumulative design sketch](../architecture/milestones/m03/design-sketch-platform.png)

![Platform after Milestone 3](../architecture/milestones/m03/platform-after-m03.png)

---

## 3. Request Path

The Milestone 3 request path was:

```text
Internet
   ↓
Application Load Balancer
   ↓
HTTP Listener :80
   ↓
Target Group
   ↓
HTTP :3000
   ↓
Healthy ECS Fargate task
   ↓
Node.js application
```

The application tasks remained in the private application subnets created in Milestone 1:

```text
us-east-1a
10.0.11.0/24

us-east-1b
10.0.12.0/24
```

Neither task received a public IP.

This kept the architecture separated into:

```text
Public ingress
      ↓
Private application compute
```

---

## 4. Application Load Balancer

Terraform resource:

```text
aws_lb.app
```

Name:

```text
langnation-cloud-platform-dev-lb
```

Configuration:

```text
Scheme: Internet-facing
Type: Application
IP type: IPv4
Subnets: both public subnets
Security group: ALB security group
Deletion protection: disabled for sandbox/dev
```

The ALB spans:

```text
us-east-1a
us-east-1b
```

A naming issue was caught before deployment: the original planned ALB name exceeded the AWS name-length limit, so the shorter `-lb` suffix was used.

---

## 5. Target Group and Health Checks

Terraform resource:

```text
aws_lb_target_group.app
```

Name:

```text
langnation-cloud-platform-dev-tg
```

Configuration:

```text
Protocol: HTTP
Port: 3000
Target type: ip
VPC: LangNation VPC
```

`target_type = "ip"` is required because Fargate tasks using `awsvpc` networking register their task ENI/private IP instead of an EC2 instance ID.

### Health Check Configuration

```text
Path: /health
Protocol: HTTP
Port: traffic-port
Healthy threshold: 2
Unhealthy threshold: 3
Timeout: 5 seconds
Interval: 30 seconds
Matcher: 200
```

Application response:

```json
{
  "status": "healthy"
}
```

This allowed the ALB to route requests only to healthy ECS targets.

---

## 6. HTTP Listener

Terraform resource:

```text
aws_lb_listener.http
```

Configuration:

```text
Protocol: HTTP
Port: 80
Default action: forward to application target group
```

Milestone 3 therefore established:

```text
Client :80
   ↓
ALB Listener :80
   ↓
Target Group :3000
   ↓
Fargate task :3000
```

> **Current-state note:** Milestone 6 later placed CloudFront, WAF and ACM in front of the ALB. Viewer traffic now uses HTTPS at CloudFront, while CloudFront reaches the ALB over HTTP port 80. Direct public access to the ALB is blocked by restricting ALB ingress to the AWS-managed CloudFront origin-facing prefix list.

---

## 7. ECS Service Integration

The ECS Service receives the target-group ARN from the load-balancing module:

```hcl
load_balancer {
  target_group_arn = var.target_group_arn
  container_name   = "langnation-app"
  container_port   = var.container_port
}
```

Private networking remains intact:

```hcl
network_configuration {
  subnets          = var.private_app_subnet_ids
  security_groups  = [var.ecs_security_group_id]
  assign_public_ip = false
}
```

This separates the public entry point from the private application runtime.

---

## 8. Multi-AZ Application Layer

The ECS Service baseline was changed from one task to two:

```text
desired_count = 2
```

After deployment:

```text
Desired: 2
Running: 2
Pending: 0
```

Placement was verified across both application subnets:

```text
Task A
AZ: us-east-1a
Private subnet: 10.0.11.0/24
Public IP: none

Task B
AZ: us-east-1b
Private subnet: 10.0.12.0/24
Public IP: none
```

This created real application-layer redundancy across two Availability Zones rather than simply provisioning multiple tasks in one failure domain.

---

## 9. ECS Service Auto Scaling

The container module was extended with:

```text
autoscaling_min_capacity = 2
autoscaling_max_capacity = 4
autoscaling_cpu_target   = 50
```

### Scalable Target

Terraform resource:

```text
aws_appautoscaling_target.ecs_service
```

Configuration:

```text
Service namespace: ecs
Scalable dimension: ecs:service:DesiredCount
Minimum capacity: 2
Maximum capacity: 4
```

### Target-Tracking Policy

Terraform resource:

```text
aws_appautoscaling_policy.ecs_cpu
```

Configuration:

```text
Metric: ECSServiceAverageCPUUtilization
Target: 50%
Scale-out cooldown: 60 seconds
Scale-in cooldown: 300 seconds
```

The scaling policy allows ECS to increase or decrease the service task count automatically while remaining inside the configured minimum and maximum boundaries.

---

## 10. Terraform Lifecycle Decision

The ECS Service includes:

```hcl
lifecycle {
  ignore_changes = [
    desired_count
  ]
}
```

This separates responsibilities:

```text
Terraform
→ defines the ECS service and scaling configuration

Application Auto Scaling
→ controls the live desired task count
```

Without this lifecycle rule, a later Terraform operation could attempt to overwrite a task count changed dynamically by Application Auto Scaling.

This became an important ownership principle used again in later milestones.

---

## 11. Terraform Structure

Milestone 3 added the reusable load-balancing module:

```text
terraform/
└── modules/
    └── load_balancing/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

Responsibilities after Milestone 3:

```text
networking
→ VPC, subnets, IGW, NAT, route tables

security
→ ALB SG, ECS SG, DB SG

container
→ ECR, ECS cluster, execution role, logs,
  task definition, ECS service, Auto Scaling

load_balancing
→ ALB, target group, listener, health checks
```

The modules communicate through Terraform variables and outputs rather than hard-coded AWS-generated resource IDs.

The important dependency path is:

```text
networking
     ↓ public/private subnet IDs

security
     ↓ security-group IDs

load_balancing
     ↓ target-group ARN

container
     ↓ ECS Service integration
```

---

## 12. Implementation Summary

### Load Balancing

1. created the `load_balancing` Terraform module
2. created the Application Load Balancer
3. deployed it to both public subnets
4. created the IP target group
5. configured the `/health` target-group health check
6. created the HTTP listener
7. passed the target-group ARN into the ECS Service
8. verified the public application endpoint

### Multi-AZ Application Layer

9. changed the ECS baseline from one task to two
10. verified both tasks were running
11. verified one task in each Availability Zone
12. verified both tasks remained private and had no public IP

### Auto Scaling

13. created the Application Auto Scaling target
14. configured minimum capacity 2 and maximum capacity 4
15. added target tracking on average ECS CPU
16. configured the normal CPU target at 50%
17. added `ignore_changes` for `desired_count`
18. performed a controlled scale-out test
19. confirmed the service automatically reached 4 running tasks
20. restored the CPU target to 50%

---

## 13. Useful Commands

### Work from the Terraform Environment Directory

```powershell
cd "D:\Project_All\LangNation-Cloud-Platform-Capstone\terraform\environments\dev"
```

This ensures Terraform commands run against the actual development configuration rather than the repository root.

### Initialize Terraform

```powershell
terraform init
```

This initializes the working directory and installs the required modules and providers.

### Check Untracked Git Files

```powershell
git status --short
```

This is important after adding new Terraform modules because untracked files do not appear in a normal tracked diff.

### Check Staged Changes for Whitespace Problems

```powershell
git diff --cached --check
```

This detects issues such as hidden trailing whitespace before a commit.

---

## 14. Validation

The milestone was validated at the load-balancer, ECS, networking and Auto Scaling layers.

### Load Balancer and Health

- [x] ALB is active
- [x] ALB spans both public subnets
- [x] target type is `ip`
- [x] target group forwards to port 3000
- [x] `/health` returns HTTP 200
- [x] ECS Service is registered with the target group
- [x] healthy targets confirmed

### ECS and Multi-AZ

- [x] Fargate tasks remain private
- [x] no public IP is assigned to tasks
- [x] two ECS tasks are running
- [x] tasks are distributed across both Availability Zones
- [x] desired count = 2
- [x] running count = 2
- [x] pending count = 0

### Auto Scaling

- [x] Application Auto Scaling target is active
- [x] minimum capacity = 2
- [x] maximum capacity = 4
- [x] normal CPU target = 50%
- [x] controlled scale-out from 2 to 4 tasks verified
- [x] normal 50% target restored after the test

### End-to-End Request Validation

The verified request path was:

```text
Client
   ↓
Internet
   ↓
ALB
   ↓
Listener
   ↓
Target Group
   ↓
Private Fargate task
   ↓
Node.js application
   ↓
Response
```

This proved that the application was publicly reachable without assigning public IP addresses to the ECS tasks.

---

## 15. Controlled Auto Scaling Test

To prove that Auto Scaling actually reacted, the CPU target was temporarily reduced from:

```text
50%
```

to:

```text
1%
```

Controlled HTTP load was then sent through the ALB.

Before the test:

```text
Desired: 2
Running: 2
```

After scaling:

```text
Desired: 4
Running: 4
Pending: 0
```

The desired count was not manually increased.

The observed behavior was:

```text
HTTP load
   ↓
CPU utilization increases
   ↓
Target Tracking reacts
   ↓
Desired task count increases
   ↓
ECS launches additional Fargate tasks
   ↓
Service reaches 4 running tasks
```

After validation, the normal 50% CPU target was restored.

This test proved that the scaling policy was functional rather than merely configured.

---

## 16. Resilience Mechanisms Demonstrated

### ECS Service Self-Healing

```text
Task stops
   ↓
running < desired
   ↓
ECS launches replacement task
```

### Multi-AZ Redundancy

```text
Task A → us-east-1a
Task B → us-east-1b
```

### Health-Aware Routing

```text
ALB /health
   ↓
only healthy targets receive traffic
```

### Dynamic Scaling

```text
CPU increases
   ↓
desired task count increases
   ↓
additional tasks launch
   ↓
maximum 4
```

Together, these mechanisms gave the application a stronger resilience model than the single-task ECS service from Milestone 2.

---

## 17. Problems and Solutions

### Problem 1 — Terraform Started in the Wrong Directory

After reopening VS Code, the terminal started at the repository root.

Running:

```powershell
terraform init
```

there produced:

```text
Terraform initialized in an empty directory!
```

**Cause:**  
Terraform was executed from the repository root instead of the development environment directory.

**Fix:**

```powershell
cd "D:\Project_All\LangNation-Cloud-Platform-Capstone\terraform\environments\dev"
```

**Lesson:**  
Terraform commands must be run from the intended working directory. Keeping a dedicated Terraform terminal reduces context mistakes.

---

### Problem 2 — New Module Did Not Appear in the Diff

The load-balancing module was initially untracked, so it did not appear in a normal diff summary.

`git status --short` revealed:

```text
?? terraform/modules/load_balancing/
```

**Cause:**  
Normal Git diff output does not show untracked files.

**Fix:**  
Check repository status before committing:

```powershell
git status --short
```

**Lesson:**  
Review both tracked changes and untracked files when adding Terraform modules or other new project directories.

---

### Problem 3 — Hidden Trailing Whitespace

`git diff --cached --check` detected trailing whitespace on a visually blank line.

**Fix:**  
The whitespace was removed before commit.

**Lesson:**  
A staged-diff quality check can catch formatting problems that are easy to miss visually.

---

### Problem 4 — `ignore_changes` Was Placed on the Wrong Resource

The lifecycle rule for `desired_count` was initially placed under the ECS task definition.

This produced an unsupported-attribute error.

**Cause:**  
`desired_count` belongs to the ECS Service rather than the task definition.

**Fix:**  
Move the lifecycle rule into the ECS Service resource.

**Lesson:**  
Terraform lifecycle rules must be attached to the resource that actually owns the attribute being ignored.

---

### Problem 5 — ECS Network Configuration Was Accidentally Removed

A staged-diff review caught that the ECS Service network block had been removed during the Auto Scaling changes.

The required configuration was restored:

```text
Private app subnets
ECS security group
No public IP
```

**Lesson:**  
Reviewing staged infrastructure changes before pushing is important because an unrelated edit can unintentionally change network or security behavior.

---

## 18. Security Decisions

### Public Load Balancer, Private Compute

The Application Load Balancer is the public entry point, but the Fargate tasks remain in private subnets.

This preserves the boundary:

```text
Internet
   ↓
ALB
   ↓
Private ECS tasks
```

### No Public IPs on ECS Tasks

Even after public application access was introduced, ECS tasks continued to use:

```text
assign_public_ip = false
```

This prevents direct internet access to individual task interfaces.

### Security-Group Separation

The existing security-group model remains intact:

```text
ALB Security Group
        ↓
ECS Security Group
```

The load balancer controls ingress into the application layer instead of exposing the container port publicly.

### Health-Aware Routing

The ALB uses `/health` and sends traffic only to targets that meet the configured health-check criteria.

This reduces the chance of routing user traffic to an unhealthy application task.

> **Current-state note:** Milestone 6 later strengthened the origin boundary further by restricting direct ALB access and placing CloudFront and WAF in front of it.

---

## 19. Cost and Operational Decisions

### Minimum Two ECS Tasks

The service baseline was intentionally increased from one task to two.

This creates application redundancy across both Availability Zones, but it also means the development environment continuously runs two Fargate tasks instead of one.

The decision favors high-availability demonstration over the lowest possible development cost.

### Auto Scaling Boundaries

The service uses:

```text
Minimum: 2
Maximum: 4
```

This ensures the application does not scale below the redundant two-task baseline and does not grow beyond the controlled capstone limit.

### CPU Target and Cooldowns

Normal target:

```text
50%
```

Cooldowns:

```text
Scale out: 60 seconds
Scale in: 300 seconds
```

These settings allow the service to react to increased utilization while making scale-in more conservative.

### ALB Deletion Protection

Deletion protection is disabled for the sandbox/dev environment.

This fits the disposable training environment, where infrastructure must be recreated rather than permanently protected.

### Runtime Ownership

Terraform defines the service and scaling configuration, while Application Auto Scaling controls the live desired count.

This ownership separation reduces configuration conflicts during normal runtime scaling.

---

## 20. What I Learned

This milestone gave me practical experience with:

- Application Load Balancers
- public vs private application boundaries
- target groups
- Fargate IP targets
- health checks
- ECS-to-ALB integration
- multi-AZ task placement
- desired service capacity
- Application Auto Scaling
- target-tracking policies
- scale-out and scale-in cooldowns
- Terraform lifecycle rules
- validating Auto Scaling behavior with controlled load
- reviewing Terraform and Git changes before deployment

A key lesson was that high availability is not achieved by creating multiple resources alone. The resources must actually be distributed across failure domains and connected through health-aware routing.

Another important lesson was that Terraform, ECS and Application Auto Scaling each own different aspects of service state. Clear ownership prevents automation systems from fighting over the same runtime configuration.

---

## 21. Result

Milestone 3 transformed the containerized application into a multi-AZ, health-aware and automatically scalable service.

```text
Internet
   ↓
Application Load Balancer
   ↓
Target Group
   ↓
Healthy private ECS tasks
   ↓
Two Availability Zones
   ↓
Auto Scaling 2–4 tasks
```

Final milestone state:

```text
Application Load Balancer          ✅
Two public-subnet ALB deployment   ✅
IP target group                    ✅
/health target checks              ✅
Private ECS tasks                  ✅
No task public IP                  ✅
Two-AZ application redundancy      ✅
ECS desired baseline = 2           ✅
Auto Scaling min 2 / max 4         ✅
CPU target tracking                ✅
Controlled scale-out to 4 tasks    ✅
Terraform ownership separation     ✅
```

The application now had:

- public entry through an ALB
- private ECS compute
- health-aware routing
- two-AZ application redundancy
- ECS self-healing
- automatic scale-out and scale-in

This prepared the platform for **Milestone 4 — Automated Deployment**, where application releases were automated through GitHub Actions.

---

## Presentation Summary

> In Milestone 3 I extended the private ECS/Fargate platform with an internet-facing Application Load Balancer spanning both public subnets. I used an IP target group because Fargate tasks run with `awsvpc` networking, and I connected the application's `/health` endpoint to the target-group health check. I then increased the ECS baseline to two private tasks and verified that they were distributed across both Availability Zones without public IP addresses. Finally, I configured ECS Service Auto Scaling with a minimum of two tasks, a maximum of four and a 50% average CPU target. To prove the configuration worked, I temporarily lowered the target threshold, generated controlled HTTP load through the ALB and observed the service scale automatically from two to four running tasks before restoring the normal policy. The main lesson was that real high availability depends on failure-domain distribution, health-aware routing and clearly defined ownership between Terraform and runtime Auto Scaling.
