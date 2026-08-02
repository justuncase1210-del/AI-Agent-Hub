import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "../config.js";

const BASE_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${config.port}`;

/**
 * Every tool here is a thin proxy onto an x402-protected REST route.
 *
 * MCP itself has no notion of "402 Payment Required", so the pattern is:
 *   1. Agent calls the tool with no `paymentHeader`.
 *   2. Our proxy hits the real route, gets a 402 + payment requirements,
 *      and returns that JSON back to the agent as the tool result.
 *   3. The agent's wallet signs the requirements into an X-PAYMENT value
 *      and calls the tool again, passing it as `paymentHeader`.
 *   4. Our proxy forwards it as the X-PAYMENT header; the underlying
 *      route verifies + settles via the x402 facilitator and returns
 *      the real resource, which we hand back to the agent.
 */
async function callPaidRoute(method, path, { body, paymentHeader } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (paymentHeader) headers["X-PAYMENT"] = paymentHeader;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const paymentResponseHeader = res.headers.get("x-payment-response");
  const data = await res.json().catch(() => ({}));

  return {
    status: res.status,
    paymentRequired: res.status === 402,
    paymentResponse: paymentResponseHeader,
    data,
  };
}

export function createMcpServer() {
  const server = new McpServer({
    name: "ai-agent-hub",
    version: "1.0.0",
  });

  server.registerTool(
    "run_query",
    {
      title: "Run a paid web-data query",
      description:
        `Fetch a URL and extract structured data, paying in USDC via x402 (${config.x402.environment} networks). ` +
        `mode "fetch" (default) returns title/description/text; mode "links" returns every outbound link. ` +
        `Call without paymentHeader first to receive the price + payment requirements; ` +
        `retry with paymentHeader set to a signed X-PAYMENT value to get the result.`,
      inputSchema: {
        url: z.string().url().describe("The URL to fetch and extract data from"),
        mode: z.enum(["fetch", "links"]).optional().describe("Defaults to \"fetch\""),
        agentId: z.string().optional().describe("Your registered agent id, for attribution"),
        paymentHeader: z
          .string()
          .optional()
          .describe("Signed x402 X-PAYMENT payload (base64). Omit on first call."),
      },
    },
    async ({ url, mode, agentId, paymentHeader }) => {
      const result = await callPaidRoute("POST", "/api/queries", {
        body: { url, mode, agentId },
        paymentHeader,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "extract_links",
    {
      title: "Extract all links from a page (paid)",
      description:
        "Convenience wrapper around run_query with mode=\"links\" — fetches a URL and " +
        "returns every outbound link, resolved to absolute URLs and deduped. Same price " +
        "and payment flow as run_query.",
      inputSchema: {
        url: z.string().url().describe("The URL to extract links from"),
        agentId: z.string().optional(),
        paymentHeader: z.string().optional(),
      },
    },
    async ({ url, agentId, paymentHeader }) => {
      const result = await callPaidRoute("POST", "/api/queries", {
        body: { url, mode: "links", agentId },
        paymentHeader,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "download_file",
    {
      title: "Download a stored file (paid)",
      description:
        "Pay in USDC via x402 to download a file previously stored via POST /api/storage/upload. " +
        "Call without paymentHeader first to receive the price + payment requirements.",
      inputSchema: {
        fileId: z.string().describe("The fileId returned by the upload endpoint"),
        paymentHeader: z.string().optional(),
      },
    },
    async ({ fileId, paymentHeader }) => {
      const result = await callPaidRoute("GET", `/api/storage/${fileId}`, { paymentHeader });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "upload_file",
    {
      title: "Upload a file to paid storage",
      description:
        "Store a small text payload as a file, paying in USDC via x402. " +
        "For binary uploads, use the REST endpoint directly instead of this tool.",
      inputSchema: {
        filename: z.string(),
        contentBase64: z.string().describe("Base64-encoded file content"),
        paymentHeader: z.string().optional(),
      },
    },
    async ({ filename, contentBase64, paymentHeader }) => {
      // Multipart isn't convenient over a JSON tool call, so this tool
      // documents intent; wire it to a multipart-capable fetch if you
      // need agents to upload arbitrary binaries via MCP directly.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                note:
                  "Use POST /api/storage/upload (multipart/form-data) directly for uploads; " +
                  "this tool is a placeholder for agents that only speak MCP JSON tool calls.",
                filename,
                bytes: Buffer.from(contentBase64, "base64").length,
                paymentHeader: paymentHeader ? "provided" : "not provided",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_ad_impression",
    {
      title: "Buy an ad impression",
      description:
        "Pay a fraction of a cent in USDC via x402 to retrieve an ad payload for a given adId.",
      inputSchema: {
        adId: z.string(),
        agentId: z.string().optional(),
        paymentHeader: z.string().optional(),
      },
    },
    async ({ adId, agentId, paymentHeader }) => {
      const result = await callPaidRoute("POST", "/api/ads/impression", {
        body: { adId, agentId },
        paymentHeader,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_ads",
    {
      title: "List active ads",
      description: "Free — list currently active ads available for paid impressions.",
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${BASE_URL}/api/ads`);
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.registerTool(
    "register_agent",
    {
      title: "Register as an agent",
      description: "Free — register to get an agentId used for attribution on paid calls.",
      inputSchema: {
        name: z.string(),
        walletAddress: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ name, walletAddress, description }) => {
      const res = await fetch(`${BASE_URL}/api/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, walletAddress, description }),
      });
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

/**
 * Mount the MCP server on an Express app using the streamable-HTTP
 * transport, stateless-per-request (simplest option for a public,
 * pay-per-call agent endpoint).
 */
export function attachMcpHttp(app, mountPath) {
  app.all(mountPath, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
}
