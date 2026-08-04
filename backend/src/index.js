import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { createX402PaymentMiddleware } from "./middleware/x402Payment.js";
import { attachMcpHttp } from "./mcp/server.js";

import agentsRouter from "./routes/agents.js";
import storageRouter from "./routes/storage.js";
import queriesRouter from "./routes/queries.js";
import adsRouter from "./routes/ads.js";

async function main() {
  const app = express();

  // Render (and most PaaS platforms) terminate TLS at their edge proxy,
  // then forward requests to this container over plain internal HTTP.
  // Without this, Express reads req.protocol as "http" (the internal
  // hop) instead of "https" (what the public actually sees) — which
  // broke Bazaar discovery, since CDP rejects resource URLs that don't
  // start with https://. Trusting the proxy makes Express read the
  // real external protocol from the X-Forwarded-Proto header instead.
  app.set("trust proxy", true);

  app.use(cors());
  app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
  app.use(express.json());

  // Health check — always free.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, environment: config.x402.environment });
  });

  // Creates tables if they don't exist yet — must resolve before any
  // route tries to query Postgres, since a fresh database has no schema.
  await initDb();

  // x402 payment gate — createX402Server provisions/loads the CDP-backed
  // resource server (wallet + facilitator wiring) once at boot, so this
  // middleware must be awaited before the app starts handling requests.
  // Applies only to the routes listed in src/x402.js's `routeConfig` map;
  // everything else passes through untouched.
  const x402PaymentMiddleware = await createX402PaymentMiddleware();
  app.use(x402PaymentMiddleware);

  // REST API
  app.use("/api/agents", agentsRouter);
  app.use("/api/storage", storageRouter);
  app.use("/api/queries", queriesRouter);
  app.use("/api/ads", adsRouter);

  // MCP endpoint — same capabilities, exposed as MCP tools for MCP-native agents.
  attachMcpHttp(app, config.mcp.path);

  app.listen(config.port, () => {
    console.log(`AI Agent Hub backend listening on :${config.port}`);
    console.log(`  x402 environment: ${config.x402.environment}`);
    console.log(`  x402 pay-to: ${config.x402.payToAddress || "(CDP-managed wallet)"}`);
    console.log(`  MCP endpoint: http://localhost:${config.port}${config.mcp.path}`);

    // Impossible-to-miss warning if this process is somehow running
    // production settings — most likely to happen by accident on a local
    // dev machine after a copy-paste mistake into .env. Real USDC moves
    // in this mode; this banner exists so that mistake gets noticed
    // immediately at boot, not after a payment settles.
    if (config.x402.environment === "production") {
      console.log("");
      console.log("  \x1b[41m\x1b[37m                                                        \x1b[0m");
      console.log("  \x1b[41m\x1b[37m   ⚠️  RUNNING IN PRODUCTION MODE — REAL USDC MOVES  ⚠️  \x1b[0m");
      console.log("  \x1b[41m\x1b[37m   If this is your local dev machine, STOP and check   \x1b[0m");
      console.log("  \x1b[41m\x1b[37m   .env's CDP_X402_SERVER_ENVIRONMENT right now.        \x1b[0m");
      console.log("  \x1b[41m\x1b[37m                                                        \x1b[0m");
      console.log("");
    }
  });
}

main().catch((err) => {
  console.error("Failed to start AI Agent Hub backend:", err);
  process.exit(1);
});
