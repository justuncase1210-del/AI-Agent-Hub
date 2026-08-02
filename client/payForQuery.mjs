import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Confirmed pattern from x402's own "Quickstart for Buyers" docs:
 *   1. Build a signer from a private key (viem).
 *   2. Create an x402Client and register the exact/EVM scheme with that signer.
 *   3. Wrap fetch with wrapFetchWithPayment — it handles the 402 retry loop
 *      automatically: request -> 402 -> sign payment -> retry with header -> 200.
 *
 * This buys ONE web-data query from ai-agent-hub's /api/queries endpoint.
 */

const privateKey = process.env.EVM_PRIVATE_KEY;
if (!privateKey) {
  console.error("Missing EVM_PRIVATE_KEY in client/.env — run `npm run generate-wallet` first.");
  process.exit(1);
}

const resourceServerUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const targetUrl = process.argv[2] || "https://example.com";

const signer = privateKeyToAccount(privateKey);
console.log(`Paying from wallet: ${signer.address}`);

const client = new x402Client();
registerExactEvmScheme(client, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

console.log(`Requesting a paid query for: ${targetUrl}`);
console.log(`Against: ${resourceServerUrl}/api/queries`);
console.log("");

try {
  const response = await fetchWithPayment(`${resourceServerUrl}/api/queries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Request failed: ${response.status}`, data);
    process.exit(1);
  }

  console.log("Payment succeeded. Result:");
  console.log(JSON.stringify(data, null, 2));

  const paymentResponseHeader = response.headers.get("payment-response");
  if (paymentResponseHeader) {
    console.log("");
    console.log("Settlement receipt (base64):", paymentResponseHeader);
  }
} catch (err) {
  console.error("Payment or request failed:", err.message);
  console.error(
    "If this is an insufficient-funds error, fund your wallet via the CDP faucet " +
      "(see generate-wallet.mjs output) and wait a minute for the balance to sync."
  );
  process.exit(1);
}
