# 07 — Data Flow

## 1. Main data flow — live trading state

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

Properties: coalesced loaders ([store.js](../../frontend/src/lib/store.js#L22-L30)); WS invalidates only ([store.js](../../frontend/src/lib/store.js#L107-L147)); 30s safety poll backstop ([store.js](../../frontend/src/lib/store.js#L173-L182)).

## 2. Error / recovery flow

```mermaid
flowchart TD
  Req["api.request()"] --> S{HTTP status}
  S -->|204| Null[return null]
  S -->|2xx| Json[return res.json]
  S -->|401 + token| Redir[clear token → /login?from=]
  S -->|401 anon| T401[throw status=401]
  S -->|other !ok| Norm[parse detail → throw Error]
  T401 --> PC[page try/catch surfaces message]
  Norm --> PC
  RenderErr[render exception] --> EB[ErrorBoundary fallback]
  EB -->|Retry| Reset[reset re-render]
  EB -->|Workspace| Home[location='/']
```

Source: [api.js](../../frontend/src/lib/api.js#L28-L46), [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx).

## 3. Routing / transformation — request construction

```mermaid
flowchart LR
  Caller["api.screenStocks(params, market)"] --> Build["URLSearchParams: drop ''/undefined"]
  Build --> Mkt["mkt(market): arg ?? localStorage ?? 'us'"]
  Mkt --> Path["GET /market/screener?...&market="]
  Path --> Req["request('GET', path)"]
  Req --> Hdr["inject Bearer if present"]
  Hdr --> Fetch["fetch('/api'+path)"]
```

`mkt()` lets US-scoped endpoints inherit active market ([api.js](../../frontend/src/lib/api.js#L9-L13)).

## Page-type flows

| Flow | Sequence | Source |
|---|---|---|
| Live-trading page | mount → store selector subscribe → (WS/poll invalidates → reload) → re-render | [store.js](../../frontend/src/lib/store.js) |
| Market-data page | route `:symbol` → `useSymbolPage` → `useEffect` → `api.getX` → local `useState` → render | [SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L82-L96) |
| Mutation | form local state → `api.createX/updateX` → 2xx reload (store/local) / 4xx toast/Alert; long work finalizes via WS | [store.js](../../frontend/src/lib/store.js#L130-L142) |

## Mutation flow (non-optimistic)

```mermaid
flowchart LR
  Form["page form (local state)"] --> Submit["api.createX(d) / updateX(id,d)"]
  Submit -->|POST/PATCH| BE[FastAPI]
  BE -->|2xx| Reload["store loadX() / local refetch"]
  BE -->|4xx/5xx| Err["catch → toast / inline Alert"]
  BE -. async .-> WS["WS: order_update / backtest_completed"]
  WS --> StoreReload["store invalidates → re-render"]
```

Optimistic updates: none — UI reflects state only after server confirmation ([store.js](../../frontend/src/lib/store.js#L133-L142)).
