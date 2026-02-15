import Decimal from "decimal.js";

import type { ParsedMarketSnapshot } from "./market-snapshot.schema";

export interface TriggerVerdict {
  triggerType: "RSI_VOLUME_SPIKE";
  triggerScore: number;
}

export function evaluateRsiVolumeTrigger(snapshot: ParsedMarketSnapshot): TriggerVerdict | null {
  const rsi = new Decimal(snapshot.indicators.rsi);
  const volumeChangeRate = new Decimal(snapshot.indicators.volumeChangeRatePct);

  if (!rsi.lt(30) || !volumeChangeRate.gte(200)) {
    return null;
  }

  const score = Decimal.min(
    new Decimal(100),
    Decimal.max(
      new Decimal(70),
      new Decimal(70)
        .plus(new Decimal(30).minus(rsi).mul(2))
        .plus(volumeChangeRate.minus(200).div(5))
    )
  );

  return {
    triggerType: "RSI_VOLUME_SPIKE",
    triggerScore: Number(score.toDecimalPlaces(2).toString())
  };
}
