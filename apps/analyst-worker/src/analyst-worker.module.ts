import { Module } from "@nestjs/common";

import { AnalystWorkerService } from "./analyst-worker.service";
import { OrderIntentPublisher } from "./order-intent.publisher";

@Module({
  providers: [AnalystWorkerService, OrderIntentPublisher]
})
export class AnalystWorkerModule {}
