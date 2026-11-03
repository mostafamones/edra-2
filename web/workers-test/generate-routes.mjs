import { Generator, getConfig } from "@tanstack/router-generator";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// The Start Vite plugin adds this type registration to its generated tree.
// Keep standalone generation identical, including during CI's drift check.
// Recheck against the installed Start plugin when upgrading the toolchain.
const routeTreeFileFooter = [`import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`];
const config = getConfig({ routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts", routeFileIgnorePattern: "\\.test\\.[^.]+$", routeTreeFileFooter }, root);
await new Generator({ config, root }).run();
