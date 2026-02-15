import { tradingModeValues } from "@app/domain";
import { z } from "zod";

const decimalLikeString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a non-negative decimal string");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(tradingModeValues).default("paper"),
  LIVE_MODE: z.enum(["true", "false"]).default("false"),
  MARKET_WATCHER_PORT: z.coerce.number().int().positive().default(3001),
  TRADER_PORT: z.coerce.number().int().positive().default(3002),
  RECONCILER_PORT: z.coerce.number().int().positive().default(3003),
  MAX_MARKET_DATA_AGE_SEC: z.coerce.number().int().positive().default(60),
  DAILY_LOSS_LIMIT_USD: decimalLikeString.default("100"),
  MAX_ORDER_NOTIONAL_USD: decimalLikeString.default("100"),
  KILL_SWITCH_ON: z.enum(["true", "false"]).default("false"),
  KIS_TOKEN_URL: z.string().url().default("https://openapi.koreainvestment.com:9443/oauth2/tokenP"),
  KIS_APP_KEY: z.string().default(""),
  KIS_APP_SECRET: z.string().default(""),
  KIS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  KIS_AUTH_MAX_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(2),
  KIS_AUTH_RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(300),
  KIS_AUTH_EXPIRY_SKEW_SEC: z.coerce.number().int().nonnegative().default(30)
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return envSchema.parse(env);
}

export function isLiveTradingAllowed(config: RuntimeConfig): boolean {
  return config.APP_MODE === "live" && config.LIVE_MODE === "true";
}
