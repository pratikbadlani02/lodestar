# 03 — Access and Rules

## Access & rules

| Rule | Behavior | Enforced where (file) | Scope |
|---|---|---|---|
| Token storage | JWT in `sessionStorage.quant_token` (clears on tab close) | [api.js](../../frontend/src/lib/api.js#L4) | Global |
| Route guard | Token-less users redirected to `/login?from=` | [App.jsx](../../frontend/src/App.jsx#L47-L57) | Private routes |
| Session expiry | `401` with token ⇒ clear token + redirect; `401` anonymous ⇒ throw | [api.js](../../frontend/src/lib/api.js#L28-L40) | All requests |
| Open-redirect guard | `from` honored only if starts `/` and not `//` | [Login.jsx](../../frontend/src/pages/Login.jsx#L21-L24) | Login |
| Public market data | Market/research/learn render without sign-in | [App.jsx](../../frontend/src/App.jsx#L92-L125) | Public routes |
| Gated trading | Trading/account/strategy/risk/admin require login | [App.jsx](../../frontend/src/App.jsx#L127-L150) | Private routes |
| Private nav tagging | `priv:true` items marked visually for anonymous users | [Layout.jsx](../../frontend/src/components/Layout.jsx#L31-L80) | Sidebar |
| Market scope | `us`/`in` selector persisted; drives symbol universe + currency | [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L13-L54) | Global |
| Backend-authoritative market | Real market derived from symbol suffix (`.NS`/`.BO`⇒IN); selector is front-of-house | [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L80-L88) | Global |
| Active symbol | App-wide ticker, uppercased/trimmed, recents max 12 | [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L11-L52) | Symbol pages |
| Live-trading surfacing | UI reflects `control.is_live/trading_enabled/strategies_enabled` | [Layout.jsx](../../frontend/src/components/Layout.jsx#L177-L181) | Chrome |

## Auth / authz scheme

| Aspect | Value | Source |
|---|---|---|
| Scheme | JWT bearer in `sessionStorage` | [api.js](../../frontend/src/lib/api.js#L4-L7) |
| Login | `POST /auth/login` (form-encoded) → `{ access_token }` | [api.js](../../frontend/src/lib/api.js#L49-L55) |
| Header | `Authorization: Bearer <token>` on every request | [api.js](../../frontend/src/lib/api.js#L17-L19) |
| Admin surfaces | `/users` tagged Admin in UI; ⚠️ role enforcement is backend-side | [Layout.jsx](../../frontend/src/components/Layout.jsx#L75-L78) |

## Scoping / multi-tenant

Not multi-tenant. The only scoping axis is **market (US/IN)**, persisted in `localStorage.quant_market_v1`, applied to US-only feeds via the `mkt()` helper; switching dispatches a `market:change` event that re-pulls account/positions. Source: [api.js](../../frontend/src/lib/api.js#L9-L13), [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L45-L54), [store.js](../../frontend/src/lib/store.js#L186-L191).

## Validation & feature flags

| Concern | Finding | Source |
|---|---|---|
| Form validation | Native `required` + server-side errors; ⚠️ no Zod/Yup | [Login.jsx](../../frontend/src/pages/Login.jsx#L60-L82) |
| Feature flags | N/A — no build-time flag system; runtime toggles are backend control flags | ⚠️ inferred |
| Cross-tab sync | theme/market/symbol/auth sync via `storage` event | [ThemeContext.jsx](../../frontend/src/lib/ThemeContext.jsx#L40-L50), [Layout.jsx](../../frontend/src/components/Layout.jsx#L127-L135) |

> Real-time invalidation rules are documented in [07-state-and-data-fetching.md](07-state-and-data-fetching.md).
