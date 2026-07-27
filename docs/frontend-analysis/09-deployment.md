# 09 — Deployment

## Deployment matrix

| Stage | Command / mechanism | Output / target | Env vars | Notes |
|---|---|---|---|---|
| Develop | `npm run dev` (in `frontend/`) | Vite dev server `http://localhost:3000` | none (`VITE_*` unused) | `/api` proxied to `:8000`; run backend separately |
| Build | `npm run build` | `frontend/dist/` (no sourcemaps) | none | vendor + per-route chunking |
| Preview | `npm run preview` | local prod preview | none | — |
| Serve (prod) | FastAPI static mount + SPA fallback | `dist/` served at `/`, single origin | backend-only | mount added last so it can't shadow `/api/*` |
| Container | Multi-stage `Dockerfile` | stage1 builds `dist/`, stage2 Python runtime serves it | backend env | entrypoint: `alembic upgrade head && uvicorn app.main:app` |
| Host | Render (`render.yaml`, `autoDeploy` from `main`) | web service + managed Postgres | per Render env | ⚠️ free tier sleeps when idle (keep-alive pinger) |

Sources: [frontend/package.json](../../frontend/package.json#L5-L9), [vite.config.js](../../frontend/vite.config.js#L12-L24), [CLAUDE.md](../../CLAUDE.md), [DEPLOY.md](../../DEPLOY.md).

## Serving model

Production = **FastAPI serves the built SPA** from `frontend/dist` as static files with an SPA fallback; absent `dist` ⇒ root returns a JSON identity response. Frontend + API share one origin, so the dev proxy is irrelevant in prod. The frontend is environment-agnostic: relative `/api` base ([api.js](../../frontend/src/lib/api.js#L2)) and WS host from `window.location` ([api.js](../../frontend/src/lib/api.js#L196-L198)). No standalone CDN/static host in `frontend/`.

## Env-var matrix

| Variable | Used in frontend? | Notes |
|---|---|---|
| `VITE_*` | No | ⚠️ none defined or referenced |
| `.env.development/.production` | No | ⚠️ no frontend env files |
| API base URL | Implicit | always relative `/api` |
| WS URL | Implicit | from page origin |

All real config (Alpaca keys, DB/Redis URLs, live-trading flags) is backend-only in `app/core/config.py`.

## Containerization & health

| Concern | Finding | Source |
|---|---|---|
| Dockerfile | Single multi-stage (Node build → Python runtime); no separate frontend image | [Dockerfile](../../Dockerfile), [CLAUDE.md](../../CLAUDE.md) |
| Kubernetes | N/A — not present; Render blueprint instead | [render.yaml](../../render.yaml) |
| Health / smoke test | Backend `/api/health` (surfaced via store `health`); smoke = load `/` + `GET /api/health` | [api.js](../../frontend/src/lib/api.js#L58) |
| Asset optimization | `React.lazy` per route + `manualChunks` vendor split + Suspense skeletons | [App.jsx](../../frontend/src/App.jsx#L10-L45), [vite.config.js](../../frontend/vite.config.js#L16-L22) |
