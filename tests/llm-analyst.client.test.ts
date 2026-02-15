import assert from "node:assert/strict";
import test from "node:test";

import type { AnalystLlmInput } from "../libs/domain/src";
import { LlmAnalystClient, LlmAnalystError } from "../libs/llm-analyst/src";

test("parses valid structured decision output from LLM response", async () => {
  const client = new LlmAnalystClient({
    apiKey: "dummy-key",
    model: "gpt-4o-mini",
    timeoutMs: 1000,
    endpoint: "https://example.com/chat/completions",
    fetchFn: async () =>
      createJsonResponse(
        {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "BUY",
                  confidence: 84,
                  riskLevel: "MEDIUM",
                  rationale: "RSI oversold and spread stable"
                })
              }
            }
          ]
        },
        200
      )
  });

  const result = await client.analyze(createInput());

  assert.equal(result.decision, "BUY");
  assert.equal(result.confidence, 84);
  assert.equal(result.riskLevel, "MEDIUM");
});

test("throws when LLM content is not valid JSON", async () => {
  const client = new LlmAnalystClient({
    apiKey: "dummy-key",
    model: "gpt-4o-mini",
    timeoutMs: 1000,
    endpoint: "https://example.com/chat/completions",
    fetchFn: async () =>
      createJsonResponse(
        {
          choices: [
            {
              message: {
                content: "not-json"
              }
            }
          ]
        },
        200
      )
  });

  await assert.rejects(async () => client.analyze(createInput()), (error: unknown) => {
    assert.ok(error instanceof LlmAnalystError);
    return true;
  });
});

function createInput(): AnalystLlmInput {
  return {
    symbol: "SOXL",
    price: "26.3",
    timestamp: "2026-02-17T00:00:00.000Z",
    timeframe: "1m",
    computedIndicators: {
      rsi: "28.5",
      volumeChangeRatePct: "235",
      triggerScore: 88
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "1.08",
      spreadBps: "9"
    },
    triggerType: "RSI_VOLUME_SPIKE"
  };
}

function createJsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
