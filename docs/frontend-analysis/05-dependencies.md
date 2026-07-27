# 05 — Dependencies

## Dependencies

Runtime — [frontend/package.json](../../frontend/package.json#L10-L19):

| Package | Version | Role | Notes |
|---|---|---|---|
| `react`, `react-dom` | `^18.3.0` | UI runtime | — |
| `react-router-dom` | `^6.26.0` | Routing | lazy routes, `useOutletContext` |
| `zustand` | `^5.0.13` | Global trading store | coalesced loaders + WS invalidation |
| `recharts` | `^2.12.0` | React charts | analytics, equity curve |
| `lightweight-charts` | `^5.2.0` | Price charts | TradingView-style |
| `lucide-react` | `^0.400.0` | Icons | — |
| `sonner` | `^2.0.7` | Toasts | `<Toaster/>` in Layout |

Dev — [frontend/package.json](../../frontend/package.json#L20-L27):

| Package | Version | Role | Notes |
|---|---|---|---|
| `vite` | `^5.3.0` | Dev server + bundler | port 3000, `/api` proxy |
| `@vitejs/plugin-react` | `^4.3.0` | Fast Refresh + JSX | — |
| `tailwindcss` | `^3.4.19` | Utility CSS | — |
| `postcss`, `autoprefixer` | `^8.5.15`/`^10.5.0` | CSS pipeline | — |
| Testing / lint / format | — | ⚠️ **none declared** | no Jest/Vitest/RTL/ESLint/Prettier |

## Wiring

| Concern | Implementation | Source |
|---|---|---|
| Router | `<BrowserRouter>`; single `Layout` route with `<Outlet context={{refresh,control,health,authed}}/>`; per-page `React.lazy` | [main.jsx](../../frontend/src/main.jsx#L18), [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362) |
| HTTP client | Hand-rolled `fetch` wrapper, base `/api`; bearer injection, JSON negotiation, 401 redirect, error normalization; no retry/timeout | [api.js](../../frontend/src/lib/api.js#L2-L46) |
| WebSocket | `ws(s)://<host>/api/ws`; JSON parse, 5s reconnect, 30s ping | [api.js](../../frontend/src/lib/api.js#L195-L218) |
| State bootstrap | `initStoreWS()` idempotent; parallel loads + 30s safety poll + `market:change` listener | [store.js](../../frontend/src/lib/store.js#L155-L194) |
| Dev port / proxy | 3000; `/api → http://localhost:8000` | [vite.config.js](../../frontend/vite.config.js#L6-L10) |

Full API endpoint catalog: see [04-data-model.md](04-data-model.md).

## Conditional detection

- **Module Federation** — N/A. No `@module-federation/*`, `@originjs/vite-plugin-federation`, or Webpack `ModuleFederationPlugin`. No `remotes`/`exposes`/`shared`.
- **Markdown / Mermaid rendering** — N/A — no content Markdown pipeline. No `react-markdown`/`remark-*`/`rehype-*`/`mermaid`. Educational content ships as JS data modules (`learnContent.js`, `learnGlossary.js`, `learnTopics.js`).
