import { Module } from "@nestjs/common";

import { ReconcilerService } from "./reconciler.service";

@Module({
  providers: [ReconcilerService]
})
export class ReconcilerModule {}
