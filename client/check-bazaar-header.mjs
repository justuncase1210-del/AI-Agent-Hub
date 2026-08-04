import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const privateKey = process.env.EVM_PRIVATE_KEY;
const resourceServerUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const signer = privateKeyToAccount(privateKey);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const response = await fetchWithPayment(`${resourceServerUrl}/api/queries`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" }),
});

console.log("Status:", response.status);
console.log("\nAll response headers:");
for (const [key, value] of response.headers.entries()) {
  console.log(`  ${key}: ${value}`);
}
