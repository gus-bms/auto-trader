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

## Build

```bash
npm run build
```
