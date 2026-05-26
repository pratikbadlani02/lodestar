# Lodestar

A public market-data viewer. Charts, screener, fundamentals, options chains,
earnings, dividends, heatmaps, movers — read-only, no login. Built on
FastAPI + React, deployable to a free Render web service.

## What it is

- **Public:** anyone with the URL can browse market data. No auth.
- **Read-only:** no trading, no orders, no positions, no account. Trading
  features were removed in v3.0.0; the previous quant-trading platform is
  preserved in git history.
- **Source-of-data:** Alpaca's market-data API for snapshots / OHLCV;
  yfinance for fundamentals / earnings / options / dividends.

## ⚠️ Disclaimer

- Data may be delayed, incomplete, or inaccurate.
- Nothing here is financial advice.

## Local development

```bash
# one-time setup
./setup_mac.sh

# start services
./manage.sh start
```

Then open http://localhost:8080. There is no login.

`./manage.sh status` shows running services. `./manage.sh logs api` tails
the FastAPI log (which now includes everything — there is no separate
Celery worker / beat process anymore).

## Deploy

See [DEPLOY.md](DEPLOY.md) for the Render walkthrough.

## Architecture

```
┌──────────────────────────────────────────────┐
│ Single Docker container                       │
│                                              │
│   uvicorn ── FastAPI (/api/* + static SPA)   │
│       ├── /api/health                        │
│       └── /api/market/* (Alpaca + yfinance)  │
│                                              │
│   PostgreSQL ──── OHLCV bar cache            │
│   Redis (opt) ─── fundamentals JSON cache    │
└──────────────────────────────────────────────┘
```

## What was removed in v3.0.0

The repo previously housed a single-tenant quant trading platform with
strategies, backtests, optimizer, paper/live order execution, account
risk monitoring, audit log, etc. Releasing that publicly would have
exposed the operator's Alpaca brokerage account to anyone with the URL,
so the pivot in v3.0.0 was:

- All trading routes and pages deleted.
- Celery worker + beat replaced by nothing (no scheduled jobs left).
- Auth, admin user, JWT, rate limiter — gone.
- Sidebar reduced to Markets + Research groups.
- Disclaimer modal and login removed.

Files still live in git history if you want the old behavior back.
