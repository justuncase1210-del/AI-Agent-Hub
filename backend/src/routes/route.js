import { Router } from "express";
import { routeQuery } from "../router.js";

const router = Router();

/// POST /api/route { "query": "I want to store a file" }
/// Free by design - a discovery aid pointing agents toward the real,
/// paid endpoint that matches what they described, not a paid action
/// itself. Not listed in x402.js's routeConfig, so the payment
/// middleware passes it through untouched, same as /health.
router.post("/", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query (string) is required" });
  }

  try {
    const result = await routeQuery(query);
    res.json(result);
  } catch (err) {
    console.error("[route] failed:", err);
    res.status(500).json({ error: "routing failed" });
  }
});

export default router;