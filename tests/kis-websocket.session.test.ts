import assert from "node:assert/strict";
import test from "node:test";

import { type KisWebSocket, type KisWebSocketFactory, KisWebSocketSession } from "../libs/kis-adapter/src";

test("sends subscription frames when websocket opens", () => {
  const socket = new FakeKisWebSocket();

  const session = new KisWebSocketSession({
    wsUrl: "wss://example.com/ws",
    approvalKey: "approval-key",
    customerType: "P",
    reconnectBaseMs: 10,
    reconnectMaxMs: 100,
    websocketFactory: () => socket
  });

  session.start([{ trId: "HDFSCNT0", trKey: "soxl" }]);
  socket.emitOpen();

  assert.equal(socket.sent.length, 1);
  const frame = JSON.parse(socket.sent[0]) as {
    body: { input: { tr_id: string; tr_key: string } };
    header: { approval_key: string; custtype: string };
  };

  assert.equal(frame.header.approval_key, "approval-key");
  assert.equal(frame.body.input.tr_id, "HDFSCNT0");
  assert.equal(frame.body.input.tr_key, "SOXL");
});

test("reconnects and re-subscribes after unexpected websocket close", async () => {
  const firstSocket = new FakeKisWebSocket();
  const secondSocket = new FakeKisWebSocket();

  const sockets = [firstSocket, secondSocket];
  let factoryCallCount = 0;

  const websocketFactory: KisWebSocketFactory = () => {
    const nextSocket = sockets.at(factoryCallCount);
    factoryCallCount += 1;

    if (nextSocket === undefined) {
      throw new Error("No fake socket left for test");
    }

    return nextSocket;
  };

  const session = new KisWebSocketSession({
    wsUrl: "wss://example.com/ws",
    approvalKey: "approval-key",
    customerType: "P",
    reconnectBaseMs: 1,
    reconnectMaxMs: 2,
    websocketFactory
  });

  session.start([{ trId: "HDFSCNT0", trKey: "TQQQ" }]);
  firstSocket.emitOpen();
  firstSocket.emitClose(1006, "abnormal close");

  await sleep(10);

  assert.equal(factoryCallCount, 2);

  secondSocket.emitOpen();
  assert.equal(secondSocket.sent.length, 1);

  session.stop();
});

test("does not reconnect after explicit stop", async () => {
  const socket = new FakeKisWebSocket();
  let factoryCallCount = 0;

  const session = new KisWebSocketSession({
    wsUrl: "wss://example.com/ws",
    approvalKey: "approval-key",
    customerType: "P",
    reconnectBaseMs: 1,
    reconnectMaxMs: 2,
    websocketFactory: () => {
      factoryCallCount += 1;
      return socket;
    }
  });

  session.start([{ trId: "HDFSCNT0", trKey: "SOXL" }]);
  socket.emitOpen();
  session.stop();

  await sleep(10);

  assert.equal(factoryCallCount, 1);
});

test("forwards raw websocket message to hook", async () => {
  const socket = new FakeKisWebSocket();
  const receivedMessages: string[] = [];

  const session = new KisWebSocketSession({
    wsUrl: "wss://example.com/ws",
    approvalKey: "approval-key",
    customerType: "P",
    reconnectBaseMs: 10,
    reconnectMaxMs: 100,
    websocketFactory: () => socket,
    onMessage: async (rawMessage) => {
      receivedMessages.push(rawMessage);
    }
  });

  session.start([{ trId: "HDFSCNT0", trKey: "TSLA" }]);
  socket.emitOpen();
  socket.emitMessage(Buffer.from('{"symbol":"TSLA"}', "utf8"));

  await sleep(0);

  assert.deepEqual(receivedMessages, ['{"symbol":"TSLA"}']);
  session.stop();
});

class FakeKisWebSocket implements KisWebSocket {
  readyState = 0;
  sent: string[] = [];

  private openHandlers: Array<() => void> = [];
  private messageHandlers: Array<(data: unknown) => void> = [];
  private errorHandlers: Array<(error: unknown) => void> = [];
  private closeHandlers: Array<(code: number, reason: unknown) => void> = [];

  on(event: "open" | "message" | "error" | "close", listener: (...args: unknown[]) => void): this {
    if (event === "open") {
      this.openHandlers.push(listener as () => void);
      return this;
    }

    if (event === "message") {
      this.messageHandlers.push(listener as (data: unknown) => void);
      return this;
    }

    if (event === "error") {
      this.errorHandlers.push(listener as (error: unknown) => void);
      return this;
    }

    this.closeHandlers.push(listener as (code: number, reason: unknown) => void);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.readyState = 3;
    this.emitClose(code ?? 1000, "client close");
  }

  emitOpen(): void {
    this.readyState = 1;
    for (const handler of this.openHandlers) {
      handler();
    }
  }

  emitMessage(data: unknown): void {
    for (const handler of this.messageHandlers) {
      handler(data);
    }
  }

  emitError(error: unknown): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  emitClose(code: number, reason: unknown): void {
    this.readyState = 3;
    for (const handler of this.closeHandlers) {
      handler(code, reason);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
