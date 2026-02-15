import assert from "node:assert/strict";
import test from "node:test";

import { RecommendationShortlistController } from "../apps/reconciler/src/recommendation-shortlist.controller";
import type { RecommendationShortlistService } from "../apps/reconciler/src/recommendation-shortlist.service";
import type { RecommendationProducedEvent } from "../libs/domain/src";

test("returns shortlist response with count and recommendations", async () => {
  const mockRecommendations = [createRecommendation("rec-1", 88), createRecommendation("rec-2", 75)];

  const service = {
    getTopBuyCandidates: async () => mockRecommendations,
    onModuleDestroy: async () => {}
  } as unknown as RecommendationShortlistService;

  const controller = new RecommendationShortlistController(service);
  const response = await controller.getTopRecommendations();

  assert.equal(response.count, 2);
  assert.deepEqual(
    response.recommendations.map((item) => item.recommendationId),
    ["rec-1", "rec-2"]
  );
});

function createRecommendation(recommendationId: string, totalScore: number): RecommendationProducedEvent {
  return {
    recommendationId,
    decisionId: `decision-${recommendationId}`,
    correlationId: `correlation-${recommendationId}`,
    symbol: "SOXL",
    timeframe: "1m",
    asOf: "2026-02-17T10:00:00.000Z",
    decision: "BUY",
    confidence: totalScore,
    riskLevel: "LOW",
    rationale: "mock rationale",
    source: "llm+rules",
    scoreBreakdown: {
      triggerScore: 70,
      technicalScore: 70,
      newsScore: 70,
      llmScore: 70,
      riskPenalty: 0,
      totalScore
    },
    newsDigest: {
      symbol: "SOXL",
      asOf: "2026-02-17T10:00:00.000Z",
      newsCount: 1,
      averageSentiment: 0.2,
      confidence: 0.7,
      topHeadlines: [
        {
          headline: "Mock headline",
          source: "mock",
          publishedAt: "2026-02-17T09:59:00.000Z",
          sentimentScore: 0.2
        }
      ]
    },
    riskEvaluation: {
      verdict: "PASS",
      blockCode: null,
      details: {}
    },
    createdAt: "2026-02-17T10:00:01.000Z"
  };
}
