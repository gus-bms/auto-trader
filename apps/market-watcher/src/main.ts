import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { MarketWatcherModule } from "./market-watcher.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(MarketWatcherModule);
  const port = Number(process.env.MARKET_WATCHER_PORT ?? "3001");
  await app.listen(port);

  Logger.log(`market-watcher is listening on ${port}`, "Bootstrap");
}

void bootstrap();
