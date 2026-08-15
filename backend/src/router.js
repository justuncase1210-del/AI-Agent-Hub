import { pipeline } from "@xenova/transformers";
import { pool } from "./db.js";
import { config } from "./config.js";

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

// One real, human-written example description per actual STATIC endpoint -
// the router's whole job is matching an agent's plain-language request
// against these, not the route paths themselves. Services registered via
// POST /api/services/register (see routes/servicesAdmin.js) are handled
// separately below in ensureDbRouteEmbeddings, since that list changes at
// runtime and can't be hardcoded here.
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

// Registered third-party services (e.g. sovereign-agent's Akash-hosted
// deploys - see routes/services.js and servicesAdmin.js) are dynamic, so
// they're kept in a separate cache from the static ROUTES above, keyed by
// slug, and refreshed periodically rather than hardcoded. Re-embedding
// only happens for a slug whose description actually changed since the
// last refresh (or that's brand new) - re-embedding all of them on every
// single routing query would be wasteful, since this table changes rarely
// (roughly once per new deploy) compared to how often routeQuery runs.
const dbRouteCache = new Map(); // slug -> { description, vector, endpoint, price }
let dbRouteCacheAt = 0;
const DB_ROUTE_CACHE_TTL_MS = 60_000;

async function ensureDbRouteEmbeddings() {
  const now = Date.now();
  if (now - dbRouteCacheAt < DB_ROUTE_CACHE_TTL_MS && dbRouteCache.size > 0) {
    return Array.from(dbRouteCache.values());
  }

  const result = await pool.query(
    `SELECT slug, description FROM registered_services`
  );
  const seenSlugs = new Set();

  for (const row of result.rows) {
    seenSlugs.add(row.slug);
    const cached = dbRouteCache.get(row.slug);
    const description = row.description || row.slug;
    // Only re-embed if new or the description text actually changed -
    // the embedding itself is the expensive part, not the DB read.
    if (cached && cached.description === description) continue;

    const vector = await embed(description);
    dbRouteCache.set(row.slug, {
      endpoint: `ALL /api/svc/${row.slug}`,
      price: `$${config.prices.svcProxy}`,
      description,
      vector,
    });
  }

  // Drop cache entries for services that no longer exist in the table
  // (e.g. if a slug is ever removed) so stale services can't still get
  // recommended after deregistration.
  for (const slug of dbRouteCache.keys()) {
    if (!seenSlugs.has(slug)) dbRouteCache.delete(slug);
  }

  dbRouteCacheAt = now;
  return Array.from(dbRouteCache.values());
}

/// Routes a plain-language query to the best-matching real endpoint,
/// with a similarity score so callers can judge confidence themselves
/// rather than trust a single guess blindly. Now searches BOTH the
/// static built-in routes and every currently-registered third-party
/// service (see ensureDbRouteEmbeddings) in one combined ranking.
export async function routeQuery(query) {
  const [staticRoutes, dbRoutes] = await Promise.all([
    ensureRouteEmbeddings(),
    ensureDbRouteEmbeddings(),
  ]);
  const allRoutes = [...staticRoutes, ...dbRoutes];

  const queryVector = await embed(query);
  const scored = allRoutes
    .map((r) => ({ endpoint: r.endpoint, price: r.price, similarity: cosineSimilarity(queryVector, r.vector) }))
    .sort((a, b) => b.similarity - a.similarity);

  return { bestMatch: scored[0], allScores: scored };
}