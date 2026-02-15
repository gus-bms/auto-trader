import type { RecommendationShortlistQuery } from "@app/core";
import type { RecommendationProducedEvent } from "@app/domain";
import type { INestApplication } from "@nestjs/common";

import { RecommendationShortlistService } from "./recommendation-shortlist.service";

export interface RecommendationShortlistResponse {
  count: number;
  recommendations: RecommendationProducedEvent[];
  appliedFilters: RecommendationShortlistQuery;
}

export function registerRecommendationShortlistRoute(
  app: INestApplication,
  shortlistService: RecommendationShortlistService
): void {
  const httpServer = app.getHttpAdapter().getInstance();

  httpServer.get(
    "/recommendations/top",
    async (
      request: { query?: Record<string, unknown> },
      response: { status: (code: number) => { json: (payload: unknown) => void }; json: (payload: unknown) => void }
    ) => {
      try {
        const appliedFilters = buildShortlistQuery(request.query ?? {});
        const recommendations = await shortlistService.getTopBuyCandidates(appliedFilters);

        const payload: RecommendationShortlistResponse = {
          count: recommendations.length,
          recommendations,
          appliedFilters
        };

        response.json(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected shortlist error";
        response.status(500).json({ message });
      }
    }
  );
}

export function buildShortlistQuery(rawQuery: Record<string, unknown>): RecommendationShortlistQuery {
  const query: RecommendationShortlistQuery = {};

  const limit = parsePositiveInt(rawQuery.limit);
  if (limit !== null) {
    query.limit = limit;
  }

  const lookbackMin = parsePositiveInt(rawQuery.lookbackMin);
  if (lookbackMin !== null) {
    query.lookbackMin = lookbackMin;
  }

  const minScore = parseScore(rawQuery.minScore);
  if (minScore !== null) {
    query.minScore = minScore;
  }

  const symbol = parseSymbol(rawQuery.symbol);
  if (symbol !== null) {
    query.symbol = symbol;
  }

  const uniqueSymbol = parseBoolean(rawQuery.uniqueSymbol);
  if (uniqueSymbol !== null) {
    query.uniqueSymbol = uniqueSymbol;
  }

  return query;
}

function parsePositiveInt(rawValue: unknown): number | null {
  const parsed = Number.parseInt(readQueryString(rawValue) ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseScore(rawValue: unknown): number | null {
  const parsed = Number.parseFloat(readQueryString(rawValue) ?? "");
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0) {
    return 0;
  }

  if (parsed > 100) {
    return 100;
  }

  return parsed;
}

function parseSymbol(rawValue: unknown): string | null {
  const value = readQueryString(rawValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function readQueryString(rawValue: unknown): string | null {
  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (Array.isArray(rawValue) && rawValue.length > 0) {
    const [first] = rawValue;
    return typeof first === "string" ? first : null;
  }

  return null;
}

function parseBoolean(rawValue: unknown): boolean | null {
  const value = readQueryString(rawValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}
