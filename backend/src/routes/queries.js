import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as cheerio from "cheerio";
import { ProxyAgent } from "undici";
import { pool } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";
import { config } from "../config.js";

// Built once at module load if OUTBOUND_PROXY_URL is set — reused across
// requests rather than constructing a new agent per call. Stays undefined
// (no proxying) when the env var is unset, which is the default.
const proxyAgent = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : undefined;
if (proxyAgent) {
  // Redact credentials before logging — proxyUrl is user:pass@host:port.
  const redacted = config.proxyUrl.replace(/\/\/[^@]+@/, "//<redacted>@");
  console.log(`[queries] outbound fetches routed through proxy: ${redacted}`);
} else {
  console.log("[queries] no outbound proxy configured — fetching directly");
}

const router = Router();

const querySchema = z.object({
  url: z.string().url(),
  mode: z.enum(["fetch", "links", "images", "metadata"]).default("fetch"),
  agentId: z.string().optional(),
});

/**
 * PAID — protected by x402PaymentMiddleware in index.js ("POST /api/queries").
 *
 * Four modes on the same priced route:
 *   - "fetch" (default): title, meta description, plain-text snippet.
 *   - "links": every outbound <a href> on the page, resolved + deduped.
 *   - "images": every <img src> on the page, resolved + deduped, with alt text.
 *   - "metadata": all <meta> tags (Open Graph, Twitter Card, standard) as a
 *     flat key/value map, plus response headers from the upstream fetch.
 *
 * Swap the extract* functions for a real scraper, search API, database
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
    const { html, headers } = await fetchHtml(url);
    result = runExtractor(mode, html, url, headers);
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

  await pool.query(
    `INSERT INTO query_log (id, agent_id, query_text, payer, amount) VALUES ($1, $2, $3, $4, $5)`,
    [nanoid(12), agentId ?? null, `[${mode}] ${url}`, req.payment?.payer ?? null, req.payment?.amount ?? null]
  );

  res.json({ url, mode, result });
});

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-Agent-Hub/1.0 (+https://github.com)" },
    signal: AbortSignal.timeout(10_000),
    // Routes through Webshare (or any configured proxy) when
    // OUTBOUND_PROXY_URL is set; native, unproxied fetch otherwise.
    ...(proxyAgent && { dispatcher: proxyAgent }),
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`Expected text/html, got ${contentType || "unknown content-type"}`);
  }

  const headers = Object.fromEntries(response.headers.entries());
  const html = await response.text();
  return { html, headers };
}

function runExtractor(mode, html, url, headers) {
  switch (mode) {
    case "links":
      return extractLinks(html, url);
    case "images":
      return extractImages(html, url);
    case "metadata":
      return extractMetadata(html, headers);
    default:
      return extractPageData(html);
  }
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
      seen.add(new URL(href, baseUrl).toString());
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

function extractImages(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Map(); // absolute URL -> alt text (dedupe by URL)

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("data:")) return;
    try {
      const absolute = new URL(src, baseUrl).toString();
      if (!seen.has(absolute)) {
        seen.set(absolute, $(el).attr("alt")?.trim() || "");
      }
    } catch {
      // Malformed src — skip rather than fail the whole request.
    }
  });

  return {
    imageCount: seen.size,
    images: Array.from(seen.entries())
      .slice(0, 200)
      .map(([src, alt]) => ({ src, alt })),
    fetchedAt: new Date().toISOString(),
  };
}

function extractMetadata(html, headers) {
  const $ = cheerio.load(html);
  const meta = {};

  $("meta").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property");
    const content = $(el).attr("content");
    if (name && content !== undefined) meta[name] = content;
  });

  return {
    meta,
    responseHeaders: {
      contentType: headers["content-type"] || null,
      server: headers["server"] || null,
      lastModified: headers["last-modified"] || null,
    },
    fetchedAt: new Date().toISOString(),
  };
}

export default router;
