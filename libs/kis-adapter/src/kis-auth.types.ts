import { z } from "zod";

export const kisTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.coerce.number().int().positive()
});

export type KisTokenResponse = z.infer<typeof kisTokenResponseSchema>;

export interface CachedKisToken {
  accessToken: string;
  tokenType: string;
  expiresAtMs: number;
}

export interface AuthFailureContext {
  reason: "AUTH_FAILURE";
  attempts: number;
  statusCode: number | null;
  message: string;
}
