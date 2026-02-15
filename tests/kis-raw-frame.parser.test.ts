import assert from "node:assert/strict";
import test from "node:test";

import { KisRawFrameParser } from "../apps/market-watcher/src/kis-raw-frame.parser";

test("parses domestic H0STCNT0 frame into market snapshot payload", () => {
  const parser = new KisRawFrameParser();
  const receivedAtMs = Date.parse("2026-02-16T00:00:00.000Z");

  const fields = [
    "005930",
    "093001",
    "72500",
    "5",
    "100",
    "0.14",
    "72400",
    "72000",
    "73000",
    "71000",
    "72400",
    "72300",
    "1200",
    "500000",
    "36250000000",
    "300",
    "280",
    "20",
    "110.5",
    "1000000",
    "950000",
    "2",
    "55.2",
    "210.0",
    "090000",
    "1",
    "500",
    "092000",
    "1",
    "1000",
    "091500",
    "5",
    "-200",
    "20260216",
    "N",
    "N",
    "1500",
    "1400",
    "25000",
    "24000",
    "1.2",
    "200000",
    "250",
    "1",
    "0",
    "71000"
  ];

  const rawFrame = `0|H0STCNT0|1|${fields.join("^")}`;
  const snapshots = parser.parse(rawFrame, receivedAtMs);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].symbol, "005930");
  assert.equal(snapshots[0].candle.close, "72500");
  assert.equal(snapshots[0].candle.open, "72000");
  assert.equal(snapshots[0].timeframe, "1m");
});

test("parses overseas HDFSCNT0 frame and normalizes symbol", () => {
  const parser = new KisRawFrameParser();

  const fields = [
    "DNASSOXL",
    "SOXL",
    "2",
    "20260216",
    "20260216",
    "220001",
    "20260217",
    "120001",
    "26.10",
    "26.40",
    "25.90",
    "26.30",
    "2",
    "0.20",
    "0.77",
    "26.29",
    "26.31",
    "500",
    "450",
    "100",
    "300000",
    "7800000",
    "40",
    "60",
    "110",
    "NASD"
  ];

  const rawFrame = `0|HDFSCNT0|1|${fields.join("^")}`;
  const snapshots = parser.parse(rawFrame);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].symbol, "SOXL");
  assert.equal(snapshots[0].candle.close, "26.3");
  assert.equal(snapshots[0].orderBookSummary.spreadBps.length > 0, true);
});

test("returns empty snapshots for non-market websocket frames", () => {
  const parser = new KisRawFrameParser();

  const controlFrame = "1|H0STCNI0|1|encrypted-payload";
  const ackFrame = JSON.stringify({
    header: {
      tr_id: "H0STCNT0"
    },
    body: {
      rt_cd: "0",
      msg1: "OK"
    }
  });

  assert.deepEqual(parser.parse(controlFrame), []);
  assert.deepEqual(parser.parse(ackFrame), []);
});

test("passes through JSON snapshot payload already in internal schema", () => {
  const parser = new KisRawFrameParser();

  const rawJsonSnapshot = JSON.stringify({
    symbol: "TQQQ",
    timestamp: "2026-02-17T00:00:00.000Z",
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

  const snapshots = parser.parse(rawJsonSnapshot);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].symbol, "TQQQ");
});
