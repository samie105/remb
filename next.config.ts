import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Route mcp.useremb.com/* → /api/mcp (Streamable HTTP MCP endpoint)
        {
          source: "/:path*",
          has: [{ type: "host", value: "mcp.useremb.com" }],
          destination: "/api/mcp",
        },
      ],
    };
  },
} satisfies NextConfig;

export default withPWA(nextConfig);
