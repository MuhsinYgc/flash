import {
  getShowWsUrls,
  type ClientMessage,
  type ServerMessage,
  type ShowRole,
} from "./protocol";

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

type SocketOptions = {
  token?: string;
  maxRetries?: number;
};

export function connectShowSocket(
  role: ShowRole,
  roomId: string,
  handlers: Handlers,
  options: SocketOptions = {},
) {
  let socket: WebSocket | null = null;
  let closed = false;
  let retries = 0;
  let urlIndex = 0;
  let reconnectTimer = 0;
  const urls = getShowWsUrls();
  const maxRetries = options.maxRetries ?? 8;

  function send(msg: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  function open() {
    if (closed || urls.length === 0) return;
    const url = urls[urlIndex % urls.length];
    socket = new WebSocket(url);

    socket.onopen = () => {
      retries = 0;
      send({ type: "hello", role, roomId, token: options.token });
      handlers.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      handlers.onClose?.();
      if (closed) return;
      retries += 1;
      if (retries >= maxRetries) return;
      urlIndex += 1;
      const wait = Math.min(4000, 400 * retries);
      reconnectTimer = window.setTimeout(open, wait);
    };

    socket.onerror = () => {
      socket?.close();
    };
  }

  open();

  return {
    send,
    close() {
      closed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
