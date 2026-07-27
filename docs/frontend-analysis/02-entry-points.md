# 02 — Entry Points

## Application bootstrap

- HTML entry: `frontend/index.html` mounts `#root` and (per comments) runs an inline pre-paint script that sets `data-theme` to avoid a theme flash.
- JS entry: [frontend/src/main.jsx](../../frontend/src/main.jsx) wraps `<App/>` in `BrowserRouter` and the four context providers, then conditionally boots the global store + WebSocket **only if a token already exists**:
  ```js
  if (sessionStorage.getItem('quant_token')) initStoreWS()
  ```
  Otherwise the store boots later, after login, from `Layout`'s `authed` effect.

## Router

- Router type: `<BrowserRouter>` (declarative `<Routes>`), defined in [frontend/src/App.jsx](../../frontend/src/App.jsx#L86-L156).
- Root shell: a single `Layout` route element wraps all in-app pages via `<Outlet/>`; `/login` sits outside the layout.
- Code splitting: every page except `Login` is `React.lazy`-loaded; each is wrapped in `<Suspense>` (`S`) with a skeleton fallback (`RouteFallback`). Private pages add a `RequireAuth` gate (`Private`).
- Catch-all `*` redirects to `/`.

## Auth model on routes

`RequireAuth` ([App.jsx](../../frontend/src/App.jsx#L47-L57)) checks `sessionStorage.quant_token`. If missing it redirects to `/login?from=<encoded path>` so the user returns after sign-in. The `Layout` itself is **public** — anonymous users see public pages; only individually-wrapped routes are gated.

## Route map

Public = no token required. Private = wrapped in `<Private>` (redirects to login).

| Route | Component | Access | Primary data source | Purpose |
|---|---|---|---|---|
| `/login` | `Login` | Public | `POST /api/auth/login` | Sign in (JWT) |
| `/` (index) | `Market` | Public | `GET /api/market/*` | Landing / market overview |
| `/learn` | `Learn` | Public | static content | Education |
| `/coach` | `Coach` | Public | market endpoints | Guided trade walkthrough |
| `/market`, `/market/region/:id` | `Market` | Public | `GET /api/market/*` | Market overview / region news |
| `/stocks` | `Stocks` | Public | `GET /api/market/*` | Per-symbol research (tabs) |
| `/screener` | `Screener` | Public | `GET /api/market/screener` | Screening |
| `/scanner` | `SentimentScanner` | Public | `GET /api/market/sentiment-scan` | Ranked sentiment picks |
| `/heatmap` | `Heatmap` | Public | `GET /api/market/*` | Sector/market heatmap |
| `/movers` | `Movers` | Public | `GET /api/market/movers` | Top movers |
| `/tape`, `/tape/:symbol` | `Tape` | Public | `GET /api/market/trades|quotes` + WS | Time & sales |
| `/crypto` | `Crypto` | Public | `GET /api/market/crypto/*` | Crypto snapshots/bars |
| `/analysis`, `/analysis/:symbol` | `Analysis` | Public | `GET /api/market/analysis/:symbol` | Holistic analysis |
| `/fundamentals`, `/fundamentals/:symbol` | `Fundamentals` | Public | `GET /api/market/fundamentals/:symbol` | Financials |
| `/options`, `/options/:symbol` | `Options` | Public | `GET /api/market/options/:symbol` | Option chain |
| `/earnings` | `Earnings` | Public | `GET /api/market/earnings/*` | Earnings calendar |
| `/dividends`, `/dividends/:symbol` | `Dividends` | Public | `GET /api/market/dividends/:symbol` | Dividends |
| `/insiders`, `/insiders/:symbol` | `Insiders` | Public | `GET /api/market/*` | Insider/holders |
| `/compare` | `Compare` | Public | multiple market endpoints | Multi-symbol compare |
| `/workspace` | `Workspace` | **Private** | store (account/positions/orders) + WS | Trading workspace |
| `/dashboard` | → redirect `/workspace` | — | — | Legacy alias |
| `/trade` | `Trade` | **Private** | `POST /api/orders` | Quick order ticket |
| `/paper` | `Paper` | **Private** | orders/account | Paper trading |
| `/orders` | `Orders` | **Private** | `GET /api/orders` | Order list/sync |
| `/positions` | `Positions` | **Private** | `GET /api/positions` | Open positions |
| `/watchlists` | `Watchlists` | **Private** | `GET /api/watchlists` | Watchlists |
| `/strategies` | `Strategies` | **Private** | `GET /api/strategies` | Strategy CRUD |
| `/backtests` | `Backtests` | **Private** | `GET /api/backtests` | Backtest list/create |
| `/backtests/:id` | `BacktestDetail` | **Private** | `GET /api/backtests/:id` | Backtest detail |
| `/backtest-compare` | `BacktestCompare` | **Private** | backtests | Compare runs |
| `/optimizer` | `Optimizer` | **Private** | `GET /api/optimizer` | Param optimization |
| `/optimizer/:id` | `Optimizer.OptimizerDetail` | **Private** | `GET /api/optimizer/:id` | Optimizer run detail |
| `/risk` | `RiskAnalytics` | **Private** | `GET /api/analytics/portfolio-risk` | Risk analytics |
| `/alerts` | `Alerts` | **Private** | `GET /api/alerts` | System alerts |
| `/price-alerts` | `PriceAlerts` | **Private** | `GET /api/price-alerts` | Price alerts |
| `/audit` | `AuditLog` | **Private** | `GET /api/audit` | Audit log |
| `/settings` | `Settings` | **Private** | `GET /api/control/state` etc. | Settings/controls |
| `/users` | `Users` | **Private (admin)** | `GET /api/users` | User admin |
| `*` | → redirect `/` | — | — | Catch-all |

## Deep-linking & URL params

- `:symbol` routes (`/analysis/:symbol`, `/options/:symbol`, …) are handled by the `useSymbolPage(routeSym)` helper ([SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L82-L96)): if the URL carries a symbol it wins on mount and is pushed into the global `SymbolContext`; otherwise the page uses the currently active symbol.
- `/login?from=...` carries the post-login redirect target; `Login` validates it is a same-origin relative path to prevent open redirects ([Login.jsx](../../frontend/src/pages/Login.jsx#L21-L24)).

## External / embedding entry points

⚠️ **None found.** No iframe embedding, MFE host-mount export, or `remoteEntry.js`. The SPA is launched only from its own `index.html`.
