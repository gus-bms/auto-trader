import Decimal from "decimal.js";
import { z } from "zod";

const decimalLikeValueSchema = z.union([
  z.string().regex(/^-?\d+(\.\d+)?$/, "Must be a decimal string"),
  z.number().finite()
]);

const decimalStringSchema = decimalLikeValueSchema.transform((value) => new Decimal(value).toFixed());

const defaultOrderBookSummary = {
  bidAskImbalanceRatio: "1",
  spreadBps: "0"
} as const;

export const marketSnapshotSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .transform((value) => value.trim().toUpperCase()),
  timestamp: z.string().datetime(),
  timeframe: z.enum(["1m", "5m"]).default("1m"),
  candle: z.object({
    open: decimalStringSchema,
    high: decimalStringSchema,
    low: decimalStringSchema,
    close: decimalStringSchema,
    volume: decimalStringSchema
  }),
  indicators: z.object({
    rsi: decimalStringSchema,
    volumeChangeRatePct: decimalStringSchema
  }),
  orderBookSummary: z
    .object({
      bidAskImbalanceRatio: decimalStringSchema,
      spreadBps: decimalStringSchema
    })
    .default(defaultOrderBookSummary)
});

export type ParsedMarketSnapshot = z.output<typeof marketSnapshotSchema>;

export function parseMarketSnapshot(payload: unknown): ParsedMarketSnapshot {
  return marketSnapshotSchema.parse(payload);
}
