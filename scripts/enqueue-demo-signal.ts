import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";

import type { TradeSignalEvent } from "../libs/domain/src";

const HELP_TEXT = `Usage:
  npm run demo:enqueue-signal -- [options]

Options:
  --symbol <value>              Symbol (default: SOXL)
  --timeframe <1m|5m>           Timeframe (default: 1m)
  --timestamp <iso>             Event timestamp (default: now)
  --open <decimal>              Candle open (default: 26.10)
  --high <decimal>              Candle high (default: 26.50)
  --low <decimal>               Candle low (default: 25.90)
  --close <decimal>             Candle close (default: 26.40)
  --volume <decimal>            Candle volume (default: 350000)
  --rsi <decimal>               RSI (default: 27.5)
  --volume-change-pct <decimal> Volume change percent (default: 250)
  --imbalance <decimal>         Bid/ask imbalance ratio (default: 1.10)
  --spread-bps <decimal>        Spread in bps (default: 8)
  --trigger-score <number>      Trigger score 0~100 (default: 86)
  --help                        Show this help
`;

async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const queueName = readEnvString("TRADE_SIGNAL_QUEUE_NAME", "tradeSignalQueue");
  const redisHost = readEnvString("REDIS_HOST", "127.0.0.1");
  const redisPort = readEnvInteger("REDIS_PORT", 6379);

  const signalEvent: TradeSignalEvent = {
    correlationId: `demo-${randomUUID()}`,
    symbol: readStringOption("--symbol", "SOXL").toUpperCase(),
    timeframe: readTimeframeOption("--timeframe", "1m"),
    timestamp: readIsoTimestampOption("--timestamp", new Date().toISOString()),
    candleSnapshot: {
      open: readDecimalStringOption("--open", "26.10"),
      high: readDecimalStringOption("--high", "26.50"),
      low: readDecimalStringOption("--low", "25.90"),
      close: readDecimalStringOption("--close", "26.40"),
      volume: readDecimalStringOption("--volume", "350000")
    },
    indicators: {
      rsi: readDecimalStringOption("--rsi", "27.5"),
      volumeChangeRatePct: readDecimalStringOption("--volume-change-pct", "250")
    },
    orderBookSummary: {
      bidAskImbalanceRatio: readDecimalStringOption("--imbalance", "1.10"),
      spreadBps: readDecimalStringOption("--spread-bps", "8")
    },
    triggerType: "RSI_VOLUME_SPIKE",
    triggerScore: readScoreOption("--trigger-score", 86)
  };

  const queue = new Queue(queueName, {
    connection: {
      host: redisHost,
      port: redisPort
    }
  });

  try {
    const job = await queue.add("trade-signal", signalEvent);
    console.log(
      `[demo-signal] enqueued jobId=${String(job.id)} queue=${queueName} symbol=${signalEvent.symbol} score=${signalEvent.triggerScore}`
    );
  } finally {
    await queue.close();
  }
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readStringOption(flag: string, fallback: string): string {
  const value = readRawOption(flag);
  if (value === null) {
    return fallback;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${flag} must not be empty`);
  }

  return normalized;
}

function readTimeframeOption(flag: string, fallback: "1m" | "5m"): "1m" | "5m" {
  const value = readStringOption(flag, fallback);
  if (value !== "1m" && value !== "5m") {
    throw new Error(`${flag} must be 1m or 5m`);
  }

  return value;
}

function readIsoTimestampOption(flag: string, fallback: string): string {
  const value = readStringOption(flag, fallback);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${flag} must be a valid ISO timestamp`);
  }

  return value;
}

function readDecimalStringOption(flag: string, fallback: string): string {
  const value = readStringOption(flag, fallback);
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new Error(`${flag} must be a decimal string`);
  }

  return value;
}

function readScoreOption(flag: string, fallback: number): number {
  const rawValue = readRawOption(flag);
  if (rawValue === null) {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number`);
  }

  if (parsed < 0 || parsed > 100) {
    throw new Error(`${flag} must be between 0 and 100`);
  }

  return parsed;
}

function readRawOption(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }

  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function readEnvString(name: string, fallback: string): string {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function readEnvInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown demo signal enqueue error";
  console.error(`[demo-signal] failed: ${message}`);
  process.exitCode = 1;
});
