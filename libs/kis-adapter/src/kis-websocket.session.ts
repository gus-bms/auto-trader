import WebSocket from "ws";

import { KisConfigError } from "./kis-errors";
import type { KisWebSocket, KisWebSocketFactory, KisWebSocketSessionOptions, KisWsSubscription } from "./kis-websocket.types";

const WS_OPEN_READY_STATE = 1;

export class KisWebSocketSession {
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly websocketFactory: KisWebSocketFactory;

  private socket: KisWebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private subscriptions: KisWsSubscription[] = [];

  constructor(private readonly options: KisWebSocketSessionOptions) {
    this.validateOptions(options);

    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  }

  start(subscriptions: KisWsSubscription[]): void {
    this.stopped = false;
    this.subscriptions = normalizeSubscriptions(subscriptions);

    if (this.socket !== null) {
      if (this.isConnected()) {
        this.subscribeAll();
      }

      return;
    }

    this.connect();
  }

  stop(closeCode: number = 1000): void {
    this.stopped = true;
    this.clearReconnectTimer();

    if (this.socket !== null) {
      this.socket.close(closeCode);
      this.socket = null;
    }
  }

  updateSubscriptions(subscriptions: KisWsSubscription[]): void {
    this.subscriptions = normalizeSubscriptions(subscriptions);

    if (this.isConnected()) {
      this.subscribeAll();
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WS_OPEN_READY_STATE;
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    const socket = this.websocketFactory(this.options.wsUrl);
    this.socket = socket;

    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.subscribeAll();
      this.runHook(() => this.options.onOpen?.());
    });

    socket.on("message", (rawData: unknown) => {
      const normalized = normalizeRawMessage(rawData);
      this.runHook(() => this.options.onMessage?.(normalized));
    });

    socket.on("error", (error: unknown) => {
      const normalized = normalizeError(error);
      this.runHook(() => this.options.onError?.(normalized));
    });

    socket.on("close", (code: number, reason: unknown) => {
      this.socket = null;
      const normalizedReason = normalizeCloseReason(reason);

      this.runHook(() => this.options.onClose?.(code, normalizedReason));

      if (this.stopped) {
        return;
      }

      this.scheduleReconnect();
    });
  }

  private subscribeAll(): void {
    if (!this.isConnected() || this.socket === null) {
      return;
    }

    for (const subscription of this.subscriptions) {
      this.socket.send(JSON.stringify(buildSubscribeFrame(subscription, this.options)));
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delayMs = Math.min(
      this.options.reconnectMaxMs,
      this.options.reconnectBaseMs * 2 ** this.reconnectAttempt
    );

    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    this.clearTimeoutFn(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private runHook(hook: () => void | Promise<void> | undefined): void {
    const maybePromise = hook();

    if (maybePromise !== undefined && maybePromise instanceof Promise) {
      void maybePromise.catch(() => undefined);
    }
  }

  private validateOptions(sessionOptions: KisWebSocketSessionOptions): void {
    if (sessionOptions.wsUrl.trim().length === 0) {
      throw new KisConfigError("KIS WebSocket URL is required");
    }

    if (sessionOptions.approvalKey.trim().length === 0) {
      throw new KisConfigError("KIS WebSocket approval key is required");
    }

    if (sessionOptions.reconnectBaseMs <= 0 || sessionOptions.reconnectMaxMs <= 0) {
      throw new KisConfigError("KIS WebSocket reconnect intervals must be positive");
    }
  }
}

function defaultWebSocketFactory(url: string): KisWebSocket {
  return new WebSocket(url) as unknown as KisWebSocket;
}

function normalizeSubscriptions(subscriptions: KisWsSubscription[]): KisWsSubscription[] {
  const deduped = new Map<string, KisWsSubscription>();

  for (const subscription of subscriptions) {
    const trId = subscription.trId.trim();
    const trKey = subscription.trKey.trim().toUpperCase();
    if (trId.length === 0 || trKey.length === 0) {
      continue;
    }

    const dedupeKey = `${trId}:${trKey}`;
    deduped.set(dedupeKey, { trId, trKey });
  }

  return [...deduped.values()];
}

function buildSubscribeFrame(
  subscription: KisWsSubscription,
  options: Pick<KisWebSocketSessionOptions, "approvalKey" | "customerType">
): {
  header: {
    approval_key: string;
    custtype: "P" | "B";
    tr_type: "1";
    "content-type": "utf-8";
  };
  body: {
    input: {
      tr_id: string;
      tr_key: string;
    };
  };
} {
  return {
    header: {
      approval_key: options.approvalKey,
      custtype: options.customerType,
      tr_type: "1",
      "content-type": "utf-8"
    },
    body: {
      input: {
        tr_id: subscription.trId,
        tr_key: subscription.trKey
      }
    }
  };
}

function normalizeRawMessage(rawData: unknown): string {
  if (typeof rawData === "string") {
    return rawData;
  }

  if (Buffer.isBuffer(rawData)) {
    return rawData.toString("utf8");
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData.map((chunk) => normalizeRawChunk(chunk))).toString("utf8");
  }

  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString("utf8");
  }

  if (ArrayBuffer.isView(rawData)) {
    return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString("utf8");
  }

  return String(rawData);
}

function normalizeRawChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk, "utf8");
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk);
  }

  if (ArrayBuffer.isView(chunk)) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  return Buffer.from(String(chunk), "utf8");
}

function normalizeCloseReason(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }

  if (Buffer.isBuffer(reason)) {
    return reason.toString("utf8");
  }

  return String(reason);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
