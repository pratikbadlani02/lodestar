# Building Lodestar From Scratch

A complete, reverse-engineered specification for rebuilding **Lodestar** — an
autonomous quantitative trading platform — from an empty directory. This
document describes *what* each piece does and *why*, in the order you should
build it, so the system comes up green at every phase.

> If you only read one section, read **§3 Architecture** and **§5 The trading
> core** — everything else hangs off the order-execution pipeline.

---

## 1. What you are building

Lodestar is a single-process web application that:

1. Runs **quantitative trading strategies** against the Alpaca brokerage
   (paper by default; live trading is behind a deliberate two-flag gate).
2. Gates every order through an **8-check risk manager** before it ever reaches
   the broker.
3. Persists everything (orders, positions, strategies, backtests, audit log,
   account snapshots) to **PostgreSQL**.
4. Runs periodic work (strategy ticks, position monitoring, order sync) on an
   **in-process scheduler** living inside the web event loop — there is no
   separate worker process.
5. Serves a **React single-page dashboard** for live trading, market research,
   backtesting, and administration.
6. Streams live updates to the dashboard over a **WebSocket**.

The whole thing ships as **one Docker container** and deploys to Render as a
single web service plus a managed Postgres database, with Redis hosted
externally (e.g. Upstash).

---

## 2. Tech stack & prerequisites

| Layer            | Choice                                            | Why |
|------------------|---------------------------------------------------|-----|
| Backend language | Python 3.12                                       | Modern typing, async |
| Web framework    | FastAPI + Uvicorn                                  | Async, OpenAPI for free |
| ORM              | SQLAlchemy 2.0 (async) + Alembic                   | Async DB + versioned migrations |
| Database         | PostgreSQL 16 (TimescaleDB optional)               | Relational + time-series bars |
| DB drivers       | asyncpg (app), psycopg2 (Alembic)                  | Async runtime, sync migrations |
| Cache / control  | Redis 5+                                            | Kill switch + cache + pub/sub |
| Scheduler        | APScheduler (`AsyncIOScheduler`)                   | In-loop periodic jobs |
| Numerics         | pandas, numpy                                      | Indicators, backtests |
| Market data      | Alpaca REST (bars/quotes), yfinance (fundamentals) | Free-tier data |
| HTTP client      | httpx (async)                                      | Async broker calls |
| Auth             | JWT (python-jose) + bcrypt (passlib)               | Stateless tokens |
| Logging          | structlog (JSON)                                   | Log-aggregator friendly |
| Frontend         | React 18 + Vite + React Router 6                   | SPA |
| State            | Zustand + React Context                            | Live store + UX prefs |
| Styling          | Tailwind CSS 3 (CSS-variable theming)              | Dark/light, density |
| Charts           | recharts + lightweight-charts                      | Analytics + price charts |
| Toasts           | sonner                                             | Notifications |
| Icons            | lucide-react                                       | Icon set |

**Local prerequisites:** Python 3.12, Node 20+, a reachable PostgreSQL 16 and
Redis, and an Alpaca **paper** account (free) for API keys.

---

## 3. Architecture

### 3.1 The one rule

> **Strategies never touch the broker.** All order flow is funneled through a
> single execution path so the risk gate cannot be bypassed.

```
Strategy.generate_signal()  →  execute_order()  →  risk_manager.check_order()  →  AlpacaBroker
   (app/strategies/*)         (services/execution)    (services/risk)            (services/broker)
```

### 3.2 Process topology

```
┌─────────────────────────── Single Docker container ───────────────────────────┐
│                                                                                 │
│  Uvicorn → FastAPI app (app/main.py)                                            │
│    ├── HTTP routers under /api/*          (REST)                                │
│    ├── WebSocket /ws                       (live push)                          │
│    ├── Static mount → frontend/dist        (React SPA, mounted LAST)            │
│    └── lifespan startup:                                                        │
│          • init Redis control state                                            │
│          • start APScheduler (in-process) ── periodic jobs ──┐                 │
│                                                              │                 │
│   APScheduler jobs (same event loop, share DB pool + broker client + Redis):   │
│     run_active_strategies(60s) · monitor_open_positions(30s) ·                 │
│     sync_open_orders(30s) · snapshot_account(5m) · check_price_alerts(60s) ·   │
│     fetch_market_data(hourly) · compute_strategy_pnl(daily 21:30 UTC)          │
└─────────────────────────────────────────────────────────────────────────────┘
        │                         │                          │
        ▼                         ▼                          ▼
   PostgreSQL 16             Redis (Upstash)            Alpaca REST API
   (all persistence)      (kill switch, cache)     (orders, bars, account)
                                                          │
                                                          ▼
                                                  yfinance (fundamentals,
                                                  earnings, options chains)
```

**Scaling caveat:** the scheduler is single-instance only. The WebSocket manager
is per-process in-memory. Horizontal scaling would require a Redis leader-lock
for the scheduler and Redis pub/sub for cross-process WebSocket broadcast.

### 3.3 Directory layout

```
lodestar/
├── app/
│   ├── main.py                 # FastAPI app, lifespan, router mounts, SPA fallback
│   ├── scheduler.py            # APScheduler setup + job registration
│   ├── tasks.py                # periodic jobs + run_backtest dispatcher + dispatch()
│   ├── api/                    # one router module per domain (mounted under /api)
│   │   ├── auth.py  account.py  orders.py  strategies.py  backtests.py
│   │   ├── control.py  market.py  analytics.py  alerts(+optimizer+export in analytics.py)
│   │   ├── health.py  audit.py  realtime.py  watchlists.py  price_alerts.py  users.py
│   ├── core/
│   │   ├── config.py           # pydantic-settings (all config + safety flags)
│   │   ├── db.py               # async engine, session factory, Base, get_db
│   │   ├── models.py           # ALL ORM models in one file
│   │   ├── schemas.py          # Pydantic request/response models
│   │   ├── security.py         # JWT, bcrypt, get_current_user, require_admin
│   │   └── logging.py          # structlog JSON config
│   ├── services/               # business logic (see §5–§7)
│   │   ├── broker.py  execution.py  risk.py  control.py  audit.py  alerts.py
│   │   ├── market_data.py  market_calendar.py  fundamentals.py  stock_analysis.py
│   │   ├── position_monitor.py  risk_analytics.py  optimizer.py  websocket.py
│   │   └── backtester.py  portfolio_backtester.py  signal_portfolio_backtester.py
│   │       options_backtester.py  event_backtester.py  mm_backtester.py
│   └── strategies/             # pure-function trading strategies + registries
│       ├── base.py  registry.py  cross_sectional.py
│       └── <14 single-symbol strategy modules>
├── alembic/                    # migrations 0001..0004 + env.py
├── alembic.ini
├── scripts/                    # seed_strategies.py, backup_db.sh, regime_check.py
├── frontend/                   # React + Vite SPA (see §10)
├── requirements.txt
├── Dockerfile                  # 2-stage: build frontend, then python runtime
├── render.yaml                 # Render blueprint
└── .env.example
```

---

## 4. Phase 0 — Project skeleton & configuration

### 4.1 `requirements.txt`

```
# Web
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9
# Security
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
# Database
sqlalchemy[asyncio]>=2.0.30
asyncpg>=0.29.0
psycopg2-binary>=2.9.9
alembic>=1.13.0
# Redis
redis>=5.0.0
# Scheduler
apscheduler>=3.10.4
# Numerics / data
pandas>=2.2.0
numpy>=1.26.0
yfinance>=0.2.40
# HTTP
httpx>=0.27.0
# Config / logging
pydantic>=2.7.0
pydantic-settings>=2.3.0
python-dotenv>=1.0.0
structlog>=24.1.0
```

### 4.2 `app/core/config.py` — settings & the safety gate

A single `pydantic-settings` `Settings` class loaded from `.env`. Build it with:

- **Environment:** `app_env`, `app_host`, `app_port`, `log_level`, `cors_origins`.
- **Security:** `secret_key` (validator *warns*, never fails, on the default —
  generate with `openssl rand -hex 32`), `access_token_expire_minutes` (24h),
  `admin_username`, `admin_password`.
- **Database:** `database_url` (asyncpg) and `database_url_sync` (psycopg2). Both
  have **field validators that coerce** Render/Heroku-style `postgres://...` into
  the correct dialect (`postgresql+asyncpg://` / `postgresql+psycopg2://`). This
  is essential — without it asyncpg throws "requires an async driver".
- **Redis:** `redis_url`.
- **Alpaca:** `alpaca_api_key`, `alpaca_secret_key`, `alpaca_base_url` (default
  the **paper** URL), `alpaca_data_url`, `alpaca_live_confirmed` (bool, default
  False).
- **Risk guardrails (apply to paper AND live):** `max_drawdown_pct` (5),
  `max_daily_loss_pct` (2), `max_position_size_pct` (10), `max_open_positions`
  (10), `max_orders_per_minute` (10). Use pydantic `Field(ge=, le=)` bounds.
- **Control flags:** `trading_enabled`, `strategies_enabled` (both bool).
- **Email (optional):** SMTP host/port/user/password, `alert_email_to`.
- **Backtest defaults:** `backtest_default_capital` (100k),
  `backtest_commission_per_trade` (0), `backtest_slippage_bps` (2).

Two computed properties carry the whole safety model:

```python
@property
def cors_origin_list(self) -> list[str]:
    # blank → localhost dev defaults; else split the comma list
    ...

@property
def is_live_trading(self) -> bool:
    # LIVE only if URL is non-paper AND alpaca_live_confirmed is True
    return "paper" not in self.alpaca_base_url.lower() and self.alpaca_live_confirmed is True
```

Expose a cached singleton: `@lru_cache def get_settings()` and
`settings = get_settings()`.

### 4.3 `app/core/logging.py`

`configure_logging()` wires `structlog` to emit **JSON** to stdout at
`settings.log_level`, with ISO-UTC timestamps and exception formatting.
`get_logger(name)` returns a bound logger. Call `configure_logging()` once at
import time in `main.py`.

### 4.4 `.env.example`

Document every key above. Ship sane paper-trading defaults; leave secrets blank.

---

## 5. Phase 1 — The trading core (data, broker, risk, execution, control)

This is the heart. Build it bottom-up: DB → models → broker → control → risk →
execution.

### 5.1 `app/core/db.py`

- `create_async_engine(settings.database_url, pool_size=10, max_overflow=20,
  pool_pre_ping=True, pool_recycle=3600)`.
- `AsyncSessionLocal = async_sessionmaker(expire_on_commit=False,
  autoflush=False)`.
- `class Base(DeclarativeBase)`.
- `get_db()` async generator dependency: yields a session, **commits on success,
  rolls back on exception**.
- `check_db()` → `SELECT 1`, returns latency in ms (for the health endpoint).

### 5.2 `app/core/models.py` — the full schema

All ORM models live in **one file**. Two project-wide conventions you must
replicate on every model or inserts break:

1. **Enum columns** use
   `Enum(MyEnum, name="...", create_type=False,
   values_callable=lambda x: [e.value for e in x])`.
   `values_callable` makes asyncpg send enum **values** (`"pending"`) not Python
   names (`"PENDING"`). `create_type=False` means the **migration** owns the PG
   type, not `create_all`.
2. UUID primary keys via `default=new_uuid` (a `uuid.uuid4` wrapper).

**Enums:** `OrderSide` (buy/sell), `OrderType` (market/limit/stop/stop_limit),
`OrderStatus` (pending_risk, risk_rejected, submitted, accepted,
partially_filled, filled, canceled, rejected, expired, error), `StrategyStatus`
(active/paused/disabled), `BacktestStatus` (pending/running/completed/failed),
`TradingMode` (paper/live).

**Tables** (see §13 for the full column reference):

| Table | Purpose |
|-------|---------|
| `ohlcv` | Cached OHLCV bars. Composite PK `(time, symbol, timeframe)`. |
| `strategies` | Strategy config: type, symbols (JSON), params (JSON), position size %, stop/take/trailing/max-hold, timeframe, status (default PAUSED). |
| `strategy_runs` | One row per tick: signals_generated, orders_submitted, error. |
| `strategy_performance` | Daily P&L per strategy. Unique `(strategy_id, date)`. |
| `orders` | Full order lifecycle. `client_order_id` unique; `broker_order_id` unique nullable; `risk_check` JSON; status default `pending_risk`. |
| `positions` | One row per symbol (unique). Tracks stop/take/highest price for the monitor. |
| `backtests` | Backtest request + results (metrics + `equity_curve` JSON). |
| `backtest_trades` | Round-trip trades per backtest. |
| `optimizer_runs` | Grid-search runs: param_grid JSON, results JSON, best_params, best_sharpe. |
| `audit_log` | Immutable action log: actor, action, resource, details, success. |
| `account_snapshots` | Periodic equity/cash/buying-power snapshots. |
| `alerts` | Notifications (severity, category, title, message, acknowledged). Note the column is named `metadata` but mapped as `metadata_json`. |
| `webhook_events` | Raw Alpaca webhook payloads. |
| `watchlists` | Named symbol lists, scoped by `owner`. |
| `price_alerts` | User price/volume/pct triggers (condition above/below, threshold). |
| `users` | Auth users: username, hashed_password, role (admin/viewer). |

Add `Index("ix_ohlcv_symbol_time", OHLCV.symbol, OHLCV.time.desc())`.

### 5.3 Migrations (`alembic/`)

- `alembic.ini` points `script_location = alembic`.
- `alembic/env.py` is **async**: it imports `app.core.models`, sets
  `sqlalchemy.url` from `settings.database_url` (so the coercion validator runs),
  and runs migrations via `async_engine_from_config` + `connection.run_sync`.
- Four migrations form the chain:
  - `0001_initial` — all base tables; optionally turns `ohlcv` into a
    **TimescaleDB hypertable** (guard for when the extension is absent — plain
    Postgres works fine).
  - `0002_v2_features` — stop-loss/take-profit/trailing/max-hold on strategies &
    positions, `strategy_performance`, `optimizer_runs`, `alerts`,
    `webhook_events`, multi-timeframe.
  - `0003_webull_features` — `watchlists`, `price_alerts`.
  - `0004_gap_priorities` — `stop_limit` order type, TIF column, `users` table,
    `alert_type`.

Schema changes always go through Alembic; **never `create_all`**.

### 5.4 `app/services/broker.py` — Alpaca wrapper

`AlpacaBroker`: a thin **async httpx** wrapper over Alpaca's REST API (raw HTTP,
*not* `alpaca-py`, to avoid sync/async mismatch). Lazy-initialized client reused
across calls. Singleton via `get_broker()`. Raises `AlpacaError` on failures
(callers handle). Implement:

- Account/clock: `get_account()`, `get_positions()`, `get_clock()`.
- Orders: `submit_order(...)`, `cancel_order(id)`, `cancel_all_orders()`,
  `close_all_positions(cancel_orders=True)`.
- Market data: `get_bars(symbol, timeframe, ...)` with **auto-pagination**
  (follow `next_page_token`), plus `get_snapshots`, `get_news`, `get_trades`,
  `get_quotes`, `get_movers`, `get_most_actives`, crypto snapshots/bars.
- Numeric fields handled as `Decimal` for precision.

Only the execution and risk layers (and read-only market endpoints) call the
broker.

### 5.5 `app/services/control.py` — Redis kill switch

Runtime control state in Redis so it **survives restarts**. Keys:
`control:trading_enabled`, `control:strategies_enabled`, `control:kill_reason`
(string `"1"`/`"0"`). Functions: `is_trading_enabled()`,
`is_strategies_enabled()`, `set_trading_enabled(enabled, reason="")`,
`set_strategies_enabled(enabled)`, `get_kill_reason()`, `init_control_state()`
(seed defaults on startup), `get_redis()` (lazy connection), `check_redis()`
(ping latency for health).

### 5.6 `app/services/risk.py` — the 8-check gate

`RiskManager.check_order(symbol, side, qty, reference_price) -> RiskCheckResult`
(`approved: bool, reason: str, details: dict`). Checks run **in order,
fail-fast**; all limits come from `config.py` and apply to **both paper and
live**:

1. **Kill switch** — `control.is_trading_enabled()` must be True.
2. **Rate limit** — in-memory sliding 60s window vs `max_orders_per_minute`.
3. **Broker reachable** — fetch account + positions; fail safe
   (`broker_unavailable`) if the call throws. Derive equity, last_equity,
   buying_power, day P&L %.
4. **Market hours** (BUY only) — reject buys when the broker clock says closed.
5. **Daily loss limit** — reject all if `day_pl_pct ≤ -max_daily_loss_pct`.
6. **Max open positions** (BUY only) — reject *new* symbols when at
   `max_open_positions`; adding to an existing position is allowed.
7. **Position size %** (BUY only) — reject if `qty*price / equity*100 >
   max_position_size_pct`.
8. **Buying power** (BUY only) — reject if order value > buying power.

### 5.7 `app/services/audit.py` & `alerts.py`

- `audit(db, actor, action, resource=None, details=None, success=True)` — writes
  an `audit_log` row (Decimal-safe JSON) **and** a structured log line. Every
  sensitive action calls this.
- `emit_alert(db, severity, category, title, message, metadata=None)` — persists
  an `alerts` row and, if `severity=="critical"` and SMTP configured, sends email
  via an executor (so blocking smtplib doesn't stall the loop).

### 5.8 `app/services/execution.py` — the only path to the broker

- `execute_order(db, symbol, side, qty, order_type, ...)`:
  1. Persist the order immediately as `status=PENDING_RISK`.
  2. `risk_manager.check_order(...)`.
  3. **Approved** → `broker.submit_order(...)`, set `status=SUBMITTED` +
     `broker_order_id`, audit `order_submitted`.
  4. **Rejected** → `status=RISK_REJECTED` + reason, audit `order_rejected`
     (success=False). Nothing is silently dropped.
  5. **Broker error** → `status=ERROR` + reason, audit `order_broker_error`.
- `sync_order_status(db, order)` — poll broker, map broker status →
  `OrderStatus`, update `filled_qty`, `avg_fill_price`, `filled_at`.
- `emergency_liquidate_all(db, actor, reason)` — cancel all orders + close all
  positions (the liquidate button calls this).

### 5.9 Market data & calendar

- `market_data.py`: `fetch_and_store_bars(db, symbol, timeframe, lookback_days)`
  pulls bars from Alpaca and **upserts** into `ohlcv` (on-conflict update OHLCV).
  `get_bars_df(db, symbol, ...)` returns a sorted pandas DataFrame
  (`time, open, high, low, close, volume`). Maps Alpaca timeframes (`1Day`) ↔ DB
  timeframes (`1d`).
- `market_calendar.py`: `is_market_open()`, `next_market_open()`,
  `is_trading_day(d)` — Alpaca clock/calendar is the source of truth, weekday
  check is the fallback.

---

## 6. Phase 2 — Strategies

### 6.1 `app/strategies/base.py`

```python
class SignalType(str, Enum): BUY="buy"; SELL="sell"; HOLD="hold"; CLOSE="close"

@dataclass
class Signal:
    timestamp: datetime; symbol: str; signal: SignalType
    strength: float          # 0..1, drives position sizing
    price: Decimal; reason: str; indicators: dict

class BaseStrategy(ABC):
    name: str; description: str
    required_bars: int            # min lookback
    default_params: dict
    def validate_data(self, df) -> bool: ...   # len(df) >= required_bars
    @abstractmethod
    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None: ...
```

Strategies are **pure functions of an OHLCV DataFrame — no I/O**. They return a
`Signal` or `None`. They never call the broker.

### 6.2 Single-symbol strategies + `registry.py`

Implement 13–14 strategies, each a `BaseStrategy` subclass. Register them in
`STRATEGY_REGISTRY` (keyed by `cls.name`). Provide `get_strategy(type, params)`
and `list_strategies()`.

| name | logic (one line) |
|------|------------------|
| `sma_crossover` | SMA20 vs SMA50 golden/death cross |
| `rsi_mean_reversion` | RSI<30 buy, RSI>70 sell |
| `atr_breakout` | break recent high ± N·ATR |
| `macd_crossover` | MACD vs signal line |
| `bollinger_squeeze` | squeeze then band breakout |
| `sector_rotation` | 63-day momentum threshold |
| `pairs_trade` | z-score reversion vs MA |
| `supertrend` | ATR-band trend flip |
| `donchian_breakout` | 20-high / 10-low Turtle |
| `momentum` | ROC + above 100-MA |
| `keltner_breakout` | EMA ± ATR band break |
| `low_volatility` | hold above 100-MA while vol calm |
| `multi_factor` | weighted momentum+trend+lowvol composite |

### 6.3 Cross-sectional strategies (`cross_sectional.py`)

These operate on the **whole basket**: implement
`target_weights(data: dict[symbol, DataFrame]) -> dict[symbol, float]` instead of
`generate_signal`. Register in `CROSS_SECTIONAL_REGISTRY` with
`get_xs_strategy` / `list_xs_strategies`. Examples: `xs_momentum`,
`xs_multifactor`, `xs_long_short` (dollar-neutral), `risk_parity`,
`xs_sharpe_momentum`, `xs_accel`, `xs_regime_momentum`, `xs_accel_sharpe`,
`xs_volmanaged`, `xs_adaptive_accel`, `xs_adaptive_defensive`.

The options/event/market-making engines define their own registries
(`OPTIONS_REGISTRY`, `EVENT_REGISTRY`, `MM_REGISTRY`) inside their service
modules.

---

## 7. Phase 3 — Backtesting engines

Six engines, each taking `(strategy_type, params, initial_capital,
commission_per_trade, slippage_bps)` and returning the same metrics shape:
`final_equity, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,
total_trades, equity_curve, trades`. Common execution model: signal on bar *i*,
**fill at bar i+1 open with slippage** (buys fill worse-high, sells worse-low).
Sharpe = mean/std daily return × √252; max DD from the running-peak equity curve.

| Engine (file) | Used for | Notes |
|---------------|----------|-------|
| `backtester.py` `BacktestEngine` | single-symbol regular | all-in/flat, 5% cash buffer, optional vol-targeting |
| `signal_portfolio_backtester.py` `SignalPortfolioEngine` | multi-symbol regular | shared cash pool, per-symbol BUY/SELL, `max_positions` cap |
| `portfolio_backtester.py` `PortfolioBacktestEngine` | cross-sectional | target weights, rebalance cadence, long-only or long/short |
| `options_backtester.py` `OptionsBacktestEngine` | options/vol | Black–Scholes priced; covered_call, cash_secured_put, short_straddle |
| `event_backtester.py` `EventBacktestEngine` | PEAD | trades earnings surprise drift |
| `mm_backtester.py` `MarketMakingEngine` | HFT research | Avellaneda–Stoikov, Poisson fills |

`optimizer.py` runs a **walk-forward grid search**: `expand_grid(param_grid)` →
Cartesian product → backtest every combo across symbols → rank by Sharpe → store
`best_params`/`best_sharpe` on the `optimizer_runs` row.

---

## 8. Phase 4 — Scheduler & background tasks

### 8.1 `app/tasks.py`

**Periodic jobs:**

| function | what it does |
|----------|--------------|
| `run_active_strategies()` | For each ACTIVE strategy (gated by `strategies_enabled` + market hours): load bars, `generate_signal`, route through `execute_order`. |
| `monitor_open_positions()` | Delegates to `position_monitor.monitor_positions` — stop-loss / take-profit / trailing-stop / max-hold; auto-close via `execute_order`. |
| `sync_open_orders()` | Poll broker for non-terminal orders, reconcile, emit WS updates. |
| `snapshot_account()` | Write an `account_snapshots` row; emit daily-loss alert if breached. |
| `check_price_alerts()` | Evaluate `price_alerts` vs snapshots, fire on trigger. |
| `fetch_market_data()` | Refresh 365d of daily bars for all active-strategy symbols. |
| `compute_strategy_pnl()` | Daily roll-up into `strategy_performance`. |

**On-demand dispatcher** — `dispatch(coro)`: `asyncio.create_task` held in a
strong-ref set (so the GC can't cancel it) with a done-callback that logs
failures. Used for backtests and optimizer runs.

**`run_backtest(backtest_id)` dispatcher** routes by `strategy_type`, checked in
this exact order:

1. in `CROSS_SECTIONAL_REGISTRY` → `PortfolioBacktestEngine`
2. in `OPTIONS_REGISTRY` → `OptionsBacktestEngine`
3. in `EVENT_REGISTRY` → `EventBacktestEngine`
4. in `MM_REGISTRY` → `MarketMakingEngine`
5. in `STRATEGY_REGISTRY` **and >1 symbol** → `SignalPortfolioEngine`
6. single-symbol regular → per-symbol `create_engine` (`backtester.py`)

CPU-heavy numpy/pandas simulation is pushed to a thread with
`asyncio.to_thread` so it doesn't block the event loop. On completion it persists
trades + equity curve and emits a `backtest_completed` WS event.

> When you add a new strategy *family*, add its registry membership **and** the
> matching branch in this dispatcher.

### 8.2 `app/scheduler.py`

`AsyncIOScheduler(timezone="UTC")` with job defaults
`coalesce=True, max_instances=1, misfire_grace_time=30`. `register_jobs()` adds
the seven jobs (intervals 60s/30s/30s/5m/60s + cron hourly@:05 + cron
21:30 UTC). `start()` is called from the FastAPI lifespan; `shutdown(wait=False)`
on exit.

---

## 9. Phase 5 — API & auth

### 9.1 `app/core/security.py`

JWT bearer auth. `hash_password`/`verify_password` (bcrypt),
`create_access_token(subject)` (HS256, `sub`/`exp`/`iat`), `decode_token` (raises
401), `get_current_user` dependency, `require_admin` dependency (checks DB
`users.role=="admin"`, **falls back** to the config admin so it works before any
DB user exists).

### 9.2 `app/core/schemas.py`

Pydantic request/response models for every resource: `TokenResponse`,
`AccountRead`, `OrderCreate`/`OrderRead`, `StrategyCreate`/`Read`/`Update`,
`BacktestCreate`/`Read`, `BacktestTradeRead`, `OptimizerCreate`, `ControlState`,
`KillSwitchRequest`, `HealthCheck`/`HealthOverview`, `WatchlistCreate`/`Read`/
`Update`, `PriceAlertCreate`/`Read`, `UserCreate`/`Read`, etc.

### 9.3 Routers (`app/api/*`, all mounted under `/api`)

| Router | Prefix | Highlights |
|--------|--------|-----------|
| `auth` | `/auth` | `POST /login` (OAuth2 form → JWT), `GET /me`. DB user first, then config admin. |
| `health` | `/health` | `GET /` (DB+Redis+broker, "ok"/"degraded"), `GET /live`. **No auth** (used as Render health check). |
| `account` | (root) | `GET /account`, `GET /positions` (live from broker). |
| `orders` | `/orders` | `POST /` (manual order → risk gate; **422** on rejection), list, get, `POST /{id}/sync`. |
| `strategies` | `/strategies` | `GET /available` (all registries), CRUD. New strategies start **PAUSED**; activating one auto-pauses the rest. |
| `backtests` | `/backtests` | `POST` (202, dispatched), list, get, `/{id}/trades`, delete. |
| `control` | `/control` | `GET /state`, `POST /kill`, `/resume`, `/strategies/pause|resume`, `/liquidate` (emergency). |
| `market` | `/market` | ~30 read endpoints: OHLCV, news+sentiment, screener, snapshots, profile, fundamentals, analysis, earnings (calendar+history), analysts, holders, dividends, splits, ESG, movers, most-actives, trades/quotes tape, crypto, options chain. Mostly **no auth**. |
| `analytics` | `/analytics` | equity-curve, portfolio-risk, strategy-pnl. Sub-routers: `/analytics/alerts` (list/ack), `/analytics/optimizer` (create 202/list/get), `/analytics/export/*.csv`. |
| `audit` | `/audit` | `GET /` list with optional action filter. |
| `realtime` | (root) | `WS /ws` (live push), `POST /webhooks/alpaca` (store + broadcast). |
| `watchlists` | `/watchlists` | CRUD + `/{id}/quotes`. Owner-scoped. |
| `price_alerts` | `/price-alerts` | create/list/delete. Owner-scoped. |
| `users` | `/users` | **admin-only** CRUD + role change. Cannot delete self. |

### 9.4 `app/main.py` — wiring it together

- `configure_logging()` at import.
- `lifespan`: log mode (loud `LIVE_TRADING_ENABLED` if live), `init_control_state()`
  (tolerate Redis failure), `scheduler_start()`; on shutdown close scheduler,
  broker, engine.
- `FastAPI(docs_url="/api/docs", redoc_url="/api/redoc",
  openapi_url="/api/openapi.json")`.
- CORS from `settings.cors_origin_list`.
- Global exception handler → JSON 500.
- Include every router with `prefix="/api"`.
- **Mount the SPA last** so it can't shadow `/api/*`: serve `/assets` statically,
  add a `GET /{full_path:path}` fallback that returns the literal file if it
  exists else `index.html`. If `frontend/dist` is absent (dev/CI), return a JSON
  identity response at `/` instead.

---

## 10. Phase 6 — Realtime (WebSocket)

`app/services/websocket.py`: a `ConnectionManager` holding a set of live
sockets behind an `asyncio.Lock`. `connect`/`disconnect`/`broadcast(type, data)`
(auto-drops dead sockets), plus an `emit(type, data)` helper. The `/ws` endpoint
accepts a connection, registers it, and loops reading client pings. Server code
emits events like `order_update`, `position_closed`, `alert`,
`price_alert_triggered`, `control_update`, `strategy_signal`,
`backtest_completed`. (Multi-worker would need Redis pub/sub here.)

---

## 11. Phase 7 — Frontend (React + Vite SPA)

### 11.1 Tooling

- `frontend/package.json` deps: `react`, `react-dom`, `react-router-dom@6`,
  `zustand`, `recharts`, `lightweight-charts`, `lucide-react`, `sonner`. Dev:
  `vite`, `@vitejs/plugin-react`, `tailwindcss@3`, `postcss`, `autoprefixer`.
- `vite.config.js`: dev server on **:3000**, proxy `/api` → `http://localhost:8000`,
  manual vendor chunks (react / recharts / lightweight-charts / lucide), no prod
  sourcemaps.
- `tailwind.config.js`: **all colors bound to CSS variables** (`--c-up`,
  `--c-down`, `--c-accent`, `--c-surf-0..5`, `--c-ink-1..5`, …) so theming is a
  data-attribute swap. Fonts: Inter (sans), JetBrains Mono (mono), Sora (display).
  `shimmer` animation for skeletons.
- `index.html`: inline script applies `data-theme` and `data-density` from
  `localStorage` **before paint** (no flash).

### 11.2 Bootstrap & routing

`main.jsx` wraps `<App/>` in `BrowserRouter` → `ThemeProvider` → `DensityProvider`
→ `SymbolProvider`, and initializes the WebSocket-backed store only if a token
exists. `App.jsx` lazy-loads every page (Login eager) under `<Suspense>` with a
shimmer fallback; private pages are wrapped in `RequireAuth` which redirects to
`/login?from=<path>`.

**Public pages:** Market (`/`, landing), Stocks, Screener, Heatmap, Movers,
Tape, Crypto, Analysis, Fundamentals, Options, Earnings, Dividends, Insiders,
Compare. **Private pages:** Workspace (main dashboard), Trade, Paper, Orders,
Positions, Watchlists, Strategies, Backtests + BacktestDetail + BacktestCompare,
Optimizer (+ detail), RiskAnalytics, Alerts, PriceAlerts, AuditLog, Settings,
Users. Redirect `/dashboard → /workspace`, `* → /`.

### 11.3 State & data

- `lib/api.js`: fetch wrapper with base `/api`, injects
  `Authorization: Bearer <sessionStorage quant_token>`, on 401 clears token and
  redirects to login. Exposes one method per backend endpoint, plus
  `connectWebSocket(onMessage)` (auto-reconnect 5s, 30s keepalive ping).
- `lib/store.js`: Zustand store holding `control, health, account, positions,
  orders, alerts, strategies, backtests, wsConnected`. Idempotent loaders that
  coalesce concurrent calls; a `_onWsMessage` router maps WS event types to
  targeted reloads; `initStoreWS` bootstraps everything once + a 30s safety
  refresh.
- Contexts: `ThemeContext` (dark/light, localStorage `quant_theme_v1`),
  `DensityContext` (cozy/compact/comfortable), `SymbolContext` (active ticker +
  recents).
- `lib/hotkeys.js` global hotkeys (chords like `g s`, input-aware),
  `lib/toast.js` (sonner wrapper), `lib/symbolDirectory.js` (bundled searchable
  ticker list), `lib/themeColors.js` (runtime chart colors).

### 11.4 Components

Layout shell (`Layout`, `TopBar`, `CommandPalette` ⌘K, `Ticker`, `WatchRail`,
`OrderSlideOver`, `StatusBar`, `ShortcutHelp`, `ErrorBoundary`) and a UI kit in
`components/ui/` (`primitives.jsx`: Card, Section, Stat, Pill/Badge, DataTable;
`charts.jsx`: MiniEquityCurve, MagBar, PnlCell; `ContextMenu`, `EmptyState`,
`format.js`).

`npm run build` outputs `frontend/dist`, which the backend serves in production.

---

## 12. Phase 8 — Deployment

### 12.1 Dockerfile (2-stage)

1. **`node:20-alpine`** — `npm ci` then `npm run build` → `frontend/dist`.
2. **`python:3.12-slim`** — install build deps + `libpq-dev`, `pip install -r
   requirements.txt`, copy `app/ alembic/ alembic.ini scripts/` and the built
   `frontend/dist`. Entrypoint:
   `sh -c "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"`.

### 12.2 `render.yaml` blueprint

One `web` service (Docker, free plan, `healthCheckPath: /api/health`,
`autoDeploy: true` from `main`) + one managed Postgres 16 (`lodestar-db`).
`SECRET_KEY` via `generateValue`; `DATABASE_URL`/`DATABASE_URL_SYNC` from the DB;
`REDIS_URL`, `CORS_ORIGINS`, Alpaca keys, `ADMIN_*` set as dashboard secrets
(`sync: false`). Ship with `ALPACA_BASE_URL` = paper, `ALPACA_LIVE_CONFIRMED`,
`TRADING_ENABLED`, `STRATEGIES_ENABLED` all `"false"` and flip them on after a
clean first deploy.

**Free-tier caveat:** the web instance sleeps after 15 min idle and the
in-process scheduler sleeps with it. Keep it warm during market hours with an
external pinger (cron-job.org / UptimeRobot) hitting `/api/health` every ~10 min.

### 12.3 First-run

```bash
alembic upgrade head            # entrypoint already does this
python scripts/seed_strategies.py   # 3 default PAUSED strategies (optional)
```

---

## 13. Data model reference (column-level)

See `app/core/models.py` for the canonical definition. Key tables:

**orders** — `id, client_order_id(uniq), broker_order_id(uniq?), strategy_id?,
mode(TradingMode), symbol, side(OrderSide), order_type(OrderType), qty,
limit_price?, filled_qty, avg_fill_price?, status(OrderStatus, default
pending_risk), time_in_force, risk_check(JSON), reason?, submitted_at, filled_at?,
canceled_at?`

**positions** — `id, symbol(uniq), qty, avg_entry_price, current_price?,
unrealized_pl?, realized_pl, opened_at, updated_at, strategy_id?,
stop_loss_price?, take_profit_price?, highest_price?`

**strategies** — `id, name(uniq), strategy_type, status(default PAUSED),
symbols(JSON), params(JSON), position_size_pct, schedule_cron, stop_loss_pct?,
take_profit_pct?, trailing_stop_pct?, max_hold_days?, timeframe, created/updated`

**backtests** — `id, name, strategy_type, symbols(JSON), params(JSON),
start_date, end_date, initial_capital, status, final_equity?,
total_return_pct?, sharpe_ratio?, max_drawdown_pct?, win_rate_pct?,
total_trades, equity_curve(JSON), error?, created_at, completed_at?`

**ohlcv** — PK `(time, symbol, timeframe)`, `open/high/low/close/volume` Numeric.

(Plus `strategy_runs`, `strategy_performance`, `backtest_trades`,
`optimizer_runs`, `audit_log`, `account_snapshots`, `alerts`, `webhook_events`,
`watchlists`, `price_alerts`, `users` — all detailed in §5.2.)

---

## 14. Safety model (do not weaken)

1. **Paper by default.** `is_live_trading` is True only when the Alpaca URL is
   non-paper **and** `ALPACA_LIVE_CONFIRMED=true`. Two independent flags.
2. **Risk gate applies to paper and live.** All 8 checks, always.
3. **Kill switch is Redis-backed** and checked first in the gate, so it survives
   restarts; `/control/liquidate` cancels orders and closes positions.
4. **Strategies start PAUSED** and a global `strategies_enabled` flag gates all
   ticks.
5. **Everything sensitive is audited** to `audit_log`.

---

## 15. Recommended build order (checklist)

1. ☐ Repo skeleton, `requirements.txt`, `.env.example`, `config.py`, `logging.py`.
2. ☐ `db.py` + `models.py` + Alembic `env.py` + `0001` migration → `alembic upgrade head` succeeds.
3. ☐ `broker.py` (paper keys) → `get_account()` returns from a script.
4. ☐ `control.py` (Redis) + `audit.py` + `alerts.py`.
5. ☐ `risk.py` (8 checks) + `execution.py` → `execute_order` submits a paper order.
6. ☐ `market_data.py` + `market_calendar.py` → bars land in `ohlcv`.
7. ☐ `strategies/base.py` + `registry.py` + a couple of strategies.
8. ☐ `backtester.py` + `tasks.run_backtest` (single-symbol path) end-to-end.
9. ☐ Remaining engines + `cross_sectional.py` + `optimizer.py`.
10. ☐ `scheduler.py` + remaining periodic tasks.
11. ☐ `security.py` + `schemas.py` + all routers + `main.py` → `/api/docs` loads.
12. ☐ `websocket.py` + `/ws` + webhook receiver.
13. ☐ Frontend: Vite/Tailwind config, api/store/contexts, Login + Workspace, then the rest of the pages.
14. ☐ Dockerfile (2-stage) → container runs `alembic upgrade head && uvicorn`.
15. ☐ `render.yaml` → deploy; set secrets; keep `TRADING_ENABLED=false` until verified.

---

## 16. Where the bodies are buried (gotchas)

- **Enum `values_callable` + `create_type=False`** on every enum column, or
  asyncpg inserts break and migrations fight over the PG type.
- **Two DB URLs** (asyncpg vs psycopg2) and the **coercion validators** — Render
  hands you `postgres://...`; both must be normalized.
- **SPA mount is last**; `/assets` served statically, everything else falls back
  to `index.html`.
- **Scheduler is single-instance**; on Render free tier it sleeps with the web
  dyno — use an external pinger during market hours.
- **WebSocket manager is per-process**; multi-worker needs Redis pub/sub.
- **fundamentals/earnings rely on yfinance** (Yahoo). From datacenter IPs Yahoo
  may rate-limit/block, returning empty payloads — cache with a predicate that
  refuses to cache empty results so it self-heals, and log the failure count.
- **Some comments still reference Celery** — the project migrated from Celery
  beat+worker to in-process APScheduler; those comments are historical.
```
