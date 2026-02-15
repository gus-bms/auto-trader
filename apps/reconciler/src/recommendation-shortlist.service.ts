import { loadRuntimeConfig } from "@app/config";
import type { RecommendationShortlistQuery } from "@app/core";
import { RecommendationStore } from "@app/core";
import type { RecommendationProducedEvent } from "@app/domain";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class RecommendationShortlistService implements OnModuleDestroy {
  private readonly config = loadRuntimeConfig();

  private readonly store = new RecommendationStore({
    redisHost: this.config.REDIS_HOST,
    redisPort: this.config.REDIS_PORT,
    storeKey: this.config.RECOMMENDATION_STORE_KEY,
    maxItems: this.config.RECOMMENDATION_STORE_MAX_ITEMS,
    shortlistScanSize: this.config.RECOMMENDATION_SHORTLIST_SCAN_SIZE,
    defaultLimit: this.config.RECOMMENDATION_SHORTLIST_DEFAULT_LIMIT,
    defaultLookbackMin: this.config.RECOMMENDATION_SHORTLIST_DEFAULT_LOOKBACK_MIN,
    defaultMinScore: this.config.RECOMMENDATION_SHORTLIST_DEFAULT_MIN_SCORE
  });

  async getTopBuyCandidates(query: RecommendationShortlistQuery = {}): Promise<RecommendationProducedEvent[]> {
    return this.store.listTopBuyCandidates(query);
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }
}
