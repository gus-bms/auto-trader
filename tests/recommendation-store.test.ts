import assert from "node:assert/strict";
import test from "node:test";

import type { RecommendationProducedEvent } from "../libs/domain/src";
import {
  RecommendationStore,
  type RecommendationStoreClient,
  type RecommendationStoreOptions
} from "../libs/core/src";

test("stores recommendations and returns top BUY shortlist", async () => {
  const client = new InMemoryRecommendationClient();
  const store = new RecommendationStore(createStoreOptions(), () => client);

  await store.save(createRecommendation({ recommendationId: "buy-low", decision: "BUY", totalScore: 68 }));
  await store.save(createRecommendation({ recommendationId: "wait-high", decision: "WAIT", totalScore: 98 }));
  await store.save(createRecommendation({ recommendationId: "buy-top", decision: "BUY", totalScore: 88 }));

  const shortlist = await store.listTopBuyCandidates({
    limit: 2,
    lookbackMin: 60,
    minScore: 65
  });

  assert.deepEqual(
    shortlist.map((item) => item.recommendationId),
    ["buy-top", "buy-low"]
  );

  await store.close();
  assert.equal(client.closed, true);
});

test("filters outdated or malformed recommendation payloads", async () => {
  const client = new InMemoryRecommendationClient();
  const store = new RecommendationStore(createStoreOptions(), () => client);

  await store.save(createRecommendation({ recommendationId: "recent", decision: "BUY", totalScore: 85 }));
  await store.save(
    createRecommendation({
      recommendationId: "old",
      decision: "BUY",
      totalScore: 95,
      createdAt: "2026-01-01T00:00:00.000Z"
    })
  );
  await client.lpush("recommendationHistory", "not-json");

  const shortlist = await store.listTopBuyCandidates({
    limit: 3,
    lookbackMin: 60,
    minScore: 70
  });

  assert.equal(shortlist.length, 1);
  assert.equal(shortlist[0]?.recommendationId, "recent");
});

class InMemoryRecommendationClient implements RecommendationStoreClient {
  readonly items: string[] = [];
  closed = false;

  async lpush(_key: string, ...elements: string[]): Promise<number> {
    for (const element of elements) {
      this.items.unshift(element);
    }

    return this.items.length;
  }

  async ltrim(_key: string, start: number, stop: number): Promise<"OK"> {
    if (this.items.length === 0) {
      return "OK";
    }

    const normalizedStart = Math.max(start, 0);
    const normalizedStop = Math.max(stop, -1);
    this.items.splice(0, this.items.length, ...this.items.slice(normalizedStart, normalizedStop + 1));
    return "OK";
  }

  async lrange(_key: string, start: number, stop: number): Promise<string[]> {
    if (this.items.length === 0) {
      return [];
    }

    const normalizedStart = Math.max(start, 0);
    const normalizedStop = Math.max(stop, -1);
    return this.items.slice(normalizedStart, normalizedStop + 1);
  }

  async quit(): Promise<"OK"> {
    this.closed = true;
    return "OK";
  }
}

function createStoreOptions(): RecommendationStoreOptions {
  return {
    redisHost: "127.0.0.1",
    redisPort: 6379,
    storeKey: "recommendationHistory",
    maxItems: 200,
    shortlistScanSize: 50,
    defaultLimit: 10,
    defaultLookbackMin: 60,
    defaultMinScore: 65
  };
}

function createRecommendation(overrides: {
  recommendationId: string;
  decision: "BUY" | "WAIT";
  totalScore: number;
  createdAt?: string;
}): RecommendationProducedEvent {
  const createdAt = overrides.createdAt ?? new Date().toISOString();

  return {
    recommendationId: overrides.recommendationId,
    decisionId: `decision-${overrides.recommendationId}`,
    correlationId: `correlation-${overrides.recommendationId}`,
    symbol: "SOXL",
    timeframe: "1m",
    asOf: createdAt,
    decision: overrides.decision,
    confidence: overrides.totalScore,
    riskLevel: overrides.decision === "BUY" ? "LOW" : "HIGH",
    rationale: "test recommendation",
    source: "llm+rules",
    scoreBreakdown: {
      triggerScore: 70,
      technicalScore: 70,
      newsScore: 70,
      llmScore: 70,
      riskPenalty: 0,
      totalScore: overrides.totalScore
    },
    newsDigest: {
      symbol: "SOXL",
      asOf: createdAt,
      newsCount: 1,
      averageSentiment: 0.4,
      confidence: 0.7,
      topHeadlines: [
        {
          headline: "Mock headline",
          source: "mock",
          publishedAt: createdAt,
          sentimentScore: 0.4
        }
      ]
    },
    riskEvaluation: {
      verdict: "PASS",
      blockCode: null,
      details: {}
    },
    createdAt
  };
}
