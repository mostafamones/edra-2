import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.EDRA_E2E === "1" ? ".next-e2e" : ".next",
  allowedDevOrigins: ["lvh.me", "app.lvh.me", "learn.lvh.me"],
  experimental: {
    // Avoid costly disk-cache compaction during local development.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
