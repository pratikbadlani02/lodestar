# Lodestar

Autonomous quantitative trading platform. Local by default, deployable to Render.
Paper trading by default — live trading requires explicit confirmation.

## ⚠️ Important Disclaimers

**Read this before doing anything.**

- This platform trades **real money** if you enable live mode. You can lose all of it.
- The three included strategies (SMA crossover, RSI mean reversion, ATR breakout) are **classical, documented strategies**. They are NOT guaranteed to make money. Most systematic strategies underperform buy-and-hold over long periods.
- **Always backtest before enabling any strategy for live trading.**
- Start in paper mode. Run for weeks. Only consider live with capital you can afford to lose entirely.
- The author provides this as educational software and is not responsible for trading losses.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Nginx (localhost:8080)                         │
│   serves React dashboard + proxies /api/ to FastAPI               │
└───────────────┬─────────────────────────────┬────────────────────┘
                │                             │
         ┌──────▼──────┐              ┌───────▼────────┐
         │  React SPA  │              │   FastAPI      │
         │  dashboard  │              │  (uvicorn)     │
         └─────────────┘              └────┬───────────┘
                                           │
              ┌────────────────────────────┼──────────────────────┐
              │                            │                      │
     ┌────────▼─────────┐       ┌──────────▼──────┐     ┌─────────▼────────┐
     │  PostgreSQL 16   │       │  Redis 7        │     │  Alpaca API      │
     │  + TimescaleDB   │       │  (broker +      │     │  (paper or live) │
     │                  │       │   kill switch)  │     │                  │
     └──────────────────┘       └──────┬──────────┘     └──────────────────┘
                                       │
                                 ┌─────▼──────────┐
                                 │  Celery Worker │
                                 │  + Beat        │
                                 │  (strategies,  │
                                 │   backtests)   │
                                 └────────────────┘
```

All components run as **native macOS processes** managed by **launchd** — auto-start on boot, auto-restart on crash.

## Quick Start

### 1. Prerequisites

- macOS 13+ (Apple Silicon or Intel)
- Alpaca account: [sign up free](https://app.alpaca.markets) — **paper trading is free**

### 2. Unzip and configure

```bash
cd ~
unzip quant-platform.zip
cd quant-platform
cp .env.example .env
```

Edit `.env`:
- Set `ADMIN_PASSWORD` to something secure
- Generate `SECRET_KEY` with `openssl rand -hex 32`
- Add `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` from Alpaca dashboard
- Leave `ALPACA_BASE_URL=https://paper-api.alpaca.markets` for now
- Leave `ALPACA_LIVE_CONFIRMED=false` for now

### 3. Run the installer

```bash
chmod +x setup_mac.sh manage.sh
./setup_mac.sh
```

This will:
1. Install Homebrew (if missing)
2. Install PostgreSQL 16, TimescaleDB, Redis, Nginx, Python 3.12, Node.js
3. Create database + user, enable TimescaleDB extension
4. Create Python virtualenv and install dependencies
5. Run Alembic migrations (creates all 10 tables)
6. Build the React dashboard
7. Install launchd agents (auto-start on boot)
8. Configure and start Nginx
9. Seed 3 default strategies (in PAUSED state)

Takes ~5–10 minutes on first run.

### 4. Open the dashboard

```
http://localhost:8080
```

Log in with the credentials from your `.env` file.

## Daily Operations

```bash
./manage.sh status              # show service status
./manage.sh health              # API health check
./manage.sh logs api            # tail API logs
./manage.sh logs worker         # tail Celery logs
./manage.sh logs errors         # tail all error logs
./manage.sh restart             # restart all services
./manage.sh dashboard           # open in browser

./manage.sh kill "reason"       # activate kill switch
./manage.sh liquidate "reason"  # EMERGENCY close all
```

## Safety Model

### Paper vs Live

Live trading requires BOTH:
1. `ALPACA_BASE_URL=https://api.alpaca.markets` (not paper)
2. `ALPACA_LIVE_CONFIRMED=true`

If either is missing, the platform stays in paper mode.

### Risk gate (every order)

Every order — whether from a strategy or manual — passes through 8 checks:

1. **Global kill switch** (Redis-backed, survives restarts)
2. **Rate limit** (default 10 orders/minute)
3. **Broker availability** (account endpoint reachable)
4. **Market hours** (only for buy orders)
5. **Daily loss limit** (default 2%)
6. **Max open positions** (default 10)
7. **Position size limit** (default 10% of equity)
8. **Buying power** (sufficient cash)

Any failure → order stored with `status=risk_rejected`, logged to audit.

### Strategy safeguards

- All strategies **created in paused state**
- Global `strategies_enabled` flag (pause all with one click)
- Each strategy has its own `position_size_pct` cap
- Strategies never call the broker directly — they generate signals that go through execution → risk → broker

### Kill switch

Activate via dashboard (Settings page) or CLI (`./manage.sh kill "reason"`):
- Persists in Redis (survives restarts)
- Blocks all order submission
- Does NOT close positions — use **Liquidate** for that

### Audit log

Every sensitive action is recorded (strategy change, order submit/reject, kill switch, liquidate, login). Immutable record in `audit_log` table.

## Strategy Reference

### SMA Crossover
Golden/death cross on simple moving averages.
**Default params**: short=20, long=50
**Best on**: trending, liquid large-caps

### RSI Mean Reversion
Buys exit-from-oversold, sells exit-from-overbought.
**Default params**: rsi_period=14, oversold=30, overbought=70
**Best on**: range-bound liquid ETFs
**Dangerous in**: strong trends

### ATR Breakout
Buys upside breakouts above rolling high + N×ATR.
**Default params**: atr_period=14, lookback=20, atr_multiplier=1.5
**Best on**: momentum stocks
**Dangerous in**: whipsaw/choppy markets

## Going Live (Read Carefully)

**Do NOT skip any step.**

1. ✅ Run in paper mode for at least 2 weeks. Confirm strategies behave as you expect.
2. ✅ Run backtests on 2+ years of data for each strategy. Sharpe > 0.5, max DD < 20% are rough minimums.
3. ✅ Review every risk limit in `.env` — are they aggressive enough for YOUR risk tolerance?
4. ✅ Set `MAX_POSITION_SIZE_PCT` to something small (e.g. 2%) for your first live run.
5. ✅ Fund Alpaca live account with ONLY money you can lose 100% of.
6. ✅ Change `ALPACA_BASE_URL` to `https://api.alpaca.markets` in `.env`
7. ✅ Set `ALPACA_LIVE_CONFIRMED=true`
8. ✅ Restart: `./manage.sh restart`
9. ✅ Watch logs like a hawk for the first week: `./manage.sh logs all`

## API Docs

Interactive Swagger UI: `http://localhost:8080/api/docs`

## Troubleshooting

**Services won't start after reboot**
```bash
./manage.sh status
launchctl list | grep com.quant
```
If missing, re-run `./setup_mac.sh`.

**Dashboard shows 502**
```bash
./manage.sh logs api        # check if API is running
brew services list           # check if Nginx is running
```

**Strategy not producing signals**
- Check it has status=`active` (not paused)
- Check `./manage.sh logs worker` for errors
- Ensure OHLCV data exists: `POST /api/market/fetch/SPY`

**"Insufficient buying power" rejections**
- Alpaca paper account starts with $100k but margin is complex
- Check `MAX_POSITION_SIZE_PCT` in `.env` isn't too low

## Development

```bash
cd frontend
npm run dev          # React dev server on :3000 (proxies /api to :8000)
```

```bash
source venv/bin/activate
uvicorn app.main:app --reload    # API on :8000 with hot reload
celery -A app.worker worker --loglevel=debug
celery -A app.worker beat --loglevel=debug
```

## Uninstall

```bash
./manage.sh stop
rm -rf ~/Library/LaunchAgents/com.quant.*.plist
brew services stop postgresql@17 redis nginx
rm -rf ~/quant-platform
```

## License

Educational software. Use at your own risk. No warranty.
