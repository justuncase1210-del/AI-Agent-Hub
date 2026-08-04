// Runs once at container startup (before `serve` starts), writing the
// real backend URL into a small generated config.js that the static
// pages load before app.js. This is the standard pattern for injecting
// runtime environment variables into an otherwise-static site — `serve`
// itself can't template HTML/JS, so we generate a real file on disk
// instead of relying on a build-time value.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendUrl = process.env.BACKEND_PUBLIC_URL || "http://localhost:4021";

const content = `window.BACKEND_URL = ${JSON.stringify(backendUrl)};\n`;
fs.writeFileSync(path.join(__dirname, "public", "config.js"), content);

console.log(`[generate-config] wrote public/config.js with BACKEND_URL=${backendUrl}`);
