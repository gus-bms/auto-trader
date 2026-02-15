import { loadRuntimeConfig } from "@app/config";
import type { OrderIntentEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class OrderIntentPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(OrderIntentPublisher.name);
  private readonly config = loadRuntimeConfig();

  private queue: Queue | null = null;

  async publish(event: OrderIntentEvent): Promise<void> {
    const queue = this.getQueue();
    const jobId = `${event.symbol}-${event.decisionId}`;

    await queue.add("order-intent", event, {
      jobId,
      removeOnComplete: 200,
      removeOnFail: 500
    });

    this.logger.log(
      `orderIntent queued symbol=${event.symbol} decisionId=${event.decisionId} confidence=${event.confidence}`
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
      this.queue = new Queue(this.config.ORDER_INTENT_QUEUE_NAME, {
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
