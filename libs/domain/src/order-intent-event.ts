import type { RiskLevel } from "./trading.types";

export interface OrderIntentEvent {
  decisionId: string;
  correlationId: string;
  symbol: string;
  side: "BUY";
  orderType: "Market" | "BestLimit";
  requestedNotionalUsd: string;
  confidence: number;
  riskLevel: RiskLevel;
  rationale: string;
  createdAt: string;
}
