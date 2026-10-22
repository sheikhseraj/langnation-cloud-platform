# LangNation Cloud Platform
## Milestone 7 — Serverless & Event-Driven Processing

**Project:** LangNation Cloud Platform — Secure, Highly Available, Containerized Learning Platform with AI/RAG on AWS  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** Development (`dev`)  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform  
**Relevant Technologies / Services:** Amazon S3, Amazon EventBridge, Amazon SQS, AWS Lambda, Amazon CloudWatch Logs, IAM, Dead Letter Queue, HCP Terraform  
**Remote State / Authoritative Plan & Apply:** HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 7 introduced the serverless, event-driven processing foundation that would later support the LangNation RAG ingestion pipeline.

The goal was to react automatically when a new object is created in the existing private S3 bucket and process the event asynchronously through a resilient queue-based architecture.

The implemented success path is:

```text
Amazon S3
   ↓ Object Created
Amazon EventBridge
   ↓
Amazon SQS
   ↓
AWS Lambda
   ↓
CloudWatch Logs
```

Failure handling is:

```text
SQS
 ↓
Lambda processing failure
 ↓
retry
 ↓
retry
 ↓
retry
 ↓
Dead Letter Queue
```

Milestone 7 intentionally stops at event-processing validation.

It does **not** yet perform:

- document retrieval from S3
- text extraction
- document chunking
- embeddings
- vector storage
- Bedrock RAG

Those capabilities are introduced in Milestone 8.

---

## 2. Architecture Design

### My Excalidraw Design Sketch

The Milestone 7 design sketch should show how S3 events are routed through EventBridge into SQS and then consumed by Lambda, including the retry and DLQ path.

![Milestone 7 design sketch](../architecture/milestones/m07/design-sketch.png)

### Final Milestone Architecture

The final milestone architecture should present the serverless event-processing pipeline in a clean implementation view.

![Milestone 7 final architecture](../architecture/milestones/m07/milestone-architecture.png)

### Platform Design After Milestone 7

This cumulative view should show how the event-driven processing layer extends the existing M1–M6 platform.

![Milestone 7 cumulative design sketch](../architecture/milestones/m07/design-sketch-platform.png)

![Platform after Milestone 7](../architecture/milestones/m07/platform-after-m07.png)

---

## 3. Event-Driven Architecture

The Milestone 7 event-processing flow is:

```text
Private S3 storage bucket
        ↓ Object Created
Amazon EventBridge
        ↓ filtered event
Amazon SQS
        ↓ buffered message
AWS Lambda
        ↓
CloudWatch Logs
```

The failure path is:

```text
SQS message
    ↓
Lambda processing failure
    ↓
message becomes visible again
    ↓
retry
    ↓
retry
    ↓
retry
    ↓
Dead Letter Queue
```

This architecture separates event generation from event processing.

The main benefit is decoupling:

```text
S3
→ produces events

EventBridge
→ filters and routes events

SQS
→ buffers events

Lambda
→ processes events

DLQ
→ preserves repeatedly failing events
```

---

## 4. Amazon EventBridge Routing

EventBridge filters S3 object-created events before they are sent to SQS.

The implemented rule matches:

```text
source      = aws.s3
detail-type = Object Created
bucket      = LangNation private storage bucket
```

This prevents the queue from receiving unrelated events.

The routing path is:

```text
S3 Object Created
        ↓
EventBridge rule matches event
        ↓
EventBridge target
        ↓
SQS document-events queue
```

EventBridge is allowed to send messages only to the intended queue.

The queue policy restricts the sender using the specific EventBridge rule ARN through `aws:SourceArn`.

---

## 5. Amazon SQS and Dead Letter Queue

### Main Queue

```text
langnation-cloud-platform-dev-document-events
```

Configuration:

```text
Message retention:  4 days
Visibility timeout: 180 seconds
Encryption:         SQS-managed SSE
maxReceiveCount:    3
```

### Dead Letter Queue

```text
langnation-cloud-platform-dev-document-events-dlq
```

Configuration:

```text
Message retention: 14 days
Encryption:         SQS-managed SSE
```

A redrive policy sends repeatedly failing messages from the main queue to the DLQ after the configured receive-count threshold.

A redrive allow policy restricts the DLQ so it is used only by the intended document-processing queue.

### Why SQS?

SQS decouples EventBridge from Lambda.

If Lambda fails or is temporarily unavailable:

```text
event
→ remains buffered in SQS
→ becomes available again after visibility timeout
→ can be retried
```

This is more resilient than relying on a direct synchronous processing path.

---

## 6. AWS Lambda Processing

Function:

```text
langnation-cloud-platform-dev-document-processor
```

Runtime configuration:

```text
Runtime:    Python 3.12
Memory:     256 MB
Timeout:    30 seconds
Batch size: 1
```

Milestone 7 Lambda responsibility is intentionally small:

```text
receive SQS record
→ parse embedded EventBridge event
→ extract event type
→ extract event time
→ extract S3 bucket
→ extract S3 object key
→ log metadata to CloudWatch
```

The Lambda code is packaged through Terraform using the `hashicorp/archive` provider.

Batch size is set to one so each event can be observed and validated individually during the learning and testing phase.

---

## 7. CloudWatch Logging

Log group:

```text
/aws/lambda/langnation-cloud-platform-dev-document-processor
```

Retention:

```text
7 days
```

The Lambda logs include:

- SQS record count
- SQS message ID
- EventBridge detail type
- event time
- S3 bucket
- S3 object key
- successful processing
- controlled failures

CloudWatch therefore provides evidence for both the success path and retry / failure behavior.

---

## 8. Least-Privilege IAM

The Lambda role receives only the permissions required for Milestone 7.

### SQS Permissions

```text
sqs:ReceiveMessage
sqs:DeleteMessage
sqs:GetQueueAttributes
```

### CloudWatch Logs Permissions

```text
logs:CreateLogStream
logs:PutLogEvents
```

The Lambda does **not** yet receive:

```text
s3:GetObject
```

because Milestone 7 only processes S3 event metadata.

The permission to read document content is intentionally deferred to Milestone 8, where the function begins working with the actual object data.

EventBridge is also restricted so it can send messages only to the intended SQS queue and only from the configured EventBridge rule.

This keeps the milestone aligned with least-privilege design instead of granting future permissions early.

---

## 9. Terraform Structure

Milestone 7 introduced the reusable event-processing module and Lambda source code:

```text
terraform/
└── modules/
    └── event_processing/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf

lambda/
└── document_processor/
    └── handler.py
```

The development environment connects the event-processing module to the existing storage module using:

```hcl
storage_bucket_name = module.storage.bucket_name
```

The module manages the serverless event-processing resources while the existing storage module continues to own the S3 bucket.

Milestone 7 added:

```text
SQS main queue
SQS Dead Letter Queue
SQS redrive allow policy
SQS queue policy
CloudWatch Lambda log group
Lambda IAM role
Lambda IAM inline policy
Lambda function
Lambda event source mapping
S3 EventBridge notification
EventBridge rule
EventBridge SQS target
```

The Lambda deployment package is created from source rather than treated as a manually maintained artifact.

---

## 10. Implementation Summary

1. created the `event_processing` Terraform module
2. connected it to the existing private S3 storage bucket
3. enabled S3 EventBridge notifications
4. created the EventBridge rule for S3 `Object Created` events
5. created the main SQS document-events queue
6. enabled SQS-managed encryption
7. configured four-day message retention
8. configured a 180-second visibility timeout
9. created the SQS Dead Letter Queue
10. configured 14-day DLQ retention
11. configured the redrive policy with `maxReceiveCount = 3`
12. restricted DLQ use through the redrive allow policy
13. created the EventBridge-to-SQS queue policy
14. created the Lambda execution IAM role
15. granted only the required SQS permissions
16. granted the required CloudWatch Logs permissions
17. created the Python 3.12 Lambda function
18. packaged the Lambda source through Terraform
19. created the Lambda event source mapping
20. configured batch size 1
21. created the seven-day CloudWatch log group
22. implemented metadata logging for S3 events
23. implemented a controlled failure prefix
24. validated the normal event-processing path
25. validated SQS retry timing
26. validated DLQ delivery after repeated failures

---

## 11. Useful Commands

### Terraform Initialization

```powershell
terraform init
```

Initializes the working directory and installs required providers and modules.

### Terraform Formatting

```powershell
terraform fmt -recursive
```

Formats the Terraform configuration consistently.

### Terraform Validation

```powershell
terraform validate
```

Observed result:

```text
Success! The configuration is valid.
```

### Provider Version Control

During this milestone, the project retained:

```text
hashicorp/aws     6.67.0
hashicorp/archive 2.8.1
```

Running:

```powershell
terraform init -upgrade
```

temporarily upgraded the AWS provider.

The lock file was restored so the project remained on the already-tested AWS provider version.

### DLQ Inspection

AWS CLI queue-attribute inspection was used to verify failed-message delivery.

Observed result included:

```json
{
  "Attributes": {
    "ApproximateNumberOfMessages": "2"
  }
}
```

---

## 12. Validation

Milestone 7 was validated at the event-routing, queueing, Lambda, logging and failure-handling layers.

### Event Routing

- [x] S3 Object Created events generated
- [x] S3 sends events through EventBridge
- [x] EventBridge rule matches the intended bucket
- [x] EventBridge sends matching events to SQS

### SQS

- [x] main queue created
- [x] DLQ created
- [x] SQS-managed encryption enabled
- [x] 180-second visibility timeout configured
- [x] `maxReceiveCount = 3`
- [x] redrive policy works
- [x] redrive allow policy configured

### Lambda

- [x] Python 3.12 Lambda created
- [x] SQS event source mapping active
- [x] batch size = 1
- [x] event metadata parsed successfully
- [x] successful processing logged to CloudWatch

### Terraform

- [x] `terraform validate` succeeded
- [x] HCP Terraform plan completed successfully
- [x] HCP Terraform apply completed successfully
- [x] AWS provider remained on validated version `6.67.0`
- [x] archive provider version `2.8.1` used

### Successful Path

A normal S3 upload produced CloudWatch logs similar to:

```text
Received 1 SQS record(s)
detail_type=Object Created
bucket=langnation-cloud-platform-dev-881893827142-storage
object_key=...
Document event processed successfully
```

This validated:

```text
S3 → EventBridge → SQS → Lambda → CloudWatch
```

---

## 13. Controlled Failure Test

The Lambda uses:

```text
FAILURE_TEST_PREFIX=fail/
```

Any S3 object key starting with:

```text
fail/
```

intentionally raises a `RuntimeError`.

Example test object:

```text
fail/m7-test.txt
```

### Initial Event

The failed message entered the main SQS queue and triggered Lambda.

### Retry Behavior

The same SQS message ID was observed three times.

Approximate timing:

```text
Attempt 1 → 13:49
Attempt 2 → 13:52
Attempt 3 → 13:55
```

The approximately three-minute interval matched the configured:

```text
Visibility timeout: 180 seconds
```

### DLQ Delivery

After the configured failed receives, the message moved to the DLQ.

AWS CLI verification showed:

```json
{
  "Attributes": {
    "ApproximateNumberOfMessages": "2"
  }
}
```

Two failed messages existed because the S3 console created both:

```text
fail/
fail/m7-test.txt
```

The zero-byte `fail/` folder-marker object also generated an S3 Object Created event and matched the failure prefix.

The final observed failure path was:

```text
S3 Object Created
        ↓
EventBridge
        ↓
SQS
        ↓
Lambda failure
        ↓
180-second visibility timeout
        ↓
retry
        ↓
retry
        ↓
retry
        ↓
Dead Letter Queue
```

This proved the failure-handling architecture rather than only verifying that the DLQ resource existed.

---

## 14. Problems and Solutions

### Problem 1 — Terraform Provider Was Upgraded Unintentionally

Running:

```powershell
terraform init -upgrade
```

temporarily upgraded the AWS provider.

**Cause:**  
The `-upgrade` option asks Terraform to select newer provider versions allowed by the version constraints.

**Fix:**  
Restore the lock file and continue using the previously validated:

```text
hashicorp/aws 6.67.0
```

**Lesson:**  
Provider upgrades should be intentional and tested rather than introduced casually during a working milestone.

---

### Problem 2 — S3 Console Folder Created an Extra Event

The controlled failure test resulted in two DLQ messages instead of one.

The S3 console had created:

```text
fail/
fail/m7-test.txt
```

**Cause:**  
S3 does not have real folders. The console represents folders as object-key prefixes and can create a zero-byte folder-marker object.

That marker also triggered:

```text
Object Created
```

and matched the configured failure prefix.

**Fix / Interpretation:**  
Recognize both objects as valid events rather than treating the second message as unexplained duplication.

**Lesson:**  
S3 folder behavior is object-key behavior. Event-driven systems react to actual objects, including zero-byte folder markers created by tooling.

---

### Problem 3 — Retries Were Not Immediate

The controlled failure did not retry immediately.

**Cause:**  
The SQS visibility timeout was:

```text
180 seconds
```

After Lambda failed, the message remained temporarily invisible before becoming available for another receive.

**Result:**  
Retries appeared approximately three minutes apart.

**Lesson:**  
SQS visibility timeout directly influences retry timing for Lambda event-source processing.

---

## 15. Security Decisions

### Why EventBridge Filtering?

The EventBridge rule only matches S3 object-created events from the intended LangNation bucket.

This avoids forwarding unrelated account events into the processing queue.

### Why SQS Encryption?

Both the main queue and DLQ use SQS-managed server-side encryption.

This protects queued event data at rest without requiring custom key management for the milestone.

### Why Restrict EventBridge with `aws:SourceArn`?

The queue policy only permits sends from the intended EventBridge rule.

This reduces the risk of unrelated EventBridge rules writing into the queue.

### Why No `s3:GetObject` Yet?

Milestone 7 only needs event metadata.

Granting S3 read permission before it is required would violate the project's least-privilege approach.

The permission is intentionally added in Milestone 8 when Lambda begins reading source documents.

### Why a DLQ?

Repeatedly failing messages should not retry indefinitely.

The DLQ preserves those events for inspection and troubleshooting while allowing the main queue to continue processing other messages.

---

## 16. Cost and Operational Decisions

### Serverless Processing

EventBridge, SQS and Lambda are event-driven services.

The pipeline does not require a permanently running worker instance for document events.

For the capstone workload, this keeps operational overhead low while demonstrating an asynchronous architecture.

### Batch Size 1

The Lambda event source mapping uses:

```text
Batch size: 1
```

This is intentionally simple for the learning environment because:

- each event can be traced individually
- retry behavior is easier to observe
- failures are easier to correlate with SQS message IDs

A larger batch size could improve throughput for a higher-volume production workload.

### Queue Retention

Main queue:

```text
4 days
```

DLQ:

```text
14 days
```

This gives failed messages a longer inspection window than normal buffered messages.

### CloudWatch Retention

Lambda logs are retained for:

```text
7 days
```

This provides enough debugging evidence for the training environment without retaining development logs indefinitely.

### Visibility Timeout

The 180-second visibility timeout is longer than the 30-second Lambda timeout.

This prevents a failed/in-progress message from becoming visible again too quickly during processing.

---

## 17. What I Learned

Milestone 7 gave me practical experience with:

- event-driven architecture
- Amazon EventBridge event filtering
- S3 Object Created events
- Amazon SQS buffering
- Dead Letter Queues
- SQS redrive policies
- SQS visibility timeout
- Lambda event source mappings
- Python Lambda functions
- CloudWatch Lambda logging
- least-privilege IAM
- Terraform Lambda packaging
- provider lock-file behavior
- controlled failure testing
- interpreting S3 folder-marker objects

A key lesson was that decoupling changes how failures are handled.

Instead of losing an event when processing fails:

```text
event
→ remains buffered
→ retries
→ moves to DLQ if failure continues
```

Another important lesson was that serverless architecture still requires deliberate resilience design. SQS visibility timeout, receive count and DLQ behavior directly determine how failures are retried and preserved.

---

## 18. Result

Milestone 7 produced a resilient serverless event-processing foundation:

```text
Amazon S3
   ↓
Amazon EventBridge
   ↓
Amazon SQS
   ↓
AWS Lambda
   ↓
CloudWatch Logs

failure
   ↓
retry x3
   ↓
Dead Letter Queue
```

Final milestone state:

```text
S3 Object Created events             ✅
EventBridge filtering                ✅
EventBridge → SQS routing            ✅
SQS buffering                        ✅
SQS-managed encryption               ✅
Lambda event consumption             ✅
Python 3.12 runtime                   ✅
CloudWatch logging                   ✅
Least-privilege IAM                  ✅
Controlled failure mechanism         ✅
180-second retry behavior            ✅
Three failed receive attempts        ✅
DLQ delivery                         ✅
Terraform deployment                 ✅
```

This event-driven foundation prepared the platform for **Milestone 8 — RAG Knowledge Pipeline**, where the Lambda function would begin reading documents, generating embeddings and storing vectorized knowledge while retaining the same SQS retry and DLQ resilience layer.

---

## Presentation Summary

> In Milestone 7 I added a serverless event-driven processing layer for future RAG ingestion. When a new object is created in the private S3 bucket, EventBridge filters the event and sends it to an encrypted SQS queue. Lambda consumes one message at a time, parses the S3 event metadata and writes structured processing information to CloudWatch. I also added a Dead Letter Queue with a redrive policy so repeated processing failures are preserved instead of retrying forever. To prove the resilience behavior, I intentionally failed objects with the `fail/` prefix and observed the same SQS message retry approximately every 180 seconds before moving to the DLQ after three failed receives. The key lesson was that an event-driven architecture is not only about triggering Lambda; queue visibility timeout, retry behavior, IAM boundaries and DLQ design are what make the pipeline resilient and debuggable.
