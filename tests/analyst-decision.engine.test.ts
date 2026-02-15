import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig } from "../libs/config/src";
import type { AnalystDecisionOutput, TradeSignalEvent } from "../libs/domain/src";
import { AnalystDecisionEngine } from "../libs/llm-analyst/src";

test("emits order intent when LLM says BUY and risk verdict is PASS", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "live",
    LIVE_MODE: "true",
    MAX_ORDER_NOTIONAL_USD: "100",
    ANALYST_ORDER_NOTIONAL_USD: "100",
    ANALYST_AVAILABLE_CASH_USD: "1000",
    ANALYST_DAILY_PNL_USD: "0"
  });

  const llmClient = {
    analyze: async (): Promise<AnalystDecisionOutput> => ({
      decision: "BUY",
      confidence: 88,
      riskLevel: "LOW",
      rationale: "RSI oversold with sustained volume spike"
    })
  };

  const engine = new AnalystDecisionEngine(llmClient, config);
  const signalEvent = createTradeSignalEvent();
  const evaluation = await engine.evaluateTradeSignal(signalEvent, Date.parse("2026-02-17T00:00:20.000Z"));

  assert.equal(evaluation.decisionRecord.decision, "BUY");
  assert.equal(evaluation.decisionRecord.source, "llm");
  assert.equal(evaluation.riskEvaluation.verdict, "PASS");
  assert.notEqual(evaluation.orderIntentEvent, null);
  assert.equal(evaluation.orderIntentEvent?.symbol, signalEvent.symbol);
});

test("falls back to WAIT on llm error", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "live",
    LIVE_MODE: "true"
  });

  const llmClient = {
    analyze: async (): Promise<AnalystDecisionOutput> => {
      throw new Error("Timeout");
    }
  };

  const engine = new AnalystDecisionEngine(llmClient, config);
  const evaluation = await engine.evaluateTradeSignal(createTradeSignalEvent(), Date.parse("2026-02-17T00:00:20.000Z"));

  assert.equal(evaluation.decisionRecord.decision, "WAIT");
  assert.equal(evaluation.decisionRecord.source, "fallback");
  assert.equal(evaluation.orderIntentEvent, null);
});

test("blocks BUY decision when mode is not live", async () => {
  const config = loadRuntimeConfig({
    APP_MODE: "paper",
    LIVE_MODE: "false"
  });

  const llmClient = {
    analyze: async (): Promise<AnalystDecisionOutput> => ({
      decision: "BUY",
      confidence: 90,
      riskLevel: "LOW",
      rationale: "Strong setup"
    })
  };

  const engine = new AnalystDecisionEngine(llmClient, config);
  const evaluation = await engine.evaluateTradeSignal(createTradeSignalEvent(), Date.parse("2026-02-17T00:00:20.000Z"));

  assert.equal(evaluation.riskEvaluation.verdict, "BLOCK");
  assert.equal(evaluation.riskEvaluation.blockCode, "MODE_NOT_LIVE");
  assert.equal(evaluation.orderIntentEvent, null);
});

function createTradeSignalEvent(): TradeSignalEvent {
  return {
    correlationId: "cor-123",
    symbol: "SOXL",
    timeframe: "1m",
    timestamp: "2026-02-17T00:00:00.000Z",
    candleSnapshot: {
      open: "26.1",
      high: "26.4",
      low: "25.9",
      close: "26.3",
      volume: "300000"
    },
    indicators: {
      rsi: "28.5",
      volumeChangeRatePct: "235"
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "1.08",
      spreadBps: "9"
    },
    triggerType: "RSI_VOLUME_SPIKE",
    triggerScore: 88
  };
}
