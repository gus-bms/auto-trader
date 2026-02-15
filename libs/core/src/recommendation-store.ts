import type { RecommendationProducedEvent } from "@app/domain";
import Redis from "ioredis";

export interface RecommendationStoreClient {
  lpush(key: string, ...elements: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  quit(): Promise<unknown>;
}

export interface RecommendationStoreOptions {
  redisHost: string;
  redisPort: number;
  storeKey: string;
  maxItems: number;
  shortlistScanSize: number;
  defaultLimit: number;
  defaultLookbackMin: number;
  defaultMinScore: number;
  defaultUniqueSymbol: boolean;
}

export interface RecommendationShortlistQuery {
  limit?: number;
  lookbackMin?: number;
  minScore?: number;
  symbol?: string;
  uniqueSymbol?: boolean;
}

export class RecommendationStore {
  private client: RecommendationStoreClient | null = null;

  constructor(
    private readonly options: RecommendationStoreOptions,
    private readonly clientFactory?: () => RecommendationStoreClient
  ) {}

  async save(recommendation: RecommendationProducedEvent): Promise<void> {
    const payload = JSON.stringify(recommendation);
    const client = this.getClient();
    const maxItems = clampInt(this.options.maxItems, 1, 10000);

    await client.lpush(this.options.storeKey, payload);
    await client.ltrim(this.options.storeKey, 0, maxItems - 1);
  }

  async listTopBuyCandidates(query: RecommendationShortlistQuery = {}): Promise<RecommendationProducedEvent[]> {
    const client = this.getClient();

    const limit = clampInt(query.limit ?? this.options.defaultLimit, 1, 100);
    const lookbackMin = clampInt(query.lookbackMin ?? this.options.defaultLookbackMin, 1, 7 * 24 * 60);
    const minScore = clampNumber(query.minScore ?? this.options.defaultMinScore, 0, 100);
    const symbolFilter = normalizeSymbol(query.symbol);
    const uniqueSymbol = query.uniqueSymbol ?? this.options.defaultUniqueSymbol;

    const maxItems = clampInt(this.options.maxItems, 1, 10000);
    const shortlistScanSize = clampInt(this.options.shortlistScanSize, limit, maxItems);
    const rawItems = await client.lrange(this.options.storeKey, 0, shortlistScanSize - 1);

    const cutoffTimestampMs = Date.now() - lookbackMin * 60_000;
    const shortlist: RecommendationProducedEvent[] = [];
    const seenSymbols = new Set<string>();

    for (const rawItem of rawItems) {
      const recommendation = parseRecommendation(rawItem);
      if (recommendation === null) {
        continue;
      }

      if (recommendation.decision !== "BUY") {
        continue;
      }

      if (symbolFilter !== null && recommendation.symbol.toUpperCase() !== symbolFilter) {
        continue;
      }

      if (recommendation.scoreBreakdown.totalScore < minScore) {
        continue;
      }

      const createdAtMs = Date.parse(recommendation.createdAt);
      if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffTimestampMs) {
        continue;
      }

      if (uniqueSymbol) {
        const normalizedSymbol = recommendation.symbol.toUpperCase();
        if (seenSymbols.has(normalizedSymbol)) {
          continue;
        }

        seenSymbols.add(normalizedSymbol);
      }

      shortlist.push(recommendation);

      if (shortlist.length >= limit && uniqueSymbol) {
        break;
      }
    }

    shortlist.sort((left, right) => {
      const scoreDelta = right.scoreBreakdown.totalScore - left.scoreBreakdown.totalScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });

    return shortlist.slice(0, limit);
  }

  async close(): Promise<void> {
    if (this.client === null) {
      return;
    }

    const client = this.client;
    this.client = null;
    await client.quit();
  }

  private getClient(): RecommendationStoreClient {
    if (this.client !== null) {
      return this.client;
    }

    if (this.clientFactory !== undefined) {
      this.client = this.clientFactory();
      return this.client;
    }

    this.client = new Redis({
      host: this.options.redisHost,
      port: this.options.redisPort,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });

    return this.client;
  }
}

function parseRecommendation(rawValue: string): RecommendationProducedEvent | null {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const decision = readString(parsed, "decision");
    const recommendationId = readString(parsed, "recommendationId");
    const symbol = readString(parsed, "symbol");
    const createdAt = readString(parsed, "createdAt");
    const rationale = readString(parsed, "rationale");
    const confidence = readNumber(parsed, "confidence");
    const scoreBreakdown = readRecord(parsed, "scoreBreakdown");
    const totalScore = scoreBreakdown === null ? null : readNumber(scoreBreakdown, "totalScore");
    const createdAtMs = createdAt === null ? Number.NaN : Date.parse(createdAt);

    if (
      (decision !== "BUY" && decision !== "WAIT") ||
      recommendationId === null ||
      symbol === null ||
      createdAt === null ||
      !Number.isFinite(createdAtMs) ||
      rationale === null ||
      confidence === null ||
      totalScore === null ||
      totalScore < 0 ||
      totalScore > 100
    ) {
      return null;
    }

    return parsed as unknown as RecommendationProducedEvent;
  } catch {
    return null;
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const rounded = Math.trunc(value);
  if (rounded < min) {
    return min;
  }

  if (rounded > max) {
    return max;
  }

  return rounded;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function normalizeSymbol(rawValue: string | undefined): string | null {
  if (rawValue === undefined) {
    return null;
  }

  const normalized = rawValue.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key];
  if (!isRecord(value)) {
    return null;
  }

  return value;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}
