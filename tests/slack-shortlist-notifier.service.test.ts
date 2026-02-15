import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig } from "../libs/config/src";
import type { RecommendationShortlistQuery } from "../libs/core/src";
import type { RecommendationProducedEvent } from "../libs/domain/src";
import {
  buildSlackShortlistMessage,
  SlackShortlistNotifierService,
  type SlackPoster
} from "../apps/reconciler/src/slack-shortlist-notifier.service";
import type { RecommendationShortlistService } from "../apps/reconciler/src/recommendation-shortlist.service";

test("notifyOnce posts shortlist to Slack and deduplicates identical payload", async () => {
  const capturedQueries: RecommendationShortlistQuery[] = [];
  const sentPayloads: string[] = [];

  const shortlistService = {
    getTopBuyCandidates: async (query: RecommendationShortlistQuery) => {
      capturedQueries.push(query);
      return [createRecommendation("rec-1", 88), createRecommendation("rec-2", 82)];
    },
    onModuleDestroy: async () => {}
  } as unknown as RecommendationShortlistService;

  const postSlack: SlackPoster = async (_webhookUrl, payload) => {
    sentPayloads.push(payload.text);
  };

  const config = loadRuntimeConfig({
    SLACK_SHORTLIST_NOTIFY_ENABLED: "true",
    SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/mock",
    SLACK_SHORTLIST_NOTIFY_LIMIT: "3",
    SLACK_SHORTLIST_NOTIFY_MIN_SCORE: "80",
    SLACK_SHORTLIST_NOTIFY_SYMBOL: "soxl",
    SLACK_SHORTLIST_SIGNATURE_KEY: `test-shortlist-signature-${Date.now()}`
  });

  const notifier = new SlackShortlistNotifierService(shortlistService, postSlack, config);

  const firstSend = await notifier.notifyOnce();
  const secondSend = await notifier.notifyOnce();

  assert.equal(firstSend, true);
  assert.equal(secondSend, false);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0]?.includes("SOXL score=88.00"), true);
  assert.deepEqual(capturedQueries[0], {
    limit: 3,
    lookbackMin: 180,
    minScore: 80,
    symbol: "SOXL",
    uniqueSymbol: true
  });

  await notifier.onModuleDestroy();
});

test("notifyOnce skips when notifier is disabled", async () => {
  let postCalled = false;

  const shortlistService = {
    getTopBuyCandidates: async () => [createRecommendation("rec-1", 88)],
    onModuleDestroy: async () => {}
  } as unknown as RecommendationShortlistService;

  const postSlack: SlackPoster = async () => {
    postCalled = true;
  };

  const config = loadRuntimeConfig({
    SLACK_SHORTLIST_NOTIFY_ENABLED: "false",
    SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/mock"
  });

  const notifier = new SlackShortlistNotifierService(shortlistService, postSlack, config);
  const sent = await notifier.notifyOnce();

  assert.equal(sent, false);
  assert.equal(postCalled, false);
  await notifier.onModuleDestroy();
});

test("buildSlackShortlistMessage renders ranked candidate lines", () => {
  const message = buildSlackShortlistMessage(
    [createRecommendation("rec-1", 91), createRecommendation("rec-2", 84)],
    "2026-02-18T00:00:00.000Z"
  );

  assert.equal(message.includes("[auto-trader] BUY shortlist 2026-02-18T00:00:00.000Z"), true);
  assert.equal(message.includes("1. SOXL score=91.00"), true);
  assert.equal(message.includes("2. SOXL score=84.00"), true);
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
