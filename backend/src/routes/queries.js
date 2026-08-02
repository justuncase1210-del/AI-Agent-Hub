import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as cheerio from "cheerio";
import { db } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";

const router = Router();

const querySchema = z.object({
  url: z.string().url(),
  agentId: z.string().optional(),
});

/**
 * PAID — protected by x402PaymentMiddleware in index.js ("POST /api/queries").
 *
 * Fetches a URL and returns structured data extracted from the page:
 * title, meta description, and a plain-text snippet of the body. This is
 * the "web data" half of the project — swap fetchPageData for a scraper,
 * search API, database lookup, or automation job runner as your catalog grows.
 */
router.post("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  logSettledPayment(req, "queries");

  const { url, agentId } = parsed.data;

  let result;
  try {
    result = await fetchPageData(url);
  } catch (err) {
    // Payment has already settled by the time this handler runs, so a
    // failed fetch still needs a real response — return the error as
    // the paid result rather than silently succeeding with nothing.
    return res.status(502).json({
      error: "fetch_failed",
      message: err.message,
      url,
    });
  }

  db.prepare(
    `INSERT INTO query_log (id, agent_id, query_text, payer, amount) VALUES (?, ?, ?, ?, ?)`
  ).run(
    nanoid(12),
    agentId ?? null,
    url,
    req.payment?.payer ?? null,
    req.payment?.amount ?? null
  );

  res.json({ url, result });
});

async function fetchPageData(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-Agent-Hub/1.0 (+https://github.com)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`Expected text/html, got ${contentType || "unknown content-type"}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() || "";
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000);

  return {
    title,
    description,
    textSnippet: bodyText,
    fetchedAt: new Date().toISOString(),
  };
}

export default router;
