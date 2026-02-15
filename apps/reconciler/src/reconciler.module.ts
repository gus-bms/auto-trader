import { Module } from "@nestjs/common";

import { RecommendationShortlistService } from "./recommendation-shortlist.service";
import { ReconcilerService } from "./reconciler.service";

@Module({
  providers: [ReconcilerService, RecommendationShortlistService]
})
export class ReconcilerModule {}
