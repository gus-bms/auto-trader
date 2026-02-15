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

## Market watcher baseline

- Incoming snapshots are blocked when older than `MAX_MARKET_DATA_AGE_SEC`
- Trigger rule is currently `RSI < 30 && volumeChangeRatePct >= 200`
- Symbol cooldown uses `TRIGGER_COOLDOWN_SEC` to suppress repeated signal spam
- Triggered events are published to BullMQ queue `TRADE_SIGNAL_QUEUE_NAME`

## Build

```bash
npm run build
```
