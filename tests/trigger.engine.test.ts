import assert from "node:assert/strict";
import test from "node:test";

import { parseMarketSnapshot } from "../apps/market-watcher/src/market-snapshot.schema";
import { evaluateRsiVolumeTrigger } from "../apps/market-watcher/src/trigger.engine";

test("returns trigger verdict when RSI and volume spike thresholds are met", () => {
  const snapshot = parseMarketSnapshot({
    symbol: "soxl",
    timestamp: "2026-02-15T00:00:00.000Z",
    timeframe: "1m",
    candle: {
      open: "22.15",
      high: "22.40",
      low: "21.95",
      close: "22.30",
      volume: "1250000"
    },
    indicators: {
      rsi: "28.5",
      volumeChangeRatePct: "235"
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "1.08",
      spreadBps: "9"
    }
  });

  const verdict = evaluateRsiVolumeTrigger(snapshot);

  assert.notEqual(verdict, null);
  assert.equal(verdict?.triggerType, "RSI_VOLUME_SPIKE");
  assert.equal(typeof verdict?.triggerScore, "number");
});

test("returns null when RSI threshold is not met", () => {
  const snapshot = parseMarketSnapshot({
    symbol: "TQQQ",
    timestamp: "2026-02-15T00:00:00.000Z",
    timeframe: "1m",
    candle: {
      open: "70.10",
      high: "70.90",
      low: "69.80",
      close: "70.50",
      volume: "980000"
    },
    indicators: {
      rsi: "35",
      volumeChangeRatePct: "260"
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "0.97",
      spreadBps: "11"
    }
  });

  const verdict = evaluateRsiVolumeTrigger(snapshot);

  assert.equal(verdict, null);
});

test("returns null when volume threshold is not met", () => {
  const snapshot = parseMarketSnapshot({
    symbol: "TSLA",
    timestamp: "2026-02-15T00:00:00.000Z",
    timeframe: "1m",
    candle: {
      open: "220.10",
      high: "221.00",
      low: "219.40",
      close: "220.80",
      volume: "810000"
    },
    indicators: {
      rsi: "27",
      volumeChangeRatePct: "140"
    },
    orderBookSummary: {
      bidAskImbalanceRatio: "1.02",
      spreadBps: "7"
    }
  });

  const verdict = evaluateRsiVolumeTrigger(snapshot);

  assert.equal(verdict, null);
});
