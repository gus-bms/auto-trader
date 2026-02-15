import { Module } from "@nestjs/common";

import { MarketWatcherService } from "./market-watcher.service";
import { TradeSignalPublisher } from "./trade-signal.publisher";

@Module({
  providers: [MarketWatcherService, TradeSignalPublisher]
})
export class MarketWatcherModule {}
