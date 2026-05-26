# Lodestar — Session Context

## What this repo is now

**Public market-data viewer.** No login, no trading. The product was
pivoted in v3.0.0 from a single-tenant quant trading platform to a
read-only market browser, because the original would have exposed the
operator's Alpaca brokerage to anyone with the URL.

Surviving feature set:

- Market overview (`/`), Stocks, Screener, Heatmap, Movers, Tape, Crypto
- Per-symbol research: Analysis, Fundamentals, Options, Earnings,
  Dividends, Insiders, Compare

Hard-deleted in v3.0.0:

- All auth (login, JWT, admin user, rate limiter, disclaimer modal)
- Strategies / backtests / optimizer
- Trade / Paper / Orders / Positions / Watchlists / Price Alerts
- Risk Analytics / Alerts / Audit Log / Settings / Users
- Celery worker + beat, `app/scheduler.py`, `app/tasks.py`,
  `app/worker.py`
- Backend modules: `app/api/{auth,account,audit,backtests,control,orders,strategies,price_alerts,users,watchlists,realtime,analytics}.py`
  and `app/services/{alerts,audit,backtester,control,execution,optimizer,position_monitor,risk,risk_analytics,websocket}.py`
  plus the entire `app/strategies/` package and `app/core/security.py`
- Frontend pages: Login, Workspace, Trade, Paper, Orders, Positions,
  Watchlists, Strategies, Backtests*, Optimizer, RiskAnalytics, Alerts,
  PriceAlerts, AuditLog, Settings, Users
- Frontend components: `OrderSlideOver`, `DisclaimerGate`, `WatchRail`,
  `lib/store.js`
- Launchd plists: `com.quant.worker.plist`, `com.quant.beat.plist`

## Tech stack today

| Layer    | What                                              |
|----------|--------------------------------------------------|
| Frontend | React + Vite, served as static files from FastAPI |
| API      | FastAPI (uvicorn), only `health` + `market` routers |
| DB       | Postgres (cache for OHLCV bars)                  |
| Cache    | Optional Upstash Redis (fundamentals JSON cache) |
| Data     | Alpaca market-data + yfinance                    |
| Deploy   | Single Render web service (free tier) + Render free Postgres |

There is no background process. No Celery, no APScheduler. Everything
runs in the uvicorn event loop.

## How to develop locally

`./manage.sh start` boots only `com.quant.api`. The previous worker/beat
launchd services are gone. Run `./manage.sh logs api` to follow the log
stream. Frontend dev: `cd frontend && npm run dev`.

## Important files

- `app/main.py` — FastAPI entrypoint, security-headers middleware, CORS
  (locked to GET), static-frontend mount.
- `app/api/market.py` — all the public market-data endpoints
- `app/api/health.py` — `/api/health` (DB + Alpaca clock probe)
- `app/services/broker.py` — thin httpx wrapper around Alpaca's HTTP API
- `app/services/market_data.py`, `fundamentals.py`, `stock_analysis.py`,
  `market_calendar.py` — the data services
- `app/core/redis_client.py` — Redis singleton used by `fundamentals.py`
- `app/core/config.py` — slim settings, no auth/risk/trading flags
- `frontend/src/App.jsx` — flat routes, no `RequireAuth`
- `frontend/src/components/Layout.jsx` — public-only sidebar (Markets +
  Research)

## Environment variables

Required: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `DATABASE_URL`
Optional: `REDIS_URL`, `CORS_ORIGINS`, `SENTRY_DSN`, `APP_ENV`

No `ADMIN_*`, `SECRET_KEY`, `TRADING_ENABLED`, `STRATEGIES_ENABLED`,
`ALPACA_LIVE_CONFIRMED`, or risk-limit envs — all gone.

## Deploy

See `DEPLOY.md`. Single Render web service + free Postgres. No paid
background workers needed.

## What is still in the repo but unused

- `app/core/models.py` — most of the SQLAlchemy models still exist
  (`Strategy`, `Backtest`, `Order`, etc.). They aren't imported by any
  surviving code, but the Alembic migrations still create their tables.
  Cleaning these out is a follow-up: a new migration that drops the
  tables, then trim `models.py`.
- `alembic/versions/0001_*.py`, `0002_*.py` — initial schemas that
  include the trading tables. Left alone for now.
- `tests/` — likely covers removed features; tests will need an audit.

## Known issues / next steps

- The `app/core/models.py` cleanup mentioned above.
- `tests/` directory hasn't been audited against the new shape.
- The `CommandPalette` and various pages still import lucide-react icons
  they no longer use; harmless but visual cruft.
- `nginx/quant.conf` still proxies `/api/ws` for a WebSocket that no
  longer exists — the block is dead-but-not-broken; remove on next pass.
