export interface KisWsSubscription {
  trId: string;
  trKey: string;
}

export interface KisWebSocket {
  readyState: number;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: unknown) => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  on(event: "close", listener: (code: number, reason: unknown) => void): this;
  send(data: string): void;
  close(code?: number): void;
}

export type KisWebSocketFactory = (url: string) => KisWebSocket;

export interface KisWebSocketSessionOptions {
  wsUrl: string;
  approvalKey: string;
  customerType: "P" | "B";
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  websocketFactory?: KisWebSocketFactory;
  onMessage?: (rawMessage: string) => void | Promise<void>;
  onOpen?: () => void | Promise<void>;
  onClose?: (code: number, reason: string) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}
