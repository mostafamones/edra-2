import { spawn } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
// Refuse an occupied port before sending any readiness request to it.
const portCheck = createServer();
await new Promise((resolve, reject) => {
  portCheck.once("error", () => reject(new Error("Port 3100 is unavailable. Stop the server using it before running test:e2e.")));
  portCheck.listen(3100, "127.0.0.1", resolve);
});
await new Promise((resolve, reject) => portCheck.close((error) => error ? reject(error) : resolve()));

// Privileged fixture settings are used only by Node setup/assertion helpers.
const serverEnv = { ...process.env };
for (const key of Object.keys(serverEnv)) {
  if (/^(ATTENDANCE_|PG|SUPABASE_|EDRA_DB_TEST_)/.test(key)) delete serverEnv[key];
}
const server = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "dev", "--hostname", "localhost", "--port", "3100",
], { stdio: "inherit", env: serverEnv });

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.on("exit", (code) => process.exit(code ?? 1));

// Playwright kills the whole process group at teardown, including this child.
// Next normalizes its request origin to localhost; binding the same name keeps proxy rewrites internal.
// Use loopback transport with the canonical Host to avoid DNS and preserve
// host validation. Warm the login route before the 30-second tests begin.
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
