import QRCode from "qrcode";

/**
 * Self-hosted real implementations for registered_services rows whose
 * target_url is the sentinel "internal://self" (see routes/services.js).
 * Used instead of an external Akash/third-party target_url when the
 * operator wants a slug backed by this same server, with no outbound
 * network hop and no separate infra to keep alive.
 *
 * Each handler receives the raw Express req and returns
 * { status, body, contentType }. Keep handlers pure request/response --
 * routes/services.js is the only caller and already did the payment gate
 * before reaching here.
 */

const MAX_BATCH_ITEMS = 25;
const MAX_ITEM_LENGTH = 500;

async function qrBatch(req) {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "items (non-empty array of strings) is required" }, contentType: "application/json" };
  }
  if (items.length > MAX_BATCH_ITEMS) {
    return { status: 400, body: { error: `items exceeds max batch size of ${MAX_BATCH_ITEMS}` }, contentType: "application/json" };
  }
  const results = [];
  for (const text of items) {
    if (typeof text !== "string" || text.length === 0) {
      results.push({ text, error: "must be a non-empty string" });
      continue;
    }
    if (text.length > MAX_ITEM_LENGTH) {
      results.push({ text, error: `exceeds max length of ${MAX_ITEM_LENGTH}` });
      continue;
    }
    try {
      const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2 });
      results.push({ text, png_data_url: dataUrl });
    } catch (err) {
      results.push({ text, error: err.message });
    }
  }
  return { status: 200, body: { results }, contentType: "application/json" };
}

export const internalHandlers = {
  "qr-batch": qrBatch,
};
