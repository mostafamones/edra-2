import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile, mkdir, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative, join, extname } from "node:path";

const root = process.cwd();
const fake = { VITE_SUPABASE_URL: "https://supabase.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "fixture", VITE_EDRA_MARKETING_ORIGIN: "https://edra.test", VITE_EDRA_APP_ORIGIN: "https://app.edra.test", VITE_EDRA_LEARN_ORIGIN: "https://learn.edra.test", VITE_EDRA_COOKIE_DOMAIN: "edra.test" };
const built = process.argv.slice(2);
if (built.length && (built.length !== 1 || built[0] !== "--built")) throw new Error("Usage: node workers-test/run.mjs [--built]");
if (!built.length) {
  const generate = spawnSync(process.execPath, [resolve("workers-test/generate-routes.mjs")], { stdio: "inherit" });
  if (generate.status !== 0) process.exit(generate.status ?? 1);
  const standaloneRoutes = await readFile(resolve("src/routeTree.gen.ts"), "utf8");
  const build = spawnSync(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "build"], { stdio: "inherit", env: { ...process.env, ...fake } });
  if (build.status !== 0) process.exit(build.status ?? 1);
  if (await readFile(resolve("src/routeTree.gen.ts"), "utf8") !== standaloneRoutes) throw new Error("Standalone and Start build route generation differ");
} else console.log("Testing existing build; build and separate codec/dependency suites are not run.");
const temp = await mkdtemp(join(tmpdir(), "edra-workerd-"));
try {
  const directory = resolve("dist/server");
  const entries = [];
  let resolver;
  let sharpFound = false;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        if (/^(?:\.dev\.vars|\.env)/.test(entry.name)) throw new Error("Secret-named artifact in dist");
        if (entry.name.includes("server-fn-resolver") && entry.name.endsWith(".mjs")) resolver = file;
        const extension = extname(file);
        const name = relative(directory, file).replaceAll("\\", "/");
        if (extension === ".node" || /(?:^|\/)sharp(?:\/|\.|$)/i.test(name)) sharpFound = true;
        if ([".mjs", ".js", ".map"].includes(extension)) {
          const content = await readFile(file, "utf8");
          if (/node_modules[\\/]sharp[\\/]|@img[\\/]sharp-|sharp-[a-z0-9-]+\.node/i.test(content)) sharpFound = true;
        }
        const kind = extension === ".mjs" || extension === ".js" ? "esModule" : extension === ".wasm" ? "wasm" : undefined;
        if (kind) {
          await mkdir(join(temp, "modules", relative(directory, dir)), { recursive: true });
          await copyFile(file, join(temp, "modules", name));
          entries.push(`(name = ${JSON.stringify(name)}, ${kind} = embed ${JSON.stringify(`modules/${name}`)})`);
        }
      }
    }
  }
  // Check the entire output, including assets, without opening secret-named files.
  async function assertNoSecretFiles(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (/^(?:\.dev\.vars|\.env)/.test(entry.name)) throw new Error("Secret-named artifact in dist");
      if (entry.isDirectory()) await assertNoSecretFiles(join(dir, entry.name));
    }
  }
  await assertNoSecretFiles(resolve("dist"));
  await walk(directory);
  if (!resolver) throw new Error("Missing server-function resolver");
  const manifest = await readFile(resolver, "utf8");
  const ids = {};
  for (const name of ["getSignedIn", "loadAccount", "searchAcademyFn"]) {
    const matches = [...manifest.matchAll(new RegExp(`["']([a-f0-9]{64}(?:_\\d+)?)["']\\s*:\\s*\\{\\s*functionName:\\s*["']${name}_createServerFn_handler["']`, "g"))];
    if (matches.length !== 1) throw new Error(`Expected one server function for ${name}`);
    ids[name] = matches[0][1];
  }
  if (sharpFound) throw new Error("Server bundle contains sharp or a native addon");
  await copyFile(resolve(root, "workers-test/runtime.mjs"), join(temp, "test.mjs"));
  if (!entries.some((entry) => entry.startsWith('(name = "index.mjs"'))) throw new Error("Missing Worker entry dist/server/index.mjs");
  const bindings = Object.entries({ ...fake, TEST_RPC_IDS: JSON.stringify(ids) }).map(([name, value]) => `(name = ${JSON.stringify(name)}, text = ${JSON.stringify(value)})`).join(", ");
  const config = `using Workerd = import "/workerd/workerd.capnp";\nconst config :Workerd.Config = (services = [(name = "test", worker = (compatibilityDate = "2026-10-30", compatibilityFlags = ["nodejs_compat"], globalOutbound = "blocked", bindings = [${bindings}], modules = [(name = "test.mjs", esModule = embed ${JSON.stringify("test.mjs")}), ${entries.join(", ")}])) , (name = "blocked", network = (allow = []))]);\n`;
  const path = join(temp, "config.capnp");
  await writeFile(path, config);
  const result = spawnSync(resolve("node_modules/.bin/workerd"), ["test", path], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
// Codec and dependency suites bundle their own modules; no sockets, network or secrets.
if (!built.length) for (const script of ["workers-test/image-build.mjs", "workers-test/mux.deps-build.mjs"]) {
  if (spawnSync(process.execPath, [script], { stdio: "inherit" }).status !== 0) process.exitCode = 1;
}
if (!built.length && spawnSync(resolve("node_modules/.bin/workerd"), ["test", "mux.capnp"], { stdio: "inherit", cwd: "workers-test" }).status !== 0) process.exitCode = 1;
