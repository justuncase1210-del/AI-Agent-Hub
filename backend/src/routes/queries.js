import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as cheerio from "cheerio";
import { db } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";

const router = Router();

const querySchema = z.object({
  url: z.string().url(),
  mode: z.enum(["fetch", "links"]).default("fetch"),
  agentId: z.string().optional(),
});

/**
 * PAID — protected by x402PaymentMiddleware in index.js ("POST /api/queries").
 *
 * Two modes on the same priced route:
 *   - "fetch" (default): title, meta description, plain-text snippet.
 *   - "links": every outbound <a href> on the page, resolved to absolute
 *     URLs, deduped.
 *
 * Swap fetchPageData/extractLinks for a real scraper, search API, database
 * lookup, or automation job runner as the catalog grows — the payment gate
 * and logging around it don't need to change either way.
 */
router.post("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  logSettledPayment(req, "queries");

  const { url, mode, agentId } = parsed.data;

  let result;
  try {
    const html = await fetchHtml(url);
    result = mode === "links" ? extractLinks(html, url) : extractPageData(html);
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
    `[${mode}] ${url}`,
    req.payment?.payer ?? null,
    req.payment?.amount ?? null
  );

  res.json({ url, mode, result });
});

async function fetchHtml(url) {
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

  return response.text();
}

function extractPageData(html) {
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

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const absolute = new URL(href, baseUrl).toString();
      seen.add(absolute);
    } catch {
      // Malformed href — skip rather than fail the whole request.
    }
  });

  return {
    linkCount: seen.size,
    links: Array.from(seen).slice(0, 200), // cap payload size
    fetchedAt: new Date().toISOString(),
  };
}

export default router;
