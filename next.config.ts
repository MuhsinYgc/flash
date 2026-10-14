import os from "os";
import path from "path";
import type { NextConfig } from "next";

function devLanOrigins() {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) hosts.add(addr.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devLanOrigins(),
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/show-http/:path*",
        destination: `${(process.env.SHOW_SERVER_ORIGIN ?? `http://127.0.0.1:${process.env.SHOW_WS_PORT ?? "3202"}`).replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
