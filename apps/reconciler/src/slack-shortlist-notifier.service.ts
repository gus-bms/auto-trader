import { loadRuntimeConfig, type RuntimeConfig } from "@app/config";
import type { RecommendationShortlistQuery } from "@app/core";
import type { RecommendationProducedEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

import { RecommendationShortlistService } from "./recommendation-shortlist.service";

export type SlackPoster = (webhookUrl: string, payload: { text: string }, timeoutMs: number) => Promise<void>;

@Injectable()
export class SlackShortlistNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackShortlistNotifierService.name);

  private readonly config: RuntimeConfig;
  private readonly webhookUrl: string;

  private timer: NodeJS.Timeout | null = null;
  private isNotifying = false;
  private lastMessageSignature: string | null = null;
  private redisClient: Redis | null = null;

  constructor(
    private readonly recommendationShortlistService: RecommendationShortlistService,
    private readonly postSlack: SlackPoster = postSlackWebhook,
    config: RuntimeConfig = loadRuntimeConfig()
  ) {
    this.config = config;
    this.webhookUrl = this.config.SLACK_WEBHOOK_URL.trim();
  }

  onModuleInit(): void {
    if (this.config.SLACK_SHORTLIST_NOTIFY_ENABLED !== "true") {
      this.logger.log("Slack shortlist notifier disabled by config.");
      return;
    }

    if (this.webhookUrl.length === 0) {
      this.logger.warn("Slack shortlist notifier enabled but SLACK_WEBHOOK_URL is empty.");
      return;
    }

    const intervalMs = this.config.SLACK_SHORTLIST_NOTIFY_INTERVAL_SEC * 1000;
    this.timer = setInterval(() => {
      void this.notifyOnce();
    }, intervalMs);

    void this.notifyOnce();

    this.logger.log(
      `Slack shortlist notifier started intervalSec=${this.config.SLACK_SHORTLIST_NOTIFY_INTERVAL_SEC} limit=${this.config.SLACK_SHORTLIST_NOTIFY_LIMIT}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.redisClient !== null) {
      const client = this.redisClient;
      this.redisClient = null;
      await client.quit();
    }
  }

  async notifyOnce(): Promise<boolean> {
    if (this.config.SLACK_SHORTLIST_NOTIFY_ENABLED !== "true" || this.webhookUrl.length === 0) {
      return false;
    }

    if (this.isNotifying) {
      return false;
    }

    this.isNotifying = true;

    try {
      const shortlistQuery = this.buildShortlistQuery();
      const recommendations = await this.recommendationShortlistService.getTopBuyCandidates(shortlistQuery);

      if (recommendations.length === 0) {
        return false;
      }

      const signature = buildSignature(recommendations);
      const persistedSignature = await this.readPersistedSignature();
      if (signature === this.lastMessageSignature || signature === persistedSignature) {
        return false;
      }

      const text = buildSlackShortlistMessage(recommendations, new Date().toISOString());
      await this.postSlack(this.webhookUrl, { text }, this.config.SLACK_REQUEST_TIMEOUT_MS);

      this.lastMessageSignature = signature;
      await this.persistSignature(signature);
      this.logger.log(`Slack shortlist sent candidateCount=${recommendations.length}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Slack notifier error";
      this.logger.error(`Slack shortlist notify failed: ${message}`);
      return false;
    } finally {
      this.isNotifying = false;
    }
  }

  private buildShortlistQuery(): RecommendationShortlistQuery {
    const query: RecommendationShortlistQuery = {
      limit: this.config.SLACK_SHORTLIST_NOTIFY_LIMIT,
      minScore: this.config.SLACK_SHORTLIST_NOTIFY_MIN_SCORE,
      lookbackMin: this.config.SLACK_SHORTLIST_NOTIFY_LOOKBACK_MIN,
      uniqueSymbol: this.config.RECOMMENDATION_SHORTLIST_DEFAULT_UNIQUE_SYMBOL
    };

    const symbol = normalizeSymbol(this.config.SLACK_SHORTLIST_NOTIFY_SYMBOL);
    if (symbol !== null) {
      query.symbol = symbol;
    }

    return query;
  }

  private async readPersistedSignature(): Promise<string | null> {
    const client = this.getRedisClient();
    if (client === null) {
      return null;
    }

    try {
      const value = await client.get(this.config.SLACK_SHORTLIST_SIGNATURE_KEY);
      return typeof value === "string" && value.length > 0 ? value : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown redis read error";
      this.logger.warn(`Slack signature read failed: ${message}`);
      return null;
    }
  }

  private async persistSignature(signature: string): Promise<void> {
    const client = this.getRedisClient();
    if (client === null) {
      return;
    }

    try {
      await client.set(
        this.config.SLACK_SHORTLIST_SIGNATURE_KEY,
        signature,
        "EX",
        this.config.SLACK_SHORTLIST_SIGNATURE_TTL_SEC
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown redis write error";
      this.logger.warn(`Slack signature persist failed: ${message}`);
    }
  }

  private getRedisClient(): Redis | null {
    if (this.redisClient !== null) {
      return this.redisClient;
    }

    try {
      this.redisClient = new Redis({
        host: this.config.REDIS_HOST,
        port: this.config.REDIS_PORT,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true
      });

      return this.redisClient;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown redis init error";
      this.logger.warn(`Slack signature redis disabled: ${message}`);
      return null;
    }
  }
}

export function buildSlackShortlistMessage(
  recommendations: RecommendationProducedEvent[],
  generatedAtIso: string
): string {
  const lines = [`[auto-trader] BUY shortlist ${generatedAtIso}`];

  for (const [index, recommendation] of recommendations.entries()) {
    const rank = index + 1;
    const score = recommendation.scoreBreakdown.totalScore.toFixed(2);
    const confidence = recommendation.confidence.toFixed(1);
    const rationale = recommendation.rationale.slice(0, 90);
    lines.push(`${rank}. ${recommendation.symbol} score=${score} confidence=${confidence} | ${rationale}`);
  }

  return lines.join("\n");
}

function buildSignature(recommendations: RecommendationProducedEvent[]): string {
  return recommendations.map((item) => `${item.recommendationId}:${item.scoreBreakdown.totalScore.toFixed(2)}`).join("|");
}

function normalizeSymbol(rawValue: string): string | null {
  const normalized = rawValue.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

async function postSlackWebhook(webhookUrl: string, payload: { text: string }, timeoutMs: number): Promise<void> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`status=${response.status} response=${responseBody.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}
