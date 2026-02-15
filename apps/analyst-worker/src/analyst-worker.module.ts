import { Module } from "@nestjs/common";

import { AnalystWorkerService } from "./analyst-worker.service";
import { NewsIngestService } from "./news-ingest.service";
import { OrderIntentPublisher } from "./order-intent.publisher";
import { RecommendationPublisher } from "./recommendation.publisher";
import { RecommendationStoreService } from "./recommendation-store.service";

@Module({
  providers: [
    AnalystWorkerService,
    NewsIngestService,
    OrderIntentPublisher,
    RecommendationPublisher,
    RecommendationStoreService
  ]
})
export class AnalystWorkerModule {}
