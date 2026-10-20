import json
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FAILURE_TEST_PREFIX = os.environ.get("FAILURE_TEST_PREFIX", "fail/")


def lambda_handler(event, context):
    """
    Process SQS messages containing Amazon EventBridge S3 events.

    Milestone 7 responsibility:
    - Receive SQS messages
    - Parse the EventBridge event
    - Extract document metadata
    - Log useful information to CloudWatch

    Milestone 8 will extend this function with:
    - S3 object retrieval
    - document extraction
    - chunking
    - embeddings
    - vector storage
    """

    records = event.get("Records", [])

    logger.info("Received %s SQS record(s)", len(records))

    for record in records:
        process_record(record)

    return {
        "statusCode": 200,
        "processedRecords": len(records)
    }


def process_record(record):
    """
    Parse one SQS message and extract the embedded EventBridge event.
    """

    message_id = record.get("messageId", "unknown")

    logger.info("Processing SQS message: %s", message_id)

    body = record.get("body")

    if not body:
        raise ValueError(
            f"SQS message {message_id} does not contain a body"
        )

    eventbridge_event = json.loads(body)

    detail_type = eventbridge_event.get("detail-type", "unknown")
    event_time = eventbridge_event.get("time", "unknown")
    detail = eventbridge_event.get("detail", {})

    bucket = detail.get("bucket", {}).get("name", "unknown")
    object_key = detail.get("object", {}).get("key", "unknown")

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

    # Controlled failure path used later to validate SQS retry + DLQ.
    if (
        object_key != "unknown"
        and object_key.startswith(FAILURE_TEST_PREFIX)
    ):
        logger.error(
            "Controlled failure test triggered for object: %s",
            object_key
        )

        raise RuntimeError(
            f"Controlled failure test for {object_key}"
        )

    logger.info(
        "Document event processed successfully: %s",
        object_key
    )