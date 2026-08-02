import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { config } from "./config.js";

/**
 * Price + description for every paid route in the app. Passed straight
 * into createX402Server, which registers `exact` + `upto` schemes for
 * EVM and `exact` for Solana on whichever networks CDP_X402_SERVER_ENVIRONMENT
 * selects, and auto-advertises the Bazaar discovery extension for each
 * "METHOD /path" key below.
 */
export const routeConfig = {
  "POST /api/queries": {
    price: `$${config.prices.query}`,
    description: "Run a single data query",
  },
  "POST /api/storage/upload": {
    price: `$${config.prices.storageUpload}`,
    description: "Store a file, billed per upload",
  },
  "GET /api/storage/:id": {
    price: `$${config.prices.storageDownload}`,
    description: "Download a stored file",
  },
  "POST /api/ads/impression": {
    price: `$${config.prices.adImpression}`,
    description: "Register a paid ad impression",
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
