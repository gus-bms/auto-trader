# requirements.md — KIS 미국주식 LLM 기반 자동매매 (1인 실전투자용) 최종본

> 본 문서는 **(A) 안전/정합성 중심 요구사항**과 **(B) 이벤트 기반 단타 실행 요구사항**을 통합한 최종본이다.  
> 전제: **1인 운영(본인 전용), 외부 배포/서비스 제공 없음**. 단, “돈이 새는 사고 방지”를 위해 필수 안전장치는 축소하지 않는다.

---

## 1. 목적 (Goals)

- 한국투자증권(KIS) Open API를 활용하여 **미국주식 자동매매** 시스템을 구축한다.
- 핵심 목표
  1. **자본 방어(Safety First)**: 하드코딩된 리스크 룰이 LLM 판단보다 우선한다.
  2. **수익 창출(Profitability)**: 기술적 지표(1차 트리거)로 기회를 포착하고, LLM이 2차 검증하여 **진입**한다. **청산은 코드 기반 기계적 로직**으로 수행한다.
  3. **1인 운영 최적화**: 불필요한 관리 기능을 배제하고, 모니터링/알림과 긴급 대응(Kill Switch)에 집중한다.

---

## 2. 범위 (Scope)

### 2.1 포함 (In Scope)

- 대상: 미국 주식 현물(ETF 포함), 고변동성 유니버스(예: SOXL, TQQQ 등) 중심
- 데이터: 실시간 시세(WebSocket), 1분봉/5분봉 캔들, 보조지표(RSI, MA, BB, MACD), (옵션) 뉴스 요약
- 진입(Entry): **Market** 또는 **Best Limit(최유리 지정가)**
- 청산(Exit): **Stop Loss / Take Profit / Trailing Stop / Time Cut** (전부 코드로 수행)
- 안전장치: killSwitch, dailyLossLimit, symbolBlacklist/whitelist, positionLimit, rateLimit, idempotency, dataStalenessGuard, reconcile
- 운영모드: paperMode / shadowMode / liveMode

### 2.2 제외 (Out of Scope)

- 초단타/HFT(틱 스캘핑), 초저지연 인프라 최적화
- 파생상품, 공매도
- 복잡한 권한관리(RBAC), 다중 사용자/테넌시
- 다중 증권사 지원(추후 brokerAdapter 확장 가능)

---

## 3. 운영 모드 (Mode Gating) — P0

> 1인용이라도 실거래 사고 방지를 위해 반드시 적용한다.

- `paperMode`: 브로커 주문 전송 금지, “주문했을 것”만 기록
- `shadowMode`: 실데이터 + 트리거 + LLM 판단 + 리스크 평가까지 수행, 브로커 주문 전송 금지
- `liveMode`: 실거래 활성(주문 전송 가능)

**수용 기준**

- liveMode가 아닐 때 어떤 조건에서도 주문이 브로커로 전송되지 않는다.
- 모드 변경은 명시적 설정 변경 + `systemEvents` 로깅 + 알림이 동반된다.

---

## 4. 아키텍처 개요 (Event-Driven)

### 4.1 컴포넌트

- **MarketWatcher (NestJS)**
  - WebSocket으로 실시간 시세/호가/체결 수신
  - 1분봉/5분봉 생성 + 지표 계산(실시간)
  - 트리거 조건 만족 시 `tradeSignalEvent` 발행
- **Analyst (LLM)**
  - 이벤트 시점의 지표/요약 피처(+옵션 뉴스) 기반으로 **진입 Pass/Fail** 판단
- **Trader (Code)**
  - 자금/리스크 룰 최종 점검 후 주문 실행
  - 체결 후 즉시 Exit 로직(Stop/Trailing/TimeCut) 가동
- **RiskManager (Hard Rules)**
  - LLM보다 우선하는 룰 기반 게이트키퍼
- **OrderManager**
  - idempotency, 상태머신, rateLimit, 재시도/백오프, 정정/취소(Chase) 지원
- **PortfolioService + Reconciler**
  - fills 기반 포지션/평단/손익 계산, 브로커 상태와 정합성 확인
- **Ops/Notify**
  - Slack/Telegram 알림, 로컬 로그, (선택) 간단 대시보드

### 4.2 기술 스택

- Backend: Node.js + NestJS + TypeScript
- DB: MySQL (거래 기록/자산 현황/감사로그)
- Queue/State: Redis + BullMQ (주문 큐, 재시도, 상태 관리)
- Infra: Docker(로컬/클라우드), pm2

---

## 5. 기능 요구사항 (Functional Requirements)

우선순위

- **P0**: 실거래 안전/정합성 필수 (없으면 liveMode 금지)
- **P1**: 운영 효율/고도화
- **P2**: 추가 개선

### FR-1. KIS 연동 및 세션 관리 (P0)

- FR-1.1 Access Token 자동 발급 및 만료 전 갱신
- FR-1.2 WebSocket 연결 유지 및 끊김 시 자동 재접속 + 구독 복원(re-subscribe)
- FR-1.3 API 호출 제한(Throttling) 준수 (예: 초당 20건 등 정책에 맞춰 Redis Rate Limiter 적용)
- FR-1.4 인증/세션 갱신 실패 시 즉시 `safeMode` 진입(거래 중단) + 알림
- FR-1.5 실서버/모의서버(가능 시) 환경 분리

**수용 기준**

- 토큰 만료/재접속 상황에서도 “중복 주문” 없이 정상 상태로 복구된다.
- 세션/데이터 불안정 상태에서는 주문이 차단된다.

---

### FR-2. 시장 감시 및 데이터 가공 (MarketWatcher) (P0)

- FR-2.1 유니버스(관심 종목 10~20개) 실시간 체결가/호가 수신
- FR-2.2 1분봉/5분봉 생성 및 지표 실시간 계산
  - 필수: MA, RSI, Bollinger Bands, 거래량 변화율
  - 선택: MACD, ATR, VWAP 등
- FR-2.3 `dataStalenessGuard`: 시세/캔들 갱신 지연 시 주문 경로 차단

**수용 기준**

- 지표 계산은 단일 소스(동일 캔들/동일 룰)로 재현 가능해야 한다.

---

### FR-3. 트리거(1차 필터) 엔진 (P0)

- FR-3.1 트리거 조건은 설정 가능해야 한다(종목별/전략별 프로파일)
- FR-3.2 예시 트리거(샘플)
  - RSI < 30 AND volumeChangeRate > 200%
  - BB 하단 이탈 후 재진입 + 거래량 급증
- FR-3.3 트리거는 LLM 호출을 “최소화”하기 위한 전제 조건이다(조건 미충족 시 LLM 호출 금지)
- FR-3.4 트리거 연속 발생 시 `cooldownSec` 적용(동일 종목 과다 호출 방지)

**수용 기준**

- 트리거 이벤트는 `tradeSignalEvents`(또는 systemLogs)로 기록되어 사후 분석이 가능하다.

---

### FR-4. LLM 의사결정 (Analyst) — 진입 2차 검증 (P0)

- FR-4.1 입력(JSON schema)
  - symbol, price, timestamp
  - computedIndicators (MA/RSI/BB/MACD/volume metrics 등)
  - orderBookSummary (bid/ask imbalance, spread bps 등)
  - (옵션) recentNewsHeadlinesSummary
- FR-4.2 출력(JSON schema, 강제)
  - `decision`: BUY | WAIT
  - `confidence`: 0~100
  - `riskLevel`: LOW | MEDIUM | HIGH
  - `rationale`: 1줄 근거
- FR-4.3 환각/비정상 출력 방지
  - 스키마 검증 실패 시 Discard + WAIT 처리
  - 존재하지 않는 종목/터무니없는 가격 언급 등 감지 시 Discard
- FR-4.4 LLM 실패/타임아웃 시 기본값: WAIT
- FR-4.5 LLM 호출 성능/비용 제약
  - 호출 빈도 제한(쿨다운/최대 호출수)
  - 프롬프트에 원시 데이터 대신 요약 피처 사용

**수용 기준**

- LLM 출력이 BUY여도 RiskManager 통과 전에는 주문이 발생하지 않는다.
- 모든 LLM 입력/출력은 `decisions`에 저장되어 재현 가능하다.

---

### FR-5. 주문 및 집행 (Trader/OrderManager) (P0)

- FR-5.1 주문 유형
  - Entry: Market 또는 BestLimit(최유리 지정가)
  - Exit: Market(우선) 또는 정책 기반(유동성/슬리피지 고려)
- FR-5.2 Smart Order Routing(단타 체결 우선)
  - 주문 후 `chaseWindowSec` 내 미체결 시:
    - (A) 정정(Chase) 최대 `maxReplaceCount` 회
    - (B) 또는 취소 후 시장가 전환
- FR-5.3 중복 주문 방지
  - Redis Lock 또는 DB 기반 idempotencyKey(권장: `symbol + entryTimestampBucket + strategyId`)
- FR-5.4 주문 상태머신(필수)
  - Submitted → PartiallyFilled → Filled / Rejected / Cancelled / Expired
- FR-5.5 RateLimit/Retry
  - 429/5xx 재시도 + 지수 백오프(최대 재시도 초과 시 거래중단)
- FR-5.6 preFlightChecks (주문 전 필수)
  - mode(liveMode 여부), killSwitch, dataStaleness, cash/position, riskVerdict, blacklist/whitelist

**수용 기준**

- 동일 의도로 인한 중복 주문이 발생하지 않는다.
- 취소/정정은 “요청”이 아니라 “확정”까지 조회로 검증한다.

---

### FR-6. 리스크 관리 (RiskManager — Hard Rules) (P0)

> LLM 판단보다 무조건 우선한다.

- FR-6.1 자금 관리
  - 1회 진입 시 예수금의 `entryAllocationPct` 고정(예: 10%)
  - 물타기 금지 또는 `maxAddCount` 제한
- FR-6.2 일일 손실 제한(Daily Loss Limit)
  - 실현손익 + 미실현손익 합계가 `dailyLossLimitUsd` 이하 도달 시:
    - 자동 killSwitch 발동
    - 모든 포지션 시장가 청산 시도 + 봇 거래 중지
- FR-6.3 포지션/노출 제한
  - 종목당 최대 비중 `maxSymbolExposurePct`
  - 단일 주문 최대 금액 `maxOrderNotionalUsd`
- FR-6.4 블랙리스트/화이트리스트
  - 유니버스 외 매수 금지(whitelist 기본)
  - 거래량 부족/과도 변동성 종목 금지(정량 기준 포함)
- FR-6.5 주문 속도 제한(버그/루프 방지)
  - 분당 주문 상한 `maxOrdersPerMinute`
  - 일당 주문 상한 `maxOrdersPerDay`
- FR-6.6 circuitBreaker
  - 연속 실패/연속 손실/리컨실 불일치/데이터 이상 시 거래 중단
- FR-6.7 riskVerdict 구조화
  - 차단 사유 코드: `RISK_LIMIT_EXCEEDED`, `DATA_STALE`, `MODE_NOT_LIVE`, `KILL_SWITCH_ON` 등

**수용 기준**

- 차단된 모든 케이스는 코드/사유/입력이 감사로그에 남는다.
- killSwitch 활성화 시 어떤 주문도 전송되지 않는다.

---

### FR-7. 포지션 관리 및 청산 (Exit Strategy — Code Only) (P0)

> 청산은 LLM이 아닌 코드로 수행한다(속도/감정 배제).

- FR-7.1 Stop Loss
  - 평단 대비 `stopLossPct` 하락 시 즉시 시장가 매도
- FR-7.2 Take Profit + Trailing Stop
  - `takeProfitPct` 도달 시 트레일링 활성화
  - 고점 대비 `trailingStopPct` 하락 시 즉시 이익 실현
- FR-7.3 Time Cut(기회비용)
  - 진입 후 `timeCutMin` 동안 기대 변동 없으면 본절/약손절 청산
- FR-7.4 부분체결/다중 체결 대응
  - fills 누적 기반으로 잔량/평단/손익 갱신
- FR-7.5 (선택, P1) 변동성 기반 동적 스탑(ATR 등)

**수용 기준**

- 체결 후 Exit 감시는 즉시 시작된다.
- 부분체결에서도 스탑/트레일링 로직이 잔량 기준으로 정확히 동작한다.

---

### FR-8. 리컨실(Reconcile) 및 복구(Recovery) (P0)

- FR-8.1 정기 리컨실
  - 브로커 잔고/미체결/체결 vs 내부 orders/fills/positions 정합성 확인
- FR-8.2 불일치 감지 시
  - 즉시 거래중단 + 알림 + 수동 조치 요구
- FR-8.3 재시작 복구
  - 비정상 종료 후 재시작 시 DB/API 조회로 포지션/미체결을 복구하고 감시 재개

**수용 기준**

- 내부 상태와 브로커 상태 불일치가 감지되면 liveMode 유지가 불가하다.

---

### FR-9. 운영/알림/로그 (P0)

- FR-9.1 Slack/Telegram 알림
  - 매수/매도 체결 내역(수익률 포함)
  - killSwitch 발동(최우선)
  - 인증/세션/리컨실/주문 실패 등 주요 에러
- FR-9.2 로컬 로그 파일 저장(디버깅)
  - 구조화 로그(JSON) 권장
- FR-9.3 (P1) 간단 상태 페이지/CLI(현재 모드, 포지션, 금일 손익, 에러 상태)

---

## 6. 비기능 요구사항 (NFR)

### NFR-1 레이턴시 (Latency)

- 목표: 트리거 발생 시점부터 주문 전송까지 **내부 처리 < 2초** (LLM 응답 포함)
- 제약: 외부 네트워크/브로커 처리시간은 별도이며, 내부는 아래를 지향
  - 지표/트리거 계산: < 200ms
  - LLM 응답: 목표 < 1500ms (초과 시 WAIT 처리 가능)
  - 주문 빌드/리스크 체크: < 200ms

### NFR-2 비용 효율

- LLM 호출은 트리거 조건 만족 시에만 수행한다.
- 쿨다운/최대 호출수로 토큰 소모를 상한 관리한다.

### NFR-3 안정성/관측성

- 비정상 종료/재시작 후 포지션/미체결 복구 가능해야 한다.
- 모든 주요 이벤트는 correlationId(decisionId/orderId)로 트레이싱 가능해야 한다.

---

## 7. 데이터베이스 모델 (간소화 + 필수 안전 필드 포함)

> “사후 원인 분석/정합성/중복 방지”가 가능하도록 최소 엔티티를 유지한다.

- `tradeHistory`
  - orderId, symbol, side, entryPrice, exitPrice, qty, pnl, strategyId, timestamps
- `orders`
  - orderId, brokerOrderId, symbol, side, type, qty, limitPrice, status, idempotencyKey, submittedAt
- `fills`
  - fillId, orderId, brokerFillId, fillPrice, fillQty, fillAt
- `positions`
  - symbol, qty, avgPrice, unrealizedPnl, updatedAt
- `assetStatus`
  - tradeDate, startingCash, endingCash, dayReturnPct, realizedPnl, unrealizedPnl
- `decisions`
  - decisionId, triggerSnapshot, llmInput, llmOutput, confidence, riskLevel, rationale, createdAt
- `riskEvaluations`
  - decisionId, verdict(PASS/BLOCK), blockCode, detailsJson, createdAt
- `systemEvents`
  - type(killSwitchOn/off, circuitBreaker, reconnect, reconcileMismatch, modeChange, error), payloadJson, createdAt
- `systemLogs`
  - level, message, contextJson, createdAt

---

## 8. 개발 단계 (Phasing)

### Phase 1 — Data & Connection

- KIS 인증/토큰 갱신
- WebSocket 시세/호가 수신
- 캔들/지표 계산 파이프라인
- DB/Redis 연동, 구조화 로그/알림 기본

### Phase 2 — Risk & Order (가장 중요)

- Market/BestLimit 주문 + 상태머신
- idempotency + rateLimit + 재시도/백오프
- killSwitch + dailyLossLimit + orderFrequencyLimit
- StopLoss/TakeProfit/Trailing/TimeCut
- paperMode/shadowMode로 반복 검증

### Phase 3 — Brain (Trigger + LLM)

- 트리거 조건 엔진(종목/전략별 설정)
- LLM 입력/출력 스키마 강제 + 환각/비정상 방어
- 성능/비용 튜닝(쿨다운, 호출 상한)

### Phase 4 — Live (소액 실전)

- liveMode 소액(예: 1주/소액 notional)부터 시작
- 리컨실/복구 시나리오 통과 후 점진 증액

---

## 9. 기본 설정값(초기 추천 프리셋; 전부 설정으로 관리)

- `universeSize`: 10~20
- `cooldownSec`: 300~900
- `entryAllocationPct`: 0.10
- `dailyLossLimitUsd`: 소액(초기 매우 작게)
- `maxOrderNotionalUsd`: 소액(초기 매우 작게)
- `maxOrdersPerMinute`: 3~10
- `maxOrdersPerDay`: 20~60 (전략에 따라)
- `stopLossPct`: 0.5%~2.0%
- `takeProfitPct`: 0.5%~3.0%
- `trailingStopPct`: 0.3%~1.5%
- `timeCutMin`: 5~30
- `chaseWindowSec`: 2~10
- `maxReplaceCount`: 1~3

---

## 10. Go-Live 체크(필수 통과 조건)

- [ ] liveMode 외에는 주문이 전송되지 않음이 테스트로 검증됨
- [ ] idempotencyKey로 중복 주문이 방지됨
- [ ] 부분체결/취소/정정 상태가 정확히 반영됨
- [ ] dataStalenessGuard가 지연 시 거래를 차단함
- [ ] dailyLossLimit 발동 시 즉시 포지션 정리 + 거래 중단됨
- [ ] 리컨실 불일치 시 거래가 중단되고 알림이 발생함
- [ ] 재시작 시 포지션/미체결이 복구됨
