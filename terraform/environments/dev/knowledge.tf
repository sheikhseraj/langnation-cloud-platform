# ============================================================
# Milestone 8 - Seed RAG Knowledge Documents
# ============================================================

locals {
  knowledge_source_dir = abspath("${path.root}/../../../knowledge")

  knowledge_files = fileset(
    local.knowledge_source_dir,
    "**/*.txt"
  )
}

# Upload repository knowledge documents into the private
# LangNation storage bucket.
#
# These objects are created only after the complete
# EventBridge -> SQS -> Lambda RAG ingestion pipeline exists,
# so every uploaded knowledge document automatically produces
# embeddings and vectors.
resource "aws_s3_object" "knowledge_seed" {
  for_each = local.knowledge_files

  bucket = module.storage.bucket_name

  key = "documents/${each.value}"

  source = "${local.knowledge_source_dir}/${each.value}"

  # Detect content changes and re-upload the object.
  etag = filemd5(
    "${local.knowledge_source_dir}/${each.value}"
  )

  content_type = "text/plain; charset=utf-8"

  server_side_encryption = "AES256"

  depends_on = [
    module.event_processing
  ]
}