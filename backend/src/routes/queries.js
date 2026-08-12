import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as cheerio from "cheerio";
import { ProxyAgent } from "undici";
import { pool } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";
import { config } from "../config.js";

const proxyAgent = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : undefined;
if (proxyAgent) {
  const redacted = config.proxyUrl.replace(/\/\/[^@]+@/, "//<redacted>@");
  console.log(`[queries] outbound fetches routed through proxy: ${redacted}`);
} else {
  console.log("[queries] no outbound proxy configured - fetching directly");
}

const router = Router();

const querySchema = z.object({
  url: z.string().url(),
  mode: z.enum(["fetch", "links", "images", "metadata", "json"]).default("fetch"),
  agentId: z.string().optional(),
});

/**
 * PAID - protected by x402PaymentMiddleware in index.js ("POST /api/queries").
 *
 * Five modes on the same priced route:
 *   - "fetch" (default): title, meta description, plain-text snippet, from an HTML page.
 *   - "links": every outbound <a href> on an HTML page, resolved + deduped.
 *   - "images": every <img src> on an HTML page, resolved + deduped, with alt text.
 *   - "metadata": all <meta> tags on an HTML page, plus response headers.
 *   - "json": fetches a URL expected to return JSON directly (APIs, data
 *     feeds) and returns the parsed body as-is. Added because the other
 *     four modes all hard-required text/html and would reject any real
 *     JSON API outright - a genuine gap, not a deliberate restriction.
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
    if (mode === "json") {
      result = await fetchJson(url);
    } else {
      const { html, headers } = await fetchHtml(url);
      result = runExtractor(mode, html, url, headers);
    }
  } catch (err) {
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

/// Fetches a URL expected to return JSON (a real API, a data feed) and
/// returns the parsed body directly. Same proxy, timeout, and User-Agent
/// as fetchHtml - just a different Accept header and no HTML parsing.
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AI-Agent-Hub/1.0 (+https://github.com)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    ...(proxyAgent && { dispatcher: proxyAgent }),
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    // Some real APIs mislabel their content-type - try parsing anyway
    // rather than reject outright, but only after a stricter check
    // failed, so a genuinely wrong URL still errors clearly.
    const text = await response.text();
    try {
      return { data: JSON.parse(text), fetchedAt: new Date().toISOString(), note: "content-type was not application/json, but parsed successfully anyway" };
    } catch {
      throw new Error(`Expected JSON, got ${contentType || "unknown content-type"} and body did not parse as JSON either`);
    }
  }

  const data = await response.json();
  return { data, fetchedAt: new Date().toISOString() };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-Agent-Hub/1.0 (+https://github.com)" },
    signal: AbortSignal.timeout(10_000),
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
      // Malformed href - skip rather than fail the whole request.
    }
  });
  return {
    linkCount: seen.size,
    links: Array.from(seen).slice(0, 200),
    fetchedAt: new Date().toISOString(),
  };
}

function extractImages(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Map();
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("data:")) return;
    try {
      const absolute = new URL(src, baseUrl).toString();
      if (!seen.has(absolute)) {
        seen.set(absolute, $(el).attr("alt")?.trim() || "");
      }
    } catch {
      // Malformed src - skip rather than fail the whole request.
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