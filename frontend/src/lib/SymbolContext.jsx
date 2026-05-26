// Global active-symbol context + recents tracker.
//
// Pages that operate on a single ticker (Stocks, Analysis, Options, Fundamentals,
// Tape, Dividends, Insiders, Compare, Workspace) read `symbol` and call
// `setSymbol()` to push the change globally. Recents persist in localStorage so
// switching tabs preserves the user's working set.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const RECENTS_KEY = 'quant_symbol_recents_v1'
const ACTIVE_KEY = 'quant_active_symbol_v1'
const MAX_RECENTS = 12

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') } catch { return [] }
}
function persistRecents(arr) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(arr)) } catch {}
}

const SymbolContext = createContext({
  symbol: 'AAPL',
  setSymbol: () => {},
  recents: [],
  removeRecent: () => {},
})

export function SymbolProvider({ children }) {
  const [symbol, setSymbolState] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || 'AAPL' } catch { return 'AAPL' }
  })
  const [recents, setRecents] = useState(loadRecents)

  const setSymbol = useCallback((next) => {
    if (!next) return
    const s = String(next).toUpperCase().trim()
    if (!s) return
    setSymbolState(s)
    try { localStorage.setItem(ACTIVE_KEY, s) } catch {}
    setRecents((prev) => {
      const filtered = prev.filter((x) => x !== s)
      const updated = [s, ...filtered].slice(0, MAX_RECENTS)
      persistRecents(updated)
      return updated
    })
  }, [])

  const removeRecent = useCallback((s) => {
    setRecents((prev) => {
      const next = prev.filter((x) => x !== s)
      persistRecents(next)
      return next
    })
  }, [])

  // Cross-tab sync via the storage event
  useEffect(() => {
    function handler(e) {
      if (e.key === ACTIVE_KEY && e.newValue) setSymbolState(e.newValue)
      if (e.key === RECENTS_KEY && e.newValue) {
        try { setRecents(JSON.parse(e.newValue)) } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <SymbolContext.Provider value={{ symbol, setSymbol, recents, removeRecent }}>
      {children}
    </SymbolContext.Provider>
  )
}

export function useSymbol() {
  return useContext(SymbolContext)
}

/**
 * Helper for pages that take a :symbol route param. If the URL has an explicit
 * symbol, it wins on mount and updates the context. Otherwise the page uses
 * whatever symbol is currently active in context.
 */
export function useSymbolPage(routeSym) {
  const { symbol, setSymbol } = useSymbol()
  useEffect(() => {
    if (routeSym) {
      const s = String(routeSym).toUpperCase().trim()
      if (s && s !== symbol) setSymbol(s)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSym])
  return [symbol, setSymbol]
}
