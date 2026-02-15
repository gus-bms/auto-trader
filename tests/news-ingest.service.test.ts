import assert from "node:assert/strict";
import test from "node:test";

import { NewsIngestService } from "../apps/analyst-worker/src/news-ingest.service";

test("builds news digest from mock news payload and computes sentiment", () => {
  const restore = setEnv({
    ANALYST_NEWS_LOOKBACK_MIN: "240",
    ANALYST_NEWS_MAX_ITEMS: "5",
    ANALYST_NEWS_MOCK_ITEMS_JSON: JSON.stringify([
      {
        symbol: "SOXL",
        headline: "SOXL rallies after strong earnings beat",
        source: "mock-feed",
        publishedAt: "2026-02-17T08:00:00.000Z"
      },
      {
        symbol: "SOXL",
        headline: "SOXL faces weak demand warning",
        source: "mock-feed",
        publishedAt: "2026-02-17T09:00:00.000Z"
      },
      {
        symbol: "TQQQ",
        headline: "TQQQ rebounds on upgrade",
        source: "mock-feed",
        publishedAt: "2026-02-17T09:00:00.000Z"
      }
    ])
  });

  try {
    const service = new NewsIngestService();
    const digest = service.getNewsDigest("SOXL", "2026-02-17T10:00:00.000Z");

    assert.equal(digest.symbol, "SOXL");
    assert.equal(digest.newsCount, 2);
    assert.equal(digest.topHeadlines.length, 2);
    assert.equal(digest.topHeadlines[0]?.headline.includes("warning"), true);
    assert.equal(digest.averageSentiment < 0.1 && digest.averageSentiment > -0.1, true);
  } finally {
    restore();
  }
});

test("ignores stale headlines outside configured lookback window", () => {
  const restore = setEnv({
    ANALYST_NEWS_LOOKBACK_MIN: "30",
    ANALYST_NEWS_MAX_ITEMS: "5",
    ANALYST_NEWS_MOCK_ITEMS_JSON: JSON.stringify([
      {
        symbol: "SOXL",
        headline: "SOXL rebounds on strong volume",
        source: "mock-feed",
        publishedAt: "2026-02-17T07:00:00.000Z"
      },
      {
        symbol: "SOXL",
        headline: "SOXL upgrade after earnings beat",
        source: "mock-feed",
        publishedAt: "2026-02-17T09:50:00.000Z"
      }
    ])
  });

  try {
    const service = new NewsIngestService();
    const digest = service.getNewsDigest("SOXL", "2026-02-17T10:00:00.000Z");

    assert.equal(digest.newsCount, 1);
    assert.equal(digest.topHeadlines[0]?.headline.includes("upgrade"), true);
  } finally {
    restore();
  }
});

function setEnv(values: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
