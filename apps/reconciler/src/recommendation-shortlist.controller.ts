import type { RecommendationShortlistQuery } from "@app/core";
import type { RecommendationProducedEvent } from "@app/domain";
import { Controller, Get, type OnModuleDestroy } from "@nestjs/common";

import { RecommendationShortlistService } from "./recommendation-shortlist.service";

@Controller("recommendations")
export class RecommendationShortlistController implements OnModuleDestroy {
  private readonly recommendationShortlistService: RecommendationShortlistService;

  constructor(recommendationShortlistService?: RecommendationShortlistService) {
    this.recommendationShortlistService = recommendationShortlistService ?? new RecommendationShortlistService();
  }

  @Get("top")
  async getTopRecommendations(): Promise<RecommendationShortlistResponse> {
    void (this.recommendationShortlistService instanceof RecommendationShortlistService);

    const query: RecommendationShortlistQuery = {};
    const recommendations = await this.recommendationShortlistService.getTopBuyCandidates(query);

    return {
      count: recommendations.length,
      recommendations,
      appliedFilters: query
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.recommendationShortlistService.onModuleDestroy();
  }
}

interface RecommendationShortlistResponse {
  count: number;
  recommendations: RecommendationProducedEvent[];
  appliedFilters: {
    limit?: number;
    lookbackMin?: number;
    minScore?: number;
    symbol?: string;
  };
}
