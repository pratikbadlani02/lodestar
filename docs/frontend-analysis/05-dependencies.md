# Dependencies

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## Runtime Dependencies

| Package | Version | Role | Notes |
|---|---|---|---|
| `react` | ^18.3.0 | UI framework | Concurrent mode; used with `React.lazy` + `Suspense` throughout |
| `react-dom` | ^18.3.0 | DOM renderer | `createRoot` API in `main.jsx` |
| `react-router-dom` | ^6.26.0 | Client-side routing | `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `NavLink`, `useNavigate`, `useLocation`, `useSearchParams` |
| `zustand` | ^5.0.13 | Global state management | Single store; no middleware (no immer, no devtools, no persist) |
| `recharts` | ^2.12.0 | Declarative charts (most pages) | `LineChart`, `BarChart`, `AreaChart`, `ComposedChart`, etc. |
| `lightweight-charts` | ^5.2.0 | TradingView-style candlestick/time-series charts | Used in `ChartWidget.jsx` for OHLCV |
| `lucide-react` | ^0.400.0 | SVG icon library | Used in every component |
| `sonner` | ^2.0.7 | Toast notifications | Wrapped in `lib/toast.js`; `Toaster` mounted in `Layout.jsx` |

## Dev Dependencies

| Package | Version | Role | Notes |
|---|---|---|---|
| `vite` | ^5.3.0 | Build tool + HMR dev server | Manual chunk splitting configured |
| `@vitejs/plugin-react` | ^4.3.0 | Babel-based React JSX transform | Required for Fast Refresh |
| `tailwindcss` | ^3.4.19 | Utility-first CSS | Theme driven by CSS variables in `index.css`; `data-theme` / `data-density` attrs on `<html>` |
| `postcss` | ^8.5.15 | CSS processing pipeline | Required by Tailwind |
| `autoprefixer` | ^10.5.0 | Vendor prefix injection | PostCSS plugin |

## Router / HTTP / State Wiring

- **Router:** React Router `BrowserRouter` wraps the tree in `main.jsx:16`; `Routes` + `Route` defined in `App.jsx`. `NavLink` in `Layout.jsx` for sidebar; `useNavigate` for programmatic navigation.
- **HTTP:** Native `fetch` via `lib/api.js:request()`. No interceptor library. Auth token injected per-call from `sessionStorage`. 401 handling is inline in `request()`.
- **State:** Zustand `create()` in `lib/store.js`. Pages subscribe via `useStore(selector)` — fine-grained selectors in `store.js:187-201` keep re-renders minimal.
- **WebSocket:** `lib/api.js:connectWebSocket()` opens `ws(s)://<host>/api/ws`, auto-reconnects after 5 s on close, sends a keepalive `ping` every 30 s.

## Module Federation

N/A — no Module Federation. No `@module-federation/*`, `@originjs/vite-plugin-federation`, or `ModuleFederationPlugin` in `package.json` or `vite.config.js`.

## Markdown / Mermaid Rendering

N/A — no content Markdown pipeline. No `react-markdown`, `remark-*`, `rehype-*`, or `mermaid` in `package.json`. (The app is a trading dashboard; it renders data tables and charts, not authored content.)

## Dev Ports / Proxy

| Concern | Value | Source |
|---|---|---|
| Frontend dev server | `http://localhost:3000` | `frontend/vite.config.js:8` |
| API proxy (dev) | `/api` → `http://localhost:8000` | `frontend/vite.config.js:9` |
| Backend (FastAPI) | `http://localhost:8000` | `.env`, `render.yaml` |

## Testing / Lint Tooling

No testing framework detected (`package.json` has no Vitest, Jest, Testing Library, Cypress, or Playwright). No ESLint config file observed in `frontend/` (no `.eslintrc.*`, `eslint.config.*`). No Prettier config. Code quality tooling is absent — ⚠️ UNVERIFIED that no tooling exists in parent workspace.
