# LangNation Cloud Platform
## Milestone 5 — Database & Storage

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Amazon RDS for MySQL, AWS Secrets Manager, Amazon S3, IAM, VPC Security Groups, Multi-AZ, Terraform lifecycle and storage controls  
**Database:** Amazon RDS for MySQL  
**Object Storage:** Amazon S3  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 5 introduced persistent data services into the LangNation Cloud Platform.

The milestone added two major capabilities:

- **Amazon RDS for MySQL** for relational application data
- **Amazon S3** for private object storage and future application / RAG content

The data layer extended the existing platform while preserving the design principles established in earlier milestones:

- private application compute
- isolated database networking
- least-privilege security-group relationships
- Multi-AZ availability
- encryption at rest
- managed credentials
- reproducible Terraform deployment

The resulting data flow became:

```text
Private ECS Fargate
        │
        ├───────────────┐
        │               │
        │ TCP 3306      │ HTTPS
        ▼               ▼
Private RDS MySQL     Amazon S3
        │             private
        │             encrypted
        │             versioned
        ▼
Private DB subnets
across two AZs
```

This milestone transformed the platform from a stateless application runtime into a system with durable relational and object storage.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

I first recreated the Milestone 5 architecture in Excalidraw to understand how ECS, the database security group, RDS, Secrets Manager and S3 fit into the existing platform.

![Milestone 5 design sketch](../architecture/milestones/m05/design-sketch.png)

### Final Milestone Architecture

The final milestone architecture shows the persistent database and object-storage services introduced in Milestone 5.

![Milestone 5 final architecture](../architecture/milestones/m05/milestone-architecture.png)

### Platform Design After Milestone 5

This cumulative view shows the platform after networking, containerization, load balancing, Auto Scaling, CI/CD and persistent data services had been combined.

![Milestone 5 cumulative design sketch](../architecture/milestones/m05/design-sketch-platform.png)

![Platform after Milestone 5](../architecture/milestones/m05/platform-after-m05.png)

---

## 3. Data-Layer Architecture

The Milestone 5 data architecture is:

```text
ECS Fargate
Private application subnets
        │
        ├───────────────┐
        │               │
        │ TCP 3306      │ HTTPS
        ▼               ▼
DB Security Group      Amazon S3
        │              private
        ▼              encrypted
RDS MySQL              versioned
        │              HTTPS-only
        │
Private DB Subnets
us-east-1a + us-east-1b
```

The database is reachable only from the application security group.

Amazon S3 provides private object storage for:

- application files
- learning materials
- future user uploads
- exports
- future AI/RAG source documents

The storage module remains independent from the later RAG implementation.

---

## 4. Amazon RDS for MySQL

### Final Configuration

```text
Engine: MySQL
Deployed version: 8.4.11
Instance class: db.t3.micro
Storage: 20 GiB gp3
Max storage: 100 GiB
Encryption: enabled
Multi-AZ: enabled
Public access: disabled
Backup retention: 7 days
Port: 3306
Database name: langnation
Master password: managed by AWS Secrets Manager
```

The explicit engine version was not pinned because the training sandbox denied the RDS engine-version discovery APIs.

AWS selected a supported MySQL version during deployment.

### DB Subnet Group

RDS uses both private database subnets:

```text
10.0.21.0/24 — us-east-1a
10.0.22.0/24 — us-east-1b
```

These subnets use private database route tables with no default internet route.

### Terraform Configuration

The database resource uses:

```hcl
storage_type      = "gp3"
storage_encrypted = true

manage_master_user_password = true

publicly_accessible = false
multi_az            = true

backup_retention_period = 7
copy_tags_to_snapshot   = true

auto_minor_version_upgrade = true
```

For the disposable training sandbox:

```hcl
deletion_protection = false
skip_final_snapshot = true
```

These settings make rebuilds practical in an environment that is regularly cleaned.

---

## 5. Database Security

The database security-group relationship is:

```text
ECS Security Group
       │
       │ TCP 3306
       ▼
Database Security Group
       │
       ▼
RDS MySQL
```

The important controls are:

- RDS is not publicly accessible
- RDS is placed only in private database subnets
- the DB security group accepts TCP `3306` only from the ECS security group
- no public IPv4 or IPv6 CIDR rule is configured
- the private DB route tables have no default internet route

The intended network relationship is therefore:

```text
Internet → RDS          ❌
ECS → TCP 3306 → RDS   ✅
```

A database endpoint can still exist while the database remains private. Public accessibility depends on routing, subnet placement, security groups and the RDS public-access setting.

---

## 6. Credential Management

The database password is not stored in:

- Terraform source
- GitHub
- `.env` files
- project documentation

Instead:

```hcl
manage_master_user_password = true
```

allows RDS to manage the master password through AWS Secrets Manager.

Only the secret reference / ARN is exposed through Terraform outputs.

The secret value itself is not printed into the repository or documentation.

This separates:

```text
Infrastructure configuration
→ Terraform

Secret value
→ AWS Secrets Manager
```

---

## 7. Amazon S3

Milestone 5 introduced a private object-storage layer.

Bucket:

```text
langnation-cloud-platform-dev-881893827142-storage
```

The bucket is intended for:

- application files
- learning materials
- future user uploads
- exports
- future AI/RAG source documents

### Security Configuration

```text
Block Public Access: enabled
Object ownership: BucketOwnerEnforced
Versioning: enabled
Server-side encryption: SSE-S3 / AES256
HTTPS-only access: enforced
```

### Public-Access Protection

All four S3 public-access controls are enabled:

```text
BlockPublicAcls: true
IgnorePublicAcls: true
BlockPublicPolicy: true
RestrictPublicBuckets: true
```

### HTTPS-Only Bucket Policy

The bucket policy denies requests when:

```text
aws:SecureTransport = false
```

Therefore:

```text
HTTPS → S3 ✅
HTTP  → S3 ❌
```

---

## 8. S3 Lifecycle Management

The lifecycle policy controls storage growth caused by versioning and abandoned uploads.

```text
Noncurrent object versions: 30 days
Incomplete multipart uploads: 7 days
```

Current object versions are not automatically deleted by this rule.

This keeps versioning useful for recovery while preventing unlimited accumulation of:

- old object versions
- incomplete multipart uploads

The lifecycle configuration balances recoverability with storage hygiene.

---

## 9. Terraform Structure

Milestone 5 introduced two reusable Terraform modules:

```text
terraform/
└── modules/
    ├── database/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    └── storage/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

The modules intentionally separate responsibilities:

```text
database
→ RDS
→ DB subnet group
→ Secrets Manager integration

storage
→ S3 security
→ versioning
→ encryption
→ lifecycle management
```

The database module consumes the private DB subnet IDs and database security group created in earlier milestones.

The storage module remains independent from application runtime logic.

No disposable AWS-generated resource IDs need to be hard-coded into the module design.

---

## 10. Implementation Summary

### Database

1. created the database Terraform module
2. created the RDS DB subnet group
3. placed the subnet group across both private DB subnets
4. created the MySQL RDS instance
5. configured 20 GiB gp3 storage
6. enabled storage autoscaling up to 100 GiB
7. enabled storage encryption
8. enabled Multi-AZ
9. disabled public accessibility
10. configured seven-day backup retention
11. enabled RDS-managed master credentials
12. restricted TCP 3306 to the ECS security group
13. exposed safe database outputs without exposing the password

### Object Storage

14. created the storage Terraform module
15. created the S3 bucket
16. enabled Block Public Access
17. enabled `BucketOwnerEnforced`
18. enabled versioning
19. enabled SSE-S3 encryption
20. enforced HTTPS-only access
21. added lifecycle cleanup for noncurrent object versions
22. added cleanup for incomplete multipart uploads

---

## 11. Useful Commands

### Terraform Initialization

```powershell
terraform init
```

Required after introducing the new database and storage modules.

### Terraform Formatting

```powershell
terraform fmt -recursive
```

Keeps Terraform configuration consistently formatted.

### Terraform Validation

```powershell
terraform validate
```

Validates module references and configuration structure.

### RDS Discovery Commands Attempted

The sandbox restricted the APIs used for engine and instance discovery:

```text
rds:DescribeDBEngineVersions
rds:DescribeOrderableDBInstanceOptions
```

Because those permissions were unavailable, the implementation avoided depending on local discovery of a pinned engine version.

### Authoritative Infrastructure Operations

The project continues to use:

```text
Local Terraform
→ init / fmt / validate

HCP Terraform
→ authoritative plan / apply / remote state
```

---

## 12. Validation

The milestone was validated independently at the database, storage and Terraform layers.

### Amazon RDS

- [x] RDS instance status is `available`
- [x] engine is MySQL
- [x] deployed version verified as `8.4.11`
- [x] instance class is `db.t3.micro`
- [x] storage is encrypted
- [x] Multi-AZ is enabled
- [x] public access is disabled
- [x] 20 GiB gp3 storage configured
- [x] maximum storage configured at 100 GiB
- [x] backup retention is 7 days
- [x] DB subnet group spans both Availability Zones
- [x] DB security group accepts only ECS SG traffic on port 3306
- [x] master credentials are managed through Secrets Manager

### Amazon S3

- [x] bucket created successfully
- [x] public access fully blocked
- [x] object ownership set to `BucketOwnerEnforced`
- [x] versioning enabled
- [x] SSE-S3 / AES256 encryption enabled
- [x] HTTPS-only policy applied
- [x] noncurrent-version cleanup configured
- [x] incomplete multipart cleanup configured

### Terraform

- [x] `terraform fmt -recursive`
- [x] `terraform validate`
- [x] HCP Terraform plan/apply completed successfully
- [x] unrelated infrastructure was not modified by the S3 module deployment

---

## 13. Controlled Recovery / Sandbox Rebuild Validation

The training sandbox removes AWS resources regularly.

On the next rebuild, HCP Terraform detected the missing environment and recreated the infrastructure from code.

The database resources were recreated as part of that process.

At the same time, the recreated ECR repository was empty, so the application could not start until the Milestone 4 deployment workflow restored the image.

The recovery relationship became:

```text
HCP Terraform
→ infrastructure recovery

GitHub Actions
→ application artifact + deployment recovery
```

After the application deployment completed, the ECS service returned to:

```text
Desired: 2
Running: 2
Pending: 0
```

This demonstrated that infrastructure recovery and application artifact recovery are separate but complementary responsibilities.

---

## 14. Problems and Solutions

### Problem 1 — RDS Engine Discovery APIs Were Denied

The sandbox denied:

```text
rds:DescribeDBEngineVersions
rds:DescribeOrderableDBInstanceOptions
```

**Impact:**  
Local CLI discovery of supported engine versions and instance combinations was limited.

**Decision:**  
Do not pin an explicit engine version in Terraform and allow AWS to select a supported version during deployment.

**Result:**  
MySQL `8.4.11` was deployed successfully.

**Lesson:**  
Infrastructure code sometimes needs to adapt to the permissions available in a managed training environment.

---

### Problem 2 — New Terraform Module Was Not Initialized

After adding a new local module, validation reported:

```text
Module not installed
```

**Cause:**  
Terraform had not been reinitialized after introducing the new module.

**Fix:**

```powershell
terraform init
```

**Lesson:**  
New module references require Terraform initialization before validation can succeed.

---

### Problem 3 — Terminal Output Was Accidentally Pasted into PowerShell

Prompt and output characters were pasted together with commands, causing PowerShell to interpret non-command text as executable input.

**Fix:**  
Run only the actual command text.

**Lesson:**  
During step-by-step troubleshooting, terminal prompts and previous output should not be copied together with commands.

---

## 15. Security Decisions

### Private Database Placement

RDS is deployed only in the private database subnets.

The database is not publicly accessible.

### Security-Group Referencing

Database traffic follows:

```text
ECS Security Group
        ↓ TCP 3306
Database Security Group
        ↓
RDS
```

No public CIDR access is required.

### Managed Credentials

RDS manages the master password through AWS Secrets Manager.

The password is not stored in source code, GitHub or Terraform configuration.

### Encryption at Rest

RDS storage encryption is enabled.

The S3 bucket uses SSE-S3 / AES256 encryption.

### S3 Public Access Controls

The object-storage layer uses:

```text
Block Public Access
BucketOwnerEnforced
HTTPS-only policy
```

### S3 Versioning

Versioning provides an additional recovery mechanism for stored objects.

### Current-State Note

> Milestone 6 later hardened the public application path with CloudFront, WAF and Cognito, but the private RDS and S3 security design established here remains part of the platform.

---

## 16. Cost and Operational Decisions

### Multi-AZ RDS

The largest Milestone 5 cost driver is Multi-AZ RDS.

Multi-AZ improves database availability but requires more infrastructure than a Single-AZ development database.

For this capstone, the higher cost was accepted because the project demonstrates a production-style highly available architecture.

### RDS Instance and Storage

The database uses:

```text
db.t3.micro
20 GiB gp3
maximum storage 100 GiB
```

This keeps the database relatively small while still demonstrating:

- managed relational storage
- Multi-AZ
- backup retention
- storage autoscaling

### Backup Retention

Backups are retained for:

```text
7 days
```

This provides recovery capability without retaining development backups indefinitely.

### S3 Lifecycle Management

The lifecycle configuration reduces unnecessary long-term storage growth:

```text
Noncurrent versions: 30 days
Incomplete multipart uploads: 7 days
```

### Disposable Sandbox Settings

For the training environment:

```text
deletion_protection = false
skip_final_snapshot = true
```

These settings prioritize reproducible rebuilds over long-lived resource preservation.

They are environment-specific choices rather than a recommendation for every production database.

---

## 17. What I Learned

This milestone gave me practical experience with:

- RDS subnet groups
- private database placement
- Multi-AZ RDS
- security-group-to-security-group database access
- managed database credentials
- AWS Secrets Manager integration
- RDS backup retention
- storage autoscaling
- S3 Block Public Access
- S3 object ownership
- versioning
- SSE-S3 encryption
- HTTPS-only bucket policies
- lifecycle management
- infrastructure recovery after sandbox cleanup

One important lesson was that a database can still have a DNS endpoint while remaining private.

Public accessibility depends on:

```text
subnet placement
+
routing
+
security groups
+
RDS publicly_accessible setting
```

not merely on whether the service has a DNS endpoint.

Another important lesson was that durable application data introduces different recovery responsibilities from stateless application compute.

---

## 18. Result

Before Milestone 5:

```text
LangNation
├── VPC / networking
├── ECS Fargate
├── ALB
├── Auto Scaling
└── CI/CD
```

After Milestone 5:

```text
LangNation
├── VPC / networking
├── ECS Fargate
├── ALB
├── Auto Scaling
├── CI/CD
├── RDS MySQL
│   ├── private
│   ├── Multi-AZ
│   ├── encrypted
│   ├── backed up
│   └── Secrets Manager credentials
│
└── Amazon S3
    ├── private
    ├── encrypted
    ├── versioned
    ├── HTTPS-only
    └── lifecycle managed
```

Final milestone state:

```text
Private RDS MySQL                 ✅
Multi-AZ database                 ✅
Encrypted database storage        ✅
Secrets Manager credentials       ✅
7-day database backups            ✅
Private S3 bucket                 ✅
S3 Block Public Access            ✅
BucketOwnerEnforced               ✅
S3 versioning                     ✅
SSE-S3 encryption                 ✅
HTTPS-only S3 access              ✅
Lifecycle management              ✅
Sandbox rebuild validation        ✅
```

Milestone 5 added a secure persistent data layer and prepared the platform for **Milestone 6 — Edge, DNS, Security & Authentication**.

---

## Presentation Summary

> In Milestone 5 I added the persistent data layer using Amazon RDS for MySQL and Amazon S3. RDS runs in dedicated private database subnets across two Availability Zones, is encrypted, is not publicly accessible and accepts MySQL traffic on port 3306 only from the ECS security group. RDS manages the master password through AWS Secrets Manager so credentials are not stored in Terraform or GitHub. For object storage, I created a private S3 bucket with Block Public Access, BucketOwnerEnforced ownership, versioning, SSE-S3 encryption, HTTPS-only access and lifecycle cleanup. I also validated the recovery model after the training sandbox removed the environment: HCP Terraform could recreate the infrastructure while the GitHub Actions deployment pipeline separately restored the application artifact. The main lesson was that database security depends on network placement, routing, security groups and service configuration together—not simply on whether the database has an endpoint.
