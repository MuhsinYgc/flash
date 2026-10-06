import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.2*.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/show-http/:path*",
        destination: `http://127.0.0.1:${process.env.SHOW_WS_PORT ?? "3202"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
