# LangNation Cloud Platform
## Milestone 4 — Automated Deployment

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS
**Course:** AWS Cloud Computing with AI Bootcamp
**Environment:** Development (`dev`)
**AWS Region:** `us-east-1`
**Infrastructure as Code:** Terraform
**CI/CD:** GitHub Actions
**AWS Authentication:** GitHub OIDC → AWS STS
**Deployment Target:** Amazon ECS on AWS Fargate
**Status:** ✅ Complete

---

## 1. Objective

Milestone 4 replaced the manual container deployment process from Milestone 2 with an automated CI/CD pipeline.

The goal was to make an application change deployable through Git alone:

```text
Application change
      ↓
git push to main
      ↓
GitHub Actions
      ↓
OIDC authentication
      ↓
temporary AWS credentials
      ↓
Docker build
      ↓
Git-SHA image
      ↓
Amazon ECR
      ↓
new ECS task-definition revision
      ↓
rolling ECS deployment
      ↓
health + deployment verification
```

The pipeline was intentionally designed without storing long-lived AWS access keys in GitHub.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

I recreated the CI/CD flow in Excalidraw first so I could clearly understand which system owns source code, identity, image storage, task definitions and the live ECS deployment.

![Milestone 4 design sketch](../architecture/milestones/m04/design-sketch.png)

### Final Milestone Architecture

![Milestone 4 final architecture](../architecture/milestones/m04/milestone-architecture.png)

### Platform Design After Milestone 4

![Milestone 4 cumulative design sketch](../architecture/milestones/m04/design-sketch-platform.png)

![Platform after Milestone 4](../architecture/milestones/m04/platform-after-m04.png)

---

## 3. CI/CD Flow

### CI/CD Architecture

![CI/CD architecture](../architecture/flows/cicd-architecture.png)

### My CI/CD Pipeline Sketch

![CI/CD deployment pipeline design sketch](../architecture/flows/cicd-deployment-pipeline-design-sketch.png)

### Final CI/CD Deployment Flow

![CI/CD deployment pipeline](../architecture/flows/cicd-deployment-pipeline.png)

The deployment path is:

```text
Developer
   ↓
GitHub repository
   ↓
GitHub Actions
   ↓
GitHub OIDC token
   ↓
AWS STS / deployment role
   ↓
Docker build
   ↓
Amazon ECR
   ↓
ECS task definition
   ↓
ECS service
   ↓
Fargate tasks across two AZs
   ↓
application health verification
```

---

## 4. Ownership Model

One of the most important design decisions was to define which system owns each part of the platform.

```text
Terraform / HCP Terraform
├── networking
├── security groups
├── ECR repository
├── ECS cluster
├── ECS service infrastructure
├── base task definition
├── ALB / target group
├── Auto Scaling configuration
├── GitHub OIDC provider
└── GitHub deployment role

GitHub Actions
├── Docker image build
├── immutable Git-SHA image tag
├── ECR image push
├── live ECS task-definition revisions
└── application deployment

Application Auto Scaling
└── live ECS desired task count
```

This separation avoids Terraform, CI/CD and Auto Scaling competing for the same runtime properties.

---

## 5. Terraform CI/CD Module

Milestone 4 introduced:

```text
terraform/
└── modules/
    └── cicd/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

The module manages:

- the GitHub Actions OIDC provider in AWS
- the GitHub deployment IAM role
- the OIDC trust relationship
- least-privilege deployment permissions

---

## 6. GitHub OIDC Authentication

Instead of storing:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

in GitHub, the deployment uses:

```text
GitHub Actions
   ↓
OIDC token
   ↓
AWS IAM OIDC provider
   ↓
AWS STS
   ↓
temporary role credentials
```

Workflow permissions include:

```yaml
permissions:
  contents: read
  id-token: write
```

`id-token: write` allows GitHub Actions to request the OIDC token required for AWS federation.

### Deployment role

```text
langnation-cloud-platform-dev-github-deploy-role
```

The repository stores the role ARN as the GitHub variable:

```text
AWS_ROLE_ARN
```

The ARN identifies a role but is not itself a secret credential.

---

## 7. Immutable GitHub Identity

The first OIDC deployment failed with:

```text
Not authorized to perform sts:AssumeRoleWithWebIdentity
```

The workflow was able to obtain an OIDC token, but AWS rejected the role assumption.

### Root cause

The trust policy initially expected a repository-name-only subject.

The working identity uses the immutable GitHub owner and repository IDs:

```text
repo:sheikhseraj@242254883/langnation-cloud-platform@1407282665:ref:refs/heads/main
```

The trust relationship therefore restricts deployment to:

- the intended GitHub owner
- the immutable owner ID
- the intended repository
- the immutable repository ID
- the `main` branch
- the AWS STS audience

This is stronger than trusting a repository name alone because a rename cannot silently transfer AWS deployment trust to a different repository identity.

---

## 8. Least-Privilege Deployment Permissions

The deployment role does not use `AdministratorAccess`.

It receives only the permissions required for the release process.

### ECR authentication

```text
ecr:GetAuthorizationToken
```

This action requires `Resource = "*"`.

### ECR repository operations

The role can perform the upload operations required to push the application image to the LangNation ECR repository.

### ECS task-definition operations

```text
ecs:RegisterTaskDefinition
ecs:DescribeTaskDefinition
```

### ECS service operations

```text
ecs:DescribeServices
ecs:UpdateService
```

These permissions are restricted to the LangNation ECS service where possible.

### IAM PassRole

The workflow can pass the ECS task execution role only to:

```text
ecs-tasks.amazonaws.com
```

This keeps the deployment role focused on its required responsibilities.

---

## 9. GitHub Actions Workflow

Workflow:

```text
.github/workflows/deploy.yml
```

Primary application trigger:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - "application/**"
      - ".github/workflows/deploy.yml"

  workflow_dispatch:
```

The workflow can also be called by the automated recovery workflow.

Restricting the push trigger to application and deployment-workflow changes prevents unrelated Terraform or documentation updates from unnecessarily redeploying the application.

---

## 10. Deployment Steps

### 1. Checkout source

The workflow checks out the repository.

### 2. Authenticate to AWS using OIDC

GitHub exchanges its identity for temporary AWS credentials.

### 3. Login to Amazon ECR

The workflow authenticates Docker to the private ECR registry.

### 4. Build an immutable image

The Docker image is tagged with:

```text
GITHUB_SHA
```

This creates a direct mapping:

```text
Git commit
   ↕
Docker image
   ↕
ECS task definition
   ↕
running deployment
```

### 5. Push the image to ECR

The Git-SHA-tagged image is pushed to the existing application repository.

### 6. Read the current ECS task definition

The current definition is downloaded so CPU, memory, environment and logging configuration are preserved.

### 7. Render the new image

Only the container image reference is replaced with the new immutable Git-SHA image.

### 8. Register and deploy the new revision

A new ECS task-definition revision is registered and the ECS service performs a rolling deployment.

### 9. Verify the deployment

The workflow verifies that the intended application revision is actually running and that the service is healthy.

---

## 11. Current Hardened Deployment Verification

The original Milestone 4 pipeline relied on the ECS deployment action waiting for service stability.

Later testing exposed a case where the action reported a failure during a transient ECS deployment state even though the service eventually became healthy.

The workflow was therefore hardened.

The current verification sequence is:

```text
Deploy new task definition
        ↓
ECS deployment action starts rollout
        ↓
independent aws ecs wait services-stable
        ↓
verify active task image = current Git SHA
        ↓
verify desired == running
        ↓
verify pending == 0
        ↓
discover CloudFront distribution
        ↓
verify public /health
```

This is a stronger validation model because pipeline success now depends on the final AWS state rather than only one action's transient interpretation of the rollout.

> **Current-state note:** after Milestone 6, public health verification is performed through CloudFront rather than directly through the ALB, because the ALB is intentionally no longer publicly bypassable.

---

## 12. Image Traceability

Each deployment uses the exact Git commit SHA as the Docker image tag.

Conceptually:

```text
Git commit
   ↓
ECR image :<git-sha>
   ↓
ECS task-definition revision
   ↓
running ECS service
```

This makes it possible to identify exactly which source-code revision produced a running container.

Using immutable SHA tags also avoids relying only on a moving tag such as:

```text
dev
```

---

## 13. Terraform / CI/CD Ownership Boundary

Before Milestone 4, Terraform directly controlled the ECS service's task-definition reference.

After GitHub Actions began deploying new revisions, both systems could potentially try to control that property.

The ECS Service lifecycle was therefore updated:

```hcl
lifecycle {
  ignore_changes = [
    desired_count,
    task_definition
  ]
}
```

Ownership is now:

```text
desired_count
→ Application Auto Scaling

task_definition
→ GitHub Actions

ECS infrastructure
→ Terraform
```

This prevents a later Terraform apply from rolling the application back to Terraform's older task-definition revision.

---

## 14. Sandbox Rebuild and Deployment Separation

The AWS training sandbox periodically removes resources.

Terraform can recreate infrastructure such as:

- ECR repository
- ECS cluster
- ECS service
- ALB
- IAM resources

But a recreated ECR repository is empty.

Milestone 4 solved the artifact-restoration gap:

```text
HCP Terraform
→ recreate infrastructure

GitHub Actions
→ rebuild/push image
→ redeploy application
```

This separation later became part of the automated morning recovery workflow.

For the complete operational recovery design, see:

[OP01 — Automated Morning Sandbox Recovery](../operations/OP01-automated-morning-sandbox-recovery.md)

---

## 15. Validation

Milestone 4 proved:

- [x] GitHub Actions workflow created
- [x] push-based application deployment
- [x] manual workflow dispatch
- [x] GitHub OIDC provider configured
- [x] temporary AWS credentials issued
- [x] no long-lived AWS deployment keys stored in GitHub
- [x] repository-specific trust
- [x] branch-specific trust
- [x] immutable GitHub owner/repository identity
- [x] Docker image built automatically
- [x] Git-SHA image tagging
- [x] automated ECR push
- [x] new ECS task-definition revision registered
- [x] rolling ECS deployment
- [x] service reaches stable state
- [x] deployed task image verified against Git SHA
- [x] desired and running task counts verified
- [x] pending task count verified as zero
- [x] public health endpoint verified
- [x] Terraform / CI ownership separated
- [x] Auto Scaling ownership preserved

---

## 16. Problems and Solutions

### OIDC role assumption failed

Error:

```text
Not authorized to perform sts:AssumeRoleWithWebIdentity
```

**Cause:** the IAM role trust policy did not match GitHub's immutable OIDC subject format.

**Fix:** use the immutable owner ID, repository ID and `main` branch in the `sub` condition.

**Lesson:** OIDC troubleshooting requires checking the provider, `aud`, `sub`, role ARN, repository identity and branch identity together.

### Terraform could revert GitHub deployments

Once CI/CD began creating new task-definition revisions, Terraform's original service configuration could potentially restore an older revision.

**Fix:** add `task_definition` to the ECS Service `ignore_changes` list.

**Lesson:** infrastructure automation and application deployment require a clear ownership model.

### Deployment action reported a transient failure

A later deployment showed that the ECS deployment action could report failure during a transient rollout condition even though ECS eventually recovered to a healthy state.

**Fix:** start the rollout without relying solely on the action's built-in stability result, then independently wait for ECS stability and verify the deployed image, task counts and public health.

**Lesson:** production-style deployment validation should check the final system state.

---

## 17. Security Decisions

### OIDC instead of static AWS keys

Selected:

```text
GitHub OIDC
→ AWS STS
→ short-lived credentials
```

instead of:

```text
long-lived AWS access keys
→ GitHub Secrets
```

Benefits include:

- no permanent deployment credential stored in GitHub
- short-lived AWS credentials
- repository-specific trust
- branch-specific trust
- better auditability

### Least privilege

The deployment role is limited to the ECR, ECS and PassRole actions required for deployment.

### Private ECS architecture remains unchanged

CI/CD changes the application revision, not the network design.

Fargate tasks remain:

- in private application subnets
- without public IPs
- reachable through the controlled load-balancing path

---

## 18. What I Learned

Milestone 4 gave me practical experience with:

- GitHub Actions
- CI/CD workflow design
- GitHub OIDC
- AWS STS federation
- IAM trust policies
- immutable GitHub identities
- least-privilege deployment permissions
- ECR automation
- immutable image tagging
- ECS rolling deployments
- task-definition revisions
- deployment traceability
- final-state deployment verification
- Terraform lifecycle rules
- ownership boundaries between Terraform, CI/CD and Auto Scaling

A major lesson was that CI/CD is not only a YAML workflow. Identity, authorization, deployment ownership and validation are equally important parts of the design.

---

## 19. Result

Before Milestone 4:

```text
Developer
   ↓
manual Docker build
   ↓
manual ECR login / push
   ↓
manual ECS deployment
```

After Milestone 4:

```text
Application change
   ↓
git push main
   ↓
GitHub Actions
   ↓
OIDC authentication
   ↓
Docker build
   ↓
Git-SHA image
   ↓
Amazon ECR
   ↓
new ECS task-definition revision
   ↓
rolling Fargate deployment
   ↓
independent deployment validation
   ↓
healthy service
```

The deployment process became:

- automated
- traceable
- repeatable
- credential-safe
- compatible with Terraform
- compatible with ECS Auto Scaling

This prepared the platform for **Milestone 5 — Database & Storage**.

---

## Interview / Presentation Summary

> I automated the LangNation ECS deployment with GitHub Actions. GitHub authenticates to AWS through OIDC, so I do not store long-lived AWS access keys in the repository. The IAM trust relationship is restricted to the immutable GitHub repository identity and the main branch. On an application change, the workflow builds a Docker image, tags it with the Git commit SHA, pushes it to Amazon ECR, registers a new ECS task-definition revision and performs a rolling Fargate deployment. I also separated ownership so Terraform manages the infrastructure, GitHub Actions owns the live task-definition revision, and Application Auto Scaling owns the desired task count. The current hardened workflow independently waits for ECS stability, verifies the exact deployed image SHA and task counts, and finally checks the public health endpoint.
