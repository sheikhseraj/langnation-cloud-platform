import hashlib
import json
import logging
import os
import struct

import boto3


logger = logging.getLogger()
logger.setLevel(logging.INFO)


# ============================================================
# Environment Configuration
# ============================================================

FAILURE_TEST_PREFIX = os.environ.get(
    "FAILURE_TEST_PREFIX",
    "fail/"
)

STORAGE_BUCKET_NAME = os.environ.get(
    "STORAGE_BUCKET_NAME"
)

VECTOR_BUCKET_NAME = os.environ.get(
    "VECTOR_BUCKET_NAME"
)

VECTOR_INDEX_NAME = os.environ.get(
    "VECTOR_INDEX_NAME"
)

BEDROCK_EMBEDDING_MODEL_ID = os.environ.get(
    "BEDROCK_EMBEDDING_MODEL_ID",
    "amazon.titan-embed-text-v2:0"
)

EMBEDDING_DIMENSIONS = int(
    os.environ.get(
        "EMBEDDING_DIMENSIONS",
        "1024"
    )
)


# ============================================================
# AWS Clients
# ============================================================

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime")
s3vectors = boto3.client("s3vectors")


# ============================================================
# Document Processing Configuration
# ============================================================

SUPPORTED_EXTENSIONS = (
    ".txt",
    ".md",
    ".csv",
    ".json"
)

CHUNK_SIZE_WORDS = 200
CHUNK_OVERLAP_WORDS = 40


# ============================================================
# Lambda Entry Point
# ============================================================

def lambda_handler(event, context):
    """
    Process SQS messages containing EventBridge S3 events.

    Milestone 7:
    - Receive SQS messages
    - Parse EventBridge events
    - Extract S3 metadata
    - Retry failures through SQS
    - Send repeated failures to DLQ

    Milestone 8:
    - Read source document from S3
    - Extract text
    - Split text into chunks
    - Generate Titan embeddings
    - Store embeddings in Amazon S3 Vectors
    """

    records = event.get("Records", [])

    logger.info(
        "Received %s SQS record(s)",
        len(records)
    )

    processed_records = 0

    for record in records:
        process_record(record)
        processed_records += 1

    return {
        "statusCode": 200,
        "processedRecords": processed_records
    }


# ============================================================
# Process One SQS Record
# ============================================================

def process_record(record):
    """
    Parse one SQS message and process the embedded
    EventBridge S3 Object Created event.
    """

    message_id = record.get(
        "messageId",
        "unknown"
    )

    logger.info(
        "Processing SQS message: %s",
        message_id
    )

    body = record.get("body")

    if not body:
        raise ValueError(
            f"SQS message {message_id} does not contain a body"
        )

    eventbridge_event = json.loads(body)

    detail_type = eventbridge_event.get(
        "detail-type",
        "unknown"
    )

    event_time = eventbridge_event.get(
        "time",
        "unknown"
    )

    detail = eventbridge_event.get(
        "detail",
        {}
    )

    bucket = (
        detail
        .get("bucket", {})
        .get("name", "unknown")
    )

    object_key = (
        detail
        .get("object", {})
        .get("key", "unknown")
    )

    logger.info(
        "Document event received | "
        "message_id=%s | "
        "detail_type=%s | "
        "event_time=%s | "
        "bucket=%s | "
        "object_key=%s",
        message_id,
        detail_type,
        event_time,
        bucket,
        object_key
    )

    # ========================================================
    # Controlled M7 Failure Test
    # ========================================================

    if (
        object_key != "unknown"
        and object_key.startswith(
            FAILURE_TEST_PREFIX
        )
    ):
        logger.error(
            "Controlled failure test triggered for object: %s",
            object_key
        )

        raise RuntimeError(
            f"Controlled failure test for {object_key}"
        )

    # ========================================================
    # Ignore S3 Folder Marker Objects
    # ========================================================

    if object_key.endswith("/"):
        logger.info(
            "Skipping S3 folder marker: %s",
            object_key
        )

        return

    # ========================================================
    # Ignore Unsupported File Types
    # ========================================================

    lower_key = object_key.lower()

    if not lower_key.endswith(
        SUPPORTED_EXTENSIONS
    ):
        logger.info(
            "Skipping unsupported document type: %s",
            object_key
        )

        return

    # ========================================================
    # Validate Expected Source Bucket
    # ========================================================

    if (
        STORAGE_BUCKET_NAME
        and bucket != STORAGE_BUCKET_NAME
    ):
        raise ValueError(
            "Unexpected source bucket: "
            f"{bucket}"
        )

    # ========================================================
    # Read Document from S3
    # ========================================================

    text = read_document(
        bucket,
        object_key
    )

    if not text.strip():
        logger.warning(
            "Document contains no usable text: %s",
            object_key
        )

        return

    # ========================================================
    # Chunk Document
    # ========================================================

    chunks = chunk_text(text)

    logger.info(
        "Document chunked | "
        "object_key=%s | "
        "chunks=%s",
        object_key,
        len(chunks)
    )

    if not chunks:
        logger.warning(
            "No chunks generated for document: %s",
            object_key
        )

        return

    # ========================================================
    # Create Embeddings + Vector Records
    # ========================================================

    vectors = []

    total_chunks = len(chunks)

    for chunk_index, chunk in enumerate(chunks):
        embedding = create_embedding(
            chunk
        )

        vector_key = create_vector_key(
            bucket=bucket,
            object_key=object_key,
            chunk_index=chunk_index
        )

        vectors.append(
            {
                "key": vector_key,
                "data": {
                    "float32": embedding
                },
                "metadata": {
                    "source_bucket": bucket,
                    "source_key": object_key,
                    "chunk_index": chunk_index,
                    "chunk_count": total_chunks,
                    "event_time": event_time,
                    "source_text": chunk
                }
            }
        )

    # ========================================================
    # Store Vectors
    # ========================================================

    store_vectors(vectors)

    logger.info(
        "RAG document processing completed | "
        "object_key=%s | "
        "vectors_written=%s",
        object_key,
        len(vectors)
    )


# ============================================================
# Read Source Document
# ============================================================

def read_document(bucket, object_key):
    """
    Download a UTF-8 text-based document from S3.
    """

    logger.info(
        "Reading source document from S3 | "
        "bucket=%s | key=%s",
        bucket,
        object_key
    )

    response = s3.get_object(
        Bucket=bucket,
        Key=object_key
    )

    raw_content = response[
        "Body"
    ].read()

    try:
        text = raw_content.decode(
            "utf-8"
        )
    except UnicodeDecodeError as exc:
        raise ValueError(
            "Document is not valid UTF-8 text: "
            f"{object_key}"
        ) from exc

    logger.info(
        "Source document read successfully | "
        "bytes=%s",
        len(raw_content)
    )

    return text


# ============================================================
# Chunk Text
# ============================================================

def chunk_text(text):
    """
    Split text into overlapping word-based chunks.

    Current configuration:
    - 200 words per chunk
    - 40-word overlap
    """

    words = text.split()

    if not words:
        return []

    chunks = []

    step = (
        CHUNK_SIZE_WORDS
        - CHUNK_OVERLAP_WORDS
    )

    start = 0

    while start < len(words):
        end = start + CHUNK_SIZE_WORDS

        chunk_words = words[
            start:end
        ]

        chunk = " ".join(
            chunk_words
        ).strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(words):
            break

        start += step

    return chunks


# ============================================================
# Generate Titan Embedding
# ============================================================

def create_embedding(text):
    """
    Generate a normalized 1024-dimensional embedding
    using Amazon Titan Text Embeddings V2.
    """

    request_body = {
        "inputText": text,
        "dimensions": EMBEDDING_DIMENSIONS,
        "normalize": True
    }

    response = bedrock.invoke_model(
        modelId=BEDROCK_EMBEDDING_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(
            request_body
        )
    )

    response_body = json.loads(
        response["body"].read()
    )

    embedding = response_body.get(
        "embedding"
    )

    if not embedding:
        raise ValueError(
            "Bedrock returned no embedding"
        )

    if (
        len(embedding)
        != EMBEDDING_DIMENSIONS
    ):
        raise ValueError(
            "Unexpected embedding dimension. "
            f"Expected {EMBEDDING_DIMENSIONS}, "
            f"received {len(embedding)}"
        )

    # Explicitly round Python floats to IEEE-754 float32.
    embedding_float32 = [
        to_float32(value)
        for value in embedding
    ]

    logger.info(
        "Embedding generated | "
        "dimensions=%s",
        len(embedding_float32)
    )

    return embedding_float32


# ============================================================
# Convert to Float32
# ============================================================

def to_float32(value):
    """
    Convert a Python float to IEEE-754 single precision.
    """

    return struct.unpack(
        "!f",
        struct.pack(
            "!f",
            float(value)
        )
    )[0]


# ============================================================
# Deterministic Vector Key
# ============================================================

def create_vector_key(
    bucket,
    object_key,
    chunk_index
):
    """
    Create a deterministic vector key.

    If SQS retries the same document, the same chunk gets
    the same vector key instead of creating duplicate vectors.
    """

    source = (
        f"{bucket}:"
        f"{object_key}:"
        f"{chunk_index}"
    )

    digest = hashlib.sha256(
        source.encode("utf-8")
    ).hexdigest()

    return (
        f"chunk-"
        f"{chunk_index:05d}-"
        f"{digest[:24]}"
    )


# ============================================================
# Store Vectors in Amazon S3 Vectors
# ============================================================

def store_vectors(vectors):
    """
    Write vectors to the configured S3 Vectors index.

    S3 Vectors supports batching vectors in a PutVectors call.
    """

    if not vectors:
        return

    if not VECTOR_BUCKET_NAME:
        raise ValueError(
            "VECTOR_BUCKET_NAME is not configured"
        )

    if not VECTOR_INDEX_NAME:
        raise ValueError(
            "VECTOR_INDEX_NAME is not configured"
        )

    logger.info(
        "Writing vectors | "
        "vector_bucket=%s | "
        "index=%s | "
        "count=%s",
        VECTOR_BUCKET_NAME,
        VECTOR_INDEX_NAME,
        len(vectors)
    )

    # PutVectors supports up to 500 vectors per request.
    batch_size = 500

    for start in range(
        0,
        len(vectors),
        batch_size
    ):
        batch = vectors[
            start:start + batch_size
        ]

        s3vectors.put_vectors(
            vectorBucketName=VECTOR_BUCKET_NAME,
            indexName=VECTOR_INDEX_NAME,
            vectors=batch
        )

        logger.info(
            "Vector batch stored | "
            "batch_size=%s",
            len(batch)
        )