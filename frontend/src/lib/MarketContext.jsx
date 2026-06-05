// Global market selector (US ⇄ India).
//
// A lightweight UX scope: it decides which symbol universe the search shows,
// which currency the dashboard formats in, and which account the trading
// surfaces query. The backend derives the *actual* market from each symbol's
// suffix (Indian tickers carry .NS/.BO), so this is purely a front-of-house
// preference, persisted in localStorage.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const MARKET_KEY = 'quant_market_v1'

// Mirrors app/core/markets.py so the UI works without a network round-trip.
export const MARKETS = {
  us: {
    code: 'us', label: 'United States', short: 'US', flag: '🇺🇸',
    currency: 'USD', symbol: '$', suffix: '', defaultSymbol: 'AAPL',
  },
  in: {
    code: 'in', label: 'India · NSE', short: 'IN', flag: '🇮🇳',
    currency: 'INR', symbol: '₹', suffix: '.NS', defaultSymbol: 'RELIANCE.NS',
  },
}

function loadMarket() {
  try {
    const v = localStorage.getItem(MARKET_KEY)
    return v && MARKETS[v] ? v : 'us'
  } catch { return 'us' }
}

const MarketContext = createContext({
  market: 'us',
  meta: MARKETS.us,
  setMarket: () => {},
})

export function MarketProvider({ children }) {
  const [market, setMarketState] = useState(loadMarket)

  const setMarket = useCallback((code) => {
    if (!MARKETS[code]) return
    setMarketState(code)
    try { localStorage.setItem(MARKET_KEY, code) } catch {}
    // Let the store re-pull the market-scoped account/positions.
    try { window.dispatchEvent(new CustomEvent('market:change', { detail: code })) } catch {}
  }, [])

  // Cross-tab sync
  useEffect(() => {
    function handler(e) {
      if (e.key === MARKET_KEY && e.newValue && MARKETS[e.newValue]) {
        setMarketState(e.newValue)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const value = useMemo(
    () => ({ market, meta: MARKETS[market], setMarket }),
    [market, setMarket],
  )
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarket() {
  return useContext(MarketContext)
}

// Derive a symbol's market from its suffix (matches the backend).
export function marketOf(symbol) {
  const s = String(symbol || '').toUpperCase()
  return s.endsWith('.NS') || s.endsWith('.BO') ? 'in' : 'us'
}

export function currencySymbolOf(symbol) {
  return MARKETS[marketOf(symbol)].symbol
}
