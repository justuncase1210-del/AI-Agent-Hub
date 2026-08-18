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
import routeRouter from "./routes/route.js";
import servicesRouter from "./routes/services.js";
import servicesAdminRouter from "./routes/servicesAdmin.js";

async function main() {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors({ exposedHeaders: ["payment-required"] }));
  app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, environment: config.x402.environment });
  });

  await initDb();

  const x402PaymentMiddleware = await createX402PaymentMiddleware();
  app.use(x402PaymentMiddleware);

  app.use("/api/agents", agentsRouter);
  app.use("/api/storage", storageRouter);
  app.use("/api/queries", queriesRouter);
  app.use("/api/ads", adsRouter);
  // Semantic router - free discovery endpoint. Not in x402.js's
  // routeConfig, so it passes through the payment middleware untouched.
  app.use("/api/route", routeRouter);
  // Admin-only service registration. Deliberately a DIFFERENT path
  // prefix than /api/svc below — it must never share a prefix with the
  // priced proxy, or x402's wildcard match on "/api/svc/:slug" will
  // intercept it as a paid call to a service named "register" (this
  // happened once; see routes/servicesAdmin.js for the full story).
  // Not in x402.js's routeConfig, so it passes through free — access
  // is instead controlled by the x-admin-token header check inside.
  app.use("/api/services", servicesAdminRouter);
  // Registered third-party services (e.g. sovereign-agent's Akash-hosted
  // deploys) — priced proxy, gated by x402.js's "GET/POST /api/svc/:slug"
  // routeConfig entries.
  app.use("/api/svc", servicesRouter);

  attachMcpHttp(app, config.mcp.path);

  app.listen(config.port, () => {
    console.log(`AI Agent Hub backend listening on :${config.port}`);
    console.log(`  x402 environment: ${config.x402.environment}`);
    console.log(`  x402 pay-to: ${config.x402.payToAddress || "(CDP-managed wallet)"}`);
    console.log(`  MCP endpoint: http://localhost:${config.port}${config.mcp.path}`);
    if (config.x402.environment === "production") {
      console.log("");
      console.log("  \x1b[41m\x1b[37m                                                        \x1b[0m");
      console.log("  \x1b[41m\x1b[37m   WARNING: RUNNING IN PRODUCTION MODE - REAL USDC MOVES  \x1b[0m");
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