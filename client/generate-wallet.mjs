import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Generates a fresh throwaway EVM keypair for the BUYER role.
 *
 * NEVER reuse a wallet with real/mainnet funds for local testing — this
 * is a dev-only convenience. The private key is printed to your terminal;
 * copy it into client/.env as EVM_PRIVATE_KEY and keep that file out of git
 * (already covered by the root .gitignore's `.env` rule — copy that rule
 * into client/.gitignore too if you ever init a separate repo here).
 */
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Generated a new buyer wallet:");
console.log("  Address:     ", account.address);
console.log("  Private key: ", privateKey);
console.log("");
console.log("Next steps:");
console.log("  1. Copy the private key into client/.env as EVM_PRIVATE_KEY");
console.log("  2. Fund this address with Base Sepolia testnet USDC:");
console.log("     https://portal.cdp.coinbase.com -> Onchain Tools -> Faucet");
console.log(`     (paste address: ${account.address})`);
console.log("  3. Run `npm run pay-for-query` once funded.");
