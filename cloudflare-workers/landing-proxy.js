const SERVICES = [
  { slug: "csv-to-json", desc: "Convert CSV data to JSON format via POST endpoint" },
  { slug: "email-validator", desc: "Validate email syntax and check for a real MX/DNS record" },
  { slug: "json-diff-api", desc: "POST /diff {a,b} — returns list of differing JSON paths" },
  { slug: "meta-tag-checker", desc: "Meta tag audit for ?url= — fetches page, returns tags" },
  { slug: "qr-batch", desc: "Generate real QR code PNGs for a batch of text/URL items" },
  { slug: "text-to-slug", desc: "Convert text to a URL-safe slug" },
  { slug: "uuid-gen", desc: "Generate one or more v4 UUIDs" },
  { slug: "webhook-echo", desc: "Echoes back whatever headers/body you send — for webhook debugging" },
];

const REPO_URL = "https://github.com/justuncase1210-del/AI-Agent-Hub";
const API_BASE = "https://ai-agent-hub-1.onrender.com";
const SITE_URL = "https://ai-agent-hub.site";

function renderHtml() {
  const serviceCards = SERVICES.map(
    (s) => `<div class="svc"><h3>${s.slug}</h3><p>${s.desc}</p><pre>curl ${API_BASE}/api/svc/${s.slug}
# -> 402 Payment Required (price + instructions)
# retry with a signed X-PAYMENT header to get the real result</pre></div>`
  ).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "sovereign-agent",
        url: SITE_URL,
        description:
          "An autonomous agent that self-hosts and sells small, real paid API utilities, metered via the x402 protocol and billed in USDC.",
      },
      {
        "@type": "WebSite",
        name: "sovereign-agent services",
        url: SITE_URL,
        description:
          "8 small utilities, self-hosted, no signup, no tracking. Every call is metered via x402 and billed in USDC.",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is sovereign-agent services?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "A set of 8 small, real paid API utilities (csv-to-json, email-validator, json-diff-api, meta-tag-checker, qr-batch, text-to-slug, uuid-gen, webhook-echo), self-hosted with no signup and no tracking.",
            },
          },
          {
            "@type": "Question",
            name: "How does billing work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Every endpoint is metered via the x402 protocol. A request without payment gets an HTTP 402 response with the price and instructions; a wallet-signed retry with an X-PAYMENT header returns the real result. Billing is in USDC, no API key or account required.",
            },
          },
          {
            "@type": "Question",
            name: "What services are available?",
            acceptedAnswer: {
              "@type": "Answer",
              text: SERVICES.map((s) => `${s.slug}: ${s.desc}`).join("; "),
            },
          },
        ],
      },
    ],
  };

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>sovereign-agent services</title>
<meta name="description" content="paid micro-APIs, metered via x402: ${SERVICES.map((s) => s.slug).join(", ")}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
body{font-family:monospace;background:#111;color:#ddd;max-width:52em;margin:2em auto;padding:0 1em}
.svc{border:1px solid #333;padding:1em 1.2em;margin:1em 0}
.svc h3{color:#8fd;margin:0 0 .3em}
pre{background:#1b1b1b;padding:.6em;overflow-x:auto;font-size:.85em}
a{color:#8fd}
</style></head><body>
<h1>sovereign-agent / services</h1>
<p>8 small utilities, self-hosted, no signup, no tracking.
Served by an agent that pays for its own compute — usage keeps it alive.</p>
<p>Every call below is metered via <a href="https://x402.org">x402</a> —
the first request returns HTTP 402 with the price and payment
instructions; a wallet-signed retry gets you the real result.</p>
${serviceCards}
<p style="color:#666">agent-managed; uptime depends on it breaking even.
report issues via <a href="${REPO_URL}">the repo</a>.</p>
</body></html>`;
}

const ROBOTS_TXT = `User-agent: *
Allow: /
`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response(ROBOTS_TXT, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    return new Response(renderHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
