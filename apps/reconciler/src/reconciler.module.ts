import { Module } from "@nestjs/common";

import { RecommendationShortlistService } from "./recommendation-shortlist.service";
import { ReconcilerService } from "./reconciler.service";
import { SlackShortlistNotifierService } from "./slack-shortlist-notifier.service";

@Module({
  providers: [ReconcilerService, RecommendationShortlistService, SlackShortlistNotifierService]
})
export class ReconcilerModule {}
