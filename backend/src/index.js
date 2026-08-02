import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { createX402PaymentMiddleware } from "./middleware/x402Payment.js";
import { attachMcpHttp } from "./mcp/server.js";

import agentsRouter from "./routes/agents.js";
import storageRouter from "./routes/storage.js";
import queriesRouter from "./routes/queries.js";
import adsRouter from "./routes/ads.js";

async function main() {
  const app = express();

  app.use(cors());
  app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
  app.use(express.json());

  // Health check — always free.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, environment: config.x402.environment });
  });

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
  });
}

main().catch((err) => {
  console.error("Failed to start AI Agent Hub backend:", err);
  process.exit(1);
});
