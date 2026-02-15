import Decimal from "decimal.js";

import type { RuntimeConfig } from "@app/config";
import { evaluateEntryRisk } from "@app/risk";

import type { OrderExecutionGateway, OrderExecutionResult, PreparedOrderRequest } from "./order-execution.types";
import type { ParsedOrderIntentEvent } from "./order-intent.schema";

export interface OrderIntentProcessResult {
  accepted: boolean;
  riskEvaluation: ReturnType<typeof evaluateEntryRisk>;
  preparedOrderRequest: PreparedOrderRequest | null;
  executionResult: OrderExecutionResult | null;
}

export class OrderIntentProcessor {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly executionGateway: OrderExecutionGateway
  ) {}

  async process(intentEvent: ParsedOrderIntentEvent, nowMs: number = Date.now()): Promise<OrderIntentProcessResult> {
    const marketDataAgeSec = calculateMarketDataAgeSec(intentEvent.createdAt, nowMs);

    const riskEvaluation = evaluateEntryRisk(
      {
        marketDataAgeSec,
        availableCashUsd: this.config.TRADER_AVAILABLE_CASH_USD,
        requestedNotionalUsd: intentEvent.requestedNotionalUsd,
        dailyPnlUsd: this.config.TRADER_DAILY_PNL_USD
      },
      this.config
    );

    if (riskEvaluation.verdict === "BLOCK") {
      return {
        accepted: false,
        riskEvaluation,
        preparedOrderRequest: null,
        executionResult: null
      };
    }

    const preparedOrderRequest: PreparedOrderRequest = {
      decisionId: intentEvent.decisionId,
      correlationId: intentEvent.correlationId,
      idempotencyKey: buildIdempotencyKey(intentEvent),
      symbol: intentEvent.symbol,
      side: intentEvent.side,
      orderType: intentEvent.orderType,
      requestedNotionalUsd: new Decimal(intentEvent.requestedNotionalUsd).toFixed(),
      createdAt: new Date(nowMs).toISOString()
    };

    const executionResult = await this.executionGateway.execute(preparedOrderRequest);

    return {
      accepted: executionResult.status === "SUBMITTED" || executionResult.status === "DRY_RUN_SKIPPED",
      riskEvaluation,
      preparedOrderRequest,
      executionResult
    };
  }
}

function buildIdempotencyKey(intentEvent: ParsedOrderIntentEvent): string {
  const minuteBucket = Math.floor(Date.parse(intentEvent.createdAt) / 60000);
  return `${intentEvent.symbol}:BUY:${intentEvent.decisionId}:${minuteBucket}`;
}

function calculateMarketDataAgeSec(intentTimestamp: string, nowMs: number): number {
  const intentTimestampMs = Date.parse(intentTimestamp);
  if (!Number.isFinite(intentTimestampMs)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(0, Math.floor((nowMs - intentTimestampMs) / 1000));
}
