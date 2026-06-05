// Global app store — single source of truth for live trading state.
//
// Pages subscribe to the slices they need; the WebSocket pushes updates here
// so we don't need per-page polling loops. The store also exposes loaders
// that hit the REST API once on mount and on WS-triggered invalidation.
//
// Design notes:
// - State is broken into namespaced slices to make selectors cheap.
// - Each loader is idempotent; concurrent calls coalesce via in-flight maps.
// - WS messages map to invalidations, not direct state writes, so the REST
//   call remains the canonical source (server is authoritative).

import { create } from 'zustand'
import { api, connectWebSocket } from './api'
import { toast } from './toast'

// Active market for account/positions scoping (mirrors MarketContext storage).
function currentMarket() {
  try { return localStorage.getItem('quant_market_v1') || 'us' } catch { return 'us' }
}

const inflight = new Map()
function coalesce(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export const useStore = create((set, get) => ({
  // ── Control / health ─────────────────────────────────────
  control: null,
  health: null,
  loadControl: () => coalesce('control', async () => {
    try { set({ control: await api.getControl() }) } catch {}
  }),
  loadHealth: () => coalesce('health', async () => {
    try { set({ health: await api.health() }) } catch {}
  }),

  // ── Account & positions ──────────────────────────────────
  account: null,
  positions: [],
  loadAccount: () => {
    const mkt = currentMarket()
    return coalesce(`account:${mkt}`, async () => {
      try { set({ account: await api.getAccount(mkt) }) } catch {}
    })
  },
  loadPositions: () => {
    const mkt = currentMarket()
    return coalesce(`positions:${mkt}`, async () => {
      try { set({ positions: await api.getPositions(mkt) }) } catch {}
    })
  },

  // ── Orders ───────────────────────────────────────────────
  // `*Loaded` flags flip true after the first fetch resolves (success OR
  // failure) so pages can distinguish "still loading" from "loaded, empty"
  // and avoid showing skeletons forever on a quiet/empty account.
  orders: [],
  ordersLoaded: false,
  loadOrders: (limit = 100) => coalesce('orders', async () => {
    try { set({ orders: await api.listOrders(limit) }) } catch {} finally { set({ ordersLoaded: true }) }
  }),

  // ── Alerts ───────────────────────────────────────────────
  alerts: [],
  alertsLoaded: false,
  unackCount: 0,
  loadAlerts: () => coalesce('alerts', async () => {
    try {
      const all = await api.listAlerts({ limit: 100 })
      set({ alerts: all, unackCount: all.filter((a) => !a.acknowledged).length })
    } catch {} finally { set({ alertsLoaded: true }) }
  }),

  // ── Strategies ───────────────────────────────────────────
  strategies: [],
  strategiesLoaded: false,
  loadStrategies: () => coalesce('strategies', async () => {
    try { set({ strategies: await api.listStrategies() }) } catch {} finally { set({ strategiesLoaded: true }) }
  }),

  // ── Backtests ────────────────────────────────────────────
  backtests: [],
  backtestsLoaded: false,
  loadBacktests: () => coalesce('backtests', async () => {
    try { set({ backtests: await api.listBacktests() }) } catch {} finally { set({ backtestsLoaded: true }) }
  }),

  // ── WS connection state ──────────────────────────────────
  wsConnected: false,
  wsLastMessage: null,

  // Internal: WS event router (called by initStoreWS)
  _onWsMessage: (msg) => {
    set({ wsLastMessage: msg })
    switch (msg.type) {
      case 'order_update':
        get().loadOrders()
        get().loadPositions()
        get().loadAccount()
        break
      case 'position_closed':
        get().loadPositions()
        get().loadAccount()
        break
      case 'alert':
      case 'price_alert_triggered':
        get().loadAlerts()
        break
      case 'control_update':
        get().loadControl()
        break
      case 'strategy_update':
      case 'strategy_signal':
        get().loadStrategies()
        break
      case 'backtest_completed':
        get().loadBacktests()
        if (msg.return_pct != null) {
          const ret = Number(msg.return_pct).toFixed(2)
          toast.success('Backtest completed', {
            description: `${ret}% return · ${msg.trades ?? 0} trades`,
          })
        }
        break
      case 'trade':
        // Live tape — handled by Workspace ticker / Tape page directly via WS
        break
      default:
        break
    }
  },
  _setWs: (connected) => set({ wsConnected: connected }),
}))

// ── Bootstrap — call once at app start ──────────────────────
// Wires the WebSocket to the store, kicks off initial loads, and sets up
// a long-interval safety refresh in case the WS misses an event.
let bootstrapped = false
export function initStoreWS() {
  if (bootstrapped) return
  bootstrapped = true

  const s = useStore.getState()
  // Initial fetches in parallel
  Promise.allSettled([
    s.loadControl(),
    s.loadHealth(),
    s.loadAccount(),
    s.loadPositions(),
    s.loadOrders(),
    s.loadAlerts(),
  ])

  // Long-interval safety refresh (30s) — WS handles the fast path, this is
  // just a backstop in case a message gets dropped while the tab was hidden.
  setInterval(() => {
    const st = useStore.getState()
    st.loadControl()
    st.loadHealth()
    st.loadAccount()
    st.loadPositions()
    st.loadOrders()
    st.loadAlerts()
  }, 30000)

  // Re-pull the account + positions when the user switches market.
  window.addEventListener('market:change', () => {
    const st = useStore.getState()
    st.loadAccount()
    st.loadPositions()
  })

  // WS connection — store router gets every message
  const ws = connectWebSocket((msg) => useStore.getState()._onWsMessage(msg))
  useStore.getState()._setWs(true)
  ws.addEventListener('close', () => useStore.getState()._setWs(false))
  ws.addEventListener('open',  () => useStore.getState()._setWs(true))
}

// ── Selectors — let pages subscribe to only what they need ─
export const selectControl    = (s) => s.control
export const selectHealth     = (s) => s.health
export const selectAccount    = (s) => s.account
export const selectPositions  = (s) => s.positions
export const selectOrders     = (s) => s.orders
export const selectOrdersLoaded     = (s) => s.ordersLoaded
export const selectAlerts     = (s) => s.alerts
export const selectAlertsLoaded     = (s) => s.alertsLoaded
export const selectUnackCount = (s) => s.unackCount
export const selectStrategies = (s) => s.strategies
export const selectStrategiesLoaded = (s) => s.strategiesLoaded
export const selectBacktests  = (s) => s.backtests
export const selectBacktestsLoaded  = (s) => s.backtestsLoaded
export const selectWsState    = (s) => ({ connected: s.wsConnected, last: s.wsLastMessage })
