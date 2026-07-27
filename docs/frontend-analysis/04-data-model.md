# Data Model

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## State Store (Zustand)

Single store defined in `lib/store.js`. No middleware (no immer, no devtools, no persist middleware — persistence is manual via context-level localStorage writes for UI preferences, not the store).

| Slice / key | Shape | Origin (server/client) | Updated by | Persisted to | Consumers |
|---|---|---|---|---|---|
| `control` | `{ is_live, trading_enabled, strategies_enabled, ... }` ⚠️ UNVERIFIED — full shape from backend schema | server | `loadControl()`, WS `control_update` | — | `Layout.jsx`, `Workspace`, `Settings` |
| `health` | `{ status: 'ok'|..., ... }` ⚠️ UNVERIFIED | server | `loadHealth()` | — | `Layout.jsx` (sidebar status), `StatusBar` |
| `account` | `{ equity, cash, buying_power, ... }` ⚠️ UNVERIFIED | server (market-scoped) | `loadAccount()`, WS `order_update`, `position_closed` | — | `Workspace`, `RiskAnalytics` |
| `positions` | `[{ symbol, qty, side, avg_entry, market_value, unrealized_pl, ... }]` ⚠️ UNVERIFIED | server (market-scoped) | `loadPositions()`, WS `order_update`, `position_closed` | — | `Positions`, `Workspace` |
| `orders` | `[{ id, symbol, qty, side, status, filled_at, ... }]` ⚠️ UNVERIFIED | server | `loadOrders(limit=100)`, WS `order_update` | — | `Orders`, `Workspace` |
| `ordersLoaded` | `boolean` | client | Set `true` after `loadOrders()` resolves (success or error) | — | `Orders` (distinguish loading vs empty) |
| `alerts` | `[{ id, type, message, acknowledged, created_at, ... }]` ⚠️ UNVERIFIED | server | `loadAlerts()`, WS `alert`, `price_alert_triggered` | — | `Alerts`, `Layout` (badge count) |
| `alertsLoaded` | `boolean` | client | Set `true` after `loadAlerts()` resolves | — | `Alerts` |
| `unackCount` | `number` | client (derived from `alerts`) | `loadAlerts()` — counts `a.acknowledged === false` | — | `Layout.jsx` sidebar badge |
| `strategies` | `[{ id, type, status, params, ... }]` ⚠️ UNVERIFIED | server | `loadStrategies()`, WS `strategy_update`, `strategy_signal` | — | `Strategies`, `Workspace` |
| `strategiesLoaded` | `boolean` | client | Set `true` after `loadStrategies()` resolves | — | `Strategies` |
| `backtests` | `[{ id, strategy, status, return_pct, trades, ... }]` ⚠️ UNVERIFIED | server | `loadBacktests()`, WS `backtest_completed` | — | `Backtests` |
| `backtestsLoaded` | `boolean` | client | Set `true` after `loadBacktests()` resolves | — | `Backtests` |
| `wsConnected` | `boolean` | client | `_setWs()` on WS `open`/`close` events | — | `StatusBar` |
| `wsLastMessage` | last parsed WS message object | client | `_onWsMessage()` | — | (debugging) |

## Context / Client State

| Context | Shape | Storage key | Cross-tab sync | Consumers |
|---|---|---|---|---|
| `ThemeContext` | `{ theme: 'dark'|'light', setTheme(t), toggle() }` | `quant_theme_v1` (localStorage) | Yes — `storage` event (`ThemeContext.jsx:39-48`) | `Layout.jsx` (Toaster), `Settings`, all themed components |
| `DensityContext` | `{ density: 'cozy'|'compact'|'comfortable', setDensity(d), toggle(), cycle() }` | `quant_density_v1` (localStorage) | No | All `t-dense` tables across pages |
| `MarketContext` | `{ market: 'us'|'in', meta: { code, label, short, flag, currency, symbol, suffix, defaultSymbol }, setMarket(code) }` | `quant_market_v1` (localStorage) | Yes — `storage` event (`MarketContext.jsx:56-62`); also dispatches `market:change` CustomEvent | `TopBar`, `api.js:mkt()`, `store.js:currentMarket()` |
| `SymbolContext` | `{ symbol: string, setSymbol(s), recents: string[] (max 12), removeRecent(s) }` | `quant_active_symbol_v1` + `quant_symbol_recents_v1` (localStorage) | Yes — `storage` event (`SymbolContext.jsx:57-65`) | `Stocks`, `Analysis`, `Options`, `Fundamentals`, `Tape`, `Dividends`, `Insiders`, `Compare`, `Workspace` |

## API Endpoint Catalog

All calls go through `lib/api.js:request()`. Base URL: `/api` (proxied to `:8000` in dev). Auth header: `Authorization: Bearer <token>` from `sessionStorage.quant_token` when present.

| Method | Path | Caller (fn) | Request shape | Response shape | Auth | Notes |
|---|---|---|---|---|---|---|
| POST | `/auth/login` | `api.login(u,p)` | `application/x-www-form-urlencoded`: `username`, `password` | `{ access_token, token_type }` | No | Uses raw `fetch`, not `request()` wrapper |
| GET | `/auth/me` | `api.getMe()` | — | ⚠️ UNVERIFIED | Yes | Current user info |
| GET | `/health` | `api.health()` | — | `{ status: 'ok'|... }` ⚠️ UNVERIFIED | No | Backend health check |
| GET | `/control/state` | `api.getControl()` | — | `{ is_live, trading_enabled, strategies_enabled, ... }` ⚠️ UNVERIFIED | Yes | Trading system state |
| POST | `/control/kill` | `api.kill(reason)` | `{ reason: string }` | — | Yes | Emergency halt |
| POST | `/control/resume` | `api.resume()` | — | — | Yes | Resume after halt |
| POST | `/control/strategies/pause` | `api.pauseStrategies()` | — | — | Yes | Pause all strategy execution |
| POST | `/control/strategies/resume` | `api.resumeStrategies()` | — | — | Yes | Resume strategy execution |
| POST | `/control/liquidate` | `api.liquidate(reason)` | `{ reason: string }` | — | Yes | Liquidate all positions |
| GET | `/account` | `api.getAccount(market)` | query: `market` | ⚠️ UNVERIFIED account object | Yes | Account summary |
| GET | `/positions` | `api.getPositions(market)` | query: `market` | ⚠️ UNVERIFIED position array | Yes | Open positions |
| GET | `/strategies/available` | `api.listStrategyTypes()` | — | strategy type list ⚠️ UNVERIFIED | Yes | Available strategy templates |
| GET | `/strategies` | `api.listStrategies()` | — | strategy array ⚠️ UNVERIFIED | Yes | Configured strategies |
| POST | `/strategies` | `api.createStrategy(d)` | strategy config object ⚠️ UNVERIFIED | created strategy ⚠️ UNVERIFIED | Yes | Create strategy |
| PATCH | `/strategies/:id` | `api.updateStrategy(id,d)` | partial strategy config ⚠️ UNVERIFIED | updated strategy ⚠️ UNVERIFIED | Yes | Edit strategy |
| DELETE | `/strategies/:id` | `api.deleteStrategy(id)` | — | 204 | Yes | Delete strategy |
| GET | `/orders` | `api.listOrders(limit)` | query: `limit` (default 50) | order array ⚠️ UNVERIFIED | Yes | Order history |
| POST | `/orders` | `api.submitOrder(d)` | order params ⚠️ UNVERIFIED | created order ⚠️ UNVERIFIED | Yes | Place order |
| POST | `/orders/:id/sync` | `api.syncOrder(id)` | — | ⚠️ UNVERIFIED | Yes | Sync order status from broker |
| GET | `/backtests` | `api.listBacktests()` | — | backtest array ⚠️ UNVERIFIED | Yes | Backtest runs |
| POST | `/backtests` | `api.createBacktest(d)` | backtest config ⚠️ UNVERIFIED | created backtest ⚠️ UNVERIFIED | Yes | Run backtest |
| GET | `/backtests/:id` | `api.getBacktest(id)` | — | backtest detail ⚠️ UNVERIFIED | Yes | Single backtest results |
| GET | `/backtests/:id/trades` | `api.getBacktestTrades(id)` | — | trades array ⚠️ UNVERIFIED | Yes | Trades from a backtest |
| DELETE | `/backtests/:id` | `api.deleteBacktest(id)` | — | 204 | Yes | Delete backtest |
| GET | `/market/ohlcv/:symbol` | `api.getOhlcv(sym,days,tf)` | query: `days`, `timeframe` | OHLCV bars ⚠️ UNVERIFIED | No | Historical bars |
| POST | `/market/fetch/:symbol` | `api.fetchMarket(sym,days,tf)` | query: `lookback_days`, `timeframe` | ⚠️ UNVERIFIED | Yes | Trigger market data pull |
| GET | `/audit` | `api.getAudit(limit)` | query: `limit` | audit entries ⚠️ UNVERIFIED | Yes | System audit log |
| GET | `/analytics/equity-curve` | `api.getEquityCurve(days)` | query: `days` | equity curve ⚠️ UNVERIFIED | Yes | P&L history |
| GET | `/analytics/portfolio-risk` | `api.getPortfolioRisk(days)` | query: `lookback_days` | risk metrics ⚠️ UNVERIFIED | Yes | VaR, drawdown etc. |
| GET | `/analytics/strategy-pnl` | `api.getStrategyPnl(days)` | query: `days` | per-strategy P&L ⚠️ UNVERIFIED | Yes | Strategy performance |
| GET | `/alerts` | `api.listAlerts(params)` | query: `limit`, etc. | alert array ⚠️ UNVERIFIED | Yes | System alerts |
| POST | `/alerts/:id/ack` | `api.ackAlert(id)` | — | ⚠️ UNVERIFIED | Yes | Acknowledge alert |
| GET | `/optimizer` | `api.listOptimizerRuns()` | — | optimizer run array ⚠️ UNVERIFIED | Yes | Optimizer history |
| POST | `/optimizer` | `api.createOptimizerRun(d)` | optimizer config ⚠️ UNVERIFIED | created run ⚠️ UNVERIFIED | Yes | Start optimizer |
| GET | `/optimizer/:id` | `api.getOptimizerRun(id)` | — | optimizer result ⚠️ UNVERIFIED | Yes | Optimizer run detail |
| GET | `/export/orders.csv` | `api.exportOrdersCsv()` | — | CSV file (new tab) | Yes | Download orders CSV |
| GET | `/export/backtest/:id/trades.csv` | `api.exportBacktestCsv(id)` | — | CSV file (new tab) | Yes | Download backtest trades CSV |
| GET | `/watchlists` | `api.listWatchlists(market)` | query: `market` | watchlist array ⚠️ UNVERIFIED | Yes | User watchlists |
| POST | `/watchlists` | `api.createWatchlist(d)` | watchlist data ⚠️ UNVERIFIED | created watchlist ⚠️ UNVERIFIED | Yes | Create watchlist |
| PATCH | `/watchlists/:id` | `api.updateWatchlist(id,d)` | partial watchlist ⚠️ UNVERIFIED | updated watchlist ⚠️ UNVERIFIED | Yes | Edit watchlist |
| DELETE | `/watchlists/:id` | `api.deleteWatchlist(id)` | — | 204 | Yes | Delete watchlist |
| GET | `/watchlists/:id/quotes` | `api.getWatchlistQuotes(id)` | — | quote array ⚠️ UNVERIFIED | Yes | Live quotes for watchlist |
| GET | `/market/news` | `api.getNews(syms,limit,mkt)` | query: `symbols`, `limit`, `market` | news items ⚠️ UNVERIFIED | No | Market/symbol news |
| GET | `/market/snapshots` | `api.getSnapshots(syms,mkt)` | query: `symbols`, `market` | snapshot map ⚠️ UNVERIFIED | No | Multi-symbol quotes |
| GET | `/market/screener` | `api.screenStocks(params,mkt)` | query: various filter params | screener results ⚠️ UNVERIFIED | No | Stock screener |
| GET | `/market/markets` | `api.getMarkets()` | — | market list ⚠️ UNVERIFIED | No | Available markets |
| GET | `/price-alerts` | `api.listPriceAlerts()` | — | price alert array ⚠️ UNVERIFIED | Yes | User price alerts |
| POST | `/price-alerts` | `api.createPriceAlert(d)` | `{ symbol, condition, ... }` ⚠️ UNVERIFIED | created alert ⚠️ UNVERIFIED | Yes | Create price alert |
| DELETE | `/price-alerts/:id` | `api.deletePriceAlert(id)` | — | 204 | Yes | Delete price alert |
| GET | `/market/profile/:symbol` | `api.getProfile(sym)` | — | company profile ⚠️ UNVERIFIED | No | Company overview |
| GET | `/market/fundamentals/:symbol` | `api.getFundamentals(sym,period)` | query: `period` | financials ⚠️ UNVERIFIED | No | Income/balance/cash flow |
| GET | `/market/options/:symbol/expirations` | `api.getOptionExpirations(sym)` | — | expiry date list ⚠️ UNVERIFIED | No | Option expiry dates |
| GET | `/market/options/:symbol` | `api.getOptionChain(sym,expiry)` | query: `expiry` | option chain ⚠️ UNVERIFIED | No | Option chain |
| GET | `/market/earnings/:symbol` | `api.getEarnings(sym)` | — | earnings history ⚠️ UNVERIFIED | No | Earnings data |
| GET | `/market/earnings/calendar` | `api.getEarningsCalendar(syms)` | query: `symbols` | calendar ⚠️ UNVERIFIED | No | Earnings calendar |
| GET | `/market/analysts/:symbol` | `api.getAnalysts(sym)` | — | analyst ratings ⚠️ UNVERIFIED | No | Analyst recommendations |
| GET | `/market/holders/:symbol` | `api.getHolders(sym)` | — | holders ⚠️ UNVERIFIED | No | Institutional holders |
| GET | `/market/dividends/:symbol` | `api.getDividends(sym)` | — | dividend history ⚠️ UNVERIFIED | No | Dividend records |
| GET | `/market/splits/:symbol` | `api.getSplits(sym)` | — | splits ⚠️ UNVERIFIED | No | Stock splits |
| GET | `/market/sustainability/:symbol` | `api.getSustainability(sym)` | — | ESG data ⚠️ UNVERIFIED | No | ESG scores |
| GET | `/market/recommendation-trend/:symbol` | `api.getRecommendationTrend(sym)` | — | trend data ⚠️ UNVERIFIED | No | Rating trend over time |
| GET | `/market/trades/:symbol` | `api.getTrades(sym,limit)` | query: `limit` | trade prints ⚠️ UNVERIFIED | No | Recent trades (tape) |
| GET | `/market/quotes/:symbol` | `api.getQuotes(sym,limit)` | query: `limit` | quotes ⚠️ UNVERIFIED | No | Recent quotes |
| GET | `/market/movers` | `api.getMovers(top,mkt)` | query: `top`, `market` | movers ⚠️ UNVERIFIED | No | Top gainers/losers |
| GET | `/market/most-actives` | `api.getMostActives(top,by,mkt)` | query: `top`, `by`, `market` | actives ⚠️ UNVERIFIED | No | Most active stocks |
| GET | `/market/crypto/snapshots` | `api.getCryptoSnapshots(syms)` | query: `symbols` | crypto snapshots ⚠️ UNVERIFIED | No | Crypto quotes |
| GET | `/market/crypto/bars/:symbol` | `api.getCryptoBars(sym,days,tf)` | query: `days`, `timeframe` | crypto bars ⚠️ UNVERIFIED | No | Crypto OHLCV |
| GET | `/market/news-sentiment/:symbol` | `api.getNewsSentiment(sym,limit)` | query: `limit` | sentiment data ⚠️ UNVERIFIED | No | News sentiment scores |
| GET | `/market/sentiment-scan/universes` | `api.getSentimentUniverses(mkt)` | query: `market` | universe list ⚠️ UNVERIFIED | No | Available scan universes |
| GET | `/market/sentiment-scan` | `api.getSentimentScan(opts)` | query: `universe`, `symbols`, `refresh` | ranked picks ⚠️ UNVERIFIED | No | Sentiment-ranked stock list |
| GET | `/market/analysis/:symbol` | `api.getAnalysis(sym,includeNews)` | query: `include_news` | holistic analysis ⚠️ UNVERIFIED | No | Composite AI analysis |
| GET | `/market/earnings-surprise/:symbol` | `api.getEarningsSurprise(sym)` | — | surprise data ⚠️ UNVERIFIED | No | EPS surprise history |
| GET | `/market/short-interest/:symbol` | `api.getShortInterest(sym)` | — | short interest ⚠️ UNVERIFIED | No | Short interest data |
| GET | `/users` | `api.listUsers()` | — | user array ⚠️ UNVERIFIED | Yes (admin) | All platform users |
| POST | `/users` | `api.createUser(d)` | user data ⚠️ UNVERIFIED | created user ⚠️ UNVERIFIED | Yes (admin) | Create user |
| DELETE | `/users/:id` | `api.deleteUser(id)` | — | 204 | Yes (admin) | Delete user |
| PATCH | `/users/:id/role` | `api.updateUserRole(id,role)` | query: `role` | ⚠️ UNVERIFIED | Yes (admin) | Change user role |

## Client vs Server State Split

**Server state** (fetched from REST, owned by backend, invalidated by WS events): `control`, `health`, `account`, `positions`, `orders`, `alerts`, `strategies`, `backtests`, and all per-page REST data (market data, fundamentals, options, etc.).

**Client state** (never sent to server, owned entirely by the browser): `ThemeContext` (dark/light), `DensityContext` (table row density), `MarketContext` (US vs India scope), `SymbolContext` (active ticker + recent history), sidebar collapse state (localStorage `quant_sidebar_collapsed_v1`), and nav-group collapse state (localStorage `quant_nav_groups_collapsed_v1`).

There is no optimistic update pattern — all mutations wait for server confirmation before the UI reflects the change (WS invalidation then triggers a re-fetch).
