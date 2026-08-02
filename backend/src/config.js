import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  },

  db: {
    url: process.env.DATABASE_URL || "./data/hub.sqlite",
  },

  mcp: {
    transport: process.env.MCP_TRANSPORT || "http",
    path: process.env.MCP_PATH || "/mcp",
  },
};
