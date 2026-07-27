# Access and Rules

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## Auth / AuthZ Scheme

Authentication is a JWT Bearer-token flow. The user posts credentials to `/api/auth/login` (form-encoded); the backend returns an `access_token`. The token is stored in **`sessionStorage`** under key `quant_token` (tab-scoped — not shared across tabs, not persisted across browser restarts). Every subsequent API request includes `Authorization: Bearer <token>` (`lib/api.js:17-18`).

There is no role-based authorization in the frontend. The backend enforces admin-only endpoints; the frontend exposes the Users admin page at `/users` but does not check role before rendering it — access control for that page is backend-enforced.

## Access Rules

| Rule | Behavior | Enforced where (file) | Scope (route/feature) |
|---|---|---|---|
| Public market data | All market/research/screener/education routes accessible without token | `App.jsx` route tree (no `Private` wrapper) | All public routes |
| Private trading routes | Render `<Navigate to="/login?from=...">` if no token in sessionStorage | `App.jsx:RequireAuth` (line 48-57) | `/workspace`, `/trade`, `/paper`, `/orders`, `/positions`, `/watchlists`, `/strategies`, `/backtests*`, `/optimizer*`, `/risk`, `/alerts`, `/price-alerts`, `/audit`, `/settings`, `/users` |
| Session expiry (401 with token) | Clear token + hard redirect to `/login?from=<current>` | `lib/api.js:28-35` | All authenticated REST calls |
| Anonymous 401 | Throw `unauthorized` error; page handles it | `lib/api.js:36` | REST calls made without a token that hit a protected endpoint |
| Open-redirect protection | `from` param honored only if it starts with `/` and not `//` | `pages/Login.jsx:22` | Post-login redirect |
| WebSocket gating | `initStoreWS()` called only when `quant_token` is present | `main.jsx:14`, `components/Layout.jsx:117` | WebSocket connection |
| Market scope | Account and position API calls include `?market=<market>` derived from `quant_market_v1` in localStorage | `lib/store.js:18-19`, `lib/api.js:mkt()` | `/account`, `/positions`, watchlists |
| Live trading safety gate | Requires both `ALPACA_BASE_URL` = live URL **and** `ALPACA_LIVE_CONFIRMED=true` | `app/core/config.py` (backend — not frontend) | Alpaca order submission |
| Trading halted banner | `Layout` renders a warning banner when `control.is_live && !control.trading_enabled` | `components/Layout.jsx:352-357` | Layout chrome (all authenticated views) |

## Scoping / Multi-Tenancy

The app supports two market scopes: **US** and **India (NSE)**. The active market is stored in `localStorage` as `quant_market_v1` and read by `MarketContext`, `lib/api.js:mkt()`, and `lib/store.js:currentMarket()`. Switching market fires a `market:change` custom event that triggers the store to re-fetch account and positions for the new scope (`store.js:173-177`). MarketContext syncs across tabs via the `storage` event.

## Validation Approach

- **Login form:** HTML native `required` attribute on username and password inputs (`pages/Login.jsx:62,70`). No additional client-side validation.
- **No form validation library** detected (`package.json` has no Zod, Yup, react-hook-form, etc.).
- API validation errors from the backend are surfaced via `err.detail.reason`, `err.detail.detail`, or `err.message` extracted in `lib/api.js:39-41` and passed to callers, who may show them in toasts.

## Feature Flags

N/A — no client-side feature-flag system (no LaunchDarkly, Unleash, or similar). Runtime behavior is controlled by backend environment variables (`TRADING_ENABLED`, `STRATEGIES_ENABLED`) that are reflected in the `control` Zustand slice returned from `/api/control/state`.

## Real-Time Invalidation Rules

Real-time state invalidation is driven by the WebSocket. See `07-state-and-data-fetching.md` for the full event → state mapping.
