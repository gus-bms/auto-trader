import { tradingModeValues } from "@app/domain";
import { z } from "zod";

const decimalLikeString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a non-negative decimal string");

const signedDecimalLikeString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Must be a signed decimal string");

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
  KIS_APPROVAL_URL: z.string().url().default("https://openapi.koreainvestment.com:9443/oauth2/Approval"),
  KIS_APP_KEY: z.string().default(""),
  KIS_APP_SECRET: z.string().default(""),
  KIS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  KIS_AUTH_MAX_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(2),
  KIS_AUTH_RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(300),
  KIS_AUTH_EXPIRY_SKEW_SEC: z.coerce.number().int().nonnegative().default(30),
  KIS_WS_ENABLED: z.enum(["true", "false"]).default("false"),
  KIS_WS_URL: z.string().url().default("wss://openapi.koreainvestment.com:9443/ws"),
  KIS_WS_APPROVAL_KEY: z.string().default(""),
  KIS_WS_CUSTOMER_TYPE: z.enum(["P", "B"]).default("P"),
  KIS_WS_TR_ID: z.string().min(1).default("HDFSCNT0"),
  KIS_WS_RECONNECT_BASE_MS: z.coerce.number().int().positive().default(1000),
  KIS_WS_RECONNECT_MAX_MS: z.coerce.number().int().positive().default(10000),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  TRADE_SIGNAL_QUEUE_NAME: z.string().min(1).default("tradeSignalQueue"),
  RECOMMENDATION_QUEUE_NAME: z.string().min(1).default("recommendationQueue"),
  RECOMMENDATION_STORE_KEY: z.string().min(1).default("recommendationHistory"),
  RECOMMENDATION_STORE_MAX_ITEMS: z.coerce.number().int().positive().default(2000),
  RECOMMENDATION_SHORTLIST_SCAN_SIZE: z.coerce.number().int().positive().default(300),
  RECOMMENDATION_SHORTLIST_DEFAULT_LIMIT: z.coerce.number().int().positive().default(10),
  RECOMMENDATION_SHORTLIST_DEFAULT_LOOKBACK_MIN: z.coerce.number().int().positive().default(360),
  RECOMMENDATION_SHORTLIST_DEFAULT_MIN_SCORE: z.coerce.number().min(0).max(100).default(65),
  RECOMMENDATION_SHORTLIST_DEFAULT_UNIQUE_SYMBOL: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  ORDER_INTENT_QUEUE_NAME: z.string().min(1).default("orderIntentQueue"),
  MARKET_UNIVERSE: z.string().min(1).default("SOXL,TQQQ"),
  TRIGGER_COOLDOWN_SEC: z.coerce.number().int().nonnegative().default(300),
  STALENESS_CHECK_INTERVAL_SEC: z.coerce.number().int().positive().default(15),
  ANALYST_LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
  ANALYST_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  ANALYST_LLM_ENDPOINT: z.string().url().default("https://api.openai.com/v1/chat/completions"),
  ANALYST_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ANALYST_EMIT_ORDER_INTENT: z.enum(["true", "false"]).default("false"),
  ANALYST_SCREENING_IGNORE_MODE_GUARD: z.enum(["true", "false"]).default("true"),
  ANALYST_UNIVERSE_PROFILE: z.enum(["day", "swing"]).default("day"),
  ANALYST_UNIVERSE_SYMBOL_ALLOWLIST: z.string().default(""),
  ANALYST_UNIVERSE_MIN_DOLLAR_VOLUME_USD: z.coerce.number().nonnegative().default(500000),
  ANALYST_UNIVERSE_MAX_SPREAD_BPS: z.coerce.number().positive().default(30),
  ANALYST_UNIVERSE_REQUIRE_FUNDAMENTAL_SCORE: z.enum(["true", "false"]).default("false"),
  ANALYST_UNIVERSE_MIN_FUNDAMENTAL_SCORE: z.coerce.number().min(0).max(100).default(35),
  ANALYST_UNIVERSE_MIN_SCORE: z.coerce.number().min(0).max(100).default(55),
  ANALYST_UNIVERSE_WEIGHT_LIQUIDITY: z.coerce.number().nonnegative().default(0.4),
  ANALYST_UNIVERSE_WEIGHT_FUNDAMENTAL: z.coerce.number().nonnegative().default(0.25),
  ANALYST_UNIVERSE_WEIGHT_TECHNICAL: z.coerce.number().nonnegative().default(0.35),
  ANALYST_FUNDAMENTAL_MOCK_ITEMS_JSON: z.string().default("[]"),
  ANALYST_SCORE_BUY_THRESHOLD: z.coerce.number().min(0).max(100).default(65),
  ANALYST_NEWS_LOOKBACK_MIN: z.coerce.number().int().positive().default(180),
  ANALYST_NEWS_MAX_ITEMS: z.coerce.number().int().positive().default(20),
  ANALYST_NEWS_MOCK_ITEMS_JSON: z.string().default("[]"),
  ANALYST_AVAILABLE_CASH_USD: decimalLikeString.default("100000"),
  ANALYST_ORDER_NOTIONAL_USD: decimalLikeString.default("100"),
  ANALYST_DAILY_PNL_USD: signedDecimalLikeString.default("0"),
  TRADER_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  TRADER_AVAILABLE_CASH_USD: decimalLikeString.default("100000"),
  TRADER_DAILY_PNL_USD: signedDecimalLikeString.default("0"),
  TRADER_LIVE_ORDER_ENABLED: z.enum(["true", "false"]).default("false"),
  SLACK_WEBHOOK_URL: z.string().default(""),
  SLACK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SLACK_SHORTLIST_NOTIFY_ENABLED: z.enum(["true", "false"]).default("false"),
  SLACK_SHORTLIST_NOTIFY_INTERVAL_SEC: z.coerce.number().int().positive().default(300),
  SLACK_SHORTLIST_NOTIFY_LIMIT: z.coerce.number().int().positive().default(5),
  SLACK_SHORTLIST_NOTIFY_MIN_SCORE: z.coerce.number().min(0).max(100).default(70),
  SLACK_SHORTLIST_NOTIFY_LOOKBACK_MIN: z.coerce.number().int().positive().default(180),
  SLACK_SHORTLIST_NOTIFY_SYMBOL: z.string().default(""),
  SLACK_SHORTLIST_SIGNATURE_KEY: z.string().min(1).default("slackShortlistLastSignature"),
  SLACK_SHORTLIST_SIGNATURE_TTL_SEC: z.coerce.number().int().positive().default(21600),
  OPENAI_API_KEY: z.string().default("")
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return envSchema.parse(env);
}

export function isLiveTradingAllowed(config: RuntimeConfig): boolean {
  return config.APP_MODE === "live" && config.LIVE_MODE === "true";
}
