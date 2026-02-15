import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

@Injectable()
export class MarketWatcherService implements OnModuleInit {
  private readonly logger = new Logger(MarketWatcherService.name);

  onModuleInit(): void {
    this.logger.log("Market watcher bootstrapped in safe mode (no broker calls)");
  }
}
