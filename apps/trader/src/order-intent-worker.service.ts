import { loadRuntimeConfig } from "@app/config";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { ZodError } from "zod";

import { OrderExecutorService } from "./order-executor.service";
import { OrderIntentProcessor } from "./order-intent.processor";
import { parseOrderIntentEvent } from "./order-intent.schema";
import type { ParsedOrderIntentEvent } from "./order-intent.schema";

@Injectable()
export class OrderIntentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderIntentWorkerService.name);
  private readonly config = loadRuntimeConfig();
  private readonly processor: OrderIntentProcessor;

  private worker: Worker | null = null;

  constructor(orderExecutorService: OrderExecutorService) {
    if (!(orderExecutorService instanceof OrderExecutorService)) {
      throw new Error("OrderExecutorService provider wiring is invalid");
    }

    this.processor = new OrderIntentProcessor(this.config, orderExecutorService);
  }

  onModuleInit(): void {
    this.worker = new Worker(
      this.config.ORDER_INTENT_QUEUE_NAME,
      async (job) => {
        await this.processOrderIntentJob(job);
      },
      {
        connection: {
          host: this.config.REDIS_HOST,
          port: this.config.REDIS_PORT,
          maxRetriesPerRequest: 2,
          enableReadyCheck: true
        },
        concurrency: this.config.TRADER_WORKER_CONCURRENCY
      }
    );

    this.worker.on("completed", (job: Job) => {
      this.logger.debug(`trader job completed id=${job.id ?? "NONE"}`);
    });

    this.worker.on("failed", (job: Job | undefined, error: Error) => {
      const jobId = job?.id ?? "NONE";
      this.logger.error(`trader job failed id=${jobId} error=${error.message}`);
    });

    this.logger.log(
      `Trader worker started queue=${this.config.ORDER_INTENT_QUEUE_NAME} concurrency=${this.config.TRADER_WORKER_CONCURRENCY}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker !== null) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processOrderIntentJob(job: Job): Promise<void> {
    let parsedIntent: ParsedOrderIntentEvent;
    try {
      parsedIntent = parseOrderIntentEvent(job.data);
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.warn(`Invalid order intent payload dropped jobId=${job.id ?? "NONE"}`);
        return;
      }

      throw error;
    }

    const result = await this.processor.process(parsedIntent);

    this.logger.log(
      `preflight decisionId=${parsedIntent.decisionId} verdict=${result.riskEvaluation.verdict} blockCode=${result.riskEvaluation.blockCode ?? "NONE"}`
    );

    if (result.executionResult === null) {
      return;
    }

    this.logger.log(
      `execution decisionId=${parsedIntent.decisionId} status=${result.executionResult.status} brokerOrderId=${result.executionResult.brokerOrderId ?? "NONE"}`
    );
  }
}
