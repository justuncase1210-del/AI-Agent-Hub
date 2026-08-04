import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pool } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";

const router = Router();

// Free — list active ads (agents browse before "buying" an impression).
router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ads WHERE active = true ORDER BY created_at DESC`
  );
  res.json({ ads: rows });
});

// Free — create an ad listing (in production, gate this behind your own auth).
const createAdSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  targetUrl: z.string().url().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createAdSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  const id = nanoid(12);
  const { title, body, targetUrl } = parsed.data;
  await pool.query(
    `INSERT INTO ads (id, title, body, target_url) VALUES ($1, $2, $3, $4)`,
    [id, title, body ?? null, targetUrl ?? null]
  );
  res.status(201).json({ adId: id });
});

// PAID — protected by x402PaymentMiddleware in index.js ("POST /api/ads/impression").
// An agent "buys" an impression: it pays a fraction of a cent and gets
// back the ad payload to show/act on (e.g. surface it to an end user).
const impressionSchema = z.object({
  adId: z.string(),
  agentId: z.string().optional(),
});

router.post("/impression", async (req, res) => {
  const parsed = impressionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  logSettledPayment(req, "ads.impression");

  const { adId, agentId } = parsed.data;
  const { rows } = await pool.query(
    `SELECT * FROM ads WHERE id = $1 AND active = true`,
    [adId]
  );
  const ad = rows[0];
  if (!ad) return res.status(404).json({ error: "ad_not_found" });

  await pool.query(
    `INSERT INTO ad_impressions (id, ad_id, agent_id, payer, amount) VALUES ($1, $2, $3, $4, $5)`,
    [nanoid(12), adId, agentId ?? null, req.payment?.payer ?? null, req.payment?.amount ?? null]
  );

  res.json({ ad });
});

export default router;
