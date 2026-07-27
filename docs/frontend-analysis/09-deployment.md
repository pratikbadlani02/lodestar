# 09 — Deployment

## Deployment Matrix

| Stage | Command / mechanism | Output / target | Env vars | Notes |
|---|---|---|---|---|
| Local dev (frontend only) | `cd frontend && npm run dev` | Dev server on `:3000`; proxies `/api` → `:8000` | None — Vite uses proxy | Requires backend on `:8000` |
| Local dev (backend) | `uvicorn app.main:app --reload` | API + WS on `:8000` | `DATABASE_URL`, `REDIS_URL`, `ALPACA_*`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SECRET_KEY` | Copy `.env.example` → `.env` |
| Frontend production build | `cd frontend && npm run build` | `frontend/dist/` (static files) | None (no `VITE_*` env vars used) | Outputs chunked JS + single Tailwind CSS bundle; no source maps |
| Docker image build (Stage 1) | `docker build` — `FROM node:20-alpine AS frontend-builder` | `/app/frontend/dist` inside image | None | `npm ci --no-audit --no-fund` then `npm run build` |
| Docker image build (Stage 2) | `FROM python:3.12-slim AS runtime` | Final image with Python runtime + `frontend/dist` copied in | `PORT` (default 8000) | `COPY --from=frontend-builder` merges stages |
| Docker run / production | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}` | API serves SPA on `/` + `/api/*` on same port | Full env set (see below) | FastAPI mounts `frontend/dist` as static files with SPA fallback |
| Render (cloud) | `autoDeploy: true` from `main` branch; `render.yaml` blueprint | Render web service + managed Postgres | Injected by Render dashboard | Free tier sleeps when idle; keep-alive pinger described in `DEPLOY.md` |

Source: `Dockerfile`, `render.yaml`, `CLAUDE.md`

## Serving Model

**Development**: Vite dev server at `:3000` serves the SPA; `/api` is proxied to FastAPI at `:8000`. Hot module replacement (HMR) is active.

**Production**: FastAPI serves everything from a single container. The `frontend/dist` folder is mounted as static files. Non-`/api` paths that don't match a static file fall through to `index.html` (SPA fallback), enabling deep-link refreshes. There is no separate CDN or edge layer.

## Env-Var Matrix

All environment variables are backend (`FastAPI`/`pydantic-settings`) — the frontend has **no** `VITE_*` environment variables. The API base URL is hardcoded as `/api` (relative), which works in both development (via Vite proxy) and production (same origin).

| Variable | Where set | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` / Render | Asyncpg connection for the app |
| `REDIS_URL` | `.env` / Render | WebSocket pub/sub + kill switch state |
| `ALPACA_API_KEY` | `.env` / Render | Alpaca brokerage credentials |
| `ALPACA_SECRET_KEY` | `.env` / Render | Alpaca brokerage credentials |
| `ALPACA_BASE_URL` | `.env` / Render | Paper (`paper-api.alpaca.markets`) or live URL |
| `ALPACA_LIVE_CONFIRMED` | `.env` / Render | Must be `true` to enable live trading (both flags required) |
| `ADMIN_USERNAME` | `.env` / Render | Config-based admin user fallback |
| `ADMIN_PASSWORD` | `.env` / Render | Config-based admin user fallback |
| `SECRET_KEY` | `.env` / Render | JWT signing key (`openssl rand -hex 32`) |
| `PORT` | Render (injected) | Uvicorn bind port (default 8000) |

## Docker / Build Details

Two-stage Dockerfile (`Dockerfile`):
- **Stage 1** (`node:20-alpine`): installs `package-lock.json`-locked dependencies (`npm ci`), runs `npm run build`, outputs `frontend/dist`.
- **Stage 2** (`python:3.12-slim`): installs Python deps, copies app code and `alembic/`, copies `dist` from Stage 1. Entrypoint runs migrations then starts Uvicorn.

The final image contains no Node.js runtime — only the compiled static assets.

## Health Check / Smoke Test

`GET /api/health` returns service status. No automated smoke test in CI (the project has no CI config). Manual verification via `/api/docs` (Swagger UI) is the documented approach (`CLAUDE.md`).
