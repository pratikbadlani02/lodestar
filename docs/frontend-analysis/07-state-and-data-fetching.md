# 07 — State & Data Fetching

## Fetching Library / Pattern

No dedicated fetching library (no React Query, SWR, or Apollo). Data fetching uses two patterns:

1. **Store-backed (Zustand)** — used for live trading data that must stay in sync across pages. `loadX()` actions call the REST API and write into the store. Called on boot, on WS invalidation, and on a 30 s safety interval. `frontend/src/lib/store.js`

2. **Local `useEffect`** — used for page-specific data that doesn't need to be shared (market data, research, backtests detail). Each page fetches on mount (and when the active symbol or relevant param changes), holds the result in local `useState`, and shows a skeleton while loading.

## Cache & Invalidation Strategy

There is no client-side cache layer. Every fetch goes to the server. The Zustand store acts as a short-lived in-memory cache for the duration of the browser session.

| Layer | Mechanism | TTL |
|---|---|---|
| Zustand store (live trading data) | WS event invalidation + 30 s safety refresh | ~30 s max stale |
| Page-local state (research data) | Re-fetched on symbol change or page remount | N/A (no expiry) |
| OHLCV bars | Cached server-side in `ohlcv` PostgreSQL table; not re-requested if already stored | Server-side |

## Real-Time Events

WebSocket URL: `ws[s]://<host>/api/ws`. Auto-reconnects after 5 s on close. Keepalive ping every 30 s. Source: `frontend/src/lib/api.js:182-198`, `frontend/src/lib/store.js:99-137`.

| Channel | Event / message type | Effect on state | Source |
|---|---|---|---|
| `/api/ws` | `order_update` | Triggers `loadOrders()`, `loadPositions()`, `loadAccount()` | `frontend/src/lib/store.js:102-106` |
| `/api/ws` | `position_closed` | Triggers `loadPositions()`, `loadAccount()` | `frontend/src/lib/store.js:107-110` |
| `/api/ws` | `alert` | Triggers `loadAlerts()` (recomputes `unackCount`) | `frontend/src/lib/store.js:111-113` |
| `/api/ws` | `price_alert_triggered` | Triggers `loadAlerts()` | `frontend/src/lib/store.js:112-113` |
| `/api/ws` | `control_update` | Triggers `loadControl()` | `frontend/src/lib/store.js:114-116` |
| `/api/ws` | `strategy_update` | Triggers `loadStrategies()` | `frontend/src/lib/store.js:117-120` |
| `/api/ws` | `strategy_signal` | Triggers `loadStrategies()` | `frontend/src/lib/store.js:117-120` |
| `/api/ws` | `backtest_completed` | Triggers `loadBacktests()`, shows success toast with return % | `frontend/src/lib/store.js:121-129` |
| `/api/ws` | `trade` | No store mutation — handled directly by Workspace/Tape page | `frontend/src/lib/store.js:130-132` |

The WS message router writes `wsLastMessage` on every message regardless of type, which `StatusBar` uses to display the "last update" timestamp. `frontend/src/lib/store.js:100`

## Optimistic Updates

None. All mutations wait for the server response before state changes. See `06-runtime-flows.md` for the mutation flow.

## Polling

`WatchRail` polls watchlist quotes every 10 s via `setInterval` → `api.getWatchlistQuotes()`. This is the only active polling loop; all other live data comes via WS events or the 30 s safety refresh in `initStoreWS`. `frontend/src/components/WatchRail.jsx`
