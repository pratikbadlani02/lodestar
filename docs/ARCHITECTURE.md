# Lodestar — Architecture & Integration Flows

This document describes Lodestar's runtime architecture and **every integration
flow** — how the components talk to each other and to the outside world. It
complements `docs/BUILD_FROM_SCRATCH.md` (which is build-oriented); this one is
flow-oriented and is the reference for understanding *what calls what, when, and
what happens when it fails*.

**Contents**
- §1 System context (external integrations)
- §2 Component architecture & shared resources
- §3 Integration points (one section per external dependency)
- §4 End-to-end flows (sequence diagrams)
  - 4.1 Auth · 4.2 Manual order · 4.3 Strategy tick · 4.4 Position monitor
  - 4.5 Order sync · 4.6 Webhook · 4.7 Backtest · 4.8 Optimizer
  - 4.9 Market-data cache · 4.10 Fundamentals/earnings cache
  - 4.11 WebSocket realtime · 4.12 Kill switch & liquidate · 4.13 Frontend boot
- §5 The risk gate (the chokepoint, in detail)
- §6 Cross-cutting flows (audit, alerts, logging)
- §7 Failure modes & resilience matrix

---

## 1. System context

Lodestar is one process that integrates with five external systems. Everything
inbound and outbound flows through the FastAPI app.

```
                         ┌───────────────────────────┐
        Browser  ◄──────►│                           │◄──────►  Alpaca Trading API
   (React SPA + WS)      │       Lodestar            │          (orders, account,
                         │   FastAPI + APScheduler   │           positions, clock)
   Alpaca webhooks ─────►│   (single process)        │
   (order/fill events)   │                           │◄──────►  Alpaca Data API
                         │                           │          (bars, quotes, news,
                         └───────────────────────────┘           movers, crypto)
                            │        │         │   │
                 ┌──────────┘        │         │   └────────────►  yfinance / Yahoo
                 ▼                   ▼         ▼                   (fundamentals,
          PostgreSQL 16          Redis      SMTP (optional)        earnings, options,
        (all persistence)   (kill switch,   (critical alerts)      analysts, ESG)
                             cache, control)
```

| External system | Direction | Protocol | Auth | Purpose |
|-----------------|-----------|----------|------|---------|
| Alpaca Trading API | out | HTTPS REST | `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers | Submit/cancel orders, account, positions, market clock |
| Alpaca Data API | out | HTTPS REST | same headers | OHLCV bars, quotes, trades, news, movers, crypto |
| Yahoo Finance (yfinance) | out | HTTPS (lib) | none | Fundamentals, earnings, options chains, analysts, holders, ESG |
| PostgreSQL 16 | out | TCP (asyncpg/psycopg2) | connection string | All persistence |
| Redis | out | TCP (redis-py async) | connection string | Kill switch/control state, response cache, (future) pub/sub |
| SMTP server | out | SMTP | user/pass | Critical-alert emails (optional) |
| Browser | in/out | HTTPS + WebSocket | JWT bearer | Dashboard REST + live push |
| Alpaca webhooks | in | HTTPS POST | none (should be gated) | Order/fill event push |

---

## 2. Component architecture & shared resources

```
┌─────────────────────────── FastAPI process (Uvicorn, one event loop) ───────────────────────────┐
│                                                                                                   │
│  HTTP layer (app/api/*)            WebSocket (/ws)            Static SPA (frontend/dist, last)     │
│        │                                 │                                                        │
│        ▼                                 ▼                                                        │
│  ┌──────────────────────── services layer ────────────────────────┐    APScheduler (in-loop)     │
│  │ execution · risk · control · broker · audit · alerts            │    ├ run_active_strategies   │
│  │ market_data · market_calendar · fundamentals · stock_analysis   │◄──┤ monitor_open_positions   │
│  │ position_monitor · risk_analytics · optimizer · websocket       │   ├ sync_open_orders         │
│  │ backtester · portfolio/signal/options/event/mm backtesters      │   ├ snapshot_account         │
│  └─────────────────────────────────────────────────────────────────┘   ├ check_price_alerts      │
│        │                │                  │                 │           ├ fetch_market_data       │
│        ▼                ▼                  ▼                 ▼           └ compute_strategy_pnl     │
│   broker httpx     SQLAlchemy async    redis-py async    yfinance (in thread)                      │
│   client (1)       engine pool (1)     client (1)        via asyncio.to_thread                     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Three shared singletons** are reused by both the HTTP request path and the
scheduler jobs — this is the whole point of the in-process design (no IPC, no
duplicate pools):

| Resource | Created by | Shared by | Lifecycle |
|----------|-----------|-----------|-----------|
| SQLAlchemy async engine + pool | `app/core/db.py` (`engine`, `AsyncSessionLocal`) | all routers (`get_db`), all services, all jobs | disposed in lifespan shutdown |
| Alpaca httpx client | `app/services/broker.py` (`get_broker()` singleton) | execution, risk, market endpoints, jobs | lazy, closed in lifespan shutdown |
| Redis client | `app/services/control.py` (`get_redis()`) | control gate, fundamentals cache, health | lazy |

**Key invariant:** `execute_order()` in `services/execution.py` is the **only**
function that calls `broker.submit_order()`. Strategies, routers, and jobs all go
through it, so the risk gate (§5) cannot be bypassed.

---

## 3. Integration points

### 3.1 Alpaca Trading API (`services/broker.py`)
- Async `httpx.AsyncClient`, base = `settings.alpaca_base_url` (paper by default).
- Auth via two headers: `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`.
- Endpoints used: `GET /v2/account`, `GET /v2/positions`, `GET /v2/clock`,
  `POST /v2/orders`, `DELETE /v2/orders`, `DELETE /v2/orders/{id}`,
  `DELETE /v2/positions` (close all), `GET /v2/calendar`.
- Errors raise `AlpacaError`; callers (execution, risk) decide policy. The risk
  gate treats a broker failure as **fail-safe reject** (`broker_unavailable`).
- **Paper vs live** is purely the base URL + the `alpaca_live_confirmed` flag —
  the code path is identical, which is why the risk gate applies to both.

### 3.2 Alpaca Data API (`services/broker.py`, `services/market_data.py`)
- Base = `settings.alpaca_data_url`. Same auth headers.
- `get_bars()` **auto-paginates** via `next_page_token`. Used by
  `market_data.fetch_and_store_bars()` to populate the `ohlcv` cache, and by
  read-only `/api/market/*` endpoints for quotes/news/movers/crypto.

### 3.3 Yahoo Finance (`services/fundamentals.py`)
- `yfinance` is **synchronous**; every call is wrapped in `asyncio.to_thread`
  so it never blocks the event loop.
- Results are **Redis-cached** through a generic `_cached(key, ttl, loader,
  cache_if)` helper. `cache_if` is a predicate that prevents caching empty
  payloads (so a transient Yahoo block doesn't get pinned for the full TTL).
- TTLs vary by data type (profile long, options short, calendar ~2h).
- Powers `/api/market/{profile,fundamentals,earnings,analysts,holders,dividends,
  splits,sustainability,...}` and the composite `stock_analysis` payload.

### 3.4 PostgreSQL (`app/core/db.py`)
- Two URLs: `database_url` (asyncpg, app runtime) and `database_url_sync`
  (psycopg2, Alembic). Validators coerce `postgres://` → correct dialect.
- Pool: size 10 / overflow 20 / `pool_pre_ping` / `pool_recycle 3600`.
- `get_db()` dependency commits on success, rolls back on exception.
- Schema is owned by **Alembic migrations 0001–0004**, never `create_all`.

### 3.5 Redis (`services/control.py`, `services/fundamentals.py`)
- Control keys: `control:trading_enabled`, `control:strategies_enabled`,
  `control:kill_reason` (string `"1"`/`"0"`). Survive restarts → the kill switch
  is durable.
- Also the backing store for the fundamentals response cache.
- `init_control_state()` seeds defaults at startup; failure is tolerated (logged,
  app still boots).

### 3.6 SMTP (`services/alerts.py`)
- Optional. Only fires for `severity == "critical"` and only if SMTP is
  configured. Sent via executor so blocking `smtplib` doesn't stall the loop.

### 3.7 Browser ↔ app (REST + WebSocket)
- REST: JWT bearer in `Authorization` header; 401 → SPA clears token, redirects
  to `/login`.
- WebSocket `/ws`: server pushes `{type, data}` JSON frames; client sends
  keepalive pings and auto-reconnects every 5s.

### 3.8 Alpaca webhooks (`api/realtime.py`)
- `POST /webhooks/alpaca`: persists every payload to `webhook_events`, and for
  `fill | partial_fill | new | canceled` immediately broadcasts an `order_event`
  to all dashboards.

---

## 4. End-to-end flows

Legend: `SPA` = React app, `API` = FastAPI router, `EXE` = execution service,
`RISK` = risk manager, `CTL` = control(Redis), `BRK` = Alpaca broker,
`DB` = Postgres, `WS` = WebSocket manager.

### 4.1 Authentication

```
SPA → API  POST /api/auth/login {username, password}
API → DB   SELECT user WHERE username=?
           ├─ found  → bcrypt.verify(password, hashed_password)
           └─ none   → fallback: compare to settings.admin_username/password
API        create_access_token(sub=username)   # HS256, exp=24h
API → SPA  { access_token }
SPA        sessionStorage["quant_token"] = token
SPA → API  (every request) Authorization: Bearer <token>
API        get_current_user → decode_token → 401 on invalid/expired
           require_admin → re-checks DB role=="admin" (config admin always admin)
```

### 4.2 Manual order (the canonical write path)

```
SPA → API   POST /api/orders {symbol, side, qty, order_type, ...}   (JWT required)
API → EXE   execute_order(db, ...)
EXE → DB    INSERT order status=PENDING_RISK                         (persist first)
EXE → RISK  check_order(symbol, side, qty, reference_price)
            │  1 kill switch?      CTL.is_trading_enabled()  (Redis)
            │  2 rate limit?       in-memory 60s window
            │  3 broker reachable? BRK.get_account()+get_positions()
            │  4 market hours?     BRK.get_clock()           (BUY only)
            │  5 daily loss?       day_pl_pct vs limit
            │  6 max positions?    (BUY only, new symbol)
            │  7 position size?    notional/equity vs limit  (BUY only)
            │  8 buying power?     notional vs BP            (BUY only)
            ▼
    ┌─ approved ──────────────────────────┐   ┌─ rejected ───────────────────┐
    │ EXE → BRK POST /v2/orders            │   │ EXE → DB status=RISK_REJECTED │
    │ EXE → DB  status=SUBMITTED,          │   │ EXE → audit(order_rejected,   │
    │           broker_order_id=...        │   │            success=False)     │
    │ EXE → audit(order_submitted)         │   │ API → SPA 422 + reason        │
    │ API → SPA 201 OrderRead              │   └───────────────────────────────┘
    └──────────────────────────────────────┘
            (broker error → status=ERROR, audit order_broker_error)
```

### 4.3 Automated strategy tick (`run_active_strategies`, every 60s)

```
APScheduler → tasks.run_active_strategies()
  guard: CTL.is_strategies_enabled() AND market_calendar.is_market_open()
  DB    SELECT strategies WHERE status=ACTIVE
  for each strategy, for each symbol:
     market_data.get_bars_df(symbol)            ← reads ohlcv cache (DB)
     strat = registry.get_strategy(type, params)
     signal = strat.generate_signal(symbol, df) ← pure function, no I/O
     if signal in (BUY, SELL, CLOSE):
        qty = size_from(position_size_pct, account_equity)
        EXE.execute_order(...)                  ← SAME risk-gated path as §4.2
  DB    INSERT strategy_runs {signals_generated, orders_submitted}
  WS    emit("strategy_signal", ...) on activity
```

The only difference from a manual order is the *caller* — the gate is identical.

### 4.4 Position monitoring / auto-close (`monitor_open_positions`, every 30s)

```
APScheduler → position_monitor.monitor_positions(db)
  BRK   get_positions()                          (live broker positions)
  for each open position:
     DB   load local Position (stop/take/highest) + linked Strategy
     update highest_price if current > highest   (trailing high-water mark)
     trigger? in order:
        stop_loss   : current ≤ stop_loss_price
        take_profit : current ≥ take_profit_price
        trailing    : current ≤ highest*(1 - trailing_pct/100)
        max_hold    : days_held ≥ max_hold_days
     if triggered:
        EXE.execute_order(SELL, qty, market)     ← risk-gated close
        alerts.emit_alert(...) ; WS.emit("position_closed", ...)
```

### 4.5 Order sync (`sync_open_orders`, every 30s)

```
APScheduler → tasks.sync_open_orders()
  DB    SELECT orders WHERE status in (SUBMITTED, ACCEPTED, PARTIALLY_FILLED)
  for each: BRK get order by broker_order_id
            map broker status → OrderStatus
            DB update filled_qty, avg_fill_price, filled_at, status
            WS emit("order_update", ...) on change
```

This is the **pull** reconciliation path; webhooks (§4.6) are the **push** path.
Both converge on the same order rows, so the system is correct even if webhooks
are not configured.

### 4.6 Webhook (push path)

```
Alpaca → API  POST /webhooks/alpaca { event, ... }
API → DB      INSERT webhook_events (raw payload, processed=False)
API → WS      if event in (fill, partial_fill, new, canceled):
                 broadcast("order_event", {event, ...})
API → Alpaca  { received: true, event_id }
```

### 4.7 Backtest (async dispatch)

```
SPA → API   POST /api/backtests {strategy_type, symbols, params, dates, capital}
API         validate strategy_type ∈ any registry ; end_date > start_date
API → DB    INSERT backtest status=PENDING
API         tasks.dispatch(run_backtest(id))    ← asyncio.create_task (strong ref)
API → SPA   202 { id, status: pending }

[background] run_backtest(id):
  DB    load backtest ; status=RUNNING
  ensure data: market_data.fetch_and_store_bars() per symbol if needed
  ROUTE by strategy_type (first match wins):
     1 CROSS_SECTIONAL_REGISTRY → PortfolioBacktestEngine
     2 OPTIONS_REGISTRY         → OptionsBacktestEngine
     3 EVENT_REGISTRY           → EventBacktestEngine
     4 MM_REGISTRY              → MarketMakingEngine
     5 STRATEGY_REGISTRY & >1 symbol → SignalPortfolioEngine
     6 single-symbol            → create_engine (BacktestEngine)
  run engine inside asyncio.to_thread (CPU-bound numpy/pandas)
  DB    UPDATE metrics + equity_curve ; INSERT backtest_trades ; status=COMPLETED
  WS    emit("backtest_completed", {return%, trades})  → SPA toast
```

### 4.8 Optimizer (grid search)

```
SPA → API   POST /api/analytics/optimizer {strategy_type, symbols, param_grid, ...}
API → DB    INSERT optimizer_runs status=pending
API         dispatch(run_optimizer(id)) ; 202

[background] optimizer.run_optimization(id):
  prefetch ~2y bars for all symbols
  combos = expand_grid(param_grid)              # cartesian product
  for combo in combos:
     for symbol: BacktestEngine(combo).run(...)  # equal capital sleeve
     aggregate (sum equity, avg sharpe, sum trades)
  rank by (avg_sharpe desc, return desc)
  DB UPDATE results, best_params, best_sharpe ; status=completed
```

### 4.9 Market-data cache (`fetch_market_data` hourly + on demand)

```
trigger (hourly @ :05, or POST /api/market/fetch/{symbol})
  collect symbols (active strategies, or the requested one)
  BRK   get_bars(symbol, timeframe, lookback)   ← auto-paginated
  DB    UPSERT into ohlcv ON CONFLICT(time,symbol,timeframe) DO UPDATE
reads: backtests, strategy ticks, analytics → market_data.get_bars_df() ← ohlcv
```

`ohlcv` is the **system of record for price history**; the broker is only the
source. This decouples backtests/analytics from live API rate limits.

### 4.10 Fundamentals / earnings cache (yfinance + Redis)

```
SPA → API  GET /api/market/earnings/calendar?symbols=...
API → fundamentals.get_earnings_calendar(symbols)
       key = "earnings:calendar:<hash>"
       Redis GET key → hit? return
       miss: loader() runs yf.Ticker(...).calendar PER SYMBOL in a thread
             aggregate rows ; log earnings_calendar_no_data on failures
       _cached(..., cache_if=bool)  → only cache NON-empty (self-heals)
API → SPA  { count, results }
```

> Operational note: from datacenter IPs Yahoo can rate-limit/block, yielding
> empty results. The `cache_if=bool` predicate keeps empties out of the cache so
> the calendar recovers automatically once Yahoo responds again; a
> `earnings_calendar_no_data` warning is logged when symbols come back empty.

### 4.11 WebSocket realtime

```
SPA   (on boot, if token) connectWebSocket(onMessage) → ws://…/ws
WS    manager.connect(ws) → ws.accept(); active.add(ws)
SPA   every 30s: send ping (keepalive) ; on close: reconnect after 5s

server-side emit points (all via manager.broadcast({type,data})):
   order_update / order_event   ← sync_open_orders, webhook
   position_closed              ← position_monitor
   alert / price_alert_triggered← alerts, check_price_alerts
   control_update               ← kill/resume endpoints
   strategy_signal              ← run_active_strategies
   backtest_completed           ← run_backtest

SPA store._onWsMessage routes each type → targeted reload of the affected slice
   (orders/positions/account/alerts/control/strategies/backtests)
```

The store treats WS as an **invalidation signal**; the authoritative data is the
subsequent REST refetch. A 30s safety poll covers any missed frame.

### 4.12 Kill switch & emergency liquidate

```
KILL:    SPA → API POST /api/control/kill {reason}
         CTL.set_trading_enabled(False, reason)   (Redis)
         CTL.set_strategies_enabled(False)
         audit(kill) ; WS emit control_update
         → next risk check (§5 step 1) rejects ALL orders immediately

RESUME:  POST /api/control/resume → both flags True ; audit ; WS

LIQUIDATE: POST /api/control/liquidate {reason}
         EXE.emergency_liquidate_all():
            BRK cancel_all_orders()
            BRK close_all_positions()
         also activates kill switch ; audit ; WS
```

### 4.13 Frontend bootstrap & data lifecycle

```
index.html  inline script applies data-theme/data-density from localStorage (pre-paint)
main.jsx    BrowserRouter → ThemeProvider → DensityProvider → SymbolProvider → App
App.jsx     RequireAuth gates private routes → redirect /login?from=… if no token
store.initStoreWS() (only if token):
   parallel REST: loadControl/Health/Account/Positions/Orders/Alerts/Strategies/Backtests
   connectWebSocket() → wire _onWsMessage
   30s safety refresh interval
api.js      every call injects Bearer token ; 401 → clear token + redirect
            (Vite dev proxies /api → :8000 ; in prod same origin serves SPA + API)
```

---

## 5. The risk gate (the chokepoint)

`RiskManager.check_order()` is the single most important integration point: it
sits between *every* order source and the broker. Checks run **in order,
fail-fast**, and all limits come from `config.py` and apply to **paper and live
identically**.

| # | Check | Source of truth | On fail |
|---|-------|-----------------|---------|
| 1 | Kill switch | Redis (`control:trading_enabled`) | reject `trading_disabled` |
| 2 | Rate limit | in-memory 60s sliding window | reject `rate_limited` |
| 3 | Broker reachable | Alpaca `get_account`+`get_positions` | reject `broker_unavailable` (fail-safe) |
| 4 | Market hours (BUY) | Alpaca `get_clock` | reject `market_closed` |
| 5 | Daily loss limit | derived `day_pl_pct` | reject `daily_loss_limit_breached` |
| 6 | Max open positions (BUY) | broker positions | reject `max_positions` |
| 7 | Position size % (BUY) | notional / equity | reject `position_too_large` |
| 8 | Buying power (BUY) | account buying_power | reject `insufficient_buying_power` |

Result `{approved, reason, details}` is stored on the order row (`risk_check`
JSON) and audited regardless of outcome — nothing is silently dropped.

---

## 6. Cross-cutting flows

- **Audit** — `services/audit.py` writes an `audit_log` row *and* a structured
  log line for every sensitive action (order submit/reject/error, kill, resume,
  liquidate, login, strategy/user CRUD). Queryable via `GET /api/audit`.
- **Alerts** — `services/alerts.py` persists to `alerts` and emails on
  `critical`. Surfaced via `GET /api/analytics/alerts` and the `alert` WS event.
- **Logging** — `structlog` JSON to stdout at `LOG_LEVEL`; the global exception
  handler logs `unhandled_exception` and returns a JSON 500.
- **Health** — `GET /api/health` probes DB + Redis + broker and returns
  `ok`/`degraded`; `GET /api/health/live` is a dependency-free liveness probe
  (used as the Render health check and the keep-alive pinger target).

---

## 7. Failure modes & resilience matrix

| Integration | Failure | Detection | Behavior / mitigation |
|-------------|---------|-----------|------------------------|
| Alpaca trading | API down/timeout | `AlpacaError` in risk check 3 | Orders **rejected fail-safe** (`broker_unavailable`); no blind submits |
| Alpaca trading | order submit error | exception in `execute_order` | order row → `status=ERROR`, audited; nothing left ambiguous |
| Alpaca data | bars fetch fails | exception in `fetch_and_store_bars` | logged; backtests/ticks use whatever is already cached in `ohlcv` |
| yfinance/Yahoo | rate-limit/block (empty) | empty payload + warning log | `cache_if=bool` refuses to cache empties → **self-heals**; UI shows blank until recovery |
| PostgreSQL | unreachable | pool error / health `fail` | request 500s + rollback; `pool_pre_ping` recycles dead conns |
| Redis | unreachable at boot | caught in lifespan | app still starts (logged); control falls back to defaults |
| Redis | unreachable at runtime | exception in risk check 1 | kill-switch read fails → treat conservatively (reject) |
| WebSocket | client drops | send raises | stale socket removed from set; client auto-reconnects in 5s |
| Scheduler | Render free-tier sleep | no ticks while asleep | external pinger on `/api/health` keeps the dyno warm in market hours |
| Scheduler | horizontal scale | duplicate ticks | **not supported** as-is; needs a Redis leader-lock |
| WebSocket | multi-worker | events only reach same-worker clients | **not supported** as-is; needs Redis pub/sub |
| SMTP | not configured / fails | guarded / logged | alerts still persisted to DB; email is best-effort only |

---

*See also:* `docs/BUILD_FROM_SCRATCH.md` (component-by-component build guide),
`CLAUDE.md` (repo conventions), `DEPLOY.md` (deployment walkthrough).
