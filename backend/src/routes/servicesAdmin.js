import { Router } from "express";
import { pool } from "../db.js";
import { config } from "../config.js";

const router = Router();

/**
 * ADMIN-ONLY — registers a new service slug pointing at target_url,
 * plus the service's real internal endpoint_path (e.g. "/check" for
 * meta-tag-checker). Gated by a shared-secret header since this app
 * has no other auth yet.
 *
 * Requires ADMIN_TOKEN to be set in env / config.js.
 *
 * endpoint_path exists so CALLERS never need to know or send it —
 * every registered service is reachable at the flat, single-segment
 * path /api/svc/:slug, with no sub-path required. This is deliberate:
 * x402.js's routeConfig prices "GET/POST /api/svc/:slug" as an EXACT
 * match. A caller request to /api/svc/:slug/anything falls outside
 * that match entirely and passes through the payment middleware
 * unpriced — confirmed happened in practice with meta-tag-checker's
 * /check sub-path before this fix. The proxy (routes/services.js) now
 * looks up endpoint_path server-side and forwards there internally,
 * so the target service's own route shape (e.g. /check) never has to
 * leak into the client-facing, priced URL.
 */
/**
 * ADMIN-ONLY — lists every registered_services row as-is, so the
 * operator can audit what each slug actually points to (external
 * target_url vs "internal://self") without touching the DB directly.
 */
router.get("/", async (req, res) => {
    if (!config.adminToken || req.headers["x-admin-token"] !== config.adminToken) {
        return res.status(401).json({ error: "unauthorized" });
    }
    const result = await pool.query(
        `SELECT slug, target_url, endpoint_path, description, created_at FROM registered_services ORDER BY slug`
    );
    res.json({ services: result.rows });
});

router.post("/register", async (req, res) => {
    if (!config.adminToken || req.headers["x-admin-token"] !== config.adminToken) {
        return res.status(401).json({ error: "unauthorized" });
    }
    const { slug, target_url, endpoint_path, description } = req.body || {};
    if (!slug || !target_url) {
        return res.status(400).json({ error: "slug and target_url are required" });
    }
    await pool.query(
        `INSERT INTO registered_services (slug, target_url, endpoint_path, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET target_url = $2, endpoint_path = $3, description = $4`,
        [slug, target_url, endpoint_path || "/", description ?? null]
    );
    res.json({ slug, target_url, endpoint_path: endpoint_path || "/", registered: true });
});

export default router;