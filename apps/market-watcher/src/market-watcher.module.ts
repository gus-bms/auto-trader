import { Module } from "@nestjs/common";

import { MarketWatcherService } from "./market-watcher.service";

@Module({
  providers: [MarketWatcherService]
})
export class MarketWatcherModule {}
