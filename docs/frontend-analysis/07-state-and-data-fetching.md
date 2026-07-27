# State and Data Fetching

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## Fetching Library / Pattern

No React data-fetching library (no React Query, SWR, Apollo, etc.). All fetching is done via a hand-rolled `fetch` wrapper in `lib/api.js:request()`. The wrapper:

- Injects `Authorization: Bearer <token>` when a token exists
- Handles 401 by clearing the token and redirecting to `/login`
- Extracts error detail from JSON or text on non-ok responses
- Returns `null` on 204 responses

Store loaders (`loadControl`, `loadOrders`, etc.) call `api.*` methods via a **coalescing pattern** (`lib/store.js:22-29`): an in-flight `Map` keyed by a logical name prevents duplicate concurrent fetches. If a second call arrives while the first is in-flight, it receives the same `Promise` rather than issuing a new request.

## Cache and Invalidation Strategy

| Mechanism | How it works | Source |
|---|---|---|
| WS-driven invalidation | WS message received → specific `loadXxx()` called → REST re-fetch → store updated | `store.js:99-137` |
| 30 s safety refresh | `setInterval` backstop re-fetches all slices even if no WS event | `store.js:161-170` |
| In-flight coalescing | Concurrent calls to the same loader share the same `Promise`; no duplicate requests | `store.js:22-29` |
| No TTL / stale-while-revalidate | Data is considered fresh immediately after any fetch; no client-side expiry | — |
| No localStorage caching | Store state is in-memory only; refreshing the page re-fetches everything | — |

Pages that fetch data outside the store (most public market-data pages) call `api.*` directly in `useEffect` hooks with no caching layer — each mount triggers a fresh fetch.

## Real-Time Events

All events arrive on a single WebSocket at `ws(s)://<host>/api/ws`. The client reconnects after 5 s on close (`api.js:189-191`) and sends a keepalive `ping` every 30 s (`api.js:193-196`).

| Channel | Event / message type | Effect on state | Source |
|---|---|---|---|
| `/api/ws` | `order_update` | `loadOrders()`, `loadPositions()`, `loadAccount()` re-fetched | `store.js:101-106` |
| `/api/ws` | `position_closed` | `loadPositions()`, `loadAccount()` re-fetched | `store.js:107-110` |
| `/api/ws` | `alert` | `loadAlerts()` re-fetched | `store.js:111-113` |
| `/api/ws` | `price_alert_triggered` | `loadAlerts()` re-fetched | `store.js:111-113` |
| `/api/ws` | `control_update` | `loadControl()` re-fetched | `store.js:114-116` |
| `/api/ws` | `strategy_update` | `loadStrategies()` re-fetched | `store.js:117-120` |
| `/api/ws` | `strategy_signal` | `loadStrategies()` re-fetched | `store.js:117-120` |
| `/api/ws` | `backtest_completed` | `loadBacktests()` re-fetched + `toast.success` shown with `return_pct` and `trades` | `store.js:121-128` |
| `/api/ws` | `trade` | No store update — handled directly by `Tape` page and `Workspace` ticker via their own WS listener ⚠️ UNVERIFIED | `store.js:130-132` |

The `market:change` custom DOM event (`MarketContext.jsx:47`) also drives partial re-fetches: the store listens for `window.dispatchEvent(new CustomEvent('market:change'))` and calls `loadAccount()` + `loadPositions()` for the new market scope (`store.js:173-177`).

## Optimistic Updates

N/A — no optimistic update behavior. All mutations wait for server confirmation, then the WS event triggers the re-fetch that updates the UI.
