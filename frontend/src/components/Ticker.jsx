// Auto-scrolling ticker strip — shows watchlist quotes cycling left-to-right.
// Pauses on hover. Clicking a quote activates that symbol globally.

import { useEffect, useState } from 'react'
import { useSymbol } from '../lib/SymbolContext'
import { api } from '../lib/api'
import { fmt, fmtSignedPct } from './ui/format'
import { useSymbolContextMenu } from './ui/ContextMenu'

const FALLBACK = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ']

function loadSymbols() {
  try {
    const s = JSON.parse(localStorage.getItem('quant_railwatch_v1') || 'null')
    if (Array.isArray(s) && s.length) return s
  } catch {}
  return FALLBACK
}

export default function Ticker() {
  const { setSymbol } = useSymbol()
  const [symbols] = useState(loadSymbols)
  const [quotes, setQuotes] = useState({})
  const ctx = useSymbolContextMenu()

  useEffect(() => {
    let cancelled = false
    let timer
    async function poll() {
      if (!symbols.length) return
      try {
        const r = await api.getSnapshots(symbols.join(','))
        if (cancelled) return
        setQuotes(r?.snapshots || {})
      } catch {}
    }
    poll(); timer = setInterval(poll, 10000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [symbols])

  const items = symbols.map((s) => {
    const q = quotes[s]
    const last = q?.latestTrade?.p ?? q?.minuteBar?.c ?? q?.dailyBar?.c
    const prev = q?.prevDailyBar?.c
    const pct = last && prev ? ((last - prev) / prev) * 100 : null
    return { symbol: s, last, pct }
  })

  if (items.length === 0) return null

  // Duplicate the list to make the loop seamless
  const loop = [...items, ...items]

  return (
    <div className="relative h-7 bg-surf-2/60 border-b border-white/[0.06] overflow-hidden group">
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surf-0 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surf-0 to-transparent z-10 pointer-events-none" />
      <div className="flex items-center gap-6 px-4 whitespace-nowrap ticker-track group-hover:[animation-play-state:paused]"
        style={{
          animation: 'ticker-scroll 60s linear infinite',
          width: 'max-content',
        }}>
        {loop.map((it, i) => {
          if (it.last == null) return null
          const up = (it.pct ?? 0) >= 0
          return (
            <button
              key={`${it.symbol}-${i}`}
              onClick={() => setSymbol(it.symbol)}
              onContextMenu={(e) => ctx.onContextMenu(e, it.symbol)}
              className="inline-flex items-baseline gap-2 text-xs font-mono tabular hover:bg-white/[0.05] px-1.5 py-0.5 rounded transition"
            >
              <span className="font-semibold text-ink-1">{it.symbol}</span>
              <span className="text-ink-2">{fmt(it.last)}</span>
              <span className={up ? 'text-up' : 'text-down'}>
                {it.pct != null ? fmtSignedPct(it.pct, 2) : ''}
              </span>
            </button>
          )
        })}
      </div>
      {/* keyframes injected inline so the component is self-contained */}
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
      {ctx.menu}
    </div>
  )
}
