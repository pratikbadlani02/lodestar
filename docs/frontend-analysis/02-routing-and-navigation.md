# 02 — Routing & Navigation

## Bootstrap Sequence

1. `main.jsx` creates `ReactDOM.createRoot` and wraps `<App>` in `<BrowserRouter>` plus four context providers (ThemeProvider → DensityProvider → MarketProvider → SymbolProvider). `frontend/src/main.jsx:16-28`
2. If `sessionStorage.quant_token` is present, `initStoreWS()` is called before `render()`, opening the WebSocket and kicking off parallel REST fetches. `frontend/src/main.jsx:14`
3. `App.jsx` defines all routes via React Router v6 `<Routes>`. `Login` is the only eagerly-imported page; all others are `React.lazy()`. `frontend/src/App.jsx:7,10-44`
4. Every lazy page is wrapped in `<Suspense>` (via `<S>`) with a shimmer skeleton fallback. `frontend/src/App.jsx:59-61`
5. Private pages are individually wrapped in `<Private>` (which calls `<RequireAuth>`). The public `<Layout>` shell renders for all routes; only the `<Outlet>` content is gated. `frontend/src/App.jsx:63-65,89`

## Auth-Gating Rule

`RequireAuth` reads `sessionStorage.quant_token` synchronously. If absent, it redirects to `/login?from=<current path>`. The Layout shell (sidebar, top bar, status bar) is **always** rendered — only the `<Outlet>` for private routes is replaced with a redirect. `frontend/src/App.jsx:48-57`

## Route Map

| Route | Component | Access | Guard | Params | Data source | Loading strategy | Purpose |
|---|---|---|---|---|---|---|---|
| `/login` | `Login` | Public | — | `?from` | — | Eager | JWT login form |
| `/` | `Market` | Public | — | — | REST polling | Lazy/useEffect | Market overview (default landing) |
| `/market` | `Market` | Public | — | — | REST polling | Lazy/useEffect | Market overview alias |
| `/market/region/:id` | `Market` | Public | — | `:id` (region) | REST polling | Lazy/useEffect | Region-filtered market view |
| `/learn` | `Learn` | Public | — | — | Static (learnContent.js) | Lazy/static | Educational content library |
| `/coach` | `Coach` | Public | — | — | Static + REST | Lazy/useEffect | Guided trade coaching |
| `/stocks` | `Stocks` | Public | — | — | REST | Lazy/useEffect | Stock browser with tabbed research |
| `/screener` | `Screener` | Public | — | — | REST | Lazy/useEffect | Filterable stock screener |
| `/scanner` | `SentimentScanner` | Public | — | — | REST | Lazy/useEffect | Sentiment-ranked stock scanner |
| `/heatmap` | `Heatmap` | Public | — | — | REST | Lazy/useEffect | Sector/market heatmap |
| `/movers` | `Movers` | Public | — | — | REST | Lazy/useEffect | Top gainers, losers, most active |
| `/tape` | `Tape` | Public | — | — | REST | Lazy/useEffect | Time & sales (tick data) |
| `/tape/:symbol` | `Tape` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific tape |
| `/crypto` | `Crypto` | Public | — | — | REST | Lazy/useEffect | Cryptocurrency prices & charts |
| `/analysis` | `Analysis` | Public | — | — | REST | Lazy/useEffect | Technical chart + indicators |
| `/analysis/:symbol` | `Analysis` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific technical analysis |
| `/fundamentals` | `Fundamentals` | Public | — | — | REST | Lazy/useEffect | Company financials |
| `/fundamentals/:symbol` | `Fundamentals` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific fundamentals |
| `/options` | `Options` | Public | — | — | REST | Lazy/useEffect | Options chain viewer |
| `/options/:symbol` | `Options` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific options chain |
| `/earnings` | `Earnings` | Public | — | — | REST | Lazy/useEffect | Earnings calendar |
| `/dividends` | `Dividends` | Public | — | — | REST | Lazy/useEffect | Dividend history |
| `/dividends/:symbol` | `Dividends` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific dividends |
| `/insiders` | `Insiders` | Public | — | — | REST | Lazy/useEffect | Insider trading activity |
| `/insiders/:symbol` | `Insiders` | Public | — | `:symbol` | REST | Lazy/useEffect | Symbol-specific insider data |
| `/compare` | `Compare` | Public | — | — | REST | Lazy/useEffect | Multi-symbol comparison |
| `/workspace` | `Workspace` | Private | RequireAuth | — | Store + REST | Lazy/store | Main trading dashboard |
| `/dashboard` | Redirect → `/workspace` | Private | — | — | — | — | Legacy alias |
| `/trade` | `Trade` | Private | RequireAuth | — | Store + REST | Lazy/store | Live order placement |
| `/paper` | `Paper` | Private | RequireAuth | — | Store + REST | Lazy/store | Paper trading interface |
| `/orders` | `Orders` | Private | RequireAuth | — | Store | Lazy/store | Historical order list |
| `/positions` | `Positions` | Private | RequireAuth | — | Store | Lazy/store | Open positions with P&L |
| `/watchlists` | `Watchlists` | Private | RequireAuth | — | REST | Lazy/useEffect | Watchlist management |
| `/strategies` | `Strategies` | Private | RequireAuth | — | Store | Lazy/store | Strategy CRUD + control |
| `/backtests` | `Backtests` | Private | RequireAuth | — | Store | Lazy/store | Backtest results list |
| `/backtests/:id` | `BacktestDetail` | Private | RequireAuth | `:id` (UUID) | REST | Lazy/useEffect | Detailed backtest stats & trades |
| `/backtest-compare` | `BacktestCompare` | Private | RequireAuth | — | REST | Lazy/useEffect | Side-by-side backtest comparison |
| `/optimizer` | `Optimizer` | Private | RequireAuth | — | REST | Lazy/useEffect | Parameter optimization runs |
| `/optimizer/:id` | `OptimizerDetail` | Private | RequireAuth | `:id` (UUID) | REST | Lazy/useEffect | Optimizer run detail |
| `/risk` | `RiskAnalytics` | Private | RequireAuth | — | REST | Lazy/useEffect | Portfolio risk metrics (VaR, beta) |
| `/alerts` | `Alerts` | Private | RequireAuth | — | Store | Lazy/store | System alert inbox |
| `/price-alerts` | `PriceAlerts` | Private | RequireAuth | — | REST | Lazy/useEffect | Price-triggered alert management |
| `/audit` | `AuditLog` | Private | RequireAuth | — | REST | Lazy/useEffect | Audit trail of all actions |
| `/settings` | `Settings` | Private | RequireAuth | — | Store + REST | Lazy/store | Kill switch, live/paper toggle |
| `/users` | `Users` | Private | RequireAuth | — | REST | Lazy/useEffect | Admin: user management |
| `/*` | Redirect → `/` | — | — | — | — | — | 404 fallback |

## Deep-Link / Param Handling

Routes with a `:symbol` param (e.g. `/analysis/AAPL`, `/tape/TSLA`) use `useSymbolPage(routeSym)` from `SymbolContext` (`frontend/src/lib/SymbolContext.jsx`). This helper syncs the URL param with the global active symbol and recents list, so navigating directly to `/fundamentals/MSFT` sets MSFT as the active symbol application-wide.

## External Entry Points

- Direct deep links to any public route work without authentication.
- Private routes redirect to `/login?from=<path>` and return after successful auth.
- The SPA has no hash-based routing; all URLs require the server to serve `index.html` for non-`/api` paths (handled by FastAPI's static mount with SPA fallback).
