import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Always load the .env at the project root (one level above backend/),
// regardless of which directory `npm run dev` / `node src/index.js` is
// actually invoked from. Without this, dotenv's default `import
// "dotenv/config"` only looks in process.cwd(), which is backend/ when
// you run `npm run dev` from inside that folder — so it silently misses
// the root .env and every credential comes back undefined.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    console.warn(`[config] Warning: ${name} is not set in .env`);
  }
  return val;
}

export const config = {
  port: Number(process.env.PORT || 4021),
  nodeEnv: process.env.NODE_ENV || "development",

  x402: {
    // Fixed receiving address. If set, the server pays into this address
    // directly (payToConfig: { type: "address" }) and CDP_WALLET_SECRET
    // is not needed. Leave blank to have createX402Server provision and
    // manage its own CDP wallet instead (requires CDP_WALLET_SECRET).
    payToAddress: process.env.X402_PAY_TO_ADDRESS || "",

    // CDP API credentials — required for client, server, and facilitator access.
    cdpApiKeyId: required("CDP_API_KEY_ID", ""),
    cdpApiKeySecret: required("CDP_API_KEY_SECRET", ""),
    cdpWalletSecret: process.env.CDP_WALLET_SECRET || "",

    // "production" (Base + Solana mainnet) or "development" (Base Sepolia +
    // Solana Devnet) — controls which networks createX402Server gates on by default.
    environment: process.env.CDP_X402_SERVER_ENVIRONMENT || "development",
  },

  prices: {
    query: process.env.PRICE_QUERY || "0.01",
    storageUpload: process.env.PRICE_STORAGE_UPLOAD || "0.05",
    storageDownload: process.env.PRICE_STORAGE_DOWNLOAD || "0.01",
    adImpression: process.env.PRICE_AD_IMPRESSION || "0.001",
    agentRegister: process.env.PRICE_AGENT_REGISTER || "0.00",
    // Flat price for every service proxied through /api/svc/:slug (see
    // routes/services.js and x402.js — per-slug pricing isn't supported
    // by the x402 SDK's static routeConfig map yet).
    svcProxy: process.env.PRICE_SVC_PROXY || "0.10",
  },

  db: {
    // Postgres connection string. Local dev default assumes docker-compose's
    // postgres service (or a locally installed Postgres) on 5432.
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/ai_agent_hub",
  },

  mcp: {
    transport: process.env.MCP_TRANSPORT || "http",
    path: process.env.MCP_PATH || "/mcp",
  },

  // Optional outbound proxy for run_query's fetches. Full proxy URL
  // including credentials, e.g. Webshare's rotating gateway:
  //   http://username:password@p.webshare.io:80
  // Leave unset to fetch directly with no proxy (default).
  proxyUrl: process.env.OUTBOUND_PROXY_URL || "",

  // Shared-secret header required by POST /api/services/register — the
  // only thing standing between the public internet and being able to
  // point an arbitrary slug at any target_url on this app's billing.
  // Set a long random value in .env; leave unset and /register will
  // safely refuse everything with 401.
  adminToken: process.env.ADMIN_TOKEN || "",
};