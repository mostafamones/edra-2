import { defineConfig, loadEnv, type Plugin } from "vite";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { validDevelopmentTunnelHost } from "./src/lib/routing/development";

const publicKeys = [
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "EDRA_COOKIE_DOMAIN",
  "EDRA_MARKETING_ORIGIN", "EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN",
] as const;

export default defineConfig(async ({ mode }) => {
  const [{ cloudflare }, { tanstackStart }, { default: react }] = await Promise.all([
    import("@cloudflare/vite-plugin"), import("@tanstack/react-start/plugin/vite"), import("@vitejs/plugin-react"),
  ]);
  const env = loadEnv(mode, process.cwd(), ["VITE_", "NEXT_PUBLIC_", "EDRA_DEV_TUNNEL_HOST"]);
  const tunnel = mode === "production" ? null : validDevelopmentTunnelHost(process.env.EDRA_DEV_TUNNEL_HOST ?? env.EDRA_DEV_TUNNEL_HOST);
  const define = Object.fromEntries(publicKeys.map((key) => [
    `import.meta.env.VITE_${key}`,
    JSON.stringify(env[`VITE_${key}`] ?? env[`NEXT_PUBLIC_${key}`] ?? ""),
  ]));
  return {
    define,
    // Academy slugs may be "assets". Keep framework assets in an invalid slug namespace.
    build: { assetsDir: "_build/assets" },
    resolve: { tsconfigPaths: true },
    server: { host: "127.0.0.1", port: 3000, allowedHosts: ["lvh.me", "app.lvh.me", "learn.lvh.me", ...(tunnel ? [tunnel.split(":")[0]] : [])] },
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
