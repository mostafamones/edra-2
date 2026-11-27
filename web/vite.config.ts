import { defineConfig, loadEnv, type Plugin } from "vite";
import { readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { validDevelopmentTunnelHost } from "./src/lib/routing/development";

const publicKeys = [
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "EDRA_COOKIE_DOMAIN",
  "EDRA_MARKETING_ORIGIN", "EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN",
] as const;

export default defineConfig(async ({ mode, command }) => {
  const [{ cloudflare }, { tanstackStart }, { default: react }] = await Promise.all([
    import("@cloudflare/vite-plugin"), import("@tanstack/react-start/plugin/vite"), import("@vitejs/plugin-react"),
  ]);
  const env = loadEnv(mode, process.cwd(), ["VITE_", "NEXT_PUBLIC_", "EDRA_DEV_TUNNEL_HOST"]);
  const tunnel = mode === "production" ? null : validDevelopmentTunnelHost(process.env.EDRA_DEV_TUNNEL_HOST ?? env.EDRA_DEV_TUNNEL_HOST);
  let devPort = 3000;
  if (command === "serve" && mode === "development") {
    const args = process.argv;
    const index = args.indexOf("--port");
    const explicit = args.find(arg => arg.startsWith("--port="))?.slice(7) ?? (index >= 0 ? args[index + 1] : undefined);
    for (const candidate of explicit ? [Number(explicit)] : [3000, 3001, 3002, 3003, 3004]) {
      const available = await new Promise<boolean>((resolve, reject) => {
        const probe = createServer();
        probe.once("error", (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE" ? resolve(false) : reject(error));
        probe.listen(candidate, "127.0.0.1", () => probe.close(() => resolve(true)));
      });
      if (available) { devPort = candidate; break; }
      if (candidate === 3004 || explicit) throw new Error("Development port unavailable (3000–3004).");
    }
    for (const key of ["EDRA_MARKETING_ORIGIN", "EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN"]) {
      const host = key === "EDRA_APP_ORIGIN" ? "app.lvh.me" : key === "EDRA_LEARN_ORIGIN" ? "learn.lvh.me" : "lvh.me";
      const url = new URL(env[`VITE_${key}`] || `http://${host}:3000`);
      if (url.protocol === "http:" && ["lvh.me", "app.lvh.me", "learn.lvh.me"].includes(url.hostname)) {
        url.port = String(devPort);
        env[`VITE_${key}`] = url.origin;
      }
    }
  }
  const define = Object.fromEntries(publicKeys.map((key) => [
    `import.meta.env.VITE_${key}`,
    JSON.stringify(env[`VITE_${key}`] ?? env[`NEXT_PUBLIC_${key}`] ?? ""),
  ]));
  if (command === "serve" && mode === "development") {
    for (const key of ["EDRA_MARKETING_ORIGIN", "EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN"]) {
      define[`process.env.${key}`] = JSON.stringify(env[`VITE_${key}`]);
    }
  }
  return {
    define,
    // Academy slugs may be "assets". Keep framework assets in an invalid slug namespace.
    build: { assetsDir: "_build/assets" },
    resolve: { tsconfigPaths: true },
    server: { host: "127.0.0.1", port: devPort, strictPort: true, allowedHosts: ["lvh.me", "app.lvh.me", "learn.lvh.me", ...(tunnel ? [tunnel.split(":")[0]] : [])] },
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tanstackStart({ srcDirectory: "src", router: { routeFileIgnorePattern: "\\.test\\.[^.]+$" }, importProtection: { behavior: "error" } }),
      react(),
      {
        name: "exclude-local-secret-artifacts",
        enforce: "post",
        apply: "build",
        generateBundle(_options, bundle) {
          for (const name of Object.keys(bundle)) {
            if (/^(?:\.dev\.vars|\.env)/.test(name.split("/").pop()!)) delete bundle[name];
          }
        },
        async closeBundle() {
          if (this.environment.name !== "ssr") return;
          // Includes files copied from public/ and stale files, without reading their contents.
          let found = false;
          async function clean(dir: string): Promise<void> {
            let entries;
            try { entries = await readdir(dir, { withFileTypes: true }); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
            for (const entry of entries) {
              const path = join(dir, entry.name);
              if (/^(?:\.dev\.vars|\.env)/.test(entry.name)) { await rm(path, { recursive: true, force: true }); found = true; }
              else if (entry.isDirectory()) await clean(path);
            }
          }
          await clean("dist");
          if (found) throw new Error("Secret-named build artifact removed; inspect public assets and rebuild");
        },
      } satisfies Plugin,
    ],
  };
});
