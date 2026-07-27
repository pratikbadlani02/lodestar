# Runtime Flows

> Project: lodestar
> Type: react-app
> Skill: react-frontend-analysis

## Page Lifecycle

**Authenticated user navigating to a private page (e.g. `/workspace`):**

1. User loads app or clicks a nav link.
2. React Router evaluates the route; the `Private` wrapper renders `RequireAuth`.
3. `RequireAuth` reads `sessionStorage.quant_token` — token present, so it renders children.
4. `Layout` has already booted (it checks auth on every navigation and calls `initStoreWS()` — idempotent via `bootstrapped` flag).
5. `initStoreWS()` fires six parallel REST fetches (`loadControl`, `loadHealth`, `loadAccount`, `loadPositions`, `loadOrders`, `loadAlerts`) and opens the WebSocket.
6. The page chunk (`Workspace.jsx`) is lazy-loaded; `<Suspense>` shows `RouteFallback` (skeleton rows) until the chunk and its initial data are ready.
7. The page component mounts and calls `useStore(selectXxx)` for the slices it needs. Zustand notifies only the subscribers of those specific selectors.
8. The WebSocket starts delivering server events; each event type calls the relevant `loadXxx()` loader, which re-fetches from REST and updates the store. The page re-renders with fresh data.
9. A 30 s `setInterval` backstop re-fetches all slices even if no WS event arrives (`store.js:161-170`).

**Anonymous user navigating to a public page (e.g. `/stocks`):**

1. No token in sessionStorage — `initStoreWS()` is **not** called.
2. Layout renders with `authed = false`; auth-only sidebar items show a lock icon; `WatchRail` and `OrderSlideOver` are hidden.
3. The page mounts and fetches directly from REST (no Zustand store involvement for public market data).

## Happy-Path Sequence: Authenticated Session

```mermaid
sequenceDiagram
    participant Browser
    participant main.jsx
    participant Layout
    participant Store as Zustand Store
    participant API as FastAPI /api
    participant WS as WebSocket /api/ws

    Browser->>main.jsx: load app (quant_token in sessionStorage)
    main.jsx->>Store: initStoreWS()
    Store->>API: GET /control/state, /health, /account, /positions, /orders, /alerts (parallel)
    API-->>Store: responses → update slices
    Store->>WS: connectWebSocket()
    WS-->>Store: ws open

    Browser->>Layout: navigate to /workspace
    Layout->>Store: useStore(selectXxx) — subscribe to slices
    Store-->>Layout: current state
    Layout-->>Browser: render page with data

    WS-->>Store: { type: "order_update" }
    Store->>API: GET /orders, /positions, /account (re-fetch)
    API-->>Store: updated data
    Store-->>Layout: notify subscribers
    Layout-->>Browser: re-render with fresh data
```

## Error / Recovery Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant Page as Page Component
    participant EB as ErrorBoundary
    participant API as FastAPI /api
    participant WS as WebSocket /api/ws

    Browser->>Page: render page chunk
    Page->>API: fetch data (REST)
    API-->>Page: HTTP 401 (session expired, token was set)
    Page->>Browser: api.js clears token, hard-redirects to /login?from=/workspace

    Browser->>Page: (new session) render page
    Page->>Page: throw render error (JS exception)
    Page->>EB: componentDidCatch(err, info)
    EB->>Browser: render "Something broke" card (retry + home buttons)
    Browser->>EB: user clicks Retry
    EB->>EB: setState({ err: null }) → re-render children
    EB->>Page: page re-mounts

    WS-->>WS: connection closed
    WS->>WS: setTimeout 5s → connectWebSocket() (auto-reconnect)
    WS-->>Store: ws open → _setWs(true)
```

## Main End-to-End Data Flow

```mermaid
flowchart TD
    Browser["Browser"]

    subgraph frontend["Frontend (React SPA)"]
        Ctx["Context Providers\n(Theme/Density/Market/Symbol)"]
        Store["Zustand Store\n(global trading state)"]
        API_JS["lib/api.js\n(fetch wrapper)"]
        WS_JS["lib/api.js:connectWebSocket\n(WS client)"]
        Pages["Page Components\n(40+ lazy chunks)"]
    end

    subgraph backend["Backend (FastAPI)"]
        REST["REST /api/*"]
        WSEndpoint["/api/ws"]
        DB["PostgreSQL"]
        Redis["Redis\n(pub/sub + cache)"]
        Alpaca["Alpaca API"]
    end

    Browser -- navigate --> Pages
    Pages -- useStore(selector) --> Store
    Pages -- direct REST calls --> API_JS
    Store -- loadXxx() --> API_JS
    API_JS -- fetch /api/* --> REST
    REST -- query/write --> DB
    REST -- publish events --> Redis
    Redis -- push events --> WSEndpoint
    WSEndpoint -- JSON message --> WS_JS
    WS_JS -- _onWsMessage(msg) --> Store
    Store -- setState → notify selectors --> Pages
    REST -- market/trading calls --> Alpaca
    Alpaca -- quote/order data --> REST
    Ctx -- setMarket() dispatches market:change --> Store
```

## Mutation Flow

All mutations (place order, create strategy, run backtest, etc.) are fire-and-wait: the page calls `api.submitOrder()` (or equivalent), waits for the REST response, then the WS delivers a `order_update` / `backtest_completed` event that invalidates the relevant store slice. There is **no optimistic update** pattern — the UI does not update before server confirmation.

The one exception is toast notifications on `backtest_completed`: the WS message includes `return_pct` and `trades`, which are shown immediately in a success toast (`store.js:124-128`) alongside the store re-fetch.
