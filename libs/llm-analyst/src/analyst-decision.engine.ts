import { randomUUID } from "node:crypto";

import type {
  AnalystDecisionOutput,
  AnalystDecisionRecord,
  AnalystLlmInput,
  NewsDigest,
  OrderIntentEvent,
  RiskEvaluationResult,
  TradeSignalEvent,
  UniverseEvaluationResult
} from "@app/domain";
import { isLiveTradingAllowed, type RuntimeConfig } from "@app/config";
import { evaluateEntryRisk } from "@app/risk";

import type { LlmAnalystClient } from "./llm-analyst.client";
import { UniverseSelectorEngine } from "./universe-selector.engine";

export interface AnalystDecisionEvaluation {
  decisionRecord: AnalystDecisionRecord;
  riskEvaluation: RiskEvaluationResult;
  universeEvaluation: UniverseEvaluationResult;
  orderIntentEvent: OrderIntentEvent | null;
}

export class AnalystDecisionEngine {
  private readonly universeSelector: UniverseSelectorEngine;

  constructor(
    private readonly llmClient: Pick<LlmAnalystClient, "analyze">,
    private readonly config: RuntimeConfig
  ) {
    this.universeSelector = new UniverseSelectorEngine(config);
  }

  async evaluateTradeSignal(
    signalEvent: TradeSignalEvent,
    nowMs: number = Date.now(),
    newsDigest?: NewsDigest
  ): Promise<AnalystDecisionEvaluation> {
    const llmInput = buildLlmInput(signalEvent, newsDigest);
    const universeEvaluation = this.universeSelector.evaluateSignal(signalEvent, nowMs);

    let decisionOutput: AnalystDecisionOutput;
    let source: AnalystDecisionRecord["source"] = "llm";

    if (!universeEvaluation.accepted) {
      source = "fallback";
      decisionOutput = createWaitFallbackDecision(`Universe filtered (${universeEvaluation.rejectionReasons.join(",")})`);
    } else {
      try {
        decisionOutput = await this.llmClient.analyze(llmInput);
      } catch (error) {
        source = "fallback";
        const message = error instanceof Error ? error.message : "LLM unknown failure";
        decisionOutput = createWaitFallbackDecision(message);
      }
    }

    const decisionRecord: AnalystDecisionRecord = {
      decisionId: randomUUID(),
      correlationId: signalEvent.correlationId,
      source,
      llmInput,
      decision: decisionOutput.decision,
      confidence: decisionOutput.confidence,
      riskLevel: decisionOutput.riskLevel,
      rationale: decisionOutput.rationale,
      createdAt: new Date(nowMs).toISOString()
    };

    const marketDataAgeSec = calculateMarketDataAgeSec(signalEvent.timestamp, nowMs);
    const riskEvaluation = evaluateEntryRisk(
      {
        marketDataAgeSec,
        availableCashUsd: this.config.ANALYST_AVAILABLE_CASH_USD,
        requestedNotionalUsd: this.config.ANALYST_ORDER_NOTIONAL_USD,
        dailyPnlUsd: this.config.ANALYST_DAILY_PNL_USD
      },
      this.config,
      {
        skipModeCheck: this.config.ANALYST_SCREENING_IGNORE_MODE_GUARD === "true"
      }
    );

    const liveTradingAllowed = isLiveTradingAllowed(this.config);

    if (decisionRecord.decision !== "BUY" || riskEvaluation.verdict !== "PASS" || !liveTradingAllowed) {
      return {
        decisionRecord,
        riskEvaluation,
        universeEvaluation,
        orderIntentEvent: null
      };
    }

    const orderIntentEvent: OrderIntentEvent = {
      decisionId: decisionRecord.decisionId,
      correlationId: decisionRecord.correlationId,
      symbol: signalEvent.symbol,
      side: "BUY",
      orderType: "BestLimit",
      requestedNotionalUsd: this.config.ANALYST_ORDER_NOTIONAL_USD,
      confidence: decisionRecord.confidence,
      riskLevel: decisionRecord.riskLevel,
      rationale: decisionRecord.rationale,
      createdAt: decisionRecord.createdAt
    };

    return {
      decisionRecord,
      riskEvaluation,
      universeEvaluation,
      orderIntentEvent
    };
  }
}

function buildLlmInput(signalEvent: TradeSignalEvent, newsDigest?: NewsDigest): AnalystLlmInput {
  const llmInput: AnalystLlmInput = {
    symbol: signalEvent.symbol,
    price: signalEvent.candleSnapshot.close,
    timestamp: signalEvent.timestamp,
    timeframe: signalEvent.timeframe,
    computedIndicators: {
      rsi: signalEvent.indicators.rsi,
      volumeChangeRatePct: signalEvent.indicators.volumeChangeRatePct,
      triggerScore: signalEvent.triggerScore
    },
    orderBookSummary: {
      bidAskImbalanceRatio: signalEvent.orderBookSummary.bidAskImbalanceRatio,
      spreadBps: signalEvent.orderBookSummary.spreadBps
    },
    triggerType: signalEvent.triggerType
  };

  if (newsDigest !== undefined) {
    llmInput.recentNewsSummary = {
      newsCount: newsDigest.newsCount,
      averageSentiment: newsDigest.averageSentiment,
      headlines: newsDigest.topHeadlines.map((item) => item.headline)
    };
  }

  return llmInput;
}

function createWaitFallbackDecision(reason: string): AnalystDecisionOutput {
  return {
    decision: "WAIT",
    confidence: 0,
    riskLevel: "HIGH",
    rationale: `LLM fallback WAIT: ${reason}`.slice(0, 300)
  };
}

function calculateMarketDataAgeSec(eventTimestamp: string, nowMs: number): number {
  const eventTimestampMs = Date.parse(eventTimestamp);
  if (!Number.isFinite(eventTimestampMs)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(0, Math.floor((nowMs - eventTimestampMs) / 1000));
}
