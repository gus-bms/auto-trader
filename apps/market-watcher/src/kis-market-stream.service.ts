import { loadRuntimeConfig } from "@app/config";
import { KisApiError, KisApprovalClient, KisConfigError, KisWebSocketSession } from "@app/kis-adapter";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { KisRawFrameParser } from "./kis-raw-frame.parser";
import { MarketWatcherService } from "./market-watcher.service";

@Injectable()
export class KisMarketStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KisMarketStreamService.name);
  private readonly config = loadRuntimeConfig();
  private readonly rawFrameParser = new KisRawFrameParser();

  private session: KisWebSocketSession | null = null;

  async onModuleInit(): Promise<void> {
    if (this.config.KIS_WS_ENABLED !== "true") {
      this.logger.log("KIS WebSocket stream disabled by config.");
      return;
    }

    const approvalKey = await this.resolveApprovalKey();
    if (approvalKey === null) {
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
      approvalKey,
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

  private async resolveApprovalKey(): Promise<string | null> {
    const configuredApprovalKey = this.config.KIS_WS_APPROVAL_KEY.trim();
    if (configuredApprovalKey.length > 0) {
      return configuredApprovalKey;
    }

    const approvalClient = new KisApprovalClient({
      appKey: this.config.KIS_APP_KEY,
      appSecret: this.config.KIS_APP_SECRET,
      approvalUrl: this.config.KIS_APPROVAL_URL,
      requestTimeoutMs: this.config.KIS_REQUEST_TIMEOUT_MS,
      maxRetryCount: this.config.KIS_AUTH_MAX_RETRY_COUNT,
      retryBackoffMs: this.config.KIS_AUTH_RETRY_BACKOFF_MS
    });

    try {
      const fetchedApprovalKey = await approvalClient.getApprovalKey();
      this.logger.log("KIS WebSocket approval key fetched from REST API.");
      return fetchedApprovalKey;
    } catch (error) {
      if (error instanceof KisConfigError) {
        this.logger.warn(
          "KIS websocket bootstrap skipped: provide KIS_WS_APPROVAL_KEY or configure KIS_APP_KEY/KIS_APP_SECRET."
        );
        return null;
      }

      if (error instanceof KisApiError) {
        this.logger.error(`KIS approval key request failed: statusCode=${error.statusCode} message=${error.message}`);
        return null;
      }

      const message = error instanceof Error ? error.message : "Unknown approval key error";
      this.logger.error(`KIS approval key request failed: ${message}`);
      return null;
    }
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
