import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

/**
 * Connection pool — reused across the app's lifetime, not per-request.
 * pg handles pooling/reconnects internally; just import `pool` and query it.
 */
export const pool = new Pool({ connectionString: config.db.url });

pool.on("error", (err) => {
  // Idle client errors (e.g. connection dropped) shouldn't crash the process.
  console.error("[db] Unexpected error on idle client", err);
});

const schema = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    wallet_address TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS query_log (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    query_text TEXT,
    payer TEXT,
    amount TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS ad_impressions (
    id TEXT PRIMARY KEY,
    ad_id TEXT,
    agent_id TEXT,
    payer TEXT,
    amount TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS ads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    target_url TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS registered_services (
    slug TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    endpoint_path TEXT NOT NULL DEFAULT '/',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
`;

/**
 * Called once at boot (see index.js) before the app starts accepting
 * requests — creates tables if they don't exist yet. Safe to run on
 * every startup; CREATE TABLE IF NOT EXISTS is a no-op after the first run.
 *
 * NOTE: CREATE TABLE IF NOT EXISTS won't add endpoint_path to a table
 * created before this column existed. If registered_services already
 * exists from an earlier run, add it manually once:
 *   ALTER TABLE registered_services ADD COLUMN IF NOT EXISTS endpoint_path TEXT NOT NULL DEFAULT '/';
 */
export async function initDb() {
  await pool.query(schema);
  await pool.query(
    `ALTER TABLE registered_services ADD COLUMN IF NOT EXISTS endpoint_path TEXT NOT NULL DEFAULT '/'`
  );
  console.log("[db] schema ready");
}

export default pool;