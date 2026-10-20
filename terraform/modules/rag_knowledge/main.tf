# ============================================================
# Amazon S3 Vectors - Vector Bucket
# ============================================================

resource "aws_s3vectors_vector_bucket" "knowledge" {
  vector_bucket_name = "${var.project_name}-${var.environment}-${var.aws_account_id}-vectors"

  # Development sandbox: allow clean Terraform destroy
  force_destroy = true

  encryption_configuration {
    sse_type = "AES256"
  }

  tags = merge(
    var.tags,
    {
      Name    = "${var.project_name}-${var.environment}-vectors"
      Purpose = "LangNation RAG vector storage"
    }
  )
}

# ============================================================
# Amazon S3 Vectors - Knowledge Index
# ============================================================

resource "aws_s3vectors_index" "knowledge" {
  index_name         = "langnation-knowledge"
  vector_bucket_name = aws_s3vectors_vector_bucket.knowledge.vector_bucket_name

  data_type       = "float32"
  dimension       = 1024
  distance_metric = "cosine"

  tags = merge(
    var.tags,
    {
      Name    = "langnation-knowledge"
      Purpose = "Semantic search index for LangNation RAG"
    }
  )
}