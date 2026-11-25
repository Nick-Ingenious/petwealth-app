import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local dev reads the monorepo-root .env; CI and Vercel inject env vars directly.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

/** Baseline security headers for every response. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const config: NextConfig = {
  transpilePackages: ["@petwealth/api", "@petwealth/db", "@petwealth/domain", "@petwealth/integrations", "@petwealth/ui"],
  poweredByHeader: false,
  typedRoutes: true,
  // Lab exports are sent to a server action as text (about 110 KB per plate).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
