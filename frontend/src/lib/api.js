// API client — public market-data viewer.
// No auth, no token storage, no trading endpoints.
const BASE = '/api'

async function request(method, path) {
  const res = await fetch(`${BASE}${path}`, { method, headers: {} })
  if (!res.ok) {
    let detail; try { detail = await res.json() } catch { detail = await res.text() }
    const err = new Error(
      typeof detail === 'string' ? detail : (detail?.detail || `HTTP ${res.status}`)
    )
    err.status = res.status; err.detail = detail; throw err
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  health: () => request('GET', '/health'),

  // ── OHLCV / bars ─────────────────────────────────────────────
  getOhlcv: (symbol, days = 365, timeframe = '1d') =>
    request('GET', `/market/ohlcv/${symbol}?days=${days}&timeframe=${timeframe}`),

  // ── News / snapshots / screener ──────────────────────────────
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

  // ── Fundamentals / options / earnings (yfinance-backed) ──────
  getProfile: (symbol) => request('GET', `/market/profile/${symbol}`),
  getFundamentals: (symbol, period = 'annual') =>
    request('GET', `/market/fundamentals/${symbol}?period=${period}`),
  getOptionExpirations: (symbol) => request('GET', `/market/options/${symbol}/expirations`),
  getOptionChain: (symbol, expiry) =>
    request('GET', `/market/options/${symbol}${expiry ? `?expiry=${expiry}` : ''}`),
  getEarnings: (symbol) => request('GET', `/market/earnings/${symbol}`),
  getEarningsCalendar: (symbols) =>
    request('GET', `/market/earnings/calendar?symbols=${symbols}`),
  getAnalysts: (symbol) => request('GET', `/market/analysts/${symbol}`),
  getHolders: (symbol) => request('GET', `/market/holders/${symbol}`),
  getDividends: (symbol) => request('GET', `/market/dividends/${symbol}`),
  getSplits: (symbol) => request('GET', `/market/splits/${symbol}`),
  getSustainability: (symbol) => request('GET', `/market/sustainability/${symbol}`),
  getRecommendationTrend: (symbol) =>
    request('GET', `/market/recommendation-trend/${symbol}`),

  // ── Tape / quotes / movers / crypto / sentiment ──────────────
  getTrades: (symbol, limit = 200) =>
    request('GET', `/market/trades/${symbol}?limit=${limit}`),
  getQuotes: (symbol, limit = 200) =>
    request('GET', `/market/quotes/${symbol}?limit=${limit}`),
  getMovers: (top = 25) => request('GET', `/market/movers?top=${top}`),
  getMostActives: (top = 25, by = 'volume') =>
    request('GET', `/market/most-actives?top=${top}&by=${by}`),
  getCryptoSnapshots: (symbols) =>
    request('GET', `/market/crypto/snapshots?symbols=${encodeURIComponent(symbols)}`),
  getCryptoBars: (symbol, days = 180, timeframe = '1Day') =>
    request('GET', `/market/crypto/bars/${encodeURIComponent(symbol)}?days=${days}&timeframe=${timeframe}`),
  getNewsSentiment: (symbol, limit = 30) =>
    request('GET', `/market/news-sentiment/${symbol}?limit=${limit}`),

  // ── Holistic analysis ────────────────────────────────────────
  getAnalysis: (symbol, includeNews = true) =>
    request('GET', `/market/analysis/${symbol}?include_news=${includeNews}`),
  getEarningsSurprise: (symbol) => request('GET', `/market/earnings-surprise/${symbol}`),
  getShortInterest: (symbol) => request('GET', `/market/short-interest/${symbol}`),
}
