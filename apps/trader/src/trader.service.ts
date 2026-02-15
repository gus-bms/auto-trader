import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";

import { loadRuntimeConfig } from "@app/config";
import { evaluateEntryRisk } from "@app/risk";

@Injectable()
export class TraderService implements OnModuleInit {
  private readonly logger = new Logger(TraderService.name);

  onModuleInit(): void {
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
  }
}
