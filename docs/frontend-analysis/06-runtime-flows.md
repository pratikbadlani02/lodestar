# 06 — Runtime Flows

## Page Lifecycle

Most pages follow this pattern on mount:

1. On first render, call one or more `useStore.getState().loadX()` actions (for store-backed data) or local `useEffect` fetches (for page-specific REST calls).
2. The loader is idempotent — concurrent calls coalesce via an in-flight map; if the data is already fetching, the new call joins the existing promise. `frontend/src/lib/store.js:23-30`
3. The page renders a skeleton (`<SkeletonRows>`) while data loads, then the populated view.
4. For public research pages (Analysis, Fundamentals, Options, etc.) the active symbol comes from `SymbolContext` — when the user changes the symbol, the page re-fetches.
5. Private pages (Workspace, Trade, Strategies) subscribe to Zustand slices. WS events invalidate the relevant slice, triggering a REST refetch and a re-render.

Mutations (order submit, strategy create, backtest trigger) are fire-and-forget REST calls: the page `await`s the response, shows a toast on success or error, and then either relies on the next WS event to refresh state or calls the loader directly.

## Diagrams

### Happy-Path Sequence: Submit an Order

```mermaid
sequenceDiagram
    participant User
    participant OrderSlideOver
    participant api.js
    participant FastAPI
    participant Zustand

    User->>OrderSlideOver: Fill symbol/qty/side, click Submit
    OrderSlideOver->>api.js: api.submitOrder(orderPayload)
    api.js->>FastAPI: POST /api/orders
    FastAPI-->>api.js: 200 { order }
    api.js-->>OrderSlideOver: resolves with order
    OrderSlideOver->>OrderSlideOver: toast.success("Order submitted")
    FastAPI-->>Zustand: WS push: order_update
    Zustand->>api.js: loadOrders() + loadPositions() + loadAccount()
    api.js->>FastAPI: GET /api/orders, /api/positions, /api/account
    FastAPI-->>api.js: updated data
    api.js-->>Zustand: set({ orders, positions, account })
    Zustand-->>OrderSlideOver: subscribed components re-render
```

### Error / Recovery Sequence: Risk-Rejected Order

```mermaid
sequenceDiagram
    participant User
    participant OrderSlideOver
    participant api.js
    participant FastAPI

    User->>OrderSlideOver: Submit order (exceeds position size limit)
    OrderSlideOver->>api.js: api.submitOrder(orderPayload)
    api.js->>FastAPI: POST /api/orders
    FastAPI-->>api.js: 422 { detail: { reason: "Position size exceeds 5% limit" } }
    api.js->>api.js: extract detail.reason, throw Error
    api.js-->>OrderSlideOver: throws
    OrderSlideOver->>OrderSlideOver: toast.error("Position size exceeds 5% limit")
    Note over OrderSlideOver: Form stays open; user can adjust and retry
```

### Main End-to-End Data Flow

```mermaid
graph TD
    subgraph Browser
        Context["React Contexts\n(theme, market, density, symbol)"]
        Store["Zustand Store\n(control, orders, positions,\nalerts, strategies, backtests)"]
        Pages["Page Components\n(27 lazy routes)"]
        WS["WebSocket client\n/api/ws"]
    end

    subgraph Backend
        API["FastAPI /api/*"]
        Scheduler["APScheduler\n(strategy ticks, alerts)"]
        Broker["Alpaca Broker"]
        DB["PostgreSQL"]
        Redis["Redis\n(WS pub/sub)"]
    end

    Pages -->|"useStore(selector)"| Store
    Pages -->|"useContext"| Context
    Store -->|"api.getX()"| API
    Pages -->|"api.getX() direct"| API
    WS -->|"JSON messages"| Store
    API -->|"pub/sub push"| Redis
    Redis -->|"broadcast"| WS
    Scheduler -->|"order events"| Redis
    API --> DB
    API --> Broker
```

### Routing & Symbol Resolution Flow

```mermaid
flowchart LR
    User["User navigates to /analysis/AAPL"]
    Router["React Router\nextract :symbol = AAPL"]
    SymbolPage["useSymbolPage('AAPL')\n(SymbolContext.jsx)"]
    Context["SymbolContext\nsetSymbol('AAPL')\nupdate recents"]
    Page["Analysis page\nfetch OHLCV + indicators\nfor AAPL"]

    User --> Router --> SymbolPage --> Context --> Page
```

## Mutation Flow

All mutations are **non-optimistic**. The UI waits for the server response before updating state. State updates arrive via WS events (fast path) or the 30 s safety-refresh interval (fallback). There is no local-first write or rollback logic.

Exception: `api.exportOrdersCsv()` and `api.exportBacktestCsv()` use `window.open()` directly rather than `fetch`, bypassing the request wrapper entirely. `frontend/src/lib/api.js:105-106`
