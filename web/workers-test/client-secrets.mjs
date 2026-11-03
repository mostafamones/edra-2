import { readdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checks = [
  ...["SUPABASE_SERVICE_ROLE_KEY", "STAFF_INVITE_LINK_KEY", "MUX_TOKEN_SECRET", "MUX_SIGNING_PRIVATE_KEY", "MUX_WEBHOOK_SECRET", "MUX_TOKEN_ID"].map((name) => [name, new RegExp(name)]),
  ["EDRA_DEV_ secret", /EDRA_DEV_[A-Z0-9_]+/],
  ["PEM key block", /-----BEGIN[ A-Z]*PRIVATE KEY-----\s*(?:\\n)?[A-Za-z0-9+/]{16}/],
  ["JWT-looking key", /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],
  ["server source marker", /(?:^|[\\/"'\s])[^\\/"'\s]+\.server(?:\.[cm]?[jt]sx?)(?:["'\s?#:]|$)/m],
];
async function scan(dir) {
  const found = new Set();
  let javascriptFiles = 0;
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        if (/\.[cm]?js$/.test(entry.name)) javascriptFiles += 1;
        const content = await readFile(full, "utf8");
        for (const [name, pattern] of checks) if (pattern.test(content)) found.add(name);
      }
    }
  }
  await walk(dir);
  return { found, javascriptFiles };
}
const fixture = await mkdtemp(join(tmpdir(), "edra-secret-scan-"));
try {
  await writeFile(join(fixture, "fixture.map"), "SUPABASE_SERVICE_ROLE_KEY");
  if (!(await scan(fixture)).found.has("SUPABASE_SERVICE_ROLE_KEY")) throw new Error("Secret scanner self-test failed");
} finally { await rm(fixture, { recursive: true, force: true }); }
try {
  const { found, javascriptFiles } = await scan(process.argv[2] ?? "dist/client");
  if (!javascriptFiles) { console.error("Client secret scan failed: no JavaScript bundle files"); process.exitCode = 1; }
  else if (found.size) { console.error(`Client secret scan failed: ${[...found].join(", ")}`); process.exitCode = 1; }
  else console.log(`Client secret scan passed (${javascriptFiles} JavaScript files; self-test passed)`);
} catch { console.error("Client secret scan failed: output directory unavailable"); process.exitCode = 1; }
