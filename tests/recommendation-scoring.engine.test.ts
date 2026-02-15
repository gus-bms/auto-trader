import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig } from "../libs/config/src";
import type {
  AnalystDecisionRecord,
  NewsDigest,
  RiskEvaluationResult,
  TradeSignalEvent,
  UniverseEvaluationResult
} from "../libs/domain/src";
import { RecommendationScoringEngine } from "../libs/llm-analyst/src";

test("produces BUY recommendation when score exceeds threshold and risk passes", () => {
  const config = loadRuntimeConfig({
    ANALYST_SCORE_BUY_THRESHOLD: "60"
  });

  const engine = new RecommendationScoringEngine(config);
  const recommendation = engine.buildRecommendation({
    signalEvent: createSignalEvent(),
    universeEvaluation: createUniverseEvaluation(true),
    decisionRecord: createDecisionRecord(),
    newsDigest: createNewsDigest(0.6, 3),
    riskEvaluation: createRiskEvaluation("PASS", null)
  });

  assert.equal(recommendation.decision, "BUY");
  assert.equal(recommendation.source, "llm+rules");
  assert.equal(recommendation.scoreBreakdown.totalScore >= 60, true);
  assert.equal(recommendation.riskEvaluation.verdict, "PASS");
});

test("forces WAIT recommendation when risk is blocked", () => {
  const config = loadRuntimeConfig({
    ANALYST_SCORE_BUY_THRESHOLD: "40"
  });

  const engine = new RecommendationScoringEngine(config);
  const recommendation = engine.buildRecommendation({
    signalEvent: createSignalEvent(),
    universeEvaluation: createUniverseEvaluation(false),
    decisionRecord: {
      ...createDecisionRecord(),
      source: "fallback"
    },
    newsDigest: createNewsDigest(0.8, 4),
    riskEvaluation: createRiskEvaluation("BLOCK", "DATA_STALE")
  });

  assert.equal(recommendation.decision, "WAIT");
  assert.equal(recommendation.source, "fallback");
  assert.equal(recommendation.riskLevel, "HIGH");
  assert.equal(recommendation.scoreBreakdown.riskPenalty > 0, true);
});

function createSignalEvent(): TradeSignalEvent {
  return {
    correlationId: "correlation-1",
    symbol: "SOXL",
    timeframe: "1m",
    timestamp: "2026-02-17T10:00:00.000Z",
    candleSnapshot: {
      open: "26.1",
      high: "26.6",
      low: "25.9",
      close: "26.4",
      volume: "350000"
    },
    indicators: {
      rsi: "27.5",
      volumeChangeRatePct: "250"
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "1.15",
      spreadBps: "8"
    },
    triggerType: "RSI_VOLUME_SPIKE",
    triggerScore: 86
  };
}

function createDecisionRecord(): AnalystDecisionRecord {
  return {
    decisionId: "11111111-1111-4111-8111-111111111111",
    correlationId: "correlation-1",
    source: "llm",
    llmInput: {
      symbol: "SOXL",
      price: "26.4",
      timestamp: "2026-02-17T10:00:00.000Z",
      timeframe: "1m",
      computedIndicators: {
        rsi: "27.5",
        volumeChangeRatePct: "250",
        triggerScore: 86
      },
      orderBookSummary: {
        bidAskImbalanceRatio: "1.15",
        spreadBps: "8"
      },
      triggerType: "RSI_VOLUME_SPIKE"
    },
    decision: "BUY",
    confidence: 82,
    riskLevel: "LOW",
    rationale: "Oversold RSI with volume breakout",
    createdAt: "2026-02-17T10:00:02.000Z"
  };
}

function createNewsDigest(averageSentiment: number, newsCount: number): NewsDigest {
  return {
    symbol: "SOXL",
    asOf: "2026-02-17T10:00:00.000Z",
    newsCount,
    averageSentiment,
    confidence: newsCount >= 2 ? 0.8 : 0.4,
    topHeadlines: [
      {
        headline: "SOXL rebounds after strong earnings beat",
        source: "mock-feed",
        publishedAt: "2026-02-17T09:55:00.000Z",
        sentimentScore: averageSentiment
      }
    ]
  };
}

function createRiskEvaluation(
  verdict: "PASS" | "BLOCK",
  blockCode: RiskEvaluationResult["blockCode"]
): RiskEvaluationResult {
  return {
    verdict,
    blockCode,
    details: {}
  };
}

function createUniverseEvaluation(accepted: boolean): UniverseEvaluationResult {
  return {
    runId: "2026-02-17",
    profile: "day",
    accepted,
    rejectionReasons: accepted ? [] : ["UNIVERSE_SCORE_TOO_LOW"],
    scoreBreakdown: {
      liquidityScore: 72,
      fundamentalScore: 55,
      technicalScore: 74,
      universeScore: accepted ? 68 : 42
    }
  };
}
