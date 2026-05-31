# Deploying Lodestar to Render

This walks you through getting Lodestar live on the public internet
behind a Render-provided subdomain (e.g. `lodestar-api.onrender.com`).

> ⚠️ This is a brokerage-integrated platform. Anyone who logs in can place
> trades on your linked Alpaca account. Use a **strong** `ADMIN_PASSWORD`,
> keep `ALPACA_BASE_URL` on paper, and leave `TRADING_ENABLED=false` until
> you've verified the deployment end-to-end.

---

## Architecture

Single Docker container runs everything:

- FastAPI HTTP server (uvicorn)
- React frontend served as static files from `frontend/dist`
- **APScheduler** running inside the FastAPI event loop — replaces the old
  Celery beat + worker. All periodic tasks (strategy execution every 60s,
  position monitoring every 30s, order sync every 30s, account snapshots,
  market-data refresh, daily P&L, price alerts) are scheduled in-process.
- On-demand long tasks (backtests, optimizer runs) are dispatched as
  asyncio background tasks; CPU-heavy compute is pushed to a thread pool.

| Component        | Service type           | Plan      | Notes                                 |
|------------------|------------------------|-----------|---------------------------------------|
| API + frontend + scheduler | Web Service (Docker) | Free | Sleeps after 15 min idle (see below)  |
| Postgres         | Managed Database       | Free      | 1 GB, **expires after 90 days**       |
| Redis            | External (Upstash)     | Free      | Cache + WebSocket pub/sub only        |

---

## Free-tier sleep caveat

Render's free web service hibernates after 15 minutes with no traffic.
**While asleep, the in-process scheduler does not run** — strategies don't
tick, positions don't get monitored, orders don't sync.

Two options:

1. **External pinger (free)** — Sign up at https://cron-job.org or
   https://uptimerobot.com (both free). Configure a job to hit
   `https://lodestar-api.onrender.com/api/health` every 10 minutes
   during US market hours (13:30–20:00 UTC, Mon–Fri).
2. **Upgrade to Starter ($7/mo)** — no sleep, no pinger needed.

---

## One-time prerequisites

1. **GitHub account** with this repo pushed up (Render deploys from GitHub).
2. **Render account** — https://render.com (GitHub login is fine).
3. **Upstash account** for Redis — https://upstash.com.
4. **Alpaca paper trading keys** — already in your `.env`; you'll paste them
   into Render's dashboard, not commit them.

---

## Step 1 — Initialize git and push to GitHub

```bash
cd /path/to/lodestar
git init
git add .
git commit -m "Initial commit"
```

Create an empty private repo on GitHub (do **not** add a README), then:

```bash
git remote add origin git@github.com:<your-user>/lodestar.git
git branch -M main
git push -u origin main
```

⚠️ Before pushing, double-check `.gitignore` excludes `.env`:

```bash
grep -E '^\.env$' .gitignore || echo ".env" >> .gitignore
git rm --cached .env 2>/dev/null || true
```

---

## Step 2 — Set up Upstash Redis

1. Log in to https://console.upstash.com.
2. **Create Database** → name it `lodestar-redis`, pick the region closest to
   Render's Oregon (US-West-1).
3. Copy the **Redis URL** (looks like `rediss://default:xxx@xxx.upstash.io:6379`).
4. You'll paste this into Render as `REDIS_URL` in Step 4.

---

## Step 3 — Deploy via Render Blueprint

1. In Render dashboard: **New +** → **Blueprint**.
2. Connect your GitHub repo.
3. Render reads `render.yaml` and shows you what it'll create:
   - `lodestar-api` (web service, free)
   - `lodestar-db` (Postgres, free)
4. Click **Apply**. First build takes ~5–10 min (frontend + Python deps).

---

## Step 4 — Fill in the dashboard-only secrets

The blueprint marks several env vars as `sync: false` — meaning you set them
in the dashboard, not in the YAML. Open **lodestar-api** → **Environment**:

| Key                    | Value                                              |
|------------------------|----------------------------------------------------|
| `ADMIN_USERNAME`       | Pick a username (NOT `admin`)                      |
| `ADMIN_PASSWORD`       | Run `openssl rand -base64 24` and use the output   |
| `REDIS_URL`            | `rediss://default:...@...upstash.io:6379`          |
| `CORS_ORIGINS`         | `https://lodestar-api.onrender.com` (your URL)     |
| `ALPACA_API_KEY`       | From `.env`                                        |
| `ALPACA_SECRET_KEY`    | From `.env`                                        |

Click **Save Changes**. Render auto-redeploys.

---

## Step 5 — Verify

Once the deploy finishes (green dot), visit:

- `https://lodestar-api.onrender.com/api/health` → returns `{"status":"ok",...}`
- `https://lodestar-api.onrender.com/api/docs` → FastAPI Swagger UI
- `https://lodestar-api.onrender.com/` → React dashboard login

Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set.

In the API logs you should see `scheduler_started jobs=[...]` once on boot,
followed by interval ticks (`run_active_strategies`, `monitor_open_positions`,
etc.). If you don't see those, the scheduler didn't start.

---

## Step 6 — Set up the keep-alive pinger

(Skip if you upgraded to Starter.)

1. Sign up at https://cron-job.org (free, no card).
2. **Create cronjob**:
   - URL: `https://lodestar-api.onrender.com/api/health`
   - Schedule: `*/10 13-20 * * 1-5` (every 10 min during US market hours, weekdays)
   - Notifications: enable failure notifications so you know if the service dies.
3. Save.

---

## Step 7 — Turn on trading

Once you've verified manual API calls work end-to-end:

1. In Render dashboard → Environment, flip:
   - `TRADING_ENABLED=true`
   - `STRATEGIES_ENABLED=true`
2. The next strategy tick (within 60s of restart) will run live.

---

## Hardening still TODO

(The "harden after" half of your deploy-first decision.)

- [ ] Rotate `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` — they've been in your
      local `.env` and shell history; treat them as compromised.
- [ ] Add login rate-limiting (`slowapi`) on `/api/auth/login`.
- [ ] Schedule `pg_dump` to S3/B2 (free Postgres has no backups).
- [ ] Mark the 90-day Postgres expiry on your calendar — when it hits,
      you'll need to spin up a new free DB and restore.
- [ ] Consider Cloudflare Access in front for an extra auth layer.

---

## Local development

The Dockerfile and `render.yaml` are additive — local development is unaffected. Run the
API and the in-process scheduler together with:

```bash
uvicorn app.main:app --reload
```

See the README for the full local setup. There is no separate worker or beat process to
manage; all periodic work runs inside the API via APScheduler.
