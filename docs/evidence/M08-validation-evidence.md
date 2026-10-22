# Milestone 8 — Validation Evidence

**Project:** LangNation Cloud Platform  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Milestone:** M08 — RAG Knowledge Pipeline  
**Environment:** `dev`  
**AWS Region:** `us-east-1`  
**Status:** ✅ Complete

---

## Bedrock

- [x] `amazon.titan-embed-text-v2:0` available
- [x] model status `ACTIVE`
- [x] direct `InvokeModel` succeeded
- [x] embedding dimension = `1024`

Result: **PASS**

---

## S3 Vectors

Vector bucket:

```text
langnation-cloud-platform-dev-881893827142-vectors
```

Index:

```text
langnation-knowledge
```

Validated:

- [x] `float32`
- [x] `1024` dimensions
- [x] `cosine` distance
- [x] `AES256` encryption
- [x] `source_text` non-filterable metadata

Result: **PASS**

---

## Terraform

- [x] `terraform fmt -recursive`
- [x] `terraform validate`
- [x] validation completed without warnings
- [x] `git diff --check`
- [x] `git diff --cached --check`
- [x] initial plan `+2 / ~0 / -0`
- [x] ingestion/index plan `+1 / ~2 / -1`
- [x] HCP apply completed

Result: **PASS**

---

## Lambda and IAM

New permissions:

```text
s3:GetObject
bedrock:InvokeModel
s3vectors:PutVectors
```

Validated:

- [x] source-bucket access restricted
- [x] Bedrock access restricted to Titan embeddings
- [x] vector write access restricted to knowledge index
- [x] existing SQS permissions retained
- [x] existing CloudWatch permissions retained
- [x] no AdministratorAccess added

Result: **PASS**

---

## Ingestion

Test object:

```text
documents/m8-rag-test.txt
```

Observed CloudWatch flow:

```text
S3 event received
Reading source document from S3
Source document read successfully
Document chunked
Embedding generated | dimensions=1024
Writing vectors
Vector batch stored
RAG document processing completed
```

Validated:

- [x] EventBridge → SQS → Lambda
- [x] `s3:GetObject`
- [x] UTF-8 extraction
- [x] chunking
- [x] Titan embedding
- [x] `PutVectors`
- [x] `vectors_written=1`

Result: **PASS**

---

## Stored Vector

Key:

```text
chunk-00000-d354a5eab85a4688a76ab9e1
```

Source:

```text
documents/m8-rag-test.txt
```

Metadata validated:

- [x] `source_bucket`
- [x] `source_key`
- [x] `chunk_index`
- [x] `chunk_count`
- [x] `event_time`
- [x] `source_text`

Result: **PASS**

---

## Semantic Query

Question:

```text
Which AWS service is used to create LangNation semantic embeddings?
```

Result:

```text
source   = documents/m8-rag-test.txt
distance = 0.3972092270851135
```

Validated:

- [x] question embedding generated
- [x] S3 Vectors query succeeded
- [x] metadata returned
- [x] source text returned

Result: **PASS**

---

## Semantic Ranking

Competing unrelated source:

```text
documents/m8-unrelated-test.txt
```

Top-2 ranking:

```text
1. documents/m8-rag-test.txt
   distance = 0.3972092270851135

2. documents/m8-unrelated-test.txt
   distance = 0.9990147352218628
```

Validated:

- [x] relevant AWS/RAG document ranked first
- [x] unrelated cooking document ranked second
- [x] relevant result had smaller cosine distance

Result: **PASS**

---

## Resilience Retained from M7

- [x] EventBridge retained
- [x] SQS buffering retained
- [x] 180-second visibility timeout retained
- [x] maxReceiveCount = 3 retained
- [x] DLQ retained
- [x] CloudWatch logging retained

Result: **PASS**

---

## Final Status

| Validation Area | Result |
|---|---|
| Bedrock model availability | ✅ PASS |
| Bedrock InvokeModel | ✅ PASS |
| S3 Vectors API | ✅ PASS |
| Terraform vector bucket | ✅ PASS |
| Terraform vector index | ✅ PASS |
| 1024-dimensional configuration | ✅ PASS |
| Cosine similarity | ✅ PASS |
| AES256 encryption | ✅ PASS |
| `source_text` metadata | ✅ PASS |
| Lambda S3 GetObject | ✅ PASS |
| Text extraction | ✅ PASS |
| Chunking | ✅ PASS |
| Titan embeddings | ✅ PASS |
| PutVectors | ✅ PASS |
| Metadata retrieval | ✅ PASS |
| Semantic query | ✅ PASS |
| Semantic ranking | ✅ PASS |
| Least-privilege IAM | ✅ PASS |
| M7 retry/DLQ retained | ✅ PASS |

**M08 — RAG Knowledge Pipeline: ✅ COMPLETE**

The platform is ready for **Milestone 9 — Lina AI Tutor / RAG Runtime**.


---

## Evidence File Purpose

This file is the validation record for Milestone 8. It preserves the detailed proof for Bedrock embeddings, S3 Vectors, ingestion, stored metadata, semantic retrieval, semantic ranking, Terraform and least-privilege IAM without duplicating that level of evidence inside the milestone narrative.
