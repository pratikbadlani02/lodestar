# 03 — Business Rules

## Authentication & authorization

- **Token storage:** JWT stored in `sessionStorage` under `quant_token` (cleared on tab close — a deliberate security choice). Written by `setToken()` in [api.js](../../frontend/src/lib/api.js#L4) on login.
- **Route guard:** `RequireAuth` redirects token-less users to `/login?from=...` ([App.jsx](../../frontend/src/App.jsx#L47-L57)).
- **Session expiry:** A `401` on any request clears the token and forces `/login` **only if a token was present** (mid-session expiry). Anonymous callers hitting a private endpoint receive the `401` and the page decides how to surface it. See [api.js](../../frontend/src/lib/api.js#L28-L40).
- **Open-redirect protection:** post-login `from` is honored only if it starts with `/` and not `//` ([Login.jsx](../../frontend/src/pages/Login.jsx#L21-L24)).
- **Admin-only surfaces:** `/users` is intended for admins (`api.listUsers/createUser/updateUserRole/deleteUser`). ⚠️ Role enforcement is primarily backend-side; the frontend exposes the nav item under the "Admin" group but actual authorization is the API's responsibility.

## Public vs gated content

- Market data, research, learn, and coach pages are intentionally **public** ("Market data is available without sign-in"). See the [Login.jsx](../../frontend/src/pages/Login.jsx#L113-L117) footer copy.
- Trading, account, strategy, backtest, optimizer, risk, alerts, audit, settings, and users are **gated**.
- The sidebar tags gated items with `priv: true` so they're visually marked for anonymous users; clicking still navigates and the guard redirects. See `NAV_GROUPS` in [Layout.jsx](../../frontend/src/components/Layout.jsx#L31-L80).

## Market scoping (US ⇄ India)

- A global `MarketContext` selects `us` or `in`, persisted in `localStorage` under `quant_market_v1` ([MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L13-L36)).
- Switching market: updates the active currency formatter, persists the choice, and dispatches a `market:change` window event so the store re-pulls account/positions. See [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L45-L54) and the listener in [store.js](../../frontend/src/lib/store.js#L186-L191).
- **Rule:** the market selector is purely front-of-house. The backend derives the *real* market from each symbol's suffix (`.NS`/`.BO` ⇒ India). `marketOf(symbol)` mirrors this client-side. See [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L80-L88).
- US-only feeds (movers, snapshots, news, screener, sentiment) are scoped by passing the active market; when a caller omits it, `mkt()` reads it from localStorage. See [api.js](../../frontend/src/lib/api.js#L9-L13).

## Active symbol & recents

- A single active ticker is shared app-wide via `SymbolContext`, persisted under `quant_active_symbol_v1`; recents (max 12) under `quant_symbol_recents_v1`. See [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L11-L52).
- Symbols are uppercased/trimmed on set. Selecting a symbol promotes it to the front of recents.

## Live-trading safety surfacing

The control state (`control.is_live`, `control.trading_enabled`, `control.strategies_enabled`) drives prominent UI affordances in `Layout` (e.g., a live-trading indicator color) — see [Layout.jsx](../../frontend/src/components/Layout.jsx#L177-L181). The frontend reflects backend safety state; it does not itself decide paper vs live.

## Real-time invalidation rules

The WebSocket router maps message types to store reloads (server stays authoritative) — see [store.js](../../frontend/src/lib/store.js#L107-L147):

| WS message `type` | Effect |
|---|---|
| `order_update` | reload orders + positions + account |
| `position_closed` | reload positions + account |
| `alert`, `price_alert_triggered` | reload alerts |
| `control_update` | reload control |
| `strategy_update`, `strategy_signal` | reload strategies |
| `backtest_completed` | reload backtests + success toast with return %/trades |
| `trade` | handled directly by Workspace/Tape (live tape) |

## Cross-tab consistency

Theme, market, symbol, and auth state all listen to the `storage` event so multiple tabs stay in sync ([ThemeContext.jsx](../../frontend/src/lib/ThemeContext.jsx#L40-L50), [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L57-L66), [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L57-L67), [Layout.jsx](../../frontend/src/components/Layout.jsx#L127-L135)).

## Feature flags / toggles

⚠️ No build-time feature-flag system found. Behavior toggles are runtime control flags from the backend (`trading_enabled`, `strategies_enabled`, `is_live`) plus user UI preferences (theme, density, market) in localStorage.
