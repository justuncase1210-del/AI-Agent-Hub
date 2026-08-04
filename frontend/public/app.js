// BACKEND_URL comes from config.js, generated at container startup from
// the BACKEND_PUBLIC_URL environment variable — see generate-config.js.
// Falls back to localhost for local dev (docker-compose sets the env var
// explicitly; running `npm run dev` directly also regenerates config.js
// from whatever BACKEND_PUBLIC_URL is in your shell, defaulting to
// localhost:4021 if unset).
const BACKEND_URL = window.BACKEND_URL || "http://localhost:4021";

document.addEventListener("DOMContentLoaded", () => {
  const mcpEl = document.getElementById("mcp-url");
  if (mcpEl) mcpEl.textContent = `${BACKEND_URL}/mcp`;
});
