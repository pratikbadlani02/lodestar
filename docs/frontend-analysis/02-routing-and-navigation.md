# Routing and Navigation

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## Bootstrap Sequence

1. Browser loads `frontend/index.html`. An inline `<script>` reads `quant_theme_v1` and `quant_density_v1` from `localStorage` and sets `data-theme` / `data-density` on `<html>` before paint — prevents flash of wrong theme (`frontend/index.html:9-21`).
2. Vite executes `src/main.jsx`.
3. If `sessionStorage.getItem('quant_token')` is truthy, `initStoreWS()` is called immediately — boots the global Zustand store and opens the WebSocket before any React tree renders (`main.jsx:14`).
4. Four context providers mount in order: `ThemeProvider` → `DensityProvider` → `MarketProvider` → `SymbolProvider`. Each reads its own `localStorage` key for initial state.
5. `BrowserRouter` + `App` render. React Router matches the current URL.
6. If the route is `/login`, the `Login` page renders (eager import — no lazy boundary).
7. All other routes go through `Layout`, which re-checks auth and calls `initStoreWS()` again if needed (idempotent via `bootstrapped` flag in `store.js:144`).
8. Private routes are individually wrapped in `<Private>` which delegates to `RequireAuth`. Anonymous users hitting a private route are redirected to `/login?from=<current-path>`.
9. All non-Login pages are lazy-loaded via `React.lazy` with a `<Suspense>` fallback (`RouteFallback` skeleton).

## Auth Gating Rule

`RequireAuth` (`App.jsx:48-57`) checks `sessionStorage.getItem('quant_token')` synchronously on every render. If absent, it issues `<Navigate to="/login?from=<encoded-current-path>" replace />`. The `from` param lets Login redirect back to the intended destination after successful sign-in, with an open-redirect guard (`Login.jsx:22`: path must start with `/` and not `//`).

## Route Map

| Route | Component | Access | Guard | Params | Data source | Loading strategy | Purpose |
|---|---|---|---|---|---|---|---|
| `/login` | `Login` | Public | — | — | none | eager | Username/password login form |
| `/` | `Market` | Public | — | — | REST via page | lazy + Suspense | Market overview (index/landing) |
| `/learn` | `Learn` | Public | — | — | static content (`lib/learnTopics.js`) | lazy + Suspense | Educational content hub |
| `/coach` | `Coach` | Public | — | — | REST via page | lazy + Suspense | Guided trade walkthrough |
| `/market` | `Market` | Public | — | — | REST via page | lazy + Suspense | Market overview (explicit path) |
| `/market/region/:id` | `Market` | Public | — | `id` — region code | REST via page | lazy + Suspense | Regional market view |
| `/stocks` | `Stocks` | Public | — | — | REST + SymbolContext | lazy + Suspense | Per-symbol research hub (tabbed) |
| `/screener` | `Screener` | Public | — | — | REST via page | lazy + Suspense | Stock screener with filters |
| `/scanner` | `SentimentScanner` | Public | — | — | REST via page | lazy + Suspense | Sentiment-ranked stock universe |
| `/heatmap` | `Heatmap` | Public | — | — | REST via page | lazy + Suspense | Sector/market heatmap |
| `/movers` | `Movers` | Public | — | — | REST via page | lazy + Suspense | Top gainers and losers |
| `/tape` | `Tape` | Public | — | — | REST + WS (live trades) | lazy + Suspense | Time & sales tape |
| `/tape/:symbol` | `Tape` | Public | — | `symbol` | REST + WS | lazy + Suspense | Symbol-scoped tape |
| `/crypto` | `Crypto` | Public | — | — | REST via page | lazy + Suspense | Crypto snapshot + bars |
| `/analysis` | `Analysis` | Public | — | — | REST + SymbolContext | lazy + Suspense | Holistic stock analysis |
| `/analysis/:symbol` | `Analysis` | Public | — | `symbol` | REST | lazy + Suspense | Symbol-pinned analysis |
| `/fundamentals` | `Fundamentals` | Public | — | — | REST + SymbolContext | lazy + Suspense | Fundamentals browser |
| `/fundamentals/:symbol` | `Fundamentals` | Public | — | `symbol` | REST | lazy + Suspense | Symbol-pinned fundamentals |
| `/options` | `Options` | Public | — | — | REST + SymbolContext | lazy + Suspense | Options chain browser |
| `/options/:symbol` | `Options` | Public | — | `symbol` | REST | lazy + Suspense | Symbol-pinned options |
| `/earnings` | `Earnings` | Public | — | — | REST via page | lazy + Suspense | Earnings calendar |
| `/dividends` | `Dividends` | Public | — | — | REST + SymbolContext | lazy + Suspense | Dividend history |
| `/dividends/:symbol` | `Dividends` | Public | — | `symbol` | REST | lazy + Suspense | Symbol-pinned dividends |
| `/insiders` | `Insiders` | Public | — | — | REST + SymbolContext | lazy + Suspense | Insider transactions |
| `/insiders/:symbol` | `Insiders` | Public | — | `symbol` | REST | lazy + Suspense | Symbol-pinned insiders |
| `/compare` | `Compare` | Public | — | — | REST + SymbolContext | lazy + Suspense | Multi-symbol chart comparison |
| `/workspace` | `Workspace` | Private | RequireAuth | — | Zustand store | lazy + Suspense | Personal trading dashboard |
| `/dashboard` | — | Private | RequireAuth | — | — | redirect | Alias → `/workspace` |
| `/trade` | `Trade` | Private | RequireAuth | — | REST via page | lazy + Suspense | Quick order entry |
| `/paper` | `Paper` | Private | RequireAuth | — | REST via page | lazy + Suspense | Paper trading simulator |
| `/orders` | `Orders` | Private | RequireAuth | — | Zustand `orders` | lazy + Suspense | Order history and management |
| `/positions` | `Positions` | Private | RequireAuth | — | Zustand `positions` | lazy + Suspense | Open positions |
| `/watchlists` | `Watchlists` | Private | RequireAuth | — | REST via page | lazy + Suspense | User watchlists |
| `/strategies` | `Strategies` | Private | RequireAuth | — | Zustand `strategies` | lazy + Suspense | Strategy CRUD and status |
| `/backtests` | `Backtests` | Private | RequireAuth | — | Zustand `backtests` | lazy + Suspense | Backtest run list |
| `/backtests/:id` | `BacktestDetail` | Private | RequireAuth | `id` — backtest UUID | REST | lazy + Suspense | Single backtest results |
| `/backtest-compare` | `BacktestCompare` | Private | RequireAuth | — | REST via page | lazy + Suspense | Side-by-side backtest comparison |
| `/optimizer` | `Optimizer` | Private | RequireAuth | — | REST via page | lazy + Suspense | Strategy parameter optimizer |
| `/optimizer/:id` | `OptimizerDetail` | Private | RequireAuth | `id` | REST | lazy + Suspense | Optimizer run results |
| `/risk` | `RiskAnalytics` | Private | RequireAuth | — | REST via page | lazy + Suspense | Portfolio risk metrics |
| `/alerts` | `Alerts` | Private | RequireAuth | — | Zustand `alerts` | lazy + Suspense | System alert list |
| `/price-alerts` | `PriceAlerts` | Private | RequireAuth | — | REST via page | lazy + Suspense | User price alert management |
| `/audit` | `AuditLog` | Private | RequireAuth | — | REST via page | lazy + Suspense | System audit trail |
| `/settings` | `Settings` | Private | RequireAuth | — | REST + Zustand | lazy + Suspense | Platform settings (trading toggles) |
| `/users` | `Users` | Private | RequireAuth | — | REST via page | lazy + Suspense | Admin user management |
| `/*` | — | Public | — | — | — | redirect | Catch-all → `/` |

## Deep-Link / Param Handling

Pages that accept a `:symbol` URL param use the `useSymbolPage(routeSym)` helper (`lib/SymbolContext.jsx:84-94`). On mount, if the URL param is present it calls `setSymbol()` to update the global SymbolContext (overriding whatever was active), then the page reads `symbol` from context for all API calls. This means a direct URL like `/analysis/TSLA` will navigate the whole app to TSLA, not just that page.

The `:id` params on `/backtests/:id` and `/optimizer/:id` are UUIDs used directly in REST calls; no context propagation.

## External Entry Points

Any URL under the app (e.g. `/workspace`, `/analysis/AAPL`) can be bookmarked and deep-linked directly — the SPA catch-all handles unknown paths on first load. The server must serve `index.html` for all non-asset paths for this to work in production.
