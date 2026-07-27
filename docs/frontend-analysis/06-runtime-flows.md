# 06 — Runtime Flows

## Page lifecycle

| Phase | Behavior | Source |
|---|---|---|
| Route match | `<Suspense>` shows `RouteFallback` skeleton while lazy chunk loads | [App.jsx](../../frontend/src/App.jsx#L59-L84) |
| Mount | Page reads context (`useSymbol`/`useMarket`) and/or store selectors | various |
| Data | Live pages subscribe to store; market pages fire `api.*` in `useEffect` → local state | [store.js](../../frontend/src/lib/store.js), `src/pages/*` |
| Error | Render exceptions bubble to `ErrorBoundary` around `<Outlet/>` | [Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362) |

Mutations are **non-optimistic** — UI reflects state only after server confirmation / WS reload ([store.js](../../frontend/src/lib/store.js#L133-L142)).

## Happy-path sequence — login → workspace

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

## Error/recovery sequence — 401 & render crash

```mermaid
sequenceDiagram
  participant UI as Page
  participant API as api.request()
  participant BE as FastAPI
  participant EB as ErrorBoundary
  UI->>API: api.getPositions()
  API->>BE: GET /positions (expired token)
  BE-->>API: 401
  alt token present
    API->>API: setToken(null) → location=/login?from=
  else anonymous
    API-->>UI: throw err(status=401)
  end
  Note over UI,EB: separately, a render exception…
  UI->>EB: throws during render
  EB-->>UI: fallback card + Retry / Workspace
```

Sources: [api.js](../../frontend/src/lib/api.js#L28-L40), [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx).

## Main data flow — live trading state

```mermaid
flowchart TD
  subgraph Ingress
    Boot["initStoreWS() initial load + 30s poll"]
    WSmsg["WebSocket messages"]
    MktEv["market:change event"]
  end
  Boot --> Loaders
  WSmsg --> Router["_onWsMessage(type→reload)"] --> Loaders
  MktEv --> Loaders["store loaders (coalesced)"]
  Loaders -->|fetch /api/*| BE[FastAPI]
  BE --> SET["set({...slice})"] --> Store[(Zustand store)]
  Store -->|selectors| Pages["Workspace / Orders / Positions / Alerts / Strategies / Backtests"]
```

WS messages invalidate/reload; REST stays canonical ([store.js](../../frontend/src/lib/store.js#L107-L147)).

## Routing / transform — request construction

```mermaid
flowchart LR
  Caller["api.screenStocks(params, market)"] --> Build["URLSearchParams: drop ''/undefined"]
  Build --> Mkt["mkt(market): arg ?? localStorage ?? 'us'"]
  Mkt --> Path["GET /market/screener?...&market="]
  Path --> Req["request('GET', path)"]
  Req --> Hdr["inject Bearer if present"] --> Fetch["fetch('/api'+path)"]
```

Source: [api.js](../../frontend/src/lib/api.js#L9-L13).
