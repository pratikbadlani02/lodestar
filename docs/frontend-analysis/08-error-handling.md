# Error Handling

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## HTTP Status Map

| Status | Action | Source |
|---|---|---|
| `401` (token was present) | Clear `quant_token` from sessionStorage; hard-redirect to `/login?from=<current-path>` | `lib/api.js:28-35` |
| `401` (no token) | Throw `Error('unauthorized')` with `.status = 401`; page/caller decides how to surface it | `lib/api.js:36` |
| `204` | Return `null` (no body to parse) | `lib/api.js:43` |
| Any other non-ok | Extract detail: try JSON parse → read `.detail.reason` or `.detail.detail` or fallback to `.detail`; throw `Error` with `.status` and `.detail` attached | `lib/api.js:38-42` |
| `2xx` (not 204) | Parse response body as JSON and return | `lib/api.js:44` |

## Error Handling Table

| Trigger | Condition | Handler | User-facing result | Source |
|---|---|---|---|---|
| Route-level render error | Any JS exception thrown during a page component's render/lifecycle | `ErrorBoundary` class component (`componentDidCatch`) | "Something broke on this page" card with Retry and Home buttons; collapsible stack trace | `components/ErrorBoundary.jsx` |
| Session expiry | `401` response AND `quant_token` was in sessionStorage | `lib/api.js:28-35` — clears token, `window.location.href` redirect | User lands on `/login?from=<previous-path>` | `lib/api.js:28-35` |
| Anonymous endpoint access | `401` response AND no token | Throw `unauthorized` error | Propagates to page `useEffect` catch — behavior varies by page ⚠️ UNVERIFIED | `lib/api.js:36` |
| HTTP error (non-401) | `res.ok === false` | Throw error with extracted `detail` | Propagates to caller; most store loaders swallow silently via empty `catch {}` | `lib/api.js:38-42`, `store.js:37,49,55,66,76,84,91` |
| Login failure | POST `/auth/login` returns non-ok | Throw `Error('Login failed')` | Error message rendered in `<Alert variant="error">` below the form | `pages/Login.jsx:22-24` |
| WebSocket disconnect | WS `close` event | `connectWebSocket()` schedules itself again after 5 s | No direct user notification; `wsConnected` store flag flips `false` — StatusBar may reflect this | `lib/api.js:188-191` |
| WS JSON parse failure | `ev.data` is not valid JSON | Silent `try/catch` — message dropped | None | `lib/api.js:186` |
| Backtest completed (success) | WS `backtest_completed` with `return_pct` | `toast.success()` | Bottom-right toast: "Backtest completed — X.XX% return · N trades" | `store.js:124-128` |

## Error Boundary Scope

`ErrorBoundary` (`components/ErrorBoundary.jsx`) is mounted once in `Layout.jsx:360`, wrapping only the `<Outlet />`. This means:

- **Protected:** Every page that renders inside Layout (all routes under `/`).
- **Not protected:** The `Login` page (it is rendered outside Layout, as a sibling route at `/login`).
- **Not protected:** Provider-level crashes (`ThemeProvider`, `DensityProvider`, etc.) — these sit above `Layout` in the tree; a crash there would take down the entire app.

On recovery (`Retry` button), `ErrorBoundary` calls `this.setState({ err: null })`, which causes React to re-render the children. `Home` button triggers `window.location.href = '/'` (hard navigation).

## Validation Handling

- **Login form:** HTML5 native `required` attributes on username and password `<Input>` elements (`pages/Login.jsx:62,70`). Form will not submit without values; browser shows native validation UI.
- **No client-side validation library** — no Zod, Yup, react-hook-form, or Formik found in `package.json`.
- **API validation errors:** Backend Pydantic validation errors arrive as structured `detail` objects; `lib/api.js:39-41` extracts `detail.reason` → `detail.detail` → `detail` → stringified JSON. Callers typically surface these via `toast.apiError(e)` from `lib/toast.js:27-30`.

## Telemetry

- `console.error('Route error:', err, info)` in `ErrorBoundary.componentDidCatch` (`ErrorBoundary.jsx:15`) — logged to browser console only.
- No Sentry, Datadog, or other observability integration wired. A comment in `ErrorBoundary.jsx:15` explicitly marks this as a future integration point: `"Surface to console for now; hook into Sentry/observability here later."`
- No `window.onerror` or `window.onunhandledrejection` global handler observed.
