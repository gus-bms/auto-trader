import { Module } from "@nestjs/common";

import { RecommendationShortlistController } from "./recommendation-shortlist.controller";
import { ReconcilerService } from "./reconciler.service";

@Module({
  controllers: [RecommendationShortlistController],
  providers: [ReconcilerService]
})
export class ReconcilerModule {}
