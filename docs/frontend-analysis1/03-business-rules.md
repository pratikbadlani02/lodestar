# 03 — Business Rules

## Business rules

| Rule | Behavior | Enforced where | Scope |
|---|---|---|---|
| Token storage | JWT in `sessionStorage.quant_token` (clears on tab close) | [api.js](../../frontend/src/lib/api.js#L4) | Global |
| Route guard | Token-less users redirected to `/login?from=` | [App.jsx](../../frontend/src/App.jsx#L47-L57) | Private routes |
| Session expiry | `401` with token ⇒ clear token + redirect to login; `401` anonymous ⇒ throw | [api.js](../../frontend/src/lib/api.js#L28-L40) | All requests |
| Open-redirect guard | `from` honored only if starts `/` and not `//` | [Login.jsx](../../frontend/src/pages/Login.jsx#L21-L24) | Login |
| Public market data | Market/research/learn pages render without sign-in | [App.jsx](../../frontend/src/App.jsx#L92-L125), [Login.jsx](../../frontend/src/pages/Login.jsx#L113-L117) | Public routes |
| Gated trading | Trading/account/strategy/risk/admin require login | [App.jsx](../../frontend/src/App.jsx#L127-L150) | Private routes |
| Private nav tagging | `priv:true` items marked visually for anonymous users | [Layout.jsx](../../frontend/src/components/Layout.jsx#L31-L80) | Sidebar |
| Market scope | `us`/`in` selector persisted; drives symbol universe + currency | [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L13-L54) | Global |
| Backend-authoritative market | Real market derived from symbol suffix (`.NS`/`.BO`⇒IN); selector is front-of-house only | [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L80-L88) | Global |
| Active symbol | Single app-wide ticker, uppercased/trimmed, recents max 12 | [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L11-L52) | Symbol pages |
| Live-trading surfacing | UI reflects `control.is_live/trading_enabled/strategies_enabled` | [Layout.jsx](../../frontend/src/components/Layout.jsx#L177-L181) | Chrome |
| Mutations non-optimistic | UI updates only after server confirms / WS reload | [store.js](../../frontend/src/lib/store.js#L133-L142) | All mutations |

## Authentication / authorization

| Aspect | Value | Source |
|---|---|---|
| Scheme | JWT bearer in `sessionStorage` | [api.js](../../frontend/src/lib/api.js#L4-L7) |
| Login | `POST /auth/login` (form-encoded) → `{ access_token }` | [api.js](../../frontend/src/lib/api.js#L49-L55) |
| Header | `Authorization: Bearer <token>` on every request | [api.js](../../frontend/src/lib/api.js#L17-L19) |
| Admin surfaces | `/users` — frontend tags as Admin; ⚠️ actual role enforcement is backend-side | [Layout.jsx](../../frontend/src/components/Layout.jsx#L75-L78) |

## Scoping / multi-tenant

Not multi-tenant. The only scoping axis is **market (US/IN)**, persisted in `localStorage.quant_market_v1`, applied to US-only feeds via the `mkt()` helper; switching dispatches a `market:change` event that re-pulls account/positions. Source: [api.js](../../frontend/src/lib/api.js#L9-L13), [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L45-L54), [store.js](../../frontend/src/lib/store.js#L186-L191).

## Real-time events

| Channel | Event type | Effect on state | Source |
|---|---|---|---|
| WS `/api/ws` | `order_update` | reload orders + positions + account | [store.js](../../frontend/src/lib/store.js#L110-L114) |
| WS | `position_closed` | reload positions + account | [store.js](../../frontend/src/lib/store.js#L115-L118) |
| WS | `alert`, `price_alert_triggered` | reload alerts | [store.js](../../frontend/src/lib/store.js#L119-L122) |
| WS | `control_update` | reload control | [store.js](../../frontend/src/lib/store.js#L123-L125) |
| WS | `strategy_update`, `strategy_signal` | reload strategies | [store.js](../../frontend/src/lib/store.js#L126-L129) |
| WS | `backtest_completed` | reload backtests + success toast (return%/trades) | [store.js](../../frontend/src/lib/store.js#L130-L139) |
| WS | `trade` | handled directly by Workspace/Tape (live tape) | [store.js](../../frontend/src/lib/store.js#L140-L142) |

## Validation & flags

| Concern | Finding | Source |
|---|---|---|
| Form validation | Native `required` + server-side errors; ⚠️ no Zod/Yup library | [Login.jsx](../../frontend/src/pages/Login.jsx#L60-L82) |
| Feature flags | N/A — no build-time flag system; runtime toggles are backend control flags | ⚠️ inferred |
| Cross-tab sync | theme/market/symbol/auth sync via `storage` event | [ThemeContext.jsx](../../frontend/src/lib/ThemeContext.jsx#L40-L50), [Layout.jsx](../../frontend/src/components/Layout.jsx#L127-L135) |
