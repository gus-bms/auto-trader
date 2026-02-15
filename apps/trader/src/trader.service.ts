import { isLiveTradingAllowed, loadRuntimeConfig } from "@app/config";
import { SafeModeController } from "@app/core";
import { KisApiError, KisAuthClient } from "@app/kis-adapter";
import { evaluateEntryRisk } from "@app/risk";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";

@Injectable()
export class TraderService implements OnModuleInit {
  private readonly logger = new Logger(TraderService.name);
  private readonly safeModeController = new SafeModeController();

  async onModuleInit(): Promise<void> {
    const config = loadRuntimeConfig();
    const riskResult = evaluateEntryRisk(
      {
        marketDataAgeSec: 0,
        availableCashUsd: "1000",
        requestedNotionalUsd: "100",
        dailyPnlUsd: "0"
      },
      config
    );

    this.logger.log(
      `Trader bootstrapped. startupRiskVerdict=${riskResult.verdict} blockCode=${riskResult.blockCode ?? "NONE"}`
    );

    if (!isLiveTradingAllowed(config)) {
      this.logger.log("KIS auth bootstrap skipped because live trading is disabled.");
      return;
    }

    const authClient = new KisAuthClient({
      appKey: config.KIS_APP_KEY,
      appSecret: config.KIS_APP_SECRET,
      tokenUrl: config.KIS_TOKEN_URL,
      requestTimeoutMs: config.KIS_REQUEST_TIMEOUT_MS,
      maxRetryCount: config.KIS_AUTH_MAX_RETRY_COUNT,
      retryBackoffMs: config.KIS_AUTH_RETRY_BACKOFF_MS,
      expirySkewSec: config.KIS_AUTH_EXPIRY_SKEW_SEC,
      onAuthFailure: (context) => {
        const safeModeSnapshot = this.safeModeController.activate(context.reason, {
          attempts: String(context.attempts),
          message: context.message,
          statusCode: context.statusCode === null ? "NONE" : String(context.statusCode)
        });

        this.logger.error(
          `safeModeEnabled=${safeModeSnapshot.enabled} reason=${safeModeSnapshot.reason ?? "NONE"} authError=${context.message}`
        );
      }
    });

    try {
      await authClient.getAccessToken();
      const cachedToken = authClient.getCachedToken();

      this.logger.log(
        `KIS auth initialized. tokenCached=${cachedToken !== null} expiresAtMs=${cachedToken?.expiresAtMs ?? 0}`
      );
    } catch (error) {
      if (error instanceof KisApiError) {
        this.logger.error(`KIS auth failed: statusCode=${error.statusCode} message=${error.message}`);
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`KIS auth failed: ${message}`);
    }
  }
}
