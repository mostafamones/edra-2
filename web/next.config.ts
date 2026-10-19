import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["lvh.me", "app.lvh.me", "learn.lvh.me"],
  experimental: {
    // Avoid costly disk-cache compaction during local development.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
