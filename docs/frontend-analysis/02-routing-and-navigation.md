# 02 — Routing and Navigation

## Bootstrap sequence

1. `index.html` mounts `#root`; an inline pre-paint script sets `data-theme` to avoid theme flash.
2. [main.jsx](../../frontend/src/main.jsx) wraps `<App/>` in `BrowserRouter` + 4 context providers.
3. Store/WebSocket boot only if a token exists: `if (sessionStorage.getItem('quant_token')) initStoreWS()` ([main.jsx](../../frontend/src/main.jsx#L13-L14)); otherwise `Layout` boots it post-login.
4. `App.jsx` defines routes; every page except `Login` is `React.lazy` + `<Suspense>` ([App.jsx](../../frontend/src/App.jsx#L10-L45)).

## Auth gating

`RequireAuth` checks `sessionStorage.quant_token`; absent ⇒ redirect to `/login?from=<encoded path>` ([App.jsx](../../frontend/src/App.jsx#L47-L57)). `Layout` is public; private pages are individually wrapped in `<Private>`.

## Route map

`Access` = Public / Private / Admin. `Loading strategy` = store / useEffect / static.

| Route | Component | Access | Guard | Params | Data source | Loading strategy | Purpose |
|---|---|---|---|---|---|---|---|
| `/login` | `Login` | Public | — | `?from` | `POST /api/auth/login` | useEffect | Sign in (JWT) |
| `/` | `Market` | Public | — | — | `GET /api/market/*` | useEffect | Landing / market overview |
| `/learn` | `Learn` | Public | — | — | static modules | static | Education |
| `/coach` | `Coach` | Public | — | — | market endpoints | useEffect | Guided trade |
| `/market`, `/market/region/:id` | `Market` | Public | — | `:id` | `GET /api/market/*` | useEffect | Overview / region news |
| `/stocks` | `Stocks` | Public | — | — | `GET /api/market/*` | useEffect | Per-symbol research (tabs) |
| `/screener` | `Screener` | Public | — | — | `GET /api/market/screener` | useEffect | Screening |
| `/scanner` | `SentimentScanner` | Public | — | — | `GET /api/market/sentiment-scan` | useEffect | Ranked sentiment |
| `/heatmap` | `Heatmap` | Public | — | — | `GET /api/market/*` | useEffect | Heatmap |
| `/movers` | `Movers` | Public | — | — | `GET /api/market/movers` | useEffect | Top movers |
| `/tape`, `/tape/:symbol` | `Tape` | Public | — | `:symbol` | `GET /api/market/trades\|quotes` + WS | useEffect+WS | Time & sales |
| `/crypto` | `Crypto` | Public | — | — | `GET /api/market/crypto/*` | useEffect | Crypto |
| `/analysis`, `/analysis/:symbol` | `Analysis` | Public | — | `:symbol` | `GET /api/market/analysis/:symbol` | useEffect | Holistic analysis |
| `/fundamentals`, `/fundamentals/:symbol` | `Fundamentals` | Public | — | `:symbol` | `GET /api/market/fundamentals/:symbol` | useEffect | Financials |
| `/options`, `/options/:symbol` | `Options` | Public | — | `:symbol` | `GET /api/market/options/:symbol` | useEffect | Option chain |
| `/earnings` | `Earnings` | Public | — | — | `GET /api/market/earnings/*` | useEffect | Earnings calendar |
| `/dividends`, `/dividends/:symbol` | `Dividends` | Public | — | `:symbol` | `GET /api/market/dividends/:symbol` | useEffect | Dividends |
| `/insiders`, `/insiders/:symbol` | `Insiders` | Public | — | `:symbol` | `GET /api/market/*` | useEffect | Insiders/holders |
| `/compare` | `Compare` | Public | — | — | multiple market endpoints | useEffect | Multi-symbol compare |
| `/workspace` | `Workspace` | Private | `RequireAuth` | — | store + WS | store | Trading workspace |
| `/dashboard` | →`/workspace` | — | — | — | — | redirect | Legacy alias |
| `/trade` | `Trade` | Private | `RequireAuth` | — | `POST /api/orders` | useEffect | Quick ticket |
| `/paper` | `Paper` | Private | `RequireAuth` | — | orders/account | store | Paper trading |
| `/orders` | `Orders` | Private | `RequireAuth` | — | `GET /api/orders` | store | Order list/sync |
| `/positions` | `Positions` | Private | `RequireAuth` | — | `GET /api/positions` | store | Open positions |
| `/watchlists` | `Watchlists` | Private | `RequireAuth` | — | `GET /api/watchlists` | useEffect | Watchlists |
| `/strategies` | `Strategies` | Private | `RequireAuth` | — | `GET /api/strategies` | store | Strategy CRUD |
| `/backtests` | `Backtests` | Private | `RequireAuth` | — | `GET /api/backtests` | store | Backtest list/create |
| `/backtests/:id` | `BacktestDetail` | Private | `RequireAuth` | `:id` | `GET /api/backtests/:id` | useEffect | Backtest detail |
| `/backtest-compare` | `BacktestCompare` | Private | `RequireAuth` | — | backtests | useEffect | Compare runs |
| `/optimizer` | `Optimizer` | Private | `RequireAuth` | — | `GET /api/optimizer` | useEffect | Optimization |
| `/optimizer/:id` | `Optimizer.OptimizerDetail` | Private | `RequireAuth` | `:id` | `GET /api/optimizer/:id` | useEffect | Optimizer detail |
| `/risk` | `RiskAnalytics` | Private | `RequireAuth` | — | `GET /api/analytics/portfolio-risk` | useEffect | Risk analytics |
| `/alerts` | `Alerts` | Private | `RequireAuth` | — | `GET /api/alerts` | store | System alerts |
| `/price-alerts` | `PriceAlerts` | Private | `RequireAuth` | — | `GET /api/price-alerts` | useEffect | Price alerts |
| `/audit` | `AuditLog` | Private | `RequireAuth` | — | `GET /api/audit` | useEffect | Audit log |
| `/settings` | `Settings` | Private | `RequireAuth` | — | `GET /api/control/state` | useEffect | Settings/controls |
| `/users` | `Users` | Admin | `RequireAuth` (+ backend role) | — | `GET /api/users` | useEffect | User admin |
| `*` | →`/` | — | — | — | — | redirect | Catch-all |

## Deep-linking & params

| Mechanism | Behavior | Source |
|---|---|---|
| `:symbol` routes | `useSymbolPage(routeSym)` — URL symbol wins on mount, pushed into `SymbolContext`; else uses active symbol | [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L82-L96) |
| `/login?from=` | Post-login redirect; honored only if same-origin relative path (`/`, not `//`) | [Login.jsx](../../frontend/src/pages/Login.jsx#L21-L24) |

## External entry points

N/A — no iframe embedding, MFE host-mount, or `remoteEntry.js`. SPA launches only from its own `index.html`.
