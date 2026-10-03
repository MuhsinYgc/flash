import path from "path";
import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3201";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.70",
    "192.168.*.*",
    "10.*.*.*",
  ],
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/show-http/:path*",
        destination: `http://127.0.0.1:${process.env.SHOW_WS_PORT ?? "3202"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
