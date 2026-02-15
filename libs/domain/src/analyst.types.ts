import type { Decision, RiskLevel } from "./trading.types";

export interface AnalystLlmInput {
  symbol: string;
  price: string;
  timestamp: string;
  timeframe: "1m" | "5m";
  computedIndicators: {
    rsi: string;
    volumeChangeRatePct: string;
    triggerScore: number;
  };
  orderBookSummary: {
    bidAskImbalanceRatio: string;
    spreadBps: string;
  };
  triggerType: "RSI_VOLUME_SPIKE";
}

export interface AnalystDecisionOutput {
  decision: Decision;
  confidence: number;
  riskLevel: RiskLevel;
  rationale: string;
}

export interface AnalystDecisionRecord extends AnalystDecisionOutput {
  decisionId: string;
  correlationId: string;
  source: "llm" | "fallback";
  llmInput: AnalystLlmInput;
  createdAt: string;
}
