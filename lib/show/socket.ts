import {
  getShowWsUrl,
  type ClientMessage,
  type ServerMessage,
  type ShowRole,
} from "./protocol";

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export function connectShowSocket(
  role: ShowRole,
  roomId: string,
  handlers: Handlers,
) {
  let socket: WebSocket | null = null;
  let closed = false;
  let retries = 0;
  let reconnectTimer = 0;

  function send(msg: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  function open() {
    if (closed) return;
    const url = getShowWsUrl();
    socket = new WebSocket(url);

    socket.onopen = () => {
      retries = 0;
      send({ type: "hello", role, roomId });
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
