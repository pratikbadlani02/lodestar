// Persistent watchlist rail — sits between the nav sidebar and main content.
// Slim column showing each tracked symbol with last price, % change, and a
// 30-day sparkline. Clicking a row sets the active symbol globally.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import { fmt, fmtSignedPct } from './ui/format'
import { Sparkline } from './ui/primitives'
import { useSymbolContextMenu } from './ui/ContextMenu'

const DEFAULT_LIST = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ']
const STORAGE_KEY = 'quant_railwatch_v1'
const COLLAPSE_KEY = 'quant_rail_collapsed_v1'

function loadSymbols() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (Array.isArray(s) && s.length) return s
  } catch {}
  return DEFAULT_LIST
}
function persistSymbols(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) } catch {}
}

export default function WatchRail() {
  const { symbol, setSymbol } = useSymbol()
  const [symbols, setSymbols] = useState(loadSymbols)
  const ctx = useSymbolContextMenu({ onRemove: (s) => removeSymbol(s) })
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const [quotes, setQuotes] = useState({})
  const [sparks, setSparks] = useState({})
  const [adding, setAdding] = useState(false)
  const [newSym, setNewSym] = useState('')

  function toggleCollapsed() {
    const v = !collapsed
    setCollapsed(v)
    try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch {}
  }

  // Poll quote snapshots
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

  // Fetch sparkline bars once when the symbol set changes
  useEffect(() => {
    let cancelled = false
    async function loadSparks() {
      const updates = {}
      await Promise.all(symbols.map(async (s) => {
        if (sparks[s]) return
        try {
          const r = await api.getOhlcv(s, 30, '1d')
          if (cancelled) return
          updates[s] = (r?.bars || []).map((b) => Number(b.c)).filter((x) => Number.isFinite(x))
        } catch {}
      }))
      if (cancelled || !Object.keys(updates).length) return
      setSparks((prev) => ({ ...prev, ...updates }))
    }
    loadSparks()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')])

  function quoteFor(sym) {
    const s = quotes[sym]
    if (!s) return null
    const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
    const prev = s.prevDailyBar?.c
    return {
      last,
      change: last && prev ? last - prev : null,
      changePct: last && prev ? ((last - prev) / prev) * 100 : null,
    }
  }

  function addSymbol() {
    const s = newSym.trim().toUpperCase()
    setAdding(false); setNewSym('')
    if (!s || symbols.includes(s)) return
    const next = [...symbols, s]
    setSymbols(next); persistSymbols(next)
  }
  function removeSymbol(s) {
    const next = symbols.filter((x) => x !== s)
    setSymbols(next); persistSymbols(next)
  }

  if (collapsed) {
    return (
      <aside className="w-7 bg-surf-1 border-r border-white/[0.06] flex flex-col items-center py-3 shrink-0">
        <button
          onClick={toggleCollapsed}
          title="Expand watchlist"
          className="w-5 h-5 rounded-md hover:bg-accent/15 text-ink-4 hover:text-accent flex items-center justify-center transition"
        >
          <ChevronRight size={12} />
        </button>
        <div className="mt-3 vertical-text text-2xs uppercase tracking-[0.2em] text-ink-5"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          Watchlist
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-52 bg-surf-1 border-r border-white/[0.06] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-2xs uppercase tracking-[0.16em] font-semibold text-ink-3">Watchlist</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setAdding(true)}
            title="Add symbol"
            className="w-6 h-6 rounded hover:bg-accent/15 text-ink-4 hover:text-accent flex items-center justify-center transition"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={toggleCollapsed}
            title="Collapse"
            className="w-6 h-6 rounded hover:bg-white/[0.05] text-ink-4 hover:text-ink-1 flex items-center justify-center transition"
          >
            <ChevronLeft size={12} />
          </button>
        </div>
      </div>

      {adding && (
        <div className="p-2 border-b border-white/[0.06] flex gap-1">
          <input
            autoFocus
            value={newSym}
            onChange={(e) => setNewSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSymbol()
              if (e.key === 'Escape') { setAdding(false); setNewSym('') }
            }}
            placeholder="TICKER"
            className="flex-1 bg-accent/[0.06] border border-accent/40 rounded-md px-2 py-1 text-xs font-mono uppercase outline-none"
          />
          <button onClick={addSymbol}
            className="bg-accent text-[#fff] text-xs font-medium rounded-md px-2">Add</button>
        </div>
      )}

      {/* Rows */}
      <div className="flex-1 overflow-y-auto py-1">
        {symbols.map((s) => {
          const q = quoteFor(s)
          const up = (q?.changePct ?? 0) >= 0
          const active = s === symbol
          const spark = sparks[s]
          return (
            <div
              key={s}
              onClick={() => setSymbol(s)}
              onContextMenu={(e) => ctx.onContextMenu(e, s)}
              className={`group relative cursor-pointer transition-colors border-l-2 px-2.5 py-2 ${
                active
                  ? 'border-l-accent bg-accent/[0.08]'
                  : 'border-l-transparent hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono font-semibold text-xs ${active ? 'text-accent' : 'text-ink-1'}`}>
                  {s}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSymbol(s) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-5 hover:text-down transition"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono tabular text-2xs text-ink-2">
                  {q?.last != null ? fmt(q.last) : '—'}
                </span>
                <span className={`font-mono tabular text-2xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
                  {q?.changePct != null ? fmtSignedPct(q.changePct, 2) : '—'}
                </span>
              </div>
              {spark && spark.length > 1 && (
                <div className="mt-1 -mx-0.5">
                  <Sparkline values={spark} width={170} height={20} />
                </div>
              )}
            </div>
          )
        })}
        {symbols.length === 0 && (
          <div className="text-2xs text-ink-4 px-3 py-6 text-center">Empty. Click + to add.</div>
        )}
      </div>
      {ctx.menu}
    </aside>
  )
}
