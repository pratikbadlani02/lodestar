# 06 — Interactions

## Page lifecycle

| Phase | Behavior | Source |
|---|---|---|
| Route match | `<Suspense>` shows `RouteFallback` skeleton while lazy chunk loads | [App.jsx](../../frontend/src/App.jsx#L59-L84) |
| Mount | Page reads context (`useSymbol`/`useMarket`) and/or store selectors | various |
| Data | Live pages subscribe to store; market pages fire `api.*` in `useEffect` → local state | [store.js](../../frontend/src/lib/store.js), `src/pages/*` |
| Error | Render exceptions bubble to `ErrorBoundary` around `<Outlet/>` | [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362) |

## Happy path — login → workspace

```mermaid
sequenceDiagram
  participant U as User
  participant L as Login.jsx
  participant API as api.js
  participant BE as FastAPI
  participant ST as Zustand store
  participant WS as WebSocket
  U->>L: submit credentials
  L->>API: api.login(u,p)
  API->>BE: POST /auth/login
  BE-->>API: { access_token }
  API->>API: setToken() → sessionStorage
  L->>U: navigate(from || /workspace)
  Note over ST: Layout effect authed=true → initStoreWS()
  ST->>BE: parallel load control/health/account/positions/orders/alerts
  BE-->>ST: payloads → set(...)
  ST->>WS: connectWebSocket()
  WS-->>ST: open → wsConnected=true
  ST-->>U: Workspace renders live state
```

## Real-time update — order fill

```mermaid
sequenceDiagram
  participant BE as FastAPI
  participant WS as WebSocket
  participant ST as store._onWsMessage
  participant UI as subscribed pages
  BE-->>WS: { type:'order_update' }
  WS->>ST: onMessage(msg)
  ST->>ST: set({ wsLastMessage })
  ST->>BE: loadOrders + loadPositions + loadAccount
  BE-->>ST: fresh payloads → set(...)
  ST-->>UI: selectors re-render
```

WS messages invalidate/reload; REST stays canonical ([store.js](../../frontend/src/lib/store.js#L107-L147)).

## Error / recovery — session expiry (401)

```mermaid
sequenceDiagram
  participant UI as Page
  participant API as api.request()
  participant BE as FastAPI
  participant W as window.location
  UI->>API: api.getPositions()
  API->>BE: GET /positions (expired token)
  BE-->>API: 401
  alt token present
    API->>API: setToken(null)
    API->>W: location = /login?from=<current>
  else anonymous
    API-->>UI: throw err(status=401)
  end
```

Source: [api.js](../../frontend/src/lib/api.js#L28-L40).

## Error / recovery — render crash

```mermaid
sequenceDiagram
  participant P as Lazy page
  participant EB as ErrorBoundary
  participant U as User
  P->>EB: throws during render
  EB->>EB: getDerivedStateFromError + componentDidCatch (console.error)
  EB-->>U: fallback "Something broke on this page"
  U->>EB: Retry → reset()
  U->>EB: Workspace → location='/'
```

Only the routed page crashes; chrome stays alive ([ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx), [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362)).

## Other interactions

| Interaction | Flow | Source |
|---|---|---|
| Navigation hotkeys | `g m/s/c/h/a/p/o/t`, `/` focus search, `shift+?` help | [Layout.jsx](../../frontend/src/components/Layout.jsx#L137-L149) |
| Market switch | `setMarket` → persist + currency + `market:change` → store re-pulls account/positions | [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L45-L54) |
| Mobile drawer | auto-closes on route change; body scroll locked when open | [Layout.jsx](../../frontend/src/components/Layout.jsx#L103-L113) |
