import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Pays for and downloads a file previously uploaded via payForUpload.mjs.
 * Usage: node payForDownload.mjs <fileId>
 */

const fileId = process.argv[2];
if (!fileId) {
  console.error("Usage: node payForDownload.mjs <fileId>");
  console.error("(fileId comes from payForUpload.mjs's output)");
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

console.log(`Requesting paid download: ${resourceServerUrl}/api/storage/${fileId}`);
console.log("");

try {
  const response = await fetchWithPayment(`${resourceServerUrl}/api/storage/${fileId}`, {
    method: "GET",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error(`Download failed: ${response.status}`, data);
    process.exit(1);
  }

  const text = await response.text();
  console.log("Payment succeeded. File contents:");
  console.log(text);
} catch (err) {
  console.error("Payment or download failed:", err.message);
  process.exit(1);
}
