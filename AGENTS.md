# AGENTS.md — KIS US Stock Auto-Trader (single-user)

## 1. Project Context & Philosophy

- **Objective:** Build a simplified, event-driven automated trading bot for US stocks using KIS (Korea Investment & Securities) API.
- **Target User:** Single developer (Me). No multi-tenant support needed.
- **Core Philosophy:** **"Safety First."**
- Capital preservation > Profitability.
- **Hard-coded Risk Rules > AI Judgement.**
- **Code-only Exits:** AI decides entry (BUY), but Code manages exits (StopLoss/Trailing/TimeCut).

## 2. Tech Stack (Strict)

- **Framework:** NestJS (Node.js) with TypeScript (Strict Mode).
- **Database:** MySQL (Persistence), Redis (Queue/Cache/Lock).
- **External:** KIS Open API (Overseas Stock), OpenAI/Claude API.
- **Math:** **`decimal.js`** (NEVER use native `number` for financial calculations).
- **Architecture:** Event-Driven Modular Monolith.

## 3. Architecture Blueprint

The system operates in a strictly unidirectional flow:

1. **MarketModule (Trigger):** Watches WebSocket. If indicators match (e.g., RSI < 30), emits `MarketEvent`.
2. **AnalysisModule (Brain):** Receives event -> Constructs Prompt -> Queries LLM -> Returns `Decision` (BUY/WAIT).
3. **TradeModule (Execution):**

- **RiskManager:** Validates `Decision` against daily limits & balance.
- **OrderExecutor:** Sends order to KIS API (Idempotency enforced).
- **ExitStrategy:** Monitors fills and triggers StopLoss/Trailing Stop via code.

4. **CoreModule:** Authentication, Logging, Slack/Telegram Alerts.

## 4. The "Non-Negotiables" (AI Must Follow)

### A. Safety & Risk

1. **Live Mode Guard:** Never place a real order unless `process.env.LIVE_MODE === 'true'`. Default to Paper/Log mode.
2. **AI Fail-Safe:** If LLM times out, fails, or returns invalid schema => **Action is always WAIT.**
3. **Exit Authority:** LLM has **ZERO** control over selling. Exits are strictly mathematical (StopLoss %, Trailing Stop %).
4. **Kill Switch:** Enforce `DailyLossLimit`. If hit, trigger `SYSTEM_SHUTDOWN` to halt all buying.

### B. Data & Integrity

1. **Math Precision:** prohibit floating point math (e.g., `0.1 + 0.2`). Use `Decimal.add()`.
2. **Idempotency:** Every order request must have a unique `idempotencyKey` to prevent duplicate orders on retries.
3. **Audit Trail:** Persist every step: `Decision` -> `RiskVerdict` -> `OrderRequest` -> `BrokerResponse` -> `Fills`.
4. **Data Staleness:** Do not trade if market data is older than 1 minute.

### C. Coding Conventions

1. **Naming:** `camelCase` for variables/functions, `PascalCase` for classes/interfaces.
2. **Error Handling:** Catch specific errors (e.g., `KisApiError`). Retry network errors (5xx), but fail fast on client errors (4xx).
3. **Comments:** Explain "Why" this logic protects money, not just "What" it does.

## 5. Module Responsibilities

### `MarketModule`

- **Goal:** Real-time monitoring with minimal latency.
- **Constraint:** Do not save every tick to MySQL. Use Redis for recent candles.

### `AnalysisModule`

- **Goal:** High-quality decision making.
- **Constraint:** Output must be strict JSON. Validate `symbol` and `price` realism before passing to Trader.

### `TradeModule`

- **Goal:** Flawless execution.
- **Constraint:**
- `RiskManager` must run **before** `OrderExecutor`.
- `OrderExecutor` must handle API throttling (rate limits).

## 6. How to Work (Workflow)

1. **Read First:** Always align implementation with `requirements.md` and this file.
2. **Safe Defaults:** Implement new features in `ShadowMode` (logging only) first.
3. **Test:** Add tests when changing Risk or Order logic.
4. **Secrets:** Never hardcode API keys. Use `.env`.
5. **Uncertainty:** If unsure about KIS API behavior (e.g., order cancellation rules), stop and add a comment/TODO to verify.
