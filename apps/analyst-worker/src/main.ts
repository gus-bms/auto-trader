import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AnalystWorkerModule } from "./analyst-worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AnalystWorkerModule);

  app.enableShutdownHooks();
  Logger.log("analyst-worker bootstrapped", "Bootstrap");
}

void bootstrap();
