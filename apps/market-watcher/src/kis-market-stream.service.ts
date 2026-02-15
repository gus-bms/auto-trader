import { loadRuntimeConfig } from "@app/config";
import { KisWebSocketSession } from "@app/kis-adapter";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { KisRawFrameParser } from "./kis-raw-frame.parser";
import { MarketWatcherService } from "./market-watcher.service";

@Injectable()
export class KisMarketStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KisMarketStreamService.name);
  private readonly config = loadRuntimeConfig();
  private readonly rawFrameParser = new KisRawFrameParser();

  private session: KisWebSocketSession | null = null;

  onModuleInit(): void {
    if (this.config.KIS_WS_ENABLED !== "true") {
      this.logger.log("KIS WebSocket stream disabled by config.");
      return;
    }

    if (this.config.KIS_WS_APPROVAL_KEY.trim().length === 0) {
      this.logger.warn("KIS_WS_ENABLED is true but KIS_WS_APPROVAL_KEY is empty. Stream is not started.");
      return;
    }

    const subscriptions = parseUniverseSymbols(this.config.MARKET_UNIVERSE).map((symbol) => ({
      trId: this.config.KIS_WS_TR_ID,
      trKey: symbol
    }));

    if (subscriptions.length === 0) {
      this.logger.warn("KIS stream bootstrap skipped because MARKET_UNIVERSE is empty.");
      return;
    }

    this.session = new KisWebSocketSession({
      wsUrl: this.config.KIS_WS_URL,
      approvalKey: this.config.KIS_WS_APPROVAL_KEY,
      customerType: this.config.KIS_WS_CUSTOMER_TYPE,
      reconnectBaseMs: this.config.KIS_WS_RECONNECT_BASE_MS,
      reconnectMaxMs: this.config.KIS_WS_RECONNECT_MAX_MS,
      onOpen: () => {
        this.logger.log(`KIS stream connected and subscribed symbols=${subscriptions.map((item) => item.trKey).join(",")}`);
      },
      onClose: (code, reason) => {
        this.logger.warn(`KIS stream closed code=${code} reason=${reason}`);
      },
      onError: (error) => {
        this.logger.error(`KIS stream error: ${error.message}`);
      },
      onMessage: async (rawMessage) => {
        await this.forwardRawMessage(rawMessage);
      }
    });

    this.session.start(subscriptions);
  }

  onModuleDestroy(): void {
    this.session?.stop();
    this.session = null;
  }

  constructor(private readonly marketWatcherService: MarketWatcherService) {
    if (!(marketWatcherService instanceof MarketWatcherService)) {
      throw new Error("MarketWatcherService provider wiring is invalid");
    }
  }

  private async forwardRawMessage(rawMessage: string): Promise<void> {
    const snapshots = this.rawFrameParser.parse(rawMessage);
    if (snapshots.length === 0) {
      return;
    }

    for (const snapshot of snapshots) {
      try {
        const result = await this.marketWatcherService.handleSnapshot(snapshot);
        if (result.accepted) {
          this.logger.log(`tradeSignal accepted correlationId=${result.correlationId ?? "NONE"}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown market payload parse error";
        this.logger.debug(`Ignored market payload: ${message}`);
      }
    }
  }
}

function parseUniverseSymbols(raw: string): string[] {
  return raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
}
