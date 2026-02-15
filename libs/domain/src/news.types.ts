export interface NewsSignalItem {
  newsId: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  url: string | null;
  sentimentScore: number;
  sentimentLabel: "positive" | "neutral" | "negative";
  relevanceScore: number;
}

export interface NewsDigest {
  symbol: string;
  asOf: string;
  newsCount: number;
  averageSentiment: number;
  confidence: number;
  topHeadlines: Array<{
    headline: string;
    source: string;
    publishedAt: string;
    sentimentScore: number;
  }>;
}
