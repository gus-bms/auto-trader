import { loadRuntimeConfig } from "@app/config";
import type { TradeSignalEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class TradeSignalPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(TradeSignalPublisher.name);
  private readonly config = loadRuntimeConfig();

  private queue: Queue | null = null;

  async publish(event: TradeSignalEvent): Promise<void> {
    const queue = this.getQueue();
    const eventTimestampMs = Date.parse(event.timestamp);
    const bucketMin = Math.floor(eventTimestampMs / 60000);
    const jobId = `${event.symbol}:${bucketMin}:${event.triggerType}`;

    await queue.add("trade-signal", event, {
      jobId,
      removeOnComplete: 200,
      removeOnFail: 500
    });

    this.logger.log(
      `tradeSignal queued symbol=${event.symbol} trigger=${event.triggerType} score=${event.triggerScore} jobId=${jobId}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue !== null) {
      await this.queue.close();
      this.queue = null;
    }
  }

  private getQueue(): Queue {
    if (this.queue === null) {
      this.queue = new Queue(this.config.TRADE_SIGNAL_QUEUE_NAME, {
        connection: {
          host: this.config.REDIS_HOST,
          port: this.config.REDIS_PORT,
          maxRetriesPerRequest: 2,
          enableReadyCheck: true
        }
      });
    }

    return this.queue;
  }
}
