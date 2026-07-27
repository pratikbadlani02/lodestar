# 08 — Error Handling

## HTTP status map

Central wrapper: [api.js](../../frontend/src/lib/api.js#L16-L46).

| Status | Action | Source |
|---|---|---|
| `401` (token present) | Clear token, redirect `/login?from=<path>` | [api.js](../../frontend/src/lib/api.js#L28-L37) |
| `401` (anonymous) | Throw `Error('unauthorized')`, `err.status=401`; page decides | [api.js](../../frontend/src/lib/api.js#L38-L40) |
| Other `!ok` (4xx/5xx) | Parse JSON/text → throw `Error` (`detail.reason`→`detail`→`HTTP <status>`) with `err.status`/`err.detail` | [api.js](../../frontend/src/lib/api.js#L41-L44) |
| `204` | Return `null` | [api.js](../../frontend/src/lib/api.js#L45) |
| `2xx` | Return parsed JSON | [api.js](../../frontend/src/lib/api.js#L46) |
| `403`/`404` | ⚠️ No dedicated path — generic `!ok` branch | — |

## Error handling

| Trigger | Condition | Handler | User-facing result | Source |
|---|---|---|---|---|
| Session expiry | 401 with token | wrapper redirect | bounced to login, return preserved | [api.js](../../frontend/src/lib/api.js#L28-L37) |
| API error | 4xx/5xx | page `try/catch` | inline `Alert` / toast | [Login.jsx](../../frontend/src/pages/Login.jsx#L16-L31) |
| Render crash | exception in page | `ErrorBoundary` | fallback card + Retry/Workspace | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx) |
| Background load fail | store loader rejects | `try{}catch{}` + `finally` sets `*Loaded` | ⚠️ silently swallowed | [store.js](../../frontend/src/lib/store.js#L60-L96) |
| WS drop | socket close | 5s auto-reconnect, `wsConnected=false` | status indicator | [api.js](../../frontend/src/lib/api.js#L205-L209) |
| Malformed WS msg | JSON parse fail | `try{}catch{}` ignore | none | [api.js](../../frontend/src/lib/api.js#L201-L203) |

## Error boundary

| Aspect | Value | Source |
|---|---|---|
| Type | Class component wrapping `<Outlet/>` | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L8) |
| Capture | `getDerivedStateFromError` + `componentDidCatch` (console.error) | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L11-L17) |
| Fallback | Card "Something broke on this page" + collapsible `err.stack` | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L26-L46) |
| Recovery | Retry (`reset()`) / Workspace (`location='/'`) | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L42-L45) |
| Scope | Page-level only; chrome survives | [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362) |

## Validation & telemetry

| Concern | Finding | Source |
|---|---|---|
| Form validation | Native `required` + server error messages; ⚠️ no Zod/Yup | [Login.jsx](../../frontend/src/pages/Login.jsx#L60-L82) |
| Telemetry | ⚠️ None — `componentDidCatch` has a "hook into Sentry later" placeholder | [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L13-L16) |
| Retry/backoff/timeout | ⚠️ None in HTTP client | [api.js](../../frontend/src/lib/api.js#L16-L46) |
| Offline handling | ⚠️ None (no detection or mutation queue) | — |
