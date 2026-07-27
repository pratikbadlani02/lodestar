# 04 — Data Model

## State Store (Zustand)

Single store created with `create()` in `frontend/src/lib/store.js`.

| Slice / key | Shape | Origin | Updated by | Persisted to | Consumers |
|---|---|---|---|---|---|
| `control` | `{ kill_switch_active, strategies_enabled, is_live, trading_enabled }` ⚠️ inferred from usage | Server | `loadControl()` on boot, 30 s refresh, `control_update` WS event | — | Sidebar status block, Settings, Layout |
| `health` | `{ status, services: {...} }` ⚠️ inferred | Server | `loadHealth()` on boot, 30 s refresh | — | StatusBar |
| `account` | `{ portfolio_value, cash, buying_power, … }` ⚠️ inferred | Server | `loadAccount()` on boot, `order_update`/`position_closed` WS, `market:change` event | — | Workspace, Trade, Paper |
| `positions` | `Position[]` ⚠️ inferred shape | Server | `loadPositions()` on boot, `order_update`/`position_closed` WS, `market:change` event | — | Positions, Workspace, Trade |
| `orders` | `Order[]` ⚠️ inferred shape | Server | `loadOrders()` on boot, `order_update` WS, 30 s refresh | — | Orders, Workspace, Trade |
| `ordersLoaded` | `boolean` | Client | Set `true` after first `loadOrders()` resolves | — | Orders (skeleton vs. empty guard) |
| `alerts` | `Alert[]` ⚠️ inferred shape | Server | `loadAlerts()` on boot, `alert`/`price_alert_triggered` WS, 30 s refresh | — | Alerts, Layout (badge) |
| `alertsLoaded` | `boolean` | Client | Set `true` after first `loadAlerts()` resolves | — | Alerts |
| `unackCount` | `number` | Derived | Computed from `alerts.filter(a => !a.acknowledged).length` | — | Layout sidebar badge |
| `strategies` | `Strategy[]` ⚠️ inferred shape | Server | `loadStrategies()` on boot, `strategy_update`/`strategy_signal` WS, 30 s refresh | — | Strategies, Sidebar |
| `strategiesLoaded` | `boolean` | Client | Set `true` after first `loadStrategies()` resolves | — | Strategies |
| `backtests` | `Backtest[]` ⚠️ inferred shape | Server | `loadBacktests()` on boot, `backtest_completed` WS, 30 s refresh | — | Backtests |
| `backtestsLoaded` | `boolean` | Client | Set `true` after first `loadBacktests()` resolves | — | Backtests |
| `wsConnected` | `boolean` | Client | WS `open`/`close` events | — | StatusBar |
| `wsLastMessage` | `object \| null` | Client | Set on every WS message | — | StatusBar |

## Context / Client State

| Context | Shape | Storage key | Cross-tab sync | Consumers |
|---|---|---|---|---|
| `ThemeContext` | `{ theme: 'dark'\|'light', setTheme, toggle }` | `localStorage.quant_theme_v1` | Yes (storage event) | TopBar, any component using `useTheme()` |
| `DensityContext` | `{ density: 'cozy'\|'compact'\|'comfortable', setDensity }` | `localStorage.quant_density_v1` | No | All table/list pages (CSS var `--row-py`/`--row-px`) |
| `MarketContext` | `{ market: 'us'\|'in', setMarket }` | `localStorage.quant_market_v1` | No (dispatches `market:change` CustomEvent) | TopBar, store loaders, api.js `mkt()` fallback |
| `SymbolContext` | `{ symbol: string, setSymbol, recents: string[] }` | `localStorage.quant_active_symbol_v1`, `localStorage.quant_symbol_recents_v1` | Yes (storage event) | CommandPalette, SymbolHeader, all research pages |

## API Endpoint Catalog

Full REST base: `/api` (proxied from Vite dev server). Auth header: `Authorization: Bearer <token>` from `sessionStorage.quant_token`. Source: `frontend/src/lib/api.js`.

| Method | Path | Caller (fn) | Request shape | Response shape | Auth | Notes |
|---|---|---|---|---|---|---|
| POST | `/auth/login` | `api.login` | `application/x-www-form-urlencoded`: `username`, `password` | `{ access_token, token_type }` | No | OAuth2 password flow |
| GET | `/auth/me` | `api.getMe` | — | ⚠️ inferred `{ username, role }` | Yes | Current user info |
| GET | `/health` | `api.health` | — | ⚠️ inferred `{ status, services }` | No | Service health check |
| GET | `/control/state` | `api.getControl` | — | ⚠️ inferred `{ kill_switch_active, strategies_enabled, is_live, trading_enabled }` | Yes | Trading control flags |
| POST | `/control/kill` | `api.kill` | `{ reason: string }` | — | Yes | Activate kill switch |
| POST | `/control/resume` | `api.resume` | — | — | Yes | Deactivate kill switch |
| POST | `/control/strategies/pause` | `api.pauseStrategies` | — | — | Yes | Pause all strategies |
| POST | `/control/strategies/resume` | `api.resumeStrategies` | — | — | Yes | Resume all strategies |
| POST | `/control/liquidate` | `api.liquidate` | `{ reason: string }` | — | Yes | Emergency liquidate all positions |
| GET | `/account` | `api.getAccount` | `?market=us\|in` | ⚠️ inferred `{ portfolio_value, cash, buying_power, … }` | Yes | Brokerage account summary |
| GET | `/positions` | `api.getPositions` | `?market=us\|in` | `Position[]` | Yes | Open positions |
| GET | `/market/markets` | `api.getMarkets` | — | ⚠️ inferred market list | No | Available markets |
| GET | `/strategies/available` | `api.listStrategyTypes` | — | `StrategyType[]` | Yes | Registered strategy classes |
| GET | `/strategies` | `api.listStrategies` | — | `Strategy[]` | Yes | User's strategies |
| POST | `/strategies` | `api.createStrategy` | `{ strategy_type, symbol, params, … }` ⚠️ inferred | `Strategy` | Yes | Create strategy |
| PATCH | `/strategies/:id` | `api.updateStrategy` | Partial `Strategy` | `Strategy` | Yes | Update strategy params/status |
| DELETE | `/strategies/:id` | `api.deleteStrategy` | — | 204 | Yes | Delete strategy |
| GET | `/orders` | `api.listOrders` | `?limit=N` | `Order[]` | Yes | Order history |
| POST | `/orders` | `api.submitOrder` | `{ symbol, side, qty, type, … }` ⚠️ inferred | `Order` | Yes | Submit order |
| POST | `/orders/:id/sync` | `api.syncOrder` | — | `Order` | Yes | Sync order status with broker |
| GET | `/backtests` | `api.listBacktests` | — | `Backtest[]` | Yes | Backtest list |
| POST | `/backtests` | `api.createBacktest` | `{ strategy_type, symbol, start_date, end_date, params, … }` ⚠️ inferred | `Backtest` | Yes | Queue new backtest |
| GET | `/backtests/:id` | `api.getBacktest` | — | `BacktestResult` | Yes | Backtest summary + stats |
| GET | `/backtests/:id/trades` | `api.getBacktestTrades` | — | `BacktestTrade[]` | Yes | Trade list for a backtest |
| DELETE | `/backtests/:id` | `api.deleteBacktest` | — | 204 | Yes | Delete backtest |
| GET | `/market/ohlcv/:symbol` | `api.getOhlcv` | `?days=N&timeframe=1d` | `OhlcvBar[]` | No | Cached OHLCV bars |
| POST | `/market/fetch/:symbol` | `api.fetchMarket` | `?lookback_days=N&timeframe=1Day` | — | Yes | Force-fetch bars from Alpaca |
| GET | `/audit` | `api.getAudit` | `?limit=N` | `AuditEntry[]` | Yes | Audit log |
| GET | `/analytics/equity-curve` | `api.getEquityCurve` | `?days=N` | `EquityPoint[]` | Yes | Portfolio equity curve |
| GET | `/analytics/portfolio-risk` | `api.getPortfolioRisk` | `?lookback_days=N` | ⚠️ inferred risk metrics | Yes | VaR, beta, correlation |
| GET | `/analytics/strategy-pnl` | `api.getStrategyPnl` | `?days=N` | `StrategyPnl[]` | Yes | Per-strategy P&L |
| GET | `/alerts` | `api.listAlerts` | `?limit=N&acknowledged=…` | `Alert[]` | Yes | System alerts |
| POST | `/alerts/:id/ack` | `api.ackAlert` | — | — | Yes | Acknowledge alert |
| GET | `/optimizer` | `api.listOptimizerRuns` | — | `OptimizerRun[]` | Yes | Optimizer run list |
| POST | `/optimizer` | `api.createOptimizerRun` | ⚠️ inferred optimizer params | `OptimizerRun` | Yes | Start optimizer |
| GET | `/optimizer/:id` | `api.getOptimizerRun` | — | `OptimizerResult` | Yes | Optimizer run results |
| GET | `/export/orders.csv` | `api.exportOrdersCsv` | — | CSV file (window.open) | Yes | Export orders |
| GET | `/export/backtest/:id/trades.csv` | `api.exportBacktestCsv` | — | CSV file (window.open) | Yes | Export backtest trades |
| GET | `/watchlists` | `api.listWatchlists` | `?market=us\|in` | `Watchlist[]` | Yes | User watchlists |
| POST | `/watchlists` | `api.createWatchlist` | `{ name, symbols[] }` ⚠️ inferred | `Watchlist` | Yes | Create watchlist |
| PATCH | `/watchlists/:id` | `api.updateWatchlist` | Partial `Watchlist` | `Watchlist` | Yes | Update watchlist |
| DELETE | `/watchlists/:id` | `api.deleteWatchlist` | — | 204 | Yes | Delete watchlist |
| GET | `/watchlists/:id/quotes` | `api.getWatchlistQuotes` | — | `Quote[]` | Yes | Live quotes for watchlist |
| GET | `/market/news` | `api.getNews` | `?symbols=…&limit=N&market=us\|in` | `NewsItem[]` | No | Market news |
| GET | `/market/snapshots` | `api.getSnapshots` | `?symbols=…&market=us\|in` | `Snapshot{}` | No | Multi-symbol snapshots |
| GET | `/market/screener` | `api.screenStocks` | `?price_min=…&pe_max=…&market=…` | `ScreenerResult[]` | No | Filtered stock screener |
| GET | `/price-alerts` | `api.listPriceAlerts` | — | `PriceAlert[]` | Yes | Price alerts |
| POST | `/price-alerts` | `api.createPriceAlert` | `{ symbol, condition, price }` ⚠️ inferred | `PriceAlert` | Yes | Create price alert |
| DELETE | `/price-alerts/:id` | `api.deletePriceAlert` | — | 204 | Yes | Delete price alert |
| GET | `/market/profile/:symbol` | `api.getProfile` | — | ⚠️ inferred company profile | No | Company profile |
| GET | `/market/fundamentals/:symbol` | `api.getFundamentals` | `?period=annual\|quarterly` | ⚠️ inferred financials | No | P&L, balance sheet, cash flow |
| GET | `/market/options/:symbol/expirations` | `api.getOptionExpirations` | — | `string[]` | No | Options expiration dates |
| GET | `/market/options/:symbol` | `api.getOptionChain` | `?expiry=YYYY-MM-DD` | `OptionChain` | No | Options chain |
| GET | `/market/earnings/:symbol` | `api.getEarnings` | — | `EarningsEvent[]` | No | Earnings history |
| GET | `/market/earnings/calendar` | `api.getEarningsCalendar` | `?symbols=…` | ⚠️ inferred calendar | No | Upcoming earnings calendar |
| GET | `/market/analysts/:symbol` | `api.getAnalysts` | — | ⚠️ inferred analyst ratings | No | Analyst recommendations |
| GET | `/market/holders/:symbol` | `api.getHolders` | — | ⚠️ inferred holder data | No | Institutional/insider holders |
| GET | `/market/dividends/:symbol` | `api.getDividends` | — | `DividendEvent[]` | No | Dividend history |
| GET | `/market/splits/:symbol` | `api.getSplits` | — | ⚠️ inferred | No | Stock splits |
| GET | `/market/sustainability/:symbol` | `api.getSustainability` | — | ⚠️ inferred ESG | No | ESG sustainability |
| GET | `/market/recommendation-trend/:symbol` | `api.getRecommendationTrend` | — | ⚠️ inferred | No | Analyst trend data |
| GET | `/market/trades/:symbol` | `api.getTrades` | `?limit=N` | `Trade[]` | No | Tick-level trades (tape) |
| GET | `/market/quotes/:symbol` | `api.getQuotes` | `?limit=N` | `Quote[]` | No | Level-1 quotes |
| GET | `/market/movers` | `api.getMovers` | `?top=N&market=us\|in` | `Mover[]` | No | Top gainers/losers |
| GET | `/market/most-actives` | `api.getMostActives` | `?top=N&by=volume&market=us\|in` | `ActiveStock[]` | No | Most active stocks |
| GET | `/market/crypto/snapshots` | `api.getCryptoSnapshots` | `?symbols=…` | ⚠️ inferred | No | Crypto price snapshots |
| GET | `/market/crypto/bars/:symbol` | `api.getCryptoBars` | `?days=N&timeframe=1Day` | `OhlcvBar[]` | No | Crypto OHLCV bars |
| GET | `/market/news-sentiment/:symbol` | `api.getNewsSentiment` | `?limit=N` | ⚠️ inferred sentiment | No | Symbol news sentiment |
| GET | `/market/sentiment-scan/universes` | `api.getSentimentUniverses` | `?market=us\|in` | `string[]` | No | Available scanner universes |
| GET | `/market/sentiment-scan` | `api.getSentimentScan` | `?universe=…&symbols=…&refresh=…` | `SentimentResult[]` | No | Ranked sentiment scan |
| GET | `/market/analysis/:symbol` | `api.getAnalysis` | `?include_news=true` | ⚠️ inferred holistic analysis | No | Combined technical + news analysis |
| GET | `/market/earnings-surprise/:symbol` | `api.getEarningsSurprise` | — | ⚠️ inferred | No | Historical earnings surprises |
| GET | `/market/short-interest/:symbol` | `api.getShortInterest` | — | ⚠️ inferred | No | Short interest data |
| GET | `/users` | `api.listUsers` | — | `User[]` | Yes (admin) | Admin: list users |
| POST | `/users` | `api.createUser` | `{ username, password, role }` ⚠️ inferred | `User` | Yes (admin) | Admin: create user |
| DELETE | `/users/:id` | `api.deleteUser` | — | 204 | Yes (admin) | Admin: delete user |
| PATCH | `/users/:id/role` | `api.updateUserRole` | `?role=…` | `User` | Yes (admin) | Admin: change user role |
