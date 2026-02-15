export const tradingModeValues = ["paper", "shadow", "live"] as const;

export type TradingMode = (typeof tradingModeValues)[number];

export const decisionValues = ["BUY", "WAIT"] as const;

export type Decision = (typeof decisionValues)[number];

export const riskLevelValues = ["LOW", "MEDIUM", "HIGH"] as const;

export type RiskLevel = (typeof riskLevelValues)[number];

export const riskBlockCodeValues = [
  "MODE_NOT_LIVE",
  "KILL_SWITCH_ON",
  "DATA_STALE",
  "DAILY_LOSS_LIMIT",
  "ORDER_NOTIONAL_LIMIT",
  "INSUFFICIENT_CASH"
] as const;

export type RiskBlockCode = (typeof riskBlockCodeValues)[number];

export type RiskVerdict = "PASS" | "BLOCK";

export interface RiskEvaluationResult {
  verdict: RiskVerdict;
  blockCode: RiskBlockCode | null;
  details: Record<string, string>;
}
