# techSpec.md — KIS 미국주식 LLM 기반 자동매매 기술 스펙 (1인용, 로컬 우선)

## 1) 목표
- KIS Open API 기반 미국주식 자동매매(실거래 가능)
- Event-driven: 트리거(기술지표) → LLM 진입 검증(BUY/WAIT) → 주문/청산(코드)
- Safety First: 리스크 룰이 LLM보다 항상 우선
- 로컬 개발/검증(Phase 1~3) 후 운영 레벨에서 Docker로 이행(Phase 4)

---

## 2) 기술 스택

### 2.1 Runtime
- Node.js: 20+ (LTS)
- TypeScript: strict 모드
- Package manager: pnpm(권장) 또는 npm (레포 하나로 통일)

### 2.2 Backend Framework
- NestJS
  - MarketWatcher, Trader, Reconciler를 “프로세스/모듈”로 분리 운영 가능

### 2.3 Storage / Queue
- MySQL 8.x (거래 기록/주문/체결/결정/리스크/이벤트 저장)
- Redis 7.x + BullMQ (이벤트 큐, 주문 큐, 재시도/백오프, 상태 관리)

### 2.4 Observability / Ops
- Logging: pino(JSON structured log)
- Metrics: prom-client (필요 시)
- Alert: Slack/Telegram(웹훅/봇 토큰)
- Process manager(로컬/서버): pm2

### 2.5 LLM 연동
- LLM Provider: OpenAI API(또는 대체 가능)
- 출력 강제: JSON Schema + 런타임 검증(zod)

---

## 3) 아키텍처 (Event-driven)

### 3.1 프로세스 구성(권장)
- marketWatcher (NestJS)
  - KIS WebSocket: 시세/호가/체결 수신
  - 1분봉/5분봉 생성
  - 지표 계산
  - 트리거 조건 만족 시 tradeSignalEvent 발행(BullMQ)

- analystWorker (Node/NestJS worker)
  - tradeSignalEvent 수신
  - LLM 호출(BUY/WAIT)
  - decisions + riskEvaluations 저장
  - BUY + risk PASS이면 orderIntentEvent 발행

- trader (NestJS)
  - orderIntentEvent 수신
  - preFlightChecks → 주문 실행(KIS REST)
  - 주문 상태머신 업데이트
  - 체결 감지 시 exitWatcher 시작

- exitWatcher (worker 또는 trader 내 모듈)
  - StopLoss/TakeProfit/Trailing/TimeCut를 코드로 수행
  - 필요 시 정정/취소/시장가 전환(Chase)
  - fills 기반 포지션 갱신

- reconciler (cron/worker)
  - 주기적으로 브로커 잔고/미체결/체결과 내부 상태 비교
  - 불일치 시 거래중단 + 알림 + 이벤트 기록

참고:
- 초기 MVP에서는 analystWorker+trader를 하나의 프로세스로 시작해도 되지만,
  실전/운영으로 갈수록 프로세스 분리가 안정적이다.

### 3.2 이벤트/큐 토폴로지(BullMQ)
- tradeSignalQueue
  - payload: symbol, timeframe, candleSnapshot, indicators, orderBookSummary, triggerType, triggerScore, correlationId
- orderIntentQueue
  - payload: decisionId, symbol, side=BUY, orderType(Market|BestLimit), notional/qty, correlationId
- orderUpdateQueue (선택)
  - 주문 상태 변화를 비동기로 처리(알림/로그/리포트)

큐 공통 정책
- retry + backoff(지수)
- dead-letter(실패 이벤트 저장) 또는 systemEvents로 기록

---

## 4) 모듈/코드 구조(예시)

/apps
  /market-watcher
  /trader
  /reconciler
/libs
  /kis-adapter
  /domain
  /risk
  /indicators
  /llm-analyst
  /observability
  /config

핵심 원칙
- domain: Order/Fill/Position/Decision/RiskVerdict 타입과 순수 로직
- kis-adapter: KIS REST/WS 호출, 인증/서명, rateLimit, 에러 매핑
- risk: Hard rules(LLM보다 우선)
- llm-analyst: 프롬프트/스키마/파서/타임아웃/WAIT fallback
- indicators: 캔들 생성 + 지표 계산(단일 소스, 재현 가능)

---

## 5) KIS 연동 스펙

### 5.1 REST
- 기능: 주문(매수/매도/정정/취소), 잔고/미체결/체결 조회
- 필수 구현
  - accessToken 관리(만료/갱신)
  - timeout + retry + backoff
  - 429(레이트리밋)/5xx 대응
  - 요청/응답 audit logging(민감정보 마스킹)

### 5.2 WebSocket
- 기능: 실시간 시세/호가/체결
- 필수 구현
  - reconnect + re-subscribe
  - dataStalenessGuard(특정 시간 동안 갱신 없으면 safeMode)
  - 메시지 파싱/정합성 검증

---

## 6) 데이터 모델(최소 + 안전 필수)

### 6.1 필수 테이블
- orders
  - id, correlationId, idempotencyKey, symbol, side, orderType, qty, limitPrice, status, brokerOrderId, submittedAt, updatedAt
- fills
  - id, orderId, brokerFillId, fillPrice, fillQty, fillAt
- positions
  - symbol, qty, avgPrice, unrealizedPnl, updatedAt
- decisions
  - decisionId, correlationId, triggerSnapshotJson, llmInputJson, llmOutputJson, confidence, riskLevel, rationale, createdAt
- riskEvaluations
  - decisionId, correlationId, verdict(PASS|BLOCK), blockCode, detailsJson, createdAt
- assetStatus
  - tradeDate, startingCash, endingCash, realizedPnl, unrealizedPnl, dayReturnPct
- systemEvents
  - type(modeChange, killSwitchOn, circuitBreaker, reconnect, reconcileMismatch, error), payloadJson, createdAt
- systemLogs
  - level, message, contextJson, createdAt

### 6.2 인덱스/제약(권장)
- orders.idempotencyKey UNIQUE
- fills.brokerFillId UNIQUE (가능하면)
- decisions.decisionId UNIQUE
- correlationId 인덱스(트레이싱)

---

## 7) 핵심 알고리즘/정책 스펙

### 7.1 트리거(1차 필터)
- 입력: 최신 1분봉/5분봉 + 지표
- 예: rsi < 30 AND volumeChangeRate > 200%
- 정책: symbolCooldownSec 적용, 최대 이벤트/분 제한

### 7.2 LLM Analyst(2차 검증)
- 입력: 요약 피처(원시 틱/대량 텍스트 금지)
- 출력 스키마(강제)
  - decision: BUY | WAIT
  - confidence: 0..100
  - riskLevel: LOW | MEDIUM | HIGH
  - rationale: string(1줄)
- 실패/스키마 불일치/환각 징후 → WAIT

### 7.3 RiskManager(Hard rules, 항상 우선)
- dailyLossLimitUsd 도달 시 killSwitch + 전량 청산 시도 + 거래중단
- entryAllocationPct, maxOrderNotionalUsd, maxSymbolExposurePct
- whitelist/blacklist
- maxOrdersPerMinute / maxOrdersPerDay
- dataStale / reconcileMismatch → 거래중단

### 7.4 주문 실행(체결 우선)
- Entry: Market 또는 BestLimit
- chaseWindowSec 내 미체결:
  - replace(정정) 최대 maxReplaceCount
  - 또는 취소 후 Market 전환
- 모든 주문은 idempotencyKey 기반으로 중복 방지

### 7.5 Exit(코드 전용)
- stopLossPct: 즉시 시장가 청산
- takeProfitPct 도달 후 trailingStop 활성화
- trailingStopPct: 고점 대비 하락 시 청산
- timeCutMin: 변동성/기대 움직임 없으면 본절/약손절

---

## 8) 모드/설정 관리

### 8.1 모드
- paperMode / shadowMode / liveMode
- liveMode 전환은 명시적 설정 변경 + systemEvents 기록 + 알림 필수

### 8.2 설정 방식
- .env + config.json(로컬) + DB(systemConfig 테이블)(운영)
- 런타임 검증: zod로 env/config schema 강제

---

## 9) 로컬 개발 환경

### 9.1 기본 구성(권장)
- docker compose: mysql, redis
- 앱 실행: 로컬(Node)
  - marketWatcher / trader는 각각 pnpm dev:<app> 형태로 실행(레포 스크립트에 반영)

### 9.2 최소 스크립트(예시)
- pnpm dev:watcher
- pnpm dev:trader
- pnpm dev:reconciler
- pnpm test
- pnpm lint

---

## 10) 운영/배포(Phase 4 목표)
- docker compose: app(들) + mysql + redis
- pm2는 컨테이너 밖(호스트) 또는 컨테이너 내 1프로세스 원칙 중 택1
- 로그: json 파일 + 알림(필수), 필요 시 Loki/ELK는 후순위

---

## 11) 테스트 전략

### 11.1 단위 테스트
- indicator 계산, trigger 조건 평가, risk 룰 평가
- idempotencyKey 생성/중복 방지 로직

### 11.2 통합 테스트(가짜 브로커)
- kis-adapter를 mock server로 대체하여:
  - 주문/정정/취소 상태 전이
  - 부분체결 시 포지션 계산
  - 재시작 복구(reconcile) 시나리오

### 11.3 시뮬레이션
- paperMode/shadowMode에서 하루 이상 로그 기반 리플레이로 안정성 점검

---

## 12) 보안/시크릿
- KIS 키/시크릿/LLM 키는 git에 절대 포함 금지
- 로컬: .env.local(gitignore) + OS keychain/1Password(선택)
- 민감 로그 마스킹: 계좌/토큰/키/개인정보

---

## 13) 성능 SLO
- 트리거 발생 → 주문 전송(내부 처리) 목표 < 2초(LLM 포함)
- LLM 응답 목표 < 1500ms, 초과 시 WAIT 처리 가능(설정)

---

## 14) 오픈 이슈(결정 필요)
- BestLimit 구현 방식(호가/스프레드 기준)과 Market 전환 정책
- 프리마켓/애프터마켓 포함 여부(초기 제외 권장)
- 휴장/서머타임/시장 캘린더 처리 방식(라이브러리 도입 vs 보수적 컷오프)
- 수수료/환율 반영: 근사치로 시작 후 리포트 보정 여부
