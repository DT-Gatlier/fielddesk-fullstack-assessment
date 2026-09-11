const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type RealtimeEvent = {
  type: string;
  organisationId: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

function toWebSocketUrl(): string {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/v1/realtime";
  return url.toString();
}

export function connectRealtime(
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void,
): () => void {
  let socket: WebSocket | null = null;
  let retries = 0;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    socket = new WebSocket(toWebSocketUrl());

    socket.addEventListener("open", () => {
      retries = 0;
    });

    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        if (event.type === "connection.ready") {
          return;
        }
        onEvent(event);
      } catch {
        // Ignore malformed frames.
      }
    });

    socket.addEventListener("close", () => {
      if (closed) {
        return;
      }
      const delay = Math.min(30_000, 1000 * 2 ** retries);
      retries += 1;
      retryTimer = setTimeout(() => {
        onReconnect?.();
        connect();
      }, delay);
    });
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
    socket?.close();
  };
}
