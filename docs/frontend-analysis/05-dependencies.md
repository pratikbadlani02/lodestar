# 05 — Dependencies

## Dependencies

| Package | Version | Role | Notes |
|---|---|---|---|
| `react` | ^18.3.0 | UI framework | Concurrent mode features used (Suspense, lazy) |
| `react-dom` | ^18.3.0 | DOM renderer | — |
| `react-router-dom` | ^6.26.0 | Client-side routing | `<BrowserRouter>`, `<Routes>`, `<Route>`, `useLocation`, `Navigate` |
| `zustand` | ^5.0.13 | Global state management | Single store; selector pattern |
| `recharts` | ^2.12.0 | Analytics charts | AreaChart, LineChart, BarChart in analytics/equity pages |
| `lightweight-charts` | ^5.2.0 | OHLCV candlestick charts | Used in ChartWidget; separate vendor chunk |
| `lucide-react` | ^0.400.0 | Icon set | Used across all components; separate vendor chunk |
| `sonner` | ^2.0.7 | Toast notifications | Wrapped by `frontend/src/lib/toast.js` |
| `@vitejs/plugin-react` | ^4.3.0 | Vite React transform | Babel-based fast refresh |
| `vite` | ^5.3.0 | Build tool / dev server | Manual chunking, proxy config |
| `tailwindcss` | ^3.4.19 | Utility CSS framework | Custom design system with CSS variables |
| `postcss` | ^8.5.15 | CSS processing | Required by Tailwind pipeline |
| `autoprefixer` | ^10.5.0 | CSS vendor prefixes | PostCSS plugin |

Source: `frontend/package.json`

## Router / HTTP / State Wiring

- **Routing**: React Router v6 `<BrowserRouter>` wraps the whole app. All route definitions are in `App.jsx`. No nested routers.
- **HTTP**: Native `fetch` via the `request()` wrapper in `frontend/src/lib/api.js`. No Axios or SWR. Responses are parsed as JSON; 401s with a token trigger a forced redirect.
- **State**: Zustand store bootstrapped once at app start; contexts provide ambient UI preferences. No Redux, no React Query.
- **Dev proxy**: Vite proxies `/api` → `http://localhost:8000` so the SPA and API share the same origin in development. `frontend/vite.config.js:8-10`

## Module Federation

N/A — no Module Federation. The app is a single monolithic SPA. No `@module-federation/*`, `@originjs/vite-plugin-federation`, or Webpack `ModuleFederationPlugin` detected. `frontend/package.json`

## Markdown / Mermaid Rendering

N/A — no content Markdown pipeline. No `react-markdown`, `remark-*`, `rehype-*`, or `mermaid` runtime dependency detected. Educational content in `Learn` and `FieldGuide` is authored as plain JS data objects (`frontend/src/lib/learnContent.js`, `learnGlossary.js`, `learnTopics.js`).

## Dev Ports & Proxy

| Service | Port | Notes |
|---|---|---|
| Vite dev server | 3000 | `npm run dev` in `frontend/` |
| FastAPI backend | 8000 | `uvicorn app.main:app --reload` |
| API proxy | `/api` on 3000 → `http://localhost:8000` | `frontend/vite.config.js:8-10` |

## Testing / Lint Tooling

No test framework, no ESLint, no Prettier detected in `package.json` devDependencies. The project has no automated frontend test suite (mirrors the backend — see `CLAUDE.md`).
