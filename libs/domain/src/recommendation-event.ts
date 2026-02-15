import type { NewsDigest } from "./news.types";
import type { Decision, RiskEvaluationResult, RiskLevel } from "./trading.types";
import type { UniverseEvaluationResult } from "./universe.types";

export interface RecommendationScoreBreakdown {
  triggerScore: number;
  technicalScore: number;
  newsScore: number;
  llmScore: number;
  riskPenalty: number;
  totalScore: number;
}

export interface RecommendationProducedEvent {
  recommendationId: string;
  decisionId: string;
  correlationId: string;
  symbol: string;
  timeframe: "1m" | "5m";
  asOf: string;
  decision: Decision;
  confidence: number;
  riskLevel: RiskLevel;
  rationale: string;
  source: "llm+rules" | "fallback";
  scoreBreakdown: RecommendationScoreBreakdown;
  universeEvaluation: UniverseEvaluationResult;
  newsDigest: NewsDigest;
  riskEvaluation: RiskEvaluationResult;
  createdAt: string;
}
