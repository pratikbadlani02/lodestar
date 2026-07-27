# 06 — Interactions

This document traces the main runtime interaction sequences. Minimum two diagrams: a happy path and an error/recovery path.

## Page lifecycle (general)

1. Router matches a path → `<Suspense>` shows `RouteFallback` skeleton while the lazy chunk downloads.
2. Page mounts → reads context (`useSymbol`, `useMarket`) and/or store selectors.
3. Page either subscribes to the Zustand store (live-trading pages) or fires `api.*` in a `useEffect` (market-data pages) and holds results in local state.
4. Errors in render bubble to the route-level `ErrorBoundary` wrapping `<Outlet/>`.

## Happy path — login → workspace load

```mermaid
sequenceDiagram
  participant U as User
  participant L as Login.jsx
  participant API as api.js (fetch)
  participant BE as FastAPI /api
  participant ST as Zustand store
  participant WS as WebSocket /api/ws

  U->>L: submit username/password
  L->>API: api.login(u, p)
  API->>BE: POST /auth/login (form-encoded)
  BE-->>API: { access_token }
  API->>API: setToken() → sessionStorage.quant_token
  L->>L: validate `from` is same-origin
  L->>U: navigate(from || /workspace)
  Note over ST: Layout effect sees authed=true → initStoreWS()
  ST->>API: parallel loadControl/health/account/positions/orders/alerts
  API->>BE: GET /control/state, /account, /positions, /orders, /alerts ...
  BE-->>ST: payloads → set(...)
  ST->>WS: connectWebSocket()
  WS-->>ST: open → wsConnected=true
  ST-->>U: Workspace renders live state
```

## Real-time update — order fill pushed over WS

```mermaid
sequenceDiagram
  participant BE as FastAPI
  participant WS as WebSocket
  participant ST as store._onWsMessage
  participant API as api.js
  participant UI as subscribed pages

  BE-->>WS: { type: 'order_update' }
  WS->>ST: onMessage(msg)
  ST->>ST: set({ wsLastMessage: msg })
  ST->>API: loadOrders() + loadPositions() + loadAccount()
  API->>BE: GET /orders, /positions, /account
  BE-->>ST: fresh payloads → set(...)
  ST-->>UI: selectors re-render (Orders, Positions, Workspace)
```

WS messages trigger **invalidation/reload**, never direct writes — the REST response stays canonical ([store.js](../../frontend/src/lib/store.js#L107-L147)).

## Error / recovery — session expiry mid-use

```mermaid
sequenceDiagram
  participant UI as Page
  participant API as api.js request()
  participant BE as FastAPI
  participant W as window.location

  UI->>API: api.getPositions()
  API->>BE: GET /positions (Bearer expired)
  BE-->>API: 401
  alt token was present
    API->>API: setToken(null)
    API->>W: location.href = /login?from=<current>
  else anonymous caller
    API-->>UI: throw err(status=401) — page surfaces it
  end
```

See [api.js](../../frontend/src/lib/api.js#L28-L40).

## Error / recovery — page render crash

```mermaid
sequenceDiagram
  participant Page as Lazy page
  participant EB as ErrorBoundary
  participant U as User

  Page->>EB: throws during render
  EB->>EB: getDerivedStateFromError + componentDidCatch (console.error)
  EB-->>U: fallback card "Something broke on this page"
  U->>EB: click Retry → reset() re-renders children
  U->>EB: click Workspace → window.location = '/'
```

Only the route content crashes; the sidebar/topbar/ticker chrome stays alive because `ErrorBoundary` wraps just the `<Outlet/>` ([Layout.jsx](../../frontend/src/components/Layout.jsx#L360-L362), [ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx)).

## Navigation & hotkeys

`Layout` installs global hotkeys (`installHotkeys()`) and registers `g m`, `g s`, `g c`, `g h`, `g a`, `g p`, `g o`, `g t` navigation shortcuts plus `/` to focus search and `shift+?` to open shortcut help. See [Layout.jsx](../../frontend/src/components/Layout.jsx#L137-L149). The mobile drawer auto-closes on route change ([Layout.jsx](../../frontend/src/components/Layout.jsx#L103-L104)).

## Market switch interaction

Selecting a market in `MarketContext.setMarket` persists the choice, updates the currency formatter, and dispatches `market:change`; the store listener re-pulls account + positions ([MarketContext.jsx](../../frontend/src/lib/MarketContext.jsx#L45-L54), [store.js](../../frontend/src/lib/store.js#L186-L191)).
