import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Same paying pattern as payForQuery.mjs, but against the multipart
 * POST /api/storage/upload route. FormData + fetch's native multipart
 * handling works fine through wrapFetchWithPayment — it only touches
 * headers/retries, not the body.
 */

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

// A small in-memory test file — swap for a real file read via fs if you want.
const fileContent = `Test upload from payForUpload.mjs at ${new Date().toISOString()}\n`;
const blob = new Blob([fileContent], { type: "text/plain" });
const form = new FormData();
form.append("file", blob, "test-upload.txt");
form.append("agentId", "test-buyer-script");

console.log(`Uploading a test file to: ${resourceServerUrl}/api/storage/upload`);
console.log("");

try {
  // Do NOT set Content-Type manually — fetch sets the multipart boundary
  // automatically when the body is a FormData instance.
  const response = await fetchWithPayment(`${resourceServerUrl}/api/storage/upload`, {
    method: "POST",
    body: form,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Upload failed: ${response.status}`, data);
    process.exit(1);
  }

  console.log("Payment succeeded. Upload result:");
  console.log(JSON.stringify(data, null, 2));

  if (data.downloadUrl) {
    console.log("");
    console.log(`Now try downloading it (also paid):`);
    console.log(`  node payForDownload.mjs ${data.fileId}`);
  }
} catch (err) {
  console.error("Payment or upload failed:", err.message);
  process.exit(1);
}
