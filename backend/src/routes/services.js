import { Router } from "express";
import { pool } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";
import { internalHandlers } from "../internalServices.js";

const router = Router();

/**
 * PAID — protected by x402PaymentMiddleware in index.js
 * (GET/POST "/api/svc/:slug" in x402.js's routeConfig, an EXACT
 * single-segment match).
 *
 * Deliberately just "/:slug" — NOT "/:slug/*" — even though a service's
 * real logic might live at a sub-path like "/check". Callers never send
 * that sub-path; it's stored server-side as endpoint_path (set at
 * registration, see routes/servicesAdmin.js) and appended here before
 * forwarding. This keeps every client-facing call to this proxy an
 * exact match against x402's routeConfig, so it's always priced —
 * a "/:slug/*" wildcard version of this route was tried first and
 * silently bypassed pricing entirely, since the x402 SDK's route
 * matching didn't price the wildcarded sub-path.
 *
 * All registered slugs currently share one flat price (see the note
 * in x402.js on why per-slug pricing isn't supported by this SDK yet).
 */
router.all("/:slug", async (req, res) => {
    const { slug } = req.params;
    const result = await pool.query(
        `SELECT target_url, endpoint_path FROM registered_services WHERE slug = $1`,
        [slug]
    );
    if (result.rowCount === 0) {
        return res.status(404).json({ error: "unknown_service", slug });
    }
    logSettledPayment(req, `svc:${slug}`);

    const { target_url, endpoint_path } = result.rows[0];

    // "internal://self" means this slug is backed by a handler in
    // internalServices.js rather than an external target -- call it
    // directly, no outbound fetch, no third-party infra to keep alive.
    if (target_url === "internal://self") {
        const handler = internalHandlers[slug];
        if (!handler) {
            return res.status(500).json({ error: "internal_handler_missing", slug });
        }
        const { status, body, contentType } = await handler(req);
        return res.status(status).type(contentType).send(
            contentType === "application/json" ? JSON.stringify(body) : body
        );
    }

    const qsIndex = req.originalUrl.indexOf("?");
    const queryString = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : "";
    const target = new URL((endpoint_path || "/") + queryString, target_url);

    try {
        const upstream = await fetch(target, {
            method: req.method,
            headers: { "content-type": req.headers["content-type"] || "application/json" },
            body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
            signal: AbortSignal.timeout(15_000),
        });
        const text = await upstream.text();
        res
            .status(upstream.status)
            .type(upstream.headers.get("content-type") || "text/plain")
            .send(text);
    } catch (err) {
        res.status(502).json({ error: "proxy_failed", message: err.message });
    }
});

export default router;