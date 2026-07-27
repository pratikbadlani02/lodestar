# 07 — Data Flow

Minimum three diagrams: main end-to-end flow, error/recovery flow, and a routing/transformation detail.

## 1. Main data flow — live trading state

Two ingress paths feed one store; pages are pure subscribers.

```mermaid
flowchart TD
  subgraph Ingress
    Boot["initStoreWS() initial load + 30s safety poll"]
    WSmsg["WebSocket /api/ws messages"]
    MktEv["market:change window event"]
  end
  Boot --> Loaders
  WSmsg --> Router["_onWsMessage(type → reload)"]
  Router --> Loaders
  MktEv --> Loaders["store loaders (coalesced)"]
  Loaders -->|fetch /api/*| BE[FastAPI]
  BE --> SET["set({...slice})"]
  SET --> Store[(Zustand store)]
  Store -->|selectors| Pages["Workspace / Orders / Positions / Alerts / Strategies / Backtests"]
```

Key properties:
- **Coalescing:** concurrent loader calls share one in-flight promise ([store.js](../../frontend/src/lib/store.js#L22-L30)).
- **Authoritative server:** WS only invalidates; the REST reload writes state ([store.js](../../frontend/src/lib/store.js#L107-L147)).
- **Backstop poll:** a 30s interval re-pulls everything in case a WS event was missed while the tab was hidden ([store.js](../../frontend/src/lib/store.js#L173-L182)).

## 2. Market-data page flow (non-cached reads)

```mermaid
flowchart LR
  Route["/analysis/:symbol"] --> Hook["useSymbolPage(routeSym)"]
  Hook -->|push to context| SymCtx[SymbolContext]
  Hook --> Effect["useEffect on symbol"]
  Effect --> Call["api.getAnalysis(symbol)"]
  Call -->|GET /api/market/analysis/:symbol| BE[FastAPI]
  BE --> Local["component useState"]
  Local --> Render[Charts / tables / cards]
```

Unlike live-trading slices, research/market pages keep results in **local component state**, not the global store. Active symbol and market scope come from context ([SymbolContext.jsx](../../frontend/src/lib/SymbolContext.jsx#L82-L96), [MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx)).

## 3. Error / recovery flow

```mermaid
flowchart TD
  Req["api.request()"] --> Status{HTTP status}
  Status -->|204| Null["return null"]
  Status -->|2xx| Json["return res.json()"]
  Status -->|401 + had token| Redir["clear token → /login?from="]
  Status -->|401 anonymous| Throw401["throw err(status=401)"]
  Status -->|other !ok| Norm["parse detail → throw Error(status, detail)"]
  Throw401 --> PageCatch["page try/catch surfaces message"]
  Norm --> PageCatch
  RenderErr["render-time exception"] --> EB[ErrorBoundary fallback]
  EB -->|Retry| Reset["reset() re-render"]
  EB -->|Workspace| Home["location = /"]
```

See [api.js](../../frontend/src/lib/api.js#L28-L46) and [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx).

## 4. Routing / transformation detail — request construction

```mermaid
flowchart LR
  Caller["api.screenStocks(params, market)"] --> Build["URLSearchParams: drop ''/undefined"]
  Build --> Mkt["mkt(market): arg ?? localStorage 'quant_market_v1' ?? 'us'"]
  Mkt --> Path["GET /market/screener?...&market="]
  Path --> Req["request('GET', path)"]
  Req --> Hdr["inject Bearer token if present"]
  Hdr --> Fetch["fetch('/api'+path)"]
```

The `mkt()` helper ([api.js](../../frontend/src/lib/api.js#L9-L13)) lets US-scoped endpoints inherit the active market without every caller threading it explicitly.

## Create/update (mutation) flow

```mermaid
flowchart LR
  Form["page form (local state)"] --> Submit["api.createX(d) / updateX(id,d)"]
  Submit -->|POST/PATCH /api/...| BE[FastAPI]
  BE -->|2xx| Reload["store loadX() or local refetch"]
  BE -->|4xx/5xx| Err["catch → toast / inline Alert"]
  BE -. async result .-> WS["WS: order_update / backtest_completed"]
  WS --> StoreReload["store invalidates → re-render"]
```

Mutations are **not optimistic** — the UI reflects state after the server confirms, and long-running work (backtests, orders) finalizes via WS-driven store reloads ([store.js](../../frontend/src/lib/store.js#L133-L142)).
