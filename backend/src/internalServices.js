import QRCode from "qrcode";
import { parse as parseCsv } from "csv-parse/sync";
import dns from "node:dns";
import crypto from "node:crypto";

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

const MAX_CSV_LENGTH = 50_000;
const MAX_CSV_ROWS = 500;

async function csvToJson(req) {
  const csv = req.body?.csv;
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return { status: 400, body: { error: "csv (non-empty string) is required" }, contentType: "application/json" };
  }
  if (csv.length > MAX_CSV_LENGTH) {
    return { status: 400, body: { error: `csv exceeds max length of ${MAX_CSV_LENGTH}` }, contentType: "application/json" };
  }
  try {
    const records = parseCsv(csv, { columns: true, skip_empty_lines: true, trim: true });
    if (records.length > MAX_CSV_ROWS) {
      return { status: 400, body: { error: `csv exceeds max row count of ${MAX_CSV_ROWS}` }, contentType: "application/json" };
    }
    return { status: 200, body: { records, count: records.length }, contentType: "application/json" };
  } catch (err) {
    return { status: 400, body: { error: `csv parse failed: ${err.message}` }, contentType: "application/json" };
  }
}

const MAX_EMAIL_LENGTH = 320; // RFC 5321 hard limit
// Deliberately simple RFC 5322-ish check, not a full grammar -- catches
// the overwhelming majority of real typos/garbage without the edge-case
// maintenance burden of a complete RFC 5322 parser.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveMxWithTimeout(hostname, ms = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), ms);
    dns.resolveMx(hostname, (err, addresses) => {
      clearTimeout(timer);
      resolve(err ? [] : addresses);
    });
  });
}

async function emailValidator(req) {
  const email = req.body?.email;
  if (typeof email !== "string" || email.length === 0) {
    return { status: 400, body: { error: "email (non-empty string) is required" }, contentType: "application/json" };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { status: 400, body: { error: `email exceeds max length of ${MAX_EMAIL_LENGTH}` }, contentType: "application/json" };
  }
  const valid_syntax = EMAIL_RE.test(email);
  let has_mx_record = false;
  if (valid_syntax) {
    const domain = email.slice(email.lastIndexOf("@") + 1);
    const records = await resolveMxWithTimeout(domain);
    has_mx_record = records.length > 0;
  }
  return {
    status: 200,
    body: { email, valid_syntax, has_mx_record, valid: valid_syntax && has_mx_record },
    contentType: "application/json",
  };
}

const MAX_SLUG_TEXT_LENGTH = 1000;

async function textToSlug(req) {
  const text = req.body?.text;
  if (typeof text !== "string" || text.length === 0) {
    return { status: 400, body: { error: "text (non-empty string) is required" }, contentType: "application/json" };
  }
  if (text.length > MAX_SLUG_TEXT_LENGTH) {
    return { status: 400, body: { error: `text exceeds max length of ${MAX_SLUG_TEXT_LENGTH}` }, contentType: "application/json" };
  }
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { status: 200, body: { text, slug }, contentType: "application/json" };
}

const MAX_UUID_COUNT = 100;

async function uuidGen(req) {
  const raw = req.body?.count ?? req.query?.count ?? 1;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    return { status: 400, body: { error: "count must be a positive integer" }, contentType: "application/json" };
  }
  if (count > MAX_UUID_COUNT) {
    return { status: 400, body: { error: `count exceeds max of ${MAX_UUID_COUNT}` }, contentType: "application/json" };
  }
  const uuids = Array.from({ length: count }, () => crypto.randomUUID());
  return { status: 200, body: { uuids, count, version: "4" }, contentType: "application/json" };
}

export const internalHandlers = {
  "qr-batch": qrBatch,
  "csv-to-json": csvToJson,
  "email-validator": emailValidator,
  "text-to-slug": textToSlug,
  "uuid-gen": uuidGen,
};
