# 05 — Dependencies

## Runtime dependencies

Source: [frontend/package.json](../../frontend/package.json#L10-L19).

| Package | Version | Role | Notes |
|---|---|---|---|
| `react`, `react-dom` | `^18.3.0` | UI runtime | — |
| `react-router-dom` | `^6.26.0` | Routing | lazy routes, `useOutletContext`, `useSearchParams` |
| `zustand` | `^5.0.13` | Global trading store | coalesced loaders + WS invalidation |
| `recharts` | `^2.12.0` | React charts | analytics, equity curve |
| `lightweight-charts` | `^5.2.0` | Price charts | TradingView-style |
| `lucide-react` | `^0.400.0` | Icons | — |
| `sonner` | `^2.0.7` | Toasts | `<Toaster/>` in Layout |

## Dev dependencies

Source: [frontend/package.json](../../frontend/package.json#L20-L27).

| Package | Version | Role | Notes |
|---|---|---|---|
| `vite` | `^5.3.0` | Dev server + bundler | port 3000, `/api` proxy |
| `@vitejs/plugin-react` | `^4.3.0` | React Fast Refresh + JSX | — |
| `tailwindcss` | `^3.4.19` | Utility CSS | — |
| `postcss`, `autoprefixer` | `^8.5.15`/`^10.5.0` | CSS pipeline | — |
| Testing / lint / format | — | ⚠️ **none declared** | no Jest/Vitest/RTL/ESLint/Prettier |

## Wiring

| Concern | Implementation | Source |
|---|---|---|
| Router | `<BrowserRouter>`; single `Layout` route with `<Outlet context={{refresh,control,health,authed}}/>`; per-page `React.lazy` | [main.jsx](../../frontend/src/main.jsx#L18), [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362), [App.jsx](../../frontend/src/App.jsx#L10-L45) |
| HTTP client | Hand-rolled `fetch` wrapper, base `/api`; bearer injection, JSON negotiation, 401 redirect, error normalization (`err.status`/`err.detail`); no retry/timeout | [api.js](../../frontend/src/lib/api.js#L2-L46) |
| File export | `window.open('/api/export/*')` bypasses wrapper | [api.js](../../frontend/src/lib/api.js#L108-L110) |
| WebSocket | `ws(s)://<host>/api/ws`; JSON parse, 5s reconnect, 30s ping keepalive | [api.js](../../frontend/src/lib/api.js#L195-L218) |
| State bootstrap | `initStoreWS()` idempotent; parallel initial loads + 30s safety poll + `market:change` listener | [store.js](../../frontend/src/lib/store.js#L155-L194) |
| Charts | `recharts`, `lightweight-charts` (`ChartWidget.jsx`) | — |

## Dev server & proxy

| Setting | Value | Source |
|---|---|---|
| Port | 3000 | [vite.config.js](../../frontend/vite.config.js#L6-L7) |
| Proxy | `/api → http://localhost:8000` | [vite.config.js](../../frontend/vite.config.js#L8-L10) |
| External service URLs | None hardcoded; relative `/api` + WS host from `window.location` | [api.js](../../frontend/src/lib/api.js#L2-L198) |

## Module Federation

N/A — no federation plugin, `remotes`, `exposes`, or `shared` config.

## Special rendering libraries

N/A — no Markdown/Mermaid/syntax-highlight renderer. Educational content shipped as JS data modules (`learnContent.js`, `learnGlossary.js`, `learnTopics.js`).
