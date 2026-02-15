import { randomUUID } from "node:crypto";

import type { RuntimeConfig } from "@app/config";
import type {
  AnalystDecisionRecord,
  NewsDigest,
  RecommendationProducedEvent,
  RecommendationScoreBreakdown,
  RiskEvaluationResult,
  RiskLevel,
  TradeSignalEvent,
  UniverseEvaluationResult
} from "@app/domain";

export interface RecommendationScoringInput {
  signalEvent: TradeSignalEvent;
  universeEvaluation: UniverseEvaluationResult;
  decisionRecord: AnalystDecisionRecord;
  newsDigest: NewsDigest;
  riskEvaluation: RiskEvaluationResult;
  nowMs?: number;
}

export class RecommendationScoringEngine {
  constructor(private readonly config: RuntimeConfig) {}

  buildRecommendation(input: RecommendationScoringInput): RecommendationProducedEvent {
    const nowMs = input.nowMs ?? Date.now();

    const triggerScore = clampToScore(input.signalEvent.triggerScore);
    const technicalScore = scoreTechnical(input.signalEvent);
    const newsScore = scoreNews(input.newsDigest);
    const llmScore = clampToScore(input.decisionRecord.confidence);
    const riskPenalty = scoreRiskPenalty(input.riskEvaluation);
    const totalScore = clampToScore(
      triggerScore * 0.25 + technicalScore * 0.25 + newsScore * 0.2 + llmScore * 0.3 - riskPenalty
    );

    const scoreBreakdown: RecommendationScoreBreakdown = {
      triggerScore,
      technicalScore,
      newsScore,
      llmScore,
      riskPenalty,
      totalScore
    };

    const decision =
      input.universeEvaluation.accepted &&
      input.riskEvaluation.verdict === "PASS" &&
      input.decisionRecord.decision === "BUY" &&
      totalScore >= this.config.ANALYST_SCORE_BUY_THRESHOLD
        ? "BUY"
        : "WAIT";

    const riskLevel = inferRiskLevel(decision, totalScore, input.riskEvaluation);
    const universeScore = input.universeEvaluation.scoreBreakdown.universeScore.toFixed(1);
    const rejectionHint =
      input.universeEvaluation.rejectionReasons.length > 0
        ? ` rejection=${input.universeEvaluation.rejectionReasons.join(",")}`
        : "";
    const rationale = `${input.decisionRecord.rationale} | score=${totalScore.toFixed(2)} universe=${universeScore} trigger=${triggerScore.toFixed(
      1
    )} technical=${technicalScore.toFixed(1)} news=${newsScore.toFixed(1)} riskPenalty=${riskPenalty.toFixed(1)}${rejectionHint}`;

    return {
      recommendationId: randomUUID(),
      decisionId: input.decisionRecord.decisionId,
      correlationId: input.decisionRecord.correlationId,
      symbol: input.signalEvent.symbol,
      timeframe: input.signalEvent.timeframe,
      asOf: input.signalEvent.timestamp,
      decision,
      confidence: clampToScore(totalScore),
      riskLevel,
      rationale: rationale.slice(0, 300),
      source: input.decisionRecord.source === "fallback" ? "fallback" : "llm+rules",
      scoreBreakdown,
      universeEvaluation: input.universeEvaluation,
      newsDigest: input.newsDigest,
      riskEvaluation: input.riskEvaluation,
      createdAt: new Date(nowMs).toISOString()
    };
  }
}

function scoreTechnical(signalEvent: TradeSignalEvent): number {
  const rsiValue = Number(signalEvent.indicators.rsi);
  const volumeSpikePct = Number(signalEvent.indicators.volumeChangeRatePct);

  const safeRsi = Number.isFinite(rsiValue) ? rsiValue : 50;
  const safeVolume = Number.isFinite(volumeSpikePct) ? volumeSpikePct : 0;

  const rsiScore = safeRsi <= 30 ? clampToScore(70 + (30 - safeRsi) * 1.5) : clampToScore(70 - (safeRsi - 30) * 2);
  const volumeScore = clampToScore(safeVolume / 3);

  return clampToScore(rsiScore * 0.6 + volumeScore * 0.4);
}

function scoreNews(newsDigest: NewsDigest): number {
  const centeredScore = (newsDigest.averageSentiment + 1) * 50;
  const confidenceWeight = 0.5 + newsDigest.confidence * 0.5;
  return clampToScore(centeredScore * confidenceWeight);
}

function scoreRiskPenalty(riskEvaluation: RiskEvaluationResult): number {
  if (riskEvaluation.verdict === "PASS") {
    return 0;
  }

  switch (riskEvaluation.blockCode) {
    case "DATA_STALE":
      return 45;
    case "DAILY_LOSS_LIMIT":
      return 60;
    case "KILL_SWITCH_ON":
      return 70;
    case "MODE_NOT_LIVE":
      return 35;
    default:
      return 50;
  }
}

function inferRiskLevel(decision: "BUY" | "WAIT", totalScore: number, riskEvaluation: RiskEvaluationResult): RiskLevel {
  if (decision === "WAIT" || riskEvaluation.verdict === "BLOCK") {
    return "HIGH";
  }

  if (totalScore >= 80) {
    return "LOW";
  }

  if (totalScore >= 60) {
    return "MEDIUM";
  }

  return "HIGH";
}

function clampToScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}
