# 04 — Data Model

> ⚠️ JavaScript codebase — no declared types. Shapes below are reconstructed from API callers and store writes; field-level shapes marked ⚠️ should be confirmed against `app/core/schemas.py`.

## State store (Zustand)

Source: [lib/store.js](../../frontend/src/lib/store.js#L31-L150).

| Slice / key | Shape | Origin | Updated by | Persisted to | Consumers |
|---|---|---|---|---|---|
| `control` | object\|null (`is_live`, `trading_enabled`, `strategies_enabled`, …) | server | `loadControl`, WS `control_update` | — | Layout, Settings |
| `health` | object\|null | server | `loadHealth` | — | Layout, StatusBar |
| `account` | object\|null (market-scoped) | server | `loadAccount`, WS, `market:change` | — | Workspace, Paper |
| `positions` | object[] | server | `loadPositions`, WS | — | Positions, Workspace |
| `orders` | object[] | server | `loadOrders`, WS `order_update` | — | Orders, Workspace |
| `ordersLoaded` | boolean | client | `loadOrders` finally | — | Orders (skeleton gate) |
| `alerts` | object[] | server | `loadAlerts`, WS | — | Alerts |
| `unackCount` | number | derived | `loadAlerts` | — | Layout badge |
| `strategies` | object[] | server | `loadStrategies`, WS | — | Strategies |
| `backtests` | object[] | server | `loadBacktests`, WS `backtest_completed` | — | Backtests |
| `wsConnected` | boolean | client | `_setWs` | — | StatusBar |
| `wsLastMessage` | object\|null | client | `_onWsMessage` | — | Workspace/Tape |

`*Loaded` flags distinguish "loading" from "loaded empty" ([store.js](../../frontend/src/lib/store.js#L60-L66)). Selectors exported at [store.js](../../frontend/src/lib/store.js#L196-L210). Loaders deduped via `coalesce()` ([store.js](../../frontend/src/lib/store.js#L22-L30)).

## Context / client state

| Context | Shape | Storage key | Cross-tab sync | Consumers |
|---|---|---|---|---|
| `ThemeContext` | `{ theme:'light'\|'dark', setTheme, toggle }` | `quant_theme_v1` + `data-theme` | Yes (`storage`) | global chrome |
| `MarketContext` | `{ market:'us'\|'in', meta, setMarket }` | `quant_market_v1` | Yes | market-scoped pages |
| `SymbolContext` | `{ symbol, setSymbol, recents:string[], removeRecent }` | `quant_active_symbol_v1`, `quant_symbol_recents_v1` | Yes | symbol pages |
| `DensityContext` | UI density preference ⚠️ | localStorage ⚠️ | ⚠️ | layout density |

`MarketMeta` ([MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L17-L26)): `{ code, label, short, flag, currency, symbol, suffix, defaultSymbol }` — us⇒USD `$`/`AAPL`; in⇒INR `₹`/`.NS`/`RELIANCE.NS`.

## API endpoint catalog (selected)

Full client: [lib/api.js](../../frontend/src/lib/api.js). `Request/Response` shapes are ⚠️ inferred.

| Method | Path | Caller (fn) | Request shape | Response shape | Auth | Notes |
|---|---|---|---|---|---|---|
| POST | `/auth/login` | `login` | form `{username,password}` | `{ access_token }` | No | sets token |
| GET | `/auth/me` | `getMe` | — | `{ id, username, role }` ⚠️ | Yes | current user |
| GET | `/control/state` | `getControl` | — | control object | Yes | safety state |
| GET | `/health` | `health` | — | health object | Opt | status |
| GET | `/account?market=` | `getAccount` | — | account object | Yes | market-scoped |
| GET | `/positions?market=` | `getPositions` | — | position[] | Yes | market-scoped |
| GET | `/orders?limit=` | `listOrders` | — | order[] | Yes | recent orders |
| POST | `/orders` | `submitOrder` | `{symbol,side,qty,type,…}` ⚠️ | order | Yes | place order |
| GET/POST | `/strategies` | `listStrategies`/`createStrategy` | `{name,strategy_type,symbols,params,…}` ⚠️ | strategy[] | Yes | CRUD |
| GET/POST | `/backtests` | `listBacktests`/`createBacktest` | `{strategy_type,symbols,start,end,params}` ⚠️ | backtest[] | Yes | runs |
| GET | `/analytics/portfolio-risk` | `getPortfolioRisk` | — | risk object | Yes | risk page |
| GET | `/market/screener` | `screenStocks` | querystring | result[] | Opt | + market scope |
| GET | `/market/analysis/:symbol` | `getAnalysis` | — | analysis object | Opt | holistic |
| GET | `/export/orders.csv` | `exportOrdersCsv` | — | CSV (window.open) | Yes | bypasses wrapper |

## Client vs server state

| Category | Location | Examples |
|---|---|---|
| Server (canonical) | Zustand store | account, positions, orders, alerts, strategies, backtests, control, health |
| Ephemeral server reads | page-local `useState` | snapshots, news, fundamentals, options, movers, tape |
| Client/UI | Context + localStorage | theme, density, market, symbol+recents, sidebar/nav collapse |
| Session/auth | sessionStorage | `quant_token` |
