# LangNation Cloud Platform
## Milestone 1 — Foundation & Networking

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Amazon VPC, Subnets, Internet Gateway, NAT Gateway, Route Tables, Security Groups, HCP Terraform  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 1 established the network foundation for the LangNation Cloud Platform.

The goal was to build a reproducible, multi-AZ AWS network that could support later milestones without exposing application or database workloads directly to the internet.

The milestone introduced:

- one custom VPC
- two Availability Zones
- two public subnets
- two private application subnets
- two isolated private database subnets
- one Internet Gateway
- two NAT Gateways with Elastic IPs
- separate public, private-app and private-DB routing
- layered security groups for ALB, ECS and database communication
- reusable Terraform modules
- HCP Terraform remote state and authoritative plan/apply
- reproducibility after nightly sandbox cleanup

The resulting foundation can be summarized as:

```text
Internet
   ↓
Internet Gateway
   ↓
Public Subnets
   ↓
NAT Gateways
   ↓
Private Application Subnets
   ↓
Private Database Subnets
```

The public, application and database tiers were intentionally separated so later milestones could add compute, load balancing and data services without redesigning the network.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

Before implementation, I recreated the network in Excalidraw to understand the relationship between the VPC, Availability Zones, subnet tiers, route tables, NAT Gateways and security groups.

![Milestone 1 design sketch](../architecture/milestones/m01/design-sketch.png)

### Final Milestone Architecture

The final documentation view shows the same network design in a cleaner presentation format.

![Milestone 1 final architecture](../architecture/milestones/m01/milestone-architecture.png)

### Platform Design After Milestone 1

Milestone 1 is the project foundation, so the milestone architecture is also the complete cumulative platform at this point.

A separate cumulative `platform-after-m01.png` is not required because there are no earlier milestones to combine with it.

---

## 3. Network Architecture

### VPC

```text
VPC CIDR: 10.0.0.0/16
Region:   us-east-1
```

The `/16` VPC provides enough address space for multiple subnet tiers while keeping the addressing plan easy to understand.

### Subnet Plan

| Tier | us-east-1a | us-east-1b |
|---|---:|---:|
| Public | `10.0.1.0/24` | `10.0.2.0/24` |
| Private App | `10.0.11.0/24` | `10.0.12.0/24` |
| Private DB | `10.0.21.0/24` | `10.0.22.0/24` |

The addressing pattern is intentionally readable:

- `10.0.1.x` / `10.0.2.x` → public tier
- `10.0.11.x` / `10.0.12.x` → private application tier
- `10.0.21.x` / `10.0.22.x` → private database tier

### Routing

```text
Internet
   |
Internet Gateway
   |
Public Route Table
0.0.0.0/0 -> IGW
   |
   +---------------------------+
   |                           |
Public Subnet 1           Public Subnet 2
10.0.1.0/24              10.0.2.0/24
   |                           |
NAT Gateway 1            NAT Gateway 2
   |                           |
Private App RT 1          Private App RT 2
0.0.0.0/0 -> NAT 1       0.0.0.0/0 -> NAT 2
   |                           |
Private App Subnet 1      Private App Subnet 2
10.0.11.0/24             10.0.12.0/24

Private DB Subnet 1       Private DB Subnet 2
10.0.21.0/24             10.0.22.0/24
   |                           |
Private DB RT 1           Private DB RT 2
local only                local only
```

Key network decisions:

- public subnets use the Internet Gateway
- each private application subnet uses the NAT Gateway in the same Availability Zone
- private database route tables have no `0.0.0.0/0` route
- database subnets therefore have no direct internet path

---

## 4. Security Architecture

Milestone 1 introduced three security-group layers:

```text
ALB Security Group
        |
        | application traffic
        v
ECS Security Group
        |
        | database traffic
        v
Database Security Group
```

At this stage, the goal was to establish security-group references between layers instead of opening internal services broadly by CIDR range.

The important controls were:

- ECS is not directly exposed to the internet
- ECS accepts application traffic only from the ALB security group
- the database accepts database traffic only from the ECS security group
- private database subnets have no default internet route

> **Current-state note:** Milestone 6 later hardened the public path further. The ALB now accepts HTTP port 80 only from the AWS-managed CloudFront origin-facing prefix list. Viewer HTTPS terminates at CloudFront, and direct public access to the ALB is blocked.

---

## 5. Terraform Structure

The milestone separated networking and security responsibilities into reusable modules.

```text
terraform/
├── environments/
│   └── dev/
│       ├── data.tf
│       ├── main.tf
│       ├── outputs.tf
│       ├── provider.tf
│       ├── terraform.tfvars.example
│       ├── variables.tf
│       └── versions.tf
│
└── modules/
    ├── networking/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    └── security/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

### Networking Module Responsibilities

The networking module creates and manages:

- VPC
- public subnets
- private application subnets
- private database subnets
- Internet Gateway
- Elastic IPs
- NAT Gateways
- public route table
- private application route tables
- private database route tables
- route-table associations

### Security Module Responsibilities

The security module creates:

- ALB security group
- ECS security group
- database security group
- security-group rules between application layers

The modules communicate through Terraform outputs rather than hard-coded AWS-generated resource IDs.

### Terraform Workflow

The project workflow established in this milestone is:

```text
Local workstation
   |
   | terraform init
   | terraform fmt -recursive
   | terraform validate
   v
Git / GitHub
   |
   v
HCP Terraform
   |
   | authoritative plan
   | reviewed apply
   | remote state
   v
AWS
```

Local Terraform is used mainly for syntax, formatting and configuration validation.

HCP Terraform is the authoritative source for:

- remote state
- plans
- applies
- run history
- rebuilds after sandbox cleanup

Versions used during the milestone:

```text
Local Terraform: 1.16.2
AWS provider:     hashicorp/aws 6.67.0
```

---

## 6. Implementation Summary

The milestone was built incrementally rather than as one large Terraform change.

### Foundation

1. verified AWS CLI, Terraform, Git and Docker
2. configured the AWS provider and default project tags
3. configured HCP Terraform
4. verified AWS authentication
5. created the VPC
6. created six subnets across two Availability Zones
7. attached the Internet Gateway
8. created the public route table and public subnet associations

### Private Routing

9. created two Elastic IPs
10. created one NAT Gateway per Availability Zone
11. created private application route tables
12. routed each private application subnet through its same-AZ NAT Gateway
13. created isolated private database route tables
14. associated each database subnet with its local-only route table

### Security

15. created the reusable security module
16. created ALB, ECS and database security groups
17. restricted ECS ingress to the ALB security group
18. restricted database ingress to the ECS security group
19. exposed security-group IDs through module outputs

---

## 7. Useful Commands

### Initialize Terraform

```powershell
terraform init
```

Initializes Terraform, downloads required providers and installs referenced modules.

It should be rerun when module sources or backend-related configuration change.

### Format Terraform

```powershell
terraform fmt -recursive
```

Formats Terraform files consistently across the working tree.

### Validate Terraform

```powershell
terraform validate
```

Checks the Terraform configuration for syntax and internal configuration errors.

Expected result:

```text
Success! The configuration is valid.
```

### Authoritative Plan and Apply

For this project, local Terraform is not the authoritative source for plan/apply state.

The agreed model is:

```text
Local Terraform
→ init / fmt / validate

HCP Terraform
→ plan / apply / remote state
```

---

## 8. Validation

The deployed environment was checked in both Terraform and AWS.

### Network Validation

- [x] VPC CIDR is `10.0.0.0/16`
- [x] six subnets exist
- [x] subnets span two Availability Zones
- [x] Internet Gateway is attached
- [x] public route table contains `0.0.0.0/0 -> IGW`
- [x] both public subnets use the public route table
- [x] two NAT Gateways exist
- [x] each NAT Gateway is in a public subnet
- [x] private app subnet 1 routes through NAT Gateway 1
- [x] private app subnet 2 routes through NAT Gateway 2
- [x] private DB route tables have no internet route

### Security Validation

- [x] layered security-group configuration validates
- [x] ECS ingress is restricted to the ALB security group
- [x] database ingress is restricted to the ECS security group
- [x] database subnets remain isolated from direct internet access

### Terraform / HCP Validation

- [x] `terraform init` completed successfully
- [x] Terraform formatting completed successfully
- [x] `terraform validate` completed successfully
- [x] HCP Terraform successfully planned and applied the infrastructure

### Nightly Sandbox Rebuild Validation

The training sandbox removes resources overnight. HCP Terraform retained the desired state and later detected the missing infrastructure.

A rebuild plan showed:

```text
11 to add
0 to change
0 to destroy
```

The networking foundation was recreated successfully from code.

This established an important project principle:

> **The environment is disposable; the infrastructure definition is not.**

---

## 9. Problems and Solutions

### Problem 1 — Terraform Variable Block Structure

A missing closing brace caused Terraform to report:

```text
Unsupported block type
```

**Cause:**  
The Terraform block structure was incomplete.

**Fix:**  
Corrected the configuration and reran:

```powershell
terraform validate
```

**Lesson:**  
Terraform parser errors often originate slightly above the line being reported, so surrounding block structure should be checked carefully.

---

### Problem 2 — New Module Was Not Installed

After adding a module, Terraform validation reported that the module was not installed.

**Cause:**  
The working directory had not been reinitialized after adding the module source.

**Fix:**

```powershell
terraform init
```

**Lesson:**  
`terraform init` should be rerun when module sources or backend-related configuration change.

---

### Problem 3 — Local Plan Tried to Recreate Cloud-Managed Resources

A local `terraform plan` showed resources as new even though they already existed.

**Cause:**  
The local working directory was not using the authoritative HCP Terraform state.

**Fix / Decision:**  
Use local Terraform only for `init`, `fmt` and `validate`, and use HCP Terraform for authoritative `plan`, `apply` and state.

**Lesson:**  
Terraform configuration and Terraform state are separate concerns. A valid configuration can still produce an incorrect plan when the wrong state is used.

---

### Problem 4 — AWS Sandbox Removes Infrastructure Nightly

The training environment periodically removes AWS resources.

**Cause:**  
This is expected behavior of the training sandbox.

**Solution:**  
Treat AWS runtime resources as disposable and retain the infrastructure definition and authoritative state outside the sandbox.

**Lesson:**  
Reproducibility is more valuable than manually preserving individual resources in an environment that is designed to be temporary.

---

## 10. Security Decisions

### Why Private Application and Database Tiers?

Application and database workloads should not require direct public exposure.

The architecture therefore separates:

```text
Public ingress
      ↓
Private application
      ↓
Private database
```

### Why Security-Group References?

Using security-group-to-security-group rules expresses application relationships directly:

```text
ALB -> ECS -> Database
```

This is safer and easier to maintain than allowing broad internal CIDR ranges.

### Why Isolated Database Route Tables?

The database tier does not require direct internet access.

Removing the default internet route reduces network exposure and prevents the database subnets from using the Internet Gateway or NAT Gateways for general outbound access.

### Why No Hard-Coded AWS Resource IDs?

The Terraform modules exchange dynamically created resource IDs through outputs.

This keeps the infrastructure reproducible after the disposable sandbox recreates AWS resources with different IDs.

---

## 11. Cost and Operational Decisions

### Two NAT Gateways

Each private application subnet uses a NAT Gateway in the same Availability Zone.

This is more expensive than using one shared NAT Gateway, but it:

- avoids depending on a single NAT Gateway
- avoids a single-AZ egress dependency
- demonstrates a production-style multi-AZ network pattern

The higher NAT cost is therefore an intentional availability trade-off for the capstone architecture.

### Two Availability Zones

Running the network across two Availability Zones adds infrastructure compared with a single-AZ development design, but it creates the foundation for later application and database redundancy.

### Disposable Sandbox

Because the training environment is regularly cleaned, the operational priority is reproducibility rather than long-term preservation of AWS runtime resources.

HCP Terraform provides the durable infrastructure state and run history outside the disposable AWS environment.

---

## 12. What I Learned

This milestone gave me practical experience with:

- VPC CIDR planning
- public vs private subnet behavior
- Internet Gateway routing
- NAT Gateway egress
- same-AZ routing decisions
- isolated database networks
- stateful security groups
- security-group references
- Terraform modules
- Terraform variables and outputs
- `count` and `count.index`
- splat expressions
- HCP Terraform remote state
- plan/apply separation
- infrastructure reproducibility
- debugging Terraform configuration errors
- designing around Availability Zone dependencies

One of the most important lessons was that a subnet is not public or private because of its name. Its routing, addressing and attached resources determine its actual network behavior.

A second important lesson was that reproducible infrastructure requires both code and the correct authoritative state model.

---

## 13. Result

Milestone 1 produced a reproducible network foundation with:

```text
Multi-AZ VPC
+
public ingress tier
+
private application tier
+
isolated database tier
+
same-AZ NAT egress
+
layered security groups
+
Terraform-managed infrastructure
+
HCP Terraform remote state
+
rebuild capability
```

The final outcome was:

```text
Networking foundation        ✅
Multi-AZ subnet design       ✅
Private application tier     ✅
Isolated database tier       ✅
Redundant NAT egress         ✅
Layered security groups      ✅
Reusable Terraform modules   ✅
HCP authoritative state      ✅
Sandbox rebuild capability   ✅
```

This foundation enabled **Milestone 2 — Docker, Amazon ECR & ECS Fargate**, where the first containerized application workload was deployed into the private application tier.

---

## Presentation Summary

> I built the AWS network foundation for the LangNation Cloud Platform with Terraform and HCP Terraform. The environment uses a custom `10.0.0.0/16` VPC across two Availability Zones with six subnets: two public, two private application and two isolated database subnets. Public routing uses an Internet Gateway, while each private application subnet uses a NAT Gateway in the same Availability Zone for outbound access. The database subnets have no default internet route. I also implemented layered security groups so application traffic follows the ALB-to-ECS-to-database path instead of exposing internal workloads directly. I validated the routing, subnet distribution, security-group relationships and a full rebuild after the AWS training sandbox removed the environment. One of the main lessons from this milestone was that reproducibility depends not only on Terraform code, but also on using the correct authoritative state and clearly separating public, application and database network responsibilities.
