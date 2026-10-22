# LangNation Cloud Platform
## Milestone 9 — Real Application Integration, Database Restore & Lina RAG Runtime

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Public Capstone Endpoint:** `cloud.namienterprises.in`  
**Infrastructure as Code:** Terraform + HCP Terraform  
**Application Runtime:** Amazon ECS Fargate  
**Database:** Amazon RDS for MariaDB 11.8.9  
**AI Runtime:** Amazon Bedrock + Amazon S3 Vectors  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 9 replaced the earlier controlled demo application with a sanitized copy of the real LangNation website and connected it to the AWS platform already created in Milestones 1–8.

The main goals were:

- deploy the real LangNation Node.js website to ECS Fargate
- connect the application to the private RDS MariaDB database
- inject database credentials securely through AWS Secrets Manager
- automate restoration of the sanitized LangNation database after sandbox rebuilds
- preserve the nightly disposable-sandbox recovery design
- expose Lina as a live RAG-powered API inside the real application
- use Amazon Titan Text Embeddings V2 for query embeddings
- retrieve relevant knowledge from Amazon S3 Vectors
- use Claude Haiku 4.5 through Amazon Bedrock for grounded answer generation
- keep deployment infrastructure dynamic instead of hard-coding disposable AWS resource IDs
- validate the complete application, database, CI/CD and RAG paths end to end

Milestone 9 is the point where the project changed from an infrastructure demonstration into an integrated cloud application.

---

## 2. Final Milestone 9 Architecture

The final public application path is:

```text
User
  ↓
Persistent Route 53
  ↓
Amazon CloudFront
  ├── ACM
  └── AWS WAF
  ↓
Application Load Balancer
  ↓
Private ECS Fargate Tasks
  ↓
Real LangNation Node.js Application
  ├── Amazon RDS MariaDB
  │     └── credentials from AWS Secrets Manager
  │
  └── Lina RAG Runtime
        ├── Amazon Bedrock
        │     ├── Titan Text Embeddings V2
        │     └── Claude Haiku 4.5
        │
        └── Amazon S3 Vectors
              └── LangNation knowledge chunks
```

Nightly recovery adds:

```text
Training sandbox cleanup
        ↓
Morning GitHub workflow
        ↓
HCP Terraform rebuild
        ↓
Sanitized MariaDB restore
        ↓
Real LangNation image deployment
        ↓
Persistent Route 53 synchronization
        ↓
Public health verification
```

---

## 3. Real LangNation Application

The earlier application used in Milestone 2 was intentionally small and controlled.

Milestone 9 introduced:

```text
demo-website/
```

This is a sanitized copy of the real LangNation website and contains the runtime required for the capstone demonstration.

Key runtime components include:

```text
demo-website/
├── Dockerfile
├── package.json
├── package-lock.json
├── server.js
├── lib/
├── routes/
├── views/
├── public/
├── content/
├── services/
│   └── rag.js
└── MySQL/
```

The application remains separate from the production LangNation repository.

The production website repository is not modified by this capstone.

---

## 4. Git Safety for the Demo Website

Before committing the real application, the repository was checked for:

- environment files
- private keys
- large binaries
- local dependencies
- exam-paper archives
- runtime-generated files
- temporary migration data

The final `.gitignore` excludes:

```text
node_modules/
.env
.env.*
public/downloads/
runtime logs
temporary vocabulary reports
editor metadata
preview output
large duplicate branding assets
```

The following safe template is intentionally retained:

```text
.env.example
```

This keeps the configuration contract visible without committing real credentials.

---

## 5. Application Container

The real LangNation website is built with Docker and deployed to Amazon ECR.

Deployment source:

```text
demo-website/
```

Container flow:

```text
Git commit
    ↓
GitHub Actions
    ↓
Docker build
    ↓
Amazon ECR
    ↓
new ECS task-definition revision
    ↓
ECS rolling deployment
```

Each application image is tagged with the triggering Git commit SHA.

This provides direct traceability between source code and the image running in ECS.

---

## 6. Database Architecture

Amazon RDS configuration:

```text
Engine:                  MariaDB
Version:                 11.8.9
Instance class:          db.t3.micro
Deployment:              Multi-AZ
Public access:           disabled
Storage encryption:      enabled
Backup retention:        7 days
Master password:         AWS-managed
Credentials location:    AWS Secrets Manager
Database:                langnation
```

RDS is placed only in the private database subnets.

The database security group allows MariaDB traffic only from the ECS application security group.

Network path:

```text
Private ECS Fargate task
        ↓ TCP 3306
Database security group
        ↓
Private RDS MariaDB
```

No public database endpoint is exposed.

---

## 7. Sanitized Database Restore

The capstone does not contain the production database.

A sanitized SQL seed is used:

```text
database/seed/langnation-capstone-sanitized.sql
```

Restore validation expects:

```text
58 tables
```

The restore system uses a dedicated image and one-off ECS Fargate task:

```text
database/
├── restore/
│   ├── Dockerfile
│   └── restore.sh
└── seed/
    └── langnation-capstone-sanitized.sql
```

Terraform creates:

```text
Dedicated restore ECR repository
CloudWatch restore log group
Restore ECS execution role
One-off Fargate task definition
```

The restore task receives:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

The username and password are injected through AWS Secrets Manager.

The actual credentials are not stored in:

- Git
- Docker images
- GitHub Actions
- Terraform source
- application source

---

## 8. Automated Morning Database Recovery

The training AWS environment is disposable and may be cleaned automatically.

The morning workflow therefore performs:

```text
AWS sandbox available
        ↓
HCP Terraform rebuild
        ↓
build database-restore image
        ↓
push restore image to ECR
        ↓
run one-off Fargate restore task
        ↓
restore sanitized SQL seed
        ↓
validate expected 58 tables
        ↓
deploy LangNation application
        ↓
sync persistent Route 53
        ↓
verify public HTTPS health
```

The complete recovery pipeline was validated successfully.

Validated workflow stages:

```text
Check Whether Recovery Is Needed       ✅
Rebuild AWS Infrastructure             ✅
Restore Sanitized LangNation Database  ✅
Restore LangNation Application         ✅
Sync Persistent Route 53 DNS           ✅
```

This demonstrated that the application can recover after complete sandbox resource recreation.

---

## 9. Database Restore Password Handling Issue

During implementation, the RDS-managed password contained a special character that affected the MariaDB option-file parsing used by the restore process.

The restore script was corrected so that generated credentials are safely escaped and authentication is verified using an actual database query.

The updated restore process validates the connection before importing the seed.

A repository-level line-ending rule was also added for shell scripts so Linux-based containers receive LF line endings.

Final recovery validation completed successfully after the fix.

---

## 10. ECS Database Runtime Integration

The container module was extended with dynamic database configuration.

Terraform passes:

```text
DB_HOST
DB_PORT
DB_NAME
```

ECS injects:

```text
DB_USER
DB_PASSWORD
```

from the RDS-managed Secrets Manager secret.

The ECS execution role receives only the permission required to retrieve that database secret.

The application task definition therefore contains configuration references, not plaintext database passwords.

---

## 11. RDS TLS Requirement

After the first real-website deployment, the public application was healthy but the stronger application health endpoint reported:

```json
"database": false
```

CloudWatch application logs showed:

```text
Connections using insecure transport are prohibited while --require_secure_transport=ON.
```

This identified the exact problem:

```text
ECS could reach RDS
credentials were present
database existed
but the client connection was not using TLS
```

The correct fix was to preserve secure transport on RDS and update the Node.js application.

The application now uses the Amazon RDS certificate profile through:

```text
aws-ssl-profiles
```

The MySQL pool automatically enables verified TLS for RDS endpoints.

The application does not disable certificate verification and does not weaken the RDS security configuration.

Final validation:

```json
"database": true
```

This proved a successful encrypted application-to-database connection.

---

## 12. Lina RAG Integration

The real LangNation application contains:

```text
demo-website/services/rag.js
```

The Lina API endpoint is:

```text
POST /api/lina/ask
```

Example request:

```json
{
  "question": "Wann benutze ich der, die oder das?"
}
```

Lina runtime flow:

```text
Student question
      ↓
Titan Text Embeddings V2
      ↓
1024-dimensional query embedding
      ↓
Amazon S3 Vectors
      ↓
similarity search
      ↓
relevant LangNation knowledge chunks
      ↓
Claude Haiku 4.5
      ↓
grounded answer
```

---

## 13. Bedrock Runtime Configuration

Embedding model:

```text
amazon.titan-embed-text-v2:0
```

Answer-generation inference profile:

```text
us.anthropic.claude-haiku-4-5-20251001-v1:0
```

Underlying foundation model:

```text
anthropic.claude-haiku-4-5-20251001-v1:0
```

The application receives these values through the ECS task definition.

No AWS API keys are stored in the application.

The AWS SDK receives temporary task-role credentials through ECS task metadata.

---

## 14. Least-Privilege Lina IAM

The ECS application task role is separate from the ECS execution role.

The application task role allows only the runtime actions required by Lina.

Responsibilities include:

```text
bedrock:InvokeModel
→ Titan embedding model

bedrock:InvokeModel
→ configured Claude inference profile

S3 Vectors
→ query the LangNation vector index
→ read matching vector metadata
```

The Bedrock foundation-model permission is restricted to the configured inference profile.

The application does not receive broad administrator permissions.

---

## 15. S3 Vector Knowledge Store

Milestone 8 provides the vector infrastructure used by Lina.

The validated knowledge source for the final M9 test was:

```text
documents/german-a1-articles.txt
```

The knowledge ingestion path remains:

```text
S3 document
    ↓
EventBridge
    ↓
SQS
    ↓
Lambda
    ↓
Titan embedding
    ↓
S3 Vectors
```

Milestone 9 adds the retrieval and answer-generation path:

```text
Student question
    ↓
ECS application
    ↓
Titan query embedding
    ↓
S3 Vectors query
    ↓
retrieved source_text
    ↓
Claude Haiku
    ↓
grounded Lina answer
```

---

## 16. End-to-End Lina Validation

Final test request:

```text
Wann benutze ich der, die oder das?
```

The API returned:

```json
{
  "grounded": true,
  "sources": [
    {
      "sourceKey": "documents/german-a1-articles.txt"
    }
  ]
}
```

The returned answer explained the German articles `der`, `die` and `das`.

This proves that the response did not rely only on general model knowledge.

The validated path was:

```text
Public API
   ↓
ECS Node.js
   ↓
Titan query embedding
   ↓
S3 Vectors similarity search
   ↓
LangNation source retrieval
   ↓
Claude answer generation
   ↓
grounded=true
```

---

## 17. Dynamic GitHub Deployment

The application deployment workflow was rewritten so disposable AWS resource identifiers are not hard-coded.

The workflow now reads current infrastructure from HCP Terraform outputs:

```text
aws_region
ecr_repository_url
ecs_cluster_name
ecs_service_name
ecs_task_definition_arn
cloudfront_domain_name
```

Deployment flow:

```text
Read HCP Terraform outputs
        ↓
Authenticate to current AWS sandbox using OIDC
        ↓
Build demo-website Docker image
        ↓
Push Git-SHA image to ECR
        ↓
download Terraform-managed task definition
        ↓
validate MariaDB + Lina configuration
        ↓
replace only application image
        ↓
register new ECS revision
        ↓
update ECS service
        ↓
wait for stable service
        ↓
verify deployed image
        ↓
verify ECS counts
        ↓
verify CloudFront /health
```

This avoids coupling the workflow to disposable AWS IDs.

---

## 18. Important Task-Definition Design Decision

The deployment workflow intentionally starts from the task-definition ARN exposed by HCP Terraform rather than blindly downloading whatever revision the ECS service currently runs.

This protects the Milestone 9 configuration.

The Terraform-managed definition contains:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER secret
DB_PASSWORD secret
BEDROCK_EMBEDDING_MODEL_ID
BEDROCK_CHAT_MODEL_ID
VECTOR_BUCKET_NAME
VECTOR_INDEX_NAME
application task role
execution role
```

Before deployment, GitHub validates that these settings exist.

If an outdated task definition were ever returned, deployment would fail instead of silently removing the database or RAG configuration.

---

## 19. CI/CD Validation

The final deployment workflow completed successfully with all major checks green:

```text
Checkout repository                         ✅
Read current infrastructure from HCP       ✅
Configure AWS credentials with OIDC         ✅
Verify AWS identity                         ✅
Login to ECR                                ✅
Set application image URI                   ✅
Build LangNation demo website image         ✅
Push LangNation image to ECR                ✅
Download Terraform ECS task definition      ✅
Validate MariaDB and Lina configuration     ✅
Render new image in ECS task definition     ✅
Deploy new ECS task definition              ✅
Wait for ECS service stability              ✅
Verify deployed image                       ✅
Verify ECS service counts                   ✅
Verify application health through CloudFront✅
Deployment summary                          ✅
```

The later RDS TLS fix was deployed through the same pipeline and also completed successfully.

---

## 20. Application Health Validation

Lightweight ECS/ALB/CloudFront health endpoint:

```text
GET /health
```

Response:

```json
{
  "status": "healthy",
  "service": "langnation-demo"
}
```

Stronger application health endpoint:

```text
GET /api/health
```

Final validated output included:

```json
{
  "ok": true,
  "content": {
    "courses": 14,
    "team": 7,
    "events": 10,
    "gallery": 8,
    "posts": 5,
    "pages": 37,
    "testimonials": 10,
    "faqs": 29
  },
  "database": true,
  "email": "not configured"
}
```

The email subsystem is intentionally outside the Milestone 9 objective.

The important validation is:

```json
"database": true
```

---

## 21. Terraform Changes

Milestone 9 extended the container environment with:

```text
AWS account identity
RDS endpoint
RDS port
database name
RDS secret ARN
Bedrock chat-model configuration
S3 Vector configuration
```

The account ID is discovered dynamically with:

```hcl
data.aws_caller_identity.current.account_id
```

No sandbox AWS account ID is embedded in the container module.

The ECS service also depends on the required database and RAG infrastructure before the runtime is considered complete.

---

## 22. GitHub OIDC and PassRole

GitHub Actions continues to authenticate to AWS using OpenID Connect.

The deployment IAM policy allows GitHub to pass only the required ECS roles:

```text
application execution role
application task role
database restore execution role
```

The workflow cannot pass arbitrary IAM roles.

This preserves least privilege while still allowing new task-definition revisions to be registered.

---

## 23. HCP Terraform State Model

HCP Terraform remains the persistent infrastructure source of truth for the disposable sandbox.

An important operational lesson occurred during M9:

```text
local terraform state list
→ 46 objects

local terraform plan
→ attempted to add approximately the entire environment
```

The local CLI was reading incomplete/stale local state rather than the HCP workspace used by the automated recovery workflow.

The safe operational model is therefore:

```text
Local Terraform
├── terraform fmt       ✅
└── terraform validate  ✅

HCP / GitHub workflow
├── Plan                ✅
├── Apply               ✅
├── Rebuild             ✅
└── Destroy             ✅
```

HCP Terraform workspace:

```text
Organization: cloudforge-capstone
Workspace:    langnation-capstone-dev
```

This avoids accidentally applying against stale local state.

---

## 24. Problems and Solutions

### Problem 1 — Local Terraform proposed 80 resources

Local Terraform had only part of the real persistent state.

**Solution:** do not use local apply for this project; use HCP Terraform as the infrastructure source of truth.

---

### Problem 2 — HCP workspace lock

A Git push automatically started an HCP Terraform run.

A second infrastructure plan then failed because the workspace was already locked.

**Solution:** inspect the existing HCP run instead of starting a duplicate run.

---

### Problem 3 — RDS-managed password contained a special character

The restore script initially failed because the MariaDB option-file password handling did not safely account for the generated password.

**Solution:** safely escape credentials and validate authentication with a real SQL query.

---

### Problem 4 — Real application started but database health was false

The application had all required DB variables and secrets, but RDS refused the connection.

CloudWatch revealed:

```text
Connections using insecure transport are prohibited while --require_secure_transport=ON.
```

**Solution:** keep secure transport enabled and add verified Amazon RDS TLS support to the Node.js MySQL pool.

---

### Problem 5 — Deployment workflow originally contained static infrastructure names

The original workflow referenced static ECR, ECS and CloudFront values.

That design is fragile in a nightly disposable sandbox.

**Solution:** read current resource names and ARNs from HCP Terraform outputs on every deployment.

---

## 25. Security Decisions

### Credentials

Database credentials remain in AWS Secrets Manager.

They are injected into ECS at task start and are not committed to Git.

### Database transport

RDS secure transport remains enabled.

The application verifies Amazon RDS TLS certificates.

### Database network

RDS is private and accepts traffic only from the ECS security group.

### AWS access

GitHub uses OIDC instead of permanent AWS access keys.

### Application AWS SDK

Lina uses ECS task-role credentials instead of embedded AWS credentials.

### IAM

Execution and runtime responsibilities remain separated.

---

## 26. Validation Checklist

### Real Application

- [x] sanitized LangNation website committed
- [x] Docker image builds successfully
- [x] real website image pushed to ECR
- [x] ECS service runs the Git SHA image
- [x] CloudFront `/health` returns healthy

### Database

- [x] RDS MariaDB available in private subnets
- [x] RDS master credentials managed by Secrets Manager
- [x] DB credentials injected into ECS
- [x] database restore task runs in Fargate
- [x] sanitized seed restored
- [x] expected 58 tables validated
- [x] application database connection validated
- [x] MariaDB transport encrypted with TLS
- [x] `/api/health` returns `"database": true`

### CI/CD

- [x] workflow reads HCP Terraform outputs
- [x] workflow avoids disposable resource IDs
- [x] GitHub authenticates through OIDC
- [x] Git SHA image tagging works
- [x] task-definition runtime settings validated before deploy
- [x] ECS rolling deployment reaches stable state
- [x] desired/running/pending counts validated
- [x] public CloudFront health validated

### Lina RAG

- [x] Lina API available in real application
- [x] Titan Text Embeddings V2 invoked
- [x] S3 Vector index queried
- [x] LangNation knowledge source retrieved
- [x] Claude Haiku 4.5 invoked through Bedrock
- [x] final answer returned
- [x] `grounded=true`
- [x] source `documents/german-a1-articles.txt` returned

### Recovery

- [x] automated HCP infrastructure rebuild
- [x] automated database restore
- [x] automated application deployment
- [x] persistent Route 53 synchronization
- [x] final public health verification

---

## 27. Key Lessons Learned

### A healthy process is not the same as a healthy dependency

The application could return:

```text
/health → healthy
```

while:

```text
/api/health → database false
```

Both checks are valuable because they answer different questions.

### Logs should drive debugging

The CloudWatch message about `require_secure_transport` immediately identified the true database issue.

Changing Terraform or security groups without that evidence would have been guesswork.

### Disposable infrastructure requires dynamic automation

Any workflow that hard-codes sandbox resource identifiers will eventually break after recreation.

HCP outputs are the stable interface between infrastructure and automation.

### Security settings should be preserved, not bypassed

The correct solution to the RDS TLS failure was to make the application more secure, not to disable secure transport.

### RAG needs evidence, not only a plausible answer

The final Lina validation included both:

```text
grounded=true
```

and a retrieved LangNation source.

This proves the retrieval path instead of merely demonstrating that the foundation model can answer the question.

---

## 28. Final Result

```text
Real LangNation website in ECS Fargate         ✅
Docker image stored in ECR                     ✅
Private Multi-AZ MariaDB                       ✅
Secrets Manager DB credentials                 ✅
Automated sanitized DB restore                 ✅
58-table restore validation                    ✅
Application → MariaDB                          ✅
Application → MariaDB over verified TLS        ✅
Dynamic HCP-driven deployment                  ✅
GitHub OIDC                                    ✅
Git-SHA deployment traceability                ✅
CloudFront public application                  ✅
Lina API                                       ✅
Titan embeddings                               ✅
S3 Vectors retrieval                           ✅
Claude Haiku grounded generation               ✅
grounded=true                                  ✅
Knowledge source returned                      ✅
Morning rebuild + restore + deploy              ✅
```

**Milestone 9 status: ✅ COMPLETE**

---

## 29. Milestone 10 Handoff

Milestone 9 leaves the platform with a fully integrated application runtime.

The next milestone can build on:

```text
CloudFront + WAF
        ↓
ALB
        ↓
ECS Fargate
        ├── private RDS MariaDB
        └── Lina RAG
              ├── Bedrock
              └── S3 Vectors
```

Before starting Milestone 10, create the Milestone 9 architecture diagram using the final architecture and validation evidence captured in this document.
