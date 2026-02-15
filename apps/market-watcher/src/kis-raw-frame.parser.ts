import Decimal from "decimal.js";

import type { ParsedMarketSnapshot } from "./market-snapshot.schema";
import { parseMarketSnapshot } from "./market-snapshot.schema";

const DOMESTIC_TRADE_TR_ID = "H0STCNT0";
const OVERSEAS_TRADE_TR_ID = "HDFSCNT0";

const DOMESTIC_TRADE_FIELD_COUNT = 46;
const OVERSEAS_TRADE_FIELD_COUNT = 26;

export class KisRawFrameParser {
  private readonly closeHistoryBySymbol = new Map<string, Decimal[]>();
  private readonly volumeStateBySymbol = new Map<string, VolumeState>();

  parse(rawMessage: string, receivedAtMs: number = Date.now()): ParsedMarketSnapshot[] {
    const trimmed = rawMessage.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const jsonPayload = safeParseJson(trimmed);
    if (jsonPayload !== null) {
      const parsedSnapshot = tryParseSnapshot(jsonPayload);
      return parsedSnapshot === null ? [] : [parsedSnapshot];
    }

    const frameParts = trimmed.split("|");
    if (frameParts.length < 4 || frameParts[0] !== "0") {
      return [];
    }

    const trId = frameParts[1] ?? "";
    const rowCount = parseInteger(frameParts[2] ?? "0");
    const payload = frameParts.slice(3).join("|");

    if (trId === DOMESTIC_TRADE_TR_ID) {
      return this.parseDomesticTradePayload(payload, rowCount, receivedAtMs);
    }

    if (trId === OVERSEAS_TRADE_TR_ID) {
      return this.parseOverseasTradePayload(payload, rowCount, receivedAtMs);
    }

    return [];
  }

  private parseDomesticTradePayload(payload: string, rowCount: number, receivedAtMs: number): ParsedMarketSnapshot[] {
    const rows = splitRows(payload, DOMESTIC_TRADE_FIELD_COUNT, rowCount);
    const snapshots: ParsedMarketSnapshot[] = [];

    for (const row of rows) {
      const symbol = getField(row, 0).trim().toUpperCase();
      if (symbol.length === 0) {
        continue;
      }

      const close = decimalOrZero(getField(row, 2));
      const open = decimalOrFallback(getField(row, 7), close);
      const high = decimalOrFallback(getField(row, 8), close);
      const low = decimalOrFallback(getField(row, 9), close);
      const bidPrice = decimalOrZero(getField(row, 11));
      const askPrice = decimalOrZero(getField(row, 10));
      const bidQty = decimalOrZero(getField(row, 37));
      const askQty = decimalOrZero(getField(row, 36));
      const cumulativeVolume = decimalOrZero(getField(row, 13));

      const rsi = this.updateRsi(symbol, close);
      const volumeChangeRatePct = this.updateVolumeSpike(symbol, cumulativeVolume);

      const snapshot = parseMarketSnapshot({
        symbol,
        timestamp: new Date(receivedAtMs).toISOString(),
        timeframe: "1m",
        candle: {
          open: open.toFixed(),
          high: high.toFixed(),
          low: low.toFixed(),
          close: close.toFixed(),
          volume: cumulativeVolume.toFixed()
        },
        indicators: {
          rsi: rsi.toFixed(4),
          volumeChangeRatePct: volumeChangeRatePct.toFixed(4)
        },
        orderBookSummary: {
          bidAskImbalanceRatio: safeDivide(bidQty, askQty).toFixed(6),
          spreadBps: calculateSpreadBps(askPrice, bidPrice, close).toFixed(6)
        }
      });

      snapshots.push(snapshot);
    }

    return snapshots;
  }

  private parseOverseasTradePayload(payload: string, rowCount: number, receivedAtMs: number): ParsedMarketSnapshot[] {
    const rows = splitRows(payload, OVERSEAS_TRADE_FIELD_COUNT, rowCount);
    const snapshots: ParsedMarketSnapshot[] = [];

    for (const row of rows) {
      const symbol = normalizeOverseasSymbol(getField(row, 1), getField(row, 0));
      if (symbol.length === 0) {
        continue;
      }

      const close = decimalOrZero(getField(row, 11));
      const open = decimalOrFallback(getField(row, 8), close);
      const high = decimalOrFallback(getField(row, 9), close);
      const low = decimalOrFallback(getField(row, 10), close);
      const bidPrice = decimalOrZero(getField(row, 15));
      const askPrice = decimalOrZero(getField(row, 16));
      const bidQty = decimalOrZero(getField(row, 17));
      const askQty = decimalOrZero(getField(row, 18));
      const cumulativeVolume = decimalOrZero(getField(row, 20));

      const rsi = this.updateRsi(symbol, close);
      const volumeChangeRatePct = this.updateVolumeSpike(symbol, cumulativeVolume);

      const snapshot = parseMarketSnapshot({
        symbol,
        timestamp: new Date(receivedAtMs).toISOString(),
        timeframe: "1m",
        candle: {
          open: open.toFixed(),
          high: high.toFixed(),
          low: low.toFixed(),
          close: close.toFixed(),
          volume: cumulativeVolume.toFixed()
        },
        indicators: {
          rsi: rsi.toFixed(4),
          volumeChangeRatePct: volumeChangeRatePct.toFixed(4)
        },
        orderBookSummary: {
          bidAskImbalanceRatio: safeDivide(bidQty, askQty).toFixed(6),
          spreadBps: calculateSpreadBps(askPrice, bidPrice, close).toFixed(6)
        }
      });

      snapshots.push(snapshot);
    }

    return snapshots;
  }

  private updateRsi(symbol: string, close: Decimal): Decimal {
    const history = this.closeHistoryBySymbol.get(symbol) ?? [];
    history.push(close);

    if (history.length > 15) {
      history.shift();
    }

    this.closeHistoryBySymbol.set(symbol, history);

    if (history.length < 15) {
      return new Decimal(50);
    }

    let gainSum = new Decimal(0);
    let lossSum = new Decimal(0);

    for (let index = 1; index < history.length; index += 1) {
      const current = history[index];
      const previous = history[index - 1];
      if (current === undefined || previous === undefined) {
        continue;
      }

      const diff = current.minus(previous);
      if (diff.gte(0)) {
        gainSum = gainSum.plus(diff);
      } else {
        lossSum = lossSum.plus(diff.abs());
      }
    }

    const averageGain = gainSum.div(14);
    const averageLoss = lossSum.div(14);

    if (averageLoss.eq(0)) {
      return new Decimal(100);
    }

    const relativeStrength = averageGain.div(averageLoss);
    return new Decimal(100).minus(new Decimal(100).div(relativeStrength.plus(1)));
  }

  private updateVolumeSpike(symbol: string, cumulativeVolume: Decimal): Decimal {
    const previousState = this.volumeStateBySymbol.get(symbol);
    if (previousState === undefined) {
      this.volumeStateBySymbol.set(symbol, {
        lastCumulativeVolume: cumulativeVolume,
        emaDeltaVolume: new Decimal(0)
      });

      return new Decimal(0);
    }

    const volumeDelta = Decimal.max(cumulativeVolume.minus(previousState.lastCumulativeVolume), new Decimal(0));
    const nextEma = previousState.emaDeltaVolume.eq(0)
      ? volumeDelta
      : previousState.emaDeltaVolume.mul(0.8).plus(volumeDelta.mul(0.2));

    this.volumeStateBySymbol.set(symbol, {
      lastCumulativeVolume: cumulativeVolume,
      emaDeltaVolume: nextEma
    });

    if (nextEma.eq(0)) {
      return new Decimal(0);
    }

    return volumeDelta.div(nextEma).mul(100);
  }
}

interface VolumeState {
  lastCumulativeVolume: Decimal;
  emaDeltaVolume: Decimal;
}

function splitRows(payload: string, fieldCount: number, rowCount: number): string[][] {
  const values = payload.split("^");
  const safeRowCount = rowCount > 0 ? rowCount : Math.floor(values.length / fieldCount);
  const totalRowCount = Math.min(safeRowCount, Math.floor(values.length / fieldCount));
  const rows: string[][] = [];

  for (let rowIndex = 0; rowIndex < totalRowCount; rowIndex += 1) {
    const start = rowIndex * fieldCount;
    const end = start + fieldCount;
    rows.push(values.slice(start, end));
  }

  return rows;
}

function getField(row: string[], index: number): string {
  return row[index] ?? "";
}

function safeParseJson(rawMessage: string): unknown | null {
  if (!rawMessage.startsWith("{") && !rawMessage.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }
}

function tryParseSnapshot(payload: unknown): ParsedMarketSnapshot | null {
  try {
    return parseMarketSnapshot(payload);
  } catch {
    return null;
  }
}

function parseInteger(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalOrZero(rawValue: string): Decimal {
  if (rawValue.trim().length === 0) {
    return new Decimal(0);
  }

  try {
    return new Decimal(rawValue);
  } catch {
    return new Decimal(0);
  }
}

function decimalOrFallback(rawValue: string, fallback: Decimal): Decimal {
  if (rawValue.trim().length === 0) {
    return fallback;
  }

  try {
    return new Decimal(rawValue);
  } catch {
    return fallback;
  }
}

function safeDivide(numerator: Decimal, denominator: Decimal): Decimal {
  if (denominator.lte(0)) {
    return new Decimal(1);
  }

  return numerator.div(denominator);
}

function calculateSpreadBps(ask: Decimal, bid: Decimal, close: Decimal): Decimal {
  if (close.lte(0) || ask.lte(0) || bid.lte(0)) {
    return new Decimal(0);
  }

  return ask.minus(bid).div(close).mul(10000);
}

function normalizeOverseasSymbol(primary: string, fallback: string): string {
  const candidates = [primary, fallback]
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    const trailingAlphaTicker = candidate.match(/[A-Z]{1,6}$/);
    if (trailingAlphaTicker !== null) {
      return trailingAlphaTicker[0];
    }
  }

  return candidates[0] ?? "";
}
