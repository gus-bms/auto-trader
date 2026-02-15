import { z } from "zod";

const decimalLikeString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a non-negative decimal string");

export const orderIntentEventSchema = z.object({
  decisionId: z.string().uuid(),
  correlationId: z.string().min(1),
  symbol: z.string().min(1).transform((value) => value.trim().toUpperCase()),
  side: z.literal("BUY"),
  orderType: z.enum(["Market", "BestLimit"]),
  requestedNotionalUsd: decimalLikeString,
  confidence: z.coerce.number().min(0).max(100),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationale: z.string().min(1).max(300),
  createdAt: z.string().datetime()
});

export type ParsedOrderIntentEvent = z.infer<typeof orderIntentEventSchema>;

export function parseOrderIntentEvent(payload: unknown): ParsedOrderIntentEvent {
  return orderIntentEventSchema.parse(payload);
}
