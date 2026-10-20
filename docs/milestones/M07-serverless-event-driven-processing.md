# LangNation Cloud Platform
## Milestone 7 — Serverless & Event-Driven Processing

**Environment:** `dev`  
**AWS Region:** `us-east-1`  
**Infrastructure as Code:** Terraform + HCP Terraform  
**Status:** ✅ Complete

---

## 1. Objective

Milestone 7 added the serverless event-processing foundation for later RAG ingestion.

The implemented flow is:

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

Failure handling:

```text
SQS
 ↓
Lambda failure
 ↓
retry
 ↓
retry
 ↓
retry
 ↓
Dead Letter Queue
```

Milestone 7 intentionally does not yet perform document extraction, embeddings, vector storage, or Bedrock RAG. Those are part of Milestone 8.

---

## 2. Architecture Decisions

### Why EventBridge?

EventBridge filters and routes S3 events. The implemented rule only matches:

```text
source      = aws.s3
detail-type = Object Created
bucket      = LangNation private storage bucket
```

### Why SQS?

SQS decouples S3/EventBridge from Lambda. If Lambda fails or is temporarily unavailable, the event remains buffered instead of being lost.

### Why a DLQ?

After repeated failed processing attempts, messages move to a Dead Letter Queue for inspection instead of retrying forever.

---

## 3. Terraform Structure

```text
terraform/modules/event_processing/
├── main.tf
├── variables.tf
└── outputs.tf

lambda/document_processor/
└── handler.py
```

The development environment connects the module to the existing storage bucket with:

```hcl
storage_bucket_name = module.storage.bucket_name
```

---

## 4. SQS Configuration

Main queue:

```text
langnation-cloud-platform-dev-document-events
```

Settings:

```text
Message retention:     4 days
Visibility timeout:    180 seconds
Encryption:            SQS-managed SSE
maxReceiveCount:       3
```

Dead Letter Queue:

```text
langnation-cloud-platform-dev-document-events-dlq
```

Settings:

```text
Message retention: 14 days
Encryption:         SQS-managed SSE
```

A redrive allow policy restricts DLQ use to the main document-processing queue.

---

## 5. Lambda Configuration

Function:

```text
langnation-cloud-platform-dev-document-processor
```

Runtime settings:

```text
Runtime:       Python 3.12
Memory:        256 MB
Timeout:       30 seconds
Batch size:    1
```

The Lambda code is packaged by Terraform with the `hashicorp/archive` provider.

Milestone 7 Lambda responsibility:

```text
receive SQS message
→ parse embedded EventBridge event
→ extract event type
→ extract event time
→ extract S3 bucket
→ extract S3 object key
→ log metadata to CloudWatch
```

---

## 6. Least-Privilege IAM

Lambda SQS permissions:

```text
sqs:ReceiveMessage
sqs:DeleteMessage
sqs:GetQueueAttributes
```

CloudWatch permissions:

```text
logs:CreateLogStream
logs:PutLogEvents
```

The Lambda does not yet receive `s3:GetObject`. That permission will be introduced in Milestone 8 when the function actually reads document content.

EventBridge can only send messages to the main queue and is restricted by `aws:SourceArn` to the specific EventBridge rule.

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

Logs include:

- SQS record count
- SQS message ID
- EventBridge detail type
- event time
- S3 bucket
- S3 object key
- successful processing
- controlled failures

---

## 8. Controlled Failure Test

The Lambda uses:

```text
FAILURE_TEST_PREFIX=fail/
```

Any S3 object key starting with `fail/` intentionally raises a `RuntimeError`.

Example:

```text
fail/m7-test.txt
```

This was used to verify SQS retries and DLQ delivery.

---

## 9. Successful Path Validation

A normal S3 upload produced CloudWatch logs showing:

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

## 10. Retry Validation

A controlled failure was observed three times with the same SQS message ID.

Approximate timing:

```text
Attempt 1 → 13:49
Attempt 2 → 13:52
Attempt 3 → 13:55
```

The approximately three-minute interval matched the configured 180-second SQS visibility timeout.

---

## 11. DLQ Validation

AWS CLI verification returned:

```json
{
  "Attributes": {
    "ApproximateNumberOfMessages": "2"
  }
}
```

Two failed messages were present because the S3 console created both:

```text
fail/
fail/m7-test.txt
```

The zero-byte `fail/` folder-marker object also matched the failure prefix.

This confirmed:

```text
Lambda failure
→ SQS retry
→ SQS retry
→ SQS retry
→ DLQ
```

---

## 12. Terraform Validation

Local validation:

```text
terraform validate
→ Success! The configuration is valid.
```

HCP Terraform plan:

```text
+12
~0
-0
```

Apply completed successfully.

Provider versions:

```text
hashicorp/aws     6.67.0
hashicorp/archive 2.8.1
```

The AWS provider was intentionally kept at the already-tested 6.67.0 version.

---

## 13. Resources Added

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

---

## 14. Lessons Learned

### Terraform provider upgrade

Running `terraform init -upgrade` temporarily upgraded the AWS provider. The lock file was restored and the project kept AWS provider `6.67.0`.

### S3 folders are object-key prefixes

Creating a folder in the S3 console created a zero-byte object named `fail/`, which generated its own Object Created event.

### SQS retries follow visibility timeout

Retries were not immediate because the queue visibility timeout was 180 seconds.

---

## 15. Milestone 8 Handoff

Milestone 8 will extend the existing pipeline:

```text
S3
 ↓
EventBridge
 ↓
SQS
 ↓
Lambda
 ├── s3:GetObject
 ├── document extraction
 ├── chunking
 ├── embeddings
 └── vector storage
```

The existing retry and DLQ design remains the resilience layer.

---

## 16. Final Result

```text
S3 Object Created event          ✅
S3 → EventBridge                 ✅
EventBridge → SQS                ✅
SQS buffering                    ✅
SQS → Lambda                     ✅
Python Lambda                    ✅
CloudWatch logging               ✅
least-privilege IAM              ✅
controlled failure test          ✅
180-second retries               ✅
three failed attempts            ✅
DLQ delivery                     ✅
Terraform deployment             ✅
```

**Milestone 7 status: ✅ COMPLETE**
