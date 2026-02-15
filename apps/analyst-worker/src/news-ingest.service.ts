import { loadRuntimeConfig } from "@app/config";
import type { NewsDigest, NewsSignalItem } from "@app/domain";
import { Injectable, Logger } from "@nestjs/common";

interface MockNewsItem {
  newsId?: string;
  symbol: string;
  headline: string;
  source?: string;
  publishedAt?: string;
  url?: string;
}

@Injectable()
export class NewsIngestService {
  private readonly logger = new Logger(NewsIngestService.name);
  private readonly config = loadRuntimeConfig();

  private readonly mockNewsItems = this.parseMockNewsItems();

  getNewsDigest(symbol: string, asOfTimestamp: string): NewsDigest {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const asOfMs = Date.parse(asOfTimestamp);
    const nowMs = Number.isFinite(asOfMs) ? asOfMs : Date.now();
    const oldestAllowedMs = nowMs - this.config.ANALYST_NEWS_LOOKBACK_MIN * 60 * 1000;

    const candidateItems = this.mockNewsItems
      .filter((item) => item.symbol === normalizedSymbol)
      .filter((item) => Date.parse(item.publishedAt) >= oldestAllowedMs)
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .slice(0, this.config.ANALYST_NEWS_MAX_ITEMS);

    const newsItems = candidateItems.map((item) => toNewsSignalItem(item));
    const averageSentiment =
      newsItems.length === 0
        ? 0
        : newsItems.reduce((sum, item) => sum + item.sentimentScore, 0) / newsItems.length;

    const confidence = Math.min(1, newsItems.length / Math.max(1, this.config.ANALYST_NEWS_MAX_ITEMS / 2));

    return {
      symbol: normalizedSymbol,
      asOf: new Date(nowMs).toISOString(),
      newsCount: newsItems.length,
      averageSentiment: roundTo(averageSentiment, 4),
      confidence: roundTo(confidence, 4),
      topHeadlines: newsItems.map((item) => ({
        headline: item.headline,
        source: item.source,
        publishedAt: item.publishedAt,
        sentimentScore: item.sentimentScore
      }))
    };
  }

  private parseMockNewsItems(): Array<Required<MockNewsItem>> {
    const rawJson = this.config.ANALYST_NEWS_MOCK_ITEMS_JSON.trim();
    if (rawJson.length === 0 || rawJson === "[]") {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error";
      this.logger.warn(`ANALYST_NEWS_MOCK_ITEMS_JSON parse failed: ${message}`);
      return [];
    }

    if (!Array.isArray(parsed)) {
      this.logger.warn("ANALYST_NEWS_MOCK_ITEMS_JSON must be a JSON array");
      return [];
    }

    const results: Array<Required<MockNewsItem>> = [];
    for (const item of parsed) {
      if (!isRecord(item)) {
        continue;
      }

      const symbolRaw = readString(item, "symbol");
      const headline = readString(item, "headline");
      if (symbolRaw === null || headline === null) {
        continue;
      }

      const symbol = symbolRaw.toUpperCase();

      const source = readString(item, "source") ?? "mock-news";
      const url = readString(item, "url");
      const publishedAt = readString(item, "publishedAt") ?? new Date().toISOString();
      const newsId = readString(item, "newsId") ?? `${symbol}:${simpleHash(`${headline}:${publishedAt}`)}`;

      results.push({
        newsId,
        symbol,
        headline,
        source,
        publishedAt,
        url: url ?? ""
      });
    }

    return results;
  }
}

function toNewsSignalItem(item: Required<MockNewsItem>): NewsSignalItem {
  const sentimentScore = scoreHeadlineSentiment(item.headline);
  const sentimentLabel =
    sentimentScore > 0.2 ? "positive" : sentimentScore < -0.2 ? "negative" : "neutral";

  return {
    newsId: item.newsId,
    symbol: item.symbol,
    headline: item.headline,
    source: item.source,
    publishedAt: item.publishedAt,
    url: item.url.length > 0 ? item.url : null,
    sentimentScore: roundTo(sentimentScore, 4),
    sentimentLabel,
    relevanceScore: 1
  };
}

function scoreHeadlineSentiment(headline: string): number {
  const normalized = headline.toLowerCase();

  const positiveKeywords = [
    "beat",
    "surge",
    "rally",
    "upgrade",
    "profit",
    "growth",
    "record",
    "outperform",
    "strong",
    "rebound"
  ];

  const negativeKeywords = [
    "miss",
    "drop",
    "selloff",
    "downgrade",
    "loss",
    "weak",
    "lawsuit",
    "probe",
    "cut",
    "warning"
  ];

  const positiveHits = positiveKeywords.reduce((count, keyword) => {
    return normalized.includes(keyword) ? count + 1 : count;
  }, 0);

  const negativeHits = negativeKeywords.reduce((count, keyword) => {
    return normalized.includes(keyword) ? count + 1 : count;
  }, 0);

  if (positiveHits === 0 && negativeHits === 0) {
    return 0;
  }

  return (positiveHits - negativeHits) / (positiveHits + negativeHits);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return String(Math.abs(hash));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
