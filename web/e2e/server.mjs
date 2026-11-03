import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
// Refuse an occupied port before sending any readiness request to it.
const portCheck = createServer();
await new Promise((resolve, reject) => {
  portCheck.once("error", () => reject(new Error("Port 3100 is unavailable. Stop the server using it before running test:e2e.")));
  portCheck.listen(3100, "127.0.0.1", resolve);
});
await new Promise((resolve, reject) => portCheck.close((error) => error ? reject(error) : resolve()));

// Privileged fixture settings are used only by Node setup/assertion helpers.
const allowedEnv = new Set([
  "PATH", "HOME", "TMPDIR", "CI", "GITHUB_ACTIONS", "NODE_ENV",
  "EDRA_MARKETING_ORIGIN", "EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN", "EDRA_DEV_TUNNEL_HOST",
  "VITE_EDRA_MARKETING_ORIGIN", "VITE_EDRA_APP_ORIGIN", "VITE_EDRA_LEARN_ORIGIN",
  "VITE_EDRA_COOKIE_DOMAIN", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY",
]);
const serverEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnv.has(key)));
// vite.config.ts strips dist/server/.dev.vars, so the Worker reads the origins baked from VITE_* at build.
// Build with the same public settings that the worker will serve. Playwright owns
// this process only in CI; preview runs the built Worker through workerd.
const build = spawn(process.execPath, [vite, "build"], { stdio: "inherit", env: serverEnv });
const buildCode = await new Promise((resolve, reject) => {
  build.once("error", reject);
  build.once("exit", (code) => resolve(code ?? 1));
});
if (buildCode !== 0) process.exit(buildCode);
const server = spawn(process.execPath, [
  vite, "preview", "--host", "127.0.0.1", "--port", "3100", "--strictPort",
], { stdio: "inherit", env: serverEnv });

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.on("exit", (code) => process.exit(code ?? 1));

// Playwright kills the whole process group at teardown, including this child.
// Probe loopback with the canonical Host and require the actual login response.
function loginReady() {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: 3100,
      path: "/auth/login",
      headers: { host: "app.lvh.me:3100" },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode === 200));
    });
    request.on("error", () => resolve(false));
    request.setTimeout(110_000, () => request.destroy());
  });
}

while (!await loginReady()) await setTimeout(250);
console.log("E2E login ready on port 3100");
