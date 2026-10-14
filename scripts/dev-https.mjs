import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { ensureDevCert } from "./ensure-dev-cert.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 3200);
const host = process.env.HOST ?? "0.0.0.0";
const showPort = process.env.SHOW_WS_PORT ?? "3202";
const showWsTarget = `ws://127.0.0.1:${showPort}`;

ensureDevCert();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: root });
const handle = app.getRequestHandler();
const upgrade = () => app.getUpgradeHandler();

const showWss = new WebSocketServer({ noServer: true });

showWss.on("connection", (client) => {
  const upstream = new WebSocket(showWsTarget);
  /** @type {{ data: import("ws").RawData, isBinary: boolean }[]} */
  const pending = [];
  let closed = false;

  function closeBoth() {
    if (closed) return;
    closed = true;
    try {
      client.close();
    } catch {
      // ignore
    }
    try {
      upstream.close();
    } catch {
      // ignore
    }
  }

  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }
    pending.push({ data, isBinary });
  });

  upstream.on("open", () => {
    for (const item of pending) {
      upstream.send(item.data, { binary: item.isBinary });
    }
    pending.length = 0;
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  upstream.on("error", (error) => {
    console.error("[show-ws upstream]", error.message);
    closeBoth();
  });
  client.on("error", (error) => {
    console.error("[show-ws client]", error.message);
    closeBoth();
  });
  client.on("close", closeBoth);
  upstream.on("close", closeBoth);
});

const httpsOptions = {
  key: readFileSync(path.join(root, "certificates/localhost-key.pem")),
  cert: readFileSync(path.join(root, "certificates/localhost.pem")),
};

await app.prepare();

const server = createHttpsServer(httpsOptions, (req, res) => {
  handle(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const pathOnly = (req.url ?? "").split("?")[0] ?? "";
  if (pathOnly === "/show-ws" || pathOnly.startsWith("/show-ws/")) {
    showWss.handleUpgrade(req, socket, head, (ws) => {
      showWss.emit("connection", ws, req);
    });
    return;
  }
  upgrade()(req, socket, head);
});

server.listen(port, host, () => {
  console.log(`> flash https://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`> show-ws relay → ${showWsTarget}`);
});
