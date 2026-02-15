# auto-trader

Safety-first KIS US stock auto-trader scaffold (NestJS + TypeScript strict).

## Current bootstrapped scope

- Multi-process app entrypoints:
  - `apps/market-watcher`
  - `apps/trader`
  - `apps/reconciler`
- Shared libraries:
  - `libs/domain`
  - `libs/config`
  - `libs/risk`
  - `libs/observability`
- Local infra:
  - MySQL 8.4
  - Redis 7.4

## Quick start

```bash
cp .env.example .env
npm install
npm run infra:up
npm run dev:watcher
```

Run other processes in separate terminals:

```bash
npm run dev:analyst
npm run dev:trader
npm run dev:reconciler
```

## Safety defaults

- `APP_MODE=paper`
- `LIVE_MODE=false`
- Entry risk gate blocks non-live orders by default
- KIS auth bootstrap runs only when live mode guard passes

## KIS auth baseline

- Access token client includes timeout + exponential retry (429/5xx/network only)
- Invalid schema or 4xx responses fail fast and trigger safe-mode hook
- Token caching uses expiry skew to reduce near-expiration order risk

## KIS websocket baseline

- Session manager supports exponential reconnect and automatic re-subscribe
- Stream startup is gated by `KIS_WS_ENABLED=true` and approval key availability
- If `KIS_WS_APPROVAL_KEY` is empty, approval key is auto-fetched via `KIS_APPROVAL_URL`
- Raw frame parser converts `H0STCNT0` / `HDFSCNT0` payloads into internal market snapshots

## Market watcher baseline

- Incoming snapshots are blocked when older than `MAX_MARKET_DATA_AGE_SEC`
- Trigger rule is currently `RSI < 30 && volumeChangeRatePct >= 200`
- Symbol cooldown uses `TRIGGER_COOLDOWN_SEC` to suppress repeated signal spam
- Triggered events are published to BullMQ queue `TRADE_SIGNAL_QUEUE_NAME`

## Analyst worker baseline

- Consumes `tradeSignalQueue` and validates strict LLM output schema (`BUY` or `WAIT`)
- LLM timeout/failure/schema mismatch always falls back to `WAIT`
- Builds news digest from `ANALYST_NEWS_MOCK_ITEMS_JSON` and applies sentiment-weighted recommendation scoring
- Emits `recommendationQueue` for recommendation-first workflow
- Emits `orderIntentQueue` only when `ANALYST_EMIT_ORDER_INTENT=true`, decision is `BUY`, and hard risk verdict is `PASS`

## Trader worker baseline

- Consumes `orderIntentQueue` and runs hard preflight risk gate before any execution path
- Generates deterministic `idempotencyKey` from symbol, decisionId, and minute bucket
- Defaults to dry-run and never sends live orders unless `TRADER_LIVE_ORDER_ENABLED=true`

## Build

```bash
npm run build
```
