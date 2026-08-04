import { declareDiscoveryExtension, validateDiscoveryExtension } from "@x402/extensions/bazaar";

console.log("=== Test 1: absolute minimal config ===");
const minimal = declareDiscoveryExtension({
  method: "GET",
  input: {},
  inputSchema: {},
});
console.log("Returned object:", JSON.stringify(minimal, null, 2));
console.log("\nValidation result:", JSON.stringify(validateDiscoveryExtension(minimal), null, 2));

console.log("\n=== Test 2: our actual queries config ===");
const real = declareDiscoveryExtension({
  method: "POST",
  input: { url: "https://example.com" },
  inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  bodyType: "json",
  output: { example: { ok: true } },
});
console.log("Returned object:", JSON.stringify(real, null, 2));
console.log("\nValidation result:", JSON.stringify(validateDiscoveryExtension(real), null, 2));
