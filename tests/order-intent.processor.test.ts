import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig } from "../libs/config/src";
import { OrderIntentProcessor } from "../apps/trader/src/order-intent.processor";
import type { OrderExecutionGateway, OrderExecutionResult, PreparedOrderRequest } from "../apps/trader/src/order-execution.types";
import type { ParsedOrderIntentEvent } from "../apps/trader/src/order-intent.schema";

test("blocks order intent when mode is not live", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "paper",
    LIVE_MODE: "false"
  });

  const executionGateway = new RecordingExecutionGateway({
    status: "SUBMITTED",
    brokerOrderId: "brk-1",
    message: "ok"
  });

  const processor = new OrderIntentProcessor(config, executionGateway);
  const result = await processor.process(createIntentEvent());

  assert.equal(result.riskEvaluation.verdict, "BLOCK");
  assert.equal(result.riskEvaluation.blockCode, "MODE_NOT_LIVE");
  assert.equal(result.preparedOrderRequest, null);
  assert.equal(executionGateway.requests.length, 0);
});

test("blocks order intent when market data is stale", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "live",
    LIVE_MODE: "true",
    MAX_MARKET_DATA_AGE_SEC: "60"
  });

  const executionGateway = new RecordingExecutionGateway({
    status: "SUBMITTED",
    brokerOrderId: "brk-1",
    message: "ok"
  });

  const processor = new OrderIntentProcessor(config, executionGateway);
  const staleIntent = createIntentEvent({
    createdAt: "2026-02-17T00:00:00.000Z"
  });

  const result = await processor.process(staleIntent, Date.parse("2026-02-17T00:02:00.000Z"));

  assert.equal(result.riskEvaluation.verdict, "BLOCK");
  assert.equal(result.riskEvaluation.blockCode, "DATA_STALE");
  assert.equal(executionGateway.requests.length, 0);
});

test("executes order intent when risk verdict passes", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "live",
    LIVE_MODE: "true",
    TRADER_AVAILABLE_CASH_USD: "1000",
    TRADER_DAILY_PNL_USD: "0",
    MAX_ORDER_NOTIONAL_USD: "500"
  });

  const executionGateway = new RecordingExecutionGateway({
    status: "SUBMITTED",
    brokerOrderId: "brk-100",
    message: "submitted"
  });

  const processor = new OrderIntentProcessor(config, executionGateway);
  const intent = createIntentEvent({
    requestedNotionalUsd: "100"
  });
  const result = await processor.process(intent, Date.parse("2026-02-17T00:00:20.000Z"));

  assert.equal(result.riskEvaluation.verdict, "PASS");
  assert.notEqual(result.preparedOrderRequest, null);
  assert.equal(result.preparedOrderRequest?.symbol, "SOXL");
  assert.match(result.preparedOrderRequest?.idempotencyKey ?? "", /^SOXL:BUY:/);
  assert.equal(result.executionResult?.status, "SUBMITTED");
  assert.equal(executionGateway.requests.length, 1);
});

test("marks result as not accepted when execution gateway returns live-disabled", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "live",
    LIVE_MODE: "true",
    TRADER_AVAILABLE_CASH_USD: "1000",
    TRADER_DAILY_PNL_USD: "0",
    MAX_ORDER_NOTIONAL_USD: "500"
  });

  const executionGateway = new RecordingExecutionGateway({
    status: "LIVE_ORDER_DISABLED",
    brokerOrderId: null,
    message: "disabled"
  });

  const processor = new OrderIntentProcessor(config, executionGateway);
  const result = await processor.process(createIntentEvent(), Date.parse("2026-02-17T00:00:20.000Z"));

  assert.equal(result.riskEvaluation.verdict, "PASS");
  assert.equal(result.accepted, false);
  assert.equal(result.executionResult?.status, "LIVE_ORDER_DISABLED");
});

class RecordingExecutionGateway implements OrderExecutionGateway {
  requests: PreparedOrderRequest[] = [];

  constructor(private readonly response: OrderExecutionResult) {}

  async execute(request: PreparedOrderRequest): Promise<OrderExecutionResult> {
    this.requests.push(request);
    return this.response;
  }
}

function createIntentEvent(overrides: Partial<ParsedOrderIntentEvent> = {}): ParsedOrderIntentEvent {
  return {
    decisionId: "11111111-1111-4111-8111-111111111111",
    correlationId: "cor-1",
    symbol: "SOXL",
    side: "BUY",
    orderType: "BestLimit",
    requestedNotionalUsd: "100",
    confidence: 82,
    riskLevel: "LOW",
    rationale: "Test signal",
    createdAt: "2026-02-17T00:00:00.000Z",
    ...overrides
  };
}
