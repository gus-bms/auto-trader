export const universeRejectionReasonValues = [
  "SYMBOL_NOT_IN_UNIVERSE",
  "SPREAD_TOO_WIDE",
  "LOW_DOLLAR_VOLUME",
  "FUNDAMENTAL_MISSING",
  "FUNDAMENTAL_TOO_WEAK",
  "UNIVERSE_SCORE_TOO_LOW"
] as const;

export type UniverseRejectionReason = (typeof universeRejectionReasonValues)[number];

export interface UniverseScoreBreakdown {
  liquidityScore: number;
  fundamentalScore: number;
  technicalScore: number;
  universeScore: number;
}

export interface UniverseEvaluationResult {
  runId: string;
  profile: "day" | "swing";
  accepted: boolean;
  rejectionReasons: UniverseRejectionReason[];
  scoreBreakdown: UniverseScoreBreakdown;
}
