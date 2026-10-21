const {
  BedrockRuntimeClient,
  InvokeModelCommand
} = require("@aws-sdk/client-bedrock-runtime");

const {
  S3VectorsClient,
  QueryVectorsCommand
} = require("@aws-sdk/client-s3vectors");


// ============================================================
// Configuration
// ============================================================

const AWS_REGION =
  process.env.AWS_REGION || "us-east-1";

const BEDROCK_EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID ||
  "amazon.titan-embed-text-v2:0";

const EMBEDDING_DIMENSIONS = 1024;

const VECTOR_BUCKET_NAME =
  process.env.VECTOR_BUCKET_NAME;

const VECTOR_INDEX_NAME =
  process.env.VECTOR_INDEX_NAME;


// ============================================================
// AWS Clients
// ============================================================

const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION
});

const s3VectorsClient = new S3VectorsClient({
  region: AWS_REGION
});


// ============================================================
// Create Query Embedding
// ============================================================

async function createQueryEmbedding(text) {
  if (!text || !text.trim()) {
    throw new Error("Question text is required.");
  }

  const requestBody = {
    inputText: text,
    dimensions: EMBEDDING_DIMENSIONS,
    normalize: true
  };

  const command = new InvokeModelCommand({
    modelId: BEDROCK_EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody)
  });

  const response = await bedrockClient.send(command);

  const responseBody = JSON.parse(
    Buffer.from(response.body).toString("utf-8")
  );

  const embedding = responseBody.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error(
      "Bedrock did not return a valid embedding."
    );
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, ` +
      `received ${embedding.length}.`
    );
  }

  return embedding;
}


// ============================================================
// Retrieve Relevant Knowledge
// ============================================================

async function retrieveRelevantChunks(question, topK = 3) {
  if (!VECTOR_BUCKET_NAME) {
    throw new Error(
      "VECTOR_BUCKET_NAME is not configured."
    );
  }

  if (!VECTOR_INDEX_NAME) {
    throw new Error(
      "VECTOR_INDEX_NAME is not configured."
    );
  }

  const queryEmbedding =
    await createQueryEmbedding(question);

  const command = new QueryVectorsCommand({
    vectorBucketName: VECTOR_BUCKET_NAME,
    indexName: VECTOR_INDEX_NAME,

    queryVector: {
      float32: queryEmbedding
    },

    topK,
    returnDistance: true,
    returnMetadata: true
  });

  const response =
    await s3VectorsClient.send(command);

  const vectors = response.vectors || [];

  return vectors.map((vector) => ({
    key: vector.key,
    distance: vector.distance,

    sourceKey:
      vector.metadata?.source_key || null,

    sourceText:
      vector.metadata?.source_text || null,

    metadata:
      vector.metadata || {}
  }));
}


// ============================================================
// Exports
// ============================================================

module.exports = {
  createQueryEmbedding,
  retrieveRelevantChunks
};