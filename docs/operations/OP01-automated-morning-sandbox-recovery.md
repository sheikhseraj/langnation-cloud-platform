# LangNation Cloud Platform
## OP01 — Automated Morning Sandbox Recovery

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS<br>
**Author:** Seraj Ahmad Siddiqui<br>
**Course:** AWS Cloud Computing with AI Bootcamp<br>
**Document Type:** Operations Automation<br>
**Scope:** Automated recovery after manual activation of the disposable development environment<br>
**Environment:** Development (`dev`)<br>
**Primary Schedule:** 07:37 Europe/Berlin<br>
**Fallback Schedule:** 08:17 Europe/Berlin<br>
**Status:** ✅ Implemented and manually validated end to end

---

## 1. Problem

The AWS training sandbox regularly removes the project infrastructure overnight.

That creates two separate recovery problems:

```text
Infrastructure disappears
        +
application artifacts disappear
        +
CloudFront endpoint can change
```

Terraform can recreate AWS resources, but Terraform alone does not restore:

```text
the Docker image into a newly recreated ECR repository
+
the sanitized LangNation MariaDB dataset
+
the live ECS application revision
+
the public DNS target for the recreated CloudFront distribution
```

The public DNS record also needs to follow the newly recreated CloudFront distribution.

The goal of OP01 is therefore to automate the complete recovery sequence after the training sandbox has been activated: infrastructure rebuild, sanitized database restore, application redeployment, CloudFront discovery, Route 53 synchronization and public health validation.

### Operational prerequisite

The **neue-fische training sandbox must be activated manually** before AWS API access is available. GitHub Actions and HCP Terraform cannot activate the educational sandbox itself.

Once the sandbox has issued an active AWS session, OP01 automates the remaining recovery steps: infrastructure rebuild, application deployment, CloudFront discovery, Route 53 synchronization and public health validation.

---

## 2. Recovery Design

### My Recovery Design Sketch

![Morning sandbox recovery design sketch](../architecture/flows/morning-sandbox-recovery-design-sketch.png)

### Final Recovery Flow

![Morning sandbox recovery](../architecture/flows/morning-sandbox-recovery.png)

The complete recovery path is:

```text
Manual prerequisite: activate neue-fische training sandbox
        ↓
Active AWS session available
        ↓
07:37 primary schedule or manual workflow_dispatch
        ↓
GitHub Actions Morning Sandbox Recovery
        ↓
HCP Terraform API
        ↓
Dedicated Terraform plan + auto-apply recovery run
        ↓
AWS infrastructure recreated
        ↓
Build database-restore image
        ↓
Push restore image to Amazon ECR
        ↓
Run one-off ECS Fargate database-restore task
        ↓
Read RDS credentials from AWS Secrets Manager
        ↓
Restore sanitized LangNation MariaDB seed
        ↓
Validate expected 58 tables
        ↓
Reusable application deployment workflow
        ↓
Build Git-SHA-tagged LangNation image
        ↓
Push image to Amazon ECR
        ↓
Register ECS task-definition revision
        ↓
Update ECS service and wait for stability
        ↓
Read recreated CloudFront domain from HCP Terraform outputs
        ↓
Assume restricted personal-AWS Route 53 OIDC role
        ↓
UPSERT cloud.namienterprises.in
        ↓
Wait for Route 53 INSYNC
        ↓
Verify https://cloud.namienterprises.in/health
        ↓
HTTP 200
```

A second schedule at **08:17 Europe/Berlin** acts as a fallback.

---

## 3. Why Two Scheduled Runs?

Scheduled GitHub workflows are useful but should not be treated like a guaranteed real-time scheduler.

The recovery design therefore uses:

```text
07:37 Europe/Berlin
→ primary recovery run

08:17 Europe/Berlin
→ fallback check
```

The primary run performs the recovery workflow **only when the training sandbox session is active**. The schedules trigger GitHub Actions, but they do not activate the neue-fische sandbox. If the sandbox is inactive, AWS API calls cannot proceed and the recovery must be rerun after manual sandbox activation.

The fallback first checks:

```text
https://cloud.namienterprises.in/health
```

If the endpoint is already healthy:

```text
fallback
→ skip duplicate rebuild
```

If it is not healthy:

```text
fallback
→ run the complete recovery
```

This provides a second opportunity for automatic recovery without rebuilding an already healthy environment.

---

## 4. Workflow Entry Points

The workflow supports:

```text
scheduled primary run
scheduled fallback run
manual workflow_dispatch
```

`workflow_dispatch` is important because the complete recovery process can be tested without waiting for the next scheduled morning.

---

## 5. Recovery Ownership

The automation deliberately separates responsibilities.

```text
HCP Terraform
→ infrastructure

GitHub Actions recovery workflow
→ database-restore image
→ one-off ECS Fargate restore task
→ sanitized MariaDB restore
→ 58-table validation

GitHub Actions deploy workflow
→ Docker image
→ ECR push
→ ECS application revision

Application Auto Scaling
→ live ECS desired task count

Route 53 synchronization step
→ public DNS destination
```

This avoids one automation system trying to control state owned by another.

---

## 6. HCP Terraform Recovery

The morning workflow calls the HCP Terraform API and creates a dedicated run.

For this recovery run:

```text
auto-apply = true
```

This is intentionally different from normal infrastructure development.

Normal HCP Terraform behavior remains:

```text
global auto-apply = OFF
```

So routine infrastructure changes still require review, while the known morning rebuild path can proceed automatically.

The workflow polls the HCP Terraform run until it reaches a final state.

A successful infrastructure phase means the disposable sandbox resources have been recreated before application deployment begins.

---

## 7. Why the Workflow Is Chained

The recovery is dependency-driven rather than timer-driven.

Correct design:

```text
Terraform starts
    ↓
Terraform finishes successfully
    ↓
application deployment starts
```

A weaker design would use unrelated timers:

```text
Timer A → Terraform
Timer B → application deployment
```

That would introduce a race condition because services such as RDS, ECS, the ALB or CloudFront may take different amounts of time to become ready on different rebuilds.

The chained workflow starts the next stage only after the required previous stage succeeds.

---

## 8. Database Recovery

After Terraform recreates Amazon RDS, the database infrastructure exists but the sanitized LangNation application dataset must still be restored.

The recovery workflow therefore performs a dedicated database-restore stage before application redeployment.

Recovery path:

```text
Terraform recreates RDS
        ↓
build database-restore Docker image
        ↓
push restore image to dedicated Amazon ECR repository
        ↓
launch one-off ECS Fargate restore task
        ↓
read RDS credentials from AWS Secrets Manager
        ↓
restore database/seed/langnation-capstone-sanitized.sql
        ↓
validate expected 58 tables
```

The restore task runs inside the private application network and reaches the private MariaDB database over the existing ECS-to-database security-group path.

Database credentials are not stored in GitHub, the Docker image or the repository. The task receives the current RDS-managed credentials through AWS Secrets Manager.

The restore task is intentionally one-off rather than a permanently running service because it is required only during environment recovery.

The application deployment stage begins only after the database restore succeeds.

---

## 9. Application Recovery

After Terraform recreates the infrastructure, ECR exists again but is empty.

The reusable deployment workflow restores the application by:

1. checking out the repository;
2. authenticating to AWS through GitHub OIDC;
3. logging in to ECR;
4. building the Docker image;
5. tagging the image with the Git commit SHA;
6. pushing the image to ECR;
7. registering a new ECS task-definition revision;
8. updating the ECS service;
9. waiting independently for ECS stability;
10. verifying the deployed image matches the triggering Git SHA;
11. verifying the service task counts;
12. verifying the application through the protected public edge.

This demonstrates the difference between:

```text
Infrastructure recovery
and
application artifact recovery
```

---

## 10. Deployment Validation

The current deployment workflow does not rely only on one ECS deployment action result.

The final checks include:

```text
aws ecs wait services-stable
        ↓
active task image = current Git SHA
        ↓
desired == running
        ↓
pending == 0
        ↓
public /health succeeds
```

After Milestone 6, the public health check is performed through:

```text
Route 53
→ CloudFront
→ WAF
→ ALB
→ ECS
```

rather than by calling the ALB directly.

---

## 11. Persistent DNS

The public hostname is:

```text
cloud.namienterprises.in
```

The Route 53 hosted zone is intentionally kept in a persistent personal AWS account, while the application infrastructure lives in the disposable training sandbox.

The architecture principle is:

> **Persistent DNS + disposable infrastructure**

When Terraform recreates CloudFront, the CloudFront domain name can change.

The workflow therefore reads the current:

```text
cloudfront_domain_name
```

from HCP Terraform outputs and updates Route 53 automatically.

---

## 12. Cross-Account Route 53 Authentication

GitHub Actions uses a separate OIDC role in the personal AWS account.

The role is limited to the DNS operations required for the hosted zone, including:

```text
route53:ChangeResourceRecordSets
route53:ListResourceRecordSets
route53:GetChange
```

No long-lived personal AWS access key or secret key is stored in GitHub.

The DNS phase performs:

```text
GitHub OIDC
    ↓
personal AWS Route 53 role
    ↓
UPSERT cloud.namienterprises.in
    ↓
wait for INSYNC
```

The CNAME uses a short TTL so the hostname can follow rebuilt CloudFront infrastructure quickly.

---

## 13. End-to-End Recovery Flow

```text
Nightly sandbox cleanup
        ↓
AWS workload resources disappear
        ↓
Manual: activate neue-fische training sandbox
        ↓
Active AWS session available

07:37 Europe/Berlin or manual workflow_dispatch
        ↓
Primary GitHub recovery run
        ↓
HCP Terraform rebuild
        ↓
ECR / ECS / ALB / CloudFront / RDS / other resources recreated
        ↓
Database-restore image built and pushed to ECR
        ↓
One-off ECS Fargate restore task
        ↓
Sanitized MariaDB database restored
        ↓
58 tables validated
        ↓
Application deployment workflow
        ↓
Git-SHA Docker image pushed
        ↓
ECS service becomes stable
        ↓
CloudFront domain read from HCP Terraform outputs
        ↓
Route 53 CNAME updated
        ↓
Route 53 reports INSYNC
        ↓
https://cloud.namienterprises.in/health
        ↓
HTTP 200
```

Fallback:

```text
08:17 Europe/Berlin
        ↓
check public /health
        ↓
healthy?
 ┌──────┴──────┐
 yes           no
 ↓              ↓
skip       full recovery
```

---

## 14. Manual End-to-End Validation

The complete recovery workflow was tested manually with `workflow_dispatch`. Before the training sandbox was activated, HCP Terraform received explicit-deny errors on AWS read operations. After the sandbox was activated, the same recovery path completed successfully.

This validates an important boundary: **sandbox activation is manual; recovery after activation is automated.**

Validated stages:

```text
Check Whether Recovery Is Needed         PASS
Rebuild AWS Infrastructure               PASS
Restore Sanitized LangNation Database     PASS
Restore LangNation Application            PASS
Sync Persistent Route 53 DNS              PASS
```

The final public health check also succeeded.

This confirms that the full chain can recover the environment without manually rebuilding resources in the AWS Console.

Additional real scheduled runs can still be recorded as operational evidence, but they are not required to prove that the implemented workflow works end to end.

---

## 15. Security Decisions

### GitHub OIDC instead of static credentials

Both AWS trust paths use temporary credentials:

```text
GitHub
→ training AWS account

GitHub
→ personal AWS account
```

No long-lived AWS deployment credentials are stored in the repository.

### Auto-apply isolated to recovery

The normal HCP Terraform workspace keeps global auto-apply disabled.

Only the known API-created morning recovery run requests automatic apply.

### Least-privilege DNS role

The personal-account role is limited to the Route 53 operations needed for DNS synchronization.

### Public validation through CloudFront

The automation validates the application through the same protected edge path used by real clients.

It does not bypass WAF by health-checking the ALB directly.

---

## 16. Reliability Decisions

The recovery workflow includes several reliability controls:

- primary and fallback schedules
- fallback health check to avoid duplicate work
- chained stages instead of independent timers
- HCP Terraform status polling
- one-off database restore before application deployment
- 58-table database validation
- reusable application deployment workflow
- independent ECS stability validation
- exact Git-SHA deployment verification
- desired/running/pending count checks
- Route 53 `INSYNC` wait
- final HTTPS health retries

A workflow is considered successful only when the public application is actually reachable and healthy.

---

## 17. Troubleshooting and Improvements

### Scheduled run did not execute as expected

An earlier single scheduled run was not observed at the expected time.

**Improvement:** use a primary schedule plus a later fallback rather than depending on a single scheduled execution.

### Terraform recreated ECR but not the image

Terraform correctly recreated the registry, but the Docker image was missing.

**Improvement:** automatically invoke the application deployment workflow after infrastructure recovery.

### CloudFront domain changes after rebuild

A static DNS target would become stale after the sandbox recreates CloudFront.

**Improvement:** read the current CloudFront domain from Terraform outputs and synchronize Route 53 automatically.

### Direct ALB health validation no longer worked after security hardening

Milestone 6 restricted ALB ingress to CloudFront origin-facing addresses.

**Improvement:** validate `/health` through `cloud.namienterprises.in`, which exercises the actual protected request path.

### ECS deployment action could report a transient failure

A deployment action once reported failure even though ECS later converged successfully.

**Improvement:** independently wait for service stability and validate the actual deployed image, task counts and public health.

---

## 18. What I Learned

OP01 gave me practical experience with:

- recovery automation
- one-off ECS Fargate database restoration
- Secrets Manager integration during recovery
- HCP Terraform API runs
- controlled auto-apply
- GitHub Actions reusable workflows
- dependency-driven orchestration
- OIDC across multiple AWS accounts
- dynamic Terraform output retrieval
- Route 53 automation
- DNS convergence checks
- deployment final-state validation
- designing for ephemeral infrastructure

The biggest lesson was that reproducibility must cover more than Terraform resources.

A complete recovery design also needs to restore:

```text
application artifacts
+
runtime deployment state
+
external DNS dependencies
```

---

## 19. Result

Before OP01:

```text
Morning
  ↓
manually rebuild infrastructure
  ↓
manually restore database
  ↓
manually restore Docker image
  ↓
manually redeploy application
  ↓
manually repair public DNS
```

After OP01:

```text
Manual: activate training sandbox
        ↓
active AWS session
        ↓
07:37 primary or manual trigger
        ↓
automatic infrastructure recovery
        ↓
automatic sanitized database recovery
        ↓
automatic application recovery
        ↓
automatic CloudFront discovery
        ↓
automatic Route 53 synchronization
        ↓
automatic public HTTPS validation

08:17 fallback
        ↓
health check
        ↓
recover only if needed
```

After the training sandbox is manually activated, the disposable environment can be recovered as one coordinated operational workflow.

---

## 20. Related Evidence

Operational evidence for the recovery design is maintained separately from this runbook.

Relevant locations:

```text
docs/architecture/flows/morning-sandbox-recovery.png
docs/evidence/M06-validation-evidence.md
docs/evidence/screenshots/
```

The architecture diagram explains the recovery sequence, while evidence files and screenshots prove that the workflow and its dependent services behaved as expected.

---

## Presentation Summary

> My AWS training sandbox removes resources overnight, while the educational sandbox itself still has to be activated manually before AWS API access is available. Once the session is active, OP01 coordinates the remaining recovery process. A primary GitHub Actions run is scheduled for 07:37 Europe/Berlin, with an 08:17 fallback that first checks whether the public endpoint is already healthy. The workflow calls the HCP Terraform API to recreate the disposable infrastructure through a dedicated recovery run, then builds a database-restore image, launches a one-off ECS Fargate restore task, reads the current RDS credentials from Secrets Manager, restores the sanitized LangNation MariaDB dataset and validates the expected 58 tables. It then invokes the reusable application deployment workflow to build the Git-SHA-tagged image, push it to ECR, update ECS and verify service stability. Finally, the workflow reads the recreated CloudFront domain from HCP Terraform outputs, assumes a least-privilege Route 53 role in the persistent personal AWS account through GitHub OIDC, updates `cloud.namienterprises.in`, waits for `INSYNC` and verifies the public HTTPS `/health` endpoint. Normal Terraform development still keeps global auto-apply disabled; automated apply is isolated to the known recovery path.
