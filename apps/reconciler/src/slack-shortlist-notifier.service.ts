import { loadRuntimeConfig, type RuntimeConfig } from "@app/config";
import type { RecommendationShortlistQuery } from "@app/core";
import type { RecommendationProducedEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

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
      if (signature === this.lastMessageSignature) {
        return false;
      }

      const text = buildSlackShortlistMessage(recommendations, new Date().toISOString());
      await this.postSlack(this.webhookUrl, { text }, this.config.SLACK_REQUEST_TIMEOUT_MS);

      this.lastMessageSignature = signature;
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
      minScore: this.config.SLACK_SHORTLIST_NOTIFY_MIN_SCORE
    };

    const symbol = normalizeSymbol(this.config.SLACK_SHORTLIST_NOTIFY_SYMBOL);
    if (symbol !== null) {
      query.symbol = symbol;
    }

    return query;
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
