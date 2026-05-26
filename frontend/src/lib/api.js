// API client v2 — adds analytics, optimizer, alerts, websocket
const BASE = '/api'

function getToken() { return sessionStorage.getItem('quant_token') }
export function setToken(t) { t ? sessionStorage.setItem('quant_token', t) : sessionStorage.removeItem('quant_token') }

async function request(method, path, body) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let payload
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  if (res.status === 401) {
    // Only force the user to /login if they had a token (i.e. their session
    // expired mid-use). Anonymous callers hitting a private endpoint should
    // just receive the 401 — pages can decide how to surface it.
    if (token) {
      setToken(null)
      const here = window.location.pathname + window.location.search
      window.location.href = `/login?from=${encodeURIComponent(here)}`
    }
    const err = new Error('unauthorized'); err.status = 401; throw err
  }
  if (!res.ok) {
    let detail; try { detail = await res.json() } catch { detail = await res.text() }
    const err = new Error(typeof detail === 'string' ? detail : (detail?.detail?.reason || detail?.detail || `HTTP ${res.status}`))
    err.status = res.status; err.detail = detail; throw err
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  login: async (u, p) => {
    const f = new URLSearchParams(); f.set('username', u); f.set('password', p)
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f })
    if (!r.ok) throw new Error('Login failed')
    const d = await r.json(); setToken(d.access_token); return d
  },
  logout: () => setToken(null),

  health: () => request('GET', '/health'),
  getControl: () => request('GET', '/control/state'),
  kill: (reason) => request('POST', '/control/kill', { reason }),
  resume: () => request('POST', '/control/resume'),
  pauseStrategies: () => request('POST', '/control/strategies/pause'),
  resumeStrategies: () => request('POST', '/control/strategies/resume'),
  liquidate: (reason) => request('POST', '/control/liquidate', { reason }),

  getAccount: () => request('GET', '/account'),
  getPositions: () => request('GET', '/positions'),

  listStrategyTypes: () => request('GET', '/strategies/available'),
  listStrategies: () => request('GET', '/strategies'),
  createStrategy: (d) => request('POST', '/strategies', d),
  updateStrategy: (id, d) => request('PATCH', `/strategies/${id}`, d),
  deleteStrategy: (id) => request('DELETE', `/strategies/${id}`),

  listOrders: (limit = 50) => request('GET', `/orders?limit=${limit}`),
  submitOrder: (d) => request('POST', '/orders', d),
  syncOrder: (id) => request('POST', `/orders/${id}/sync`),

  listBacktests: () => request('GET', '/backtests'),
  createBacktest: (d) => request('POST', '/backtests', d),
  getBacktest: (id) => request('GET', `/backtests/${id}`),
  getBacktestTrades: (id) => request('GET', `/backtests/${id}/trades`),
  deleteBacktest: (id) => request('DELETE', `/backtests/${id}`),

  getOhlcv: (symbol, days = 365, timeframe = '1d') => request('GET', `/market/ohlcv/${symbol}?days=${days}&timeframe=${timeframe}`),
  fetchMarket: (symbol, days = 365, timeframe = '1Day') => request('POST', `/market/fetch/${symbol}?lookback_days=${days}&timeframe=${timeframe}`),

  getAudit: (limit = 100) => request('GET', `/audit?limit=${limit}`),

  // ── v2 ────────────────────────────────────────────────────
  getEquityCurve: (days = 30) => request('GET', `/analytics/equity-curve?days=${days}`),
  getPortfolioRisk: (days = 90) => request('GET', `/analytics/portfolio-risk?lookback_days=${days}`),
  getStrategyPnl: (days = 30) => request('GET', `/analytics/strategy-pnl?days=${days}`),

  listAlerts: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request('GET', `/alerts${q ? `?${q}` : ''}`)
  },
  ackAlert: (id) => request('POST', `/alerts/${id}/ack`),

  listOptimizerRuns: () => request('GET', '/optimizer'),
  createOptimizerRun: (d) => request('POST', '/optimizer', d),
  getOptimizerRun: (id) => request('GET', `/optimizer/${id}`),

  exportOrdersCsv: () => window.open(`${BASE}/export/orders.csv`, '_blank'),
  exportBacktestCsv: (id) => window.open(`${BASE}/export/backtest/${id}/trades.csv`, '_blank'),

  // ── v3 Webull features ────────────────────────────────────────
  listWatchlists: () => request('GET', '/watchlists'),
  createWatchlist: (d) => request('POST', '/watchlists', d),
  updateWatchlist: (id, d) => request('PATCH', `/watchlists/${id}`, d),
  deleteWatchlist: (id) => request('DELETE', `/watchlists/${id}`),
  getWatchlistQuotes: (id) => request('GET', `/watchlists/${id}/quotes`),

  getNews: (symbols, limit = 20) => {
    const p = new URLSearchParams({ limit })
    if (symbols) p.set('symbols', symbols)
    return request('GET', `/market/news?${p}`)
  },
  getSnapshots: (symbols) => request('GET', `/market/snapshots?symbols=${symbols}`),
  screenStocks: (params = {}) => {
    const p = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== '' && v !== undefined && p.set(k, v))
    return request('GET', `/market/screener?${p}`)
  },

  listPriceAlerts: () => request('GET', '/price-alerts'),
  createPriceAlert: (d) => request('POST', '/price-alerts', d),
  deletePriceAlert: (id) => request('DELETE', `/price-alerts/${id}`),

  // ── Fundamentals / options / earnings (yfinance-backed) ──────
  getProfile: (symbol) => request('GET', `/market/profile/${symbol}`),
  getFundamentals: (symbol, period = 'annual') => request('GET', `/market/fundamentals/${symbol}?period=${period}`),
  getOptionExpirations: (symbol) => request('GET', `/market/options/${symbol}/expirations`),
  getOptionChain: (symbol, expiry) => request('GET', `/market/options/${symbol}${expiry ? `?expiry=${expiry}` : ''}`),
  getEarnings: (symbol) => request('GET', `/market/earnings/${symbol}`),
  getEarningsCalendar: (symbols) => request('GET', `/market/earnings/calendar?symbols=${symbols}`),
  getAnalysts: (symbol) => request('GET', `/market/analysts/${symbol}`),
  getHolders: (symbol) => request('GET', `/market/holders/${symbol}`),
  getDividends: (symbol) => request('GET', `/market/dividends/${symbol}`),
  getSplits: (symbol) => request('GET', `/market/splits/${symbol}`),
  getSustainability: (symbol) => request('GET', `/market/sustainability/${symbol}`),
  getRecommendationTrend: (symbol) => request('GET', `/market/recommendation-trend/${symbol}`),

  // ── Tape / quotes / movers / crypto / sentiment ──────────────
  getTrades: (symbol, limit = 200) => request('GET', `/market/trades/${symbol}?limit=${limit}`),
  getQuotes: (symbol, limit = 200) => request('GET', `/market/quotes/${symbol}?limit=${limit}`),
  getMovers: (top = 25) => request('GET', `/market/movers?top=${top}`),
  getMostActives: (top = 25, by = 'volume') => request('GET', `/market/most-actives?top=${top}&by=${by}`),
  getCryptoSnapshots: (symbols) => request('GET', `/market/crypto/snapshots?symbols=${encodeURIComponent(symbols)}`),
  getCryptoBars: (symbol, days = 180, timeframe = '1Day') =>
    request('GET', `/market/crypto/bars/${encodeURIComponent(symbol)}?days=${days}&timeframe=${timeframe}`),
  getNewsSentiment: (symbol, limit = 30) => request('GET', `/market/news-sentiment/${symbol}?limit=${limit}`),

  // ── Holistic analysis ────────────────────────────────────────
  getAnalysis: (symbol, includeNews = true) =>
    request('GET', `/market/analysis/${symbol}?include_news=${includeNews}`),
  getEarningsSurprise: (symbol) => request('GET', `/market/earnings-surprise/${symbol}`),
  getShortInterest: (symbol) => request('GET', `/market/short-interest/${symbol}`),

  // ── Users (admin) ─────────────────────────────────────────────
  listUsers: () => request('GET', '/users'),
  createUser: (d) => request('POST', '/users', d),
  deleteUser: (id) => request('DELETE', `/users/${id}`),
  updateUserRole: (id, role) => request('PATCH', `/users/${id}/role?role=${role}`),
  getMe: () => request('GET', '/auth/me'),
}

// ── WebSocket helper ─────────────────────────────────────────────────
export function connectWebSocket(onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${window.location.host}/api/ws`
  const ws = new WebSocket(url)
  ws.onopen = () => console.log('WS connected')
  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)) } catch {}
  }
  ws.onclose = () => {
    console.log('WS closed; reconnecting in 5s')
    setTimeout(() => connectWebSocket(onMessage), 5000)
  }
  // Keepalive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send('ping')
  }, 30000)
  ws.addEventListener('close', () => clearInterval(pingInterval))
  return ws
}
