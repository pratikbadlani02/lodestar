# 03 — Access & Rules

## Access & Rules

| Rule | Behavior | Enforced where (file) | Scope |
|---|---|---|---|
| JWT presence check | Reads `sessionStorage.quant_token`; if absent, redirects to `/login?from=<current path>` | `frontend/src/App.jsx:48-57` (`RequireAuth`) | All private routes |
| Session expiry mid-use | On any REST 401 response with an existing token: clears token, redirects to `/login?from=<current path>` | `frontend/src/lib/api.js:27-36` | All REST calls |
| Anonymous 401 passthrough | If a public route hits a 401 (no token), throws `unauthorized` error without redirect — page decides how to surface it | `frontend/src/lib/api.js:31-36` | Public routes calling private endpoints |
| WS guard | `initStoreWS()` only called if token is present at boot; WS never opens for unauthenticated users | `frontend/src/main.jsx:14` | WebSocket |
| Admin-only pages | `/users` route uses `RequireAuth` only (token required); admin role enforcement is server-side — the frontend does not gate on role | `frontend/src/App.jsx:140` | `/users` |
| Live vs. paper trading gate | `control.is_live` flag from `/api/control/state` drives UI labels ("LIVE" vs. "PAPER"); kill switch and live-mode toggle require authenticated requests | `frontend/src/lib/store.js:36-38` | Settings, Workspace |
| Kill switch display | `control.kill_switch_active` reflected in Settings page + sidebar status block | `frontend/src/lib/store.js:34` | Sidebar, Settings |
| Strategies enabled flag | `control.strategies_enabled` gates the "Run Strategies" UI affordance | `frontend/src/lib/store.js:34` | Sidebar status, Settings |

## Auth & Authorization Scheme

Authentication is **JWT bearer token**. The token is obtained via `POST /api/auth/login` (OAuth2 password flow, `application/x-www-form-urlencoded`) and stored in `sessionStorage.quant_token` — tab-scoped, cleared on tab close. `frontend/src/lib/api.js:48-53`

Authorization is enforced **server-side only**. The frontend has no role-checking logic beyond `RequireAuth` (token present or not). Admin endpoints (e.g. `/api/users`) return 403 from FastAPI if the caller is not role `admin`; the frontend surfaces this as an error state.

## Scoping / Multi-Tenant

The app is **single-tenant** (one account per deployment). The **market** selector (`us` / `in`) scopes account, positions, and watchlist data. The selected market is persisted in `localStorage.quant_market_v1` and read by both `MarketContext` and the Zustand store loaders. `frontend/src/lib/MarketContext.jsx`, `frontend/src/lib/store.js:18-19`

## Validation Approach

There is no form validation library. Validation is plain React state + `onChange` handlers. Required fields are checked before submission; errors are surfaced via Sonner toasts from `api.apiError()`. `frontend/src/lib/toast.js`

## Feature Flags

N/A — no feature-flag system. Live trading is controlled by a runtime server-side flag (`settings.is_live_trading` in FastAPI config, reflected via `/api/control/state`), not a frontend flag.

## Real-Time Invalidation

Session expiry during a live WS session: the WS stays open, but the next REST call from the 30 s safety refresh (or a WS-triggered invalidation) will hit 401 and force re-login. See `07-state-and-data-fetching.md` for the full real-time event table.
