import { z } from "zod";

export const kisApprovalResponseSchema = z.object({
  approval_key: z.string().min(1)
});

export type KisApprovalResponse = z.infer<typeof kisApprovalResponseSchema>;
