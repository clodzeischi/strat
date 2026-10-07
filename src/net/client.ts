import type { ClientMsg, ServerMsg } from './protocol';

/** The game server's WebSocket: on the same host and port the page came from (the server serves both). */
export function serverUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** A JSON-over-WebSocket connection to the game server. */
export class NetClient {
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: () => void = () => {};
  private ws: WebSocket | null = null;

  /** Resolves once connected; rejects if the server can't be reached. */
  connect(url = serverUrl()): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`Can't reach the game server at ${url}`));
      ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      ws.onclose = () => {
        if (this.ws === ws) this.onClose();
      };
    });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
