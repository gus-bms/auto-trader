import Decimal from "decimal.js";

import { isLiveTradingAllowed } from "@app/config";
import type { RuntimeConfig } from "@app/config";
import type { RiskEvaluationResult } from "@app/domain";

export interface EntryRiskInput {
  marketDataAgeSec: number;
  availableCashUsd: Decimal.Value;
  requestedNotionalUsd: Decimal.Value;
  dailyPnlUsd: Decimal.Value;
}

export interface EntryRiskEvaluationOptions {
  skipModeCheck?: boolean;
}

export function evaluateEntryRisk(
  input: EntryRiskInput,
  config: RuntimeConfig,
  options: EntryRiskEvaluationOptions = {}
): RiskEvaluationResult {
  if (options.skipModeCheck !== true && !isLiveTradingAllowed(config)) {
    return {
      verdict: "BLOCK",
      blockCode: "MODE_NOT_LIVE",
      details: {
        appMode: config.APP_MODE,
        liveMode: config.LIVE_MODE
      }
    };
  }

  if (config.KILL_SWITCH_ON === "true") {
    return {
      verdict: "BLOCK",
      blockCode: "KILL_SWITCH_ON",
      details: {}
    };
  }

  if (input.marketDataAgeSec > config.MAX_MARKET_DATA_AGE_SEC) {
    return {
      verdict: "BLOCK",
      blockCode: "DATA_STALE",
      details: {
        marketDataAgeSec: String(input.marketDataAgeSec),
        maxAllowedAgeSec: String(config.MAX_MARKET_DATA_AGE_SEC)
      }
    };
  }

  const dailyPnl = new Decimal(input.dailyPnlUsd);
  const dailyLossLimit = new Decimal(config.DAILY_LOSS_LIMIT_USD);
  if (dailyPnl.lte(dailyLossLimit.negated())) {
    return {
      verdict: "BLOCK",
      blockCode: "DAILY_LOSS_LIMIT",
      details: {
        dailyPnlUsd: dailyPnl.toFixed(),
        dailyLossLimitUsd: dailyLossLimit.toFixed()
      }
    };
  }

  const requestedNotional = new Decimal(input.requestedNotionalUsd);
  const maxOrderNotional = new Decimal(config.MAX_ORDER_NOTIONAL_USD);
  if (requestedNotional.gt(maxOrderNotional)) {
    return {
      verdict: "BLOCK",
      blockCode: "ORDER_NOTIONAL_LIMIT",
      details: {
        requestedNotionalUsd: requestedNotional.toFixed(),
        maxOrderNotionalUsd: maxOrderNotional.toFixed()
      }
    };
  }

  const availableCash = new Decimal(input.availableCashUsd);
  if (requestedNotional.gt(availableCash)) {
    return {
      verdict: "BLOCK",
      blockCode: "INSUFFICIENT_CASH",
      details: {
        requestedNotionalUsd: requestedNotional.toFixed(),
        availableCashUsd: availableCash.toFixed()
      }
    };
  }

  return {
    verdict: "PASS",
    blockCode: null,
    details: {
      availableCashUsd: availableCash.toFixed(),
      requestedNotionalUsd: requestedNotional.toFixed()
    }
  };
}
