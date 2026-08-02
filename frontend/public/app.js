// Point this at your backend. In docker-compose, the frontend container
// still calls the backend from the *browser*, so use the host-mapped URL.
const BACKEND_URL = window.BACKEND_URL || "http://localhost:4021";

document.addEventListener("DOMContentLoaded", () => {
  const mcpEl = document.getElementById("mcp-url");
  if (mcpEl) mcpEl.textContent = `${BACKEND_URL}/mcp`;
});
