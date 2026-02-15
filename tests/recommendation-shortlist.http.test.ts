import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShortlistQuery,
  registerRecommendationShortlistRoute,
  type RecommendationShortlistResponse
} from "../apps/reconciler/src/recommendation-shortlist.http";
import type { RecommendationShortlistService } from "../apps/reconciler/src/recommendation-shortlist.service";
import type { RecommendationProducedEvent } from "../libs/domain/src";

test("buildShortlistQuery parses and normalizes query parameters", () => {
  const query = buildShortlistQuery({
    limit: "5",
    lookbackMin: "180",
    minScore: "72.5",
    symbol: " soxl "
  });

  assert.deepEqual(query, {
    limit: 5,
    lookbackMin: 180,
    minScore: 72.5,
    symbol: "SOXL"
  });
});

test("buildShortlistQuery ignores invalid query values", () => {
  const query = buildShortlistQuery({
    limit: "-1",
    lookbackMin: "0",
    minScore: "abc",
    symbol: ""
  });

  assert.deepEqual(query, {});
});

test("registerRecommendationShortlistRoute returns filtered shortlist payload", async () => {
  type RouteHandler = (
    request: { query?: Record<string, unknown> },
    response: {
      status: (code: number) => { json: (payload: unknown) => void };
      json: (payload: unknown) => void;
    }
  ) => Promise<void>;

  let capturedPath = "";
  let capturedHandler: RouteHandler | null = null;

  const service = {
    getTopBuyCandidates: async () => [createRecommendation("rec-1", 86)],
    onModuleDestroy: async () => {}
  } as unknown as RecommendationShortlistService;

  const app = {
    getHttpAdapter: () => ({
      getInstance: () => ({
        get: (path: string, handler: RouteHandler) => {
          capturedPath = path;
          capturedHandler = handler;
        }
      })
    })
  };

  registerRecommendationShortlistRoute(app as never, service);

  assert.equal(capturedPath, "/recommendations/top");
  assert.notEqual(capturedHandler, null);

  let responsePayload: RecommendationShortlistResponse | null = null;

  if (capturedHandler === null) {
    throw new Error("capturedHandler should be initialized");
  }

  await capturedHandler(
    {
      query: {
        limit: "3",
        minScore: "80",
        symbol: "soxl"
      }
    },
    {
      status: () => ({
        json: () => {}
      }),
      json: (payload: unknown) => {
        responsePayload = payload as RecommendationShortlistResponse;
      }
    }
  );

  if (responsePayload === null) {
    throw new Error("responsePayload should be set");
  }

  assert.equal(responsePayload.count, 1);
  assert.equal(responsePayload.appliedFilters.limit, 3);
  assert.equal(responsePayload.appliedFilters.minScore, 80);
  assert.equal(responsePayload.appliedFilters.symbol, "SOXL");
  assert.equal(responsePayload.recommendations[0]?.recommendationId, "rec-1");
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
