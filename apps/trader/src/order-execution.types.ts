export interface PreparedOrderRequest {
  decisionId: string;
  correlationId: string;
  idempotencyKey: string;
  symbol: string;
  side: "BUY";
  orderType: "Market" | "BestLimit";
  requestedNotionalUsd: string;
  createdAt: string;
}

export type OrderExecutionStatus =
  | "SUBMITTED"
  | "DRY_RUN_SKIPPED"
  | "LIVE_ORDER_DISABLED"
  | "LIVE_ORDER_UNIMPLEMENTED";

export interface OrderExecutionResult {
  status: OrderExecutionStatus;
  brokerOrderId: string | null;
  message: string;
}

export interface OrderExecutionGateway {
  execute(request: PreparedOrderRequest): Promise<OrderExecutionResult>;
}
