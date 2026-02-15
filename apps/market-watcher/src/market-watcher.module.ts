import { Module } from "@nestjs/common";

import { KisMarketStreamService } from "./kis-market-stream.service";
import { MarketWatcherService } from "./market-watcher.service";
import { TradeSignalPublisher } from "./trade-signal.publisher";

@Module({
  providers: [KisMarketStreamService, MarketWatcherService, TradeSignalPublisher]
})
export class MarketWatcherModule {}
