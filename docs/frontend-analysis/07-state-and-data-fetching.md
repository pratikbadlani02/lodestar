# 07 — State and Data Fetching

## Fetching pattern

| Aspect | Finding | Source |
|---|---|---|
| Library | ⚠️ None (no TanStack Query / SWR) — hand-rolled `fetch` wrapper | [api.js](../../frontend/src/lib/api.js#L16-L46) |
| Live-trading state | Centralized in Zustand store; loaders hit REST once + on invalidation | [store.js](../../frontend/src/lib/store.js) |
| Market-data reads | Page-local `useEffect` → `api.*` → `useState`; not cached/shared | `src/pages/*` |
| Request dedup | `coalesce(key, fn)` in-flight map shares concurrent identical loads | [store.js](../../frontend/src/lib/store.js#L22-L30) |

## Cache & invalidation strategy

| Concern | Behavior | Source |
|---|---|---|
| Cache store | No stale-time/TTL cache; store holds latest snapshot only | [store.js](../../frontend/src/lib/store.js) |
| Invalidation trigger | WS message → targeted `loadX()` reload (server authoritative) | [store.js](../../frontend/src/lib/store.js#L107-L147) |
| Safety refresh | 30s interval re-pulls all live slices (backstop for dropped WS) | [store.js](../../frontend/src/lib/store.js#L173-L182) |
| Market re-scope | `market:change` event re-pulls account + positions | [store.js](../../frontend/src/lib/store.js#L186-L191) |
| Loaded flags | `*Loaded` booleans distinguish loading vs loaded-empty | [store.js](../../frontend/src/lib/store.js#L60-L66) |

## Real-time events

Canonical home; referenced by [03-access-and-rules.md](03-access-and-rules.md) and [06-runtime-flows.md](06-runtime-flows.md). Channel: single WebSocket `/api/ws` ([api.js](../../frontend/src/lib/api.js#L195-L218)).

| Channel | Event / message type | Effect on state | Source |
|---|---|---|---|
| WS `/api/ws` | `order_update` | reload orders + positions + account | [store.js](../../frontend/src/lib/store.js#L110-L114) |
| WS | `position_closed` | reload positions + account | [store.js](../../frontend/src/lib/store.js#L115-L118) |
| WS | `alert`, `price_alert_triggered` | reload alerts | [store.js](../../frontend/src/lib/store.js#L119-L122) |
| WS | `control_update` | reload control | [store.js](../../frontend/src/lib/store.js#L123-L125) |
| WS | `strategy_update`, `strategy_signal` | reload strategies | [store.js](../../frontend/src/lib/store.js#L126-L129) |
| WS | `backtest_completed` | reload backtests + success toast (return%/trades) | [store.js](../../frontend/src/lib/store.js#L130-L139) |
| WS | `trade` | handled directly by Workspace/Tape (live tape) | [store.js](../../frontend/src/lib/store.js#L140-L142) |

Connection resilience: 5s auto-reconnect on close, 30s keepalive ping, malformed messages ignored ([api.js](../../frontend/src/lib/api.js#L205-L216)).

## Optimistic updates

N/A — none. Mutations wait for server confirmation; long-running work (orders, backtests) finalizes via WS-driven store reloads ([store.js](../../frontend/src/lib/store.js#L133-L142)).
