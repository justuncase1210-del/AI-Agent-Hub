import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { buildX402Server } from "../x402.js";

/**
 * `createX402Server` is async (it may provision a wallet on first use),
 * so the middleware itself is built asynchronously at boot and awaited
 * once in index.js before the app starts listening.
 */
export async function createX402PaymentMiddleware() {
  const server = await buildX402Server();
  return paymentMiddlewareFromHTTPServer(server);
}

/**
 * Small helper for logging settled payments from inside a route handler,
 * e.g. to credit an agent's balance or write an invoice row.
 */
export function logSettledPayment(req, label) {
  if (req.payment) {
    console.log(
      `[x402] settled payment for "${label}" — payer: ${req.payment.payer ?? "unknown"}, ` +
        `amount: ${req.payment.amount ?? "?"}`
    );
  }
}
