import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { config } from "./config.js";

/**
 * Price + description for every paid route, PLUS an explicit Bazaar
 * discovery declaration per route.
 *
 * Why explicit, when createX402Server auto-injects a minimal one: per
 * CDP's own docs, a route is only discoverable if its Bazaar `input`
 * passes STRICT JSON Schema validation. The SDK's auto-injected minimal
 * metadata doesn't describe real input/output shapes, so it very
 * plausibly fails that validation silently. Declaring `extensions`
 * explicitly here OVERRIDES the auto-injected version.
 *
 * IMPORTANT: `declareDiscoveryExtension(...)` already returns the full
 * `{ bazaar: { info, schema } }` shape — assign its return value
 * directly to `extensions`, do NOT wrap it in another `{ bazaar: ... }`
 * yourself. Confirmed via a local dry run: wrapping it again produces
 * a generic, misleading "schema must be object or boolean" validation
 * failure with no indication that the real problem is double-nesting.
 */
export const routeConfig = {
  "POST /api/queries": {
    price: `$${config.prices.query}`,
    description: "Fetch a URL and extract structured data (title, links, images, or metadata)",
    extensions: declareDiscoveryExtension({
      method: "POST",
      input: { url: "https://example.com", mode: "fetch" },
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch and extract data from" },
          mode: {
            type: "string",
            enum: ["fetch", "links", "images", "metadata"],
            description: "Extraction mode — defaults to \"fetch\"",
          },
          agentId: { type: "string", description: "Optional registered agent id for attribution" },
        },
        required: ["url"],
      },
      bodyType: "json",
      output: {
        example: {
          url: "https://example.com",
          mode: "fetch",
          result: {
            title: "Example Domain",
            description: "",
            textSnippet: "Example Domain This domain is for use in documentation examples...",
            fetchedAt: "2026-08-03T00:00:00.000Z",
          },
        },
        schema: {
          type: "object",
          properties: {
            url: { type: "string" },
            mode: { type: "string" },
            result: { type: "object" },
          },
        },
      },
    }),
  },

  "POST /api/storage/upload": {
    price: `$${config.prices.storageUpload}`,
    description: "Store a file via multipart upload, billed per upload",
    extensions: declareDiscoveryExtension({
      method: "POST",
      input: { file: "(binary file data)", agentId: "optional-agent-id" },
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "The file to upload (multipart/form-data)" },
          agentId: { type: "string", description: "Optional registered agent id for attribution" },
        },
        required: ["file"],
      },
      bodyType: "form-data",
      output: {
        example: {
          fileId: "kSDnsx7caPv4",
          downloadUrl: "/api/storage/kSDnsx7caPv4",
        },
        schema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
            downloadUrl: { type: "string" },
          },
        },
      },
    }),
  },

  "GET /api/storage/:id": {
    price: `$${config.prices.storageDownload}`,
    description: "Download a previously stored file by its fileId",
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: {},
      inputSchema: { type: "object", properties: {} },
      output: {
        example: "(raw file content, Content-Type matches the original upload)",
        schema: { type: "string" },
      },
    }),
  },

  "POST /api/ads/impression": {
    price: `$${config.prices.adImpression}`,
    description: "Pay a fraction of a cent to retrieve an ad payload for a given adId",
    extensions: declareDiscoveryExtension({
      method: "POST",
      input: { adId: "example-ad-id", agentId: "optional-agent-id" },
      inputSchema: {
        type: "object",
        properties: {
          adId: { type: "string", description: "The id of the ad to retrieve" },
          agentId: { type: "string", description: "Optional registered agent id for attribution" },
        },
        required: ["adId"],
      },
      bodyType: "json",
      output: {
        example: {
          ad: {
            id: "example-ad-id",
            title: "Example Ad",
            body: "Example ad body text",
            target_url: "https://example.com",
          },
        },
        schema: {
          type: "object",
          properties: {
            ad: { type: "object" },
          },
        },
      },
    }),
  },
};

/**
 * Builds the X402Server once at boot. Reads CDP_API_KEY_ID /
 * CDP_API_KEY_SECRET (and CDP_WALLET_SECRET, if provisioning a CDP wallet)
 * from env automatically.
 *
 * If X402_PAY_TO_ADDRESS is set, payments settle straight into that
 * address and no wallet secret is needed. Otherwise createX402Server
 * provisions and manages its own CDP-hosted receiving wallet.
 */
export async function buildX402Server() {
  const server = await createX402Server({
    routes: routeConfig,
    ...(config.x402.payToAddress && {
      payToConfig: { type: "address", evm: config.x402.payToAddress },
    }),
  });

  console.log(`[x402] server ready — environment: ${config.x402.environment}`);
  if (server.payToEvmAddress) {
    console.log(`[x402] receiving EVM payments at ${server.payToEvmAddress}`);
  }

  return server;
}
