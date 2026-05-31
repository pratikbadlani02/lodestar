# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lodestar is an autonomous quantitative trading platform. A FastAPI backend executes
trading strategies against the Alpaca brokerage (paper by default, live behind a
two-flag gate), persists everything to PostgreSQL, and serves a React SPA dashboard.
Periodic work (strategy ticks, position monitoring, order sync) runs on an in-process
APScheduler inside the FastAPI event loop — there is no separate worker process.

## Commands

Backend (Python 3.12, FastAPI):
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload          # API + scheduler on :8000, hot reload
alembic upgrade head                   # apply DB migrations (needs DATABASE_URL reachable)
alembic revision -m "description"      # create a new migration
python scripts/seed_strategies.py      # seed the 3 default strategies (PAUSED)
```

Frontend (React + Vite, in `frontend/`):
```bash
cd frontend
npm install
npm run dev        # dev server on :3000, proxies /api → :8000
npm run build      # outputs frontend/dist (served by FastAPI in prod)
```
`app/main.py` mounts `frontend/dist` as static files with an SPA fallback. If `dist`
doesn't exist (dev/CI), the root path returns a JSON identity response instead.

There is **no automated test suite** — `tests/` contains only an empty `__init__.py`,
and there is no pytest/CI config. Verify changes by running the API and exercising
`/api/docs`. Operational actions (kill switch, liquidate, health) are API endpoints
under `/api/control` and `/api/health`.

## Core trading flow

Strategies never touch the broker. The path is strictly:

```
Strategy.generate_signal()  →  execute_order()  →  risk_manager.check_order()  →  AlpacaBroker
   (app/strategies/*)         (services/execution)    (services/risk)            (services/broker)
```

- **`app/strategies/`** — each strategy subclasses `BaseStrategy` (`base.py`), declares
  `name`, `required_bars`, `default_params`, and implements `generate_signal(symbol, df)`
  returning a `Signal` (BUY/SELL/HOLD/CLOSE) or `None`. Strategies are pure functions of
  an OHLCV DataFrame — no I/O. Register new ones in `app/strategies/registry.py`
  (`STRATEGY_REGISTRY`, keyed by `cls.name`); that's all the API and scheduler need to
  pick them up.
- **`services/execution.py`** — `execute_order()` persists the order as `pending_risk`,
  runs the risk gate, and only submits to the broker if approved. Rejected orders are
  stored with `status=risk_rejected` and audited; nothing is silently dropped.
- **`services/risk.py`** — `RiskManager.check_order()` enforces 8 hard checks in order:
  kill switch → rate limit → broker reachable → market hours (buys) → daily loss limit →
  max open positions → position size % → buying power. All limits come from
  `app/core/config.py` and apply to **both paper and live**.
- **`services/broker.py`** — `AlpacaBroker`, a thin async `httpx` wrapper over Alpaca's
  REST API (raw HTTP, not `alpaca-py`, to avoid sync/async mismatch). Singleton via
  `get_broker()`. Only the execution/risk layers call it.

## Scheduler & background work (`app/scheduler.py`, `app/tasks.py`)

The project once used Celery (beat + worker); it now uses an in-process APScheduler that
runs inside the FastAPI event loop (`lifespan` in `app/main.py`), sharing the DB pool,
broker HTTP client, and Redis connection with the request path. Some code comments still
reference the old Celery setup for context — they are historical, not current behavior.

Periodic jobs registered in `scheduler.py` (`coalesce=True`, `max_instances=1`):
`run_active_strategies` (60s), `monitor_open_positions` (30s, stop-loss/take-profit),
`sync_open_orders` (30s), `snapshot_account` (5min), `check_price_alerts` (60s),
`fetch_market_data` (hourly), `compute_strategy_pnl` (daily 21:30 UTC).

On-demand long tasks (backtests, optimizer) are fired via `tasks.dispatch(coro)` —
`asyncio.create_task` with a strong-ref set so the GC can't cancel them. CPU-heavy
numpy/pandas simulation is pushed to a thread with `asyncio.to_thread` so it doesn't
block the loop.

**Scheduler is single-instance only.** Horizontal scaling would require a Redis leader
lock. On Render's free tier the web service sleeps when idle and the scheduler stops with
it (see `DEPLOY.md` for the keep-alive pinger).

## Backtesting (`run_backtest` in `app/tasks.py`)

`run_backtest` is a dispatcher that routes a backtest to one of several engines based on
`strategy_type`, checked in this order:
1. **Cross-sectional / portfolio** (`strategies/cross_sectional.py`,
   `CROSS_SECTIONAL_REGISTRY` — `xs_momentum`, `xs_multifactor`, `xs_long_short`,
   `risk_parity`, …) → `PortfolioBacktestEngine`, ranks a basket and rotates capital.
2. **Options / volatility** (`services/options_backtester.py`, `OPTIONS_REGISTRY`) →
   `OptionsBacktestEngine` (Black-Scholes priced).
3. **Event-driven / PEAD** (`services/event_backtester.py`, `EVENT_REGISTRY`) →
   `EventBacktestEngine` (uses earnings surprises from `services/fundamentals.py`).
4. **Market-making** (`services/mm_backtester.py`, `MM_REGISTRY`) → `MarketMakingEngine`
   (HFT research sim).
5. **Multi-symbol regular strategies** → `SignalPortfolioEngine` (one shared cash pool).
6. **Single-symbol regular strategies** → per-symbol `create_engine`
   (`services/backtester.py`).

When adding a new strategy family, add its registry membership and the matching branch here.

## Data & persistence

- **ORM models**: `app/core/models.py` (all tables in one file). Enum columns use
  `values_callable=lambda x: [e.value for e in x]` so asyncpg sends enum **values**
  (`"pending"`) not names (`"PENDING"`) — keep this on any new `Enum` column or inserts
  break. Enums also use `create_type=False` (migrations own the PG type).
- **Migrations**: `alembic/versions/` (`0001` … `0004`). Schema changes go through
  Alembic, never `create_all`. `alembic/env.py` reads `DATABASE_URL` from env.
- **DB access**: async SQLAlchemy 2.0. Use `AsyncSessionLocal()` from `app/core/db.py`.
  Two URLs in config: `database_url` (asyncpg, app) and `database_url_sync` (psycopg2,
  Alembic); validators coerce Render/Heroku `postgres://` URLs to the right dialect.
- **Market data**: OHLCV bars are cached in the `ohlcv` table; `services/market_data.py`
  fetches/stores from Alpaca (`fetch_and_store_bars`) and returns DataFrames
  (`get_bars_df`).

## Safety model

- **Paper vs live** — `settings.is_live_trading` is true only when BOTH `ALPACA_BASE_URL`
  is a non-paper URL AND `ALPACA_LIVE_CONFIRMED=true`. Default is paper; never weaken this.
- **Kill switch** — Redis-backed (survives restarts), checked first in the risk gate.
  Toggle via the `/api/control` endpoints. `emergency_liquidate_all` (execution.py)
  cancels all orders and closes all positions.
- **Strategies are created PAUSED**; a global `strategies_enabled` flag gates all ticks.
- **Audit log** — every sensitive action (order submit/reject, kill switch, liquidate,
  login) is written to `audit_log` via `services/audit.py`.

## API & frontend layout

- **API routers** live in `app/api/` and are all mounted under `/api` in `app/main.py`
  (auth, strategies, orders, account, backtests, control, market, analytics, alerts,
  optimizer, export, realtime/WebSocket, watchlists, price_alerts, users, health, audit).
  Swagger at `/api/docs`. The SPA static mount is added LAST so it can't shadow `/api/*`.
- **Auth** — JWT bearer (`app/core/security.py`). Login (`api/auth.py`) checks the DB
  `users` table first, then falls back to the config-based admin
  (`ADMIN_USERNAME`/`ADMIN_PASSWORD`); the config admin is always role `admin`.
- **Frontend** — React + Vite + Tailwind + Zustand. Pages in `frontend/src/pages/`,
  shared API client in `frontend/src/lib/api.js`.

## Configuration

All settings are in `app/core/config.py` (pydantic-settings, loaded from `.env`; copy
`.env.example`). Risk limits, Alpaca keys, DB/Redis URLs, and the live-trading flags all
live there. `secret_key` only warns (doesn't fail) if left at the default — generate one
with `openssl rand -hex 32`.

## Deployment

Single Docker container (`Dockerfile`): stage 1 builds the frontend, stage 2 is the
Python runtime whose entrypoint runs `alembic upgrade head && uvicorn app.main:app`.
Render blueprint in `render.yaml` (web service + managed Postgres, `autoDeploy` from
`main`); full walkthrough in `DEPLOY.md`. Redis is external (e.g. Upstash) for control
state + WebSocket pub/sub.
