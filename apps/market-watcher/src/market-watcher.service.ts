import { randomUUID } from "node:crypto";

import { loadRuntimeConfig } from "@app/config";
import type { TradeSignalEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { MarketDataStalenessGuard } from "./market-data-staleness.guard";
import { parseMarketSnapshot } from "./market-snapshot.schema";
import { TradeSignalPublisher } from "./trade-signal.publisher";
import { evaluateRsiVolumeTrigger } from "./trigger.engine";

export interface SnapshotHandleResult {
  accepted: boolean;
  reason:
    | "SIGNAL_PUBLISHED"
    | "NO_TRIGGER"
    | "COOLDOWN_ACTIVE"
    | "SNAPSHOT_STALE"
    | "SYMBOL_NOT_IN_UNIVERSE";
  correlationId: string | null;
}

@Injectable()
export class MarketWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketWatcherService.name);
  private readonly config = loadRuntimeConfig();
  private readonly stalenessGuard = new MarketDataStalenessGuard(this.config.MAX_MARKET_DATA_AGE_SEC);
  private readonly cooldownMs = this.config.TRIGGER_COOLDOWN_SEC * 1000;
  private readonly universe = parseUniverseSymbols(this.config.MARKET_UNIVERSE);
  private readonly lastSignalAtBySymbol = new Map<string, number>();

  private stalenessCheckTimer: NodeJS.Timeout | null = null;

  constructor(private readonly tradeSignalPublisher: TradeSignalPublisher) {}

  onModuleInit(): void {
    this.logger.log(
      `Market watcher bootstrapped. universeSize=${this.universe.length} maxDataAgeSec=${this.config.MAX_MARKET_DATA_AGE_SEC}`
    );

    this.stalenessCheckTimer = setInterval(() => {
      const staleSymbols = this.stalenessGuard.listStaleSymbols(this.universe);
      if (staleSymbols.length > 0) {
        this.logger.warn(`dataStalenessGuard triggered staleSymbols=${staleSymbols.join(",")}`);
      }
    }, this.config.STALENESS_CHECK_INTERVAL_SEC * 1000);
  }

  onModuleDestroy(): void {
    if (this.stalenessCheckTimer !== null) {
      clearInterval(this.stalenessCheckTimer);
      this.stalenessCheckTimer = null;
    }
  }

  async handleSnapshot(payload: unknown, nowMs: number = Date.now()): Promise<SnapshotHandleResult> {
    const snapshot = parseMarketSnapshot(payload);
    const snapshotTimestampMs = Date.parse(snapshot.timestamp);

    if (!this.universe.includes(snapshot.symbol)) {
      return {
        accepted: false,
        reason: "SYMBOL_NOT_IN_UNIVERSE",
        correlationId: null
      };
    }

    if (this.stalenessGuard.isSnapshotStale(snapshotTimestampMs, nowMs)) {
      this.logger.warn(
        `stale snapshot rejected symbol=${snapshot.symbol} snapshotTs=${snapshot.timestamp} maxAgeSec=${this.config.MAX_MARKET_DATA_AGE_SEC}`
      );

      return {
        accepted: false,
        reason: "SNAPSHOT_STALE",
        correlationId: null
      };
    }

    this.stalenessGuard.record(snapshot.symbol, snapshotTimestampMs);

    const triggerVerdict = evaluateRsiVolumeTrigger(snapshot);
    if (triggerVerdict === null) {
      return {
        accepted: false,
        reason: "NO_TRIGGER",
        correlationId: null
      };
    }

    const lastSignalAt = this.lastSignalAtBySymbol.get(snapshot.symbol);
    if (lastSignalAt !== undefined && snapshotTimestampMs - lastSignalAt < this.cooldownMs) {
      return {
        accepted: false,
        reason: "COOLDOWN_ACTIVE",
        correlationId: null
      };
    }

    const correlationId = randomUUID();
    const eventPayload: TradeSignalEvent = {
      correlationId,
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      timestamp: snapshot.timestamp,
      candleSnapshot: {
        open: snapshot.candle.open,
        high: snapshot.candle.high,
        low: snapshot.candle.low,
        close: snapshot.candle.close,
        volume: snapshot.candle.volume
      },
      indicators: {
        rsi: snapshot.indicators.rsi,
        volumeChangeRatePct: snapshot.indicators.volumeChangeRatePct
      },
      orderBookSummary: {
        bidAskImbalanceRatio: snapshot.orderBookSummary.bidAskImbalanceRatio,
        spreadBps: snapshot.orderBookSummary.spreadBps
      },
      triggerType: triggerVerdict.triggerType,
      triggerScore: triggerVerdict.triggerScore
    };

    await this.tradeSignalPublisher.publish(eventPayload);
    this.lastSignalAtBySymbol.set(snapshot.symbol, snapshotTimestampMs);

    return {
      accepted: true,
      reason: "SIGNAL_PUBLISHED",
      correlationId
    };
  }
}

function parseUniverseSymbols(raw: string): string[] {
  return raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
}
