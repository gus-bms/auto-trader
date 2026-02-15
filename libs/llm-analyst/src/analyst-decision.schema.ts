import { z } from "zod";

import { decisionValues, riskLevelValues } from "@app/domain";

export const analystDecisionOutputSchema = z.object({
  decision: z.enum(decisionValues),
  confidence: z.coerce.number().min(0).max(100),
  riskLevel: z.enum(riskLevelValues),
  rationale: z.string().min(1).max(300)
});

export type AnalystDecisionOutputSchema = z.infer<typeof analystDecisionOutputSchema>;
