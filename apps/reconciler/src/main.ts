import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { ReconcilerModule } from "./reconciler.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ReconcilerModule);
  const port = Number(process.env.RECONCILER_PORT ?? "3003");
  await app.listen(port);

  Logger.log(`reconciler is listening on ${port}`, "Bootstrap");
}

void bootstrap();
