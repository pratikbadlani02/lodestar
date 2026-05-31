# Lodestar

Autonomous quantitative trading platform. Runs as a single containerized service and
deploys to the cloud (Render blueprint included). Paper trading by default — live trading
requires explicit, deliberate confirmation.

## ⚠️ Important Disclaimers

**Read this before doing anything.**

- This platform trades **real money** if you enable live mode. You can lose all of it.
- The bundled strategies (SMA crossover, RSI mean reversion, ATR breakout, and others)
  are **classical, documented strategies**. They are NOT guaranteed to make money. Most
  systematic strategies underperform buy-and-hold over long periods.
- **Always backtest before enabling any strategy for live trading.**
- Start in paper mode. Run for weeks. Only consider live with capital you can afford to
  lose entirely.
- This is educational software provided without warranty. You are responsible for any
  trading losses.

## Architecture

A single service runs everything:

- **FastAPI** (uvicorn) — REST API + WebSocket, serves the built React dashboard as
  static files.
- **React SPA** — dashboard (built to `frontend/dist`, served by FastAPI in production).
- **APScheduler** — periodic jobs (strategy execution, position monitoring, order sync,
  account snapshots, market-data refresh, daily P&L, price alerts) run **in-process**,
  inside the FastAPI event loop. No separate worker process.
- **PostgreSQL** — all persistence (strategies, orders, positions, backtests, audit log).
- **Redis** — kill-switch / control state and WebSocket pub/sub.
- **Alpaca** — brokerage (paper or live) and market data.

On-demand long-running work (backtests, optimizer runs) is dispatched as asyncio
background tasks; CPU-heavy compute is pushed to a thread pool.

## Quick Start (local)

Prerequisites: Python 3.12, Node 20, a reachable PostgreSQL and Redis, and an Alpaca
account ([paper trading is free](https://app.alpaca.markets)).

```bash
cp .env.example .env          # then edit: SECRET_KEY, ADMIN_PASSWORD, ALPACA_* keys, DATABASE_URL, REDIS_URL
pip install -r requirements.txt
alembic upgrade head          # create all tables
python scripts/seed_strategies.py   # optional: seed 3 default strategies (PAUSED)

# build the dashboard (or run the Vite dev server separately, see below)
cd frontend && npm install && npm run build && cd ..

uvicorn app.main:app --reload # API + scheduler on http://localhost:8000
```

Open `http://localhost:8000` and log in with the credentials from your `.env`.
Interactive API docs: `http://localhost:8000/api/docs`.

### Frontend dev server

```bash
cd frontend
npm run dev        # http://localhost:3000, proxies /api → :8000
```

### Docker

```bash
docker build -t lodestar .
docker run -p 8000:8000 --env-file .env lodestar
```
The container entrypoint runs `alembic upgrade head` then starts uvicorn.

## Cloud Deployment

A Render blueprint is included (`render.yaml`): a Docker web service plus a managed
Postgres, with `autoDeploy` from `main`. Redis is external (e.g. Upstash). See
[`DEPLOY.md`](./DEPLOY.md) for the full walkthrough, including the free-tier sleep caveat
and keep-alive pinger.

## Safety Model

### Paper vs Live

Live trading requires BOTH:
1. `ALPACA_BASE_URL=https://api.alpaca.markets` (not the paper URL)
2. `ALPACA_LIVE_CONFIRMED=true`

If either is missing, the platform stays in paper mode.

### Risk gate (every order)

Every order — strategy-generated or manual — passes through 8 checks before reaching the
broker: global kill switch → rate limit → broker availability → market hours (buys) →
daily loss limit → max open positions → position size limit → buying power. Any failure
stores the order with `status=risk_rejected` and logs it to the audit trail.

### Strategy safeguards

- All strategies are **created paused**.
- A global `strategies_enabled` flag pauses all strategy execution at once.
- Each strategy has its own `position_size_pct` cap.
- Strategies never call the broker directly — they emit signals that flow through
  execution → risk → broker.

### Kill switch & liquidate

- **Kill switch** (`/api/control` endpoints): Redis-backed, survives restarts, blocks all
  order submission. Does NOT close positions.
- **Liquidate**: cancels all orders and closes all positions (emergency action).

### Audit log

Every sensitive action (strategy change, order submit/reject, kill switch, liquidate,
login) is recorded immutably in the `audit_log` table.

## Strategies

Strategies live in `app/strategies/` and are registered in
`app/strategies/registry.py`. Each subclasses `BaseStrategy`, declares its `name`,
`required_bars`, and `default_params`, and implements `generate_signal(symbol, df)` over
an OHLCV DataFrame. Backtests additionally support cross-sectional/portfolio, options,
event-driven, and market-making engines (see `CLAUDE.md` for the routing).

## Going Live (read carefully)

**Do NOT skip any step.**

1. Run in paper mode for at least 2 weeks and confirm strategies behave as expected.
2. Backtest each strategy on 2+ years of data (rough minimums: Sharpe > 0.5, max DD < 20%).
3. Review every risk limit in `.env` for your own risk tolerance.
4. Set `MAX_POSITION_SIZE_PCT` small (e.g. 2%) for your first live run.
5. Fund the Alpaca live account with ONLY money you can lose 100% of.
6. Set `ALPACA_BASE_URL=https://api.alpaca.markets` and `ALPACA_LIVE_CONFIRMED=true`.
7. Redeploy / restart and watch the logs closely for the first week.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — codebase architecture and conventions.
- [`DEPLOY.md`](./DEPLOY.md) — cloud deployment walkthrough.
- `docs/` — supplementary notes.

## License

Educational software. Use at your own risk. No warranty.
