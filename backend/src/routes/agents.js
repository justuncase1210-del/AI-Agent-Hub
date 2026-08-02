import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(120),
  walletAddress: z.string().optional(),
  description: z.string().max(1000).optional(),
});

// Free — agents self-register to get an agent_id used for logging/attribution.
router.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const id = nanoid(12);
  const { name, walletAddress, description } = parsed.data;

  db.prepare(
    `INSERT INTO agents (id, name, wallet_address, description) VALUES (?, ?, ?, ?)`
  ).run(id, name, walletAddress ?? null, description ?? null);

  res.status(201).json({ agentId: id, name });
});

router.get("/:id", (req, res) => {
  const agent = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(req.params.id);
  if (!agent) return res.status(404).json({ error: "not_found" });
  res.json(agent);
});

router.get("/", (_req, res) => {
  const agents = db.prepare(`SELECT id, name, created_at FROM agents ORDER BY created_at DESC LIMIT 100`).all();
  res.json({ agents });
});

export default router;
