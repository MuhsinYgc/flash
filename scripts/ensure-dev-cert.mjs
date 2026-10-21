import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const certDir = path.join(root, "certificates");
const certPath = path.join(certDir, "localhost.pem");
const keyPath = path.join(certDir, "localhost-key.pem");

function lanIpv4() {
  /** @type {string[]} */
  const out = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return [...new Set(out)];
}

function certSans() {
  if (!existsSync(certPath)) return [];
  try {
    const text = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-text"], {
      encoding: "utf8",
    });
    const ips = [...text.matchAll(/IP Address:([0-9.]+)/g)].map((m) => m[1]);
    const dns = [...text.matchAll(/DNS:([^,\s]+)/g)].map((m) => m[1]);
    return [...ips, ...dns];
  } catch {
    return [];
  }
}

function needsRegen() {
  if (!existsSync(certPath) || !existsSync(keyPath)) return true;
  const want = new Set(["127.0.0.1", "localhost", ...lanIpv4()]);
  const have = new Set(certSans());
  if (have.size === 0) return false;
  for (const item of want) {
    if (!have.has(item)) return true;
  }
  return false;
}

export function ensureDevCert() {
  mkdirSync(certDir, { recursive: true });
  if (!needsRegen()) return;
  const ips = lanIpv4();
  const sanParts = ["DNS:localhost", "IP:127.0.0.1", ...ips.map((ip) => `IP:${ip}`)];
  const opensslCnf = path.join(certDir, "openssl.cnf");
  writeFileSync(
    opensslCnf,
    `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = localhost
[v3_req]
subjectAltName = ${sanParts.join(",")}
`,
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "825",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-config",
      opensslCnf,
      "-extensions",
      "v3_req",
    ],
    { stdio: "inherit" },
  );
  console.log(`[dev-cert] SAN: ${sanParts.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensureDevCert();
}
