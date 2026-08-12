import { pipeline } from "@xenova/transformers";

// Local embedding model - downloads once (~90MB), caches, then runs
// entirely on-device. No API key, no per-call cost, no external network
// dependency after the first load.
let embedder = null;
let embedderLoading = null;

async function getEmbedder() {
  if (embedder) return embedder;
  if (embedderLoading) return embedderLoading;
  embedderLoading = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  embedder = await embedderLoading;
  return embedder;
}

// One real, human-written example description per actual endpoint - the
// router's whole job is matching an agent's plain-language request
// against these, not the route paths themselves.
const ROUTES = [
  {
    endpoint: "POST /api/queries",
    price: "$0.01",
    description: "Run a data query, look something up, search for information, ask a question about data",
  },
  {
    endpoint: "POST /api/storage/upload",
    price: "$0.05",
    description: "Store a file, save data, upload a document, persist content for later retrieval",
  },
  {
    endpoint: "GET /api/storage/:id",
    price: "$0.01",
    description: "Download a stored file, retrieve saved content, fetch a document by its ID",
  },
  {
    endpoint: "POST /api/ads/impression",
    price: "$0.001",
    description: "Buy an ad impression, pay for advertising exposure, purchase ad placement",
  },
];

let routeEmbeddings = null;

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embed(text) {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

async function ensureRouteEmbeddings() {
  if (routeEmbeddings) return routeEmbeddings;
  routeEmbeddings = await Promise.all(
    ROUTES.map(async (route) => ({ ...route, vector: await embed(route.description) }))
  );
  return routeEmbeddings;
}

/// Routes a plain-language query to the best-matching real endpoint,
/// with a similarity score so callers can judge confidence themselves
/// rather than trust a single guess blindly.
export async function routeQuery(query) {
  const routes = await ensureRouteEmbeddings();
  const queryVector = await embed(query);

  const scored = routes
    .map((r) => ({ endpoint: r.endpoint, price: r.price, similarity: cosineSimilarity(queryVector, r.vector) }))
    .sort((a, b) => b.similarity - a.similarity);

  return { bestMatch: scored[0], allScores: scored };
}