import { Module } from "@nestjs/common";

import { OrderExecutorService } from "./order-executor.service";
import { OrderIntentWorkerService } from "./order-intent-worker.service";
import { TraderService } from "./trader.service";

@Module({
  providers: [OrderExecutorService, OrderIntentWorkerService, TraderService]
})
export class TraderModule {}
