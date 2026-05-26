# Deploying Lodestar to Render

Lodestar is a **public market-data viewer**. No login, no trading, no
account balances. Anyone with the URL can browse charts, screener,
fundamentals, earnings, and so on.

---

## Architecture

Single Docker container runs everything:

- FastAPI serves market-data endpoints under `/api/*`
- The built React frontend is served from the same container
- No scheduler, no Celery, no background workers
- Alpaca's market-data API supplies OHLCV / snapshots; yfinance backs the
  fundamentals / earnings / dividends endpoints

| Component  | Service type           | Plan    | Notes                                 |
|------------|------------------------|---------|---------------------------------------|
| API + frontend | Web Service (Docker) | Free    | Sleeps after 15 min idle              |
| Postgres   | Managed Database       | Free    | 1 GB, expires after 90 days           |
| Redis      | Upstash (optional)     | Free    | Fundamentals JSON cache only          |

---

## One-time prerequisites

1. **GitHub account** with this repo pushed up.
2. **Render account** — https://render.com.
3. **Alpaca account** — https://app.alpaca.markets. The free paper account
   is fine; we only use the market-data API. Note your API key + secret.
4. *(Optional)* **Upstash account** for the fundamentals cache — https://upstash.com.
5. *(Optional)* **Sentry account** for error tracking — https://sentry.io.

---

## Step 1 — Push to GitHub

```bash
cd /Users/pbadlani/quant-platform
git init
git add .
git commit -m "Initial commit"
```

Create an empty private repo on GitHub, then:

```bash
git remote add origin git@github.com:<your-user>/lodestar.git
git branch -M main
git push -u origin main
```

Double-check `.gitignore` excludes `.env` before pushing.

---

## Step 2 — Deploy via Render Blueprint

1. In Render dashboard: **New +** → **Blueprint**.
2. Connect your GitHub repo.
3. Render reads `render.yaml` and shows the resources:
   - `lodestar-api` (web service, free)
   - `lodestar-db` (Postgres, free)
4. Click **Apply**. First build is ~5–10 min.

---

## Step 3 — Fill in the dashboard-only secrets

Open **lodestar-api** → **Environment** and add:

| Key                  | Value                                              |
|----------------------|----------------------------------------------------|
| `ALPACA_API_KEY`     | From your Alpaca paper account                     |
| `ALPACA_SECRET_KEY`  | From your Alpaca paper account                     |
| `CORS_ORIGINS`       | `https://lodestar-api.onrender.com`                |
| `REDIS_URL`          | (optional) Upstash URL — leave blank if unused     |
| `SENTRY_DSN`         | (optional) Sentry project DSN                      |

Save → Render auto-redeploys.

---

## Step 4 — Verify

Once the deploy is green:

- `https://lodestar-api.onrender.com/api/health` → `{"status":"ok",...}`
- `https://lodestar-api.onrender.com/api/market/snapshots?symbols=AAPL,MSFT` → JSON
- `https://lodestar-api.onrender.com/` → market overview, no login

---

## Step 5 — (Optional) Keep the service awake during market hours

Free Render web services hibernate after 15min idle. The first hit after
that takes ~30s to cold-start. To keep the landing page snappy during US
market hours, set up a free pinger:

1. Sign up at https://cron-job.org or https://uptimerobot.com.
2. Configure a job:
   - URL: `https://lodestar-api.onrender.com/api/health`
   - Schedule: `*/10 13-20 * * 1-5` (every 10 min during 9:30am–4:00pm ET)
3. Enable failure notifications.

Outside market hours, let it sleep — it's a viewer, nothing breaks.

---

## Hardening (already enforced in code)

- Security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`) on every response.
- In production: HSTS (6mo) and a baseline Content-Security-Policy.
- `/api/docs`, `/api/redoc`, `/api/openapi.json` are disabled in
  production — the schema does not leak.
- CORS locked to the origins listed in `CORS_ORIGINS`.
- Only `GET` is allowed via CORS — nothing mutates server state from the
  browser anyway.

## Manual TODOs

- [ ] **Set up Sentry.** Create a Python project, paste the DSN as
      `SENTRY_DSN` in Render.
- [ ] **Schedule database backups.**
      `crontab -e` → `0 3 * * * cd /Users/pbadlani/quant-platform && \
      DATABASE_URL_SYNC='<render-pg-url>' ./scripts/backup_db.sh`.
- [ ] **Calendar the 90-day Postgres expiry.** Free Render Postgres dies
      after 90 days. Spin up a new free DB and restore from your latest
      backup, or just accept the cache resets.
- [ ] **Uptime monitoring** (free): UptimeRobot or BetterStack hitting
      `/api/health` every 5 min.

---

## Local development

`./manage.sh start` loads `com.quant.api` (the only remaining service).
There is no Celery worker, no beat scheduler — everything runs inside the
single uvicorn process.
