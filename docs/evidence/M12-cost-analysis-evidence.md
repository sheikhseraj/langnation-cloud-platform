# Milestone 12 — Cost Analysis Evidence

**Project:** LangNation Cloud Platform  
**Author:** Seraj Ahmad Siddiqui  
**Course:** AWS Cloud Computing with AI Bootcamp  
**Environment:** `dev`  
**AWS Region:** `us-east-1`  
**Evidence Type:** AWS Cost Explorer  
**Status:** ✅ Cost analysis captured

**Period:** 2026-10-01 to 2026-10-23

## AWS Cost Explorer service breakdown

| Service | Cost (USD) |
|---|---:|
| EC2 - Other | 12.2177053311 |
| Amazon Relational Database Service | 3.1456372965 |
| Amazon Elastic Container Service | 2.3248060197 |
| Amazon Elastic Load Balancing | 2.228246535 |
| Amazon Virtual Private Cloud | 2.156584765 |
| AWS WAF | 0.8738488541 |
| AmazonCloudWatch | 0.612077321 |
| AWS Service Catalog | 0.168 |
| AWS Secrets Manager | 0.0422199075 |
| Amazon Simple Storage Service | 0.0113097274 |
| Amazon Elastic Container Registry (ECR) | 0.0008852405 |
| AWS Key Management Service | 0.000531 |
| CloudWatch Events | 0.000012 |
| Amazon Bedrock | 0.0000115 |
| Amazon CloudFront | 0.0000009408 |
| AWS Step Functions | 0.0000001386 |
| Amazon Glacier | 0.0000001134 |

Usage subtotal before tax: approximately **$23.78**  
Tax shown separately: **$4.29**  
Total including shown tax: approximately **$28.07**

Largest cost contributors before tax:
1. EC2 - Other — ~51.4%
2. Amazon RDS — ~13.2%
3. Amazon ECS — ~9.8%
4. Elastic Load Balancing — ~9.4%
5. Amazon VPC — ~9.1%
6. AWS WAF — ~3.7%
7. CloudWatch — ~2.6%


---

## Evidence Interpretation

The Cost Explorer data should remain as detailed evidence rather than being copied in full into the Milestone 12 narrative.

The milestone document should summarize the main conclusions:

- usage subtotal before tax was approximately **$23.78**
- shown tax was **$4.29**
- total including shown tax was approximately **$28.07**
- `EC2 - Other` was the largest service category in the captured service breakdown
- RDS, ECS, Elastic Load Balancing and VPC were the next major contributors
- the final architecture was intentionally kept unchanged because the resilience design depends on Multi-AZ components and redundant runtime capacity

A broader Milestone 12 validation file can later combine this cost evidence with the separate resilience/self-healing evidence.
