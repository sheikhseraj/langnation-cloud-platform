# Milestone 7 — Validation Evidence

**Project:** LangNation Cloud Platform  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Milestone:** M07 — Serverless & Event-Driven Processing  
**Environment:** `dev`  
**AWS Region:** `us-east-1`  
**Status:** ✅ Complete

---

## Terraform

- [x] `terraform fmt -recursive`
- [x] `terraform validate`
- [x] `git diff --cached --check`
- [x] AWS provider remained `6.67.0`
- [x] `hashicorp/archive 2.8.1` added
- [x] HCP Terraform plan reviewed
- [x] HCP plan: `+12 / ~0 / -0`
- [x] HCP apply completed successfully

---

## Event Processing Resources

- [x] SQS main queue
- [x] SQS Dead Letter Queue
- [x] SQS redrive policy
- [x] SQS redrive allow policy
- [x] EventBridge-to-SQS queue policy
- [x] Lambda CloudWatch log group
- [x] Lambda IAM role
- [x] Lambda least-privilege IAM policy
- [x] Lambda function
- [x] Lambda event source mapping
- [x] S3 EventBridge notification
- [x] EventBridge S3 Object Created rule
- [x] EventBridge SQS target

---

## Successful Path

Validated flow:

```text
S3
 ↓
EventBridge
 ↓
SQS
 ↓
Lambda
 ↓
CloudWatch Logs
```

Observed:

- [x] Lambda received one SQS record
- [x] SQS message ID logged
- [x] `detail_type=Object Created`
- [x] correct S3 bucket logged
- [x] correct object key logged
- [x] successful processing logged

Result:

```text
Normal event path: PASS
```

---

## Controlled Failure

Configured prefix:

```text
FAILURE_TEST_PREFIX=fail/
```

Observed:

- [x] object under `fail/` reached Lambda
- [x] controlled failure message logged
- [x] Lambda raised `RuntimeError`
- [x] message remained available for retry

Result:

```text
Controlled failure: PASS
```

---

## Retry Validation

Configuration:

```text
Visibility timeout: 180 seconds
maxReceiveCount:    3
```

Observed for `fail/m7-test.txt`:

```text
Attempt 1 → ~13:49
Attempt 2 → ~13:52
Attempt 3 → ~13:55
```

Checks:

- [x] same SQS message ID reappeared
- [x] retry interval matched visibility timeout
- [x] three failed processing attempts observed

Result:

```text
SQS retry behavior: PASS
```

---

## Dead Letter Queue

DLQ:

```text
langnation-cloud-platform-dev-document-events-dlq
```

AWS CLI result:

```json
{
  "Attributes": {
    "ApproximateNumberOfMessages": "2"
  }
}
```

Checks:

- [x] failed messages reached DLQ
- [x] DLQ contained two intentionally failing messages
- [x] `fail/` folder-marker behavior understood

Result:

```text
DLQ delivery: PASS
```

---

## Security

- [x] main SQS queue encrypted
- [x] DLQ encrypted
- [x] EventBridge restricted by `aws:SourceArn`
- [x] Lambda SQS access restricted to the document queue
- [x] Lambda CloudWatch access restricted to its log group
- [x] no `AdministratorAccess`
- [x] no broad SQS policy
- [x] no `s3:GetObject` yet
- [x] source S3 bucket remains private

---

## CloudWatch

Log group:

```text
/aws/lambda/langnation-cloud-platform-dev-document-processor
```

Validated:

- [x] Lambda initialization
- [x] SQS record count
- [x] SQS message ID
- [x] event type
- [x] event timestamp
- [x] bucket
- [x] object key
- [x] success log
- [x] failure log
- [x] runtime exception

---

## Final Status

| Validation Area | Result |
|---|---|
| Terraform configuration | ✅ PASS |
| HCP plan/apply | ✅ PASS |
| S3 event generation | ✅ PASS |
| EventBridge filtering | ✅ PASS |
| EventBridge → SQS | ✅ PASS |
| SQS → Lambda | ✅ PASS |
| Lambda execution | ✅ PASS |
| CloudWatch logging | ✅ PASS |
| Controlled failure | ✅ PASS |
| Retry behavior | ✅ PASS |
| DLQ delivery | ✅ PASS |
| Least-privilege IAM | ✅ PASS |

**M07 — Serverless & Event-Driven Processing: ✅ COMPLETE**


---

## Evidence File Purpose

This file is the validation record for Milestone 7. It is intentionally separate from the milestone implementation document so the architecture narrative remains readable while retry, failure, DLQ, IAM and Terraform proof stays easy to find during final review.
