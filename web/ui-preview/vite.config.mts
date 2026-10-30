import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Isolated component review: these replacements never participate in Next's application build.
export default defineConfig({
  root: file("./"),
  envDir: false,
  plugins: [{ name: "synthetic-actions", enforce: "pre", resolveId(source, importer) {
    const path = importer?.replaceAll("\\", "/") ?? "";
    if (source === "./actions" && path.includes("/content/coupons/")) return file("./coupons.ts");
    if (source === "./actions" && path.endsWith("/content/panels.ts")) return file("./content.ts");
  } }],
  resolve: { alias: [
    { find: "next/link", replacement: file("./link.tsx") },
    { find: "@/modules/auth", replacement: file("./auth.tsx") },
    { find: "@", replacement: file("../src") },
  ] },
  css: { postcss: file("../") },
  server: { host: "127.0.0.1", port: Number(process.env.EDRA_UI_PORT ?? 3101), strictPort: true, fs: { allow: [file("../")] } },
});
