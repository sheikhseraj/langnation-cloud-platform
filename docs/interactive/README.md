# Interactive Architecture

## Live Demo

[▶ Open the Live Interactive M1–M12 Architecture](https://sheikhseraj.github.io/langnation-cloud-platform/interactive/langnation-architecture-m01-m12.html)

Use the live version to explore the completed LangNation Cloud Platform directly in your browser.

The walkthrough opens in **Live Overview** mode, with all M1–M12 milestone and workflow connections moving simultaneously. **Pause** freezes all moving connections and **Play** resumes them. Select **Auto Presentation** only when you want the separate sequential milestone tour.

The walkthrough includes:

- Milestones M1–M12
- Public web request flow
- Cognito authentication flow
- CI/CD deployment flow
- Terraform / IaC provisioning
- Database & storage flow
- Event-driven document processing
- RAG knowledge-ingestion flow
- Lina grounded RAG runtime
- CloudWatch monitoring & alarms
- CloudTrail governance
- CI/CD quality gates
- ECS resilience / self-healing
- Cost & optimization view
- Automated morning sandbox recovery
- Light and dark mode
- Auto presentation sequence: M1 → M12 → key end-to-end flows
- Animation speed controls
- Fullscreen presentation mode

## Final Project State

The interactive walkthrough reflects the completed capstone architecture:

- Multi-AZ VPC with public, private application and private database subnets
- Two NAT Gateways and layered security groups
- Private ECS Fargate application behind an Application Load Balancer
- Persistent Route 53 + CloudFront + ACM + AWS WAF public edge
- Cognito JWT authentication
- Private Multi-AZ Amazon RDS for MariaDB
- Private, encrypted and versioned Amazon S3 storage
- GitHub Actions deployment through GitHub OIDC and AWS STS
- EventBridge → SQS → Lambda processing with DLQ
- Titan Text Embeddings V2 + Amazon S3 Vectors RAG ingestion
- Lina grounded RAG runtime using semantic retrieval + Claude Haiku
- CloudWatch dashboard + nine operational alarms
- Multi-Region CloudTrail with a private audit S3 bucket
- Mandatory CI/CD quality gates including Trivy
- Controlled ECS self-healing validation
- AWS Cost Explorer analysis
- OP01 automated infrastructure, database, application and DNS recovery

## Source

The interactive walkthrough is implemented as a standalone HTML file:

[`langnation-architecture-m01-m12.html`](langnation-architecture-m01-m12.html)

GitHub displays `.html` files in the repository as source code rather than executing them. Use the **Live Demo** link above to open the rendered interactive version through GitHub Pages.

## Repository Location

```text
docs/
└── interactive/
    ├── README.md
    └── langnation-architecture-m01-m12.html
```

The previous `langnation-architecture-m01-m06.html` file can be moved to local `Research/Architecture-History/` after the M1–M12 live page is published and verified.
