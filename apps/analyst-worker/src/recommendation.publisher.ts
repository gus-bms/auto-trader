import { loadRuntimeConfig } from "@app/config";
import type { RecommendationProducedEvent } from "@app/domain";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class RecommendationPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RecommendationPublisher.name);
  private readonly config = loadRuntimeConfig();

  private queue: Queue | null = null;

  async publish(event: RecommendationProducedEvent): Promise<void> {
    const queue = this.getQueue();
    const jobId = `${event.symbol}:${event.recommendationId}`;

    await queue.add("recommendation-produced", event, {
      jobId,
      removeOnComplete: 500,
      removeOnFail: 1000
    });

    this.logger.log(
      `recommendation queued symbol=${event.symbol} recommendationId=${event.recommendationId} decision=${event.decision} score=${event.scoreBreakdown.totalScore.toFixed(2)}`
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
      this.queue = new Queue(this.config.RECOMMENDATION_QUEUE_NAME, {
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
