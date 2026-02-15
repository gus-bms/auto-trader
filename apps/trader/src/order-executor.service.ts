import { randomUUID } from "node:crypto";

import { isLiveTradingAllowed, loadRuntimeConfig } from "@app/config";
import { Injectable, Logger } from "@nestjs/common";

import type { OrderExecutionGateway, OrderExecutionResult, PreparedOrderRequest } from "./order-execution.types";

@Injectable()
export class OrderExecutorService implements OrderExecutionGateway {
  private readonly logger = new Logger(OrderExecutorService.name);
  private readonly config = loadRuntimeConfig();

  async execute(request: PreparedOrderRequest): Promise<OrderExecutionResult> {
    if (!isLiveTradingAllowed(this.config)) {
      this.logger.log(
        `dry-run order skipped symbol=${request.symbol} idempotencyKey=${request.idempotencyKey} requestedNotionalUsd=${request.requestedNotionalUsd}`
      );

      return {
        status: "DRY_RUN_SKIPPED",
        brokerOrderId: null,
        message: "Order blocked from broker transmission because live mode is disabled"
      };
    }

    if (this.config.TRADER_LIVE_ORDER_ENABLED !== "true") {
      this.logger.warn(
        `live order disabled by config symbol=${request.symbol} idempotencyKey=${request.idempotencyKey} liveSwitch=${this.config.TRADER_LIVE_ORDER_ENABLED}`
      );

      return {
        status: "LIVE_ORDER_DISABLED",
        brokerOrderId: null,
        message: "Set TRADER_LIVE_ORDER_ENABLED=true to allow broker order transmission"
      };
    }

    this.logger.warn(
      `live order adapter not implemented yet symbol=${request.symbol} idempotencyKey=${request.idempotencyKey}`
    );

    return {
      status: "LIVE_ORDER_UNIMPLEMENTED",
      brokerOrderId: `unimplemented-${randomUUID()}`,
      message: "KIS order transmission adapter is not implemented yet"
    };
  }
}
