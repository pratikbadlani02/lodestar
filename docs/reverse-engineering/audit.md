# Lodestar Frontend — Audit

Defensive review of the client. Findings are grouped by severity; each has a location, impact, and fix direction. "Client-confirmed" means visible in source; "needs server confirmation" means the real risk depends on backend behavior.

## Summary

The frontend has a **clean security baseline**: no `dangerouslySetInnerHTML`, no `eval`/`new Function`, no `http://` endpoints, no hardcoded secrets, and no `VITE_*` values baked into the bundle (verified by grep across `frontend/src`). The real exposure is concentrated in **auth/session handling** and **tech debt** (zero tests, silent error swallowing). Performance is mostly fine for a dashboard but has a few measurable smells.

## Security

### Medium

- **JWT stored in `sessionStorage`, readable by any script.** The token lives in `sessionStorage['quant_token']` ([frontend/src/lib/api.js](../../frontend/src/lib/api.js#L4-L5)). Any XSS would exfiltrate it. *Impact:* session theft if an injection ever lands. *Fix direction:* prefer an httpOnly, SameSite cookie issued by the backend; if that's infeasible, keep `sessionStorage` (better than `localStorage`, already chosen) and harden against XSS. *Note:* no injection sink was found in this codebase, so this is latent, not active.
- **Route guards authorize on token presence, not role.** `RequireAuth` only checks that a token exists ([frontend/src/App.jsx](../../frontend/src/App.jsx#L46-L58)); the Admin **Users** screen (create users, change roles) is reachable client-side by any authenticated user ([frontend/src/pages/Users.jsx](../../frontend/src/pages/Users.jsx#L29-L31)). *Impact:* a non-admin sees admin UI; actual privilege escalation depends entirely on server enforcement. *Fix direction:* fetch the role (`api.getMe`, already defined at [frontend/src/lib/api.js](../../frontend/src/lib/api.js#L177)) and gate admin routes/nav on it as defense-in-depth. **Needs server confirmation** that `/users` mutations enforce admin.
- **WebSocket connects without the bearer token.** The WS URL is built with no auth param or header ([frontend/src/lib/api.js](../../frontend/src/lib/api.js#L183-L185)). *Impact:* if the server doesn't authenticate the socket, any same-origin client receives the live trading event stream. *Fix direction:* pass the token (query param or post-connect auth message) and verify server-side. **Needs server confirmation.**

### Low

- **Token persists across the 401 redirect path only on expiry.** On a 401 *with* a token, the client clears it and hard-redirects ([frontend/src/lib/api.js](../../frontend/src/lib/api.js#L27-L37)) — correct. Anonymous 401s are surfaced to pages. No action needed; documented so it isn't "fixed" into an open-redirect.
- **Open-redirect is already guarded.** Login only honors same-origin relative `from` paths ([frontend/src/pages/Login.jsx](../../frontend/src/pages/Login.jsx#L21-L23)). Keep this guard if the redirect logic is refactored.

## Performance

### Medium

- **No `React.memo` anywhere** (0 occurrences) against **155 `useEffect`** and **86 `useMemo`** across 60 components (grep counts). Large pages re-render children freely. *Impact:* avoidable re-render cost on the heavy pages. *Fix direction:* memoize row/cell components in the big tables/charts. Start with the hot spots below.
- **Several pages poll on their own timers** in addition to the global 30s store refresh — e.g. the order ticket polls snapshots every 8s while open ([frontend/src/components/OrderSlideOver.jsx](../../frontend/src/components/OrderSlideOver.jsx#L51-L70)). *Impact:* redundant network + timers if multiple pollers stack. *Fix direction:* consolidate polling through the store/WS where possible.

### Low

- **Complexity hot spots** (from inventory, candidates for splitting/memoization): `ChartWidget.jsx` (1172 LOC), `Analysis.jsx` (862), `Market.jsx` (862), `Learn.jsx` (770), `Trade.jsx` (653), `Workspace.jsx` (611). These are the largest re-render and bundle-chunk surfaces.
- **Manual vendor chunking is in place** ([frontend/vite.config.js](../../frontend/vite.config.js#L16-L22)) and every route is lazy ([frontend/src/App.jsx](../../frontend/src/App.jsx#L11-L43)) — good. `sourcemap: false` means no prod source maps to leak, but also no prod debugging.

## Tech debt & quality

### High

- **Zero automated tests** (0 test/spec files, no test runner in `devDependencies` — [frontend/package.json](../../frontend/package.json#L20-L26)). *Impact:* every change is hand-verified; refactors are high-risk. *Fix direction:* add Vitest + Testing Library; cover `api.js` (token/401), the store loaders/`coalesce`, and `RequireAuth` first.

### Medium

- **Store loaders swallow all errors.** Every loader wraps its body in `try { … } catch {}` ([frontend/src/lib/store.js](../../frontend/src/lib/store.js#L60-L96)). *Impact:* backend/network failures are invisible — the UI just shows empty data, indistinguishable from "no data." *Fix direction:* record a per-slice error flag and surface a retry affordance; keep the toast path that already exists for backtests.
- **No telemetry / error reporting.** `ErrorBoundary` only `console.error`s and has a `// hook into Sentry … later` TODO ([frontend/src/components/ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx#L13-L14)). *Impact:* production crashes are unobserved. *Fix direction:* wire an error reporter at that boundary and at the `request()` failure path.
- **No linter/formatter config** (no ESLint/Prettier in `devDependencies`). *Impact:* style drift, no automated dead-code/anti-pattern detection. *Fix direction:* add ESLint (react-hooks plugin catches effect-deps bugs, relevant given 155 effects).

### Low

- **Duplicated market-resolution logic** reads `localStorage['quant_market_v1']` directly in three places instead of one util ([frontend/src/lib/api.js](../../frontend/src/lib/api.js#L10-L13), [frontend/src/lib/store.js](../../frontend/src/lib/store.js#L17-L19), [frontend/src/lib/MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L26-L31)). Centralize.

## What was checked and is clean

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML` / `innerHTML` | none in `frontend/src` |
| `eval` / `new Function` | none |
| Hardcoded secrets / API keys | none |
| `VITE_*` / `import.meta.env` secrets in bundle | none used |
| Non-TLS (`http://`) endpoints | none (API is relative `/api`) |
| Open-redirect on login | guarded ([Login.jsx](../../frontend/src/pages/Login.jsx#L21-L23)) |

## Priorities

1. Add a test runner + cover auth/store (High debt).
2. Confirm server-side enforcement for WS auth and admin endpoints; add client-side role gating as defense-in-depth (Medium security).
3. Replace silent `catch {}` with surfaced errors + reporting (Medium debt).
