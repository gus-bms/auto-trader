import { Module } from "@nestjs/common";

import { AnalystWorkerService } from "./analyst-worker.service";
import { NewsIngestService } from "./news-ingest.service";
import { OrderIntentPublisher } from "./order-intent.publisher";
import { RecommendationPublisher } from "./recommendation.publisher";

@Module({
  providers: [AnalystWorkerService, NewsIngestService, OrderIntentPublisher, RecommendationPublisher]
})
export class AnalystWorkerModule {}
