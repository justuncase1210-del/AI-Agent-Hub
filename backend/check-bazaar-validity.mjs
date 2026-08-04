import { routeConfig } from "./src/x402.js";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";

for (const [route, config] of Object.entries(routeConfig)) {
  console.log(`\n=== ${route} ===`);
  try {
    const result = validateDiscoveryExtension(config.extensions.bazaar);
    console.log("VALID:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.log("INVALID:", err.message);
  }
}
