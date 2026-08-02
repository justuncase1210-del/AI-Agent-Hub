# AI Agent Hub

x402-compliant marketplace for AI agents. Agents pay USDC (on Base) directly
over HTTP — no API keys, no signup, no invoices — to buy:

- **Data queries** (`/api/queries`) — paid: fetch a URL for title/description/text, or extract all outbound links (`mode: "links"`)
- **Storage** (`/api/storage`) — paid file upload / download
- **Ads** (`/api/ads`) — paid ad impressions/clicks for agent-facing surfaces
- **Agent registry** (`/api/agents`) — agents register themselves, free tier

Every paid route returns **HTTP 402 Payment Required** with x402 payment
requirements when called without payment. An x402-aware client — e.g. a
`CdpX402Client` wrapped with `@x402/fetch`'s `wrapFetchWithPayment` —
signs a USDC payment and retries the request with a `PAYMENT-SIGNATURE`
header. The server, built with the CDP SDK's `createX402Server`, verifies
+ settles the payment through the CDP hosted facilitator, then serves
the resource.

The same paid capabilities are also exposed as **MCP tools**, so any
MCP-capable agent (Claude, etc.) can discover and call them directly —
the MCP tool calls proxy into the same x402-protected routes.

## Quick start

```bash
cp .env.example .env
# edit .env: set X402_PAY_TO_ADDRESS to your wallet

docker compose up --build
```

- Backend API: http://localhost:4021
- MCP endpoint: http://localhost:4021/mcp
- Frontend dashboard: http://localhost:3000

## Without Docker

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

## How the x402 flow works

1. Agent calls `POST /api/queries` with no payment.
2. Server (an `X402Server` from `createX402Server`) responds
   `402 Payment Required` with the accepted payment options — price,
   asset (USDC), network, and the receiving address.
3. Agent's client signs a payment (EIP-3009 `exact`/`upto`, or the
   Solana equivalent) and retries with a `PAYMENT-SIGNATURE` header.
4. `@x402/express`'s `paymentMiddlewareFromHTTPServer` calls the CDP
   hosted facilitator to **verify** the payment, runs the route handler,
   then calls the facilitator to **settle** it on-chain.
5. Server responds `200 OK` with the data, plus a settlement receipt.

See `backend/src/middleware/x402Payment.js` and `backend/src/x402.js`.
Route pricing lives in `x402.js`'s `routeConfig` map — everything else
(wallet provisioning, scheme registration, facilitator auth, Bazaar
discovery metadata) is handled by `createX402Server`.

## Project structure

```
ai-agent-hub/
├── .vscode/                     # debug/run configs for VS Code
├── backend/
│   ├── src/
│   │   ├── index.js             # Express app entrypoint
│   │   ├── config.js            # env config loader
│   │   ├── x402.js              # builds the CDP-backed X402Server + route pricing
│   │   ├── db.js                # sqlite (lowdb-free, better-sqlite3) layer
│   │   ├── routes/
│   │   │   ├── agents.js        # agent registration (free)
│   │   │   ├── storage.js       # paid upload/download
│   │   │   ├── queries.js       # paid data queries
│   │   │   └── ads.js           # paid ad impressions
│   │   ├── middleware/
│   │   │   └── x402Payment.js   # per-route x402 payment wrapper
│   │   └── mcp/
│   │       └── server.js        # MCP server exposing the same tools
│   ├── uploads/                 # file storage (docker volume)
│   ├── package.json
│   └── Dockerfile
├── frontend/                    # static dashboard (agents, revenue, ads)
├── client/                      # paying buyer scripts (proves the buy side)
│   ├── generate-wallet.mjs
│   ├── payForQuery.mjs
│   ├── payForUpload.mjs
│   ├── payForDownload.mjs
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Networks & facilitator (CDP SDK)

This scaffold uses the **CDP (Coinbase Developer Platform) SDK's** x402
primitives (`@coinbase/cdp-sdk/x402`) rather than wiring a facilitator
URL by hand. `createX402Server()` in `backend/src/x402.js`:

- reads `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` from env and authenticates
  with the **CDP hosted facilitator** (JWT-authenticated, no facilitator
  URL to configure);
- registers `exact` + `upto` payment schemes for EVM routes and `exact`
  for Solana;
- settles into `X402_PAY_TO_ADDRESS` directly if set, or otherwise
  provisions and manages its own CDP wallet (needs `CDP_WALLET_SECRET`
  in that case);
- picks its default networks from `CDP_X402_SERVER_ENVIRONMENT`:
  `development` → Base Sepolia + Solana Devnet, `production` → Base
  mainnet + Solana mainnet.

Create an API key at https://portal.cdp.coinbase.com, drop it into
`.env`, and you're set — no manual scheme registration or facilitator
auth-header wiring needed. On the client side, `CdpX402Client` (from
the same SDK) provisions a CDP-managed paying wallet with no private
keys to store, and supports client-side spend controls (per-payment
caps, rolling caps, network/asset/payee allowlists) if you build a
buyer alongside this seller.

## Funding a test wallet

On Base Sepolia, fund your receiving/paying address with test USDC via
the CDP faucet — either the portal (**Onchain Tools → Faucet** at
https://portal.cdp.coinbase.com) or programmatically with
`cdp.evm.requestFaucet({ address, network: "base-sepolia", token: "usdc" })`.

## Fallback path: vanilla `@x402/express` (no CDP SDK)

This scaffold defaults to the CDP SDK's `createX402Server` because it
handles wallet provisioning, scheme registration, and facilitator auth
for you. If you'd rather not depend on the CDP SDK at all — e.g. you're
managing your own signing keys, or want a facilitator other than
Coinbase's — you can drop down to the vanilla x402 packages instead.
This is a documented, supported path (from x402's own "Quickstart for
Sellers"), not a hack:

```typescript
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = express();
const evmAddress = "0xYourEvmAddress";
const svmAddress = "YourSolanaAddress";

// Testnet facilitator — free, no API key, Base Sepolia + Solana Devnet only.
// Confirmed explicitly NOT for production use.
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

// Mainnet: swap in the CDP hosted facilitator's REST endpoint directly
// (this is the underlying URL createX402Server calls for you — useful if
// you want CDP's facilitator without pulling in the rest of the CDP SDK):
//
// const facilitatorClient = new HTTPFacilitatorClient({
//   url: "https://api.cdp.coinbase.com/platform/v2/x402",
//   // still needs CDP_API_KEY_ID / CDP_API_KEY_SECRET auth — see the
//   // CDP facilitator docs for how to attach auth headers to this client.
// });
//
// Alternative third-party mainnet facilitator (no CDP account needed):
// const facilitatorClient = new HTTPFacilitatorClient({
//   url: "https://facilitator.payai.network",
// });

app.use(
  paymentMiddleware(
    {
      "POST /api/queries": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: "eip155:84532", // Base Sepolia — use eip155:8453 for mainnet
            payTo: evmAddress,
          },
        ],
        description: "Run a single data query",
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      "eip155:84532",
      new ExactEvmScheme()
    ),
  ),
);
```

If you go this route, replace `backend/src/x402.js` and
`backend/src/middleware/x402Payment.js` with this pattern instead of
`createX402Server` — the route handlers in `routes/*.js` don't change,
since `req.payment` is populated the same way either way.

**Facilitator URLs, confirmed:**

| Facilitator | URL | Networks | Auth |
|---|---|---|---|
| x402.org (testnet) | `https://x402.org/facilitator` | Base Sepolia, Solana Devnet | none |
| CDP hosted (mainnet) | `https://api.cdp.coinbase.com/platform/v2/x402` | Base, Solana, Polygon, Arbitrum, World mainnets | `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` |
| PayAI (mainnet, third-party) | `https://facilitator.payai.network` | check their docs for current coverage | varies |

Never point production traffic at the `x402.org` testnet facilitator —
it's explicitly documented as testnet-only.

## Buying from your own server (the client side)

Everything above is the **seller**. `client/` is a separate, minimal
**buyer** — a script that actually completes a payment against this
server, proving the full loop rather than just the 402 half.

```bash
cd client
npm install
cp .env.example .env
npm run generate-wallet
```
Copy the printed private key into `client/.env` as `EVM_PRIVATE_KEY`,
then fund that address with Base Sepolia testnet USDC via the CDP
faucet (portal.cdp.coinbase.com → Onchain Tools → Faucet). Wait ~30-60
seconds for the faucet transaction to confirm, then:

```bash
npm run pay-for-query -- https://example.com
```
This pays $0.01, then prints back the extracted page title/description/text
from `routes/queries.js`'s real fetch logic. A `payment-response` header
in the output is your on-chain settlement receipt.

**Storage round-trip** (upload, then download the same file):
```bash
npm run pay-for-upload
# prints a fileId — pay to download it back:
npm run pay-for-download -- <fileId>
```

This is also the only way to fully test `/api/storage/upload` — a plain
`curl` can't complete an x402 payment, so any curl-only test of a paid
route will only ever get you the 402 response, never the real result.

## Bazaar discovery — already on, needs a public URL to matter

Every route's 402 response already includes a `"bazaar"` block (you can
see it in the decoded `PAYMENT-REQUIRED` header on any paid request) —
`createX402Server` auto-injects the Bazaar discovery extension for every
route in `routeConfig`, with `discoverable` metadata generated from each
route's `description`. There's no extra code needed on your end; this is
different from the vanilla `@x402ResourceServer` path, which requires
manually setting `extensions: { bazaar: { discoverable: true, ... } }`
per route.

What listing actually requires beyond that:
1. **A payment has to settle through the facilitator** for a route to
   appear in the catalog — declaring the route isn't enough by itself.
   You've already cleared this: the `client/` payments earlier settled
   real transactions through the CDP facilitator on Base Sepolia.
2. **A public URL.** The `resource.url` in every 402 response is
   currently `http://localhost:4021/...` — not reachable by anyone but
   you. An external agent finding your listing in the Bazaar catalog
   still needs to actually call that URL to use it, so this only becomes
   meaningful once the backend is deployed somewhere with a real domain
   (see the deployment step in the mainnet checklist below).
3. To enrich what shows up in search/browsing (beyond the minimal
   auto-generated metadata), you can pass a `bazaar` block to
   `declareDiscoveryExtension` per route in `x402.js` — see the example
   in `docs.x402.org`'s seller quickstart, under "Enhance Discovery with
   Metadata."

You can browse the CDP facilitator's live catalog yourself once
deployed: `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?payTo=<your address>`.

## Mainnet checklist

Once you've verified the full buy/sell loop on testnet with `client/`:

1. **Deploy the backend somewhere with a public URL and a static IP** —
   a VPS, a container host, anything reachable from the internet.
   `localhost` can't be called by real agents or appear meaningfully in
   Bazaar. Once deployed, add that server's IP to your CDP API key's
   allowlist (portal.cdp.coinbase.com → the same screen where you opted
   out of allowlisting for local dev earlier).
2. Flip `CDP_X402_SERVER_ENVIRONMENT=production` in the **backend's** `.env`.
3. Point `X402_PAY_TO_ADDRESS` at a **real mainnet wallet you control** —
   double check this address before deploying; mainnet transactions are
   real money.
4. Fund a **buyer** wallet with real mainnet USDC if you're also testing
   the client against production — never reuse a testnet-only throwaway
   key from `generate-wallet.mjs` for this.
5. If you ever swap the CDP SDK for the vanilla `@x402/express` fallback
   above, use `https://api.cdp.coinbase.com/platform/v2/x402` — never
   leave `https://x402.org/facilitator` wired up for production traffic.
6. Expand `routes/queries.js`'s data source beyond single-page fetches if
   your catalog grows — rate limiting, caching, and a real allowlist of
   fetchable domains are worth adding before this is public-facing.
7. Re-run the SDK verification step from earlier
   (`node -e "import('@coinbase/cdp-sdk/x402').then(m => console.log(Object.keys(m)))"`)
   against whatever version `npm install` actually pulled — `latest` in
   `package.json` means it can drift between your dev machine and a
   fresh production deploy.

## Notes / next steps

- Dependencies for `@coinbase/cdp-sdk` and the `@x402/*` packages are
  pinned to `latest` in `backend/package.json` since this ecosystem
  moves fast — run `npm install` then check `npm list` if you want to
  pin exact versions for reproducible builds.
- `db.js` uses `better-sqlite3` for zero-config persistence; swap for
  Postgres by editing `db.js` and `docker-compose.yml` if you need
  concurrent writers at scale.
- `routes/queries.js` fetches a single URL and extracts title/description/
  text via `cheerio` — swap `fetchPageData` for a real scraper, search
  API, or automation job runner as the catalog grows beyond simple fetches.
- For an MCP server that also *pays* for x402-protected APIs (rather
  than just gating its own), see the CDP docs' MCP Server guide —
  `account.signX402Payment()` signs a payment directly for non-HTTP
  transports like MCP, no client wrapper needed.
- `backend/src/mcp/server.js` currently gates paid MCP tools by proxying
  each tool call into the x402-protected REST routes above (verified,
  working). There's a more "native" option — `@x402/mcp`'s
  `createPaymentWrapper` — but its exact API for attaching to
  `McpServer.registerTool` isn't documented publicly as of this writing.
  Before switching to it, inspect the type declarations yourself:
  `npm install @x402/mcp @x402/core @x402/evm @x402/extensions`, then
  `grep -A 15 "createPaymentWrapper" node_modules/@x402/mcp/dist/*.d.ts`.
