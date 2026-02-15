import { isLiveTradingAllowed, loadRuntimeConfig } from "@app/config";
import type { TradeSignalEvent } from "@app/domain";
import { AnalystDecisionEngine, LlmAnalystClient, RecommendationScoringEngine } from "@app/llm-analyst";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";

import { NewsIngestService } from "./news-ingest.service";
import { OrderIntentPublisher } from "./order-intent.publisher";
import { RecommendationPublisher } from "./recommendation.publisher";
import { RecommendationStoreService } from "./recommendation-store.service";

@Injectable()
export class AnalystWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalystWorkerService.name);
  private readonly config = loadRuntimeConfig();

  private readonly llmClient = new LlmAnalystClient({
    apiKey: this.config.OPENAI_API_KEY,
    model: this.config.ANALYST_LLM_MODEL,
    timeoutMs: this.config.ANALYST_LLM_TIMEOUT_MS,
    endpoint: this.config.ANALYST_LLM_ENDPOINT
  });

  private readonly decisionEngine = new AnalystDecisionEngine(this.llmClient, this.config);
  private readonly recommendationScoringEngine = new RecommendationScoringEngine(this.config);
  private readonly newsIngestService: NewsIngestService;
  private readonly recommendationStoreService: RecommendationStoreService;
  private readonly recommendationPublisher: RecommendationPublisher;
  private readonly orderIntentPublisher: OrderIntentPublisher;

  private worker: Worker | null = null;

  constructor(
    newsIngestService: NewsIngestService = new NewsIngestService(),
    recommendationStoreService: RecommendationStoreService = new RecommendationStoreService(),
    recommendationPublisher: RecommendationPublisher = new RecommendationPublisher(),
    orderIntentPublisher: OrderIntentPublisher = new OrderIntentPublisher()
  ) {
    this.newsIngestService = newsIngestService;
    this.recommendationStoreService = recommendationStoreService;
    this.recommendationPublisher = recommendationPublisher;
    this.orderIntentPublisher = orderIntentPublisher;
  }

  onModuleInit(): void {
    this.worker = new Worker(
      this.config.TRADE_SIGNAL_QUEUE_NAME,
      async (job) => {
        await this.processTradeSignalJob(job);
      },
      {
        connection: {
          host: this.config.REDIS_HOST,
          port: this.config.REDIS_PORT,
          maxRetriesPerRequest: 2,
          enableReadyCheck: true
        },
        concurrency: this.config.ANALYST_WORKER_CONCURRENCY
      }
    );

    this.worker.on("completed", (job: Job) => {
      this.logger.debug(`analyst job completed id=${job.id ?? "NONE"}`);
    });

    this.worker.on("failed", (job: Job | undefined, error: Error) => {
      const jobId = job?.id ?? "NONE";
      this.logger.error(`analyst job failed id=${jobId} error=${error.message}`);
    });

    this.logger.log(
      `Analyst worker started queue=${this.config.TRADE_SIGNAL_QUEUE_NAME} concurrency=${this.config.ANALYST_WORKER_CONCURRENCY}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker !== null) {
      await this.worker.close();
      this.worker = null;
    }

    await this.recommendationStoreService.onModuleDestroy();
    await this.recommendationPublisher.onModuleDestroy();
    await this.orderIntentPublisher.onModuleDestroy();
  }

  private async processTradeSignalJob(job: Job): Promise<void> {
    try {
      const signalEvent = parseTradeSignalEvent(job.data);
      if (signalEvent === null) {
        this.logger.warn(`Invalid trade signal payload dropped jobId=${job.id ?? "NONE"}`);
        return;
      }

      const nowMs = Date.now();
      const newsDigest = this.newsIngestService.getNewsDigest(signalEvent.symbol, signalEvent.timestamp);
      const evaluation = await this.decisionEngine.evaluateTradeSignal(signalEvent, nowMs, newsDigest);
      const recommendationEvent = this.recommendationScoringEngine.buildRecommendation({
        signalEvent,
        universeEvaluation: evaluation.universeEvaluation,
        decisionRecord: evaluation.decisionRecord,
        newsDigest,
        riskEvaluation: evaluation.riskEvaluation,
        nowMs
      });

      this.logger.log(
        `decision decisionId=${evaluation.decisionRecord.decisionId} symbol=${signalEvent.symbol} decision=${evaluation.decisionRecord.decision} confidence=${evaluation.decisionRecord.confidence} source=${evaluation.decisionRecord.source}`
      );

      this.logger.log(
        `risk decisionId=${evaluation.decisionRecord.decisionId} verdict=${evaluation.riskEvaluation.verdict} blockCode=${evaluation.riskEvaluation.blockCode ?? "NONE"}`
      );

      await this.recommendationStoreService.save(recommendationEvent);
      await this.recommendationPublisher.publish(recommendationEvent);

      this.logger.log(
        `recommendation recommendationId=${recommendationEvent.recommendationId} symbol=${recommendationEvent.symbol} decision=${recommendationEvent.decision} score=${recommendationEvent.scoreBreakdown.totalScore.toFixed(2)} newsCount=${recommendationEvent.newsDigest.newsCount}`
      );

      if (!recommendationEvent.universeEvaluation.accepted) {
        this.logger.warn(
          `universe filtered symbol=${recommendationEvent.symbol} reasons=${recommendationEvent.universeEvaluation.rejectionReasons.join(",") || "NONE"}`
        );
      }

      if (this.config.ANALYST_EMIT_ORDER_INTENT !== "true") {
        return;
      }

      if (!isLiveTradingAllowed(this.config)) {
        this.logger.warn("ANALYST_EMIT_ORDER_INTENT is true but live mode is disabled; skipping order intent publish");
        return;
      }

      if (evaluation.orderIntentEvent === null) {
        return;
      }

      await this.orderIntentPublisher.publish(evaluation.orderIntentEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown analyst worker error";
      this.logger.error(`analyst job pipeline failed jobId=${job.id ?? "NONE"} error=${message}`);
    }
  }
}

function parseTradeSignalEvent(payload: unknown): TradeSignalEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  const correlationId = readString(payload, "correlationId");
  const symbol = readString(payload, "symbol");
  const timeframe = readString(payload, "timeframe");
  const timestamp = readString(payload, "timestamp");
  const triggerType = readString(payload, "triggerType");
  const triggerScore = readNumber(payload, "triggerScore");
  const candleSnapshot = readRecord(payload, "candleSnapshot");
  const indicators = readRecord(payload, "indicators");
  const orderBookSummary = readRecord(payload, "orderBookSummary");

  if (
    correlationId === null ||
    symbol === null ||
    timestamp === null ||
    (timeframe !== "1m" && timeframe !== "5m") ||
    triggerType !== "RSI_VOLUME_SPIKE" ||
    triggerScore === null ||
    candleSnapshot === null ||
    indicators === null ||
    orderBookSummary === null
  ) {
    return null;
  }

  const open = readString(candleSnapshot, "open");
  const high = readString(candleSnapshot, "high");
  const low = readString(candleSnapshot, "low");
  const close = readString(candleSnapshot, "close");
  const volume = readString(candleSnapshot, "volume");

  const rsi = readString(indicators, "rsi");
  const volumeChangeRatePct = readString(indicators, "volumeChangeRatePct");

  const bidAskImbalanceRatio = readString(orderBookSummary, "bidAskImbalanceRatio");
  const spreadBps = readString(orderBookSummary, "spreadBps");

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null ||
    rsi === null ||
    volumeChangeRatePct === null ||
    bidAskImbalanceRatio === null ||
    spreadBps === null
  ) {
    return null;
  }

  return {
    correlationId,
    symbol,
    timeframe,
    timestamp,
    candleSnapshot: {
      open,
      high,
      low,
      close,
      volume
    },
    indicators: {
      rsi,
      volumeChangeRatePct
    },
    orderBookSummary: {
      bidAskImbalanceRatio,
      spreadBps
    },
    triggerType,
    triggerScore
  };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function readRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key];
  if (!isRecord(value)) {
    return null;
  }

  return value;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}
