import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { TraderModule } from "./trader.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(TraderModule);
  const port = Number(process.env.TRADER_PORT ?? "3002");
  await app.listen(port);

  Logger.log(`trader is listening on ${port}`, "Bootstrap");
}

void bootstrap();
