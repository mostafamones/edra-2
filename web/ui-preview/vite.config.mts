import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Isolated component review: these replacements never participate in Next's application build.
export default defineConfig({
  root: file("./"),
  envDir: false,
  plugins: [{ name: "synthetic-actions", enforce: "pre", resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    const target = resolve(dirname(importer), source);
    if (target === file("../src/modules/content/coupons/actions")) return file("./coupons.ts");
    if (target === file("../src/modules/content/actions")) return file("./content.ts");
  } }],
  resolve: { alias: [
    { find: "next/link", replacement: file("./link.tsx") },
    { find: "@/modules/auth", replacement: file("./auth.tsx") },
    { find: "@", replacement: file("../src") },
  ] },
  css: { postcss: file("../") },
  server: { host: "127.0.0.1", port: Number(process.env.EDRA_UI_PORT ?? 3101), strictPort: true, fs: { allow: [file("../")] } },
});
