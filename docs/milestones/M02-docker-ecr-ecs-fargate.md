# LangNation Cloud Platform
## Milestone 2 — Docker, Amazon ECR & ECS Fargate

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS
**Course:** AWS Cloud Computing with AI Bootcamp
**Environment:** Development (`dev`)
**AWS Region:** `us-east-1`
**Infrastructure as Code:** Terraform
**Container Runtime:** Docker
**Container Registry:** Amazon ECR
**Container Orchestration:** Amazon ECS on AWS Fargate
**Remote State / Authoritative Plan & Apply:** HCP Terraform
**Status:** ✅ Complete

---

## 1. Objective

Milestone 2 moved the project from a network-only environment to a running containerized application on AWS.

The goal was to prove the complete path from source code to a private Fargate workload:

```text
Node.js application
        ↓
Docker image
        ↓
Amazon ECR
        ↓
ECS task definition
        ↓
ECS service
        ↓
AWS Fargate
        ↓
Private application subnets
        ↓
CloudWatch Logs
```

The milestone introduced:

- a small Node.js / Express LangNation API
- Docker packaging and local container testing
- a private Amazon ECR repository
- an ECS Fargate cluster
- an ECS task execution IAM role
- CloudWatch logging
- an ECS task definition
- a Terraform-managed ECS service
- private task networking with no public IP
- desired-state recovery / basic self-healing
- repeatable rebuilds after sandbox cleanup

---

## 2. Architecture Design

### My Excalidraw Design Sketch

I first recreated the container flow in Excalidraw to understand the relationship between the application, Docker, ECR, ECS task definitions, the ECS service and Fargate tasks.

![Milestone 2 design sketch](../architecture/milestones/m02/design-sketch.png)

### Final Milestone Architecture

![Milestone 2 final architecture](../architecture/milestones/m02/milestone-architecture.png)

### Platform Design After Milestone 2

This cumulative view shows how the container platform builds on top of the Milestone 1 network foundation.

![Milestone 2 cumulative design sketch](../architecture/milestones/m02/design-sketch-platform.png)

![Platform after Milestone 2](../architecture/milestones/m02/platform-after-m02.png)

---

## 3. Application

A small controlled Node.js / Express API was created for the capstone rather than immediately deploying the full LangNation production application.

This kept the milestone focused on containerization and AWS runtime architecture.

### Application structure

```text
application/
├── .dockerignore
├── Dockerfile
├── package-lock.json
├── package.json
└── server.js
```

### Endpoints

```text
GET /
GET /health
```

Example health response:

```json
{
  "status": "healthy"
}
```

The application listens on:

```text
0.0.0.0:3000
```

Binding to `0.0.0.0` allows the process to receive traffic through the container network interface.

---

## 4. Docker

### Dockerfile

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["npm", "start"]
```

### Design decisions

- `node:22-alpine` keeps the base image relatively small
- `npm ci` installs versions from the lock file
- `--omit=dev` avoids unnecessary development dependencies
- `USER node` avoids running the application as root
- port `3000` is explicitly documented
- `NODE_ENV=production` is set inside the container

### `.dockerignore`

```text
node_modules
npm-debug.log
.git
.gitignore
.env*
```

This reduces the build context and helps prevent local dependencies, Git metadata and environment files from being copied into the image.

---

## 5. Amazon ECR

Repository:

```text
langnation-cloud-platform-dev-app
```

Repository URI:

```text
881893827142.dkr.ecr.us-east-1.amazonaws.com/langnation-cloud-platform-dev-app
```

Configuration used during the milestone:

```text
Tag mutability: MUTABLE
Scan on push: enabled
Encryption: AES-256
```

The first application image was tagged:

```text
dev
```

A key lesson from the nightly sandbox cleanup was that Terraform can recreate the **ECR repository**, but not the Docker image stored inside it.

That distinction later became one of the reasons for automating application deployment separately from infrastructure provisioning.

---

## 6. ECS Fargate Platform

### ECS cluster

```text
langnation-cloud-platform-dev-cluster
```

Configuration:

```text
Launch model: AWS Fargate
Container Insights: Enabled
```

### Task execution role

```text
langnation-cloud-platform-dev-ecs-task-execution-role
```

The execution role is used by ECS/Fargate to:

- pull the image from ECR
- publish container logs to CloudWatch
- perform startup operations required by the task

Important distinction:

```text
Execution Role
→ used by ECS/Fargate

Task Role
→ used by the application itself when calling AWS APIs
```

### CloudWatch log group

```text
/ecs/langnation-cloud-platform-dev-app
```

Retention:

```text
7 days
```

### Task definition

Family:

```text
langnation-cloud-platform-dev-app
```

Runtime configuration:

```text
Launch compatibility: FARGATE
Network mode: awsvpc
CPU: 256
Memory: 512 MiB
Container: langnation-app
Container port: 3000
Logging: awslogs
```

`awsvpc` gives each Fargate task its own network interface inside the VPC.

---

## 7. ECS Service and Private Networking

The service runs the application inside the two private application subnets created in Milestone 1:

```text
10.0.11.0/24
10.0.12.0/24
```

Tasks use:

```text
Public IP: disabled
Security Group: ECS security group
```

Therefore, the application workload itself is not directly internet-facing.

Outbound traffic follows the private application route:

```text
Fargate Task
    ↓
Private App Route Table
    ↓
same-AZ NAT Gateway
    ↓
AWS services / public package endpoints
```

During Milestone 2, the ECS service was initially introduced with a desired count of one to validate service behavior and self-healing.

> **Current-state note:** Milestone 3 later changed the service baseline to two tasks across both Availability Zones and added ALB health checks and Auto Scaling with a minimum of 2 and maximum of 4 tasks.

---

## 8. Terraform Structure

Milestone 2 introduced the reusable container module:

```text
terraform/
└── modules/
    └── container/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

The module manages:

- Amazon ECR
- ECS cluster
- ECS task execution role
- IAM policy attachment
- CloudWatch log group
- ECS task definition
- ECS service

The module consumes subnet IDs and security-group IDs from the earlier Terraform modules instead of hardcoding AWS-generated IDs.

---

## 9. Implementation Summary

### Application and Docker

1. created the Node.js / Express application
2. verified `/` and `/health` locally
3. created `Dockerfile` and `.dockerignore`
4. built the image locally
5. ran the container with `3000:3000`
6. verified the application and container logs locally

### ECR

7. created the ECR repository with Terraform
8. authenticated Docker to ECR
9. tagged the local image
10. pushed the image to ECR
11. verified the tag and digest in AWS

### ECS / Fargate

12. created the ECS cluster
13. enabled Container Insights
14. created the ECS task execution role
15. created the CloudWatch log group
16. created the Fargate task definition
17. ran the first Fargate task in a private application subnet
18. verified no public IP was assigned
19. verified the application startup logs in CloudWatch
20. created the Terraform-managed ECS service
21. stopped the running service task intentionally
22. verified that ECS automatically created a replacement task

---

## 10. Useful Commands

### Local application

```powershell
npm install
npm start
curl http://localhost:3000/
curl http://localhost:3000/health
```

### Docker

```powershell
docker build -t langnation-app:dev .
docker run -d --name langnation-app-dev -p 3000:3000 langnation-app:dev
docker ps
docker logs langnation-app-dev
```

### ECR authentication

```powershell
aws ecr get-login-password --region us-east-1 |
docker login --username AWS --password-stdin 881893827142.dkr.ecr.us-east-1.amazonaws.com
```

### Tag and push

```powershell
docker tag langnation-app:dev `
881893827142.dkr.ecr.us-east-1.amazonaws.com/langnation-cloud-platform-dev-app:dev

docker push `
881893827142.dkr.ecr.us-east-1.amazonaws.com/langnation-cloud-platform-dev-app:dev
```

### Terraform validation

```powershell
terraform init
terraform fmt -recursive
terraform validate
```

HCP Terraform remained authoritative for:

```text
plan
apply
state
```

---

## 11. Validation

The milestone was validated at each layer.

### Application

- [x] Node.js application runs locally
- [x] `/` responds successfully
- [x] `/health` responds successfully

### Docker

- [x] Docker image builds
- [x] container runs locally
- [x] port mapping works
- [x] container logs are visible
- [x] container runs as the non-root `node` user

### ECR

- [x] ECR repository exists
- [x] Docker authentication succeeds
- [x] image pushes successfully
- [x] image tag and digest verified

### ECS / Fargate

- [x] ECS cluster is active
- [x] Container Insights enabled
- [x] task execution role created
- [x] CloudWatch log group created
- [x] Fargate task definition created
- [x] CPU and memory configuration verified
- [x] task runs in private application subnet
- [x] task has no public IP
- [x] application startup visible in CloudWatch
- [x] ECS service created successfully
- [x] desired-state task replacement tested successfully

### Reproducibility

- [x] infrastructure recreated after nightly sandbox cleanup
- [x] ECR repository recreated with Terraform
- [x] image artifact repushed separately

---

## 12. Problems and Solutions

### Docker Linux engine would not start

The first Docker build failed because Docker Desktop could not start the Linux container engine.

The error referenced:

```text
dockerDesktopLinuxEngine
```

Docker Desktop then reported that WSL was unavailable.

**Fix:**

```powershell
wsl --install
```

After WSL 2 and Ubuntu were configured, Docker Desktop could run Linux containers successfully.

### ECR image disappeared after sandbox cleanup

Terraform recreated the ECR repository, but the container image itself was gone.

**Solution:** authenticate to the recreated repository and push the Docker image again.

**Lesson:**

> Infrastructure provisioning and application artifact deployment are separate automation concerns.

This gap was later solved through GitHub Actions in Milestone 4.

### ECS task health showed `Unknown`

At this stage there was no ALB target-group health check yet.

The application already exposed:

```text
/health
```

Milestone 3 connected that endpoint to the ALB target group.

---

## 13. Security Decisions

- Fargate tasks run in private application subnets
- tasks receive no public IP
- the ECS security group is reused from Milestone 1
- the container runs as the non-root `node` user
- `.env` files are excluded from the build context
- the execution role is separated from future application task permissions
- container logs are centralized in CloudWatch

These decisions kept the compute layer private while still allowing controlled outbound access through NAT.

---

## 14. Cost and Operational Decisions

The initial development task used:

```text
0.25 vCPU
512 MiB memory
```

This kept the Fargate footprint small while still providing enough capacity for the capstone API.

CloudWatch log retention was limited to seven days.

The training sandbox also removes resources regularly, so reproducible infrastructure was more important than manually preserving individual runtime resources.

---

## 15. What I Learned

This milestone gave me practical experience with:

- Docker image creation
- local container testing
- Docker Desktop and WSL 2
- Amazon ECR
- image tags and image digests
- ECS clusters
- ECS task definitions
- ECS services
- AWS Fargate
- `awsvpc` networking
- ECS execution roles
- CloudWatch Logs
- Container Insights
- private subnet deployment
- service desired state
- task replacement / self-healing
- separation of infrastructure and deployment automation

One of the most useful lessons was understanding the difference between these ECS concepts:

```text
Cluster
Task Definition
Task
Service
```

They are related, but each solves a different problem.

---

## 16. Result

Milestone 2 produced a working private container platform:

```text
Source Code
    ↓
Docker Image
    ↓
Amazon ECR
    ↓
ECS Task Definition
    ↓
ECS Service
    ↓
AWS Fargate
    ↓
Private Application Subnets
    ↓
CloudWatch Logs
```

The project now had:

- containerized application delivery
- private managed compute
- centralized logs
- IAM-based task startup
- desired-state management
- automatic task replacement
- Terraform-managed infrastructure

This platform became the basis for **Milestone 3 — Application Load Balancer, Multi-AZ & Auto Scaling**.

---

## Interview / Presentation Summary

> I containerized a small LangNation Node.js API with Docker, tested it locally and pushed the image to a Terraform-managed Amazon ECR repository. I then built an ECS Fargate platform with a cluster, task execution role, CloudWatch logging, task definition and ECS service. The tasks run in private application subnets with no public IP. I also tested ECS desired-state management by deliberately stopping the running service task and confirming that ECS launched a replacement automatically. One important operational lesson was that Terraform can recreate the ECR repository after the sandbox cleanup, but the Docker image is an application artifact and must be rebuilt or repushed separately. That later became part of the automated CI/CD workflow.
