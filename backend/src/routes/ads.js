import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";

const router = Router();

// Free — list active ads (agents browse before "buying" an impression).
router.get("/", (_req, res) => {
  const ads = db.prepare(`SELECT * FROM ads WHERE active = 1 ORDER BY created_at DESC`).all();
  res.json({ ads });
});

// Free — create an ad listing (in production, gate this behind your own auth).
const createAdSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  targetUrl: z.string().url().optional(),
});

router.post("/", (req, res) => {
  const parsed = createAdSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  const id = nanoid(12);
  const { title, body, targetUrl } = parsed.data;
  db.prepare(
    `INSERT INTO ads (id, title, body, target_url) VALUES (?, ?, ?, ?)`
  ).run(id, title, body ?? null, targetUrl ?? null);
  res.status(201).json({ adId: id });
});

// PAID — protected by x402PaymentMiddleware in index.js ("POST /api/ads/impression").
// An agent "buys" an impression: it pays a fraction of a cent and gets
// back the ad payload to show/act on (e.g. surface it to an end user).
const impressionSchema = z.object({
  adId: z.string(),
  agentId: z.string().optional(),
});

router.post("/impression", (req, res) => {
  const parsed = impressionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  logSettledPayment(req, "ads.impression");

  const { adId, agentId } = parsed.data;
  const ad = db.prepare(`SELECT * FROM ads WHERE id = ? AND active = 1`).get(adId);
  if (!ad) return res.status(404).json({ error: "ad_not_found" });

  db.prepare(
    `INSERT INTO ad_impressions (id, ad_id, agent_id, payer, amount) VALUES (?, ?, ?, ?, ?)`
  ).run(
    nanoid(12),
    adId,
    agentId ?? null,
    req.payment?.payer ?? null,
    req.payment?.amount ?? null
  );

  res.json({ ad });
});

export default router;
