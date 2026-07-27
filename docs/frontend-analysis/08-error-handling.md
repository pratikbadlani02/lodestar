# 08 — Error Handling

## HTTP Status Map

| Status | Action | Source |
|---|---|---|
| 401 (with token) | Clear `sessionStorage.quant_token`, redirect to `/login?from=<current path>` | `frontend/src/lib/api.js:27-36` |
| 401 (no token) | Throw `Error('unauthorized')` with `err.status = 401`; page handles it | `frontend/src/lib/api.js:31-36` |
| 204 | Return `null` (no body parsed) | `frontend/src/lib/api.js:43` |
| 4xx / 5xx (other) | Extract `detail.reason` → `detail.detail` → `detail` (string) → `HTTP N`; throw `Error` with `err.status` and `err.detail` | `frontend/src/lib/api.js:38-44` |
| Network failure | Unhandled promise rejection — surfaces as toast via `toast.apiError()` at the call site | `frontend/src/lib/toast.js` |

## Error Handling

| Trigger | Condition | Handler | User-facing result | Source |
|---|---|---|---|---|
| React render crash in a page | Uncaught throw in component tree | `ErrorBoundary` class component (route-level) | "Something broke on this page" card with Retry + Home buttons; sidebar/nav intact | `frontend/src/components/ErrorBoundary.jsx` |
| API mutation error (order, strategy, etc.) | Non-2xx response from `request()` | Page `catch` block calls `toast.apiError(err)` or `toast.error(msg)` | Red toast with error message | `frontend/src/lib/toast.js` |
| 401 mid-session | Token expired; `request()` detects `res.status === 401` with existing token | Auto-redirect to `/login?from=…` | User lands on login page; redirected back after re-auth | `frontend/src/lib/api.js:27-36` |
| WS message parse error | `JSON.parse(ev.data)` throws | Swallowed silently (`try {} catch {}`) | None — message dropped | `frontend/src/lib/api.js:187` |
| WS disconnect | `ws.onclose` fires | Auto-reconnect after 5 s; `wsConnected` set to `false` | StatusBar shows "disconnected" indicator | `frontend/src/lib/api.js:189-192`, `frontend/src/lib/store.js:138` |
| Store loader failure | REST call inside `loadX()` throws | `try {} catch {}` — silently swallowed; `*Loaded` flag still flips `true` | Page shows empty state (no skeleton forever) | `frontend/src/lib/store.js:37-91` |
| ErrorBoundary reset | User clicks "Retry" button | `ErrorBoundary.reset()` clears `err` state | Page re-renders from scratch | `frontend/src/components/ErrorBoundary.jsx:19` |

## Error Boundary Scope

`ErrorBoundary` wraps the `<Outlet>` in `Layout.jsx`, so a crash in any page component is contained to the main content area. The sidebar, top bar, status bar, command palette, and order slide-over remain mounted and functional. `frontend/src/components/ErrorBoundary.jsx:8`

The error boundary renders a user-facing fallback with:
- An expandable `<details>` block showing the full stack trace for developers.
- A "Retry" button that calls `reset()` (re-renders the crashed subtree without a full page reload).
- A "Workspace" link that uses `window.location.href = '/'` (full reload, clears all component state).

## Validation Handling

Form validation is inline React state — no Zod, Yup, or React Hook Form. Required fields are checked before calling `api.*()`. Server-side validation errors (422 Unprocessable Entity) surface via the `detail.reason` extraction path in `request()` and are shown as error toasts. `frontend/src/lib/api.js:39-41`

## Telemetry

No client-side error telemetry (no Sentry, Datadog, or LogRocket integration). `ErrorBoundary.componentDidCatch` logs to `console.error` only. `frontend/src/components/ErrorBoundary.jsx:15`
