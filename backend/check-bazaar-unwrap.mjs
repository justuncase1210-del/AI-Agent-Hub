import { declareDiscoveryExtension, validateDiscoveryExtension } from "@x402/extensions/bazaar";

const minimal = declareDiscoveryExtension({
  method: "GET",
  input: {},
  inputSchema: {},
});

console.log("=== Passing the WRAPPED object (what we tried before) ===");
console.log(JSON.stringify(validateDiscoveryExtension(minimal), null, 2));

console.log("\n=== Passing UNWRAPPED (minimal.bazaar) ===");
console.log(JSON.stringify(validateDiscoveryExtension(minimal.bazaar), null, 2));

console.log("\n=== Passing just the schema itself (minimal.bazaar.schema) ===");
console.log(JSON.stringify(validateDiscoveryExtension(minimal.bazaar.schema), null, 2));
