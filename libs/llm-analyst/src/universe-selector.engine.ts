import Decimal from "decimal.js";

import type { RuntimeConfig } from "@app/config";
import type { TradeSignalEvent, UniverseEvaluationResult, UniverseRejectionReason } from "@app/domain";

interface FundamentalScoreRecord {
  symbol: string;
  score: number;
}

export class UniverseSelectorEngine {
  private readonly fundamentalScoreMap: Map<string, number>;

  constructor(private readonly config: RuntimeConfig) {
    this.fundamentalScoreMap = parseFundamentalScoreMap(this.config.ANALYST_FUNDAMENTAL_MOCK_ITEMS_JSON);
  }

  evaluateSignal(signalEvent: TradeSignalEvent, nowMs: number): UniverseEvaluationResult {
    const liquidityScore = scoreLiquidity(signalEvent, this.config);
    const fundamental = scoreFundamental(signalEvent.symbol, this.fundamentalScoreMap, this.config);
    const technicalScore = scoreTechnical(signalEvent);
    const universeScore = scoreUniverse(liquidityScore, fundamental.score, technicalScore, this.config);

    const rejectionReasons: UniverseRejectionReason[] = [];
    const allowList = parseAllowList(this.config.ANALYST_UNIVERSE_SYMBOL_ALLOWLIST);

    if (allowList.size > 0 && !allowList.has(signalEvent.symbol.toUpperCase())) {
      rejectionReasons.push("SYMBOL_NOT_IN_UNIVERSE");
    }

    const spreadBps = parseDecimal(signalEvent.orderBookSummary.spreadBps, new Decimal(Number.MAX_SAFE_INTEGER));
    if (spreadBps.gt(this.config.ANALYST_UNIVERSE_MAX_SPREAD_BPS)) {
      rejectionReasons.push("SPREAD_TOO_WIDE");
    }

    const dollarVolume = parseDecimal(signalEvent.candleSnapshot.close, 0).mul(parseDecimal(signalEvent.candleSnapshot.volume, 0));
    if (dollarVolume.lt(this.config.ANALYST_UNIVERSE_MIN_DOLLAR_VOLUME_USD)) {
      rejectionReasons.push("LOW_DOLLAR_VOLUME");
    }

    if (fundamental.missing) {
      rejectionReasons.push("FUNDAMENTAL_MISSING");
    } else if (fundamental.score < this.config.ANALYST_UNIVERSE_MIN_FUNDAMENTAL_SCORE) {
      rejectionReasons.push("FUNDAMENTAL_TOO_WEAK");
    }

    if (universeScore < this.config.ANALYST_UNIVERSE_MIN_SCORE) {
      rejectionReasons.push("UNIVERSE_SCORE_TOO_LOW");
    }

    return {
      runId: new Date(nowMs).toISOString().slice(0, 10),
      profile: this.config.ANALYST_UNIVERSE_PROFILE,
      accepted: rejectionReasons.length === 0,
      rejectionReasons,
      scoreBreakdown: {
        liquidityScore,
        fundamentalScore: fundamental.score,
        technicalScore,
        universeScore
      }
    };
  }
}

function scoreLiquidity(signalEvent: TradeSignalEvent, config: RuntimeConfig): number {
  const spreadBps = parseDecimal(signalEvent.orderBookSummary.spreadBps, Number.MAX_SAFE_INTEGER);
  const spreadScore = clampScore(new Decimal(100).minus(spreadBps.mul(3)));

  const dollarVolume = parseDecimal(signalEvent.candleSnapshot.close, 0).mul(parseDecimal(signalEvent.candleSnapshot.volume, 0));
  const baseMinDollarVolume = new Decimal(config.ANALYST_UNIVERSE_MIN_DOLLAR_VOLUME_USD);
  const volumeScore = baseMinDollarVolume.eq(0)
    ? 100
    : clampScore(dollarVolume.div(baseMinDollarVolume).mul(100));

  return clampScore(new Decimal(spreadScore).mul(0.4).plus(new Decimal(volumeScore).mul(0.6)));
}

function scoreFundamental(
  symbol: string,
  scoreMap: Map<string, number>,
  config: RuntimeConfig
): { score: number; missing: boolean } {
  const score = scoreMap.get(symbol.toUpperCase());
  if (score === undefined) {
    if (config.ANALYST_UNIVERSE_REQUIRE_FUNDAMENTAL_SCORE === "true") {
      return { score: 0, missing: true };
    }

    return { score: 50, missing: false };
  }

  return { score: clampScore(score), missing: false };
}

function scoreTechnical(signalEvent: TradeSignalEvent): number {
  const triggerScore = clampScore(signalEvent.triggerScore);
  const rsi = parseDecimal(signalEvent.indicators.rsi, 50);
  const volumeSpike = parseDecimal(signalEvent.indicators.volumeChangeRatePct, 0);

  const rsiScore = rsi.lte(30) ? new Decimal(70).plus(new Decimal(30).minus(rsi).mul(1.2)) : new Decimal(55);
  const volumeScore = volumeSpike.div(3);

  return clampScore(new Decimal(triggerScore).mul(0.5).plus(rsiScore.mul(0.25)).plus(volumeScore.mul(0.25)));
}

function scoreUniverse(liquidityScore: number, fundamentalScore: number, technicalScore: number, config: RuntimeConfig): number {
  const weightLiquidity = new Decimal(config.ANALYST_UNIVERSE_WEIGHT_LIQUIDITY);
  const weightFundamental = new Decimal(config.ANALYST_UNIVERSE_WEIGHT_FUNDAMENTAL);
  const weightTechnical = new Decimal(config.ANALYST_UNIVERSE_WEIGHT_TECHNICAL);
  const totalWeight = weightLiquidity.plus(weightFundamental).plus(weightTechnical);

  if (totalWeight.eq(0)) {
    return clampScore(new Decimal(liquidityScore).plus(fundamentalScore).plus(technicalScore).div(3));
  }

  return clampScore(
    new Decimal(liquidityScore)
      .mul(weightLiquidity)
      .plus(new Decimal(fundamentalScore).mul(weightFundamental))
      .plus(new Decimal(technicalScore).mul(weightTechnical))
      .div(totalWeight)
  );
}

function parseAllowList(rawSymbols: string): Set<string> {
  const symbols = rawSymbols
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);

  return new Set(symbols);
}

function parseFundamentalScoreMap(rawJson: string): Map<string, number> {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    const records: FundamentalScoreRecord[] = parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => {
        const symbol = typeof item.symbol === "string" ? item.symbol.trim().toUpperCase() : "";
        const score = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : Number.NaN;

        return { symbol, score };
      })
      .filter((item) => item.symbol.length > 0 && Number.isFinite(item.score));

    return new Map(records.map((item) => [item.symbol, clampScore(item.score)]));
  } catch {
    return new Map();
  }
}

function parseDecimal(value: Decimal.Value, fallback: Decimal.Value): Decimal {
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(fallback);
  }
}

function clampScore(value: Decimal.Value): number {
  const decimal = new Decimal(value);
  if (decimal.lt(0)) {
    return 0;
  }

  if (decimal.gt(100)) {
    return 100;
  }

  return Number(decimal.toDecimalPlaces(2).toString());
}
