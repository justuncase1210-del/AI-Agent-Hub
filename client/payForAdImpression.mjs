import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Pays for and retrieves an ad impression.
 * Usage: node payForAdImpression.mjs <adId>
 */

const adId = process.argv[2];
if (!adId) {
  console.error("Usage: node payForAdImpression.mjs <adId>");
  console.error("(adId comes from POST /api/ads)");
  process.exit(1);
}

const privateKey = process.env.EVM_PRIVATE_KEY;
if (!privateKey) {
  console.error("Missing EVM_PRIVATE_KEY in client/.env — run `npm run generate-wallet` first.");
  process.exit(1);
}

const resourceServerUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

const signer = privateKeyToAccount(privateKey);
console.log(`Paying from wallet: ${signer.address}`);

const client = new x402Client();
registerExactEvmScheme(client, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

console.log(`Requesting a paid ad impression for adId="${adId}"`);
console.log(`Against: ${resourceServerUrl}/api/ads/impression`);
console.log("");

try {
  const response = await fetchWithPayment(`${resourceServerUrl}/api/ads/impression`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, agentId: "test-buyer-script" }),
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
    console.log(`\nSettlement receipt (base64): ${paymentResponseHeader}`);
  }
} catch (err) {
  console.error("Payment failed:", err.message);
  process.exit(1);
}
